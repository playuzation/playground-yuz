// 데모는 상태를 브라우저(localStorage)에 저장한다. 예시 포스트가 바뀐 뒤 다시 방문하면
// 예전 상태(글 목록과 id가 다름)를 버리고 새 초기 데이터로 시작해야 한다. 데모 빌드에만 있는 동작이다.
import { expect, test } from '@playwright/test';
import { createPost, goHome, header, signup } from './helpers.ts';

test('예시 포스트가 바뀌면 예전 데모 상태를 버리고 새 초기 데이터로 시작한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'demo-mobile', '데모 빌드에만 있는 동작이다');
  const title = '예전 데모에서 쓴 글';
  await signup(page);
  await createPost(page, title, '본문');

  // 초기 데이터가 그대로면 새로고침해도 상태가 유지된다.
  await page.reload();
  await goHome(page);
  await expect(page.getByRole('article').filter({ hasText: title })).toHaveCount(1);

  // 예전 버전의 데모가 남긴 상태처럼 만든다.
  await page.evaluate(() => localStorage.setItem('playground.demo.seed', 'old-version'));
  await page.reload();
  await goHome(page);
  await expect(page.getByRole('article').filter({ hasText: '데모에 오신 것을 환영합니다' })).toHaveCount(1);
  await expect(page.getByRole('article').filter({ hasText: title })).toHaveCount(0);
  await expect(header(page).getByRole('link', { name: '로그인' })).toBeVisible();
});
