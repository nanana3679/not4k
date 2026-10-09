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
    await expect.poll(() => previewCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.width > 0 && canvas.height > 0)).toBe(true);
    // Step animation frames through the short middle taps even on slow software WebGL.
    await page.clock.runFor(3200);
    await expect.poll(() => page.evaluate(() => {
      const transitions = (globalThis as typeof globalThis & {
        __tutorialKeyTransitions: Array<{ key: string; pressed: boolean; offset: number }>;
      }).__tutorialKeyTransitions;
      // 눌린 키캡은 설계값 3 × 플레이필드 배율 0.625 = 1.875 내려간다(RFD 0029).
      return ['KeyS', 'KeyX'].every(key =>
        transitions.some(item => item.key === key && item.pressed && item.offset === 1.875) &&
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

interface LaneEndProbe {
  /** 레인 끝 아래로 내려간 노트를 본 렌더 프레임 수 */
  frames: number;
  /** 그 프레임들에서 레인 끝 아래(키캡·키봄·글자 밖) 노트 자리를 검사한 픽셀 수와, 캔버스 바탕색과의 최대 채널 차이 */
  checkedBelow: number;
  worstBelow: number;
  /** 레인 끝 바로 위 레인 열(레인 배경·노트)이 바탕색과 다른 정도. 검사 방법이 실제 픽셀을 읽는지 확인한다 */
  bestAbove: number;
}

test.describe('튜토리얼 재생기 레인 끝 클립 (#247)', () => {
  test.setTimeout(120_000);

  test('기어 없는 재생기에서 놓친 노트가 판정선을 지나 레인 끝(판정선 + 노트 반 칸) 아래로 내려가도 레인 끝 아래 노트 자리는 키캡·키봄·판정 글자 밖에서 캔버스 바탕색 그대로(채널 차 8 이하)이고, 레인 끝 바로 위 레인 열은 레인 배경으로 보인다', async ({ page }) => {
    const dialog = await openTutorial(page);
    await expect(dialog.locator('[data-tutorial-preview-slot="active"] [data-tutorial-preview-canvas="true"]')).toBeVisible();
    // 재생기에는 테스트 훅이 없으므로 실제 GameRenderer.renderFrame을 감싸, 그린 직후(같은 task라 드로잉 버퍼가 남아 있다)
    // 레인 끝 아래로 내려간 노트 자리의 픽셀을 gl.readPixels로 읽는다. 실제 WebGL 스텐실이 필요해 vitest로는 확인할 수 없다.
    await page.evaluate(async () => {
      // Vite HMR은 재생기가 가져오는 모듈에 ?t=를 붙일 수 있다. 같은 소스를 별도 URL로 import하면 다른 class를 계측하게 된다.
      const rendererUrl = performance.getEntriesByType('resource').map(entry => entry.name)
        .find(url => new URL(url).pathname === '/src/game/renderer/GameRenderer.ts');
      if (!rendererUrl) throw new Error('튜토리얼 재생기가 로드한 GameRenderer 모듈을 찾을 수 없습니다');
      const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererUrl);
      type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
      type Child = { visible: boolean; getBounds(): Bounds };
      type Layer = { children: Child[] };
      type Internals = {
        app: { canvas: HTMLCanvasElement; renderer: { gl: WebGLRenderingContext; resolution: number } };
        width: number; height: number;
        skinManager: { getTheme(): { bg: number } };
        laneEndY(): number;
        noteLayer: Layer; longNoteHeadLayer: Layer; longNoteEndLayer: Layer; longNoteBodyLayer: Layer;
        laneKeyLabelLayer: Layer; effectLayer: Layer; uiLayer: Layer; tutorialKeyboardLayer: Layer;
      };
      const probe = { frames: 0, checkedBelow: 0, worstBelow: 0, bestAbove: 0 };
      (globalThis as typeof globalThis & { __laneEndProbe: typeof probe }).__laneEndProbe = probe;
      const original = GameRenderer.prototype.renderFrame;
      GameRenderer.prototype.renderFrame = function (songTimeMs, deltaMs) {
        original.call(this, songTimeMs, deltaMs);
        const self = this as unknown as Internals;
        if (!self.app?.canvas?.closest('[data-tutorial-preview-slot="active"][data-tutorial-preview-id="advanced-partial-double"]')) return;
        const laneEnd = self.laneEndY();
        const passed: Bounds[] = [];
        for (const layer of [self.noteLayer, self.longNoteHeadLayer, self.longNoteEndLayer, self.longNoteBodyLayer]) {
          for (const child of layer.children) {
            if (!child.visible) continue;
            const bounds = child.getBounds();
            if (bounds.maxY > laneEnd + 4) passed.push(bounds);
          }
        }
        if (passed.length === 0) return;
        // 클립 밖(stage)에 그리는 레인 키캡·키봄·판정 글자·키보드 strip은 레인 끝 아래에도 보이는 게 맞으므로 검사에서 뺀다.
        const overlays: Bounds[] = [];
        for (const layer of [self.laneKeyLabelLayer, self.effectLayer, self.uiLayer, self.tutorialKeyboardLayer]) {
          for (const child of layer.children) if (child.visible) overlays.push(child.getBounds());
        }
        const covered = (x: number, y: number) => overlays.some(o => x >= o.minX - 1 && x <= o.maxX + 1 && y >= o.minY - 1 && y <= o.maxY + 1);
        const { gl, resolution } = self.app.renderer;
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const bg = self.skinManager.getTheme().bg;
        const bgRgb = [(bg >> 16) & 0xff, (bg >> 8) & 0xff, bg & 0xff];
        const differenceAt = (x: number, y: number) => {
          const i = ((height - 1 - y) * width + x) * 4;
          return Math.max(...bgRgb.map((value, channel) => Math.abs(pixels[i + channel] - value)));
        };
        probe.frames++;
        for (const bounds of passed) {
          const left = Math.ceil(Math.max(0, bounds.minX) * resolution) + 1;
          const right = Math.floor(Math.min(self.width, bounds.maxX) * resolution) - 1;
          // 레인 끝 아래: 경계 반올림을 피해 레인 끝 1 아래부터 노트 아래끝(플레이 영역 안)까지
          const belowTop = Math.ceil((Math.max(bounds.minY, laneEnd) + 1) * resolution);
          const belowBottom = Math.floor(Math.min(bounds.maxY, self.height) * resolution) - 1;
          for (let y = belowTop; y <= belowBottom; y++) {
            for (let x = left; x <= right; x++) {
              if (covered((x + 0.5) / resolution, (y + 0.5) / resolution)) continue;
              probe.checkedBelow++;
              probe.worstBelow = Math.max(probe.worstBelow, differenceAt(x, y));
            }
          }
        }
        // 레인 끝 바로 위(레인 끝 3~1 위) 레인 열: 레인 배경이나 노트라 바탕색과 달라야 한다.
        for (let y = Math.ceil((laneEnd - 3) * resolution); y <= Math.floor((laneEnd - 1) * resolution); y++) {
          for (let x = 0; x < Math.floor(self.width * resolution); x++) {
            if (covered((x + 0.5) / resolution, (y + 0.5) / resolution)) continue;
            probe.bestAbove = Math.max(probe.bestAbove, differenceAt(x, y));
          }
        }
      };
    });

    await selectTab(dialog, 'Advanced');
    await choose(dialog, 'advanced-partial-double');
    const readProbe = () => page.evaluate(() => (globalThis as typeof globalThis & { __laneEndProbe: LaneEndProbe }).__laneEndProbe);
    // 시연은 더블 시작에서 한 키만 눌러 다른 쪽을 Miss로 두므로, 루프마다 놓친 노트가 판정선 아래로 내려간다.
    await expect.poll(async () => {
      const probe = await readProbe();
      return probe.frames >= 3 && probe.checkedBelow > 0;
    }, { timeout: 60_000 }).toBe(true);
    const probe = await readProbe();
    // 레인 끝 아래 노트 자리는 캔버스 바탕색(채널 차 8 이하)이다. 지금은 클립이, 예전에는 불투명 사각형이 노트를 가렸다.
    expect(probe.worstBelow, `레인 끝 아래 ${probe.checkedBelow}픽셀의 바탕색 최대 차이`).toBeLessThanOrEqual(8);
    // 검사 방법이 실제 픽셀을 읽는지: 레인 끝 바로 위 레인 열은 레인 배경(0x202038·0x26263f)이라 바탕색과 20 넘게 다르다.
    expect(probe.bestAbove).toBeGreaterThan(20);
  });
});
