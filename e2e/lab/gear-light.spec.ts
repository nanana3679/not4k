import { expect, test } from '@playwright/test';

test.describe('Gear Light Lab', () => {
  test('우측 컨트롤 패널 내용이 화면보다 길면 패널 안에서 세로 스크롤 가능', async ({ page }) => {
    await page.goto('/lab/gear-light');
    await expect(page.locator('.gear-light-controls')).toBeVisible();

    const metrics = await page.locator('.gear-light-controls').evaluate((controls) => {
      controls.scrollTop = 10000;

      return {
        clientHeight: controls.clientHeight,
        scrollHeight: controls.scrollHeight,
        scrollTop: controls.scrollTop,
      };
    });

    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.scrollTop).toBeGreaterThan(0);
  });

  test('영역 보정에서 Erase와 Window overlay를 각각 숨기고 다시 표시 가능', async ({ page }) => {
    await page.goto('/lab/gear-light');
    await expect(page.locator('.gear-light-stage')).toBeVisible();

    await page.getByLabel('영역 보정').check();
    await expect(page.locator('.gear-light-calibration-eraseMask').first()).toBeVisible();
    await expect(page.locator('.gear-light-calibration-gaugeWindow').first()).toBeVisible();

    await page.getByLabel('Erase 표시').uncheck();
    await expect(page.locator('.gear-light-calibration-eraseMask')).toHaveCount(0);
    await expect(page.locator('.gear-light-calibration-gaugeWindow').first()).toBeVisible();

    await page.getByLabel('Window 표시').uncheck();
    await expect(page.locator('.gear-light-calibration-gaugeWindow')).toHaveCount(0);

    await page.getByLabel('Erase 표시').check();
    await expect(page.locator('.gear-light-calibration-eraseMask').first()).toBeVisible();
  });

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
