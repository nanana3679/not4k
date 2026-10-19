import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { e2eDevServerEnv } from './scripts/e2eDevServerEnv';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'editor',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
        launchOptions: {
          args: ['--use-gl=swiftshader'],
        },
      },
      testDir: './e2e/editor',
    },
    {
      name: 'game',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
        launchOptions: {
          args: ['--use-gl=swiftshader'],
        },
      },
      testDir: './e2e/game',
    },
    {
      name: 'lab',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
        launchOptions: {
          args: ['--use-gl=swiftshader'],
        },
      },
      testDir: './e2e/lab',
    },
  ],
  // dev 서버 env: admin 우회(VITE_DEV_ADMIN=true)는 항상 켜고, Supabase URL·키는 process.env와
  // .env* 파일 어디에도 없을 때만 오프라인용 더미 값(https://e2e-offline.supabase.co)을 넣는다. 있으면 그대로 쓴다.
  // 그래서 스펙은 쓰는 Supabase 요청을 page.route로 응답해야 한다(scripts/e2eDevServerEnv.ts).
  // 이미 떠 있는 서버를 재사용하면(reuseExistingServer) 이 env는 쓰이지 않고 그 서버를 띄울 때의 env가 남는다.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: e2eDevServerEnv(dirname(fileURLToPath(import.meta.url))),
  },
});
