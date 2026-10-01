import { test, expect, type Locator, type Page } from '@playwright/test';

// 튜토리얼 팝업 캐러셀의 두 슬롯은 팝업이 열려 있는 동안 재생기와 렌더러(WebGL 컨텍스트)를 유지하고,
// 레슨을 넘기면 번갈아(핑퐁) 차트만 바꿔 건다. 예전에는 넘길 때마다 렌더러를 새로 만들어
// WebGL 컨텍스트 생성·스킨 로드·init을 반복했다. 재생기에는 테스트 훅이 없으므로 실제
// GameRenderer.prototype.init을 감싸 생성 횟수를 세고, 캔버스 DOM 요소에 표식을 붙여 동일성을 확인한다
// (실제 WebGL이 필요해 vitest로는 확인 불가).

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

type MarkedCanvas = HTMLCanvasElement & { __pingpongMark?: string };

async function countRendererInits(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const rendererPath = '/src/game/renderer/GameRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
    const counter = globalThis as typeof globalThis & { __rendererInits: number };
    counter.__rendererInits = 0;
    const original = GameRenderer.prototype.init;
    GameRenderer.prototype.init = function () {
      counter.__rendererInits++;
      return original.call(this);
    };
  });
}

async function openTutorial(page: Page): Promise<Locator> {
  await page.goto('/game');
  await page.evaluate((settings) => localStorage.setItem('not4k-settings', settings), NON_FIRST_LAUNCH_SETTINGS);
  await page.reload();
  await countRendererInits(page);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Open tutorial help' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tutorial' });
  await expect(dialog.locator('[data-tutorial-driver-visible="true"]')).toBeVisible({ timeout: 15_000 });
  return dialog;
}

/** 팝업의 두 캔버스에 A·B 표식을 붙인다. 이후 같은 DOM 요소인지 표식으로 확인한다. */
async function markCanvases(dialog: Locator): Promise<void> {
  await dialog.evaluate((root) => {
    const canvases = [...root.querySelectorAll('[data-tutorial-preview-canvas="true"]')] as MarkedCanvas[];
    canvases.forEach((canvas, index) => { canvas.__pingpongMark = index === 0 ? 'A' : 'B'; });
  });
}

async function readCanvases(dialog: Locator): Promise<{ marks: Array<string | null>; activeMark: string | null; allConnected: boolean }> {
  return dialog.evaluate((root) => {
    const canvases = [...root.querySelectorAll('[data-tutorial-preview-canvas="true"]')] as MarkedCanvas[];
    const active = root.querySelector('[data-tutorial-preview-slot="active"] [data-tutorial-preview-canvas="true"]') as MarkedCanvas | null;
    return {
      marks: canvases.map((canvas) => canvas.__pingpongMark ?? null).sort(),
      activeMark: active?.__pingpongMark ?? null,
      allConnected: canvases.every((canvas) => canvas.isConnected),
    };
  });
}

async function waitForSettled(dialog: Locator, previewId: string): Promise<void> {
  await expect(dialog.locator('[data-tutorial-carousel-track="true"]')).toHaveAttribute('data-tutorial-transition-phase', 'idle', { timeout: 15_000 });
  await expect(dialog.locator(`[data-tutorial-preview-slot="active"][data-tutorial-preview-id="${previewId}"]`)).toBeVisible();
  await expect(dialog.locator('[data-tutorial-driver-visible="true"]')).toBeVisible();
}

async function rendererInits(page: Page): Promise<number> {
  return page.evaluate(() => (globalThis as typeof globalThis & { __rendererInits: number }).__rendererInits);
}

test.describe('튜토리얼 캐러셀 슬롯 재사용(핑퐁)', () => {
  test.setTimeout(120_000);

  test('다음·다음·다음·이전으로 4번 넘겨도 두 슬롯은 같은 캔버스 2개를 번갈아 쓰고 렌더러 init은 처음 2번뿐이며 재방문은 새 인스턴스로 처음부터 재생', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));
    const dialog = await openTutorial(page);
    await markCanvases(dialog);
    const initial = await readCanvases(dialog);
    expect(initial.marks).toEqual(['A', 'B']);
    expect(await rendererInits(page)).toBe(2);

    const activeSlot = dialog.locator('[data-tutorial-preview-slot="active"]');
    const visited: Array<{ id: string | null; instance: string | null }> = [];
    let previousActiveMark = initial.activeMark;
    for (const direction of ['Next', 'Next', 'Next', 'Previous'] as const) {
      const before = { id: await activeSlot.getAttribute('data-tutorial-preview-id'), instance: await activeSlot.getAttribute('data-tutorial-preview-instance') };
      visited.push(before);
      await dialog.getByRole('button', { name: `${direction} tutorial` }).click();
      await expect(activeSlot).not.toHaveAttribute('data-tutorial-preview-id', before.id ?? '', { timeout: 15_000 });
      const nextId = await activeSlot.getAttribute('data-tutorial-preview-id');
      await waitForSettled(dialog, nextId ?? '');

      const canvases = await readCanvases(dialog);
      expect(canvases.marks, `${direction} 뒤 캔버스 표식`).toEqual(['A', 'B']);
      expect(canvases.allConnected).toBe(true);
      expect(canvases.activeMark, `${direction} 뒤 active 슬롯은 다른 캔버스로 번갈아 바뀜`).not.toBe(previousActiveMark);
      previousActiveMark = canvases.activeMark;
    }

    // 마지막 이전은 세 번째 레슨을 다시 방문한다 — 같은 레슨이라도 새 인스턴스로 처음부터 재생한다.
    const revisited = visited[2];
    await expect(activeSlot).toHaveAttribute('data-tutorial-preview-id', revisited.id ?? '');
    await expect(activeSlot).not.toHaveAttribute('data-tutorial-preview-instance', revisited.instance ?? '');
    expect(await rendererInits(page)).toBe(2);
    expect(pageErrors).toEqual([]);
  });

  test('다음을 기다리지 않고 5번 연속 누르면 마지막 레슨으로 안정되고 캔버스 2개·렌더러 init 2번을 유지', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));
    const dialog = await openTutorial(page);
    await markCanvases(dialog);
    const expectedId = await dialog.locator('[data-tutorial-index-item]').nth(5).getAttribute('data-tutorial-index-item');

    const next = dialog.getByRole('button', { name: 'Next tutorial' });
    for (let i = 0; i < 5; i++) {
      await next.click();
      await page.waitForTimeout(15 + i * 10);
    }
    await waitForSettled(dialog, expectedId ?? '');

    const canvases = await readCanvases(dialog);
    expect(canvases.marks).toEqual(['A', 'B']);
    expect(canvases.allConnected).toBe(true);
    expect(await rendererInits(page)).toBe(2);
    expect(pageErrors).toEqual([]);
  });
});
