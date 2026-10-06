import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createClient, type TokenStore } from './client.ts';

const memoryTokens = (): TokenStore & { value: string | null } => ({
  value: null,
  get() {
    return this.value;
  },
  set(token) {
    this.value = token;
  },
});

test('로그인하면 토큰을 저장하고 이후 요청에 Bearer 헤더로 보낸다', async () => {
  const seen: { path: string; init?: RequestInit }[] = [];
  const tokens = memoryTokens();
  const client = createClient(async (path, init) => {
    seen.push({ path, init });
    if (path === '/api/auth/login') return Response.json({ user: { id: 1, username: 'alice' }, token: 'tok' });
    return Response.json({ posts: [] });
  }, tokens);

  assert.deepEqual(await client.login('alice', 'password123'), { id: 1, username: 'alice' });
  assert.equal(tokens.value, 'tok');
  await client.listPosts();
  assert.equal((seen[1]!.init!.headers as Record<string, string>).authorization, 'Bearer tok');
});

test('오류 응답은 서버 메시지를 담은 ApiError가 된다', async () => {
  const client = createClient(async () => Response.json({ error: '로그인이 필요합니다.' }, { status: 401 }), memoryTokens());
  await assert.rejects(client.createPost('t', 'b'), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 401);
    assert.equal(e.message, '로그인이 필요합니다.');
    return true;
  });
});

test('만료된 토큰은 me() 호출 시 지운다', async () => {
  const tokens = memoryTokens();
  tokens.value = 'stale';
  const client = createClient(async () => Response.json({ user: null }), tokens);
  assert.equal(await client.me(), null);
  assert.equal(tokens.value, null);
});
