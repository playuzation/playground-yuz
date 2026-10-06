import { useEffect, useState } from 'preact/hooks';
import type { Comment, Post, User } from '@playground/core';
import { LIMITS } from '@playground/core';
import { errorMessage, type ApiClient } from '../client.ts';
import { formatDate } from '../format.ts';
import { renderMarkdown } from '../markdown.ts';
import { href } from '../router.ts';

export function PostDetail({ client, id, user }: { client: ApiClient; id: number; user: User | null }) {
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    client.getPost(id).then(
      (data) => {
        setPost(data.post);
        setComments(data.comments);
      },
      (e) => setError(errorMessage(e)),
    );
  }, [client, id]);

  if (error) return <p role="alert" class="error">{error}</p>;
  if (!post) return <p class="muted">불러오는 중…</p>;

  const toggleLike = async () => {
    if (!user) {
      location.hash = href.login;
      return;
    }
    setLiking(true);
    try {
      setPost({ ...post, ...(await client.setLike(id, !post.likedByMe)) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLiking(false);
    }
  };

  return (
    <article class="post">
      <h1>{post.title}</h1>
      <p class="meta">
        @{post.author.username} · {formatDate(post.createdAt)}
      </p>
      <div class="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />
      <div class="actions">
        <button
          type="button"
          class={post.likedByMe ? 'like liked' : 'like'}
          aria-label="좋아요"
          aria-pressed={post.likedByMe}
          disabled={liking}
          onClick={toggleLike}
        >
          ♥ <span data-testid="like-count">{post.likeCount}</span>
        </button>
      </div>
      <section class="comments">
        <h2>댓글 {comments.length}</h2>
        <ul aria-label="댓글 목록">
          {comments.map((c) => (
            <li class="comment" key={c.id}>
              <p class="meta">
                @{c.author.username} · {formatDate(c.createdAt)}
              </p>
              <p class="comment-body">{c.body}</p>
            </li>
          ))}
        </ul>
        {user ? (
          <CommentForm client={client} postId={id} onAdded={(c) => setComments([...comments, c])} />
        ) : (
          <p class="muted">
            <a href={href.login}>로그인</a>하고 댓글을 남겨 보세요.
          </p>
        )}
      </section>
    </article>
  );
}

function CommentForm({ client, postId, onAdded }: { client: ApiClient; postId: number; onAdded: (c: Comment) => void }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAdded(await client.addComment(postId, body));
      setBody('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="stack" onSubmit={submit}>
      <label>
        댓글 쓰기
        <textarea
          rows={3}
          maxLength={LIMITS.comment.max}
          value={body}
          onInput={(e) => setBody(e.currentTarget.value)}
        />
      </label>
      {error && <p role="alert" class="error">{error}</p>}
      <button type="submit" disabled={busy}>
        댓글 등록
      </button>
    </form>
  );
}
