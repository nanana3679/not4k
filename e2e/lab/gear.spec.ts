import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// 기어 측정값(prepare-frame-fit-v20.mjs → src/game/renderer/gearGeometry.json). 미리보기는 실제 게임 렌더러 배치를 그대로 알린다.
const geometry = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/game/renderer/gearGeometry.json', import.meta.url)), 'utf8')) as {
  laneLeft: number; laneRight: number; deckTop: number; frameBottom: number; laneOpeningBottom: number;
  laneOpening: { rows: [number, number, number][] };
};
const laneWindow = geometry.laneRight - geometry.laneLeft + 1;
// 레인 영역 250(플레이필드 배율 0.625), 논리 높이 600, 기어 실루엣 아래끝(측정 자료 키 frameBottom + 1행)을 화면 아래에 붙인다.
const scale = 250 / laneWindow;
const gearTop = 600 - (geometry.frameBottom + 1) * scale;
const deckTopY = gearTop + geometry.deckTop * scale;
const keyRimY = gearTop + (geometry.laneOpeningBottom + 1) * scale;
const stageSelector = '[data-gear-preview-stage="true"]';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function waitForRenderer(page: Page) {
  await expect(page.locator(stageSelector)).toHaveAttribute('data-renderer-ready', 'true', { timeout: 60000 });
  await expect(page.locator('[data-flight-background][data-ready="true"]')).toHaveCount(1, { timeout: 60000 });
}

const numberAttribute = async (page: Page, name: string) => Number(await page.locator(stageSelector).getAttribute(name));

/** 두 무대 스크린샷의 같은 영역(비율)에서 RGB 채널 평균 절대 차이(0~255). */
async function meanDifference(page: Page, a: Buffer, b: Buffer, region: { x: number; y: number; width: number; height: number }): Promise<number> {
  return page.evaluate(async ({ first, second, region }) => {
    const decode = async (data: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const x = Math.round(region.x * canvas.width);
      const y = Math.round(region.y * canvas.height);
      return context.getImageData(x, y, Math.round(region.width * canvas.width), Math.round(region.height * canvas.height)).data;
    };
    const [x, y] = await Promise.all([decode(first), decode(second)]);
    let total = 0;
    for (let i = 0; i < x.length; i += 4) total += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
    return total / ((x.length / 4) * 3);
  }, { first: a.toString('base64'), second: b.toString('base64'), region });
}

/** 무대 캔버스 스크린샷에서 논리 좌표(1067×600) 점들의 RGBA. */
async function pixelsAt(page: Page, points: { x: number; y: number }[]): Promise<number[][]> {
  const shot = (await page.locator('.gear-preview-canvas-host').screenshot()).toString('base64');
  return page.evaluate(async ({ shot, points }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    return points.map((point) => [...context.getImageData(Math.round((point.x / 1067) * image.naturalWidth), Math.round((point.y / 600) * image.naturalHeight), 1, 1).data]);
  }, { shot, points });
}

/** 기어 그림 public/gear/gear.png의 원본 좌표 알파. */
async function gearAlpha(page: Page, points: { x: number; y: number }[]): Promise<number[]> {
  return page.evaluate(async (points) => {
    const image = new Image();
    image.src = '/gear/gear.png';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    return points.map((point) => context.getImageData(point.x, point.y, 1, 1).data[3]);
  }, points);
}

const motionTime = async (page: Page) => {
  const value = await page.locator(stageSelector).getAttribute('data-motion-time-ms');
  return value === null ? null : Number(value);
};

