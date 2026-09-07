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

async function playConnectedSingleSwap(page: Page) {
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__labRawAt = 2000; });
  await page.keyboard.down('q');
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__labRawAt = 2500; });
  await page.keyboard.down('w');
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__labRawAt = 2520; });
  await page.keyboard.up('w');
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__labRawAt = 3000; });
  await page.keyboard.up('q');
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
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
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
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
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
    expect(ids).toEqual(['holdonly-decrease-chain', 'independent-holdonly-start', 'late-holdonly-start', 'holdonly-then-slide']);
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
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__labRawAt = 2000; });
    await page.keyboard.down('q');
    await page.keyboard.down('w');
    await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible({ timeout: 9000 });
    const result = await readResult(page);
    expect(result?.judgmentCounts.perfect).toBe(2);
    expect(result?.judgmentCounts.miss).toBeGreaterThan(0);
    expect(result?.achievementRate).toBe(40);
    expect(result?.isFullCombo).toBe(false);
    await page.keyboard.up('q');
    await page.keyboard.up('w');
    expect(pageErrors).toEqual([]);
  });
});
