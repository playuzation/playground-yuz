// GitHub Pages 루트의 정적 읽기 사이트: 로그인 없이 글을 읽고, 체험 데모(/app/)로 넘어간다.
// 정적 사이트는 데모 빌드에만 있으므로 demo-mobile에서만 돈다.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../screenshots', import.meta.url));

test('읽기 사이트에서 글을 읽고 체험 데모로 이동한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'demo-mobile', '정적 사이트는 데모 빌드에만 있다');
  const shot = async (name: string) => {
    const path = `${dir}/${testInfo.project.name}/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  };

  await page.goto('../'); // baseURL은 /app/, 사이트는 그 위
  await expect(page.getByRole('heading', { level: 1, name: '모바일로만 만든 토이 플랫폼' })).toBeVisible();
  for (const name of ['언어 기초', 'AI 기초', '이산수학', '정보 이론']) {
    await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
  }
  await shot('05-site-index');

  await page.getByRole('link', { name: '프로그래밍 언어란 무엇인가' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '프로그래밍 언어란 무엇인가' })).toBeVisible();
  await expect(page.locator('.markdown h2').first()).toBeVisible();
  await shot('06-site-post');

  await page.locator('a.next').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('파이썬');
  await page.goBack();

  await page.getByRole('link', { name: '체험 데모에서 이 글에 좋아요·댓글 남기기' }).click();
  await expect(page).toHaveURL(/\/app\/#\/posts\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: '[언어 기초 1/8] 프로그래밍 언어란 무엇인가' })).toBeVisible();
  await page.getByRole('link', { name: '처음으로' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '모바일로만 만든 토이 플랫폼' })).toBeVisible();
});
