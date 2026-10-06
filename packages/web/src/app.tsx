import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { User } from '@playground/core';
import { createClient, localTokenStore, type ApiClient, type FetchFn, type TokenStore } from './client.ts';
import { AuthForm } from './pages/AuthForm.tsx';
import { NewPost } from './pages/NewPost.tsx';
import { PostDetail } from './pages/PostDetail.tsx';
import { PostList } from './pages/PostList.tsx';
import { href, parseRoute } from './router.ts';

export interface MountOptions {
  /** API 호출에 쓸 fetch. 실서버는 window.fetch, 데모는 브라우저 안 API 앱. */
  fetch: FetchFn;
  tokens?: TokenStore;
}

export function mountApp(el: HTMLElement, { fetch, tokens = localTokenStore() }: MountOptions): void {
  render(<App client={createClient(fetch, tokens)} />, el);
}

function App({ client }: { client: ApiClient }) {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', onHashChange);
    return () => removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    client.me().then(setUser, () => setUser(null));
  }, [client]);

  const signedIn = (u: User) => {
    setUser(u);
    location.hash = href.home;
  };
  const logout = async () => {
    await client.logout().catch(() => {});
    setUser(null);
    location.hash = href.home;
  };

  const page = (() => {
    if (user === undefined) return <p class="muted">불러오는 중…</p>;
    switch (route.name) {
      case 'post':
        return <PostDetail key={route.id} client={client} id={route.id} user={user} />;
      case 'new':
        return user ? (
          <NewPost client={client} onCreated={(p) => (location.hash = href.post(p.id))} />
        ) : (
          <AuthForm client={client} mode="login" onDone={signedIn} />
        );
      case 'login':
      case 'signup':
        return <AuthForm key={route.name} client={client} mode={route.name} onDone={signedIn} />;
      default:
        return <PostList client={client} />;
    }
  })();

  return (
    <>
      <header class="site-header">
        <nav class="container">
          <a class="brand" href={href.home}>
            Playground
          </a>
          <span class="spacer" />
          {user ? (
            <>
              <a href={href.new}>새 글</a>
              <span class="whoami">@{user.username}</span>
              <button type="button" class="link" onClick={logout}>
                로그아웃
              </button>
            </>
          ) : (
            user === null && (
              <>
                <a href={href.login}>로그인</a>
                <a href={href.signup}>가입</a>
              </>
            )
          )}
        </nav>
      </header>
      <main class="container">{page}</main>
    </>
  );
}
