import { expect, test } from '@playwright/test';
import { createPost, goHome, logout, signup, uniqueName } from './helpers.ts';

// 데모 모드는 데이터가 브라우저별로 분리되므로, 여러 사용자는 같은 페이지에서 로그아웃/가입으로 전환한다.
test('좋아요를 켜고 끌 수 있고 다른 사용자의 좋아요가 합산된다', async ({ page }) => {
  await signup(page);
  await createPost(page, `좋아요 ${uniqueName('t')}`, '본문');
  const like = page.getByRole('button', { name: '좋아요' });
  const count = page.getByTestId('like-count');

  await expect(count).toHaveText('0');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText('1');

  await page.reload();
  await expect(count).toHaveText('1');
  await expect(like).toHaveAttribute('aria-pressed', 'true');

  await like.click();
  await expect(count).toHaveText('0');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await like.click();
  await expect(count).toHaveText('1');

  const postUrl = page.url();
  await logout(page);
  await signup(page);
  await page.goto(postUrl);
  await expect(count).toHaveText('1');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await like.click();
  await expect(count).toHaveText('2');
});

test('로그인하지 않고 좋아요를 누르면 로그인 화면으로 간다', async ({ page }) => {
  await signup(page);
  await createPost(page, `비로그인 ${uniqueName('t')}`, '본문');
  const postUrl = page.url();
  await logout(page);
  await page.goto(postUrl);
  await page.getByRole('button', { name: '좋아요' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '로그인' })).toBeVisible();
});

test('댓글을 남기면 상세와 목록의 개수에 반영된다', async ({ page }) => {
  const username = await signup(page);
  const title = `댓글 ${uniqueName('t')}`;
  await createPost(page, title, '본문');
  await expect(page.getByRole('heading', { name: '댓글 0' })).toBeVisible();

  await page.getByLabel('댓글 쓰기').fill('첫 댓글입니다\n두 번째 줄');
  await page.getByRole('button', { name: '댓글 등록' }).click();

  const comments = page.getByRole('list', { name: '댓글 목록' }).getByRole('listitem');
  await expect(comments).toHaveCount(1);
  await expect(comments.first()).toContainText('첫 댓글입니다');
  await expect(comments.first()).toContainText(`@${username}`);
  await expect(page.getByRole('heading', { name: '댓글 1' })).toBeVisible();
  await expect(page.getByLabel('댓글 쓰기')).toHaveValue('');

  await goHome(page);
  await expect(page.getByRole('article').filter({ hasText: title })).toContainText('💬 1');
});
