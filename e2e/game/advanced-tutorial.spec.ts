import { test as base, expect, type Locator, type Page } from '@playwright/test';

const test = base.extend<{ previewErrors: string[] }>({
  previewErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

const VIEWED_KEY = 'not4k-tutorial-viewed-ids';
const BASIC_IDS = [
  'hand-placement',
  'single-note',
  'double-note',
  'trill-note',
  'long-note',
  'release-tap',
  'connected-long-note-switch',
  'connected-long-note-overlap',
  'connected-trill-long',
  'headless-long-note',
  'zero-length-long-note',
  'grace-note',
  'hold-only-long-note',
  'zero-length-hold-only-long-note',
  'rest-zone',
  'horizontal-movement',
  'vertical-movement',
] as const;
const ADVANCED_IDS = [
  'advanced-double-hold',
  'advanced-double-swap',
  'advanced-single-head-double',
  'advanced-decrease',
  'advanced-holdonly-decrease',
  'advanced-same-key',
  'advanced-recovery',
  'advanced-partial-double',
  'advanced-independent-holdonly',
  'advanced-short-holdonly',
  'advanced-zero-holdonly',
  'advanced-double-release',
] as const;

const NON_FIRST_LAUNCH_SETTINGS = JSON.stringify({
  state: {
    settings: {
      keyBindings: {
        lane1: ['KeyQ', 'KeyW'],
        lane2: ['KeyE', 'KeyC'],
        lane3: ['KeyP', 'Comma'],
        lane4: ['BracketLeft', 'BracketRight'],
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

async function openTutorial(page: Page) {
  await page.goto('/game');
  await page.evaluate((settings) => localStorage.setItem('not4k-settings', settings), NON_FIRST_LAUNCH_SETTINGS);
  await page.reload();
  const start = page.getByRole('button', { name: 'Start', exact: true });
  const help = page.getByRole('button', { name: 'Open tutorial help' });
  // Compact screens enter the Songs list directly, without the desktop title screen.
  await expect(start.or(help).first()).toBeVisible();
  if (await start.isVisible()) {
    await start.click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'Songs', exact: true })).toBeVisible();
  }
  await help.click();
  return page.getByRole('dialog', { name: 'Tutorial' });
}

function tab(dialog: Locator, name: 'Basic' | 'Advanced') {
  return dialog.getByRole('tab', { name, exact: true });
}

function indexItems(dialog: Locator) {
  return dialog.locator('[data-tutorial-index-item]');
}

async function expectActive(dialog: Locator, id: string) {
  await expect(dialog.locator('[data-tutorial-carousel-track="true"]')).toHaveAttribute('data-tutorial-transition-phase', 'idle', { timeout: 10_000 });
  await expect(dialog.locator('[data-tutorial-preview-slot="active"]')).toHaveAttribute('data-tutorial-preview-id', id);
  await expect(dialog.locator('[data-tutorial-index-item="' + id + '"]')).toHaveAttribute('data-tutorial-index-current', 'true');
  await expect(dialog.locator('[data-tutorial-preview-slot="active"] [data-tutorial-preview-error]')).toHaveCount(0);
}

async function selectTab(dialog: Locator, name: 'Basic' | 'Advanced') {
  await expect(dialog.locator('[data-tutorial-carousel-track="true"]')).toHaveAttribute('data-tutorial-transition-phase', 'idle', { timeout: 10_000 });
  await tab(dialog, name).click();
  await expect(tab(dialog, name)).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.locator('[data-tutorial-carousel-track="true"]')).toHaveAttribute('data-tutorial-transition-phase', 'idle', { timeout: 10_000 });
}

async function choose(dialog: Locator, id: string) {
  await dialog.locator('[data-tutorial-index-item="' + id + '"]').click();
  await expectActive(dialog, id);
  const title = await dialog.locator('[data-tutorial-index-item="' + id + '"]').locator('span').nth(1).textContent();
  await expect(dialog.locator('header p')).toHaveText(title?.trim() ?? '');
  await expect(dialog.locator('.not4k-tutorial-text-panel')).not.toBeEmpty();
}

test.describe('Tutorial level tabs', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(10_000);
    await page.addInitScript((key) => localStorage.removeItem(key), VIEWED_KEY);
  });

  test('Basic 17개와 Advanced 12개가 실제 preview·본문과 함께 탭별로 순환한다', async ({ page }) => {
    await page.clock.install();
    const dialog = await openTutorial(page);
    await expect(tab(dialog, 'Basic')).toHaveAttribute('aria-selected', 'true');
    await expect(indexItems(dialog)).toHaveCount(BASIC_IDS.length);
    await expectActive(dialog, BASIC_IDS[0]);

    // Observe the real Pixi keycap updates; the production player has no test hook.
    await page.evaluate(async () => {
      const rendererPath = '/src/game/renderer/GameRenderer.ts';
      const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
      type KeyEntry = { mapped: boolean; pressed: boolean; baseY: number; cap: { y: number; destroyed: boolean } };
      const transitions: Array<{ key: string; pressed: boolean; offset: number }> = [];
      const original = GameRenderer.prototype.setKeyState;
      GameRenderer.prototype.setKeyState = function(key, pressed) {
        const entries = (this as unknown as { tutorialKeyboardKeyByCode: Map<string, KeyEntry> }).tutorialKeyboardKeyByCode;
        const previous = entries.get(key)?.pressed;
        original.call(this, key, pressed);
        const entry = entries.get(key);
        if (entry?.mapped && !entry.cap.destroyed && previous !== entry.pressed && ['KeyS', 'KeyX'].includes(key)) {
          transitions.push({ key, pressed: entry.pressed, offset: entry.cap.y - entry.baseY });
        }
      };
      (globalThis as typeof globalThis & { __tutorialKeyTransitions: typeof transitions }).__tutorialKeyTransitions = transitions;
    });

    await selectTab(dialog, 'Advanced');
    await expect(tab(dialog, 'Advanced')).toHaveAttribute('aria-selected', 'true');
    await expect(indexItems(dialog)).toHaveCount(ADVANCED_IDS.length);
    await expectActive(dialog, ADVANCED_IDS[0]);
    const active = dialog.locator('[data-tutorial-preview-slot="active"]');
    await expect(active.locator('[data-tutorial-binding-notice]')).toContainText('Q W S X');
    const previewCanvas = active.locator('[data-tutorial-preview-canvas="true"]');
    await expect(previewCanvas).toBeVisible();
    await expect.poll(() => previewCanvas.evaluate(canvas => canvas.width > 0 && canvas.height > 0)).toBe(true);
    // Step animation frames through the short middle taps even on slow software WebGL.
    await page.clock.runFor(3200);
    await expect.poll(() => page.evaluate(() => {
      const transitions = (globalThis as typeof globalThis & {
        __tutorialKeyTransitions: Array<{ key: string; pressed: boolean; offset: number }>;
      }).__tutorialKeyTransitions;
      return ['KeyS', 'KeyX'].every(key =>
        transitions.some(item => item.key === key && item.pressed && item.offset === 3) &&
        transitions.some(item => item.key === key && !item.pressed && item.offset === 0));
    }), { timeout: 10_000 }).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('not4k-settings')!).state.settings.keyBindings.lane1)).toEqual(['KeyQ', 'KeyW']);
    await choose(dialog, ADVANCED_IDS[3]);

    await dialog.getByRole('button', { name: 'Previous tutorial' }).click();
    await expectActive(dialog, ADVANCED_IDS[2]);
    await dialog.getByRole('button', { name: 'Next tutorial' }).click();
    await expectActive(dialog, ADVANCED_IDS[3]);

    await choose(dialog, ADVANCED_IDS[0]);
    await dialog.getByRole('button', { name: 'Previous tutorial' }).click();
    await expectActive(dialog, ADVANCED_IDS.at(-1)!);
    await dialog.getByRole('button', { name: 'Next tutorial' }).click();
    await expectActive(dialog, ADVANCED_IDS[0]);

    await selectTab(dialog, 'Basic');
    await expectActive(dialog, BASIC_IDS[0]);
    await dialog.getByRole('button', { name: 'Previous tutorial' }).click();
    await expectActive(dialog, BASIC_IDS.at(-1)!);
    await dialog.getByRole('button', { name: 'Next tutorial' }).click();
    await expectActive(dialog, BASIC_IDS[0]);
  });

  test('탭별 마지막 선택을 기억하고 모달 재개와 빠른 탭 전환은 최종 선택으로 안정화한다', async ({ page }) => {
    const dialog = await openTutorial(page);
    await selectTab(dialog, 'Advanced');
    await choose(dialog, ADVANCED_IDS[5]);
    await selectTab(dialog, 'Basic');
    await choose(dialog, BASIC_IDS[4]);
    await selectTab(dialog, 'Advanced');
    await expectActive(dialog, ADVANCED_IDS[5]);

    // Do not wait for the player between these clicks: exercise in-flight loads.
    for (let index = 0; index < 8; index++) {
      await tab(dialog, index % 2 === 0 ? 'Basic' : 'Advanced').click();
    }
    await expectActive(dialog, ADVANCED_IDS[5]);

    await page.getByRole('button', { name: 'Close tutorial help' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Open tutorial help' }).click();
    const reopened = page.getByRole('dialog', { name: 'Tutorial' });
    await expectActive(reopened, BASIC_IDS[0]);
    await selectTab(reopened, 'Advanced');
    await expect(reopened.locator('[data-tutorial-index-item="' + ADVANCED_IDS[5] + '"]')).toHaveAttribute('data-tutorial-index-seen', 'true');
    await expect(indexItems(reopened)).toHaveCount(ADVANCED_IDS.length);
  });

  test('Advanced 항목을 모두 보면 29개 viewed를 저장하고 Reset Viewed는 Basic 첫 항목만 남긴다', async ({ page }) => {
    await page.addLocatorHandler(page.locator('[data-tutorial-diagram-ok="true"]:visible').first(), async button => {
      await button.click();
    });
    const dialog = await openTutorial(page);
    for (const id of BASIC_IDS) await choose(dialog, id);
    await selectTab(dialog, 'Advanced');
    for (const id of ADVANCED_IDS) await choose(dialog, id);

    const viewed = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as string[], VIEWED_KEY);
    expect(new Set(viewed)).toEqual(new Set([...BASIC_IDS, ...ADVANCED_IDS]));
    await dialog.getByRole('button', { name: 'Reset tutorial viewed cache' }).click();
    const resetViewed = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as string[], VIEWED_KEY);
    expect(resetViewed).toEqual([BASIC_IDS[0]]);
  });

  test('탭 키보드 화살표는 lesson window handler와 중복되지 않고 탭 내부 포커스를 이동한다', async ({ page }) => {
    const dialog = await openTutorial(page);
    const basicTab = tab(dialog, 'Basic');
    const advancedTab = tab(dialog, 'Advanced');
    await advancedTab.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(basicTab).toHaveAttribute('aria-selected', 'true');
    await expectActive(dialog, BASIC_IDS[0]);
    await page.keyboard.press('ArrowRight');
    await expect(advancedTab).toHaveAttribute('aria-selected', 'true');
    await expectActive(dialog, ADVANCED_IDS[0]);
    await page.keyboard.press('End');
    await expect(advancedTab).toBeFocused();
    await expectActive(dialog, ADVANCED_IDS[0]);
    await page.keyboard.press('Home');
    await expect(basicTab).toBeFocused();
    await expectActive(dialog, BASIC_IDS[0]);
  });

  test('390px viewport에서 Advanced 마지막 항목에 접근하고 가로 overflow가 없다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openTutorial(page);
    await selectTab(dialog, 'Advanced');
    const last = dialog.locator('[data-tutorial-index-item="' + ADVANCED_IDS.at(-1)! + '"]');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await last.click();
    await expectActive(dialog, ADVANCED_IDS.at(-1)!);
    await dialog.locator('.not4k-tutorial-text-panel').scrollIntoViewIfNeeded();
    await expect(dialog.locator('.not4k-tutorial-text-panel')).toBeInViewport();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(dialog.locator('[data-tutorial-index-item="' + ADVANCED_IDS.at(-1)! + '"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