test.describe('Gear Lab — 새 기어가 들어간 실제 게임 화면', () => {
  // 실제 게임 렌더러와 비행 배경을 swiftshader로 띄우므로 여러 워커가 동시에 돌면 30초 안에 준비되지 않는다.
  // 이 파일은 한 워커에서 차례로 돌리고 테스트마다 넉넉한 시간을 준다.
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  for (const width of [1280, 390]) {
    test(`${width}px Lab 목록에서 Gear를 열면 실제 렌더러와 비행 배경이 준비되고 가로 넘침 없이 목록으로 돌아온다`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/lab');
      await page.getByRole('link', { name: /Gear/ }).click();
      await expect(page).toHaveURL(/\/lab\/gear$/);
      await waitForRenderer(page);

      await expect(page.locator(stageSelector)).toHaveAttribute('data-scenario', 'INFILTRATION');
      await expect(page.locator('[data-flight-background]')).toHaveAttribute('data-flight-background', 'infiltration');
      for (const option of await page.locator('.gear-preview-option').all()) {
        expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
      const main = page.locator('[data-lab-page="gear"]');
      expect(await main.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      const host = await page.locator('.gear-preview-canvas-host').boundingBox();
      const controls = await page.locator('.gear-preview-controls').boundingBox();
      if (width === 390) expect(controls!.y).toBeGreaterThan(host!.y + host!.height);
      else expect(controls!.x).toBeGreaterThan(host!.x + host!.width);

      await page.getByRole('link', { name: '← Lab 목록' }).click();
      await expect(page).toHaveURL(/\/lab$/, { timeout: 15000 });
      expect(errors).toEqual([]);
    });
  }

  for (const oldPath of ['/lab/classic-frame-fit', '/lab/classic-gear']) {
    test(`옛 주소 ${oldPath}?probe=1#stage로 열면 쿼리·해시를 유지한 채 /lab/gear로 바뀌어 같은 미리보기가 열리고, 뒤로 가기 기록에 옛 주소가 남지 않는다`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto('/lab');
      await page.goto(`${oldPath}?probe=1#stage`);
      await expect(page).toHaveURL(/\/lab\/gear\?probe=1#stage$/);
      await expect(page.locator('[data-lab-page="gear"]')).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/lab$/);
      expect(errors).toEqual([]);
    });
  }

  test('게임 렌더러가 레인 창(408.5~658.5)을 레인 영역 250에 맞춰 기어를 놓고 판정선 y 416·덱 위끝 429.7·키 윗면 446.5를 알리며 놓친 노트 수가 는다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-lane-window', '408.50-658.50');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '416.0');
    expect(await numberAttribute(page, 'data-deck-top-y')).toBeCloseTo(deckTopY, 1);
    expect(await numberAttribute(page, 'data-key-rim-y')).toBeCloseTo(keyRimY, 1);
    await expect(stage).toHaveAttribute('data-deck-top-y', '429.7');
    await expect(stage).toHaveAttribute('data-key-rim-y', '446.5');
    expect(await numberAttribute(page, 'data-gear-top')).toBeCloseTo(gearTop, 1);
    expect(await numberAttribute(page, 'data-gear-scale')).toBeCloseTo(scale, 5);
    await expect(page.locator('canvas[data-gear-preview-canvas]')).toHaveAttribute('height', '1080');
    await expect(page.locator('.gear-preview-readout')).toContainText('원본 1px → 화면 0.82px (축소)');
    await expect(page.locator('.gear-preview-readout')).toContainText('0% (+0) · y 416');
    await expect(page.locator('.gear-preview-readout')).toContainText(/판정선 · 키 윗면\(가림막\)\s*y 446\.5까지 30\.5 · 노트 두께 2\.4개/);
    await expect.poll(async () => numberAttribute(page, 'data-missed-count'), { timeout: 15000 }).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('리프트를 4%로 올리면 렌더러를 다시 만들지 않고 판정선만 y 392로 움직이며 기어 위치와 덱·키 윗면은 그대로다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    const key = await stage.getAttribute('data-renderer-key');
    const topBefore = await stage.getAttribute('data-gear-top');
    await page.locator('canvas[data-gear-preview-canvas]').evaluate((canvas) => { canvas.dataset.probe = 'first'; });
    const lift = page.locator('#gear-preview-lift');
    expect((await lift.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(lift).toHaveAttribute('max', '10');

    await lift.fill('4');
    await expect(stage).toHaveAttribute('data-lift-percent', '4');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '392.0');
    await expect(stage).toHaveAttribute('data-gear-top', topBefore!);
    await expect(stage).toHaveAttribute('data-key-rim-y', '446.5');
    await expect(stage).toHaveAttribute('data-renderer-key', key!);
    await expect(page.locator('canvas[data-gear-preview-canvas]')).toHaveAttribute('data-probe', 'first');
    await expect(page.locator('.gear-preview-readout')).toContainText('4% (+24) · y 392');
    expect(errors).toEqual([]);
  });

  test('기어 그림은 레인 창과 열린 덱(1090~1126행) 레인 안쪽이 투명하고 꺾인 모서리·키 테두리는 불투명하며 화면에는 그 자리에 게임 레인이 비친다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);

    // 열린 덱 가운데 행의 레인 안쪽(왼쪽 모서리 경계 + 3px)·가운데 레인 선 자리·레인 창 가운데는 투명,
    // 꺾인 모서리 경계 3px 바깥(베벨)·키 테두리(바닥 다음 행)·레인 왼쪽 경계 바로 밖 기둥 윤곽은 불투명이다.
    const [row, leftEdge] = geometry.laneOpening.rows[Math.floor(geometry.laneOpening.rows.length / 2)];
    const alphas = await gearAlpha(page, [
      { x: Math.ceil(leftEdge) + 3, y: row }, { x: 512, y: geometry.laneOpeningBottom }, { x: 376, y: row }, { x: 512, y: 600 },
      { x: Math.floor(leftEdge) - 3, y: row }, { x: 512, y: geometry.laneOpeningBottom + 1 }, { x: geometry.laneLeft - 1, y: 600 },
    ]);
    expect(alphas).toEqual([0, 0, 0, 0, 255, 255, 255]);

    // 화면: 열린 덱 안 레인 2 가운데는 지워진 그림 바닥색(약 13, 18, 23)이 아니라 게임 레인을 그린다.
    const gearX = await numberAttribute(page, 'data-gear-x');
    const gearScale = await numberAttribute(page, 'data-gear-scale');
    const top = await numberAttribute(page, 'data-gear-top');
    const laneTwo = geometry.laneLeft + 1.5 * (laneWindow / 4);
    const [inside] = await pixelsAt(page, [{ x: gearX + laneTwo * gearScale, y: top + (row + 0.5) * gearScale }]);
    const painted = [13, 18, 23];
    expect(Math.hypot(inside[0] - painted[0], inside[1] - painted[1], inside[2] - painted[2])).toBeGreaterThan(10);

    // 왼쪽 게이지 유리 안(원본 172, 800)은 화면에 파란빛으로 보인다(게이지는 그림 그대로 가득).
    const [gauge] = await pixelsAt(page, [{ x: gearX + 172 * gearScale, y: top + 800 * gearScale }]);
    expect(gauge[2]).toBeGreaterThan(160);
    expect(gauge[2] - gauge[0]).toBeGreaterThan(60);
    expect(errors).toEqual([]);
  });

  test('렌더 높이를 1440으로 바꾸면 렌더러를 새로 만들어 캔버스가 2.4배 크기로 다시 준비되고 비행 장면도 바꿀 수 있다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const canvas = page.locator('canvas[data-gear-preview-canvas]');
    await expect(canvas).toHaveAttribute('height', '1080');

    await page.getByLabel('1440').check();
    await expect(page.locator(stageSelector)).toHaveAttribute('data-render-height', '1440');
    await waitForRenderer(page);
    await expect(canvas).toHaveAttribute('height', '1440');
    expect(Number(await canvas.getAttribute('width'))).toBeCloseTo(1067 * 2.4, -1);
    await expect(page.locator('.gear-preview-readout')).toContainText('원본 1px → 화면 1.09px (확대)');

    await page.getByLabel('BREAKTHROUGH').check();
    await waitForRenderer(page);
    await expect(page.locator('[data-flight-background]')).toHaveAttribute('data-flight-background', 'breakthrough');
    expect(errors).toEqual([]);
  });

  test('1:1 픽셀 보기에서는 캔버스 CSS 크기가 백버퍼 픽셀 ÷ devicePixelRatio가 되고 무대 안에서만 스크롤한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    await page.getByLabel('1:1 픽셀').check();
    await expect(page.locator(stageSelector)).toHaveAttribute('data-view', 'pixel');

    const sizes = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-gear-preview-canvas]')!;
      const host = canvas.parentElement!.getBoundingClientRect();
      const viewport = document.querySelector('.gear-preview-viewport')!;
      const main = document.querySelector('[data-lab-page="gear"]')!;
      return {
        expected: canvas.width / devicePixelRatio,
        host: host.width,
        viewportScrolls: viewport.scrollWidth > viewport.clientWidth,
        pageOverflow: main.scrollWidth > main.clientWidth,
      };
    });
    expect(sizes.host).toBeCloseTo(sizes.expected, 0);
    expect(sizes.viewportScrolls).toBe(true);
    expect(sizes.pageOverflow).toBe(false);
  });

  test('렌더러 내장 움직임이 켜져 게임 프레임 시계로 흐르고, 처음부터 재생·움직임 토글·A 큰 광원 체크가 무대 data 속성에 반영되며 켬·끔 프레임 간격을 따로 모은다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-motion', 'on');
    await expect(stage).toHaveAttribute('data-motion-ready', 'true');
    for (const label of ['움직임', 'A 큰 광원', 'B 게이지 액체', 'C 발광선 호흡', 'D 하단 바 흐름']) {
      await expect(page.getByLabel(label, { exact: true })).toBeChecked();
    }
    const first = (await motionTime(page))!;
    await expect.poll(async () => (await motionTime(page)) ?? 0, { timeout: 10000 }).toBeGreaterThan(first + 300);

    await page.getByRole('button', { name: '처음부터 재생' }).click();
    await expect.poll(async () => (await motionTime(page)) ?? Infinity, { timeout: 5000 }).toBeLessThan(2000);

    // 움직임을 끄면 왼쪽 장갑(원본 x 40~190, y 300~900) 픽셀이 바뀐다(띠 밖 7% 어둡게·빛 받은 대비 복사본이 사라진다).
    const gearX = await numberAttribute(page, 'data-gear-x');
    const gearScale = await numberAttribute(page, 'data-gear-scale');
    const top = await numberAttribute(page, 'data-gear-top');
    const region = { x: (gearX + 40 * gearScale) / 1067, y: (top + 300 * gearScale) / 600, width: (150 * gearScale) / 1067, height: (600 * gearScale) / 600 };
    const host = page.locator('.gear-preview-canvas-host');
    const withMotion = await host.screenshot();
    await page.getByLabel('움직임', { exact: true }).uncheck();
    await expect(stage).toHaveAttribute('data-motion', 'off');
    await expect.poll(() => motionTime(page)).toBeNull();
    const withoutMotion = await host.screenshot();
    expect(await meanDifference(page, withMotion, withoutMotion, region)).toBeGreaterThan(2);
    const statsPattern = /^\d+\.\d{2}\/\d+\.\d{2}$/;
    await expect(stage).toHaveAttribute('data-frame-time-on', statsPattern);
    await expect(stage).toHaveAttribute('data-frame-time-off', statsPattern, { timeout: 10000 });
    await expect(page.locator('.gear-preview-readout')).toContainText(/프레임 간격 · 움직임 끔\s*평균 [\d.]+ms · p95 [\d.]+ms/);
    await page.getByLabel('움직임', { exact: true }).check();
    await expect(stage).toHaveAttribute('data-motion', 'on');
    await expect.poll(() => motionTime(page)).not.toBeNull();

    await page.getByLabel('A 큰 광원', { exact: true }).uncheck();
    await expect(stage).toHaveAttribute('data-motion-armor', 'off');
    await expect(stage).toHaveAttribute('data-motion-gauge', 'on');
    await page.getByLabel('A 큰 광원', { exact: true }).check();
    await expect(stage).toHaveAttribute('data-motion-armor', 'on');
    expect(errors).toEqual([]);
  });

  test('전체화면을 누르면 무대가 1400×600 창을 꽉 채우고 논리 폭 1400으로 렌더러를 다시 만들며, 기어는 가운데를 따라가고 닫기(✕)로 논리 폭 1067에 돌아온다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1400, height: 600 });
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-stage-width', '1067');
    const button = page.getByRole('button', { name: '전체화면' });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await button.click();
    await expect(stage).toHaveAttribute('data-fullscreen', /^(api|css)$/);
    await expect(stage).toHaveAttribute('data-stage-width', '1400');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-lane-window', '575.00-825.00');
    await expect(stage).toHaveAttribute('data-key-rim-y', '446.5');
    const hostBox = (await page.locator('.gear-preview-canvas-host').boundingBox())!;
    expect(Math.abs(hostBox.width - 1400)).toBeLessThan(1);
    expect(Math.abs(hostBox.height - 600)).toBeLessThan(1);
    // 렌더 높이 1080 그대로: 논리 1400×600을 1.8배로 그린다.
    await expect(page.locator('canvas[data-gear-preview-canvas]')).toHaveAttribute('width', '2520');

    await page.getByRole('button', { name: '닫기' }).click();
    await expect(stage).toHaveAttribute('data-fullscreen', 'off');
    await expect(stage).toHaveAttribute('data-stage-width', '1067');
    await waitForRenderer(page);
    expect(errors).toEqual([]);
  });

  test('요소 전체화면이 거절되면 CSS 전체화면이 되어 844×390 가로 폰에서 논리 폭 1298로 꽉 채우고 Esc로 돌아온다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = function requestFullscreen() { return Promise.reject(new Error('blocked')); };
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await page.getByRole('button', { name: '전체화면' }).click();
    await expect(stage).toHaveAttribute('data-fullscreen', 'css');
    await expect(stage).toHaveAttribute('data-stage-width', '1298');
    await waitForRenderer(page);
    const hostBox = (await page.locator('.gear-preview-canvas-host').boundingBox())!;
    expect(Math.abs(hostBox.width - 844)).toBeLessThan(1);
    expect(Math.abs(hostBox.height - 390)).toBeLessThan(1);
    await expect(page.locator('canvas[data-gear-preview-canvas]')).toHaveAttribute('width', String(Math.round(1298 * 1.8)));
    await expect(page.getByLabel('움직임(전체화면)')).toBeChecked();

    await page.keyboard.press('Escape');
    await expect(stage).toHaveAttribute('data-fullscreen', 'off');
    await expect(stage).toHaveAttribute('data-stage-width', '1067');
    await waitForRenderer(page);
    expect(errors).toEqual([]);
  });

  test('키보드 표시는 16:9에서 TKL·넘버패드 모두 원래 크기, 전체화면 4:3(800)에서 0.803·0.646배로 줄이고 5:4(750)에서 넘버패드는 숨긴다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = function requestFullscreen() { return Promise.reject(new Error('blocked')); };
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-keyboard-scale', '1.000');
    await page.getByLabel('넘버패드').check();
    await expect(stage).toHaveAttribute('data-keyboard', 'numpad');
    await expect(stage).toHaveAttribute('data-keyboard-scale', '1.000');

    await page.getByRole('button', { name: '전체화면' }).click();
    await expect(stage).toHaveAttribute('data-stage-width', '800');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-keyboard-visible', 'true');
    await expect(stage).toHaveAttribute('data-keyboard-scale', '0.646');
    await page.keyboard.press('Escape');
    await expect(stage).toHaveAttribute('data-fullscreen', 'off');
    await page.getByLabel('TKL').check();
    await page.getByRole('button', { name: '전체화면' }).click();
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-keyboard-scale', '0.803');
    await page.keyboard.press('Escape');
    await expect(stage).toHaveAttribute('data-fullscreen', 'off');

    await page.setViewportSize({ width: 1000, height: 800 });
    await page.getByLabel('넘버패드').check();
    await page.getByRole('button', { name: '전체화면' }).click();
    await expect(stage).toHaveAttribute('data-stage-width', '750');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-keyboard-visible', 'false');
    await expect(page.locator('.gear-preview-readout')).toContainText(/숨김 · 필요 배율 0\.55이 최소 0\.6보다 작음/);
    expect(errors).toEqual([]);
  });

  test('움직임 자료(/gear/gear-motion/gear-motion.json)를 붙잡아 두면 게임처럼 렌더러 준비도 기다리고(data-renderer-ready false), 놓으면 움직임을 얹은 채 준비된다', async ({ page }) => {
    const errors = collectErrors(page);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let requested!: () => void;
    const requestStarted = new Promise<void>((resolve) => { requested = resolve; });
    await page.route('**/gear/gear-motion/gear-motion.json', async (route) => {
      requested();
      await gate;
      await route.continue();
    });
    await page.goto('/lab/gear');
    await requestStarted;
    const stage = page.locator(stageSelector);
    // 움직임 자료는 렌더러 준비에 필요한 자료라, 붙잡혀 있는 동안 렌더러는 준비되지 않는다(비행 배경이 준비되어도).
    await expect(page.locator('[data-flight-background][data-ready="true"]')).toHaveCount(1, { timeout: 60000 });
    await expect(stage).toHaveAttribute('data-renderer-ready', 'false');
    await expect(stage).toHaveAttribute('data-motion-ready', 'false');

    release();
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-motion-ready', 'true');
    await expect.poll(() => motionTime(page), { timeout: 10000 }).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('움직임 줄이기 설정이면 무대 data-motion이 reduced이고 움직임 시계가 흐르지 않으며 비교 SVG 애니메이션도 돌지 않는다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-motion', 'reduced');
    await expect(stage).toHaveAttribute('data-motion-ready', 'true');
    await page.waitForTimeout(800);
    expect(await motionTime(page)).toBeNull();
    await expect(page.locator('.gear-preview-motion')).toContainText('움직임 줄이기');
    await page.locator('[data-gear-motion-compare]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-gear-motion-compare]')).toHaveAttribute('data-compare-ready', 'true', { timeout: 60000 });
    // 비교 SVG 안의 애니메이션만 센다(버튼 hover 전환 같은 페이지 CSS 전환은 셈에서 뺀다).
    const running = await page.evaluate(() => {
      const host = document.querySelector('[data-gear-motion-svg-host="true"]');
      return document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return animation.playState === 'running' && target instanceof Element && host?.contains(target);
      }).length;
    });
    expect(running).toBe(0);
    expect(errors).toEqual([]);
  });
});
