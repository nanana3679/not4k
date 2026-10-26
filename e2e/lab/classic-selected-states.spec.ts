import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const route = '/lab/images/classic-approved-states-20261025/';
interface State { id: string; file: string; alpha: number; overlay?: string; overlayAlpha?: number; composite?: string }
interface Group { id: string; role: string; kind: string; targetSize: number[]; states: State[] }
const { selectedStatePreview: preview } = JSON.parse(readFileSync(new URL('../../assets-lab/classic/revisions/approved-notes-20261025/manifest.json', import.meta.url), 'utf8')) as {
  selectedStatePreview: { groups: Group[]; graceGroups: Group[]; layers: Group[] };
};

test('선택본 실패는 기본·2배에서 알파를 유지하고 실패 쪽만 무채색 45%이며 미충족 반대쪽은 선택한 활성 바디와 같다', async ({ page }) => {
  await page.goto(route + '#selected-states');
  const results = await page.evaluate(async groups => {
    const checks = [];
    for (const group of groups) for (const scale of [1, 2]) {
      const width = group.targetSize[0] * scale, height = 40 * scale;
      const load = async (file: string) => {
        const image = new Image(); image.src = file.replace('.png', scale === 1 ? '.png' : '@2x.png'); await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(image, 0, 0);
        return canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
      };
      const normal = await load(group.states[0].file);
      const held = group.role === 'body' ? await load(group.states.find(state => state.id === 'held')!.file) : normal;
      for (const state of group.states.filter(state => state.id.includes('failed') || state.id.startsWith('partial-held'))) {
        const actual = await load(state.file);
        let alphaDifference = 0, colorDifference = 0, checkedPixels = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const inactive = state.id.endsWith('left') ? x < width / 2 : x >= width / 2;
          const failed = state.id === 'failed' || (state.id.startsWith('partial-failed') && inactive);
          const source = group.role === 'body' && state.id.startsWith('partial-') && !inactive ? held : normal;
          alphaDifference = Math.max(alphaDifference, Math.abs(actual[i + 3] - source[i + 3]));
          if (source[i + 3] !== 255) continue;
          checkedPixels++;
          const gray = (.2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2]) * .45;
          for (const c of [0, 1, 2]) colorDifference = Math.max(colorDifference, Math.abs(actual[i + c] - (failed ? gray : source[i + c])));
        }
        checks.push({ group: group.id, state: state.id, scale, alphaDifference, colorDifference, checkedPixels });
      }
    }
    return checks;
  }, preview.groups);
  for (const result of results) {
    const label = `${result.group} ${result.state} ${result.scale}배`;
    expect(result.checkedPixels, label).toBeGreaterThan(50);
    expect(result.alphaDifference, label).toBeLessThanOrEqual(1);
    expect(result.colorDifference, label).toBeLessThanOrEqual(2);
  }
});

test('릴리즈의 정상·실패 및 유지의 정상 좌우 레이어를 합치면 기본·2배 원본의 픽셀이 복원된다', async ({ page }) => {
  await page.goto(route);
  const checks = await page.evaluate(async preview => {
    const checks = [];
    for (const layerGroup of preview.layers) for (const failed of layerGroup.role === 'sustain' ? [false] : [false, true]) for (const scale of [1, 2]) {
      const load = async (file: string) => { const image = new Image(); image.src = file.replace('.png', scale === 1 ? '.png' : '@2x.png'); await image.decode(); return image; };
      const canvas = document.createElement('canvas'); canvas.width = 200 * scale; canvas.height = 40 * scale;
      const context = canvas.getContext('2d')!;
      const group = preview.groups.find(group => group.id === `${layerGroup.role}-double`)!;
      const normal = group.states.find(state => state.id === (failed ? 'failed' : 'pending'))!;
      context.drawImage(await load(normal.file), 0, 0);
      const original = context.getImageData(0, 0, canvas.width, canvas.height).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const side of ['left', 'right']) context.drawImage(await load(layerGroup.states.find(state => state.id === `unit-${side}${failed ? '-failed' : ''}`)!.file), 0, 0);
      const combined = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let difference = 0;
      for (let i = 0; i < original.length; i += 4) for (const c of [0, 1, 2, 3]) {
        const premultiply = (pixels: Uint8ClampedArray) => c === 3 ? pixels[i + 3] : pixels[i + c] * pixels[i + 3] / 255;
        difference = Math.max(difference, Math.abs(premultiply(original) - premultiply(combined)));
      }
      checks.push({ role: layerGroup.role, failed, scale, difference });
    }
    return checks;
  }, preview);
  for (const check of checks) expect(check.difference, JSON.stringify(check)).toBeLessThanOrEqual(1);
});

