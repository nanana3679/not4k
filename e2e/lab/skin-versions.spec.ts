import { test, expect } from '@playwright/test';
import { CLASSIC_SKIN_VERSIONS } from '../../src/lab/classicSkinVersions';

test('현재→v001→v002→v003→v004→v005→v006→v007→v008→현재 전환에서 차트를 유지하고 재생기·에셋 랙·URL을 같은 버전으로 바꾼다', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('not4k-settings', JSON.stringify({ state: { settings: { skinId: 'classic' } }, version: 0 })));
  await page.goto('/lab/note-assets?design=classic');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const settings = await page.evaluate(() => localStorage.getItem('not4k-settings'));
  expect(settings).toContain('classic');
  await page.getByRole('button', { name: '독립 롱', exact: true }).click();
  for (const version of ['v001', 'v002', 'v003', 'v004', 'v005', 'v006', 'v007', 'v008']) {
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
  await expect(page.getByLabel('버전', { exact: true })).toHaveValue('v007');
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

test('v006 포인트는 v005 양끝 안쪽의 검은 세로띠를 같은 행의 중앙 면 밝기·고유색으로 덮고 나머지 픽셀은 보존한다', async ({ page }) => {
  await page.goto('/lab/note-assets?design=classic&version=v006');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const results = await page.evaluate(async () => {
    const pixels = async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    // 212×40 포인트에서 흰 세로 레일 안쪽의 어두운 패널(원본 SVG x118~221)과 좌우 대칭 구간.
    const bandColumns = [[24, 46], [166, 188]];
    const editableColumns = [[23, 47], [165, 189]];
    const centerX = 106;
    const inside = (ranges: number[][], x: number) => ranges.some(([from, to]) => x >= from && x < to);
    const luminance = (data: Uint8ClampedArray, i: number) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const measure = (image: ImageData) => {
      let darkBand = 0, maxBandDelta = 0;
      for (let y = 8; y < 36; y++) for (let x = 0; x < image.width; x++) {
        if (!inside(bandColumns, x)) continue;
        const i = (y * image.width + x) * 4;
        const lum = luminance(image.data, i);
        if (lum < 65) darkBand++;
        maxBandDelta = Math.max(maxBandDelta, Math.abs(lum - luminance(image.data, (y * image.width + centerX) * 4)));
      }
      return { darkBand, maxBandDelta };
    };
    return Promise.all(['single', 'double'].map(async kind => {
      const before = await pixels(`/lab/skin-versions/classic/v005/skin/note-${kind}.png`);
      const after = await pixels(`/lab/skin-versions/classic/v006/skin/note-${kind}.png`);
      let changedOutsideBand = 0;
      for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) {
        const i = (y * after.width + x) * 4;
        if (!inside(editableColumns, x) && [0, 1, 2, 3].some(c => before.data[i + c] !== after.data[i + c])) changedOutsideBand++;
      }
      const i = (20 * after.width + 35) * 4;
      const [r, g, b] = after.data.slice(i, i + 3);
      return { kind, width: after.width, height: after.height, before: measure(before), after: measure(after), changedOutsideBand, hue: kind === 'single' ? b > r + 60 : r > b + 60 };
    }));
  });
  for (const result of results) {
    expect(result.width, result.kind).toBe(212);
    expect(result.height, result.kind).toBe(40);
    expect(result.before.darkBand, `${result.kind} v005에는 내부 검은 세로띠가 있다`).toBeGreaterThan(100);
    expect(result.before.maxBandDelta, result.kind).toBeGreaterThan(100);
    expect(result.after.darkBand, `${result.kind} v006 내부 띠`).toBe(0);
    expect(result.after.maxBandDelta, `${result.kind} v006 띠와 중앙 면의 밝기 차`).toBeLessThanOrEqual(2);
    expect(result.changedOutsideBand, `${result.kind} 중앙 면·흰 레일·바깥 금속 면 보존`).toBe(0);
    expect(result.hue, `${result.kind} 고유색 유지`).toBe(true);
  }
});

