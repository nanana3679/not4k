import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// 기어 측정값(prepare-frame-fit-v20.mjs → src/game/renderer/gearGeometry.json). 미리보기는 실제 게임 렌더러 배치를 그대로 알린다.
const geometry = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/game/renderer/gearGeometry.json', import.meta.url)), 'utf8')) as {
  laneLeft: number; laneRight: number; deckTop: number; silhouetteBottom: number; laneOpeningBottom: number;
  laneOpening: { rows: [number, number, number][] };
};
const laneWindow = geometry.laneRight - geometry.laneLeft + 1;
// 레인 영역 250(플레이필드 배율 0.625), 논리 높이 600, 기어 실루엣 아래끝(silhouetteBottom + 1행)을 화면 아래에 붙인다.
const scale = 250 / laneWindow;
const gearTop = 600 - (geometry.silhouetteBottom + 1) * scale;
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

/** 기어 그림 public/gear/gear.png의 원본 좌표 RGB. */
async function gearColour(page: Page, points: { x: number; y: number }[]): Promise<number[][]> {
  return page.evaluate(async (points) => {
    const image = new Image();
    image.src = '/gear/gear.png';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    return points.map((point) => [...context.getImageData(point.x, point.y, 1, 1).data].slice(0, 3));
  }, points);
}

/** 기어 그림 좌표 점들을 무대 논리 좌표로 바꾸는 함수(살아 있는 렌더러가 알린 기어 배치). */
async function gearToStage(page: Page) {
  const gearX = await numberAttribute(page, 'data-gear-x');
  const gearScale = await numberAttribute(page, 'data-gear-scale');
  const top = await numberAttribute(page, 'data-gear-top');
  return (point: { x: number; y: number }) => ({ x: gearX + point.x * gearScale, y: top + point.y * gearScale });
}

/** 곡 진행 따라가기를 끄고 고도 직접 정하기 슬라이더를 percent로 옮긴 뒤 게이지가 그 채움에 붙을 때까지 기다린다. */
async function setAltitude(page: Page, percent: number) {
  // 따라가기를 끄면 그때 보이던 채움으로 고정되고 슬라이더도 그 %로 옮겨진다. 슬라이더가 이미 그 값이면 fill이 변경 이벤트를 내지 않으므로
  // 이웃 값을 먼저 거쳐 정확히 percent ÷ 100으로 고정한다.
  await page.getByLabel('곡 진행 따라가기').uncheck();
  const slider = page.locator('#gear-preview-altitude');
  if (await slider.inputValue() === String(percent)) await slider.fill(String(percent === 100 ? 99 : percent + 1));
  await slider.fill(String(percent));
  const stage = page.locator(stageSelector);
  await expect(stage).toHaveAttribute('data-altitude-mode', 'manual');
  await expect(stage).toHaveAttribute('data-altitude-percent', String(percent));
  await expect(stage).toHaveAttribute('data-gear-gauge-level', (percent / 100).toFixed(3), { timeout: 5000 });
}