test('유지 일부 성공은 기본·2배 PNG와 SVG에서 성공한 쪽의 알파만 0으로 만들고 남은 표식의 픽셀과 위치를 유지한다', async ({ page }) => {
  await page.goto(route + '#selected-states');
  const sustain = preview.groups.find(group => group.id === 'sustain-double')!;
  const checks = await page.evaluate(async group => {
    const checks = [];
    for (const scale of [1, 2]) for (const format of ['png', 'svg']) {
      const width = 200 * scale, height = 40 * scale;
      const read = async (file: string) => {
        const image = new Image(); image.src = file; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      // SVG embeds the selected 2x PNG and scales it to the requested canvas.
      const normal = await read(group.states[0].file.replace('.png', format === 'svg' || scale === 2 ? '@2x.png' : '.png'));
      for (const side of ['left', 'right']) {
        const state = group.states.find(state => state.id === `partial-success-${side}`)!;
        const actual = await read(state.file.replace('.png', format === 'svg' ? '.svg' : scale === 2 ? '@2x.png' : '.png'));
        let hiddenAlpha = 0, difference = 0, remainingPixels = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (side === 'left' ? x < width / 2 : x >= width / 2) hiddenAlpha = Math.max(hiddenAlpha, actual[i + 3]);
          else {
            if (actual[i + 3] > 0) remainingPixels++;
            for (const c of [0, 1, 2, 3]) {
              const premultiply = (pixels: Uint8ClampedArray) => c === 3 ? pixels[i + 3] : pixels[i + c] * pixels[i + 3] / 255;
              difference = Math.max(difference, Math.abs(premultiply(actual) - premultiply(normal)));
            }
          }
        }
        checks.push({ scale, format, side, hiddenAlpha, difference, remainingPixels });
      }
    }
    return checks;
  }, sustain);
  for (const check of checks) {
    expect(check.hiddenAlpha, JSON.stringify(check)).toBe(0);
    expect(check.difference, JSON.stringify(check)).toBeLessThanOrEqual(1);
    expect(check.remainingPixels, JSON.stringify(check)).toBeGreaterThan(100);
  }
  await page.locator('#selected-states details > summary').click();
  const cards = page.locator('[data-group="sustain-double"]');
  await expect(cards.locator('article')).toHaveCount(4);
  for (const side of ['left', 'right']) {
    const state = sustain.states.find(state => state.id === `partial-success-${side}`)!;
    const image = cards.locator(`[data-state="${state.id}"] .selected-state-note`).first();
    await expect(image).toHaveAttribute('src', state.file);
    await expect(image).toHaveCSS('opacity', '1');
  }
  for (const kind of ['single', 'double']) await expect(page.locator(`[data-group="sustain-${kind}"] [data-state="success"] .selected-state-note`).first()).toHaveCSS('opacity', '0');
});

test('Grace 합성은 선택 본체를 보존하고 한쪽 실패에도 전체 외곽이 같으며 70% 본체와 100% 외곽을 별도로 표시한다', async ({ page }) => {
  await page.goto(route + '#selected-states');
  const checks = await page.evaluate(async groups => {
    const checks = [];
    for (const group of groups) for (const scale of [1, 2]) {
      const width = group.targetSize[0], canvas = document.createElement('canvas'); canvas.width = (width + 48) * scale; canvas.height = 88 * scale;
      const context = canvas.getContext('2d')!;
      const load = async (file: string) => { const image = new Image(); image.src = file.replace('.png', scale === 1 ? '.png' : '@2x.png'); await image.decode(); return image; };
      const read = async (file: string, pad = 0) => {
        context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(await load(file), pad * scale, pad * scale);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const normal = await read(group.states.find(state => state.id === 'pending')!.composite!);
      for (const state of group.states.filter(state => state.composite)) {
        const composite = await read(state.composite!);
        const body = await read(state.file, 24);
        let bodyDifference = 0, outlineDifference = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (body[i + 3] === 255) for (const c of [0, 1, 2, 3]) bodyDifference = Math.max(bodyDifference, Math.abs(composite[i + c] - body[i + c]));
          if (x < 24 * scale || x >= (24 + width) * scale || y < 24 * scale || y >= 64 * scale) for (const c of [0, 1, 2, 3]) outlineDifference = Math.max(outlineDifference, Math.abs(composite[i + c] - normal[i + c]));
        }
        checks.push({ group: group.id, state: state.id, scale, bodyDifference, outlineDifference });
      }
    }
    return checks;
  }, preview.graceGroups);
  for (const check of checks) {
    expect(check.bodyDifference, JSON.stringify(check)).toBeLessThanOrEqual(1);
    expect(check.outlineDifference, JSON.stringify(check)).toBe(0);
  }
  await page.locator('#selected-states details > summary').click();
  const partial = page.locator('[data-group="release-double-grace"] [data-state="partial-success"]');
  await expect(partial.locator('.selected-state-note').first()).toHaveCSS('opacity', '0.7');
  await expect(partial.locator('.selected-state-overlay').first()).toHaveCSS('opacity', '1');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
