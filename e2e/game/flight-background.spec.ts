import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

async function startLocalPlay(page: Page, difficultyLabel: string, navigate = true) {
  if (navigate) {
    await page.goto('/game');
    await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  }
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.evaluate(async label => {
    const storePath = '/src/game/stores/gameStore.ts';
    const sharedPath = '/src/shared/index.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const { beat }: typeof import('../../src/shared') = await import(sharedPath);
    const audioBuffer = new AudioBuffer({ length: 44100 * 90, sampleRate: 44100, numberOfChannels: 1 });
    const state = useGameStore.getState();
    state.updateSettings({ isFirstLaunch: false, renderHeight: 720 });
    state.setChartData({
      meta: { title: 'Flight background check', artist: 'Local', difficultyLabel: label, difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: [{ type: 'single', lane: 1, beat: beat(100, 1) }],
      trillZones: [],
      events: [{ type: 'bpm', beat: beat(0, 1), bpm: 120 }, { type: 'timeSignature', beat: beat(0, 1), beatPerMeasure: beat(4, 1) }],
    });
    state.setAudioBuffer(audioBuffer);
    state.setScreen('play');
  }, difficultyLabel);
}

for (const [label, scenario, asset] of [
  ['EASY', 'liftoff', /\/approach\/ground\.png(?:\?|$)/],
  ['HARD', 'breakthrough', /\/distant-architecture\.png(?:\?|$)/],
] as const) {
  test(`${scenario} 배경 이미지 요청이 실패하면 자원을 정리하고 곡 선택에서 다시 플레이할 수 있다`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
    await page.route(asset, route => route.abort('failed'));
    await startLocalPlay(page, label);

    const back = page.getByRole('button', { name: 'Back to Song Select', exact: true });
    await expect.poll(async () => ({ visible: await back.isVisible(), errors }), { timeout: 30000 })
      .toEqual({ visible: true, errors: [] });
    await expect(page.locator('[data-flight-background]')).toHaveCount(0);
    await expect(page.getByTestId('gameplay-canvas')).toHaveCount(0);
    await back.click();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();

    await page.unroute(asset);
    await startLocalPlay(page, label, false);
    await expect(page.locator(`[data-flight-background="${scenario}"][data-ready="true"]`)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-flight-background]')).toHaveCount(1);
    await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`${scenario} 배경 이미지 응답 전에 떠나면 늦게 로드된 배경을 정리하고 다음 플레이만 표시한다`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let release!: () => void;
    let requested!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const requestStarted = new Promise<void>(resolve => { requested = resolve; });
    await page.route(asset, async route => {
      requested();
      await held;
      await route.continue();
    });
    await startLocalPlay(page, label);
    await requestStarted;
    await page.evaluate(async () => {
      const path = '/src/game/stores/gameStore.ts';
      const { useGameStore } = await import(path);
      useGameStore.getState().setScreen('title');
    });
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await expect(page.locator('[data-flight-background]')).toHaveCount(0);

    const response = page.waitForResponse(response => asset.test(response.url()));
    release();
    await (await response).finished();
    await page.unroute(asset);
    await startLocalPlay(page, label, false);
    await expect(page.locator(`[data-flight-background="${scenario}"][data-ready="true"]`)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-flight-background]')).toHaveCount(1);
    await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const [label, scenario] of [['EASY', 'liftoff'], ['NORMAL', 'infiltration'], ['HARD', 'breakthrough']]) {
  test(`${label} 차트는 ${scenario} 배경에서 정지·재개·재시작하며 게임 캔버스를 유지한다`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await startLocalPlay(page, label);
    const background = page.locator(`[data-flight-background="${scenario}"][data-ready="true"]`);
    await expect(background).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
    await expect.poll(async () => Number(await background.getAttribute('data-lights'))).toBeGreaterThan(20);
    const firstTime = Number(await background.getAttribute('data-time'));
    await expect.poll(async () => Number(await background.getAttribute('data-time'))).toBeGreaterThan(firstTime);
    await page.screenshot({ path: testInfo.outputPath(`${scenario}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    const stopped = await background.getAttribute('data-time');
    await page.waitForTimeout(150);
    expect(await background.getAttribute('data-time')).toBe(stopped);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect.poll(async () => Number(await background.getAttribute('data-time'))).toBeGreaterThan(Number(stopped));
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(background).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-flight-background]')).toHaveCount(1);
    await expect(page.getByTestId('gameplay-canvas')).toBeVisible();
    await page.keyboard.press('Escape');
    // 외부 곡 목록 요청 없이 플레이 수명만 종료한다.
    await page.evaluate(async () => {
      const path = '/src/game/stores/gameStore.ts';
      const { useGameStore } = await import(path);
      useGameStore.getState().setScreen('title');
    });
    await expect(page.locator('[data-flight-background]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