// 두 유리관 가운데 열(왼쪽 172, 반전한 오른쪽 851)의 표본 행. 채움 구간은 196~1016행(821행)이다.
const TUBE_COLUMNS = [172, 851];
const isEmptyGlass = ([r, g, b]: number[]) => b < 70 && g < 50 && r < 40;
const isLitLiquid = ([, g, b]: number[]) => b > 200 && g > 150;

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
      await page.getByRole('link', { name: /^Gear\b/ }).click();
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

    // 고도 100%로 정하면 왼쪽 게이지 유리 안(원본 172, 800)은 화면에 파란빛으로 보인다(게이지가 그림 그대로 가득).
    await setAltitude(page, 100);
    const [gauge] = await pixelsAt(page, [{ x: gearX + 172 * gearScale, y: top + 800 * gearScale }]);
    expect(gauge[2]).toBeGreaterThan(160);
    expect(gauge[2] - gauge[0]).toBeGreaterThan(60);
    expect(errors).toEqual([]);
  });

  test('고도는 곡 진행 따라가기로 시작해 무대에 게이지 채움을 알리고, 직접 30%로 정하면 두 유리관 모두 채움 경계(771행) 위는 빈 유리로 어둡고 아래는 청록 액체다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-altitude-mode', 'follow');
    // 곡 진행 따라가기: 시연 차트(약 3분) 앞부분이라 게이지가 거의 가득이다.
    await expect.poll(async () => Number(await stage.getAttribute('data-gear-gauge-level'))).toBeGreaterThan(0.5);
    await expect(page.locator('.gear-preview-readout')).toContainText('유리관 게이지');
    // `gearMotion`을 끄면 정적 기어만 남아 픽셀이 시간에 따라 바뀌지 않는다.
    await page.getByLabel('움직임', { exact: true }).uncheck();
    await expect(stage).toHaveAttribute('data-motion', 'off');

    await setAltitude(page, 30);
    await expect(page.locator('.gear-preview-readout')).toContainText('30% · 빈 유리 575/821행');
    const toStage = await gearToStage(page);
    const above = await pixelsAt(page, TUBE_COLUMNS.flatMap((x) => [300, 500, 740].map((y) => toStage({ x, y }))));
    const below = await pixelsAt(page, TUBE_COLUMNS.flatMap((x) => [800, 900].map((y) => toStage({ x, y }))));
    for (const pixel of above) expect(isEmptyGlass(pixel), `빈 유리 ${pixel}`).toBe(true);
    for (const pixel of below) expect(isLitLiquid(pixel), `액체 ${pixel}`).toBe(true);
    expect(errors).toEqual([]);
  });

  test('곡 진행 따라가기를 끄면 그 순간 보이던 채움 그대로 고정되어 슬라이더가 그 %를 가리키고, 1.5초가 지나도 게이지가 움직이지 않는다(시작값 100%로 뛰지 않음)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    // 데모 곡이 몇 초 흘러 따라가는 고도가 1보다 확실히 낮아진 뒤 끈다(약 3분 동안 1 → 0, 1초에 약 0.0055).
    await expect.poll(async () => Number(await stage.getAttribute('data-gear-gauge-level')), { timeout: 20000 }).toBeLessThan(0.985);
    // 끄기 직전 채움을 같은 JS 작업 안에서 읽고 바로 체크를 끈다(Playwright 조작 대기 동안 따라가는 고도가 내려가지 않게).
    const followed = await page.evaluate(() => {
      const stageElement = document.querySelector<HTMLElement>('[data-gear-preview-stage="true"]')!;
      const level = Number(stageElement.dataset.gearGaugeLevel);
      const follow = [...document.querySelectorAll<HTMLLabelElement>('.gear-preview-altitude label')]
        .find((label) => label.textContent?.includes('곡 진행 따라가기'))!.querySelector('input')!;
      follow.click();
      return level;
    });
    await expect(stage).toHaveAttribute('data-altitude-mode', 'manual');
    await expect(page.getByLabel('곡 진행 따라가기')).not.toBeChecked();
    // 고정값이 렌더러에 걸릴 때까지 몇 프레임 기다린 뒤 읽는다(그 사이 따라가던 고도가 0.001 넘게 바뀔 수 있다).
    await page.waitForTimeout(300);
    const held = Number(await stage.getAttribute('data-gear-gauge-level'));
    expect(Math.abs(held - followed)).toBeLessThanOrEqual(0.003);
    expect(held).toBeLessThan(0.99);
    await expect(page.locator('#gear-preview-altitude')).toHaveValue(String(Math.round(held * 100)));
    await expect(stage).toHaveAttribute('data-altitude-percent', String(Math.round(held * 100)));
    await page.waitForTimeout(1500);
    // 따라가기였다면 1.5초 동안 약 0.008 내려갔겠지만, 고정되어 소수 셋째 자리까지 그대로다.
    await expect(stage).toHaveAttribute('data-gear-gauge-level', held.toFixed(3));
    expect(errors).toEqual([]);
  });

  test('고도 100%면 두 유리관이 기어 그림과 같은 색(채널 차 24 이내)이고, 0%면 위에서 아래까지 모두 빈 유리이며, 곡 진행 따라가기를 다시 켜면 고정이 풀린다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await page.getByLabel('움직임', { exact: true }).uncheck();
    const toStage = await gearToStage(page);
    const points = TUBE_COLUMNS.flatMap((x) => [300, 500, 900].map((y) => ({ x, y })));

    await setAltitude(page, 100);
    await expect(page.locator('.gear-preview-readout')).toContainText('100% · 그림 그대로');
    const painted = await gearColour(page, points);
    const full = await pixelsAt(page, points.map(toStage));
    full.forEach((pixel, index) => {
      const difference = Math.max(...[0, 1, 2].map((channel) => Math.abs(pixel[channel] - painted[index][channel])));
      expect(difference, `${JSON.stringify(points[index])} 화면 ${pixel} 그림 ${painted[index]}`).toBeLessThanOrEqual(24);
    });

    await setAltitude(page, 0);
    const empty = await pixelsAt(page, TUBE_COLUMNS.flatMap((x) => [300, 600, 900].map((y) => toStage({ x, y }))));
    for (const pixel of empty) expect(isEmptyGlass(pixel), `빈 유리 ${pixel}`).toBe(true);

    await page.getByLabel('곡 진행 따라가기').check();
    await expect(stage).toHaveAttribute('data-altitude-mode', 'follow');
    await expect.poll(async () => Number(await stage.getAttribute('data-gear-gauge-level')), { timeout: 5000 }).toBeGreaterThan(0.5);
    expect(errors).toEqual([]);
  });

  test('gearMotion이 켜져 있어도 고도 30%에서 채움 경계 위 유리 안에는 gearMotion의 액체·기포가 보이지 않는다(빈 유리 덮개가 gearMotion 위)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-motion', 'on');
    await setAltitude(page, 30);
    const toStage = await gearToStage(page);
    // 액체 타일(45%)이 흐르고 기포가 오르는 동안 몇 번 찍어도 경계 위는 늘 빈 유리다.
    for (let shot = 0; shot < 3; shot++) {
      const above = await pixelsAt(page, TUBE_COLUMNS.flatMap((x) => [300, 500, 740].map((y) => toStage({ x, y }))));
      for (const pixel of above) expect(isEmptyGlass(pixel), `빈 유리 ${pixel}`).toBe(true);
      await page.waitForTimeout(300);
    }
    const below = await pixelsAt(page, TUBE_COLUMNS.map((x) => toStage({ x, y: 900 })));
    for (const pixel of below) expect(isLitLiquid(pixel), `액체 ${pixel}`).toBe(true);
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

  test('렌더러 내장 gearMotion이 켜져 애니메이션 경과 시간이 렌더 프레임마다 흐르고, 처음부터 재생·gearMotion 토글(라벨 움직임)·A 큰 광원 체크가 무대 data 속성에 반영되며 켬·끔 프레임 간격을 따로 모은다', async ({ page }) => {
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

    // `gearMotion`을 끄면 왼쪽 장갑(원본 x 40~190, y 300~900) 픽셀이 바뀐다(띠 밖 7% 어둡게·빛 받은 대비 복사본이 사라진다).
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

  test('키보드 표시에서 레인 1 KeyQ는 은색·레인 2 KeyD는 파란색으로 대기하고, 누르는 동안 KeyQ는 청록·KeyD는 흰색에 가까운 파랑으로 밝아지며, 떼면 대기 색으로 돌아온다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    // 16:9(1067) TKL은 원래 크기로 x 859.5, y 524.5에 놓이고 키 한 칸은 11(키 10 + 간격 1)이다.
    const keyCenter = (unitX: number, unitY: number) => ({ x: 859.5 + unitX * 11 + 5, y: 524.5 + unitY * 11 + 5 });
    const keys = { KeyQ: keyCenter(1.5, 2.5), KeyD: keyCenter(3.75, 3.5) };
    // 비행 배경의 빛줄기가 한 점에 겹쳐도 흔들리지 않게 키 안쪽 다섯 점의 평균을 쓴다.
    const keyColor = async (center: { x: number; y: number }) => {
      const offsets = [[0, 0], [-2, -2], [2, -2], [-2, 2], [2, 2]];
      const pixels = await pixelsAt(page, offsets.map(([dx, dy]) => ({ x: center.x + dx, y: center.y + dy })));
      return [0, 1, 2].map((channel) => pixels.reduce((sum, pixel) => sum + pixel[channel], 0) / pixels.length);
    };
    const brightness = (rgb: number[]) => rgb[0] + rgb[1] + rgb[2];

    const idleQ = await keyColor(keys.KeyQ);
    const idleD = await keyColor(keys.KeyD);
    // 대기: 레인 2·4 파란색은 파랑이 빨강보다 레인 1·3 은색보다도 확실히 더 밝다.
    expect((idleD[2] - idleD[0]) - (idleQ[2] - idleQ[0])).toBeGreaterThanOrEqual(15);
    await page.keyboard.down('KeyQ');
    await page.keyboard.down('KeyD');
    // swiftshader에서 무대 스크린샷 한 장이 수 초 걸릴 수 있어 기다림을 넉넉히 둔다.
    await expect.poll(async () => brightness(await keyColor(keys.KeyQ)) - brightness(idleQ), { timeout: 30_000 }).toBeGreaterThan(200);
    const litQ = await keyColor(keys.KeyQ);
    const litD = await keyColor(keys.KeyD);
    expect(brightness(litD) - brightness(idleD)).toBeGreaterThan(200);
    // 둘 다 빨강보다 파랑이 밝고, 레인 1 청록은 초록이 파랑과 비슷하며 레인 2 흰빛 파랑은 파랑이 초록보다 더 밝다.
    for (const lit of [litQ, litD]) expect(lit[2] - lit[0]).toBeGreaterThanOrEqual(15);
    expect(litQ[1] - litQ[0]).toBeGreaterThanOrEqual(15);
    expect((litD[2] - litD[1]) - (litQ[2] - litQ[1])).toBeGreaterThanOrEqual(10);

    await page.keyboard.up('KeyQ');
    await page.keyboard.up('KeyD');
    await expect.poll(async () => Math.abs(brightness(await keyColor(keys.KeyQ)) - brightness(idleQ)), { timeout: 30_000 }).toBeLessThan(60);
    expect(Math.abs(brightness(await keyColor(keys.KeyD)) - brightness(idleD))).toBeLessThan(60);
    expect(errors).toEqual([]);
  });

  test('gearMotion 에셋(/gear/gear-motion/gear-motion.json) 응답을 보류하면 게임처럼 렌더러 준비도 기다리고(data-renderer-ready false), 응답을 보내면 gearMotion을 추가한 채 준비된다', async ({ page }) => {
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
    // `gearMotion` 에셋은 렌더러 준비에 필요한 에셋이라, 응답이 보류된 동안 렌더러는 준비되지 않는다(비행 배경이 준비되어도).
    await expect(page.locator('[data-flight-background][data-ready="true"]')).toHaveCount(1, { timeout: 60000 });
    await expect(stage).toHaveAttribute('data-renderer-ready', 'false');
    await expect(stage).toHaveAttribute('data-motion-ready', 'false');

    release();
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-motion-ready', 'true');
    await expect.poll(() => motionTime(page), { timeout: 10000 }).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('모션 감소 설정(prefers-reduced-motion: reduce)이 켜져 있어도 무대 data-motion은 on이고 애니메이션 경과 시간이 300ms를 넘게 흐르며, 비교 SVG는 #fm-lit·#fm-unlit을 숨기지 않고 CSS 애니메이션 10개 넘게를 그대로 가진다(RFD 0030)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-motion', 'on');
    await expect(stage).toHaveAttribute('data-motion-ready', 'true');
    await expect.poll(async () => (await motionTime(page)) ?? 0, { timeout: 10000 }).toBeGreaterThan(300);
    await page.locator('[data-gear-motion-compare]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-gear-motion-compare]')).toHaveAttribute('data-compare-ready', 'true', { timeout: 60000 });
    // 보관 승인 SVG의 모션 감소 규칙(@media)은 문서에 넣기 전에 걷어 내므로, 운영체제 설정이 켜져 있어도 레이어와 애니메이션이 남는다.
    const svgState = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-gear-motion-svg-host] svg')!;
      return {
        osReduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        hidden: ['#fm-lit', '#fm-unlit'].filter((selector) => getComputedStyle(svg.querySelector(selector)!).display === 'none'),
        animations: svg.getAnimations({ subtree: true }).length,
        reduceRuleLeft: [...svg.querySelectorAll('style')].some((style) => (style.textContent ?? '').includes('prefers-reduced-motion')),
      };
    });
    expect(svgState).toMatchObject({ osReduce: true, hidden: [], reduceRuleLeft: false });
    expect(svgState.animations).toBeGreaterThan(10);
    for (const layer of ['armor', 'gauge', 'accent', 'bar']) {
      await expect(page.locator(`[data-gear-motion-svg-host] svg #fm-${layer}`)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
