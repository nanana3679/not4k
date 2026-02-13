import { test, expect } from '@playwright/test';

test.describe('Editor Canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas');
  });

  test('canvas element exists and is visible', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('ctrl+wheel changes zoom display', async ({ page }) => {
    const zoomText = page.getByText(/Zoom: \d+px\/s/);
    const initialText = await zoomText.textContent();

    const canvas = page.locator('canvas');
    await canvas.hover();

    // Ctrl+wheel up to zoom in
    await page.keyboard.down('Control');
    await canvas.dispatchEvent('wheel', { deltaY: -100, ctrlKey: true });
    await page.keyboard.up('Control');

    // Zoom value should have changed
    await expect(zoomText).not.toHaveText(initialText!);
  });

  test('wheel scroll produces no passive event errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const canvas = page.locator('canvas');
    await canvas.hover();
    await canvas.dispatchEvent('wheel', { deltaY: 100 });

    await page.waitForTimeout(500);

    const passiveErrors = errors.filter(
      (e) =>
        e.toLowerCase().includes('passive') ||
        e.toLowerCase().includes('preventdefault')
    );
    expect(passiveErrors).toHaveLength(0);
  });
});
