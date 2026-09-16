import { test, expect } from '@playwright/test';

/** DEV Vite module injection only; production code has no test backdoor. */
async function injectAutoChart(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const sampleRate = 44100;
    const audioBuffer = new AudioBuffer({ numberOfChannels: 1, length: sampleRate, sampleRate });
    const chart: import('../../src/shared/types/chart').Chart = {
      meta: {
        title: 'E2E auto chart', artist: 'test', difficultyLabel: 'NORMAL', difficultyLevel: 1,
        imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0,
      },
      notes: [
        { type: 'single', lane: 1, beat: { n: 0, d: 1 } },
        { type: 'long', lane: 1, beat: { n: 0, d: 1 }, endBeat: { n: 1, d: 2 } },
        { type: 'single', lane: 1, beat: { n: 1, d: 2 } },
        { type: 'long', lane: 1, beat: { n: 1, d: 2 }, endBeat: { n: 1, d: 1 }, holdOnly: true },
      ],
      trillZones: [],
      events: [
        { type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 },
        { type: 'auto', beat: { n: 0, d: 1 }, endBeat: { n: 2, d: 1 } },
      ],
    };
    const current = useGameStore.getState();
    current.setChartData(chart);
    current.setAudioBuffer(audioBuffer);
    current.updateSettings({ isFirstLaunch: false, debugMode: false, masterVolume: 0 });
    useGameStore.setState({ screen: 'play', lastResult: null, startTimeMs: 0, editorReturnUrl: null });
  });
}

async function readGameState(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const { screen, lastResult } = useGameStore.getState();
    return { screen, lastResult };
  });
}

test.describe('실제 PlayScreen 판정 통합', () => {
  test('AutoEvent holdOnly chart가 실제 canvas 재생 후 100% 결과를 만들고 Max Combo를 표시하지 않는다', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/game');
    await page.mouse.click(20, 20);
    await injectAutoChart(page);

    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
    // 실제 플레이 화면에도 사용자 gesture를 전달한다.
    await page.mouse.click(20, 20);
    await expect.poll(async () => readGameState(page).then(state => state.screen), { timeout: 6000 }).toBe('result');

    await expect(page.getByText('100.00%')).toBeVisible();
    await expect(page.getByText('Full Combo:')).toBeVisible();
    await expect(page.getByText('YES')).toBeVisible();
    await expect(page.getByText(/Max Combo/i)).toHaveCount(0);
    const result = (await readGameState(page)).lastResult;
    expect(result?.judgmentCounts.perfect).toBe(3);
    expect(result?.judgmentCounts.miss).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test('결과 후 동일 chart를 재시작해도 이전 결과가 누적되거나 중복되지 않는다', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/game');
    await page.mouse.click(20, 20);
    await injectAutoChart(page);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
    await page.mouse.click(20, 20);
    await expect.poll(async () => readGameState(page).then(state => state.screen), { timeout: 6000 }).toBe('result');
    await expect(page.getByText('100.00%')).toHaveCount(1);
    const first = (await readGameState(page)).lastResult;
    expect(first?.judgmentCounts.perfect).toBe(3);
    expect(first?.judgmentCounts.miss).toBe(0);

    await injectAutoChart(page);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
    await page.mouse.click(20, 20);
    await expect.poll(async () => readGameState(page).then(state => state.screen), { timeout: 6000 }).toBe('result');
    await expect(page.getByText('100.00%')).toHaveCount(1);
    await expect(page.getByText(/Max Combo/i)).toHaveCount(0);
    expect((await readGameState(page)).lastResult).toEqual(first);
    expect(pageErrors).toEqual([]);
  });
});
