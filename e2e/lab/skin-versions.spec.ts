import { test, expect } from '@playwright/test';

test('현재→v001→v002→v003→v004→v005→현재 전환에서 차트를 유지하고 재생기·에셋 랙·URL을 같은 버전으로 바꾼다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: { skinId: 'classic' } }, version: 0 })));
  await page.goto('/lab/note-assets?design=classic');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const settings = await page.evaluate(() => localStorage.getItem('not4k-settings'));
  expect(settings).toContain('classic');
  await page.getByRole('button', { name: '독립 롱', exact: true }).click();
  for (const version of ['v001', 'v002', 'v003', 'v004', 'v005']) {
    const texture = page.waitForResponse(response => response.url().endsWith(`/lab/skin-versions/classic/${version}/skin/body-single.png`));
    await page.getByLabel('버전', { exact: true }).selectOption(version);
    expect((await texture).status()).toBe(200);
    await expect(page.getByText('PLAYER READY')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`version=${version}`));
    await expect(page.locator('[data-tutorial-skin-id]')).toHaveAttribute('data-tutorial-skin-id', `classic-${version}`);
    await expect(page.locator('.asset-lab-player-canvas')).toHaveAttribute('data-active-preview', 'headless-long-note');
    await expect(page.locator('[data-point-rack-item="single"] img')).toHaveAttribute('src', `/lab/skin-versions/classic/${version}/svg/note-single.svg`);
    await expect(page.locator('[data-body-rack-item] img').first()).toHaveAttribute('src', new RegExp(`/classic/${version}/svg/`));
    await expect(page.locator('[data-terminal-rack-item] img').first()).toHaveAttribute('src', new RegExp(`/classic/${version}/svg/`));
    await expect(page.locator('.asset-lab-bomb-rack img').first()).toHaveAttribute('src', `/lab/skin-versions/classic/${version}/skin/bomb-00.png`);
  }
  await page.locator('.asset-lab-workbench').screenshot({ path: testInfo.outputPath('classic-version-selector.png') });
  await page.goBack();
  await expect(page.getByLabel('버전', { exact: true })).toHaveValue('v004');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await page.getByLabel('버전', { exact: true }).selectOption('current');
  await expect(page).not.toHaveURL(/version=/);
  await expect(page.locator('[data-tutorial-skin-id]')).toHaveAttribute('data-tutorial-skin-id', 'classic');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await expect(page.locator('.asset-lab-bomb-rack > button')).toHaveCount(6);
  expect(await page.evaluate(() => localStorage.getItem('not4k-settings'))).toBe(settings);
  expect(errors).toEqual([]);
});

test('390px v004 직접 링크와 새로고침은 옅은 포인트와 S05/D05를 유지하고 Simple 전환 시 버전 선택을 해제한다', async ({ page }) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/lab/note-assets?design=classic&version=v004');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await expect(page.getByLabel('버전', { exact: true })).toHaveValue('v004');
  await page.reload();
  await expect(page.locator('[data-tutorial-skin-id]')).toHaveAttribute('data-tutorial-skin-id', 'classic-v004');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', {name: 'Simple', exact: true}).click();
  await expect(page.getByLabel('버전', { exact: true })).toHaveCount(0);
  await expect(page).not.toHaveURL(/version=/);
  await expect(page.getByText('PLAYER READY')).toBeVisible();
});

test('v999 직접 링크는 현재 적용본으로 표시하고 보관 코드의 에셋 URL은 404다', async ({ page }) => {
  await page.goto('/lab/note-assets?design=classic&version=v999');
  await expect(page.getByLabel('버전', { exact: true })).toHaveValue('current');
  await expect(page.locator('[data-tutorial-skin-id]')).toHaveAttribute('data-tutorial-skin-id', 'classic');
  expect((await page.request.get('/lab/skin-versions/classic/v001/manifest.json')).status()).toBe(404);
  expect((await page.request.get('/lab/skin-versions/classic/v001/sources/states.mjs')).status()).toBe(404);
});


test('v004의 싱글·더블 포인트는 S05/D05 비교 카드의 옅은 원본과 모든 픽셀이 같다', async ({ page }) => {
  await page.goto('/lab/note-assets?design=classic&version=v004');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const matches = await page.evaluate(async () => {
    const pixels = async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return [...context.getImageData(0, 0, canvas.width, canvas.height).data];
    };
    return Promise.all(['single', 'double'].map(async kind => {
      const expected = await pixels(`/lab/images/long-note-body-six-20260929/point-${kind}-latest.png`);
      const actual = await pixels(`/lab/skin-versions/classic/v004/skin/note-${kind}.png`);
      return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    }));
  });
  expect(matches).toEqual([true, true]);
});


test('v005 포인트 양쪽 2px의 검은 선을 없애고 옅은 중앙 면과 내부 무늬를 보존한다', async ({ page }) => {
  await page.goto('/lab/note-assets?design=classic&version=v005');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const results = await page.evaluate(async () => {
    const pixels = async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    return Promise.all(['single', 'double'].map(async kind => {
      const before = await pixels(`/lab/skin-versions/classic/v004/skin/note-${kind}.png`);
      const after = await pixels(`/lab/skin-versions/classic/v005/skin/note-${kind}.png`);
      let changedInterior = 0, darkSide = 0, transparentSide = 0;
      for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) {
        const i = (y * after.width + x) * 4;
        if (x >= 2 && x < after.width - 2 && [0, 1, 2, 3].some(c => before.data[i + c] !== after.data[i + c])) changedInterior++;
        if (y >= 8 && y < 36 && (x < 2 || x >= after.width - 2)) {
          if (Math.max(...after.data.slice(i, i + 3)) < 100) darkSide++;
          if (after.data[i + 3] !== 255) transparentSide++;
        }
      }
      return { width: after.width, height: after.height, changedInterior, darkSide, transparentSide };
    }));
  });
  expect(results).toEqual(Array(2).fill({ width: 212, height: 40, changedInterior: 0, darkSide: 0, transparentSide: 0 }));
});
