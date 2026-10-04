import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const geometry = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/lab/classic-frame-fit/frame-fit.json', import.meta.url)), 'utf8')) as {
  laneLeft: number; laneRight: number; laneBottom: number; frameBottom: number;
};
// 게임 배치: 논리 폭 1067(16:9)의 레인 영역 400, 판정선 y 440.
const scale = 400 / (geometry.laneRight - geometry.laneLeft + 1);
const cropTop = 440 - (geometry.laneBottom + 1) * scale;
// 가로세로 같이 줄이기: 프레임 아래끝(frameBottom + 1행)을 화면 아래 600에 붙여 고정한다.
const laneWindow = geometry.laneRight - geometry.laneLeft + 1;
const deckTop = geometry.laneBottom + 1;
const frameEdge = geometry.frameBottom + 1;
const minLaneWidth = (600 * laneWindow) / frameEdge;
const uniformTop = (width: number) => 600 - (frameEdge * width) / laneWindow;
const uniformDeckTop = (width: number) => 600 - ((frameEdge - deckTop) * width) / laneWindow;
// 판정선(게임 Lift 1% = 6) 아래끝(두께 ±2 렌더러 단위 = ±2W/400 화면 단위)이 덱 위끝에 가려지지 않는 최소 %.
const minLiftPercent = (width: number) => Math.min(10, Math.max(0, Math.ceil((440 + (2 * width) / 400 - uniformDeckTop(width)) / 6 - 1e-9)));
const stageSelector = '[data-frame-fit-stage="true"]';

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

const frameTop = async (page: Page) => Number(await page.locator(stageSelector).getAttribute('data-frame-top'));

/** 무대에서 왼쪽 장갑(원본 x 40~190, y 300~900)이 있는 자리(화면 논리 단위 1067×600에 대한 비율). */
async function leftArmorRegion(page: Page) {
  const stage = page.locator(stageSelector);
  const frameX = Number(await stage.getAttribute('data-frame-x'));
  const frameScale = Number(await stage.getAttribute('data-frame-scale'));
  const top = await frameTop(page);
  return {
    x: (frameX + 40 * frameScale) / 1067,
    y: (top + 300 * frameScale) / 600,
    width: (150 * frameScale) / 1067,
    height: (600 * frameScale) / 600,
  };
}

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

const motionTime = async (page: Page) => {
  const value = await page.locator(stageSelector).getAttribute('data-motion-time-ms');
  return value === null ? null : Number(value);
};