test('v007은 싱글·더블 포인트와 싱글·더블의 대기·켜짐 바디 8개 조합에서 면 명도 대비 3:1 이상이고 v006은 미달한다', async ({ page }) => {
  await page.goto('/lab/note-assets?design=classic&version=v007');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const results = await page.evaluate(async () => {
    const pixels = async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const linear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    // 영역 평균 상대 휘도(WCAG Y). 포인트는 212×40의 중앙 면, 바디는 좌우 10%를 뺀 전체 타일.
    const meanLuminance = (image: ImageData, x0: number, y0: number, x1: number, y1: number) => {
      let sum = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * image.width + x) * 4;
        sum += 0.2126 * linear(image.data[i]) + 0.7152 * linear(image.data[i + 1]) + 0.0722 * linear(image.data[i + 2]);
      }
      return sum / ((x1 - x0) * (y1 - y0));
    };
    const faceHue = (image: ImageData) => {
      let r = 0, b = 0;
      for (let y = 10; y < 32; y++) for (let x = 50; x < 162; x++) { const i = (y * image.width + x) * 4; r += image.data[i]; b += image.data[i + 2]; }
      return r > b ? 'gold' : 'blue';
    };
    const measure = async (version: string) => {
      const base = `/lab/skin-versions/classic/${version}/skin`;
      const ratios: Record<string, number> = {};
      const hues: Record<string, string> = {};
      for (const point of ['single', 'double']) {
        const note = await pixels(`${base}/note-${point}.png`);
        hues[point] = faceHue(note);
        const face = meanLuminance(note, 50, 10, 162, 32);
        for (const body of ['single', 'double']) for (const state of ['', '-held']) {
          const tile = await pixels(`${base}/body-${body}${state}.png`);
          const luminance = meanLuminance(tile, Math.floor(tile.width * 0.1), 0, Math.floor(tile.width * 0.9), tile.height);
          ratios[`${point}→${body}${state || '-idle'}`] = (Math.max(face, luminance) + 0.05) / (Math.min(face, luminance) + 0.05);
        }
      }
      return { ratios, hues };
    };
    return { v006: await measure('v006'), v007: await measure('v007') };
  });
  expect(Object.keys(results.v007.ratios)).toHaveLength(8);
  expect(Math.min(...Object.values(results.v006.ratios)), 'v006 최저 대비').toBeLessThan(3);
  for (const [combo, ratio] of Object.entries(results.v007.ratios)) expect(ratio, `v007 ${combo}`).toBeGreaterThanOrEqual(3);
  expect(results.v007.hues).toEqual({ single: 'blue', double: 'gold' });
});

test('v008은 렌더러와 같은 배치로 합성했을 때 포인트 경계에 맞닿은 바디 2px 띠와의 대비가 8개 조합 모두 3:1 이상이고 v006은 미달한다', async ({ page }) => {
  await page.goto('/lab/note-assets?design=classic&version=v008');
  await expect(page.getByText('PLAYER READY')).toBeVisible();
  const themes = Object.fromEntries(['v006', 'v008'].map(id => {
    const theme = CLASSIC_SKIN_VERSIONS.find(version => version.id === id)!.manifest.theme;
    return [id, { pointShadow: theme.pointShadow ?? null, contact: theme.pointContactShadow ?? null }];
  }));
  expect(themes.v008.contact).toEqual({ above: 5, below: 5 });
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
    return { v006: await measure('v006'), v008: await measure('v008') };
  }, themes);
  expect(Object.keys(results.v008)).toHaveLength(8);
  expect(Math.min(...Object.values(results.v006)), 'v006 최저 경계 대비').toBeLessThan(3);
  for (const [combo, ratio] of Object.entries(results.v008)) expect(ratio, `v008 ${combo}`).toBeGreaterThanOrEqual(3);
});
