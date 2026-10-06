import type { Comment, Post, PostSummary, User } from '@playground/core';

export interface TokenStore {
  get(): string | null;
  set(token: string | null): void;
}

export function localTokenStore(key = 'playground.token'): TokenStore {
  return {
    get: () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (token) => {
      try {
        if (token) localStorage.setItem(key, token);
        else localStorage.removeItem(key);
      } catch {
        // 저장소를 쓸 수 없는 환경(사파리 비공개 모드 등)에서는 새로고침 시 로그아웃된다.
      }
    },
  };
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function createClient(fetchFn: FetchFn, tokens: TokenStore) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = tokens.get();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetchFn(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `요청에 실패했습니다. (${res.status})`);
    return data as T;
  }

  const authenticate = async (path: string, username: string, password: string) => {
    const { user, token } = await request<{ user: User; token: string }>('POST', path, { username, password });
    tokens.set(token);
    return user;
  };

  return {
    async me(): Promise<User | null> {
      if (!tokens.get()) return null;
      const { user } = await request<{ user: User | null }>('GET', '/api/me');
      if (!user) tokens.set(null);
      return user;
    },
    signup: (username: string, password: string) => authenticate('/api/auth/signup', username, password),
    login: (username: string, password: string) => authenticate('/api/auth/login', username, password),
    async logout(): Promise<void> {
      try {
        await request('POST', '/api/auth/logout');
      } finally {
        tokens.set(null);
      }
    },
    listPosts: () => request<{ posts: PostSummary[] }>('GET', '/api/posts').then((r) => r.posts),
    getPost: (id: number) => request<{ post: Post; comments: Comment[] }>('GET', `/api/posts/${id}`),
    createPost: (title: string, body: string) =>
      request<{ post: Post }>('POST', '/api/posts', { title, body }).then((r) => r.post),
    setLike: (id: number, liked: boolean) =>
      request<{ likeCount: number; likedByMe: boolean }>(liked ? 'PUT' : 'DELETE', `/api/posts/${id}/like`),
    addComment: (id: number, body: string) =>
      request<{ comment: Comment }>('POST', `/api/posts/${id}/comments`, { body }).then((r) => r.comment),
  };
}

export type ApiClient = ReturnType<typeof createClient>;
