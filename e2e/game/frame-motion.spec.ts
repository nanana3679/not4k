import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

interface MotionProbe {
  /** renderFrame이 불린 횟수(곡 시작 전 한 장 + 게임 프레임 수). */
  frames: number;
  /** renderFrame마다 그 순간의 frameMotion.status(없으면 null). resetStatusLog 뒤부터 쌓인다. */
  statusLog: (string | null)[];
  status: string | null;
  timeMs: number | null;
  running: boolean | null;
  hasFrame: boolean;
  motionObjects: number;
  motionVisible: boolean | null;
}

/**
 * 실제 PlayScreen이 만든 GameRenderer를 renderFrame 관찰로 잡는다(그리기는 바꾸지 않는다). 움직임 상태는 공개 접근자 frameMotion·frameLayout으로 읽고,
 * 움직임 객체 수는 무대에서 'classic-frame-motion' 라벨을 센다.
 */
async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const win = window as unknown as Record<string, unknown>;
    if (win.__frameMotionRenderer !== undefined) return;
    win.__frameMotionRenderer = null;
    win.__frameMotionFrames = 0;
    win.__frameMotionStatusLog = [];
    const rendererPath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
    const renderFrame = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (...args) {
      win.__frameMotionRenderer = this;
      win.__frameMotionFrames = (win.__frameMotionFrames as number) + 1;
      (win.__frameMotionStatusLog as (string | null)[]).push(this.frameMotion?.status ?? null);
      return renderFrame.apply(this, args);
    };
  });
}

async function readProbe(page: Page): Promise<MotionProbe> {
  return page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    const renderer = win.__frameMotionRenderer as import('../../src/game/renderer/GameRenderer').GameRenderer | null;
    const stage = renderer ? (renderer as unknown as { app: import('pixi.js').Application }).app.stage : null;
    const motionRoots: import('pixi.js').Container[] = [];
    const walk = (node: import('pixi.js').Container) => {
      if (node.label === 'classic-frame-motion' || node.label === 'classic-frame-motion-holder') motionRoots.push(node);
      for (const child of node.children) walk(child);
    };
    if (stage) walk(stage);
    const motion = renderer?.frameMotion ?? null;
    const root = motionRoots.find(node => node.label === 'classic-frame-motion');
    return {
      frames: win.__frameMotionFrames as number,
      statusLog: [...(win.__frameMotionStatusLog as (string | null)[])],
      status: motion?.status ?? null,
      timeMs: motion?.timeMs ?? null,
      running: motion?.running ?? null,
      hasFrame: Boolean(renderer?.frameLayout),
      motionObjects: motionRoots.length,
      motionVisible: root ? root.visible : null,
    };
  });
}

async function resetStatusLog(page: Page) {
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__frameMotionStatusLog = []; });
}

/** 브라우저 requestAnimationFrame을 count번 기다린다(벽시계 대기 대신 화면 프레임 수로 기다린다). */
async function waitAnimationFrames(page: Page, count: number) {
  await page.evaluate((frames) => new Promise<void>((resolve) => {
    let left = frames;
    const step = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), count);
}

async function startLocalPlay(page: Page, frameMotion: boolean) {
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await installProbe(page);
  await resetStatusLog(page);
  await page.evaluate(async (motionOn) => {
    const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const state = useGameStore.getState();
    state.updateSettings({ isFirstLaunch: false, renderHeight: 720, masterVolume: 0, frameMotion: motionOn });
    state.setChartData({
      meta: { title: 'Frame motion check', artist: 'Local', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: [{ type: 'single', lane: 1, beat: { n: 100, d: 1 } }],
      trillZones: [],
      events: [{ type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 }, { type: 'timeSignature', beat: { n: 0, d: 1 }, beatPerMeasure: { n: 4, d: 1 } }],
    });
    state.setAudioBuffer(new AudioBuffer({ length: 44100 * 90, sampleRate: 44100, numberOfChannels: 1 }));
    useGameStore.setState({ screen: 'play', startTimeMs: 0, editorReturnUrl: null });
  }, frameMotion);
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 30_000 });
}