test.describe('Classic Frame Fit Lab', () => {
  // 실제 게임 렌더러와 비행 배경을 swiftshader로 띄우므로 여러 워커가 동시에 돌면 30초 안에 준비되지 않는다.
  // 이 파일은 한 워커에서 차례로 돌리고 테스트마다 넉넉한 시간을 준다.
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  for (const width of [1280, 390]) {
    test(`${width}px Lab 목록에서 Classic Frame Fit을 열면 실제 렌더러와 비행 배경이 준비되고 가로 넘침 없이 목록으로 돌아온다`, async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/lab');
      await page.getByRole('link', { name: /Classic Frame Fit/ }).click();
      await expect(page).toHaveURL(/\/lab\/classic-frame-fit$/);
      await waitForRenderer(page);

      const stage = page.locator(stageSelector);
      await expect(stage).toHaveAttribute('data-fit-mode', 'crop');
      await expect(stage).toHaveAttribute('data-scenario', 'INFILTRATION');
      await expect(page.locator('[data-flight-background]')).toHaveAttribute('data-flight-background', 'infiltration');
      for (const option of await page.locator('.frame-fit-option').all()) {
        expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
      const main = page.locator('[data-lab-page="classic-frame-fit"]');
      expect(await main.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      const host = await page.locator('.frame-fit-canvas-host').boundingBox();
      const controls = await page.locator('.frame-fit-controls').boundingBox();
      if (width === 390) expect(controls!.y).toBeGreaterThan(host!.y + host!.height);
      else expect(controls!.x).toBeGreaterThan(host!.x + host!.width);
      await page.screenshot({ path: testInfo.outputPath('stage.png') });

      await page.getByRole('link', { name: '← Lab 목록' }).click();
      // 움직임까지 그리는 무대(swiftshader)를 정리하고 목록으로 돌아가므로 여러 워커가 겹치면 5초를 넘길 수 있다.
      await expect(page).toHaveURL(/\/lab$/, { timeout: 15000 });
      expect(errors).toEqual([]);
    });
  }

  test('맞춤 방식을 바꾸면 data-fit-mode와 프레임 위끝이 바뀌고(crop −349.9·cut 0·squash 0) 새 프레임 방식끼리는 렌더러를 다시 만들지 않는다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    const rendererKey = await stage.getAttribute('data-renderer-key');
    await page.locator('canvas[data-frame-fit-canvas]').evaluate((canvas) => { canvas.dataset.probe = 'first'; });

    await expect(stage).toHaveAttribute('data-fit-mode', 'crop');
    expect(await frameTop(page)).toBeCloseTo(cropTop, 1);

    await page.getByLabel('기둥 잘라 줄이기').check();
    await expect(stage).toHaveAttribute('data-fit-mode', 'cut');
    expect(Math.abs(await frameTop(page))).toBeLessThan(0.5);

    await page.getByLabel('세로로 눌러 맞추기').check();
    await expect(stage).toHaveAttribute('data-fit-mode', 'squash');
    expect(await frameTop(page)).toBe(0);
    await expect(stage).toHaveAttribute('data-renderer-key', rendererKey!);
    await expect(page.locator('canvas[data-frame-fit-canvas]')).toHaveAttribute('data-probe', 'first');

    await page.getByLabel('현재 게임 기어').check();
    await expect(stage).toHaveAttribute('data-fit-mode', 'current');
    await waitForRenderer(page);
    expect(await frameTop(page)).toBeLessThan(0);
    await expect(stage).not.toHaveAttribute('data-renderer-key', rendererKey!);

    await page.getByLabel('레인 폭 맞춤 (위 잘림)').check();
    await waitForRenderer(page);
    expect(await frameTop(page)).toBeCloseTo(cropTop, 1);
    expect(errors).toEqual([]);
  });

  test('가로세로 같이 줄이기는 레인 폭 250·판정선 4%(y 416)·덱 위끝 429.7로 준비되고 게임 마스크를 끄며 놓친 노트 수가 늘고, 레인 폭을 최소 225.9에 놓으면 렌더러를 다시 만들어 위끝 0이 된다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    await page.getByLabel('가로세로 같이 줄이기').check();
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-fit-mode', 'uniform');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-lane-width', '250');
    await expect(stage).toHaveAttribute('data-zoom', '1.6');
    await expect(stage).toHaveAttribute('data-lift-percent', '4');
    // 렌더러에서 읽은 판정선(화면 y)과 게임 마스크 상태.
    await expect(stage).toHaveAttribute('data-judgment-line-y', '416.0');
    await expect(stage).toHaveAttribute('data-game-mask', 'hidden');
    expect(Number(await stage.getAttribute('data-deck-top-y'))).toBeCloseTo(uniformDeckTop(250), 1);
    expect(await frameTop(page)).toBeCloseTo(uniformTop(250), 1);
    await expect(page.locator('canvas[data-frame-fit-canvas]')).toHaveAttribute('height', '1080');
    await expect(page.locator('.frame-fit-readout')).toContainText('원본 1px → 화면 0.82px (축소)');
    await expect(page.locator('.frame-fit-readout')).toContainText('4% (+24) · y 416');
    await expect(page.locator('.frame-fit-caveat').first()).toContainText('노트 두께');
    await expect(page.locator('.frame-fit-readout')).toContainText('프레임 덱에서 시작');
    // 데모 판정: 5개 중 1개꼴로 놓친 노트가 생긴다.
    await expect.poll(async () => Number(await stage.getAttribute('data-missed-count')), { timeout: 15000 }).toBeGreaterThan(0);

    const slider = page.getByLabel('레인 폭', { exact: true });
    expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const firstKey = await stage.getAttribute('data-renderer-key');

    // 끄는 중(input만): 설명 숫자만 따라가고 렌더러와 확정 레인 폭은 그대로다.
    await slider.evaluate((input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '350');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('output[data-lane-width-draft]')).toContainText('350 · 현재의 87.5%');
    await page.waitForTimeout(600);
    await expect(stage).toHaveAttribute('data-renderer-key', firstKey!);
    await expect(stage).toHaveAttribute('data-lane-width', '250');

    // 놓으면(change) 잠시 뒤 최소 폭(225 → 225.9)으로 렌더러를 다시 만든다. 위끝이 화면 위에 닿는다.
    await slider.fill('225');
    await expect(stage).not.toHaveAttribute('data-renderer-key', firstKey!);
    await waitForRenderer(page);
    expect(Number(await stage.getAttribute('data-lane-width'))).toBeCloseTo(minLaneWidth, 1);
    expect(Math.abs(await frameTop(page))).toBeLessThan(0.05);
    await expect(stage).toHaveAttribute('data-lift-percent', '4');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '416.0');
    await expect(stage).toHaveAttribute('data-game-mask', 'hidden');
    await expect(page.locator('.frame-fit-readout')).toContainText('갑옷 꼭대기 보임 · 게이지 위끝 보임 · 하단 바 보임');
    expect(errors).toEqual([]);
  });

  test('판정선 높이를 8%로 올리면 렌더러를 다시 만들지 않고 판정선만 y 392로 움직이며 프레임 위끝은 그대로고, 레인 폭 320에서는 최소 10%로 다시 맞춘다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    await page.getByLabel('가로세로 같이 줄이기').check();
    const stage = page.locator(stageSelector);
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-lift-percent', '4');
    const key = await stage.getAttribute('data-renderer-key');
    await page.locator('canvas[data-frame-fit-canvas]').evaluate((canvas) => { canvas.dataset.probe = 'uniform'; });
    const topBefore = await stage.getAttribute('data-frame-top');
    const lift = page.getByLabel('판정선 높이', { exact: true });
    expect((await lift.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(lift).toHaveAttribute('min', String(minLiftPercent(250)));
    expect(minLiftPercent(250)).toBe(2);

    await lift.fill('8');
    await expect(stage).toHaveAttribute('data-lift-percent', '8');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '392.0');
    await expect(stage).toHaveAttribute('data-frame-top', topBefore!);
    await expect(stage).toHaveAttribute('data-game-mask', 'hidden');
    await page.waitForTimeout(600);
    await expect(stage).toHaveAttribute('data-renderer-key', key!);
    await expect(page.locator('canvas[data-frame-fit-canvas]')).toHaveAttribute('data-probe', 'uniform');
    await expect(page.locator('.frame-fit-readout')).toContainText('8% (+48) · y 392');

    // 레인 폭 300(최소 8%)으로 다시 만들어도 8%를 다시 걸고 게임 마스크도 다시 끈다.
    const laneWidth = page.getByLabel('레인 폭', { exact: true });
    await laneWidth.fill('300');
    await expect(stage).toHaveAttribute('data-lane-width', '300');
    await waitForRenderer(page);
    expect(minLiftPercent(300)).toBe(8);
    await expect(stage).toHaveAttribute('data-judgment-line-y', '392.0');
    await expect(stage).toHaveAttribute('data-game-mask', 'hidden');
    expect(Number(await stage.getAttribute('data-deck-top-y'))).toBeCloseTo(uniformDeckTop(300), 1);

    // 레인 폭 320에서는 덱 위끝이 382라 최소 10%로 올라간다.
    await laneWidth.fill('320');
    await expect(stage).toHaveAttribute('data-lane-width', '320');
    await waitForRenderer(page);
    expect(minLiftPercent(320)).toBe(10);
    await expect(stage).toHaveAttribute('data-lift-percent', '10');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '380.0');

    // 레인 폭을 놓은 직후(0.25초 대기 중) 다른 방식으로 바꿔도 놓은 값(300)이 확정되고, 돌아오면 그 값이 남아 있다.
    await laneWidth.fill('300');
    await page.getByLabel('레인 폭 맞춤 (위 잘림)').check();
    await waitForRenderer(page);
    await page.getByLabel('가로세로 같이 줄이기').check();
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-lane-width', '300');
    await expect(page.locator('output[data-lane-width-draft]')).toContainText('300 · 현재의 75%');

    // 다른 방식으로 돌아가면 게임 마스크가 다시 보이고 판정선은 440이다.
    await page.getByLabel('레인 폭 맞춤 (위 잘림)').check();
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-game-mask', 'visible');
    await expect(stage).toHaveAttribute('data-lift-percent', '0');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '440.0');
    expect(errors).toEqual([]);
  });

  test('렌더 높이를 1440으로 바꾸면 렌더러를 새로 만들어 캔버스가 2.4배 크기로 다시 준비되고 비행 장면도 바꿀 수 있다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    const canvas = page.locator('canvas[data-frame-fit-canvas]');
    await expect(canvas).toHaveAttribute('height', '1080');

    await page.getByLabel('1440').check();
    await expect(page.locator(stageSelector)).toHaveAttribute('data-render-height', '1440');
    await waitForRenderer(page);
    await expect(canvas).toHaveAttribute('height', '1440');
    expect(Number(await canvas.getAttribute('width'))).toBeCloseTo(1067 * 2.4, -1);
    await expect(page.locator('.frame-fit-readout')).toContainText('원본 1px → 화면 1.74px (확대)');

    await page.getByLabel('BREAKTHROUGH').check();
    await waitForRenderer(page);
    await expect(page.locator('[data-flight-background]')).toHaveAttribute('data-flight-background', 'breakthrough');
    expect(errors).toEqual([]);
  });

  test('crop 모드에서 레인 창은 레인 영역 333.5~733.5에 맞고 판정선 위 레인 가운데는 프레임 그림이 투명, 기둥 게이지 자리는 화면에 파랗게 그려진다', async ({ page }) => {
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-lane-window', '333.50-733.50');
    const frameX = Number(await stage.getAttribute('data-frame-x'));
    const frameScale = Number(await stage.getAttribute('data-frame-scale'));
    const top = await frameTop(page);
    const toSource = (x: number, y: number) => ({ x: Math.floor((x - frameX) / frameScale), y: Math.floor((y - top) / frameScale) });

    // 프레임 그림 자체: 레인 가운데(533.5, 220)는 투명, 레인 왼쪽 경계 바로 밖 기둥 윤곽은 불투명.
    const laneCentre = toSource(533.5, 220);
    const pillarEdge = { x: geometry.laneLeft - 1, y: laneCentre.y };
    const alphas = await page.evaluate(async (points) => {
      const image = new Image();
      image.src = '/lab/classic-frame-fit/frame-cutout.png';
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      return points.map((point) => context.getImageData(point.x, point.y, 1, 1).data[3]);
    }, [laneCentre, pillarEdge]);
    expect(alphas).toEqual([0, 255]);

    // 실제 화면: 왼쪽 게이지 유리 안(원본 172, 800)이 레이아웃이 말한 자리에 파란빛으로 보인다.
    const gauge = { x: frameX + 172 * frameScale, y: top + 800 * frameScale };
    const host = page.locator('.frame-fit-canvas-host');
    const box = (await host.boundingBox())!;
    const shot = (await host.screenshot()).toString('base64');
    const pixel = await page.evaluate(async ({ shot, fx, fy }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${shot}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return [...context.getImageData(Math.round(fx * image.naturalWidth), Math.round(fy * image.naturalHeight), 1, 1).data];
    }, { shot, fx: gauge.x / 1067, fy: gauge.y / 600 });
    expect(box.width).toBeGreaterThan(0);
    const [red, , blue] = pixel;
    expect(blue).toBeGreaterThan(160);
    expect(blue - red).toBeGreaterThan(60);
  });

  test('1:1 픽셀 보기에서는 캔버스 CSS 크기가 백버퍼 픽셀 ÷ devicePixelRatio가 되고 무대 안에서만 스크롤한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    await page.getByLabel('1:1 픽셀').check();
    await expect(page.locator(stageSelector)).toHaveAttribute('data-view', 'pixel');

    const sizes = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-frame-fit-canvas]')!;
      const host = canvas.parentElement!.getBoundingClientRect();
      const viewport = document.querySelector('.frame-fit-viewport')!;
      const main = document.querySelector('[data-lab-page="classic-frame-fit"]')!;
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

  test('가로세로 같이 줄이기에서 움직임이 켜져 벽시계로 흐르고, 처음부터 재생·움직임 토글·A 큰 광원 체크가 무대 data 속성에 반영되고 켬·끔 프레임 간격을 따로 모으며 기둥 잘라 줄이기에서는 얹지 않는다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    // 기본 레인 폭 맞춤(crop)도 한 장 배치라 움직임을 얹는다.
    await expect(stage).toHaveAttribute('data-motion', 'on');
    await expect(stage).toHaveAttribute('data-motion-ready', 'true');
    for (const label of ['움직임', 'A 큰 광원', 'B 게이지 액체', 'C 발광선 호흡', 'D 하단 바 흐름']) {
      await expect(page.getByLabel(label, { exact: true })).toBeChecked();
    }

    await page.getByLabel('가로세로 같이 줄이기').check();
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-motion-ready', 'true');
    await expect(stage).toHaveAttribute('data-motion', 'on');
    // 움직임 시계는 렌더러를 다시 만들어도 이어지는 벽시계다.
    const first = (await motionTime(page))!;
    await expect.poll(async () => (await motionTime(page)) ?? 0, { timeout: 10000 }).toBeGreaterThan(first + 300);

    await page.getByRole('button', { name: '처음부터 재생' }).click();
    await expect.poll(async () => (await motionTime(page)) ?? Infinity, { timeout: 5000 }).toBeLessThan(2000);

    // 움직임을 끄면 왼쪽 장갑 픽셀이 바뀐다(띠 밖 7% 어둡게·빛 받은 대비 복사본이 사라진다).
    const host = page.locator('.frame-fit-canvas-host');
    const region = await leftArmorRegion(page);
    const withMotion = await host.screenshot();
    await page.getByLabel('움직임', { exact: true }).uncheck();
    await expect(stage).toHaveAttribute('data-motion', 'off');
    await expect.poll(() => motionTime(page)).toBeNull();
    const withoutMotion = await host.screenshot();
    expect(await meanDifference(page, withMotion, withoutMotion, region)).toBeGreaterThan(2);
    // 프레임 간격(rAF) 평균/p95를 움직임 켬·끔으로 나눠 모은다.
    const statsPattern = /^\d+\.\d{2}\/\d+\.\d{2}$/;
    await expect(stage).toHaveAttribute('data-frame-time-on', statsPattern);
    await expect(stage).toHaveAttribute('data-frame-time-off', statsPattern, { timeout: 10000 });
    await expect(page.locator('.frame-fit-readout')).toContainText(/프레임 간격 · 움직임 끔\s*평균 [\d.]+ms · p95 [\d.]+ms/);
    await page.getByLabel('움직임', { exact: true }).check();
    await expect(stage).toHaveAttribute('data-motion', 'on');
    await expect.poll(() => motionTime(page)).not.toBeNull();

    await page.getByLabel('A 큰 광원', { exact: true }).uncheck();
    await expect(stage).toHaveAttribute('data-motion-armor', 'off');
    await expect(stage).toHaveAttribute('data-motion-gauge', 'on');
    await page.getByLabel('A 큰 광원', { exact: true }).check();
    await expect(stage).toHaveAttribute('data-motion-armor', 'on');

    // 두 조각으로 그리는 방식에는 움직임을 얹지 않는다.
    await page.getByLabel('기둥 잘라 줄이기').check();
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-motion', 'off');
    await expect.poll(() => motionTime(page)).toBeNull();
    await expect(page.locator('.frame-fit-motion')).toContainText('레인 폭 맞춤·가로세로 같이 줄이기');
    expect(errors).toEqual([]);
  });

  test('움직임 자료(frame-motion.json)를 붙잡아 두면 게임 렌더러가 먼저 준비되고(data-motion-ready false), 자료를 놓으면 렌더러를 다시 만들지 않고 움직임을 얹는다', async ({ page }) => {
    const errors = collectErrors(page);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/lab/classic-frame-fit/motion/frame-motion.json', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-motion-ready', 'false');
    const key = await stage.getAttribute('data-renderer-key');
    await page.locator('canvas[data-frame-fit-canvas]').evaluate((canvas) => { canvas.dataset.probe = 'early'; });

    release();
    await expect(stage).toHaveAttribute('data-motion-ready', 'true', { timeout: 30000 });
    await expect(stage).toHaveAttribute('data-renderer-key', key!);
    await expect(page.locator('canvas[data-frame-fit-canvas]')).toHaveAttribute('data-probe', 'early');
    await expect.poll(() => motionTime(page), { timeout: 10000 }).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('움직임 줄이기 설정이면 무대 data-motion이 reduced이고 움직임 시계가 흐르지 않으며 비교 SVG 애니메이션도 돌지 않는다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/lab/classic-frame-fit');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-motion', 'reduced');
    await expect(stage).toHaveAttribute('data-motion-ready', 'true');
    await page.waitForTimeout(800);
    expect(await motionTime(page)).toBeNull();
    await expect(page.locator('.frame-fit-motion')).toContainText('움직임 줄이기');
    await page.locator('[data-frame-motion-compare]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-frame-motion-compare]')).toHaveAttribute('data-compare-ready', 'true', { timeout: 60000 });
    const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length);
    expect(running).toBe(0);
    expect(errors).toEqual([]);
  });
});
