import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

interface MotionProbe {
  /** AudioEngine.play가 불린 횟수(곡 시작). */
  audioPlays: number;
  /** renderFrame이 불린 횟수(곡 시작 전 한 장 + 게임 프레임 수). */
  frames: number;
  /** renderFrame마다 그 순간의 gearMotion.status(없으면 null). resetStatusLog 뒤부터 쌓인다. */
  statusLog: (string | null)[];
  status: string | null;
  timeMs: number | null;
  running: boolean | null;
  hasGear: boolean;
  motionObjects: number;
  motionVisible: boolean | null;
}

/**
 * 실제 PlayScreen이 만든 GameRenderer를 renderFrame 관찰로 잡는다(그리기는 바꾸지 않는다). 움직임 상태는 공개 접근자 gearMotion·gearLayout으로 읽고,
 * 움직임 객체 수는 무대에서 'gear-motion' 라벨을 센다.
 */
async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const win = window as unknown as Record<string, unknown>;
    if (win.__gearMotionRenderer !== undefined) return;
    win.__gearMotionRenderer = null;
    win.__gearMotionFrames = 0;
    win.__gearMotionStatusLog = [];
    win.__audioPlays = 0;
    const audioPath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/audio/AudioEngine.ts') ?? '/src/game/audio/AudioEngine.ts';
    const { AudioEngine }: typeof import('../../src/game/audio/AudioEngine') = await import(audioPath);
    const play = AudioEngine.prototype.play;
    AudioEngine.prototype.play = function (...args) {
      win.__audioPlays = (win.__audioPlays as number) + 1;
      return play.apply(this, args);
    };
    const rendererPath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
    const renderFrame = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (...args) {
      win.__gearMotionRenderer = this;
      win.__gearMotionFrames = (win.__gearMotionFrames as number) + 1;
      (win.__gearMotionStatusLog as (string | null)[]).push(this.gearMotion?.status ?? null);
      return renderFrame.apply(this, args);
    };
  });
}

async function readProbe(page: Page): Promise<MotionProbe> {
  return page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    const renderer = win.__gearMotionRenderer as import('../../src/game/renderer/GameRenderer').GameRenderer | null;
    const stage = renderer ? (renderer as unknown as { app: import('pixi.js').Application }).app.stage : null;
    const motionRoots: import('pixi.js').Container[] = [];
    const walk = (node: import('pixi.js').Container) => {
      if (node.label === 'gear-motion' || node.label === 'gear-motion-holder') motionRoots.push(node);
      for (const child of node.children) walk(child);
    };
    if (stage) walk(stage);
    const motion = renderer?.gearMotion ?? null;
    const root = motionRoots.find(node => node.label === 'gear-motion');
    return {
      audioPlays: win.__audioPlays as number,
      frames: win.__gearMotionFrames as number,
      statusLog: [...(win.__gearMotionStatusLog as (string | null)[])],
      status: motion?.status ?? null,
      timeMs: motion?.timeMs ?? null,
      running: motion?.running ?? null,
      hasGear: Boolean(renderer?.gearLayout),
      motionObjects: motionRoots.length,
      motionVisible: root ? root.visible : null,
    };
  });
}

async function resetStatusLog(page: Page) {
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__gearMotionStatusLog = []; });
}

/** 브라우저 requestAnimationFrame을 count번 기다린다(벽시계 대기 대신 화면 프레임 수로 기다린다). */
async function waitAnimationFrames(page: Page, count: number) {
  await page.evaluate((frames) => new Promise<void>((resolve) => {
    let left = frames;
    const step = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), count);
}

async function startLocalPlay(page: Page, gearMotion: boolean, { waitForCanvas = true }: { waitForCanvas?: boolean } = {}) {
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
    state.updateSettings({ isFirstLaunch: false, renderHeight: 720, masterVolume: 0, gearMotion: motionOn });
    state.setChartData({
      meta: { title: 'Gear motion check', artist: 'Local', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: [{ type: 'single', lane: 1, beat: { n: 100, d: 1 } }],
      trillZones: [],
      events: [{ type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 }, { type: 'timeSignature', beat: { n: 0, d: 1 }, beatPerMeasure: { n: 4, d: 1 } }],
    });
    state.setAudioBuffer(new AudioBuffer({ length: 44100 * 90, sampleRate: 44100, numberOfChannels: 1 }));
    useGameStore.setState({ screen: 'play', startTimeMs: 0, editorReturnUrl: null });
  }, gearMotion);
  if (waitForCanvas) await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 30_000 });
}

