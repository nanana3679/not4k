import { test, expect, type Page } from '@playwright/test';

async function installInputProbe(page: Page) {
  await page.evaluate(async () => {
    const win = window as unknown as Record<string, unknown>;
    const inputPath = '/src/game/input/InputSystem.ts';
    const inputModule: typeof import('../../src/game/input/InputSystem') = await import(inputPath);
    const inputProto = inputModule.InputSystem.prototype as typeof inputModule.InputSystem.prototype & { __labPatched?: boolean };
    if (!inputProto.__labPatched) {
      const attach = inputProto.attach;
      inputProto.attach = function (target?: EventTarget) {
        const result = attach.call(this, target);
        win.__labInputAttached = true;
        return result;
      };
      inputProto.__labPatched = true;
    }
    const clockPath = '/src/game/time/GameClock.ts';
    const clockModule: typeof import('../../src/game/time/GameClock') = await import(clockPath);
    const clockProto = clockModule.GameClock.prototype as typeof clockModule.GameClock.prototype & { __labPatched?: boolean };
    if (!clockProto.__labPatched) {
      clockProto.toInputTimeMs = function () {
        return Number((window as unknown as Record<string, unknown>).__labRawAt ?? 0);
      };
      clockProto.__labPatched = true;
    }
  });
}

async function storePreviousSessionState(page: Page) {
  await page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    useGameStore.setState({
      selectedPlaybackRange: { startTime: 0.777, endTime: 0.888, fadeInTime: 0, fadeOutTime: 0 },
      startTimeMs: 777,
      lastResult: {
        songId: 'stale-song',
        difficulty: 'stale-difficulty',
        achievementRate: 0,
        rank: 'F',
        maxCombo: 0,
        isFullCombo: false,
        judgmentCounts: { perfect: 0, good: 0, miss: 1 },
        goodTrillCount: 0,
        fastCount: 0,
        slowCount: 0,
      },
    });
  });
}

interface LabInput {
  /** 판정 입력 시각(ms). installInputProbe가 GameClock.toInputTimeMs를 이 값(__labRawAt)으로 바꾼다. */
  atMs: number;
  code: 'KeyQ' | 'KeyW';
  type: 'down' | 'up';
}

/**
 * 입력 전부를 page.evaluate 한 번 안에서 차례로 보낸다(곡은 계속 재생된다).
 * 입력 시각은 실제 시계가 아니라 __labRawAt이 정하고, 플레이 세션은 그 시각을 넘어 진행하지 않는다(stepPlaySession). 입력을 왕복마다 따로 보내면
 * 그 사이에 게임 프레임이 끼어 세션이 다음 입력보다 먼저 나아갈 수 있어, 부하가 큰 환경에서 결과가 흔들렸다. 한 작업(task) 안에서 보내면
 * 사이에 프레임이 끼지 않아, 같은 시각 입력은 한 묶음으로, 다른 시각 입력은 그 시각 그대로 차례로 처리된다(사례 단위 테스트의 play와 같은 순서).
 */
async function sendInputs(page: Page, inputs: readonly LabInput[]) {
  await page.evaluate((events) => {
    const win = window as unknown as Record<string, unknown>;
    for (const { atMs, code, type } of events) {
      win.__labRawAt = atMs;
      const key = code.slice(3).toLowerCase();
      window.dispatchEvent(new KeyboardEvent(type === 'down' ? 'keydown' : 'keyup', { code, key, bubbles: true }));
    }
  }, inputs);
}

/** o-o- 유지와 교대: 2000ms Q 누름 → 2500ms W 누름 → 2520ms W 뗌 → 3000ms Q 뗌. */
async function playConnectedSingleSwap(page: Page) {
  await sendInputs(page, [
    { atMs: 2000, code: 'KeyQ', type: 'down' },
    { atMs: 2500, code: 'KeyW', type: 'down' },
    { atMs: 2520, code: 'KeyW', type: 'up' },
    { atMs: 3000, code: 'KeyQ', type: 'up' },
  ]);
}

async function readResult(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    return useGameStore.getState().lastResult;
  });
}

