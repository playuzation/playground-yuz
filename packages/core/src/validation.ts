export const LIMITS = {
  username: { min: 3, max: 20 },
  password: { min: 8, max: 72 },
  title: { min: 1, max: 100 },
  body: { min: 1, max: 10_000 },
  comment: { min: 1, max: 1_000 },
} as const;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function field(input: unknown, key: string): string {
  const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' ? value : '';
}

const within = (text: string, { min, max }: { min: number; max: number }) => text.length >= min && text.length <= max;

export function validateCredentials(input: unknown): Result<{ username: string; password: string }> {
  const username = field(input, 'username').trim().toLowerCase();
  const password = field(input, 'password');
  if (!within(username, LIMITS.username) || !/^[a-z0-9_]+$/.test(username)) {
    return fail(`아이디는 ${LIMITS.username.min}~${LIMITS.username.max}자의 영문 소문자, 숫자, _만 사용할 수 있습니다.`);
  }
  if (!within(password, LIMITS.password)) {
    return fail(`비밀번호는 ${LIMITS.password.min}~${LIMITS.password.max}자여야 합니다.`);
  }
  return { ok: true, value: { username, password } };
}

export function validatePostInput(input: unknown): Result<{ title: string; body: string }> {
  const title = field(input, 'title').trim();
  const body = field(input, 'body');
  if (!within(title, LIMITS.title)) return fail(`제목은 ${LIMITS.title.min}~${LIMITS.title.max}자여야 합니다.`);
  if (!within(body, LIMITS.body) || body.trim() === '') {
    return fail(`본문은 ${LIMITS.body.min}~${LIMITS.body.max}자여야 합니다.`);
  }
  return { ok: true, value: { title, body } };
}

export function validateCommentInput(input: unknown): Result<{ body: string }> {
  const body = field(input, 'body').trim();
  if (!within(body, LIMITS.comment)) return fail(`댓글은 ${LIMITS.comment.min}~${LIMITS.comment.max}자여야 합니다.`);
  return { ok: true, value: { body } };
}
