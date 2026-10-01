import { test, expect, type Page } from '@playwright/test';

// 튜토리얼 팝업에서 다음 레슨으로 넘기면, 들어오는 축소 재생기는 슬라이드 동안 첫 프레임에 멈춰 있다가
// 자리 잡은(active) 뒤에 처음부터 재생한다. 예전에는 보이지 않는 동안 미리 재생을 시작해, 자리 잡은 순간
// 이미 차트가 약 0.5초 진행돼 있었다. 재생기에는 테스트 훅이 없으므로 실제 GameRenderer.renderFrame을
// 감싸 캔버스별 첫 렌더 시각과 마지막 렌더 시각을 기록한다(실제 WebGL이 필요해 vitest로는 확인 불가).

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
    const original = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (songTimeMs, deltaMs) {
      const canvas = (this as unknown as { app?: { canvas?: TrackedCanvas } }).app?.canvas;
      if (canvas) {
        canvas.__firstRenderMs ??= songTimeMs;
        canvas.__lastRenderMs = songTimeMs;
      }
      return original.call(this, songTimeMs, deltaMs);
    };
  });
}

async function goToNextAndSample(page: Page, previousId: string | null): Promise<NavigationSamples> {
  await page.getByRole('button', { name: 'Next tutorial' }).click();
  return page.evaluate(async (prevId) => {
    type TrackedCanvas = HTMLCanvasElement & { __firstRenderMs?: number; __lastRenderMs?: number };
    const sample = (slot: Element) => {
      const canvas = slot.querySelector('canvas') as TrackedCanvas | null;
      const elapsedMs = canvas?.__firstRenderMs === undefined || canvas.__lastRenderMs === undefined
        ? null
        : canvas.__lastRenderMs - canvas.__firstRenderMs;
      return { id: slot.getAttribute('data-tutorial-preview-id'), elapsedMs };
    };
    const samples: { slideStart?: ReturnType<typeof sample>; settled?: ReturnType<typeof sample> } = {};
    const startedAt = performance.now();
    while (performance.now() - startedAt < 10000) {
      const entering = document.querySelector('[data-tutorial-preview-slot="entering"]');
      if (!samples.slideStart && entering?.getAttribute('data-tutorial-transition-phase') === 'animating') {
        samples.slideStart = sample(entering);
      }
      const active = document.querySelector('[data-tutorial-preview-slot="active"]');
      if (active && active.getAttribute('data-tutorial-preview-id') !== prevId) {
        samples.settled = sample(active);
        break;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return samples;
  }, previousId);
}

test('다음 튜토리얼로 넘기면 새 차트는 슬라이드 중 첫 프레임에 멈췄다가 자리 잡은 순간 150ms 미만 진행 상태로 처음부터 재생', async ({ page }) => {
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
    expect(samples.settled?.elapsedMs, `${samples.settled?.id}: 자리 잡은 순간 차트 진행`).not.toBeNull();
    expect(samples.settled?.elapsedMs ?? Infinity, `${samples.settled?.id}: 자리 잡은 순간 차트 진행`).toBeLessThan(150);
    await page.waitForTimeout(500);
  }

  expect(pageErrors).toEqual([]);
});
