import { test, expect, type Page } from '@playwright/test';

// 튜토리얼 팝업에서 다음 레슨으로 넘기면, 들어오는 축소 재생기는 슬라이드 동안 첫 프레임에 멈춰 있다가
// 자리 잡은(active) 뒤에 처음부터 재생한다. 예전에는 보이지 않는 동안 미리 재생을 시작해, 자리 잡은 순간
// 이미 차트가 약 0.5초 진행돼 있었다. 슬라이드 중 정지는 실제 GameRenderer.renderFrame을
// 감싸 캔버스별 첫·마지막 렌더 시각으로 확인하고, 이후 진행은 누적 data-tutorial-elapsed-ms와 렌더 시각 변화로 확인한다.
// 두 슬롯은 렌더러와 캔버스를 유지한 채 차트만 바꾸므로, 재생기가 새 차트를 걸며 부르는 resetTransientState에서
// 캔버스 기록을 지워 차트마다 첫 렌더 시각을 다시 잰다.

const NON_FIRST_LAUNCH_SETTINGS = JSON.stringify({
  state: {
    settings: {
      keyBindings: {
        lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
        lane2: ['KeyE', 'KeyD', 'KeyC'],
        lane3: ['KeyP', 'KeyL', 'Comma'],
        lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
      },
      scrollSpeed: 800,
      liftPercent: 0,
      suddenPercent: 0,
      targetFps: 60,
      offsetMs: 0,
      preset: 'tkl',
      isFirstLaunch: false,
    },
  },
  version: 0,
});

interface ChartProgressSample {
  id: string | null;
  /** 이 캔버스의 첫 renderFrame 이후 진행한 차트 시간(ms) */
  elapsedMs: number | null;
  loopElapsedMs: number | null;
}

interface NavigationSamples {
  slideStart?: ChartProgressSample;
  settled?: ChartProgressSample;
}

async function recordRenderedChartTimes(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const rendererPath = '/src/game/renderer/GameRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
    type TrackedCanvas = HTMLCanvasElement & { __firstRenderMs?: number; __lastRenderMs?: number };
    const canvasOf = (renderer: unknown) => (renderer as { app?: { canvas?: TrackedCanvas } }).app?.canvas;
    const originalReset = GameRenderer.prototype.resetTransientState;
    GameRenderer.prototype.resetTransientState = function () {
      const canvas = canvasOf(this);
      if (canvas) {
        delete canvas.__firstRenderMs;
        delete canvas.__lastRenderMs;
      }
      return originalReset.call(this);
    };
    const original = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (songTimeMs, deltaMs) {
      const canvas = canvasOf(this);
      if (canvas) {
        canvas.__firstRenderMs ??= songTimeMs;
        canvas.__lastRenderMs = songTimeMs;
      }
      return original.call(this, songTimeMs, deltaMs);
    };
  });
}

async function goToNextAndSample(page: Page, previousId: string | null): Promise<NavigationSamples> {
  // 클릭 전에 설치해 260ms 전환이 끝나도 최초 관측값을 잃지 않는다.
  const probe = await page.evaluateHandle((prevId) => {
    type TrackedCanvas = HTMLCanvasElement & { __firstRenderMs?: number; __lastRenderMs?: number };
    const sample = (slot: Element) => {
      const canvas = slot.querySelector('canvas') as TrackedCanvas | null;
      const elapsedMs = canvas?.__firstRenderMs === undefined || canvas.__lastRenderMs === undefined
        ? null
        : canvas.__lastRenderMs - canvas.__firstRenderMs;
      const elapsed = slot.querySelector<HTMLElement>('[data-tutorial-engine]')?.dataset.tutorialElapsedMs;
      return { id: slot.getAttribute('data-tutorial-preview-id'), elapsedMs,
        loopElapsedMs: elapsed === undefined ? null : Number(elapsed) };
    };
    const samples: { slideStart?: ReturnType<typeof sample>; settled?: ReturnType<typeof sample> } = {};
    const capture = () => {
      const entering = document.querySelector('[data-tutorial-preview-slot="entering"]');
      if (!samples.slideStart && entering?.getAttribute('data-tutorial-transition-phase') === 'animating') {
        samples.slideStart = sample(entering);
      }
      const active = document.querySelector('[data-tutorial-preview-slot="active"]');
      if (!samples.settled && active && active.getAttribute('data-tutorial-preview-id') !== prevId) {
        samples.settled = sample(active);
      }
    };
    const observer = new MutationObserver(capture);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-tutorial-preview-slot', 'data-tutorial-transition-phase'] });
    return { samples, disconnect: () => observer.disconnect() };
  }, previousId);
  try {
    await page.getByRole('button', { name: 'Next tutorial' }).click();
    await expect.poll(() => probe.evaluate(({ samples }) => !!samples.settled)).toBe(true);
    return await probe.evaluate(({ samples }) => samples);
  } finally {
    await probe.evaluate(({ disconnect }) => disconnect());
    await probe.dispose();
  }
}

