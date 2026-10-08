import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

interface MotionProbe {
  /** AudioEngine.play가 불린 횟수(곡 시작). */
  audioPlays: number;
  /** renderFrame이 불린 횟수(warm-up의 첫 프레임 + 렌더 프레임 수). */
  frames: number;
  /** renderFrame마다 그 순간의 gearMotion.status(없으면 null). resetStatusLog 뒤부터 쌓인다. */
  statusLog: (string | null)[];
  status: string | null;
  timeMs: number | null;
  running: boolean | null;
  hasGear: boolean;
  motionObjects: number;
  motionVisible: boolean | null;
  /** 무대의 'gear-gauge'(고도 게이지 덮개) 수와, 그것이 기어 레이어의 맨 위(마지막 자식)인지. */
  gaugeObjects: number;
  gaugeOnTop: boolean | null;
  /** 렌더러가 지금 보여 주는 게이지 채움(gearGaugeLevel)과 같은 프레임에 비행 배경이 받은 고도(data-altitude). */
  gaugeLevel: number | null;
  backgroundAltitude: number | null;
}

/**
 * 실제 PlayScreen이 만든 GameRenderer를 renderFrame 관찰로 잡는다(그리기는 바꾸지 않는다). `gearMotion` 상태는 공개 접근자 gearMotion·gearLayout으로 읽고,
 * `gearMotion` 객체 수는 무대에서 'gear-motion' 라벨을 센다.
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
    const gauges: import('pixi.js').Container[] = [];
    const walk = (node: import('pixi.js').Container) => {
      if (node.label === 'gear-motion' || node.label === 'gear-motion-holder') motionRoots.push(node);
      if (node.label === 'gear-gauge') gauges.push(node);
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
      gaugeObjects: gauges.length,
      gaugeOnTop: gauges[0]?.parent ? gauges[0].parent.children.at(-1) === gauges[0] : null,
      gaugeLevel: renderer?.gearGaugeLevel ?? null,
      backgroundAltitude: (() => {
        const value = document.querySelector<HTMLElement>('[data-flight-background]')?.dataset.altitude;
        return value === undefined ? null : Number(value);
      })(),
    };
  });
}

/**
 * 실제 플레이 렌더러에 MISS 고도 효과를 넣고, 그 뒤 첫 renderFrame이 끝난 화면 프레임에서 게이지 채움과 비행 배경 고도를 읽는다.
 * (판정 엔진 없이 렌더러 공개 메서드 recordFlightJudgment로 판정 결과만 흉내 낸다.)
 */
