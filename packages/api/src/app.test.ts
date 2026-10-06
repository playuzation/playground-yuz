import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '@playground/core';
import { createApp } from './app.ts';

function setup(clock = { now: new Date('2026-01-01T00:00:00.000Z') }) {
  const app = createApp({ store: new MemoryStore(), now: () => clock.now });
  const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const res = await app.request(path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const signup = async (username: string) => {
    const res = await call('POST', '/api/auth/signup', { body: { username, password: 'password123' } });
    assert.equal(res.status, 201);
    return res.json.token as string;
  };
  return { call, signup, clock };
}

test('health 체크', async () => {
  const { call } = setup();
  assert.deepEqual(await call('GET', '/api/health'), { status: 200, json: { ok: true } });
});

test('가입, 중복 가입, 잘못된 입력', async () => {
  const { call } = setup();
  const res = await call('POST', '/api/auth/signup', { body: { username: 'Alice', password: 'password123' } });
  assert.equal(res.status, 201);
  assert.deepEqual(res.json.user, { id: 1, username: 'alice' });
  assert.match(res.json.token, /^[0-9a-f]{64}$/);

  const dup = await call('POST', '/api/auth/signup', { body: { username: 'alice', password: 'password123' } });
  assert.equal(dup.status, 409);
  const bad = await call('POST', '/api/auth/signup', { body: { username: 'a', password: 'x' } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /아이디/);
});

test('로그인, 내 정보, 로그아웃', async () => {
  const { call, signup } = setup();
  await signup('alice');
  const wrong = await call('POST', '/api/auth/login', { body: { username: 'alice', password: 'wrong-password' } });
  assert.equal(wrong.status, 401);

  const ok = await call('POST', '/api/auth/login', { body: { username: 'alice', password: 'password123' } });
  assert.equal(ok.status, 200);
  const token = ok.json.token as string;
  assert.deepEqual((await call('GET', '/api/me', { token })).json, { user: { id: 1, username: 'alice' } });
  assert.deepEqual((await call('GET', '/api/me')).json, { user: null });

  assert.equal((await call('POST', '/api/auth/logout', { token })).status, 204);
  assert.deepEqual((await call('GET', '/api/me', { token })).json, { user: null });
});

test('세션은 30일 뒤 만료된다', async () => {
  const { call, signup, clock } = setup();
  const token = await signup('alice');
  clock.now = new Date('2026-01-30T00:00:00.000Z');
  assert.notEqual((await call('GET', '/api/me', { token })).json.user, null);
  clock.now = new Date('2026-02-01T00:00:00.000Z');
  assert.equal((await call('GET', '/api/me', { token })).json.user, null);
});

test('포스트 작성은 로그인이 필요하고 입력을 검사한다', async () => {
  const { call, signup } = setup();
  assert.equal((await call('POST', '/api/posts', { body: { title: 't', body: 'b' } })).status, 401);
  const token = await signup('alice');
  assert.equal((await call('POST', '/api/posts', { token, body: { title: '', body: 'b' } })).status, 400);

  const res = await call('POST', '/api/posts', { token, body: { title: '첫 글', body: '# 안녕\n\n**굵게**' } });
  assert.equal(res.status, 201);
  assert.equal(res.json.post.title, '첫 글');
  assert.equal(res.json.post.body, '# 안녕\n\n**굵게**');
  assert.equal(res.json.post.author.username, 'alice');
});

test('목록과 상세, 없는 포스트는 404', async () => {
  const { call, signup } = setup();
  const token = await signup('alice');
  await call('POST', '/api/posts', { token, body: { title: '하나', body: '본문1' } });
  await call('POST', '/api/posts', { token, body: { title: '둘', body: '본문2' } });

  const list = await call('GET', '/api/posts');
  assert.deepEqual(
    list.json.posts.map((p: { title: string }) => p.title),
    ['둘', '하나'],
  );
  const detail = await call('GET', '/api/posts/1');
  assert.equal(detail.json.post.body, '본문1');
  assert.deepEqual(detail.json.comments, []);
  assert.equal((await call('GET', '/api/posts/999')).status, 404);
  assert.equal((await call('GET', '/api/posts/abc')).status, 404);
  assert.equal((await call('GET', '/api/unknown')).status, 404);
});

test('좋아요는 멱등적으로 켜고 끈다', async () => {
  const { call, signup } = setup();
  const alice = await signup('alice');
  const bob = await signup('bob');
  await call('POST', '/api/posts', { token: alice, body: { title: '글', body: '본문' } });

  assert.equal((await call('PUT', '/api/posts/1/like')).status, 401);
  assert.deepEqual((await call('PUT', '/api/posts/1/like', { token: bob })).json, { likeCount: 1, likedByMe: true });
  assert.deepEqual((await call('PUT', '/api/posts/1/like', { token: bob })).json, { likeCount: 1, likedByMe: true });
  assert.deepEqual((await call('PUT', '/api/posts/1/like', { token: alice })).json, { likeCount: 2, likedByMe: true });
  assert.equal((await call('GET', '/api/posts/1', { token: bob })).json.post.likedByMe, true);
  assert.deepEqual((await call('DELETE', '/api/posts/1/like', { token: bob })).json, { likeCount: 1, likedByMe: false });
  assert.equal((await call('PUT', '/api/posts/999/like', { token: bob })).status, 404);
});

test('댓글 작성과 조회', async () => {
  const { call, signup } = setup();
  const alice = await signup('alice');
  const bob = await signup('bob');
  await call('POST', '/api/posts', { token: alice, body: { title: '글', body: '본문' } });

  assert.equal((await call('POST', '/api/posts/1/comments', { body: { body: '안녕' } })).status, 401);
  assert.equal((await call('POST', '/api/posts/1/comments', { token: bob, body: { body: '  ' } })).status, 400);
  assert.equal((await call('POST', '/api/posts/999/comments', { token: bob, body: { body: '안녕' } })).status, 404);

  const res = await call('POST', '/api/posts/1/comments', { token: bob, body: { body: ' 반가워요 ' } });
  assert.equal(res.status, 201);
  assert.equal(res.json.comment.body, '반가워요');
  assert.equal(res.json.comment.author.username, 'bob');

  const detail = await call('GET', '/api/posts/1');
  assert.deepEqual(
    detail.json.comments.map((c: { body: string }) => c.body),
    ['반가워요'],
  );
  assert.equal((await call('GET', '/api/posts')).json.posts[0].commentCount, 1);
});

test('JSON이 아닌 본문은 400', async () => {
  const app = createApp({ store: new MemoryStore() });
  const res = await app.request('/api/auth/signup', { method: 'POST', body: 'not json' });
  assert.equal(res.status, 400);
});
