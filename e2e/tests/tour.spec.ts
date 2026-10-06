// 주요 화면을 스크린샷으로 남긴다: e2e/screenshots/<프로젝트>/NN-이름.png
// 모바일에서 작업할 때 Claude가 이 이미지를 대화창으로 보내 실제 렌더링 결과를 확인시킨다.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createPost, goHome, signup, uniqueName } from './helpers.ts';

const dir = fileURLToPath(new URL('../screenshots', import.meta.url));

async function shot(page: Page, testInfo: TestInfo, name: string) {
  const path = `${dir}/${testInfo.project.name}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('주요 화면 둘러보기', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '최근 포스트' })).toBeVisible();
  await shot(page, testInfo, '01-home');

  await signup(page, uniqueName('tour'));
  const title = '마크다운 렌더링 확인';
  await createPost(
    page,
    title,
    [
      '## 소제목',
      '',
      '**굵게**, *기울임*, `인라인 코드`, [링크](https://example.com)',
      '',
      '- 목록 하나',
      '- 목록 둘',
      '',
      '> 인용문',
      '',
      '```',
      'const hello = "world";',
      '```',
      '',
      '<b>HTML은 글자로 보여야 함</b>',
    ].join('\n'),
  );
  await page.getByRole('button', { name: '좋아요' }).click();
  await expect(page.getByTestId('like-count')).toHaveText('1');
  await page.getByLabel('댓글 쓰기').fill('스크린샷용 댓글입니다.');
  await page.getByRole('button', { name: '댓글 등록' }).click();
  await expect(page.getByRole('heading', { name: '댓글 1' })).toBeVisible();
  await shot(page, testInfo, '02-post-detail');

  await goHome(page);
  await expect(page.getByRole('article').filter({ hasText: title }).first()).toBeVisible();
  await shot(page, testInfo, '03-home-with-posts');

  await page.goto('/#/new');
  await page.getByLabel('제목').fill('작성 화면');
  await page.getByLabel('본문').fill('# 마크다운으로 작성');
  await shot(page, testInfo, '04-new-post');
});