test.describe('Lab 판정 실플레이', () => {
  test('connected-single-swap을 실제 카드 흐름으로 Perfect 3/Miss 0 처리하고 Lab에서 재실행한다', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/lab/judgment-playtest?scenario=connected-single-swap');
    await installInputProbe(page);
    await storePreviousSessionState(page);
    const card = page.locator('[data-scenario-id="connected-single-swap"]');
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /플레이/ }).click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 5000 });
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__labInputAttached)), { timeout: 5000 }).toBe(true);
    const initialState = await page.evaluate(async () => {
      const storePath = '/src/game/stores/gameStore.ts';
      const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
      const state = useGameStore.getState();
      return { selectedPlaybackRange: state.selectedPlaybackRange, startTimeMs: state.startTimeMs, lastResult: state.lastResult };
    });
    expect(initialState.selectedPlaybackRange).toBeNull();
    expect(initialState.startTimeMs).toBe(0);
    expect(initialState.lastResult).toBeNull();

    await playConnectedSingleSwap(page);

    await expect.poll(async () => page.evaluate(async () => {
      const storePath = '/src/game/stores/gameStore.ts';
      const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
      return useGameStore.getState().screen;
    }), { timeout: 8000 }).toBe('result');
    const result = await readResult(page);
    expect(result?.judgmentCounts.perfect).toBe(3);
    expect(result?.judgmentCounts.miss).toBe(0);
    expect(result?.isFullCombo).toBe(true);
    expect(result?.achievementRate).toBe(100);
    await expect(page.getByRole('button', { name: 'Back to Lab' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Lab' }).click();
    await expect(page).toHaveURL(/\/lab\/judgment-playtest\?scenario=connected-single-swap$/);
    await expect(page.getByLabel('방금 플레이한 결과')).toContainText('100.00% · Miss 0 · Full Combo YES');
    await expect(page.getByRole('button', { name: '같은 사례 다시 플레이' })).toBeVisible();
    await page.evaluate(() => {
      const win = window as unknown as Record<string, unknown>;
      win.__labRawAt = 0;
      win.__labInputAttached = false;
    });
    await page.getByRole('button', { name: '같은 사례 다시 플레이' }).click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 5000 });
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__labInputAttached)), { timeout: 5000 }).toBe(true);
    await playConnectedSingleSwap(page);
    await expect.poll(async () => page.evaluate(async () => {
      const storePath = '/src/game/stores/gameStore.ts';
      const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
      return useGameStore.getState().screen;
    }), { timeout: 8000 }).toBe('result');
    const replayResult = await readResult(page);
    expect(replayResult).toEqual(result);
    expect(pageErrors).toEqual([]);
  });

  test('holdOnly filter와 실제 key legend가 작은 viewport에서도 마지막 카드 접근을 유지한다', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/lab/judgment-playtest');
    await page.evaluate(async () => {
      const storePath = '/src/game/stores/gameStore.ts';
      const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
      const state = useGameStore.getState();
      useGameStore.setState({ settings: {
        ...state.settings,
        keyBindings: { ...state.settings.keyBindings, lane1: ['KeyZ', 'KeyX'] },
      } });
    });
    await expect(page.getByRole('button', { name: 'holdOnly', exact: true })).toBeVisible();
    await expect(page.locator('.judgment-playtest-keys kbd')).toHaveText(['Z', 'X']);
    await page.getByRole('button', { name: 'holdOnly', exact: true }).click();
    await expect(page.locator('.judgment-playtest-scenarios article')).not.toHaveCount(0);
    const ids = await page.locator('.judgment-playtest-scenarios article').evaluateAll(cards => cards.map(card => card.getAttribute('data-scenario-id')));
    expect(ids).toEqual(['holdonly-decrease-chain', 'independent-holdonly-start', 'late-holdonly-start', 'holdonly-then-slide', 'hold-tick-chain', 'hold-tick-chain-gap']);
    await page.locator('.judgment-playtest-scenarios article').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.judgment-playtest-scenarios article').last().getByRole('button', { name: /플레이/ })).toBeInViewport();
    expect(await page.locator('.judgment-playtest-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('=-=-에서 처음 두 키만 유지하고 감소·증가 입력을 생략해도 예외 없이 Miss 결과에 도달한다', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/lab/judgment-playtest?scenario=decrease-chain');
    await installInputProbe(page);
    await page.locator('[data-scenario-id="decrease-chain"]').getByRole('button', { name: /플레이/ }).click();
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as Record<string, unknown>).__labInputAttached))).toBe(true);
    // 2000ms에 Q·W를 함께 누르고(사례 단위 테스트처럼 한 묶음) 그 뒤 입력은 생략한다.
    await sendInputs(page, [
      { atMs: 2000, code: 'KeyQ', type: 'down' },
      { atMs: 2000, code: 'KeyW', type: 'down' },
    ]);
    await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 9000 });
    const result = await readResult(page);
    expect(result?.judgmentCounts.perfect).toBe(2);
    expect(result?.judgmentCounts.miss).toBeGreaterThan(0);
    expect(result?.achievementRate).toBe(40);
    expect(result?.isFullCombo).toBe(false);
    await sendInputs(page, [
      { atMs: 2000, code: 'KeyQ', type: 'up' },
      { atMs: 2000, code: 'KeyW', type: 'up' },
    ]);
    expect(pageErrors).toEqual([]);
  });
});
