import { test, expect } from '@playwright/test';

const NON_FIRST_LAUNCH_SETTINGS = JSON.stringify({
  state: {
    settings: {
      keyBindings: {
        lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
        lane2: ['KeyE', 'KeyD', 'KeyC'],
        lane3: ['KeyP', 'KeyL', 'Comma'],
        lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
      },
      scrollSpeed: 800,
      liftPercent: 0,
      suddenPercent: 0,
      targetFps: 60,
      offsetMs: 0,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

test.describe('Game Navigation', () => {
  test('title screen shows Start button', async ({ page }) => {
    await page.goto('/game');
    await expect(page.getByRole('heading', { name: 'not4k' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('first launch: Start navigates to preset setup', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(
      page.getByRole('heading', { name: 'Choose Your Keyboard Layout' })
    ).toBeVisible();
  });

  test('preset setup: TKL navigates to song select', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'TKL (Tenkeyless)' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });

  test('preset setup: Numpad navigates to song select', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: 'Numpad' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });

  test('non-first launch: Start goes directly to song select', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(
      (s) => localStorage.setItem('not4k-settings', s),
      NON_FIRST_LAUNCH_SETTINGS
    );
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });

  test('settings and back navigation', async ({ page }) => {
    await page.goto('/game');
    await page.evaluate(
      (s) => localStorage.setItem('not4k-settings', s),
      NON_FIRST_LAUNCH_SETTINGS
    );
    await page.reload();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();

    // Go to Settings
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Go back
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  });
});
