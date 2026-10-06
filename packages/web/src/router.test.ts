import { test } from 'node:test';
import assert from 'node:assert/strict';
import { href, parseRoute } from './router.ts';

test('해시를 라우트로 해석한다', () => {
  assert.deepEqual(parseRoute(''), { name: 'home' });
  assert.deepEqual(parseRoute('#/'), { name: 'home' });
  assert.deepEqual(parseRoute(href.post(12)), { name: 'post', id: 12 });
  assert.deepEqual(parseRoute(href.new), { name: 'new' });
  assert.deepEqual(parseRoute(href.login), { name: 'login' });
  assert.deepEqual(parseRoute(href.signup), { name: 'signup' });
  assert.deepEqual(parseRoute('#/posts/abc'), { name: 'home' });
});
