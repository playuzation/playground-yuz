// Store 구현체가 공통으로 통과해야 하는 계약 테스트.
// 사용: storeContract('MemoryStore', () => new MemoryStore())
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Store } from './store.ts';

const T0 = '2026-01-01T00:00:00.000Z';

export function storeContract(name: string, makeStore: () => Store): void {
  describe(`Store 계약: ${name}`, () => {
    const setup = () => {
      const store = makeStore();
      const alice = store.createUser({ username: 'alice', passwordHash: 'h1', createdAt: T0 })!;
      const bob = store.createUser({ username: 'bob', passwordHash: 'h2', createdAt: T0 })!;
      return { store, alice, bob };
    };

    test('사용자를 만들고 같은 아이디는 거부한다', () => {
      const { store, alice } = setup();
      assert.deepEqual(alice, { id: alice.id, username: 'alice' });
      assert.equal(store.createUser({ username: 'alice', passwordHash: 'x', createdAt: T0 }), undefined);
      assert.deepEqual(store.findCredentials('alice'), { user: alice, passwordHash: 'h1' });
      assert.equal(store.findCredentials('nobody'), undefined);
    });

    test('세션은 만료 전까지만 조회되고 삭제할 수 있다', () => {
      const { store, alice } = setup();
      store.createSession({ token: 't1', userId: alice.id, expiresAt: '2026-01-02T00:00:00.000Z' });
      assert.deepEqual(store.findSessionUser('t1', T0), alice);
      assert.equal(store.findSessionUser('t1', '2026-01-03T00:00:00.000Z'), undefined);
      assert.equal(store.findSessionUser('wrong', T0), undefined);
      store.deleteSession('t1');
      assert.equal(store.findSessionUser('t1', T0), undefined);
    });

    test('포스트는 최신순으로 나열되고 본문은 상세에만 있다', () => {
      const { store, alice } = setup();
      const first = store.createPost({ authorId: alice.id, title: '첫 글', body: '# 본문', createdAt: T0 });
      const second = store.createPost({ authorId: alice.id, title: '둘째 글', body: '본문2', createdAt: T0 });
      assert.deepEqual(
        store.listPosts(null).map((p) => p.id),
        [second.id, first.id],
      );
      assert.equal('body' in store.listPosts(null)[0]!, false);
      const detail = store.getPost(first.id, null)!;
      assert.equal(detail.body, '# 본문');
      assert.deepEqual(detail.author, alice);
      assert.equal(store.getPost(9999, null), undefined);
    });

    test('좋아요는 사용자당 하나이며 취소할 수 있다', () => {
      const { store, alice, bob } = setup();
      const post = store.createPost({ authorId: alice.id, title: '글', body: '본문', createdAt: T0 });
      store.setLike({ postId: post.id, userId: bob.id, liked: true });
      store.setLike({ postId: post.id, userId: bob.id, liked: true });
      assert.equal(store.getPost(post.id, bob.id)!.likeCount, 1);
      assert.equal(store.getPost(post.id, bob.id)!.likedByMe, true);
      assert.equal(store.getPost(post.id, alice.id)!.likedByMe, false);
      store.setLike({ postId: post.id, userId: alice.id, liked: true });
      assert.equal(store.listPosts(null)[0]!.likeCount, 2);
      store.setLike({ postId: post.id, userId: bob.id, liked: false });
      store.setLike({ postId: post.id, userId: bob.id, liked: false });
      assert.equal(store.getPost(post.id, bob.id)!.likeCount, 1);
      assert.equal(store.getPost(post.id, bob.id)!.likedByMe, false);
    });

    test('댓글은 작성순으로 조회되고 개수가 집계된다', () => {
      const { store, alice, bob } = setup();
      const post = store.createPost({ authorId: alice.id, title: '글', body: '본문', createdAt: T0 });
      const c1 = store.createComment({ postId: post.id, authorId: bob.id, body: '첫 댓글', createdAt: T0 });
      store.createComment({ postId: post.id, authorId: alice.id, body: '둘째 댓글', createdAt: T0 });
      assert.deepEqual(c1, { id: c1.id, postId: post.id, author: bob, body: '첫 댓글', createdAt: T0 });
      assert.deepEqual(
        store.listComments(post.id).map((c) => [c.author.username, c.body]),
        [
          ['bob', '첫 댓글'],
          ['alice', '둘째 댓글'],
        ],
      );
      assert.equal(store.listPosts(null)[0]!.commentCount, 2);
    });
  });
}
