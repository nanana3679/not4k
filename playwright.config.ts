import { defineConfig, devices } from '@playwright/test';

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
  ],
  webServer: {
    command: 'pnpm dev:web',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
