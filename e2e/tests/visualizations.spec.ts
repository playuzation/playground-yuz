import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'demo-mobile', '시각화는 정적 사이트에 있다');
});

test('글에서 시각화를 열고 재생·정지·처음부터 재생한다', async ({ page }) => {
  await page.clock.install();
  await page.goto('../posts/techniques/3.html');
  await page.getByRole('link', { name: '이 글의 시각화 재생하기' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-frame', '0');
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  await page.clock.runFor(2400);
  await expect(page.locator('body')).toHaveAttribute('data-frame', '0');
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await page.clock.runFor(2300);
  await expect(page.locator('body')).toHaveAttribute('data-frame', '1');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.clock.runFor(5000);
  await expect(page.locator('body')).toHaveAttribute('data-frame', '1');
  await page.getByRole('button', { name: '정지', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-frame', '0');
  await page.getByRole('button', { name: '처음부터 재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '일시정지', exact: true })).toBeVisible();
  await page.clock.runFor(6800);
  await expect(page.locator('body')).toHaveAttribute('data-frame', '2');
  await expect(page.locator('#status')).toHaveText('재생 완료');
  await page.getByRole('button', { name: '이전 단계' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-frame', '1');
  await page.getByRole('button', { name: '처음부터 재생' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-frame', '0');
});

test('HTML을 저장해 네트워크 없이 재생하고 키보드로 단계를 고른다', async ({ page, context }, testInfo) => {
  await page.goto('../visualizations/attention/1.html');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '재생', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '이 HTML 저장' }).click();
  const download = await downloadEvent;
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  await context.setOffline(true);
  // 관리형 Chromium은 file:// 탐색을 정책으로 막을 수 있다.
  // 저장한 파일의 내용만 새 문서에 넣어 외부 리소스 없는 실행을 검사한다.
  await page.goto('about:blank');
  await page.setContent(readFileSync(path, 'utf8'));
  await expect(page.locator('body')).toHaveAttribute('data-frame', '0');
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  await page.locator('#position').focus();
  await page.keyboard.press('End');
  await expect(page.locator('body')).toHaveAttribute('data-frame', '2');
  await page.getByRole('button', { name: '정지', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-frame', '0');
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '일시정지', exact: true })).toBeVisible();
});

test('시각화 목록은 제목·주제·시리즈로 검색할 수 있다', async ({ page }) => {
  await page.goto('../visualizations/');
  await page.getByRole('searchbox').fill('이분 탐색');
  await expect(page.getByRole('link', { name: '이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('존재하지않는검색어');
  await expect(page.locator('#matches')).toHaveText('0개 시각화');
  await page.getByRole('searchbox').fill('');
  await expect(page.locator('#matches')).toHaveText('396개 시각화');
});

test('396개 HTML의 모든 단계가 오류 없이 그려진다', async ({ page }) => {
  test.setTimeout(240_000);
  const root = new URL('../../packages/demo/dist/visualizations/', import.meta.url);
  const keys = readdirSync(root).filter((s) => !s.endsWith('.html')).flatMap((s) => readdirSync(new URL(`${s}/`, root)).map((n) => `${s}/${n}`));
  expect(keys.length).toBe(396);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const key of keys) {
    await page.goto(`../visualizations/${key}`);
    await expect(page.locator('#diagram rect, #diagram circle')).not.toHaveCount(0);
    await page.getByRole('button', { name: '다음 단계' }).click();
    await page.getByRole('button', { name: '다음 단계' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-frame', '2');
    const width = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(width, key).toBe(true);
    // 인라인 데이터와 별도 제목이 실제 산출물에 들어 있는지도 확인한다.
    expect(readFileSync(new URL(key, root), 'utf8')).toContain('lesson-data');
  }
  expect(errors).toEqual([]);
});

test('tour 시각화의 배열·트리·그래프·차트 화면', async ({ page }, testInfo) => {
  for (const key of ['techniques/3', 'datastructures/1', 'graph/2', 'attention/1', 'shader/12', 'calculus/2', 'dp/4']) {
    await page.goto(`../visualizations/${key}.html`);
    await page.getByRole('button', { name: '다음 단계' }).click();
    const path = new URL(`../screenshots/${testInfo.project.name}/visualization-${key.replace('/', '-')}.png`, import.meta.url).pathname;
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach(key, { path, contentType: 'image/png' });
  }
});
