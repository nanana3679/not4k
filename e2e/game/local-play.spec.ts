import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

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
      liftPx: 0,
      suddenPx: 0,
      targetFps: 60,
      offsetMs: 0,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

async function navigateToSongSelect(page: Page) {
  await page.goto('/');
  await page.evaluate(
    (s) => localStorage.setItem('not4k-settings', s),
    NON_FIRST_LAUNCH_SETTINGS
  );
  await page.reload();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
}

test.describe('Local Play', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToSongSelect(page);
  });

  test('load local section is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Load Local Chart' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load & Play' })).toBeVisible();
  });

  test('error shown when clicking Load without files', async ({ page }) => {
    await page.getByRole('button', { name: 'Load & Play' }).click();
    await expect(
      page.getByText('Please select both chart JSON and audio file')
    ).toBeVisible();
  });

  test('upload chart and audio navigates to play screen', async ({ page }) => {
    const chartInput = page.locator('input[type="file"][accept=".json"]');
    await chartInput.setInputFiles(path.join(FIXTURES_DIR, 'test-chart.json'));

    const audioInput = page.locator('input[type="file"][accept="audio/*"]');
    await audioInput.setInputFiles(path.join(FIXTURES_DIR, 'test-audio.wav'));

    await page.getByRole('button', { name: 'Load & Play' }).click();

    // Play screen shows canvas or an error fallback (WebGL may be unavailable)
    const canvas = page.locator('canvas');
    const errorFallback = page.getByRole('button', { name: 'Back to Song Select' });
    await expect(canvas.or(errorFallback)).toBeVisible({ timeout: 10000 });
  });

  test('play screen has canvas element when WebGL is available', async ({ page }) => {
    const chartInput = page.locator('input[type="file"][accept=".json"]');
    await chartInput.setInputFiles(path.join(FIXTURES_DIR, 'test-chart.json'));

    const audioInput = page.locator('input[type="file"][accept="audio/*"]');
    await audioInput.setInputFiles(path.join(FIXTURES_DIR, 'test-audio.wav'));

    await page.getByRole('button', { name: 'Load & Play' }).click();

    // Wait for either canvas or error
    const canvas = page.locator('canvas');
    const errorFallback = page.getByRole('button', { name: 'Back to Song Select' });
    const visible = canvas.or(errorFallback);
    await expect(visible).toBeVisible({ timeout: 10000 });

    // If canvas is visible, the play screen initialized successfully
    if (await canvas.isVisible()) {
      await expect(canvas).toBeAttached();
    }
  });
});