test.describe('실제 플레이의 기어 움직임', () => {
  test.describe.configure({ timeout: 90_000 });

  test('기어 움직임 켬: 움직임 시계가 게임 프레임과 함께 흐르고 일시정지(Esc) 중에는 renderFrame과 함께 멈췄다가 재개하면 멈춘 자리에서 이어 간다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await startLocalPlay(page, true);

    await expect.poll(async () => (await readProbe(page)).status, { timeout: 30_000 }).toBe('ready');
    const ready = await readProbe(page);
    expect(ready).toMatchObject({ hasGear: true, running: true, motionObjects: 2, motionVisible: true });

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

  test('기어 움직임 끔(설정 gearMotion false): 실제 플레이 렌더러는 기어만 그리고 gearMotion이 null이며 움직임 객체가 없고 움직임 자료를 요청하지 않는다', async ({ page }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await startLocalPlay(page, false);

    await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
    const probe = await readProbe(page);
    expect(probe).toMatchObject({ hasGear: true, status: null, timeMs: null, running: null, motionObjects: 0 });
    expect(requested.some(path => path.includes('/gear/gear-motion/'))).toBe(false);
    expect(requested).toContain('/gear/gear.png');
    expect(errors).toEqual([]);
  });

  test('움직임 줄이기(prefers-reduced-motion: reduce)면 설정이 켜져 있어도 실제 플레이에서 움직임을 만들지 않고(gearMotion null·객체 0개) 움직임 자료를 요청하지 않는다', async ({ page }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startLocalPlay(page, true);

    await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
    const probe = await readProbe(page);
    expect(probe).toMatchObject({ hasGear: true, status: null, timeMs: null, running: null, motionObjects: 0 });
    expect(requested.some(path => path.includes('/gear/gear-motion/'))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('첫 플레이와 일시정지 메뉴 Retry 모두 첫 renderFrame(곡 시작 전 한 장)부터 gearMotion이 ready이고 재생 중 얹기가 일어나지 않는다', async ({ page }) => {
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

  test('gear-motion.json을 붙잡아 두면 곡 시작(renderFrame·오디오 재생)이 그만큼 기다리고, 놓으면 첫 renderFrame부터 ready로 시작한다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let requested!: () => void;
    const requestStarted = new Promise<void>((resolve) => { requested = resolve; });
    await page.route('**/gear/gear-motion/gear-motion.json', async (route) => {
      requested();
      await gate;
      await route.continue();
    });
    await startLocalPlay(page, true);
    await requestStarted;

    // 자료가 붙잡혀 있는 동안에는 화면이 30프레임 지나도 렌더러가 그리지 않고 곡도 시작하지 않는다.
    await waitAnimationFrames(page, 30);
    expect(await readProbe(page)).toMatchObject({ frames: 0, audioPlays: 0 });

    release();
    await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
    const started = await readProbe(page);
    expect(started.audioPlays).toBe(1);
    expect(started.statusLog[0]).toBe('ready');
    expect(new Set(started.statusLog)).toEqual(new Set(['ready']));
    expect(errors).toEqual([]);
  });

  // 움직임 자료는 스킨 텍스처와 같은 필수 자료다. 둘 중 하나를 받지 못하면 같은 길(곡을 시작하지 않고 오류 화면 → 곡 선택)을 간다.
  for (const [name, asset] of [
    ['스킨 텍스처(note-single.png)', '**/skins/classic/note-single.png'],
    ['기어 움직임 자료(gear-motion.json)', '**/gear/gear-motion/gear-motion.json'],
  ] as const) {
    test(`${name}를 받지 못하면 곡을 시작하지 않고(renderFrame·오디오 0번) 오류 화면의 Back to Song Select로 곡 선택에 돌아간다`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
      await page.route(asset, route => route.abort('failed'));
      await startLocalPlay(page, true, { waitForCanvas: false });

      const back = page.getByRole('button', { name: 'Back to Song Select', exact: true });
      await expect(back).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('gameplay-canvas')).toHaveCount(0);
      await expect(page.locator('[data-flight-background]')).toHaveCount(0);
      expect(await readProbe(page)).toMatchObject({ frames: 0, audioPlays: 0 });
      await back.click();
      await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