async function injectMissAndReadNextFrame(page: Page): Promise<{ gaugeLevel: number; backgroundAltitude: number; frames: number }> {
  return page.evaluate(() => new Promise((resolve) => {
    const win = window as unknown as Record<string, unknown>;
    const renderer = win.__gearMotionRenderer as import('../../src/game/renderer/GameRenderer').GameRenderer;
    const start = win.__gearMotionFrames as number;
    renderer.recordFlightJudgment('miss');
    const check = () => {
      const frames = (win.__gearMotionFrames as number) - start;
      if (frames < 1) { requestAnimationFrame(check); return; }
      const background = document.querySelector<HTMLElement>('[data-flight-background]')!;
      resolve({ gaugeLevel: renderer.gearGaugeLevel!, backgroundAltitude: Number(background.dataset.altitude), frames });
    };
    requestAnimationFrame(check);
  }));
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

test.describe('실제 플레이의 gearMotion(기어 위 장식 애니메이션)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('gearMotion 켬: 애니메이션 경과 시간(timeMs)이 렌더 프레임과 함께 흐르고 일시정지(Esc) 중에는 renderFrame과 함께 멈췄다가 재개하면 멈춘 시점에서 이어 간다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await startLocalPlay(page, true);

    await expect.poll(async () => (await readProbe(page)).status, { timeout: 30_000 }).toBe('ready');
    const ready = await readProbe(page);
    expect(ready).toMatchObject({ hasGear: true, running: true, motionObjects: 2, motionVisible: true });

    // 렌더 프레임이 지나면 애니메이션 경과 시간(timeMs)이 나아간다. 프레임 하나에 최대 50ms라 지난 프레임 수 × 50을 넘지 않는다.
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
    // 일시정지 중에는 게임 루프가 renderFrame을 부르지 않으므로 애니메이션 경과 시간도 그대로다.
    expect(stillPaused.frames).toBe(paused.frames);
    expect(stillPaused.timeMs).toBe(paused.timeMs);

    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect.poll(async () => (await readProbe(page)).timeMs ?? 0, { timeout: 15_000 }).toBeGreaterThan(paused.timeMs!);
    const resumed = await readProbe(page);
    // 일시정지한 시간만큼 건너뛰지 않고 재개 뒤 렌더 프레임만큼만 나아간다.
    expect(resumed.timeMs! - paused.timeMs!).toBeLessThanOrEqual(50 * (resumed.frames - paused.frames));
    expect(errors).toEqual([]);
  });

  for (const motionOn of [true, false]) {
    test(`gearMotion ${motionOn ? '켬' : '끔'}: 실제 플레이에서 고도 게이지가 기어 레이어 맨 위에 하나 있고 비행 배경과 같은 고도를 보여 주며, MISS를 넣으면 바로 떨어지지 않고 이징으로 0.24 내려가 배경 고도에 붙는다`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await startLocalPlay(page, motionOn);

      await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
      const playing = await readProbe(page);
      expect(playing).toMatchObject({ hasGear: true, gaugeObjects: 1, gaugeOnTop: true, motionObjects: motionOn ? 2 : 0 });
      // 곡 진행에 따른 임시 고도(90초 곡 앞부분이라 1에 가깝다)를 배경과 게이지가 함께 보여 준다.
      expect(playing.backgroundAltitude!).toBeGreaterThan(0.9);
      expect(Math.abs(playing.gaugeLevel! - playing.backgroundAltitude!)).toBeLessThan(0.005);

      const afterMiss = await injectMissAndReadNextFrame(page);
      // 배경은 같은 프레임에 0.24 낮은 고도를 받지만, 게이지는 300ms ease-out 느낌으로 따라가 아직 위에 있다.
      expect(afterMiss.backgroundAltitude).toBeLessThan(playing.backgroundAltitude! - 0.2);
      expect(afterMiss.gaugeLevel - afterMiss.backgroundAltitude).toBeGreaterThan(0.02);
      await expect.poll(async () => {
        const probe = await readProbe(page);
        return Math.abs(probe.gaugeLevel! - probe.backgroundAltitude!);
      }, { timeout: 5_000 }).toBeLessThan(0.005);
      expect(errors).toEqual([]);
    });
  }

  test('gearMotion 끔(설정 gearMotion false): 실제 플레이 렌더러는 기어만 그리고 GameRenderer.gearMotion이 null이며 gearMotion 객체가 없고 gearMotion 에셋을 요청하지 않는다', async ({ page }) => {
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
    // 고도 게이지 빈 유리는 `Gear Motion` 설정과 무관한 스킨 공통 에셋이다.
    expect(requested).toContain('/gear/gear-gauge-empty.png');
    expect(errors).toEqual([]);
  });

  test('모션 감소 설정(prefers-reduced-motion: reduce)이 켜져 있어도 Gear Motion 켬이면 실제 플레이에서 gearMotion 에셋을 요청해 gearMotion을 만들고(ready·running·객체 2개) timeMs가 흐르며, MISS 뒤 게이지는 바로 떨어지지 않고 이징한다(RFD 0030)', async ({ page }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startLocalPlay(page, true);

    await expect.poll(async () => (await readProbe(page)).timeMs ?? 0, { timeout: 30_000 }).toBeGreaterThan(200);
    const probe = await readProbe(page);
    expect(probe).toMatchObject({ hasGear: true, status: 'ready', running: true, motionObjects: 2, motionVisible: true });
    expect(requested).toContain('/gear/gear-motion/gear-motion.json');

    const afterMiss = await injectMissAndReadNextFrame(page);
    expect(afterMiss.gaugeLevel - afterMiss.backgroundAltitude).toBeGreaterThan(0.02);
    expect(errors).toEqual([]);
  });

  test('첫 플레이와 일시정지 메뉴 Retry 모두 첫 renderFrame(warm-up의 첫 프레임)부터 gearMotion이 ready이고 재생 중 holder 추가가 일어나지 않는다', async ({ page }) => {
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

  test('gear-motion.json 응답을 보류하면 곡 시작(renderFrame·오디오 재생)이 그만큼 기다리고, 응답을 보내면 첫 renderFrame부터 ready로 시작한다', async ({ page }) => {
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

    // `gearMotion` 에셋 응답이 보류된 동안에는 화면이 30프레임 지나도 렌더러가 그리지 않고 곡도 시작하지 않는다.
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

  // `gearMotion` 에셋은 스킨 텍스처와 같은 필수 에셋이다. 둘 중 하나를 받지 못하면 같은 길(곡을 시작하지 않고 오류 화면 → 곡 선택)을 간다.
  for (const [name, asset] of [
    ['스킨 텍스처(note-single.png)', '**/skins/classic/note-single.png'],
    ['gearMotion 데이터(gear-motion.json)', '**/gear/gear-motion/gear-motion.json'],
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
