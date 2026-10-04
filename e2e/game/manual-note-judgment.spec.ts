import { test, expect, type Page } from '@playwright/test';

type ChartNote = import('../../src/shared/types/chart').Chart['notes'][number];

// 5초 음원을 끝까지 재생한 뒤 결과로 넘어간다. 병렬 worker의 swiftshader 부하에서도 여유를 둔다.
const RESULT_TIMEOUT_MS = 15000;

const DEFAULT_NOTES: ChartNote[] = [
  { type: 'single', lane: 1, beat: { n: 2, d: 1 } },
  { type: 'long', lane: 1, beat: { n: 2, d: 1 }, endBeat: { n: 4, d: 1 } },
];

async function injectManualChart(page: Page, notes: ChartNote[] = DEFAULT_NOTES) {
  await page.evaluate(async (notes) => {
    const win = window as unknown as Record<string, unknown>;
    const inputModulePath = '/src/game/input/InputSystem.ts';
    const inputModule: typeof import('../../src/game/input/InputSystem') = await import(inputModulePath);
    const inputProto = inputModule.InputSystem.prototype as typeof inputModule.InputSystem.prototype & { __e2ePatched?: boolean };
    if (!inputProto.__e2ePatched) {
      const attach = inputProto.attach;
      inputProto.attach = function (target?: EventTarget) {
        const result = attach.call(this, target);
        win.__e2eInputAttached = true;
        return result;
      };
      inputProto.__e2ePatched = true;
    }
    const clockModulePath = '/src/game/time/GameClock.ts';
    const clockModule: typeof import('../../src/game/time/GameClock') = await import(clockModulePath);
    const clockProto = clockModule.GameClock.prototype as typeof clockModule.GameClock.prototype & { __e2ePatched?: boolean };
    if (!clockProto.__e2ePatched) {
      clockProto.toInputTimeMs = function () {
        return Number(win.__e2eRawAt ?? 0);
      };
      clockProto.__e2ePatched = true;
    }
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const sampleRate = 44100;
    const audioBuffer = new AudioBuffer({ numberOfChannels: 1, length: sampleRate * 5, sampleRate });
    const chart: import('../../src/shared/types/chart').Chart = {
      meta: {
        title: 'E2E manual input chart', artist: 'test', difficultyLabel: 'NORMAL', difficultyLevel: 1,
        imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0,
      },
      notes,
      trillZones: [],
      events: [{ type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 }],
    };
    const current = useGameStore.getState();
    current.setChartData(chart);
    current.setAudioBuffer(audioBuffer);
    current.updateSettings({ isFirstLaunch: false, debugMode: false, masterVolume: 0 });
    useGameStore.setState({ screen: 'play', lastResult: null, startTimeMs: 0, editorReturnUrl: null });
  }, notes);
}

test('합성 키 입력과 raw timestamp 주입으로 실제 InputSystem 경로에서 Perfect 2개를 확정한다', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/game');
  await page.mouse.click(20, 20);
  await injectManualChart(page);
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 5000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__e2eInputAttached)), { timeout: 5000 }).toBe(true);

  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__e2eRawAt = 1000; });
  await page.keyboard.down('w');
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__e2eRawAt = 2000; });
  await page.keyboard.up('w');
  await expect.poll(async () => page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    return useGameStore.getState().screen;
  }), { timeout: RESULT_TIMEOUT_MS }).toBe('result');
  const result = await page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    return useGameStore.getState().lastResult;
  });
  await expect(page.getByText('100.00%')).toBeVisible();
  expect(result?.judgmentCounts.perfect).toBe(2);
  expect(result?.judgmentCounts.miss).toBe(0);
  expect(pageErrors).toEqual([]);
});

// 아래 사례는 노트를 3000ms 이후에 둔다. 입력의 raw 시각이 전달 시점의 곡 시각보다 미래여야 원래 timestamp로
// 처리되며(processBatch), 부하로 전달이 늦어 관측 입력 경로로 바뀌는 것을 막는다.
// RFD 0020 §2.15 / NJ-S04: single head 3000 + 독립 doubleLong [3000,4000] (BPM 120, 6박 = 3000ms).
const SINGLE_HEAD_DOUBLE_BODY: ChartNote[] = [
  { type: 'single', lane: 1, beat: { n: 6, d: 1 } },
  { type: 'doubleLong', lane: 1, beat: { n: 6, d: 1 }, endBeat: { n: 8, d: 1 } },
];

