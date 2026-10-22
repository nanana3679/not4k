import { test, expect } from '@playwright/test';
import { openEditor } from './editorTestSetup';

test.describe('에디터 타임라인 canvas', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page);
  });

  test('songId·difficulty를 URL에 붙여 진입하면 타임라인 canvas가 보인다', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('Ctrl+휠 위(deltaY -100) 한 번에 Zoom 표시가 200px/s → 220px/s로 바뀐다', async ({ page }) => {
    const zoomText = page.getByText(/Zoom: \d+px\/s/);
    await expect(zoomText).toHaveText('Zoom: 200px/s');

    const canvas = page.locator('canvas');
    await canvas.hover();

    // Ctrl+wheel up to zoom in
    await page.keyboard.down('Control');
    await canvas.dispatchEvent('wheel', { deltaY: -100, ctrlKey: true });
    await page.keyboard.up('Control');

    await expect(zoomText).toHaveText('Zoom: 220px/s');
  });

  test('휠 스크롤(deltaY 100)은 passive 리스너 오류를 내지 않는다', async ({ page }) => {
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
