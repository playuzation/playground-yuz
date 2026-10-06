import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'password123';

/** 테스트마다 겹치지 않는 아이디(최대 20자, 영문 소문자·숫자·_) */
export const uniqueName = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);

export const header = (page: Page) => page.getByRole('banner');

export async function signup(page: Page, username = uniqueName('u')): Promise<string> {
  await page.goto('/#/signup');
  await page.getByLabel('아이디').fill(username);
  await page.getByLabel('비밀번호').fill(PASSWORD);
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(header(page).getByText(`@${username}`, { exact: true })).toBeVisible();
  return username;
}

export async function logout(page: Page): Promise<void> {
  await header(page).getByRole('button', { name: '로그아웃' }).click();
  await expect(header(page).getByRole('link', { name: '로그인' })).toBeVisible();
}

export async function createPost(page: Page, title: string, body: string): Promise<void> {
  await header(page).getByRole('link', { name: '새 글' }).click();
  await page.getByLabel('제목').fill(title);
  await page.getByLabel('본문').fill(body);
  await page.getByRole('button', { name: '게시하기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

export async function goHome(page: Page): Promise<void> {
  await header(page).getByRole('link', { name: 'Playground' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '최근 포스트' })).toBeVisible();
}
