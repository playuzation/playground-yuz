import { useState } from 'preact/hooks';
import type { User } from '@playground/core';
import { errorMessage, type ApiClient } from '../client.ts';
import { href } from '../router.ts';

export function AuthForm({
  client,
  mode,
  onDone,
}: {
  client: ApiClient;
  mode: 'login' | 'signup';
  onDone: (user: User) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await (isLogin ? client.login(username, password) : client.signup(username, password)));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <section class="narrow">
      <h1>{isLogin ? '로그인' : '가입'}</h1>
      <form class="stack" onSubmit={submit}>
        <label>
          아이디
          <input autoComplete="username" value={username} onInput={(e) => setUsername(e.currentTarget.value)} />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </label>
        {error && <p role="alert" class="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {isLogin ? '로그인' : '가입하기'}
        </button>
      </form>
      <p class="muted">
        {isLogin ? (
          <>
            계정이 없나요? <a href={href.signup}>가입</a>
          </>
        ) : (
          <>
            이미 계정이 있나요? <a href={href.login}>로그인</a>
          </>
        )}
      </p>
    </section>
  );
}