test('다음 튜토리얼로 넘기면 새 차트는 슬라이드 중 첫 프레임에 멈췄다가 자리 잡은 순간 4박 동안 판정 시각 0ms를 유지한 뒤 차트를 진행', async ({ page }) => {
  test.setTimeout(120000);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  await page.goto('/game');
  await page.evaluate((settings) => localStorage.setItem('not4k-settings', settings), NON_FIRST_LAUNCH_SETTINGS);
  await page.reload();
  await recordRenderedChartTimes(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Open tutorial help' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tutorial' });
  const activeSlot = dialog.locator('[data-tutorial-preview-slot="active"]');
  await expect(activeSlot.locator('canvas')).toBeVisible();

  // 손배치 → 싱글 → 더블 → 트릴: 도식 멈춤 없이 바로 재생하는 레슨들
  for (let i = 0; i < 3; i++) {
    const previousId = await activeSlot.getAttribute('data-tutorial-preview-id');
    const samples = await goToNextAndSample(page, previousId);

    expect(samples.slideStart, `${i + 1}번째 넘김에서 슬라이드 시작을 관측하지 못함`).toBeDefined();
    expect(samples.slideStart?.elapsedMs, `${samples.slideStart?.id}: 슬라이드 시작 시점 차트 진행`).toBe(0);
    expect(samples.settled, `${i + 1}번째 넘김에서 자리 잡은 슬롯을 관측하지 못함`).toBeDefined();
    expect(samples.settled?.loopElapsedMs, `${samples.settled?.id}: 자리 잡은 순간 차트 진행`).not.toBeNull();
    expect(samples.settled?.loopElapsedMs ?? Infinity, `${samples.settled?.id}: 자리 잡은 순간 차트 진행`).toBeLessThan(150);
    const player = activeSlot.locator('[data-tutorial-engine]');
    await expect(player).toHaveAttribute('data-tutorial-loop-origin-now', /\d/);
    await expect(player).toHaveAttribute('data-tutorial-count-in', 'false', { timeout: 5000 });
    await expect.poll(async () => Number(await player.getAttribute('data-tutorial-elapsed-ms')),
      { message: `${samples.settled?.id}: 4박 준비 뒤 누적 재생 시간`, timeout: 10000 }).toBeGreaterThan(100);
    const readProgress = () => activeSlot.evaluate(slot => {
      const canvas = slot.querySelector('canvas') as (HTMLCanvasElement & { __lastRenderMs?: number }) | null;
      const elapsed = slot.querySelector<HTMLElement>('[data-tutorial-engine]')?.dataset.tutorialElapsedMs;
      return { renderTimeMs: canvas?.__lastRenderMs ?? null, elapsedMs: Number(elapsed) };
    });
    const before = await readProgress();
    expect(before.renderTimeMs).not.toBeNull();
    await expect.poll(async () => {
      const after = await readProgress();
      // 반복 경계에서는 렌더 시각이 작아질 수 있다. 누적 시간도 증가해야 실제 재생 진행으로 인정한다.
      return after.renderTimeMs !== null && after.renderTimeMs !== before.renderTimeMs
        && after.elapsedMs > before.elapsedMs;
    }, { message: `${samples.settled?.id}: 누적 시간과 함께 캔버스 렌더 시각 진행`, timeout: 10000 }).toBe(true);
  }

  expect(pageErrors).toEqual([]);
});
