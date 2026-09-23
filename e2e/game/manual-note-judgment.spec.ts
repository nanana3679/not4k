import { test, expect, type Page } from '@playwright/test';

async function injectManualChart(page: Page) {
  await page.evaluate(async () => {
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
      notes: [
        { type: 'single', lane: 1, beat: { n: 2, d: 1 } },
        { type: 'long', lane: 1, beat: { n: 2, d: 1 }, endBeat: { n: 4, d: 1 } },
      ],
      trillZones: [],
      events: [{ type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 }],
    };
    const current = useGameStore.getState();
    current.setChartData(chart);
    current.setAudioBuffer(audioBuffer);
    current.updateSettings({ isFirstLaunch: false, debugMode: false, masterVolume: 0 });
    useGameStore.setState({ screen: 'play', lastResult: null, startTimeMs: 0, editorReturnUrl: null });
  });
}

test('합성 키 입력과 raw timestamp 주입으로 실제 InputSystem 경로에서 Perfect 2개를 확정한다', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/game');
  await page.mouse.click(20, 20);
  await injectManualChart(page);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__e2eInputAttached)), { timeout: 5000 }).toBe(true);

  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__e2eRawAt = 1000; });
  await page.keyboard.down('w');
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__e2eRawAt = 2000; });
  await page.keyboard.up('w');
  await expect.poll(async () => page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    return useGameStore.getState().screen;
  }), { timeout: 7000 }).toBe('result');
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
