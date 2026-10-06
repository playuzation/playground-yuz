import { useEffect, useState } from 'preact/hooks';
import type { PostSummary } from '@playground/core';
import { errorMessage, type ApiClient } from '../client.ts';
import { formatDate } from '../format.ts';
import { href } from '../router.ts';

export function PostList({ client }: { client: ApiClient }) {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.listPosts().then(setPosts, (e) => setError(errorMessage(e)));
  }, [client]);

  if (error) return <p role="alert" class="error">{error}</p>;
  if (!posts) return <p class="muted">불러오는 중…</p>;
  return (
    <section>
      <h1>최근 포스트</h1>
      {posts.length === 0 ? (
        <p class="muted">아직 포스트가 없습니다. 첫 글을 남겨 보세요.</p>
      ) : (
        <div class="post-list">
          {posts.map((p) => (
            <article class="card" key={p.id}>
              <h2>
                <a href={href.post(p.id)}>{p.title}</a>
              </h2>
              <p class="meta">
                @{p.author.username} · {formatDate(p.createdAt)}
              </p>
              <p class="stats">
                <span>♥ {p.likeCount}</span> <span>💬 {p.commentCount}</span>
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
