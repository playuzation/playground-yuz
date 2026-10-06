import { expect, test } from '@playwright/test';
import { PASSWORD, header, logout, signup } from './helpers.ts';

test('가입하면 로그인 상태가 되고 새로고침해도 유지된다', async ({ page }) => {
  const username = await signup(page);
  await page.reload();
  await expect(header(page).getByText(`@${username}`, { exact: true })).toBeVisible();
});

test('로그아웃 후 다시 로그인할 수 있다', async ({ page }) => {
  const username = await signup(page);
  await logout(page);
  await header(page).getByRole('link', { name: '로그인' }).click();
  await page.getByLabel('아이디').fill(username);
  await page.getByLabel('비밀번호').fill(PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(header(page).getByText(`@${username}`, { exact: true })).toBeVisible();
});

test('잘못된 비밀번호와 중복 아이디는 오류를 보여 준다', async ({ page }) => {
  const username = await signup(page);
  await logout(page);

  await page.goto('/#/login');
  await page.getByLabel('아이디').fill(username);
  await page.getByLabel('비밀번호').fill('wrong-password');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByRole('alert')).toHaveText('아이디 또는 비밀번호가 올바르지 않습니다.');

  await page.goto('/#/signup');
  await page.getByLabel('아이디').fill(username);
  await page.getByLabel('비밀번호').fill(PASSWORD);
  await page.getByRole('button', { name: '가입하기' }).click();
  await expect(page.getByRole('alert')).toHaveText('이미 사용 중인 아이디입니다.');
});
