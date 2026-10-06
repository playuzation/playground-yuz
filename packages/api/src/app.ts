import { Hono, type Context } from 'hono';
import {
  validateCommentInput,
  validateCredentials,
  validatePostInput,
  type Store,
  type User,
} from '@playground/core';
import { hashPassword, newToken, verifyPassword } from './password.ts';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

type Env = { Variables: { user: User | null; token: string | null } };

export interface ApiOptions {
  store: Store;
  now?: () => Date;
}

// 인증: 로그인 시 발급한 토큰을 `Authorization: Bearer <token>`으로 보낸다.
// 쿠키를 쓰지 않는 이유: 데모에서는 브라우저 안에서 app.fetch()를 직접 호출하는데,
// 브라우저가 Cookie/Set-Cookie 헤더를 스크립트에서 다루지 못하게 막기 때문이다.
export function createApp({ store, now = () => new Date() }: ApiOptions): Hono<Env> {
  const app = new Hono<Env>().basePath('/api');

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: '서버 오류가 발생했습니다.' }, 500);
  });

  app.use('*', async (c, next) => {
    const token = c.req.header('authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? null;
    c.set('token', token);
    c.set('user', (token && store.findSessionUser(token, now().toISOString())) || null);
    await next();
  });

  const readJson = (c: Context<Env>): Promise<unknown> => c.req.json().catch(() => null);

  const unauthorized = (c: Context<Env>) => c.json({ error: '로그인이 필요합니다.' }, 401);

  const startSession = (user: User) => {
    const token = newToken();
    store.createSession({ token, userId: user.id, expiresAt: new Date(now().getTime() + SESSION_MS).toISOString() });
    return { user, token };
  };

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/auth/signup', async (c) => {
    const input = validateCredentials(await readJson(c));
    if (!input.ok) return c.json({ error: input.error }, 400);
    const { username, password } = input.value;
    const user = store.createUser({ username, passwordHash: await hashPassword(password), createdAt: now().toISOString() });
    if (!user) return c.json({ error: '이미 사용 중인 아이디입니다.' }, 409);
    return c.json(startSession(user), 201);
  });

  app.post('/auth/login', async (c) => {
    const input = validateCredentials(await readJson(c));
    const found = input.ok ? store.findCredentials(input.value.username) : undefined;
    if (!input.ok || !found || !(await verifyPassword(input.value.password, found.passwordHash))) {
      return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }
    return c.json(startSession(found.user));
  });

  app.post('/auth/logout', (c) => {
    const token = c.get('token');
    if (token) store.deleteSession(token);
    return c.body(null, 204);
  });

  app.get('/me', (c) => c.json({ user: c.get('user') }));

  app.get('/posts', (c) => c.json({ posts: store.listPosts(c.get('user')?.id ?? null) }));

  app.post('/posts', async (c) => {
    const user = c.get('user');
    if (!user) return unauthorized(c);
    const input = validatePostInput(await readJson(c));
    if (!input.ok) return c.json({ error: input.error }, 400);
    const post = store.createPost({ authorId: user.id, ...input.value, createdAt: now().toISOString() });
    return c.json({ post }, 201);
  });

  app.get('/posts/:id{[0-9]+}', (c) => {
    const id = Number(c.req.param('id'));
    const post = store.getPost(id, c.get('user')?.id ?? null);
    if (!post) return c.json({ error: '포스트를 찾을 수 없습니다.' }, 404);
    return c.json({ post, comments: store.listComments(id) });
  });

  const setLike = (c: Context<Env>, liked: boolean) => {
    const user = c.get('user');
    if (!user) return unauthorized(c);
    const postId = Number(c.req.param('id'));
    if (!store.getPost(postId, null)) return c.json({ error: '포스트를 찾을 수 없습니다.' }, 404);
    store.setLike({ postId, userId: user.id, liked });
    const { likeCount, likedByMe } = store.getPost(postId, user.id)!;
    return c.json({ likeCount, likedByMe });
  };
  app.put('/posts/:id{[0-9]+}/like', (c) => setLike(c, true));
  app.delete('/posts/:id{[0-9]+}/like', (c) => setLike(c, false));

  app.post('/posts/:id{[0-9]+}/comments', async (c) => {
    const user = c.get('user');
    if (!user) return unauthorized(c);
    const postId = Number(c.req.param('id'));
    if (!store.getPost(postId, null)) return c.json({ error: '포스트를 찾을 수 없습니다.' }, 404);
    const input = validateCommentInput(await readJson(c));
    if (!input.ok) return c.json({ error: input.error }, 400);
    const comment = store.createComment({ postId, authorId: user.id, body: input.value.body, createdAt: now().toISOString() });
    return c.json({ comment }, 201);
  });

  app.all('*', (c) => c.json({ error: '찾을 수 없습니다.' }, 404));

  return app;
}
