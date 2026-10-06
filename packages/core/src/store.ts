import type { Comment, Post, PostSummary, User } from './types.ts';

// 저장소 계약. 구현체: MemoryStore(core, 테스트·데모용), SqliteStore(server).
// 두 구현은 store-contract.ts의 같은 테스트를 통과해야 한다.
export interface Store {
  /** 아이디가 이미 있으면 undefined */
  createUser(input: { username: string; passwordHash: string; createdAt: string }): User | undefined;
  findCredentials(username: string): { user: User; passwordHash: string } | undefined;

  createSession(input: { token: string; userId: number; expiresAt: string }): void;
  /** now(ISO 문자열) 기준으로 만료되지 않은 세션의 사용자 */
  findSessionUser(token: string, now: string): User | undefined;
  deleteSession(token: string): void;

  createPost(input: { authorId: number; title: string; body: string; createdAt: string }): Post;
  /** 최신순 */
  listPosts(viewerId: number | null): PostSummary[];
  getPost(id: number, viewerId: number | null): Post | undefined;

  setLike(input: { postId: number; userId: number; liked: boolean }): void;

  createComment(input: { postId: number; authorId: number; body: string; createdAt: string }): Comment;
  /** 작성순 */
  listComments(postId: number): Comment[];
}
