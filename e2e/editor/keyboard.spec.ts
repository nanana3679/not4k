import { test, expect } from '@playwright/test';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

test.describe('Editor Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('canvas');
  });

  test('C key switches to Create mode', async ({ page }) => {
    // Switch away from Create first
    await page.getByRole('button', { name: 'Select' }).click();

    // Press C
    await page.keyboard.press('c');

    await expect(page.getByRole('button', { name: 'Create' })).toHaveCSS(
      'background-color',
      'rgb(68, 136, 255)'
    );
  });

  test('S key switches to Select mode', async ({ page }) => {
    await page.keyboard.press('s');

    await expect(page.getByRole('button', { name: 'Select' })).toHaveCSS(
      'background-color',
      'rgb(68, 136, 255)'
    );
  });

  test('D key switches to Delete mode', async ({ page }) => {
    await page.keyboard.press('d');

    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCSS(
      'background-color',
      'rgb(68, 136, 255)'
    );
  });

  test('Space toggles play state when audio is loaded', async ({ page }) => {
    // Load audio first (play() requires audioBuffer)
    const fileInput = page.locator('input[type="file"][accept="audio/*"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'test-audio.wav'));
    await page.waitForTimeout(500);

    // Initially "Play"
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

    // Press Space — toggle to "Pause"
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    // Press Space again — back to "Play"
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });
});
