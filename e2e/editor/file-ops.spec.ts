import { test, expect } from '@playwright/test';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

test.describe('Editor File Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
  });

  test('save chart triggers download', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Save Chart').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('load chart updates note count', async ({ page }) => {
    // Verify initial state
    await expect(page.getByText('Total: 0 notes')).toBeVisible();

    // Load test chart via hidden file input
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'test-chart.json'));

    // Verify note count updates
    await expect(page.getByText('Total: 3 notes')).toBeVisible();
  });

  test('load audio does not produce errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const fileInput = page.locator('input[type="file"][accept="audio/*"]');
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'test-audio.wav'));

    // Wait for async audio processing
    await page.waitForTimeout(1000);

    // Filter out WebGL-related warnings that may appear in headless mode
    const realErrors = errors.filter(
      (e) => !e.includes('WebGL') && !e.includes('GPU')
    );
    expect(realErrors).toHaveLength(0);
  });
});
