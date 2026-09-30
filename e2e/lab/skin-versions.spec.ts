import { test, expect } from '@playwright/test';
import { CLASSIC_SKIN_VERSIONS } from '../../src/lab/classicSkinVersions';

test('현재→v001→v002→v012→현재 전환에서 차트를 유지하고 재생기·에셋 랙·URL을 같은 버전으로 바꾼다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: { skinId: 'classic' } }, version: 0 })));
  await page.goto('/lab/note-assets?design=classic');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const settings = await page.evaluate(() => localStorage.getItem('not4k-settings'));
  expect(settings).toContain('classic');
  await page.getByRole('button', { name: '독립 롱', exact: true }).click();
  for (const version of ['v001', 'v002', 'v012']) {
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
  await expect(page.getByLabel('버전', { exact: true })).toHaveValue('v002');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await page.getByLabel('버전', { exact: true }).selectOption('current');
  await expect(page).not.toHaveURL(/version=/);
  await expect(page.locator('[data-tutorial-skin-id]')).toHaveAttribute('data-tutorial-skin-id', 'classic');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await expect(page.locator('.asset-lab-bomb-rack > button')).toHaveCount(6);
  expect(await page.evaluate(() => localStorage.getItem('not4k-settings'))).toBe(settings);
  expect(errors).toEqual([]);
});

test('390px v012 직접 링크와 새로고침은 v012를 유지하고 Simple 전환 시 버전 선택을 해제한다', async ({ page }) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/lab/note-assets?design=classic&version=v012');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  await expect(page.getByLabel('버전', { exact: true })).toHaveValue('v012');
  await page.reload();
  await expect(page.locator('[data-tutorial-skin-id]')).toHaveAttribute('data-tutorial-skin-id', 'classic-v012');
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



test('v012는 렌더러와 같은 배치로 합성했을 때 포인트 경계에 맞닿은 바디 2px 띠와의 대비가 대기·켜짐 8개 조합 모두 3:1 이상이고 접촉 그림자가 없는 v002는 미달한다', async ({ page }) => {
  await page.goto('/lab/note-assets?design=classic&version=v012');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const themes = Object.fromEntries(['v002', 'v012'].map(id => {
    const theme = CLASSIC_SKIN_VERSIONS.find(version => version.id === id)!.manifest.theme;
    return [id, { pointShadow: theme.pointShadow ?? null, contact: theme.pointContactShadow ?? null }];
  }));
  expect(themes.v002.contact).toBeNull();
  expect(themes.v012.contact).toEqual({ above: 5, below: 5 });
  const results = await page.evaluate(async themes => {
    const load = async (src: string) => { const image = new Image(); image.src = src; await image.decode(); return image; };
    const linear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const S = 4; // 레인 1px = 캔버스 4px
    const W = 100 * S, H = 80 * S, bodyWidth = 100 * 100 / 106 * S, bodyX = (W - bodyWidth) / 2, pointY = H / 2 - 10 * S;
    const measure = async (version: string) => {
      const { pointShadow, contact } = themes[version];
      const base = `/lab/skin-versions/classic/${version}/skin`;
      const ratios: Record<string, number> = {};
      for (const point of ['single', 'double']) for (const body of ['single', 'double']) for (const state of ['', '-held']) {
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.imageSmoothingQuality = 'high';
        context.fillStyle = '#1a1c30'; context.fillRect(0, 0, W, H);
        // 렌더러 순서: 바디 반복 타일 → 그림자 → 포인트.
        const tile = await load(`${base}/body-${body}${state}.png`);
        const tileHeight = bodyWidth * tile.naturalHeight / tile.naturalWidth;
        for (let y = 0; y < H; y += tileHeight) context.drawImage(tile, bodyX, y, bodyWidth, tileHeight);
        if (contact) {
          const shadow = await load(`${base}/point-contact-shadow.png`);
          context.drawImage(shadow, bodyX, pointY + 20 * S, bodyWidth, contact.below * S);
          context.save(); context.translate(0, pointY); context.scale(1, -1);
          context.drawImage(shadow, bodyX, 0, bodyWidth, contact.above * S);
          context.restore();
        } else if (pointShadow) {
          context.drawImage(await load(`${base}/point-shadow.png`), bodyX, pointY + pointShadow.offsetY * S, bodyWidth, pointShadow.height * S);
        }
        context.drawImage(await load(`${base}/note-${point}.png`), 0, pointY, W, 20 * S);
        const meanLuminance = (x0: number, y0: number, x1: number, y1: number) => {
          const { data, width, height } = context.getImageData(x0, y0, x1 - x0, y1 - y0);
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += 0.2126 * linear(data[i]) + 0.7152 * linear(data[i + 1]) + 0.0722 * linear(data[i + 2]);
          return sum / (width * height);
        };
        const face = meanLuminance(Math.round(W * 50 / 212), pointY + 5 * S, Math.round(W * 162 / 212), pointY + 16 * S);
        const x0 = Math.ceil(bodyX + bodyWidth * 0.1), x1 = Math.floor(bodyX + bodyWidth * 0.9);
        const band = (meanLuminance(x0, pointY - 2 * S, x1, pointY) + meanLuminance(x0, pointY + 20 * S, x1, pointY + 22 * S)) / 2;
        ratios[`${point}→${body}${state || '-idle'}`] = (Math.max(face, band) + 0.05) / (Math.min(face, band) + 0.05);
      }
      return ratios;
    };
    return { v002: await measure('v002'), v012: await measure('v012') };
  }, themes);
  expect(Object.keys(results.v012)).toHaveLength(8);
  expect(Math.min(...Object.values(results.v002)), 'v002 최저 경계 대비').toBeLessThan(3);
  for (const [combo, ratio] of Object.entries(results.v012)) expect(ratio, `v012 ${combo}`).toBeGreaterThanOrEqual(3);
});

test('v012 트릴 끝 터미널은 대기·켜짐·실패 모두 가운데가 불투명 #888888이고 네 모서리가 투명한 납작한 마름모다', async ({ page }) => {
  await page.goto('/lab/note-assets?design=classic&version=v012');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const shapes = await page.evaluate(async () => {
    const result: Record<string, { center: number[]; top: number[]; corners: number[]; edgeAlpha: number }> = {};
    for (const name of ['terminal-trill-idle', 'terminal-trill', 'terminal-trill-failed']) {
      const image = new Image(); image.src = `/lab/skin-versions/classic/v012/skin/${name}.png`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const at = (x: number, y: number) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
      result[name] = {
        center: at(width / 2, height / 2),
        top: at(width / 2, 2),
        corners: [at(2, 2), at(width - 3, 2), at(2, height - 3), at(width - 3, height - 3)].map(pixel => pixel[3]),
        edgeAlpha: at(width / 4, height / 4)[3],
      };
    }
    return result;
  });
  for (const [name, shape] of Object.entries(shapes)) {
    expect(shape.center, `${name} 가운데`).toEqual([136, 136, 136, 255]);
    expect(shape.top, `${name} 위 꼭짓점 근처`).toEqual([136, 136, 136, 255]);
    expect(shape.corners, `${name} 모서리`).toEqual([0, 0, 0, 0]);
    expect(shape.edgeAlpha, `${name} 사선 경계`).toBeGreaterThan(0);
  }
  expect(shapes['terminal-trill']).toEqual(shapes['terminal-trill-idle']);
  expect(shapes['terminal-trill-failed']).toEqual(shapes['terminal-trill-idle']);
});
