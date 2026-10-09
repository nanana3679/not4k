import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { GEAR_DROP } from '../../src/game/renderer/constants';

// 기어 측정값(prepare-frame-fit-v20.mjs → src/game/renderer/gearGeometry.json). 미리보기는 실제 게임 렌더러 배치를 그대로 알린다.
const geometry = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/game/renderer/gearGeometry.json', import.meta.url)), 'utf8')) as {
  laneLeft: number; laneRight: number; deckTop: number; silhouetteBottom: number; laneOpeningBottom: number;
  laneOpening: { rows: [number, number, number][] };
};
const laneWindow = geometry.laneRight - geometry.laneLeft + 1;
// 레인 영역 250(플레이필드 배율 0.625), 논리 높이 600. 게임은 기어 실루엣 아래끝(silhouetteBottom + 1행)을 화면 아래보다
// GEAR_DROP(10, #257)만큼 아래에 두고 판정선도 같은 양만큼 내린다.
const scale = 250 / laneWindow;
const gearTop = 600 - (geometry.silhouetteBottom + 1) * scale + GEAR_DROP;
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

/** 기어·판정선 내리기 슬라이더에 값을 넣고 input 이벤트를 보낸다(끄는 동작 한 번). */
async function inputGearDrop(page: Page, value: number) {
  await page.evaluate((value) => {
    const slider = document.getElementById('gear-preview-drop') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, String(value));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/** 페이지를 다시 읽지 않고 바깥에서 주소를 바꾼다: 방문 기록에 url을 넣고 popstate를 보내 라우터와 페이지가 주소를 다시 읽게 한다. */
async function pushExternalUrl(page: Page, url: string) {
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

/** 슬라이더 값, 주소 쿼리, 렌더러에 넘긴 값(무대 data-gear-drop). */
async function gearDropState(page: Page) {
  return page.evaluate(() => ({
    slider: (document.getElementById('gear-preview-drop') as HTMLInputElement).value,
    search: location.search,
    stage: document.querySelector('[data-gear-preview-stage="true"]')!.getAttribute('data-gear-drop'),
  }));
}

/** 페이지가 부르는 history.replaceState 수를 센다. */
async function countReplaceState(page: Page) {
  await page.addInitScript(() => {
    const counter = { replace: 0 };
    (window as typeof window & { __replaceCalls: typeof counter }).__replaceCalls = counter;
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<History['replaceState']>) => { counter.replace += 1; replace(...args); };
  });
  return () => page.evaluate(() => (window as typeof window & { __replaceCalls: { replace: number } }).__replaceCalls.replace);
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

  test('게임 렌더러가 레인 창(408.5~658.5)을 레인 영역 250에 맞춰 기어를 놓고 기어와 함께 10 내린 판정선 y 426·덱 위끝 439.7·키 윗면 456.5를 알리며 놓친 노트 수가 는다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-lane-window', '408.50-658.50');
    await expect(stage).toHaveAttribute('data-gear-drop', '10');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '426.0');
    expect(await numberAttribute(page, 'data-deck-top-y')).toBeCloseTo(deckTopY, 1);
    expect(await numberAttribute(page, 'data-key-rim-y')).toBeCloseTo(keyRimY, 1);
    await expect(stage).toHaveAttribute('data-deck-top-y', '439.7');
    await expect(stage).toHaveAttribute('data-key-rim-y', '456.5');
    expect(await numberAttribute(page, 'data-gear-top')).toBeCloseTo(gearTop, 1);
    expect(await numberAttribute(page, 'data-gear-scale')).toBeCloseTo(scale, 5);
    await expect(page.locator('canvas[data-gear-preview-canvas]')).toHaveAttribute('height', '1080');
    await expect(page.locator('.gear-preview-readout')).toContainText('원본 1px → 화면 0.82px (축소)');
    await expect(page.locator('.gear-preview-readout')).toContainText('0% (+0) · y 426');
    await expect(page.locator('.gear-preview-readout')).toContainText(/판정선 · 키 윗면\(레인 끝\)\s*y 456\.5까지 30\.5 · 노트 두께 2\.4개/);
    await expect(page.locator('[data-gear-drop-readout]')).toHaveText('판정선 y 426 · 키 윗면 y 456.5 · 틈 30.5 · 아래로 원본 22.1행 잘림');
    await expect.poll(async () => numberAttribute(page, 'data-missed-count'), { timeout: 15000 }).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('리프트를 4%로 올리면 렌더러를 다시 만들지 않고 판정선만 y 426에서 402로 움직이며 기어 위치와 덱·키 윗면(456.5)은 그대로다', async ({ page }) => {
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
    await expect(stage).toHaveAttribute('data-judgment-line-y', '402.0');
    await expect(stage).toHaveAttribute('data-gear-top', topBefore!);
    await expect(stage).toHaveAttribute('data-key-rim-y', '456.5');
    await expect(stage).toHaveAttribute('data-renderer-key', key!);
    await expect(page.locator('canvas[data-gear-preview-canvas]')).toHaveAttribute('data-probe', 'first');
    await expect(page.locator('.gear-preview-readout')).toContainText('4% (+24) · y 402');
    expect(errors).toEqual([]);
  });

  test('주소 drop은 절대 내림 양이라 ?drop=0이면 내리지 않은 배치(판정선 y 416·키 윗면 446.5)이고, ?drop=20이면 판정선 y·키 윗면 y·기어 위끝이 그보다 20 아래(436.0·466.5)이며 화면 아래로 원본 44.2행이 잘린다고 보여 준다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear?drop=0');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-gear-drop', '0');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '416.0');
    await expect(stage).toHaveAttribute('data-key-rim-y', '446.5');
    await expect(page.locator('[data-gear-drop-readout]')).toHaveText('판정선 y 416 · 키 윗면 y 446.5 · 틈 30.5 · 아래로 잘리는 행 없음');
    const baseLine = await numberAttribute(page, 'data-judgment-line-y');
    const baseRim = await numberAttribute(page, 'data-key-rim-y');
    const baseTop = await numberAttribute(page, 'data-gear-top');

    await page.goto('/lab/gear?drop=20');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-gear-drop', '20');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '436.0');
    await expect(stage).toHaveAttribute('data-key-rim-y', '466.5');
    expect(await numberAttribute(page, 'data-judgment-line-y') - baseLine).toBeCloseTo(20, 5);
    expect(await numberAttribute(page, 'data-key-rim-y') - baseRim).toBeCloseTo(20, 5);
    expect(await numberAttribute(page, 'data-gear-top') - baseTop).toBeCloseTo(20, 1);
    await expect(page.locator('#gear-preview-drop')).toHaveValue('20');
    await expect(page.locator('#gear-preview-drop-value')).toHaveValue('20');
    await expect(page.locator('[data-gear-drop-readout]')).toHaveText('판정선 y 436 · 키 윗면 y 466.5 · 틈 30.5 · 아래로 원본 44.2행 잘림');
    await expect(page.locator('.gear-preview-readout')).toContainText('0% (+0) · y 436');
    expect(errors).toEqual([]);
  });

  test('기어·판정선 내리기는 게임 값 10에서 시작하고, 슬라이더를 12.5로 옮기면 주소가 ?drop=12.5로 바뀌고 렌더러를 새로 만들어 판정선 y 428.5·키 윗면 459.0이 되며, 리프트 4%는 판정선만 404.5로 올리고, 숫자 입력 0이면 ?drop=0, 10이면 drop이 주소에서 빠지고 방문 기록은 쌓이지 않는다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab');
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    const keyBefore = await stage.getAttribute('data-renderer-key');
    const slider = page.locator('#gear-preview-drop');
    await expect(slider).toHaveValue('10');
    await expect(stage).toHaveAttribute('data-gear-drop', '10');
    expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.locator('#gear-preview-drop-value').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(slider).toHaveAttribute('max', '60');
    await expect(slider).toHaveAttribute('step', '0.5');

    await slider.fill('12.5');
    await expect(page).toHaveURL(/\/lab\/gear\?drop=12\.5$/);
    await expect(page.locator('#gear-preview-drop-value')).toHaveValue('12.5');
    await expect(stage).toHaveAttribute('data-gear-drop', '12.5');
    await expect(stage).not.toHaveAttribute('data-renderer-key', keyBefore!);
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-judgment-line-y', '428.5');
    await expect(stage).toHaveAttribute('data-key-rim-y', '459.0');

    await page.locator('#gear-preview-lift').fill('4');
    await expect(stage).toHaveAttribute('data-judgment-line-y', '404.5');
    await expect(stage).toHaveAttribute('data-key-rim-y', '459.0');

    await page.locator('#gear-preview-drop-value').fill('0');
    await expect(page).toHaveURL(/\/lab\/gear\?drop=0$/);
    await expect(stage).toHaveAttribute('data-gear-drop', '0');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-key-rim-y', '446.5');

    await page.locator('#gear-preview-drop-value').fill('10');
    await expect(page).toHaveURL(/\/lab\/gear$/);
    await expect(stage).toHaveAttribute('data-gear-drop', '10');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-key-rim-y', '456.5');
    // 주소를 바꿔 썼으므로(replace) 뒤로 가기는 Lab 목록으로 돌아간다.
    await page.goBack();
    await expect(page).toHaveURL(/\/lab$/);
    expect(errors).toEqual([]);
  });

  test('기어·판정선 내리기 슬라이더에 입력 이벤트 250개를 몰아 보내도 주소는 값이 멈춘 뒤 한 번만 바꿔 써(history.replaceState 2번 이하) 브라우저의 History API 호출 한도에 걸리지 않고, 마지막 값 33이 주소·무대에 남는다', async ({ page }) => {
    const errors = collectErrors(page);
    // 페이지가 부르는 history.replaceState·pushState 수를 센다(Firefox는 10초에 약 200번, Safari는 약 100번을 넘으면 SecurityError를 던진다).
    await page.addInitScript(() => {
      const counts = { replace: 0, push: 0 };
      (window as typeof window & { __historyCalls: typeof counts }).__historyCalls = counts;
      const replace = history.replaceState.bind(history);
      const push = history.pushState.bind(history);
      history.replaceState = (...args: Parameters<History['replaceState']>) => { counts.replace += 1; replace(...args); };
      history.pushState = (...args: Parameters<History['pushState']>) => { counts.push += 1; push(...args); };
    });
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const before = await page.evaluate(() => ({ ...(window as typeof window & { __historyCalls: { replace: number; push: number } }).__historyCalls }));

    // 끄는 것처럼 0 → 60 → 0 …으로 250번 바꾸고 10번마다 한 번 양보해 React가 커밋하게 한 뒤, 마지막에 33을 넣는다.
    await page.evaluate(async () => {
      const slider = document.getElementById('gear-preview-drop') as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      for (let k = 0; k < 250; k++) {
        const step = k % 121;
        setValue.call(slider, String((step <= 60 ? step : 120 - step) * 0.5));
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        if (k % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setValue.call(slider, '33');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // 숫자 입력과 설명은 값이 멈추기 전에도 바로 따른다.
    await expect(page.locator('#gear-preview-drop-value')).toHaveValue('33');
    await expect(page).toHaveURL(/\/lab\/gear\?drop=33$/);
    await expect(page.locator(stageSelector)).toHaveAttribute('data-gear-drop', '33');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ ...(window as typeof window & { __historyCalls: { replace: number; push: number } }).__historyCalls }));
    expect(after.replace - before.replace).toBeLessThanOrEqual(2);
    expect(after.push - before.push).toBe(0);
    await waitForRenderer(page);
    await expect(page.locator(stageSelector)).toHaveAttribute('data-judgment-line-y', '449.0');
    expect(errors).toEqual([]);
  });

  test('주소가 바깥에서 바뀌면(앞으로·뒤로 가기) 기어·판정선 내리기 값이 주소를 따라 슬라이더·숫자 입력·무대가 함께 바뀐다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear');
    await waitForRenderer(page);
    const stage = page.locator(stageSelector);
    await expect(stage).toHaveAttribute('data-gear-drop', '10');

    // 페이지를 다시 읽지 않는 이동: 방문 기록에 ?drop=20을 넣고 popstate를 보내 라우터가 주소를 다시 읽게 한다.
    await page.evaluate(() => {
      history.pushState(null, '', '/lab/gear?drop=20');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.locator('#gear-preview-drop')).toHaveValue('20');
    await expect(page.locator('#gear-preview-drop-value')).toHaveValue('20');
    await expect(stage).toHaveAttribute('data-gear-drop', '20');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-judgment-line-y', '436.0');

    // 뒤로 가기: 쿼리 없는 /lab/gear로 돌아오면 게임 값 10으로 돌아간다.
    await page.goBack();
    await expect(page).toHaveURL(/\/lab\/gear$/);
    await expect(page.locator('#gear-preview-drop')).toHaveValue('10');
    await expect(stage).toHaveAttribute('data-gear-drop', '10');
    await waitForRenderer(page);
    await expect(stage).toHaveAttribute('data-judgment-line-y', '426.0');
    expect(errors).toEqual([]);
  });

  // 아래 세 테스트는 주소·슬라이더·무대 data-gear-drop만 보므로 렌더러(WebGL) 준비를 기다리지 않는다(같은 시나리오를 Firefox에서도 돌릴 수 있다).
  test('값이 멈추기 전(200ms 안)에 뒤로 가기로 다른 값의 기록(?drop=20)으로 가면 남은 값 25를 주소에 쓰지 않고 20을 따르며, 앞으로 가기는 ?drop=40, 같은 값 20을 고른 채 뒤로 가도 20이다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/lab/gear?drop=20');
    await page.locator('#gear-preview-drop').waitFor();
    await pushExternalUrl(page, '/lab/gear?drop=40');
    await expect.poll(() => gearDropState(page)).toEqual({ slider: '40', search: '?drop=40', stage: '40' });

    // 렌더러를 새로 만드는 동안(swiftshader) 메인 스레드가 막혀 타이머가 늦을 수 있어 멈춘 상태를 기다린 뒤, 그 뒤에도 주소가 덮이지 않았는지 본다.
    const settledAt = async (expected: { slider: string; search: string; stage: string }) => {
      await expect.poll(() => gearDropState(page), { timeout: 10000 }).toEqual(expected);
      await page.waitForTimeout(400);
      expect(await gearDropState(page)).toEqual(expected);
    };
    const historyLength = await page.evaluate(() => history.length);
    await inputGearDrop(page, 25);
    await page.evaluate(() => history.back());
    await settledAt({ slider: '20', search: '?drop=20', stage: '20' });
    await page.evaluate(() => history.forward());
    await settledAt({ slider: '40', search: '?drop=40', stage: '40' });

    await inputGearDrop(page, 20);
    await page.evaluate(() => history.back());
    await settledAt({ slider: '20', search: '?drop=20', stage: '20' });
    await page.evaluate(() => history.forward());
    await settledAt({ slider: '40', search: '?drop=40', stage: '40' });
    // 이동 사이에 기록을 더하지 않았다.
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(errors).toEqual([]);
  });

  for (const destination of ['?drop=20', '?drop=20.0']) {
    test(`?drop=20에서 33으로 바꾸고 값이 멈추기 전에 같은 값의 주소(${destination})로 이동하면 남은 33을 그 기록에 덮어쓰지 않고(replaceState 0번) 20을 따른다`, async ({ page }) => {
      const errors = collectErrors(page);
      const replaceCalls = await countReplaceState(page);
      await page.goto('/lab/gear?drop=20');
      await page.locator('#gear-preview-drop').waitFor();
      await expect.poll(() => gearDropState(page)).toEqual({ slider: '20', search: '?drop=20', stage: '20' });
      const before = await replaceCalls();

      await inputGearDrop(page, 33);
      await expect(page.locator('#gear-preview-drop-value')).toHaveValue('33');
      await pushExternalUrl(page, `/lab/gear${destination}`);
      await page.waitForTimeout(600);
      expect(await gearDropState(page)).toEqual({ slider: '20', search: destination, stage: '20' });
      expect(await replaceCalls()).toBe(before);
      expect(errors).toEqual([]);
    });
  }

  test('값이 멈춰 주소를 ?drop=30으로 바꿔 쓴 바로 다음(같은 작업)에 뒤로 가기가 그 쓰기를 앞지르면 ?drop=20 기록을 따르고(무대도 20), 앞으로 가기로 돌아온 기록은 쓴 값 30 그대로이며 덮어쓰지 않는다', async ({ page }) => {
    const errors = collectErrors(page);
    const replaceCalls = await countReplaceState(page);
    await page.goto('/lab/gear?drop=20');
    await page.locator('#gear-preview-drop').waitFor();
    await pushExternalUrl(page, '/lab/gear?drop=40');
    await expect.poll(() => gearDropState(page)).toEqual({ slider: '40', search: '?drop=40', stage: '40' });

    // 페이지의 다음 replaceState(값이 멈춘 뒤 주소 쓰기) 바로 뒤에 같은 작업에서 뒤로 가기를 부른다. react-router가 위치 갱신을
    // startTransition으로 미루므로 쓴 위치(?drop=30)는 그리지 않고 지나갈 수 있다.
    await page.evaluate(() => {
      const original = history.replaceState.bind(history);
      history.replaceState = (...args: Parameters<History['replaceState']>) => {
        original(...args);
        history.replaceState = original;
        history.back();
      };
    });
    await inputGearDrop(page, 30);
    await expect.poll(() => gearDropState(page), { timeout: 5000 }).toEqual({ slider: '20', search: '?drop=20', stage: '20' });
    await page.waitForTimeout(500);
    expect(await gearDropState(page)).toEqual({ slider: '20', search: '?drop=20', stage: '20' });
    const afterBack = await replaceCalls();

    await page.evaluate(() => history.forward());
    await expect.poll(() => gearDropState(page)).toEqual({ slider: '30', search: '?drop=30', stage: '30' });
    await page.waitForTimeout(500);
    expect(await gearDropState(page)).toEqual({ slider: '30', search: '?drop=30', stage: '30' });
    expect(await replaceCalls()).toBe(afterBack);
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
    await expect(stage).toHaveAttribute('data-key-rim-y', '456.5');
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
