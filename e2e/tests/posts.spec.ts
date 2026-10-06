import { expect, test } from '@playwright/test';
import { createPost, goHome, signup, uniqueName } from './helpers.ts';

test('마크다운 포스트를 쓰면 렌더링되어 보이고 목록에 나타난다', async ({ page }) => {
  await signup(page);
  const title = `마크다운 ${uniqueName('t')}`;
  await createPost(page, title, '## 소제목\n\n**굵게** 그리고 `코드`\n\n- 하나\n- 둘\n\n[링크](https://example.com)');

  const body = page.locator('.markdown');
  await expect(body.getByRole('heading', { level: 2, name: '소제목' })).toBeVisible();
  await expect(body.locator('strong')).toHaveText('굵게');
  await expect(body.locator('code')).toHaveText('코드');
  await expect(body.getByRole('listitem')).toHaveText(['하나', '둘']);
  await expect(body.getByRole('link', { name: '링크' })).toHaveAttribute('href', 'https://example.com');

  await goHome(page);
  await expect(page.getByRole('article').filter({ hasText: title })).toBeVisible();
});

test('본문의 HTML은 실행되지 않고 글자 그대로 보인다', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await signup(page);
  await createPost(page, `XSS ${uniqueName('t')}`, '<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">');

  const body = page.locator('.markdown');
  await expect(body).toContainText('<script>alert(1)</script>');
  await expect(body.locator('script, img')).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test('제목 없이 게시하면 오류를 보여 준다', async ({ page }) => {
  await signup(page);
  await page.goto('/#/new');
  await page.getByLabel('본문').fill('본문만 있음');
  await page.getByRole('button', { name: '게시하기' }).click();
  await expect(page.getByRole('alert')).toHaveText('제목은 1~100자여야 합니다.');
});

test('로그인하지 않으면 새 글 대신 로그인 화면이 나온다', async ({ page }) => {
  await page.goto('/#/new');
  await expect(page.getByRole('heading', { level: 1, name: '로그인' })).toBeVisible();
});
