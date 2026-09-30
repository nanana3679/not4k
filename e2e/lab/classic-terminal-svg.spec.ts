import { test, expect } from '@playwright/test';

test('터미널 페이지에서 밝은 바디 타일을 포함한 1000×200 시작·끝 SVG 4개를 다운로드한다', async ({ page }) => {
  await page.goto('/assets-lab/classic/terminal-preview.html');
  await expect(page.getByRole('heading', { name: 'Classic 터미널', exact: true })).toBeVisible();
  await expect(page.locator('a[download]')).toHaveCount(4);
  for (const link of await page.locator('a[download]').all()) {
    const response = await page.request.get((await link.getAttribute('href'))!);
    expect(response.status()).toBe(200);
    const svg = await response.text();
    expect(svg).toContain('viewBox="0 0 1000 200"');
    expect(svg).toContain('data-artwork="bright-body-20260929"');
    expect(svg).toContain('data:image/png;base64,');
  }
  await expect(page.locator('[data-zero-length] img')).toHaveCount(2);
});

test('싱글·더블 7개 상태에서 200×40 바디와 양 끝 타일이 같고 대기 바디·흰빛 포인트는 현재 원본 SVG를 같은 크기로 그린 결과와 픽셀이 같다', async ({ page }, testInfo) => {
  await page.goto('/assets-lab/classic/terminal-preview.html');
  const checks = await page.evaluate(async () => {
    const raster = async (src: string, width = 200) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 40;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, width, 40);
      return { pixels: ctx.getImageData(0, 0, width, 40).data, width: image.naturalWidth, height: image.naturalHeight };
    };
    const maxDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
      return diff;
    };
    const results = [];
    for (const kind of ['single', 'double']) {
      const sources = `/assets-lab/classic/sources`;
      const point = await raster(`/skins/classic/note-${kind}.png`, 212);
      const expectedPoint = await raster(`${sources}/point-${kind}.svg`, 212);
      // 빌드는 트렌치 바디 SVG를 200×40으로 그린 뒤 가운데 행을 세로로 반복한다.
      const expectedBody = await raster(`${sources}/body-${kind}-bright.svg`);
      const center = expectedBody.pixels.slice(20 * 800, 21 * 800);
      for (let y = 0; y < 40; y++) expectedBody.pixels.set(center, y * 800);
      const states = [];
      for (const state of ['idle', 'on', 'failed', ...(kind === 'double' ? ['partial-off'] : [])]) {
        const bodySuffix = { idle: '', on: '-held', failed: '-failed', 'partial-off': '-partial-held-left' }[state];
        const terminalSuffix = state === 'on' ? '' : state === 'partial-off' ? '-partial-failed-left' : `-${state}`;
        const svgSuffix = state === 'on' ? '' : `-${state}`;
        const body = await raster(`/skins/classic/body-${kind}${bodySuffix}.png`);
        const terminal = await raster(`/skins/classic/terminal-${kind}${terminalSuffix}.png`);
        const start = await raster(`/lab/note-assets/classic/terminal-start-${kind}${svgSuffix}.svg`);
        const end = await raster(`/lab/note-assets/classic/terminal-end-${kind}${svgSuffix}.svg`);
        let repeatDiff = 0, minAlpha = 255;
        for (let i = 0; i < body.pixels.length; i++) {
          repeatDiff = Math.max(repeatDiff, Math.abs(body.pixels[i] - body.pixels[i % 800]));
          if (i % 4 === 3) minAlpha = Math.min(minAlpha, body.pixels[i]);
        }
        const rgb = (x: number) => [...body.pixels.slice((20 * 200 + x) * 4, (20 * 200 + x) * 4 + 3)];
        states.push({state, width: body.width, height: body.height, minAlpha, repeatDiff,
          terminalDiff: maxDiff(body.pixels, terminal.pixels), startDiff: maxDiff(body.pixels, start.pixels), endDiff: maxDiff(body.pixels, end.pixels),
          selectedDiff: state === 'idle' ? maxDiff(body.pixels, expectedBody.pixels) : null, core: rgb(100), side: rgb(90)});
      }
      results.push({ kind, pointWidth: point.width, pointHeight: point.height, pointDiff: maxDiff(point.pixels, expectedPoint.pixels), states });
    }
    return results;
  });
  for (const check of checks) {
    expect(check).toMatchObject({pointWidth: 212, pointHeight: 40});
    expect(check.pointDiff, `${check.kind} 포인트`).toBeLessThanOrEqual(1);
    for (const state of check.states) {
      expect(state, `${check.kind} ${state.state}`).toMatchObject({width: 200, height: 40, minAlpha: 255, repeatDiff: 0, terminalDiff: 0});
      // Runtime rows are normalized; Chromium SVG gradient dithering can differ by 1/255.
      expect(state.startDiff).toBeLessThanOrEqual(1);
      expect(state.endDiff).toBeLessThanOrEqual(1);
    }
    const [idle, held, failed, partial] = check.states;
    expect(idle.selectedDiff).toBeLessThanOrEqual(1);
    expect(Math.min(...held.core)).toBeGreaterThan(245);
    expect(Math.max(...failed.core) - Math.min(...failed.core)).toBe(0);
    expect(failed.core[0]).toBeLessThan(Math.min(...idle.core));
    if (partial) {
      expect(partial.core).toEqual(held.core);
      expect(partial.side).toEqual(idle.side);
      expect(held.side[2]).toBeGreaterThan(partial.side[2]);
    }
  }
  await page.locator('[data-assembly-preview]').screenshot({path:testInfo.outputPath('classic-selected-assembly.png')});
});

test('390px 화면에서 타일 조립과 다운로드가 넘치지 않고 실제 크기 터미널은 100×20이다', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/assets-lab/classic/terminal-preview.html');
  await page.locator('.actual img').first().evaluate((image: HTMLImageElement) => image.decode());
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const terminal = await page.locator('.actual img').first().boundingBox();
  expect(terminal?.width).toBe(100);
  expect(terminal?.height).toBe(20);
});
