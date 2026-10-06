import type { Store } from './store.ts';
import type { Comment, Post, PostSummary, User } from './types.ts';

// JSON 직렬화 가능한 상태. 데모는 이 상태를 localStorage에 저장한다.
export interface MemoryState {
  seq: { user: number; post: number; comment: number };
  users: { id: number; username: string; passwordHash: string; createdAt: string }[];
  sessions: { token: string; userId: number; expiresAt: string }[];
  posts: { id: number; authorId: number; title: string; body: string; createdAt: string }[];
  likes: { postId: number; userId: number }[];
  comments: { id: number; postId: number; authorId: number; body: string; createdAt: string }[];
}

export const emptyMemoryState = (): MemoryState => ({
  seq: { user: 0, post: 0, comment: 0 },
  users: [],
  sessions: [],
  posts: [],
  likes: [],
  comments: [],
});

export class MemoryStore implements Store {
  readonly state: MemoryState;

  constructor(state: MemoryState = emptyMemoryState()) {
    this.state = state;
  }

  createUser(input: { username: string; passwordHash: string; createdAt: string }): User | undefined {
    if (this.state.users.some((u) => u.username === input.username)) return undefined;
    const id = ++this.state.seq.user;
    this.state.users.push({ id, ...input });
    return { id, username: input.username };
  }

  findCredentials(username: string): { user: User; passwordHash: string } | undefined {
    const u = this.state.users.find((x) => x.username === username);
    return u && { user: { id: u.id, username: u.username }, passwordHash: u.passwordHash };
  }

  createSession(input: { token: string; userId: number; expiresAt: string }): void {
    this.state.sessions.push({ ...input });
  }

  findSessionUser(token: string, now: string): User | undefined {
    const s = this.state.sessions.find((x) => x.token === token && x.expiresAt > now);
    return s && this.user(s.userId);
  }

  deleteSession(token: string): void {
    this.state.sessions = this.state.sessions.filter((s) => s.token !== token);
  }

  createPost(input: { authorId: number; title: string; body: string; createdAt: string }): Post {
    const id = ++this.state.seq.post;
    this.state.posts.push({ id, ...input });
    return this.getPost(id, input.authorId)!;
  }

  listPosts(viewerId: number | null): PostSummary[] {
    return [...this.state.posts].sort((a, b) => b.id - a.id).map((p) => this.summarize(p, viewerId));
  }

  getPost(id: number, viewerId: number | null): Post | undefined {
    const p = this.state.posts.find((x) => x.id === id);
    return p && { ...this.summarize(p, viewerId), body: p.body };
  }

  setLike(input: { postId: number; userId: number; liked: boolean }): void {
    const others = this.state.likes.filter((l) => !(l.postId === input.postId && l.userId === input.userId));
    this.state.likes = input.liked ? [...others, { postId: input.postId, userId: input.userId }] : others;
  }

  createComment(input: { postId: number; authorId: number; body: string; createdAt: string }): Comment {
    const id = ++this.state.seq.comment;
    this.state.comments.push({ id, ...input });
    return { id, postId: input.postId, author: this.user(input.authorId), body: input.body, createdAt: input.createdAt };
  }

  listComments(postId: number): Comment[] {
    return this.state.comments
      .filter((c) => c.postId === postId)
      .sort((a, b) => a.id - b.id)
      .map((c) => ({ id: c.id, postId: c.postId, author: this.user(c.authorId), body: c.body, createdAt: c.createdAt }));
  }

  private user(id: number): User {
    const u = this.state.users.find((x) => x.id === id);
    return { id, username: u?.username ?? '(알 수 없음)' };
  }

  private summarize(
    p: { id: number; authorId: number; title: string; createdAt: string },
    viewerId: number | null,
  ): PostSummary {
    const likes = this.state.likes.filter((l) => l.postId === p.id);
    return {
      id: p.id,
      title: p.title,
      author: this.user(p.authorId),
      createdAt: p.createdAt,
      likeCount: likes.length,
      commentCount: this.state.comments.filter((c) => c.postId === p.id).length,
      likedByMe: viewerId !== null && likes.some((l) => l.userId === viewerId),
    };
  }
}
