import { expect, test } from '@playwright/test';

const route = '/lab/images/classic-approved-states-20261025/';

test('싱글·더블 꼭짓점의 주변 면을 고쳐도 원본 가로 띠·대각선 빛의 위치·아래 사선·알파는 그대로다', async ({ page }) => {
  await page.goto(route);
  await page.locator('.jump').getByRole('link', { name: '면과 직선 복원' }).click();
  await expect(page).toHaveURL(/#release-straight-junctions$/);
  const section = page.locator('#release-straight-junctions');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(2);
    await expect(comparison.locator('[data-variant="previous"] .palette-release').first()).toHaveAttribute('src', `assets/release-${kind}-clean-junctions.png`);
    await expect(comparison.locator('[data-variant="candidate"] nav a')).toHaveCount(3);
  }
  const results = await page.evaluate(async () => {
    const results = [];
    for (const kind of ['single', 'double']) for (const suffix of ['.png', '@2x.png', '.svg']) {
      const scale = suffix === '.png' ? 1 : 2, width = 200 * scale, height = 40 * scale;
      const pixels = async (file: string) => {
        const image = new Image(); image.src = `assets/${file}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const base = `release-${kind}-palette-body${kind === 'double' ? '-dual-ends' : ''}`;
      const original = await pixels(base + (scale === 1 ? '.png' : '@2x.png'));
      const candidate = await pixels(`release-${kind}-straight-junctions${suffix}`);
      let outsideDifference = 0, alphaDifference = 0, rimDifference = 0, changedPixels = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        alphaDifference = Math.max(alphaDifference, Math.abs(candidate[i + 3] - original[i + 3]));
        const inPatch = y >= 15 * scale && y < Math.ceil(49 * scale / 2) && [[82, 112], [288, 318]].some(([start, end]) => x >= start * scale / 2 && x < end * scale / 2);
        for (let c = 0; c < 3; c++) {
          const difference = Math.abs(candidate[i + c] - original[i + c]);
          if (!inPatch) outsideDifference = Math.max(outsideDifference, difference);
          if (difference > 20) changedPixels++;
        }
      }
      // Follow the original bright diagonal, independently of the compositing mask.
      for (const side of [0, 1]) for (let y = 15 * scale; y < 33 * scale; y++) {
        const index = (x: number) => (y * width + (side ? width - 1 - x : x)) * 4;
        const brightness = (x: number) => Math.min(...original.slice(index(x), index(x) + 3));
        let peak = Math.floor(97 * scale / 2);
        for (let x = peak; x < Math.ceil(125 * scale / 2); x++) if (brightness(x) > brightness(peak)) peak = x;
        for (let dx = 0; dx <= scale; dx++) for (let c = 0; c < 3; c++) rimDifference = Math.max(rimDifference, Math.abs(candidate[index(peak + dx) + c] - original[index(peak + dx) + c]));
      }
      results.push({ kind, suffix, outsideDifference, alphaDifference, rimDifference, changedPixels });
    }
    return results;
  });
  for (const result of results) {
    const label = result.kind + result.suffix;
    expect(result.outsideDifference, label).toBe(0);
    expect(result.alphaDifference, label).toBe(0);
    // Canvas rounds the feathered edge to 8-bit channels; allow only that single-level difference.
    expect(result.rimDifference, label).toBeLessThanOrEqual(1);
    expect(result.changedPixels, label).toBeGreaterThan(20);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('싱글·더블의 기존 교차 사선을 면의 색으로 메우고 접점 밖 픽셀과 알파를 보존한다', async ({ page }) => {
  await page.goto(route);
  await page.locator('.jump').getByRole('link', { name: '세 면의 꼭짓점' }).click();
  await expect(page).toHaveURL(/#release-clean-junctions$/);
  const section = page.locator('#release-clean-junctions');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(2);
    await expect(comparison.locator('[data-variant="previous"] .palette-release').first()).toHaveAttribute('src', `assets/release-${kind}-forked-junctions.png`);
    await expect(comparison.locator('[data-variant="candidate"] nav a')).toHaveCount(3);
  }
  const results = await page.evaluate(async () => {
    const results = [];
    for (const kind of ['single', 'double']) for (const suffix of ['.png', '@2x.png', '.svg']) {
      const scale = suffix === '.png' ? 1 : 2, width = 200 * scale, height = 40 * scale;
      const pixels = async (name: string, extension: string) => {
        const image = new Image(); image.src = `assets/release-${kind}-${name}${extension}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const before = await pixels('forked-junctions', scale === 1 ? '.png' : '@2x.png');
      const after = await pixels('clean-junctions', suffix);
      let outsideDifference = 0, alphaDifference = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        alphaDifference = Math.max(alphaDifference, Math.abs(after[i + 3] - before[i + 3]));
        const inPatch = y >= 13 * scale && y < 25 * scale && [[82, 109], [291, 318]].some(([start, end]) => x >= Math.floor(start * scale / 2) && x < Math.ceil(end * scale / 2));
        if (!inPatch) for (let c = 0; c < 3; c++) outsideDifference = Math.max(outsideDifference, Math.abs(after[i + c] - before[i + c]));
      }
      // Locate the old dark edge in each row, then verify it was filled, not merely crossed by a new highlight.
      const filledEdges = [];
      for (const side of [0, 1]) for (let y = 18 * scale; y <= Math.floor(43 * scale / 2); y++) {
        const luminance = (data: Uint8ClampedArray, x: number) => {
          const i = (y * width + (side ? width - 1 - x : x)) * 4;
          return .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
        };
        const x = Math.round((90 + (y * 2 / scale - 30) * .59) * scale / 2);
        let edgeX = x;
        for (let dx = -scale; dx <= scale; dx++) if (luminance(before, x + dx) < luminance(before, edgeX)) edgeX = x + dx;
        filledEdges.push(luminance(after, edgeX) - luminance(before, edgeX));
      }
      results.push({ kind, suffix, outsideDifference, alphaDifference, filledEdges });
    }
    return results;
  });
  for (const result of results) {
    const label = result.kind + result.suffix;
    expect(result.outsideDifference, label).toBe(0);
    expect(result.alphaDifference, label).toBe(0);
    for (const increase of result.filledEdges) expect(increase, label).toBeGreaterThan(20);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('아래 접점 분기는 위쪽 흰 띠·중앙 도안·알파를 유지하고 좌우 상승 경계에 새 밝은 선을 표시한다', async ({ page }) => {
  await page.goto(route);
  await page.locator('.jump').getByRole('link', { name: '아래 접점 분기' }).click();
  await expect(page).toHaveURL(/#release-forked-junctions$/);
  const section = page.locator('#release-forked-junctions');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(2);
    await expect(comparison.locator('[data-variant="previous"] .palette-release').first()).toHaveAttribute('src', `assets/release-${kind}-stepped-junctions.png`);
    await expect(comparison.locator('[data-variant="candidate"] nav a')).toHaveCount(3);
  }
  const results = await page.evaluate(async () => {
    const results = [];
    for (const kind of ['single', 'double']) for (const suffix of ['.png', '@2x.png', '.svg']) {
      const scale = suffix === '.png' ? 1 : 2, width = 200 * scale, height = 40 * scale;
      const pixels = async (file: string) => {
        const image = new Image(); image.src = `assets/${file}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const originalName = kind === 'single' ? 'release-single-palette-body' : 'release-double-palette-body-dual-ends';
      const original = await pixels(originalName + (scale === 1 ? '.png' : '@2x.png'));
      const candidate = await pixels(`release-${kind}-forked-junctions${suffix}`);
      let outsideDifference = 0, alphaDifference = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        alphaDifference = Math.max(alphaDifference, Math.abs(candidate[i + 3] - original[i + 3]));
        const inPatch = y >= 16 * scale && y < Math.ceil(79 * scale / 2) && [[87, 130], [270, 313]].some(([start, end]) => x >= Math.floor(start * scale / 2) && x < Math.ceil(end * scale / 2));
        if (!inPatch) for (let c = 0; c < 3; c++) outsideDifference = Math.max(outsideDifference, Math.abs(candidate[i + c] - original[i + c]));
      }
      // Check the previously missing rising edges below the white bars, not changes to the caps above.
      const risingEdges = [0, 0];
      for (let y = 18 * scale; y < 24 * scale; y++) for (let x = 49 * scale; x < Math.ceil(109 * scale / 2); x++) for (let side = 0; side < 2; side++) {
        const i = (y * width + (side ? width - 1 - x : x)) * 4;
        const addedWhite = Math.min(candidate[i], candidate[i + 1], candidate[i + 2]) - Math.min(original[i], original[i + 1], original[i + 2]);
        if (addedWhite > 25) risingEdges[side]++;
      }
      results.push({ kind, suffix, outsideDifference, alphaDifference, risingEdges });
    }
    return results;
  });
  for (const result of results) {
    const label = result.kind + result.suffix;
    expect(result.outsideDifference, label).toBe(0);
    expect(result.alphaDifference, label).toBe(0);
    for (const count of result.risingEdges) expect(count, label).toBeGreaterThanOrEqual(6);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('싱글·더블 단차 수정은 좌우 접점만 바꾸고 화살표·광선 끝 흰빛·알파를 PNG와 SVG에서 보존한다', async ({ page }) => {
  await page.goto(route);
  await page.locator('.jump').getByRole('link', { name: '단차 수정 전후' }).click();
  await expect(page).toHaveURL(/#release-stepped-junctions$/);
  const section = page.locator('#release-stepped-junctions');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(2);
    await expect(comparison.locator('.junction-crops svg')).toHaveCount(4);
    await expect(comparison.locator('[data-variant="candidate"] nav a')).toHaveCount(3);
  }
  const results = await page.evaluate(async () => {
    const results = [];
    for (const kind of ['single', 'double']) for (const suffix of ['.png', '@2x.png', '.svg']) {
      const scale = suffix === '.png' ? 1 : 2;
      const width = 200 * scale, height = 40 * scale;
      const pixels = async (file: string) => {
        const image = new Image(); image.src = `assets/${file}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const originalName = kind === 'single' ? 'release-single-palette-body' : 'release-double-palette-body-dual-ends';
      const original = await pixels(originalName + (scale === 1 ? '.png' : '@2x.png'));
      const candidate = await pixels(`release-${kind}-stepped-junctions${suffix}`);
      let outsideDifference = 0, alphaDifference = 0;
      const changed = [0, 0];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const difference = Math.max(...[0, 1, 2].map(c => Math.abs(candidate[i + c] - original[i + c])));
        alphaDifference = Math.max(alphaDifference, Math.abs(candidate[i + 3] - original[i + 3]));
        const side = [[82, 127], [273, 318]].findIndex(([start, end]) => x >= Math.floor(start * scale / 2) && x < Math.ceil(end * scale / 2));
        if (side >= 0 && y >= 11 * scale && y < 33 * scale) {
          if (difference > 8) changed[side]++;
        } else outsideDifference = Math.max(outsideDifference, difference);
      }
      results.push({ kind, suffix, outsideDifference, alphaDifference, changed });
    }
    return results;
  });
  for (const result of results) {
    const label = result.kind + result.suffix;
    expect(result.outsideDifference, label).toBe(0);
    expect(result.alphaDifference, label).toBe(0);
    for (const count of result.changed) expect(count, label).toBeGreaterThan(20);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('단차 접점 안내에서 더블 도안의 좌우 접점과 한 경계·두 경계 연결을 모바일에서도 확인한다', async ({ page }) => {
  await page.goto(route);
  await page.locator('.jump').getByRole('link', { name: '단차 접점' }).click();
  await expect(page).toHaveURL(/#release-junction$/);
  const section = page.locator('#release-junction');
  await expect(section.getByRole('img', { name: '가로 띠와 중앙 경사 테두리의 좌우 접점', exact: true })).toBeVisible();
  await expect(section.getByRole('img', { name: '수평선 끝에서 아래로만 꺾이는 연결' })).toBeVisible();
  await expect(section.getByRole('img', { name: '수평선 끝에서 위아래 두 경계로 갈라져 작은 옆면이 생기는 연결' })).toBeVisible();
  const source = await section.locator('image').getAttribute('href');
  expect((await page.request.get(new URL(source!, page.url()).href)).ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('더블 릴리즈는 광선 x=84·116에 두 밝은 지점을 만들고 중앙 띠 밖 도안과 알파를 유지한다', async ({ page }) => {
  await page.goto(route);
  await page.locator('.jump').getByRole('link', { name: '더블 빛 두 지점' }).click();
  await expect(page).toHaveURL(/#release-beam-ends$/);
  const section = page.locator('#release-beam-ends');
  await expect(section.locator('article')).toHaveCount(2);
  await expect(section.locator('[data-variant="candidate"] nav a')).toHaveCount(3);
  const comparisons = await page.evaluate(async () => {
    const results = [];
    for (const suffix of ['.png', '@2x.png', '.svg']) {
      const scale = suffix === '.png' ? 1 : 2;
      const width = 200 * scale, height = 40 * scale;
      const pixels = async (file: string) => {
        const image = new Image(); image.src = `assets/${file}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const original = await pixels(`release-double-palette-body${scale === 1 ? '.png' : '@2x.png'}`);
      const candidate = await pixels(`release-double-palette-body-dual-ends${suffix}`);
      let outsideDifference = 0, alphaDifference = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        alphaDifference = Math.max(alphaDifference, Math.abs(candidate[i + 3] - original[i + 3]));
        if (x < 65 * scale || x >= 135 * scale || y < 26 * scale || y >= 39 * scale) {
          for (let c = 0; c < 3; c++) outsideDifference = Math.max(outsideDifference, Math.abs(candidate[i + c] - original[i + c]));
        }
      }
      // White in the gold rim has a higher minimum RGB channel than its gold surroundings.
      const whiteness = (data: Uint8ClampedArray, x: number) => {
        let total = 0;
        for (let y = 29 * scale; y < 37 * scale; y++) {
          const i = (y * width + x) * 4;
          total += Math.min(data[i], data[i + 1], data[i + 2]);
        }
        return total / (8 * scale);
      };
      const peaks = [84, 116].map(center => {
        let peak = { x: 0, value: 0 };
        for (let x = (center - 6) * scale; x <= (center + 6) * scale; x++) {
          const value = whiteness(candidate, x);
          if (value > peak.value) peak = { x: x / scale, value };
        }
        return { ...peak, expected: center };
      });
      results.push({ suffix, outsideDifference, alphaDifference, peaks, center: whiteness(candidate, 100 * scale), oldCenter: whiteness(original, 100 * scale) });
    }
    return results;
  });
  for (const result of comparisons) {
    expect(result.outsideDifference, result.suffix).toBe(0);
    expect(result.alphaDifference, result.suffix).toBe(0);
    expect(result.center).toBeLessThan(result.oldCenter - 30);
    for (const peak of result.peaks) {
      expect(Math.abs(peak.x - peak.expected), result.suffix).toBeLessThanOrEqual(1);
      expect(peak.value).toBeGreaterThan(result.center + 30);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('릴리즈와 바디 색 비교는 원래 포인트·바디 위에 원본과 바디색 릴리즈만 바꿔 표시한다', async ({ page }) => {
  await page.goto(route);
  await page.locator('.jump').getByRole('link', { name: '릴리즈·바디 색' }).click();
  await expect(page).toHaveURL(/#release-body-color$/);
  const section = page.locator('#release-body-color');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(2);
    const point = kind === 'single' ? 'note-single' : 'note-double-anodized-contrast-070';
    const idleBody = kind === 'single' ? 'body-single' : 'body-double-center-dual-beam';
    for (const variant of ['original', 'candidate']) {
      const card = comparison.locator(`[data-variant="${variant}"]`);
      const release = variant === 'original' ? `release-${kind}-chevron-triple-tight-large` : `release-${kind}-palette-body`;
      const sources = await card.evaluate(element => ({
        points: [...element.querySelectorAll('.palette-point')].map(image => image.getAttribute('src')),
        releases: [...element.querySelectorAll('.palette-release')].map(image => image.getAttribute('src')),
        bodies: [...element.querySelectorAll<HTMLElement>('.palette-body')].map(body => body.style.backgroundImage.match(/[^/]+\.png/)?.[0]),
      }));
      expect(sources.points).toEqual(Array(3).fill(`assets/${point}.png`));
      expect(sources.releases).toEqual(Array(3).fill(`assets/${release}.png`));
      expect(sources.bodies).toEqual([`body-${kind}-held`, idleBody, `body-${kind}-held`].map(file => `${file}.png`));
      await expect(card.locator('nav a')).toHaveCount(3);
      await expect(card.locator('nav a').first()).toHaveAttribute('href', `assets/${release}.png`);
    }
  }
  await section.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('넓은 중앙 면은 어두워지고 5번 100%·50%·0%는 같은 레이어의 알파만 바뀌어 폭과 바탕을 유지한다', async ({ page }) => {
  await page.goto(route + '#release-material-corrected');
  const section = page.locator('#release-material-corrected');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(3);
    await expect(comparison.locator('article nav a')).toHaveCount(9);
  }
  const results = await page.evaluate(async () => {
    const pixels = async (file: string) => {
      const image = new Image(); image.src = file; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 80;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 400, 80);
      return context.getImageData(0, 0, 400, 80).data;
    };
    const results = [];
    for (const kind of ['single', 'double']) {
      const prefix = `assets/release-${kind}-material-wide-light-`;
      const sources = await Promise.all(['100', '050', '000'].map(async id => (await fetch(prefix + id + '.svg')).text()));
      const normalized = sources.map(source => {
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
        doc.querySelector('[data-release-white-light]')!.setAttribute('opacity', '1');
        return new XMLSerializer().serializeToString(doc);
      });
      const originalSymbols = new DOMParser().parseFromString(await (await fetch(`assets/release-${kind}-chevron-triple-tight-large.svg`)).text(), 'image/svg+xml');
      const candidateSymbols = new DOMParser().parseFromString(sources[0], 'image/svg+xml');
      const symbols = (doc: Document) => [...doc.querySelectorAll('[data-release-symbol]')].map(node => new XMLSerializer().serializeToString(node));
      for (const suffix of ['.png', '@2x.png', '.svg']) {
        const [full, half, zero, original] = await Promise.all([
          ...['100', '050', '000'].map(id => pixels(prefix + id + suffix)),
          pixels(`assets/release-${kind}-chevron-triple-tight-large${suffix === '.png' ? '.png' : '@2x.png'}`),
        ]);
        let midpointError = 0, alphaDifference = 0, otherPartsDifference = 0, restoredStripeError = 0;
        let darkIntensity = 0, originalIntensity = 0;
        for (let y = 0; y < 80; y++) for (let x = 0; x < 400; x++) {
          const i = (y * 400 + x) * 4;
          alphaDifference = Math.max(alphaDifference, Math.abs(full[i + 3] - half[i + 3]), Math.abs(full[i + 3] - zero[i + 3]));
          for (let c = 0; c < 3; c++) {
            midpointError = Math.max(midpointError, Math.abs(half[i + c] - (full[i + c] + zero[i + c]) / 2));
            if (x > 115 && x < 285 || y > 46 || y < 18) otherPartsDifference = Math.max(otherPartsDifference, Math.abs(full[i + c] - zero[i + c]));
            if (x >= 35 && x < 85 && y >= 25 && y < 30) restoredStripeError = Math.max(restoredStripeError, Math.abs(full[i + c] - original[i + c]));
          }
          if (x >= 128 && x < 144 && y >= 5 && y < 40) {
            darkIntensity += .2126 * half[i] + .7152 * half[i + 1] + .0722 * half[i + 2];
            originalIntensity += .2126 * original[i] + .7152 * original[i + 1] + .0722 * original[i + 2];
          }
        }
        results.push({ kind, suffix, normalized, originalSymbols: symbols(originalSymbols), candidateSymbols: symbols(candidateSymbols),
          midpointError, alphaDifference, otherPartsDifference, restoredStripeError, darkRatio: darkIntensity / originalIntensity });
      }
    }
    return results;
  });
  for (const result of results) {
    const label = result.kind + result.suffix;
    expect(result.normalized[0]).toBe(result.normalized[1]);
    expect(result.normalized[0]).toBe(result.normalized[2]);
    expect(result.candidateSymbols).toEqual(result.originalSymbols);
    // Layer alpha, SVG filtering and PNG resampling each round to 8-bit values.
    expect(result.midpointError, label).toBeLessThanOrEqual(3);
    expect(result.alphaDifference, label).toBe(0);
    expect(result.otherPartsDifference, label).toBe(0);
    expect(result.restoredStripeError, label).toBeLessThanOrEqual(2);
    expect(result.darkRatio, label).toBeLessThan(.45);
  }
  await section.locator('summary').first().click();
  await expect(section.getByAltText('싱글 릴리즈 원본')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('릴리즈 재질 수정은 3번 홈과 5번 빛을 낮추고 4번 명암·원래 꺾쇠와 바디 조합을 유지한다', async ({ page }) => {
  await page.goto(route + '#release-material');
  const section = page.locator('#release-material');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(2);
    await expect(comparison.locator('[data-variant="candidate"] nav a')).toHaveCount(3);
    const shared = await comparison.evaluate(element => [...element.querySelectorAll('article')].map(article => ({
      points: [...article.querySelectorAll('.palette-point')].map(image => image.getAttribute('src')),
      bodies: [...article.querySelectorAll('.palette-body')].map(body => body.getAttribute('style')),
    })));
    expect(shared[0]).toEqual(shared[1]);
  }
  const results = await page.evaluate(async () => {
    const pixels = async (file: string) => {
      const image = new Image(); image.src = file; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 80;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 400, 80);
      return context.getImageData(0, 0, 400, 80).data;
    };
    const values = (data: Uint8ClampedArray, [x, y, width, height]: number[]) => {
      const result: number[] = [];
      for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) {
        const i = (row * 400 + col) * 4;
        result.push(.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]);
      }
      return result;
    };
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const results = [];
    for (const kind of ['single', 'double']) for (const suffix of ['.png', '@2x.png', '.svg']) {
      const file = `assets/release-${kind}-material-body${suffix}`;
      const original = await pixels(`assets/release-${kind}-chevron-triple-tight-large${suffix === '.png' ? '.png' : '@2x.png'}`);
      const candidate = await pixels(file);
      let alphaDifference = 0, preservedDifference = 0;
      for (let i = 3; i < original.length; i += 4) alphaDifference = Math.max(alphaDifference, Math.abs(original[i] - candidate[i]));
      for (const [x, y, width, height] of [[145, 4, 110, 47], [33, 53, 62, 19], [305, 53, 62, 19], [2, 25, 8, 20], [198, 66, 4, 2]]) {
        for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) for (let c = 0; c < 3; c++) {
          const i = (row * 400 + col) * 4 + c;
          preservedDifference = Math.max(preservedDifference, Math.abs(original[i] - candidate[i]));
        }
      }
      const upper = values(candidate, [40, 4, 40, 17]);
      results.push({ file, alphaDifference, preservedDifference, upperRange: Math.max(...upper) - Math.min(...upper),
        channelRatio: mean(values(candidate, [145, 64, 20, 5])) / mean(values(original, [145, 64, 20, 5])),
        stripeRatio: mean(values(candidate, [35, 24, 50, 8])) / mean(values(original, [35, 24, 50, 8])),
      });
    }
    return results;
  });
  for (const result of results) {
    expect(result.alphaDifference, result.file).toBe(0);
    expect(result.preservedDifference, result.file).toBe(0);
    expect(result.channelRatio, result.file).toBeLessThan(.4);
    expect(result.stripeRatio, result.file).toBeLessThan(.9);
    expect(result.upperRange, result.file).toBeGreaterThan(30);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('릴리즈 1～8번을 선택하면 싱글·더블의 같은 부위가 강조되고 전체 보기에서 원래 번호가 돌아온다', async ({ page }) => {
  await page.goto(route + '#release-parts');
  const section = page.locator('#release-parts');
  await expect(section.getByRole('radio')).toHaveCount(9);
  for (const kind of ['single', 'double']) {
    const row = section.locator(`[data-kind="${kind}"]`);
    await expect(row.locator('.release-part-callout')).toHaveCount(8);
    await expect(row.locator('.release-parts-original img')).toHaveAttribute('src', `assets/release-${kind}-chevron-triple-tight-large@2x.png`);
    await expect(row.locator('svg image')).toHaveAttribute('href', `assets/release-${kind}-chevron-triple-tight-large@2x.png`);
  }
  for (let id = 1; id <= 8; id++) {
    await section.locator(`input[value="${id}"]`).check();
    for (const kind of ['single', 'double']) {
      const row = section.locator(`[data-kind="${kind}"]`);
      await expect(row.locator(`.release-part-region[data-part="${id}"]`)).toHaveCSS('opacity', '1');
      await expect(row.locator(`.release-part-callout[data-part="${id}"]`)).toHaveCSS('opacity', '1');
      await expect(row.locator(`.release-part-callout:not([data-part="${id}"])`).first()).toHaveCSS('opacity', '0.2');
    }
  }
  await section.getByRole('radio', { name: '전체 보기' }).check();
  for (const callout of await section.locator('.release-part-callout').all()) await expect(callout).toHaveCSS('opacity', '1');
  for (const region of await section.locator('.release-part-region').all()) await expect(region).toHaveCSS('opacity', '0');
  await section.getByRole('radio', { name: '전체 보기' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(section.locator('input[value="1"]')).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(section.locator('input[value="2"]')).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await section.locator('input[value="5"]').check();
  await expect(section.locator('input[value="5"]')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('중간 강도 2안은 포인트 원본을 유지하고 바디·릴리즈 색을 원본과 전체 변환 사이에서 조절한다', async ({ page }) => {
  await page.goto(route + '#palette-balance');
  const section = page.locator('#palette-balance');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(3);
    const expectedPoint = kind === 'single' ? 'assets/note-single.png' : 'assets/note-double-anodized-contrast-070.png';
    for (const point of await comparison.locator('.palette-point').all()) await expect(point).toHaveAttribute('src', expectedPoint);
    for (const balance of ['gentle', 'unified']) {
      await comparison.locator(`[data-balance="${balance}"] summary`).click();
      await expect(comparison.locator(`[data-balance="${balance}"] nav a`)).toHaveCount(9);
    }
  }
  const results = await page.evaluate(async () => {
    const pixels = async (file: string, scale: number) => {
      const image = new Image(); image.src = file; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 200 * scale; canvas.height = 40 * scale;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const results = [];
    for (const kind of ['single', 'double']) for (const role of ['body', 'body-held', 'release']) {
      const originalName = role === 'body' ? (kind === 'single' ? 'body-single' : 'body-double-center-dual-beam')
        : role === 'body-held' ? `body-${kind}-held` : `release-${kind}-chevron-triple-tight-large`;
      for (const balance of ['gentle', 'unified']) for (const suffix of ['.png', '@2x.png', '.svg']) {
        const scale = suffix === '.png' ? 1 : 2;
        const amount = role === 'release' ? (balance === 'gentle' ? .45 : .65) : (balance === 'gentle' ? .2 : .35);
        const file = `assets/${role}-${kind}-balance-${balance}${suffix}`;
        const original = await pixels(`assets/${originalName}${scale === 1 ? '.png' : '.svg'}`, scale);
        const full = await pixels(`assets/${role}-${kind}-palette-point${suffix}`, scale);
        const candidate = await pixels(file, scale);
        let maxAlphaDifference = 0, maxBlendDifference = 0, maxIntensityDifference = 0, changedPixels = 0;
        for (let i = 0; i < original.length; i += 4) {
          maxAlphaDifference = Math.max(maxAlphaDifference, Math.abs(candidate[i + 3] - original[i + 3]));
          for (let channel = 0; channel < 3; channel++) {
            const expected = original[i + channel] * (1 - amount) + full[i + channel] * amount;
            maxBlendDifference = Math.max(maxBlendDifference, Math.abs(candidate[i + channel] - expected));
          }
          maxIntensityDifference = Math.max(maxIntensityDifference, Math.abs([.2126, .7152, .0722].reduce((sum, weight, channel) => sum + weight * (candidate[i + channel] - original[i + channel]), 0)));
          if (Math.max(...[0, 1, 2].map(channel => Math.abs(candidate[i + channel] - original[i + channel]))) > 3) changedPixels++;
        }
        results.push({ file, maxAlphaDifference, maxBlendDifference, maxIntensityDifference, changedPixels });
      }
    }
    return results;
  });
  expect(results).toHaveLength(36);
  for (const row of results) {
    expect(row.maxAlphaDifference, row.file).toBe(0);
    expect(row.maxBlendDifference, row.file).toBeLessThanOrEqual(3);
    expect(row.maxIntensityDifference, row.file).toBeLessThanOrEqual(3);
    expect(row.changedPixels, row.file).toBeGreaterThan(100);
  }
  for (const width of [820, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test('색 기준 3안은 기준 에셋을 유지하고 나머지 포인트·바디·릴리즈의 크기와 명암 및 알파를 보존한다', async ({ page }) => {
  await page.goto(route + '#palette-anchors');
  const section = page.locator('#palette-anchors');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(4);
    for (const anchor of ['point', 'release', 'body']) {
      const referenceSelector = anchor === 'body' ? '.palette-body' : `.palette-${anchor}`;
      const attribute = anchor === 'body' ? 'style' : 'src';
      const original = comparison.locator(`[data-anchor="original"] ${referenceSelector}`);
      const candidate = comparison.locator(`[data-anchor="${anchor}"] ${referenceSelector}`);
      expect(await candidate.evaluateAll((elements, key) => elements.map(element => element.getAttribute(key)), attribute))
        .toEqual(await original.evaluateAll((elements, key) => elements.map(element => element.getAttribute(key)), attribute));
      await comparison.locator(`[data-anchor="${anchor}"] summary`).click();
      await expect(comparison.locator(`[data-anchor="${anchor}"] nav`)).toHaveCount(4);
    }
  }
  const results = await page.evaluate(async () => {
    const pixels = async (file: string, width: number, scale: number) => {
      const image = new Image(); image.src = file; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = 40 * scale;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const results = [];
    for (const kind of ['single', 'double']) {
      const point = kind === 'single' ? 'note-single' : 'note-double-anodized-contrast-070';
      const body = kind === 'single' ? 'body-single' : 'body-double-center-dual-beam';
      const cases = [
        { candidate: `body-${kind}-palette-point`, original: body, width: 200 },
        { candidate: `body-held-${kind}-palette-point`, original: `body-${kind}-held`, width: 200 },
        { candidate: `note-${kind}-palette-release`, original: point, width: 212 },
        { candidate: `body-${kind}-palette-release`, original: body, width: 200 },
        { candidate: `body-held-${kind}-palette-release`, original: `body-${kind}-held`, width: 200 },
        { candidate: `note-${kind}-palette-body`, original: point, width: 212 },
        { candidate: `release-${kind}-palette-body`, original: `release-${kind}-chevron-triple-tight-large`, width: 200 },
      ];
      for (const item of cases) for (const suffix of ['.png', '@2x.png', '.svg']) {
        const scale = suffix === '.png' ? 1 : 2;
        const original = await pixels(`assets/${item.original}${scale === 1 ? '.png' : '.svg'}`, item.width, scale);
        const candidate = await pixels(`assets/${item.candidate}${suffix}`, item.width, scale);
        let maxAlphaDifference = 0, maxIntensityDifference = 0, changedPixels = 0;
        for (let i = 0; i < original.length; i += 4) {
          maxAlphaDifference = Math.max(maxAlphaDifference, Math.abs(original[i + 3] - candidate[i + 3]));
          // Premultiplied color avoids amplifying rounding in nearly transparent outline pixels.
          const difference = Math.abs([.2126, .7152, .0722].reduce((sum, weight, channel) => sum + weight * (original[i + channel] * original[i + 3] - candidate[i + channel] * candidate[i + 3]) / 255, 0));
          maxIntensityDifference = Math.max(maxIntensityDifference, difference);
          if (Math.max(...[0, 1, 2].map(channel => Math.abs(original[i + channel] - candidate[i + channel]))) > 5) changedPixels++;
        }
        results.push({ file: item.candidate + suffix, maxAlphaDifference, maxIntensityDifference, changedPixels });
      }
    }
    return results;
  });
  expect(results).toHaveLength(42);
  for (const result of results) {
    expect(result.maxAlphaDifference, result.file).toBeLessThanOrEqual(1);
    expect(result.maxIntensityDifference, result.file).toBeLessThanOrEqual(3);
    expect(result.changedPixels, result.file).toBeGreaterThan(100);
  }
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test('릴리즈 팔레트 전후는 같은 포인트·바디를 쓰고 모든 PNG·SVG에서 원래 명암과 알파 및 3단 표식을 보존한다', async ({ page }) => {
  await page.goto(route + '#release-palette');
  const section = page.locator('#release-palette');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(2);
    await expect(comparison.locator('[data-variant="candidate"] nav a')).toHaveCount(3);
    const shared = await comparison.evaluate(element => [...element.querySelectorAll('article')].map(article => ({
      points: [...article.querySelectorAll('.palette-point')].map(image => image.getAttribute('src')),
      bodies: [...article.querySelectorAll('.palette-body')].map(body => body.getAttribute('style')),
    })));
    expect(shared[0]).toEqual(shared[1]);
  }
  const results = await page.evaluate(async () => {
    const pixels = async (file: string, scale: number) => {
      const image = new Image(); image.src = file; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 200 * scale; canvas.height = 40 * scale;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const results = [];
    for (const kind of ['single', 'double']) {
      const names = [`release-${kind}-chevron-triple-tight-large`, `release-${kind}-palette-point`];
      const docs = await Promise.all(names.map(async name => new DOMParser().parseFromString(await (await fetch(`assets/${name}.svg`)).text(), 'image/svg+xml')));
      const symbols = docs.map(doc => [...doc.querySelectorAll('[data-release-symbol]')].map(symbol => new XMLSerializer().serializeToString(symbol)));
      for (const suffix of ['.png', '@2x.png', '.svg']) {
        const scale = suffix === '.png' ? 1 : 2;
        const [original, candidate] = await Promise.all(names.map(name => pixels(`assets/${name}${suffix}`, scale)));
        let alphaChanges = 0, colorChanges = 0, maxIntensityDifference = 0;
        for (let i = 0; i < original.length; i += 4) {
          if (original[i + 3] !== candidate[i + 3]) alphaChanges++;
          if (Math.max(...[0, 1, 2].map(channel => Math.abs(original[i + channel] - candidate[i + channel]))) > 5) colorChanges++;
          const difference = Math.abs([.2126, .7152, .0722].reduce((sum, weight, channel) => sum + weight * (original[i + channel] - candidate[i + channel]), 0));
          maxIntensityDifference = Math.max(maxIntensityDifference, difference);
        }
        results.push({ kind, suffix, symbols, symbolParents: [...docs[1].querySelectorAll('[data-release-symbol]')].map(symbol => symbol.parentElement?.tagName),
          alphaChanges, colorFraction: colorChanges / (200 * 40 * scale ** 2), maxIntensityDifference });
      }
    }
    return results;
  });
  for (const row of results) {
    expect(row.symbols[0]).toEqual(row.symbols[1]);
    expect(row.symbolParents).toEqual(row.kind === 'single' ? ['svg'] : ['svg', 'svg']);
    expect(row.alphaChanges, `${row.kind} ${row.suffix}`).toBe(0);
    // 8-bit grayscale/filter output and symbol compositing each introduce rounding.
    expect(row.maxIntensityDifference, `${row.kind} ${row.suffix}`).toBeLessThanOrEqual(3);
    expect(row.colorFraction, `${row.kind} ${row.suffix}`).toBeGreaterThan(.6);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('3단 표식의 실제 알파는 위부터 100%·80%·50%이며 꼭짓점 x는 활성 광선 픽셀 중심과 일치한다', async ({ page }) => {
  await page.goto(route + '#release-symbol');
  const guides = page.locator('#release-symbol .release-beam-guide');
  await expect(guides.first()).toBeHidden();
  await page.getByLabel('광선 중심선 보기').check();
  await expect(guides.first()).toBeVisible();
  const result = await page.evaluate(async () => {
    const pixels = async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 80;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 400, 80);
      return context.getImageData(0, 0, 400, 80).data;
    };
    const rows = [];
    for (const kind of ['single', 'double']) {
      const body = await pixels(`assets/body-${kind}-held@2x.png`);
      const centers = []; let start = -1;
      for (let x = 0; x <= 400; x++) {
        const i = (40 * 400 + x) * 4;
        const white = x < 400 && Math.min(body[i], body[i + 1], body[i + 2]) > 245;
        if (white && start < 0) start = x;
        if (!white && start >= 0) { centers.push((start + x) / 4); start = -1; }
      }
      for (const variant of ['triple-fade', 'triple-tight', 'triple-tight-large']) {
        const text = await (await fetch(`assets/release-${kind}-chevron-${variant}.svg`)).text();
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const symbols = [...doc.querySelectorAll('[data-release-symbol]')];
        const symbolCenters = symbols.map(symbol => Number(symbol.getAttribute('transform')!.match(/translate\(([\d.]+)/)![1]));
        const layers = [...symbols[0].querySelectorAll('[data-chevron-layer]')];
        const sums: number[] = [];
        for (const layer of layers) {
          const isolated = symbols[0].cloneNode(false) as Element;
          isolated.append(layer.cloneNode(true));
          const source = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">${new XMLSerializer().serializeToString(isolated)}</svg>`;
          const data = await pixels('data:image/svg+xml,' + encodeURIComponent(source));
          let sum = 0; for (let i = 3; i < data.length; i += 4) sum += data[i];
          sums.push(sum);
        }
        rows.push({ kind, variant, centers, symbolCenters, ratios: sums.map(sum => sum / sums[0]) });
      }
    }
    return rows;
  });
  for (const row of result) {
    expect(row.centers).toEqual(row.kind === 'single' ? [100] : [84, 116]);
    expect(row.symbolCenters).toEqual(row.centers);
    expect(row.ratios).toHaveLength(3);
    for (const [i, alpha] of [1, 0.8, 0.5].entries()) expect(row.ratios[i]).toBeCloseTo(alpha, 2);
  }
  await page.getByLabel('광선 중심선 보기').uncheck();
  await expect(guides.first()).toBeHidden();
});

test('선택한 촘촘한 릴리즈 3단은 10% 확대 전후를 비교하고 광선 중심과 아이콘 밖 도안을 보존한다', async ({ page }) => {
  await page.goto(route + '#release-symbol');
  const section = page.locator('#release-symbol');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    await expect(comparison.locator('article')).toHaveCount(2);
    await expect(comparison.locator('.sustain-game img')).toHaveCount(2);
    for (const variant of ['triple-tight', 'triple-tight-large']) {
      await expect(comparison.locator(`[data-variant="${variant}"] nav a`)).toHaveCount(3);
    }
  }
  const results = await page.evaluate(async () => {
    const pixels = async (file: string, scale: number) => {
      const image = new Image(); image.src = file; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 200 * scale; canvas.height = 40 * scale;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const results = [];
    for (const kind of ['single', 'double']) for (const suffix of ['.png', '@2x.png', '.svg']) {
      const scale = suffix === '.png' ? 1 : 2;
      const original = await pixels(`assets/release-${kind}${suffix === '.svg' ? '@2x.png' : suffix}`, scale);
      for (const variant of ['thin', 'bold', 'ratio-a', 'ratio-b', 'ratio-c', 'triple-fade', 'triple-tight', 'triple-tight-large']) {
        const candidate = await pixels(`assets/release-${kind}-chevron-${variant}${suffix}`, scale);
        let changedCenter = 0, changedOutside = 0, changedLeft = 0, changedRight = 0, changedGap = 0;
        const bounds = kind === 'single' ? [80, 120] : [70, 130];
        for (let y = 0; y < 40 * scale; y++) for (let x = 0; x < 200 * scale; x++) {
          const i = (y * 200 * scale + x) * 4;
          const difference = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(candidate[i + channel] - original[i + channel])));
          if (difference <= 1) continue;
          if (x >= bounds[0] * scale && x < bounds[1] * scale && y >= 2 * scale && y < 31 * scale) changedCenter++;
          else changedOutside++;
          if (x < 100 * scale) changedLeft++; else changedRight++;
          if (x >= 98 * scale && x < 102 * scale) changedGap++;
        }
        results.push({ kind, variant, suffix, changedCenter: changedCenter / scale ** 2, changedOutside,
          changedLeft: changedLeft / scale ** 2, changedRight: changedRight / scale ** 2, changedGap });
      }
    }
    return results;
  });
  for (const result of results) {
    expect(result.changedCenter, `${result.kind} ${result.variant} ${result.suffix}`).toBeGreaterThan(100);
    expect(result.changedOutside, `${result.kind} ${result.variant} ${result.suffix}`).toBe(0);
    if (result.kind === 'double') {
      expect(result.changedLeft).toBeGreaterThan(100);
      expect(result.changedRight).toBeGreaterThan(100);
      expect(result.changedGap).toBe(0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('유지 확대안은 활성 바디 위에 싱글 36px·44px·더블 전체 64px로 보이며 SVG·PNG 모두 어두운 윤곽이 있다', async ({ page }) => {
  await page.goto(route + '#sustain-visibility');
  const section = page.locator('#sustain-visibility');
  for (const kind of ['single', 'double']) {
    const comparison = section.locator(`[data-kind="${kind}"]`);
    for (const variant of ['original', 'candidate', ...(kind === 'single' ? ['railCandidate'] : [])]) {
      const stage = comparison.locator(`[data-variant="${variant}"] [data-body-state="held"]`);
      await expect(stage).toHaveCSS('background-image', new RegExp(`body-${kind}-held\\.png`));
      await expect(stage).toHaveCSS('opacity', '1');
      await expect(stage.locator('img')).toHaveCSS('opacity', '1');
    }
  }
  const results = await page.evaluate(async () => {
    const results = [];
    for (const { kind, treatment, expectedWidth } of [
      { kind: 'single', treatment: 'channel', expectedWidth: 36 },
      { kind: 'single', treatment: 'rail', expectedWidth: 44 },
      { kind: 'double', treatment: 'channel', expectedWidth: 64 },
    ]) for (const suffix of ['.png', '@2x.png', '.svg']) {
      const scale = suffix === '.png' ? 1 : 2;
      const image = new Image(); image.src = `assets/sustain-${kind}-${treatment}-outline${suffix}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 200 * scale; canvas.height = 40 * scale;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let minX = canvas.width, maxX = -1, minY = canvas.height, maxY = -1, darkPixels = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 3] < 128) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (Math.max(data[i], data[i + 1], data[i + 2]) < 90) darkPixels++;
      }
      results.push({ kind, treatment, expectedWidth, suffix, width: (maxX - minX + 1) / scale, center: (minX + maxX + 1) / (2 * scale), minY: minY / scale, maxY: (maxY + 1) / scale, darkPixels: darkPixels / scale ** 2 });
    }
    return results;
  });
  for (const result of results) {
    expect(Math.abs(result.width - result.expectedWidth), `${result.kind} ${result.treatment} ${result.suffix}`).toBeLessThanOrEqual(1);
    expect(result.center).toBe(100);
    if (result.treatment === 'rail') {
      expect(result.maxY - result.minY).toBeGreaterThanOrEqual(39);
      expect(result.minY).toBeGreaterThanOrEqual(0);
      expect(result.maxY).toBeLessThanOrEqual(40);
    } else {
      expect(result.minY).toBeGreaterThan(0);
      expect(result.maxY).toBeLessThan(40);
    }
    expect(result.darkPixels).toBeGreaterThan(40);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('더블 포인트는 200px 바디 중심에 212px로 놓이며 일부 성공 70%·모두 성공 숨김에도 바디는 그대로다', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('link', { name: '포인트 일부 성공', exact: true }).click();
  const section = page.locator('#point-success');
  await expect(section.getByRole('heading', { name: '더블 포인트 · 일부 성공 비교' })).toBeVisible();
  for (const [id, alpha] of [['pending', '1'], ['partial-success', '0.7'], ['success', '0']] as const) {
    for (const background of ['solid', 'body']) {
      const stage = section.locator(`[data-state="${id}"] [data-background="${background}"]`);
      const image = stage.locator('img');
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((image: HTMLImageElement) => image.decode());
      await expect(image).toHaveAttribute('src', 'assets/note-double-anodized-contrast-070.png');
      await expect(image).toHaveCSS('opacity', alpha);
      await expect(image).toHaveCSS('filter', 'none');
      await expect(stage).toHaveCSS('opacity', '1');
      await expect(stage).toHaveCSS('background-size', '200px 40px');
      await expect(stage).toHaveCSS('background-position', '50% 0%');
      await expect(stage).toHaveCSS('background-repeat', 'repeat-y');
      await expect(stage).toHaveCSS('background-image', background === 'solid' ? 'none' : /body-double-center-dual-beam\.png/);
      expect(await image.evaluate(image => {
        const rect = image.getBoundingClientRect(), parent = image.parentElement!.getBoundingClientRect();
        return [rect.width, rect.height, parent.width, rect.left - parent.left, rect.top - parent.top];
      })).toEqual([212, 40, 212, 0, 32]);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const columns = await section.locator('article').evaluateAll(articles => articles.map(article => article.getBoundingClientRect().left));
  expect(new Set(columns).size).toBe(1);
});

test('더블 릴리즈 일부 성공은 단색·바디 위에서 같은 200×40 원본의 양쪽을 70%로 남기고 모두 성공하면 숨긴다', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('link', { name: '릴리즈 일부 성공', exact: true }).click();
  const section = page.locator('#release-success');
  await expect(section.getByRole('heading', { name: '더블 릴리즈 · 일부 성공 비교' })).toBeVisible();
  const progression = section.locator('[data-comparison="progression"]');
  for (const [id, alpha] of [['pending', '1'], ['partial-success', '0.7'], ['success', '0']] as const) {
    for (const background of ['solid', 'body']) {
      const stage = progression.locator(`[data-state="${id}"] [data-background="${background}"]`);
      const image = stage.locator('img');
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((image: HTMLImageElement) => image.decode());
      await expect(image).toHaveAttribute('src', 'assets/release-double.png');
      await expect(image).toHaveCSS('opacity', alpha);
      await expect(image).toHaveCSS('filter', 'none');
      await expect(stage).toHaveCSS('opacity', '1');
      await expect(stage).toHaveCSS('background-color', 'rgb(8, 12, 18)');
      await expect(stage).toHaveCSS('background-image', background === 'solid' ? 'none' : /body-double-center-dual-beam\.png/);
      expect(await image.evaluate(image => {
        const rect = image.getBoundingClientRect(), parent = image.parentElement!.getBoundingClientRect();
        return [rect.width, rect.height, rect.left - parent.left, rect.top - parent.top];
      })).toEqual([200, 40, 0, 32]);
    }
  }
  const pixels = await progression.evaluate(element => {
    const render = (id: string) => {
      const image = element.querySelector<HTMLImageElement>(`[data-state="${id}"] img`)!;
      const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 40;
      const context = canvas.getContext('2d')!;
      context.globalAlpha = Number(getComputedStyle(image).opacity); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 200, 40).data;
    };
    const normal = render('pending'), partial = render('partial-success'), hidden = render('success');
    let alphaError = 0, hiddenAlpha = 0, leftAlpha = 0, rightAlpha = 0;
    for (let i = 3; i < normal.length; i += 4) {
      alphaError = Math.max(alphaError, Math.abs(partial[i] - normal[i] * 0.7));
      hiddenAlpha = Math.max(hiddenAlpha, hidden[i]);
      if (((i - 3) / 4) % 200 < 100) leftAlpha = Math.max(leftAlpha, partial[i]);
      else rightAlpha = Math.max(rightAlpha, partial[i]);
    }
    return { alphaError, hiddenAlpha, leftAlpha, rightAlpha };
  });
  expect(pixels.alphaError).toBeLessThanOrEqual(1);
  expect(pixels.hiddenAlpha).toBe(0);
  expect(pixels.leftAlpha).toBeGreaterThan(100);
  expect(pixels.rightAlpha).toBeGreaterThan(100);
  await expect(progression.locator('img[src*="grace"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Grace 일부 성공은 본체 70%·외곽 100%를 유지하고 모두 성공 때 두 레이어를 숨긴다', async ({ page }) => {
  await page.goto(route + '#grace-success');
  const comparison = page.locator('[data-comparison="grace-progression"]');
  for (const [id, bodyAlpha, outlineAlpha] of [['pending', '1', '1'], ['partial-success', '0.7', '1'], ['success', '0', '0']]) {
    for (const background of ['solid', 'body']) {
      const stage = comparison.locator(`[data-state="${id}"] [data-background="${background}"]`);
      const body = stage.locator('.success-note'), outline = stage.locator('.success-outline');
      await expect(body).toHaveCSS('opacity', bodyAlpha);
      await expect(outline).toHaveCSS('opacity', outlineAlpha);
      await expect(stage).toHaveCSS('opacity', '1');
      await expect(body).toHaveAttribute('src', 'assets/release-double.png');
      await expect(outline).toHaveAttribute('src', 'assets/release-grace-overlay.png');
      expect(await stage.evaluate(stage => {
        const parent = stage.getBoundingClientRect();
        return [...stage.querySelectorAll('img')].map(image => {
          const r = image.getBoundingClientRect(); return [r.width, r.height, r.left - parent.left, r.top - parent.top];
        });
      })).toEqual([[200, 40, 24, 32], [248, 88, 0, 8]]);
    }
  }
  for (const width of [390, 800, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await comparison.locator('article').evaluateAll(articles => articles.every(article => {
      const parent = article.getBoundingClientRect();
      return [...article.querySelectorAll('img')].every(image => {
        const r = image.getBoundingClientRect(); return r.left >= parent.left && r.right <= parent.right;
      });
    }))).toBe(true);
  }
});

test('바디 시작·끝 4개 조합은 같은 200×160 바디에 명시한 Point·릴리즈만 놓고 마감을 그리지 않는다', async ({ page }) => {
  await page.goto(route + '#body-boundaries');
  const section = page.locator('#body-boundaries');
  for (const [id, point, release] of [['bare', 0, 0], ['point', 1, 0], ['release', 0, 1], ['both', 1, 1]] as const) {
    const stage = section.locator(`[data-case="${id}"] .boundary-stage`);
    await expect(stage.locator('img')).toHaveCount(point + release);
    await expect(stage.locator('.boundary-point')).toHaveCount(point);
    await expect(stage.locator('.boundary-release')).toHaveCount(release);
    expect(await stage.locator('.boundary-body').evaluate(body => {
      const r = body.getBoundingClientRect(), parent = body.parentElement!.getBoundingClientRect();
      return [r.width, r.height, r.left - parent.left, r.top - parent.top];
    })).toEqual([200, 160, 6, 20]);
  }
  await expect(page.locator('img[src*="terminal-"]')).toHaveCount(0);
  await expect(page.locator('#terminal-single, #terminal-double')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('더블 바디의 왼쪽 미충족은 x=116만 켜고 왼쪽 실패는 x=84를 무채색으로 바꾸며 모든 타일이 세로로 반복된다', async ({ page }) => {
  await page.goto(route);
  const result = await page.evaluate(async () => {
    const read = async (name: string) => {
      const image = new Image(); image.src = `assets/${name}.png`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 40;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, 200, 40);
      const rgb = (x: number) => [...data.slice((20 * 200 + x) * 4, (20 * 200 + x) * 4 + 3)];
      let rowDiff = 0;
      for (let i = 0; i < data.length; i++) rowDiff = Math.max(rowDiff, Math.abs(data[i] - data[i % 800]));
      return { left: rgb(84), right: rgb(116), rowDiff };
    };
    return Promise.all(['body-double-center-dual-beam', 'body-double-held', 'body-double-partial-held-left', 'body-double-partial-held-right', 'body-double-partial-failed-left', 'body-double-partial-failed-right', 'body-double-failed'].map(read));
  });
  const [idle, held, waitingLeft, waitingRight, failedLeft, failedRight, failed] = result;
  expect(waitingLeft.left).toEqual(idle.left);
  expect(waitingRight.right).toEqual(idle.right);
  for (const color of [held.left, held.right, waitingLeft.right, waitingRight.left, failedLeft.right, failedRight.left]) expect(Math.min(...color)).toBeGreaterThan(245);
  for (const color of [failedLeft.left, failedRight.right, failed.left, failed.right]) {
    expect(Math.max(...color) - Math.min(...color)).toBeLessThanOrEqual(1);
    expect(Math.max(...color)).toBeLessThan(120);
  }
  for (const state of result) expect(state.rowDiff).toBeLessThanOrEqual(1);
});

test('유지·릴리즈 좌우 레이어를 합치면 원래 PNG가 복원되고 왼쪽 성공 후 오른쪽만 그릴 때 왼쪽 알파는 0이다', async ({ page }) => {
  await page.goto(route);
  const results = await page.evaluate(async () => {
    const read = async (name: string) => {
      const image = new Image(); image.src = `assets/${name}.png`; await image.decode(); return image;
    };
    const pixels = (images: HTMLImageElement[]) => {
      const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 40;
      const context = canvas.getContext('2d')!;
      for (const image of images) context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 200, 40).data;
    };
    const results = [];
    for (const role of ['release', 'sustain']) for (const failed of [false, true]) {
      const suffix = failed ? '-failed' : '';
      const [base, left, right] = await Promise.all([`${role}-double${suffix}`, `${role}-double-unit-left${suffix}`, `${role}-double-unit-right${suffix}`].map(read));
      const original = pixels([base]), combined = pixels([left, right]), remaining = pixels([right]);
      let difference = 0, hiddenAlpha = 0;
      for (let i = 0; i < original.length; i++) difference = Math.max(difference, Math.abs(original[i] - combined[i]));
      for (let y = 0; y < 40; y++) for (let x = 0; x < 100; x++) hiddenAlpha = Math.max(hiddenAlpha, remaining[(y * 200 + x) * 4 + 3]);
      results.push({ difference, hiddenAlpha, remainingAlpha: remaining[(20 * 200 + 116) * 4 + 3] });
    }
    return results;
  });
  for (const result of results) {
    expect(result.difference).toBeLessThanOrEqual(1);
    expect(result.hiddenAlpha).toBe(0);
    expect(result.remainingAlpha).toBeGreaterThan(128);
  }
});

for (const role of ['sustain', 'release']) for (const side of ['left', 'right'] as const) for (const suffix of ['.svg', '@2x.png']) {
  test(`더블 ${role} ${side} 실패 몫의 ${suffix}를 400×80에 그리면 표식이 보이고 반대편 알파는 0이다`, async ({ page }) => {
    await page.goto(route);
    const result = await page.evaluate(async ({ role, side, suffix }) => {
      const image = new Image();
      image.src = `assets/${role}-double-unit-${side}-failed${suffix}`;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 80;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 400, 80);
      const { data } = context.getImageData(0, 0, 400, 80);
      let visiblePixels = 0, hiddenAlpha = 0;
      for (let y = 0; y < 80; y++) for (let x = 0; x < 400; x++) {
        const alpha = data[(y * 400 + x) * 4 + 3];
        if ((side === 'left' && x < 200) || (side === 'right' && x >= 200)) {
          if (alpha > 0) visiblePixels++;
        } else hiddenAlpha = Math.max(hiddenAlpha, alpha);
      }
      const centerX = side === 'left' ? 168 : 232;
      return { visiblePixels, hiddenAlpha, centerAlpha: data[(40 * 400 + centerX) * 4 + 3] };
    }, { role, side, suffix });
    expect(result.visiblePixels).toBeGreaterThan(0);
    expect(result.centerAlpha).toBeGreaterThan(128);
    expect(result.hiddenAlpha).toBe(0);
  });
}

test('J2-C 릴리즈 실패는 알파·정상 절반을 보존하고 Grace는 실제 직사각 외곽 전체에만 남는다', async ({ page }) => {
  await page.goto(route);
  const results = await page.evaluate(async () => {
    const read = async (file: string, width: number, height: number) => {
      const image = new Image(); image.src = `assets/${file}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const results = [];
    for (const suffix of ['.png', '.svg', '@2x.png']) {
      const scale = suffix === '.png' ? 1 : 2, width = 200 * scale, height = 40 * scale;
      for (const kind of ['single', 'double']) {
        const original = await read(`release-${kind}${suffix}`, width, height);
        let minimumAlpha = 255;
        for (let i = 3; i < original.length; i += 4) minimumAlpha = Math.min(minimumAlpha, original[i]);
        for (const side of ['all', ...(kind === 'double' ? ['left', 'right'] : [])]) {
          const state = side === 'all' ? 'failed' : `partial-failed-${side}`;
          const failed = await read(`release-${kind}-${state}${suffix}`, width, height);
          let alphaError = 0, healthyError = 0, failedChroma = 0, failedBrightness = 0;
          for (let i = 0; i < original.length; i += 4) {
            alphaError = Math.max(alphaError, Math.abs(original[i + 3] - failed[i + 3]));
            const left = (i / 4) % width < width / 2;
            if (side === 'all' || (side === 'left' ? left : !left)) {
              const rgb = failed.slice(i, i + 3);
              failedChroma = Math.max(failedChroma, Math.max(...rgb) - Math.min(...rgb));
              failedBrightness = Math.max(failedBrightness, ...rgb);
            } else for (let channel = 0; channel < 3; channel++) healthyError = Math.max(healthyError, Math.abs(original[i + channel] - failed[i + channel]));
          }
          results.push({ file: `${kind}-${state}${suffix}`, minimumAlpha, alphaError, healthyError, failedChroma, failedBrightness });
        }
      }
    }
    const overlay = await read('release-grace-overlay.png', 248, 88);
    const normalGrace = await read('release-double-grace.png', 248, 88);
    let interiorAlpha = 0;
    for (let y = 24; y < 64; y++) for (let x = 24; x < 224; x++) interiorAlpha = Math.max(interiorAlpha, overlay[(y * 248 + x) * 4 + 3]);
    const edgeAlpha = [[22, 44], [225, 44], [124, 22], [124, 65]].map(([x, y]) => overlay[(y * 248 + x) * 4 + 3]);
    let outlineDifference = 0, bodyDifference = 0;
    for (const side of ['left', 'right']) {
      const composite = await read(`release-double-partial-failed-${side}-grace.png`, 248, 88);
      const body = await read(`release-double-partial-failed-${side}.png`, 200, 40);
      for (let y = 0; y < 88; y++) for (let x = 0; x < 248; x++) for (let channel = 0; channel < 4; channel++) {
        const pixel = composite[(y * 248 + x) * 4 + channel];
        if (x >= 24 && x < 224 && y >= 24 && y < 64) bodyDifference = Math.max(bodyDifference, Math.abs(pixel - body[((y - 24) * 200 + x - 24) * 4 + channel]));
        else outlineDifference = Math.max(outlineDifference, Math.abs(pixel - normalGrace[(y * 248 + x) * 4 + channel]));
      }
    }
    return { states: results, interiorAlpha, edgeAlpha, outlineDifference, bodyDifference };
  });
  for (const result of results.states) {
    expect(result.minimumAlpha, result.file).toBeGreaterThanOrEqual(128);
    expect(result.alphaError, result.file).toBeLessThanOrEqual(1);
    expect(result.healthyError, result.file).toBeLessThanOrEqual(1);
    expect(result.failedChroma, result.file).toBeLessThanOrEqual(1);
    expect(result.failedBrightness, result.file).toBeLessThan(120);
  }
  expect(results.interiorAlpha).toBe(0);
  for (const alpha of results.edgeAlpha) expect(alpha).toBeGreaterThan(128);
  expect(results.outlineDifference).toBeLessThanOrEqual(1);
  expect(results.bodyDifference).toBeLessThanOrEqual(1);
});

test('Lab 목록에서 상태별 에셋을 열어 200×40·400×80 유지 실패본을 받고 390px에서도 길이 0 바디 위 표식만 본다', async ({ page }) => {
  await page.goto('/lab');
  const opened = page.waitForEvent('popup');
  await page.getByRole('link', { name: /Classic 확정 도안 · 상태별 에셋/ }).click();
  page = await opened;
  await expect(page.getByRole('heading', { name: '상태별 에셋 검토', exact: true })).toBeVisible();
  const card = page.locator('#sustain-single [data-state="failed"]');
  await card.scrollIntoViewIfNeeded();
  const image = card.locator('img');
  await image.evaluate((image: HTMLImageElement) => image.decode());
  expect(await image.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([200, 40]);
  const download = page.waitForEvent('download');
  await card.getByRole('link', { name: 'PNG 2배', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('sustain-single-failed@2x.png');
  await expect(page.locator('.zero img')).toHaveCount(2);
  await expect(page.locator('.zero .start, .zero .end, .zero .point')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
