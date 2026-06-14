import { expect, test } from '@playwright/test';

test.describe('Gear Light Lab', () => {
  test('400% 확대하면 메인 프리뷰 viewport 안에서 상하좌우 스크롤 가능', async ({ page }) => {
    await page.goto('/lab/gear-light');
    await expect(page.locator('.gear-light-stage')).toBeVisible();

    for (let i = 0; i < 12; i += 1) {
      await page.locator('.gear-light-zoom-control button').nth(1).click();
    }

    const metrics = await page.locator('.gear-light-stage-viewport').evaluate((viewport) => {
      viewport.scrollLeft = 10000;
      viewport.scrollTop = 10000;

      return {
        clientHeight: viewport.clientHeight,
        clientWidth: viewport.clientWidth,
        scrollHeight: viewport.scrollHeight,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        scrollWidth: viewport.scrollWidth,
      };
    });

    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.scrollLeft).toBeGreaterThan(0);
    expect(metrics.scrollTop).toBeGreaterThan(0);
  });
});
