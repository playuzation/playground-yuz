import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// 같은 테스트를 두 백엔드에 돌린다:
//  - fullstack: 실제 Node 서버 + SQLite(:memory:)
//  - demo: GitHub Pages에 올라가는 정적 데모(브라우저 안 API + MemoryStore)
// 클라우드 컨테이너에는 Chromium(1194)이 미리 설치되어 있어 @playwright/test를 1.56.1로 고정한다.
const CI = !!process.env.CI;
const root = fileURLToPath(new URL('..', import.meta.url));
const FULLSTACK_URL = 'http://localhost:4173';
const DEMO_URL = 'http://localhost:4174';
const report = ['html', { open: 'never', outputFolder: '../playwright-report' }] as const;

export default defineConfig({
  testDir: './tests',
  outputDir: '../test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  reporter: CI ? [['github'], ['list'], report] : [['list'], report],
  use: {
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'fullstack-desktop', use: { ...devices['Desktop Chrome'], baseURL: FULLSTACK_URL } },
    { name: 'fullstack-mobile', use: { ...devices['Pixel 7'], baseURL: FULLSTACK_URL } },
    { name: 'demo-mobile', use: { ...devices['Pixel 7'], baseURL: DEMO_URL } },
  ],
  webServer: [
    {
      command: 'npm run build -w @playground/web && npm start -w @playground/server',
      url: `${FULLSTACK_URL}/api/health`,
      env: { PORT: '4173', DB_PATH: ':memory:' },
      cwd: root,
      reuseExistingServer: !CI,
    },
    {
      command: 'npm run serve -w @playground/demo',
      url: DEMO_URL,
      env: { PORT: '4174' },
      cwd: root,
      reuseExistingServer: !CI,
    },
  ],
});