async function startManualPlay(page: Page, notes: ChartNote[]) {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/game');
  await page.mouse.click(20, 20);
  await injectManualChart(page, notes);
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 5000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__e2eInputAttached)), { timeout: 5000 }).toBe(true);
  return pageErrors;
}

async function waitForResult(page: Page) {
  await expect.poll(async () => page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    return useGameStore.getState().screen;
  }), { timeout: RESULT_TIMEOUT_MS }).toBe('result');
  return page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    return useGameStore.getState().lastResult;
  });
}

function resultCount(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
}

test('NJ-S04: single head 3000 + 독립 doubleLong [3000,4000]에 입력이 없으면 결과 화면이 0.00%·MISS 2(head Miss와 둘째 unit의 시작 Miss)를 표시한다', async ({ page }) => {
  const pageErrors = await startManualPlay(page, SINGLE_HEAD_DOUBLE_BODY);

  const result = await waitForResult(page);
  await expect(page.getByText('0.00%', { exact: true })).toBeVisible();
  await expect(resultCount(page, 'MISS:')).toHaveText('2');
  await expect(resultCount(page, 'PERFECT:')).toHaveText('0');
  expect(result?.achievementRate).toBe(0);
  expect(result?.judgmentCounts.miss).toBe(2);
  expect(result?.isFullCombo).toBe(false);
  expect(pageErrors).toEqual([]);
});

test('NJ-S04: single head 3000 + 독립 doubleLong [3000,4000]에서 head를 3000ms Perfect로 치고 3500ms에 떼면 결과 화면이 33.33%·PERFECT 1·MISS 2를 표시한다', async ({ page }) => {
  const pageErrors = await startManualPlay(page, SINGLE_HEAD_DOUBLE_BODY);

  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__e2eRawAt = 3000; });
  await page.keyboard.down('w');
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__e2eRawAt = 3500; });
  await page.keyboard.up('w');

  const result = await waitForResult(page);
  await expect(page.getByText('33.33%', { exact: true })).toBeVisible();
  await expect(resultCount(page, 'PERFECT:')).toHaveText('1');
  await expect(resultCount(page, 'MISS:')).toHaveText('2');
  expect(result?.achievementRate).toBeCloseTo(100 / 3, 5);
  expect(result?.judgmentCounts.perfect).toBe(1);
  expect(result?.judgmentCounts.miss).toBe(2);
  expect(pageErrors).toEqual([]);
});

// #180: head 없는 holdOnly [3000,3120] (BPM 120, 3120ms = 6.24박). S 전 tap이 E+Good까지 미확정으로 남아도
// release 항목을 찾지 않고 유지 Miss와 holdOnly 항목의 종속 0점으로 끝나야 한다.
const HEADLESS_SHORT_HOLD_ONLY: ChartNote[] = [
  { type: 'long', lane: 1, beat: { n: 6, d: 1 }, endBeat: { n: 156, d: 25 }, holdOnly: true },
];

test('#180: head 없는 holdOnly [3000,3120]을 2880ms에 누르고 2890ms에 떼면 정산 예외 없이 결과 화면이 0.00%·MISS 1을 표시한다', async ({ page }) => {
  const pageErrors = await startManualPlay(page, HEADLESS_SHORT_HOLD_ONLY);

  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__e2eRawAt = 2880; });
  await page.keyboard.down('w');
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__e2eRawAt = 2890; });
  await page.keyboard.up('w');

  const result = await waitForResult(page);
  await expect(page.getByText('0.00%', { exact: true })).toBeVisible();
  await expect(resultCount(page, 'MISS:')).toHaveText('1');
  await expect(resultCount(page, 'PERFECT:')).toHaveText('0');
  expect(result?.achievementRate).toBe(0);
  expect(result?.judgmentCounts.miss).toBe(1);
  expect(pageErrors).toEqual([]);
});
