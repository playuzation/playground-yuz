import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, type MemoryState } from './memory-store.ts';
import { storeContract } from './store-contract.ts';

storeContract('MemoryStore', () => new MemoryStore());

test('MemoryStore 상태는 JSON으로 저장했다가 복원할 수 있다', () => {
  const store = new MemoryStore();
  const user = store.createUser({ username: 'alice', passwordHash: 'h', createdAt: 'now' })!;
  store.createPost({ authorId: user.id, title: '글', body: '본문', createdAt: 'now' });
  const restored = new MemoryStore(JSON.parse(JSON.stringify(store.state)) as MemoryState);
  assert.deepEqual(restored.listPosts(null), store.listPosts(null));
  assert.equal(restored.createUser({ username: 'bob', passwordHash: 'h', createdAt: 'now' })!.id, 2);
});
