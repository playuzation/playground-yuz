import { useState } from 'preact/hooks';
import type { Post } from '@playground/core';
import { LIMITS } from '@playground/core';
import { errorMessage, type ApiClient } from '../client.ts';

export function NewPost({ client, onCreated }: { client: ApiClient; onCreated: (post: Post) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await client.createPost(title, body));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <section>
      <h1>새 포스트</h1>
      <form class="stack" onSubmit={submit}>
        <label>
          제목
          <input maxLength={LIMITS.title.max} value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label>
          본문
          <textarea
            rows={12}
            maxLength={LIMITS.body.max}
            value={body}
            onInput={(e) => setBody(e.currentTarget.value)}
          />
        </label>
        <p class="hint">마크다운을 지원합니다. 이미지·첨부파일은 지원하지 않습니다.</p>
        {error && <p role="alert" class="error">{error}</p>}
        <button type="submit" disabled={busy}>
          게시하기
        </button>
      </form>
    </section>
  );
}
