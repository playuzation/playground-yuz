// 해시 라우팅: 서버 설정 없이 GitHub Pages 하위 경로에서도 동작한다.
export type Route =
  | { name: 'home' }
  | { name: 'post'; id: number }
  | { name: 'new' }
  | { name: 'login' }
  | { name: 'signup' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const post = path.match(/^\/posts\/(\d+)$/);
  if (post) return { name: 'post', id: Number(post[1]) };
  if (path === '/new') return { name: 'new' };
  if (path === '/login') return { name: 'login' };
  if (path === '/signup') return { name: 'signup' };
  return { name: 'home' };
}

export const href = {
  home: '#/',
  post: (id: number) => `#/posts/${id}`,
  new: '#/new',
  login: '#/login',
  signup: '#/signup',
};
