import { expect, test } from '@playwright/test';

const route = '/lab/images/classic-approved-states-20261025/';

test('더블 릴리즈 일부 성공은 단색·바디 위에서 같은 200×40 원본의 양쪽을 50%로 남기고 모두 성공하면 숨긴다', async ({ page }) => {
  await page.goto(route);
  await page.getByRole('link', { name: '릴리즈 일부 성공', exact: true }).click();
  const section = page.locator('#release-success');
  await expect(section.getByRole('heading', { name: '더블 릴리즈 · 일부 성공 비교' })).toBeVisible();
  const progression = section.locator('[data-comparison="progression"]');
  for (const [id, alpha] of [['pending', '1'], ['partial-success', '0.5'], ['success', '0']] as const) {
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
      alphaError = Math.max(alphaError, Math.abs(partial[i] - normal[i] * 0.5));
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
  const alternatives = section.locator('[data-comparison="alternatives"]');
  for (const [id, file] of [['hide-left-success', 'release-double-unit-right.png'], ['left-failed', 'release-double-partial-failed-left.png']]) {
    const images = alternatives.locator(`[data-state="${id}"] img`);
    await expect(images).toHaveCount(2);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute('src', `assets/${file}`);
      await expect(image).toHaveCSS('opacity', '1');
    }
  }
  await expect(section.locator('img[src*="grace"]')).toHaveCount(0);
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