test.describe('실제 플레이의 Classic 프레임 움직임', () => {
  test.describe.configure({ timeout: 90_000 });

  test('프레임 움직임 켬: 움직임 시계가 게임 프레임과 함께 흐르고 일시정지(Esc) 중에는 renderFrame과 함께 멈췄다가 재개하면 멈춘 자리에서 이어 간다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await startLocalPlay(page, true);

    await expect.poll(async () => (await readProbe(page)).status, { timeout: 30_000 }).toBe('ready');
    const ready = await readProbe(page);
    expect(ready).toMatchObject({ hasFrame: true, running: true, motionObjects: 2, motionVisible: true });

    // 게임 프레임이 지나면 시계가 나아간다. 프레임 하나에 최대 50ms라 지난 프레임 수 × 50을 넘지 않는다.
    await expect.poll(async () => (await readProbe(page)).timeMs ?? 0, { timeout: 30_000 }).toBeGreaterThan(200);
    const before = await readProbe(page);
    await waitAnimationFrames(page, 10);
    const after = await readProbe(page);
    expect(after.frames).toBeGreaterThan(before.frames);
    expect(after.timeMs!).toBeGreaterThan(before.timeMs!);
    expect(after.timeMs! - before.timeMs!).toBeLessThanOrEqual(50 * (after.frames - before.frames));

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    const paused = await readProbe(page);
    await waitAnimationFrames(page, 30);
    const stillPaused = await readProbe(page);
    // 일시정지 중에는 게임 루프가 renderFrame을 부르지 않으므로 시계도 그대로다.
    expect(stillPaused.frames).toBe(paused.frames);
    expect(stillPaused.timeMs).toBe(paused.timeMs);

    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect.poll(async () => (await readProbe(page)).timeMs ?? 0, { timeout: 15_000 }).toBeGreaterThan(paused.timeMs!);
    const resumed = await readProbe(page);
    // 일시정지한 시간만큼 건너뛰지 않고 재개 뒤 게임 프레임만큼만 나아간다.
    expect(resumed.timeMs! - paused.timeMs!).toBeLessThanOrEqual(50 * (resumed.frames - paused.frames));
    expect(errors).toEqual([]);
  });

  test('프레임 움직임 끔(설정 frameMotion false): 실제 플레이 렌더러는 프레임만 그리고 frameMotion이 null이며 움직임 객체가 없고 움직임 자료를 요청하지 않는다', async ({ page }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await startLocalPlay(page, false);

    await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
    const probe = await readProbe(page);
    expect(probe).toMatchObject({ hasFrame: true, status: null, timeMs: null, running: null, motionObjects: 0 });
    expect(requested.some(path => path.includes('/gear/classic-frame-motion/'))).toBe(false);
    expect(requested).toContain('/gear/classic-frame.png');
    expect(errors).toEqual([]);
  });

  test('움직임 줄이기(prefers-reduced-motion: reduce)면 설정이 켜져 있어도 실제 플레이에서 움직임을 만들지 않고(frameMotion null·객체 0개) 움직임 자료를 요청하지 않는다', async ({ page }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startLocalPlay(page, true);

    await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
    const probe = await readProbe(page);
    expect(probe).toMatchObject({ hasFrame: true, status: null, timeMs: null, running: null, motionObjects: 0 });
    expect(requested.some(path => path.includes('/gear/classic-frame-motion/'))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('첫 플레이와 일시정지 메뉴 Retry 모두 첫 renderFrame(곡 시작 전 한 장)부터 frameMotion이 ready이고 재생 중 얹기가 일어나지 않는다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await startLocalPlay(page, true);

    await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
    const first = await readProbe(page);
    expect(first.statusLog[0]).toBe('ready');
    expect(new Set(first.statusLog)).toEqual(new Set(['ready']));

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await resetStatusLog(page);
    await expect.poll(async () => (await readProbe(page)).statusLog.length, { timeout: 30_000 }).toBeGreaterThan(10);
    const retried = await readProbe(page);
    expect(retried.statusLog[0]).toBe('ready');
    expect(new Set(retried.statusLog)).toEqual(new Set(['ready']));
    expect(errors).toEqual([]);
  });

  test('움직임 자료가 곡 시작 뒤에 오면 재생 중에는 얹지 않고(deferred, 정적 프레임) 일시정지하면 그때 얹으며 재개 뒤 흐른다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/gear/classic-frame-motion/frame-motion.json', async (route) => {
      await gate;
      await route.continue();
    });
    await startLocalPlay(page, true);

    // 자료 없이 곡이 시작해 게임 프레임이 돈다(곡 시작 전 대기는 1.2초 안에서 끝난다).
    await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
    expect((await readProbe(page)).status).toBe('loading');
    const response = page.waitForResponse(response => response.url().endsWith('/gear/classic-frame-motion/frame-motion.json'));
    release();
    await (await response).finished();
    await expect.poll(async () => (await readProbe(page)).status, { timeout: 30_000 }).toBe('deferred');
    await waitAnimationFrames(page, 10);
    const playing = await readProbe(page);
    expect(playing.statusLog).not.toContain('ready');
    expect(playing).toMatchObject({ status: 'deferred', motionObjects: 1, running: false, timeMs: 0 });

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    await expect.poll(async () => (await readProbe(page)).status, { timeout: 15_000 }).toBe('ready');
    const paused = await readProbe(page);
    expect(paused).toMatchObject({ motionObjects: 2, timeMs: 0 });

    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect.poll(async () => (await readProbe(page)).timeMs ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
