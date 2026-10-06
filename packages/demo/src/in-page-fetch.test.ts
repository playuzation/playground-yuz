import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '@playground/api';
import { MemoryStore } from '@playground/core';
import { createInPageFetch } from './in-page-fetch.ts';

test('페이지 안 fetch로 실제 API 흐름이 동작하고 요청마다 저장 훅이 불린다', async () => {
  let saves = 0;
  const store = new MemoryStore();
  const fetch = createInPageFetch(createApp({ store }), () => saves++);

  const signup = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'password123' }),
  });
  assert.equal(signup.status, 201);
  const { token } = await signup.json();

  const me = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual(await me.json(), { user: { id: 1, username: 'alice' } });
  assert.equal(saves, 2);
  assert.equal(store.state.users.length, 1);
});
