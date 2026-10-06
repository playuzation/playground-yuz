import { DatabaseSync } from 'node:sqlite';
import type { Comment, Post, PostSummary, Store, User } from '@playground/core';

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    author_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS likes (
    post_id INTEGER NOT NULL REFERENCES posts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS comments_by_post ON comments(post_id);
`;

const POST_COLUMNS = `
  p.id, p.title, p.body, p.created_at, u.id AS author_id, u.username AS author_name,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = :viewer) AS liked_by_me
  FROM posts p JOIN users u ON u.id = p.author_id`;

type Row = Record<string, unknown>;

const toSummary = (r: Row): PostSummary => ({
  id: Number(r.id),
  title: String(r.title),
  author: { id: Number(r.author_id), username: String(r.author_name) },
  createdAt: String(r.created_at),
  likeCount: Number(r.like_count),
  commentCount: Number(r.comment_count),
  likedByMe: Boolean(r.liked_by_me),
});

const toComment = (r: Row): Comment => ({
  id: Number(r.id),
  postId: Number(r.post_id),
  author: { id: Number(r.author_id), username: String(r.author_name) },
  body: String(r.body),
  createdAt: String(r.created_at),
});

export class SqliteStore implements Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  createUser(input: { username: string; passwordHash: string; createdAt: string }): User | undefined {
    const row = this.db
      .prepare(
        `INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)
         ON CONFLICT (username) DO NOTHING RETURNING id`,
      )
      .get(input.username, input.passwordHash, input.createdAt);
    return row && { id: Number(row.id), username: input.username };
  }

  findCredentials(username: string): { user: User; passwordHash: string } | undefined {
    const row = this.db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username);
    return row && { user: { id: Number(row.id), username }, passwordHash: String(row.password_hash) };
  }

  createSession(input: { token: string; userId: number; expiresAt: string }): void {
    this.db
      .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .run(input.token, input.userId, input.expiresAt);
  }

  findSessionUser(token: string, now: string): User | undefined {
    const row = this.db
      .prepare(
        `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ?`,
      )
      .get(token, now);
    return row && { id: Number(row.id), username: String(row.username) };
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  createPost(input: { authorId: number; title: string; body: string; createdAt: string }): Post {
    const row = this.db
      .prepare('INSERT INTO posts (author_id, title, body, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .get(input.authorId, input.title, input.body, input.createdAt)!;
    return this.getPost(Number(row.id), input.authorId)!;
  }

  listPosts(viewerId: number | null): PostSummary[] {
    return this.db.prepare(`SELECT ${POST_COLUMNS} ORDER BY p.id DESC`).all({ viewer: viewerId }).map(toSummary);
  }

  getPost(id: number, viewerId: number | null): Post | undefined {
    const row = this.db.prepare(`SELECT ${POST_COLUMNS} WHERE p.id = :id`).get({ id, viewer: viewerId });
    return row && { ...toSummary(row), body: String(row.body) };
  }

  setLike(input: { postId: number; userId: number; liked: boolean }): void {
    const sql = input.liked
      ? 'INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)'
      : 'DELETE FROM likes WHERE post_id = ? AND user_id = ?';
    this.db.prepare(sql).run(input.postId, input.userId);
  }

  createComment(input: { postId: number; authorId: number; body: string; createdAt: string }): Comment {
    const row = this.db
      .prepare('INSERT INTO comments (post_id, author_id, body, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .get(input.postId, input.authorId, input.body, input.createdAt)!;
    return this.listComments(input.postId).find((c) => c.id === Number(row.id))!;
  }

  listComments(postId: number): Comment[] {
    return this.db
      .prepare(
        `SELECT c.id, c.post_id, c.body, c.created_at, u.id AS author_id, u.username AS author_name
         FROM comments c JOIN users u ON u.id = c.author_id
         WHERE c.post_id = ? ORDER BY c.id`,
      )
      .all(postId)
      .map(toComment);
  }
}
