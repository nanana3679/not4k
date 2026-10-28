import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

interface PauseProbe {
  /** AudioEngine.play가 불린 횟수(곡 시작과 Retry의 다시 시작. 이 파일의 테스트는 Resume을 누르지 않는다). */
  audioPlays: number;
  /** renderFrame이 불린 횟수(warm-up의 첫 프레임 + 게임 루프의 렌더 프레임). 일시정지 중에는 게임 루프가 renderFrame을 부르지 않는다. */
  frames: number;
  /** 마지막으로 play한 AudioEngine이 음원을 재생 중인지(`AudioEngine.playing`). 아직 아무 AudioEngine도 play하지 않았으면 null. */
  audioPlaying: boolean | null;
  /** holdNextOutputLatencyPreparation 뒤 보류한 L₀ 준비(`AudioEngine.prepareForPlayback`) 수. */
  heldOutputLatencyPreparations: number;
}

/**
 * 실제 PlayScreen이 만든 AudioEngine·GameRenderer를 관찰한다. play·renderFrame 호출 수와 마지막으로 play한 AudioEngine을 기록한다.
 * holdNextOutputLatencyPreparation을 부르면 다음에 만든 AudioEngine의 L₀ 준비(`AudioEngine.prepareForPlayback`, 출력 지연 L₀ 확정)가
 * releaseOutputLatencyPreparation 전까지 끝나지 않는다(느린 오디오 장치처럼 로딩이 길어진다). 렌더러 warm-up(`GameRenderer.prepareForPlayback`)은 보류하지 않는다.
 */
async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const win = window as unknown as Record<string, unknown>;
    if (win.__pauseProbeInstalled) return;
    win.__pauseProbeInstalled = true;
    win.__audioPlays = 0;
    win.__frames = 0;
    win.__audioEngine = null;
    win.__holdNextOutputLatencyPreparation = false;
    win.__heldOutputLatencyPreparations = 0;
    const modulePath = (path: string) => performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === path) ?? path;
    const { AudioEngine }: typeof import('../../src/game/audio/AudioEngine') = await import(modulePath('/src/game/audio/AudioEngine.ts'));
    const play = AudioEngine.prototype.play;
    AudioEngine.prototype.play = function (...args) {
      win.__audioPlays = (win.__audioPlays as number) + 1;
      win.__audioEngine = this;
      return play.apply(this, args);
    };
    const prepare = AudioEngine.prototype.prepareForPlayback;
    AudioEngine.prototype.prepareForPlayback = function () {
      const ready = prepare.call(this);
      if (!win.__holdNextOutputLatencyPreparation) return ready;
      win.__holdNextOutputLatencyPreparation = false;
      win.__heldOutputLatencyPreparations = (win.__heldOutputLatencyPreparations as number) + 1;
      const released = new Promise<void>((resolve) => { win.__releaseOutputLatencyPreparation = resolve; });
      return Promise.all([ready, released]).then(() => undefined);
    };
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(modulePath('/src/game/renderer/GameRenderer.ts'));
    const renderFrame = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (...args) {
      win.__frames = (win.__frames as number) + 1;
      return renderFrame.apply(this, args);
    };
  });
}

async function readProbe(page: Page): Promise<PauseProbe> {
  return page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    const engine = win.__audioEngine as import('../../src/game/audio/AudioEngine').AudioEngine | null;
    return {
      audioPlays: win.__audioPlays as number,
      frames: win.__frames as number,
      audioPlaying: engine ? engine.playing : null,
      heldOutputLatencyPreparations: win.__heldOutputLatencyPreparations as number,
    };
  });
}

/** 다음에 만든 AudioEngine의 L₀ 준비(`AudioEngine.prepareForPlayback`)를 releaseOutputLatencyPreparation 전까지 보류한다. */
async function holdNextOutputLatencyPreparation(page: Page) {
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__holdNextOutputLatencyPreparation = true; });
}

/**
 * L₀ 준비 보류를 끄고, 보류 중인 준비가 있으면 끝나게 한다. 여러 번 불러도 되므로 finally에서도 부른다.
 * 페이지가 이미 닫혔으면(시간 초과 뒤 정리) 풀 것이 없다.
 */
async function releaseOutputLatencyPreparation(page: Page) {
  if (page.isClosed()) return;
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__holdNextOutputLatencyPreparation = false;
    (win.__releaseOutputLatencyPreparation as (() => void) | undefined)?.();
  });
}

/**
 * asset 응답을 release를 부를 때까지 보류한다. dispose는 보류를 풀고 page의 route를 모두 지우며, 진행 중인 route 처리기가
 * 응답을 보내고 끝날 때까지 기다린다(`unrouteAll({ behavior: 'wait' })`). 단언이 실패해도 보류한 요청·처리기가 남지 않도록 finally에서 부른다.
 */
async function holdResponse(page: Page, asset: string | RegExp) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => { markRequested = resolve; });
  await page.route(asset, async (route) => {
    markRequested();
    await gate;
    await route.continue();
  });
  return {
    /** 보류할 요청이 처음 들어오면 끝난다. */
    requested,
    release,
    async dispose() {
      release();
      // 페이지가 이미 닫혔으면(시간 초과 뒤 정리) 기다릴 처리기가 없다.
      if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' });
    },
  };
}

/** 브라우저 requestAnimationFrame을 count번 기다린다(벽시계 대기 대신 화면 프레임 수로 기다린다). */
async function waitAnimationFrames(page: Page, count: number) {
  await page.evaluate((frames) => new Promise<void>((resolve) => {
    let left = frames;
    const step = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), count);
}

/** 90초 무음 곡(노트 1개, 50초)을 `gearMotion` 켬으로 플레이 화면에 띄운다. 곡 시작은 기다리지 않는다(캔버스는 로딩 중에도 있다). */
async function startLocalPlay(page: Page) {
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await installProbe(page);
  await page.evaluate(async () => {
    const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const state = useGameStore.getState();
    state.updateSettings({ isFirstLaunch: false, renderHeight: 720, masterVolume: 0, gearMotion: true });
    const document: import('../../src/shared/types/chart').ChartDocument = {
      meta: { title: 'Pause check', artist: 'Local', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: [{ type: 'point', kind: 'single', lane: 1, beat: { n: 100, d: 1 } }],
      trillZones: [],
      events: [{ type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 }, { type: 'timeSignature', beat: { n: 0, d: 1 }, beatPerMeasure: { n: 4, d: 1 } }],
    };
    const audioBuffer = new AudioBuffer({ length: 44100 * 90, sampleRate: 44100, numberOfChannels: 1 });
    const fixturePath = '/e2e/normalPlayFixture.ts';
    const { startNormalFixture } = await import(fixturePath) as typeof import('../normalPlayFixture');
    startNormalFixture(document, audioBuffer);
  });
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 30_000 });
}

/** 로딩 중 Esc: 누른 뒤 화면 프레임 10개가 지나도(React가 메뉴를 그렸다면 이미 보일 때) 일시정지 메뉴가 없다. */
async function pressEscapeAndExpectNoPauseMenu(page: Page) {
  await page.keyboard.press('Escape');
  await waitAnimationFrames(page, 10);
  await expect(page.getByRole('heading', { name: 'Paused', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toHaveCount(0);
}

/** 일시정지 없이 재생 중: 일시정지 메뉴가 없고, 음원이 재생 중이며, 게임 루프가 renderFrame을 계속 부른다. */
async function expectPlayingWithoutPause(page: Page) {
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toHaveCount(0);
  const before = await readProbe(page);
  expect(before.audioPlaying).toBe(true);
  await waitAnimationFrames(page, 10);
  expect((await readProbe(page)).frames).toBeGreaterThan(before.frames);
}

/** 재생 중 Esc: 일시정지 메뉴(Resume)를 띄우고 음원과 renderFrame을 함께 멈춘다. */
async function expectEscapePauses(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  const paused = await readProbe(page);
  expect(paused.audioPlaying).toBe(false);
  await waitAnimationFrames(page, 10);
  expect((await readProbe(page)).frames).toBe(paused.frames);
}

test.describe('플레이 화면 일시정지(Esc)는 곡이 시작된 뒤에만 받는다(#276)', () => {
  test.describe.configure({ timeout: 90_000 });

  // 두 보류는 로딩의 앞뒤 단계다. gear-motion.json은 AudioEngine을 audioEngineRef에 넣기 전(스킨·`gearMotion`·L₀ 준비를 함께 기다리는 동안),
  // 비행 배경 이미지는 넣은 뒤(renderer.init이 배경을 기다리는 동안)다. 둘 다 audioEngine.play 전이라, 뒤쪽 보류는 Esc를 받는 기준이
  // audioEngineRef가 아니라 곡 시작인지 확인한다.
  for (const [step, asset] of [
    ['gearMotion 에셋(gear-motion.json)', '**/gear/gear-motion/gear-motion.json'],
    ['비행 배경 이미지(ground.png)', /\/approach\/ground\.png(?:\?|$)/],
  ] as const) {
    test(`로딩 중 ${step} 응답을 보류한 동안 Esc를 누르면 일시정지 메뉴가 뜨지 않고, 응답을 보내면 곡이 일시정지 없이 시작되며(play 1번), 시작 뒤 Esc는 일시정지 메뉴를 띄우고 음원·renderFrame을 멈춘다`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const held = await holdResponse(page, asset);
      try {
        await startLocalPlay(page);
        await held.requested;

        await pressEscapeAndExpectNoPauseMenu(page);
        // Esc를 누른 동안은 아직 곡 시작 전이다.
        expect(await readProbe(page)).toMatchObject({ frames: 0, audioPlays: 0 });

        held.release();
        await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
        expect((await readProbe(page)).audioPlays).toBe(1);
        await expectPlayingWithoutPause(page);

        await expectEscapePauses(page);
        expect(errors).toEqual([]);
      } finally {
        await held.dispose();
      }
    });
  }

  test('일시정지 메뉴 Retry로 다시 불러오는 동안(L₀ 준비 보류) Esc를 누르면 일시정지 메뉴가 뜨지 않고, 준비가 끝나면 곡이 일시정지 없이 다시 시작되며(play 2번째), 시작 뒤 Esc는 다시 일시정지 메뉴를 띄운다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await startLocalPlay(page);
      await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
      await expectEscapePauses(page);

      // Retry는 keep-alive한 `gearMotion` 에셋을 다시 요청하지 않으므로, 새 AudioEngine의 L₀ 준비를 보류해 로딩이 끝나지 않게 한다.
      await holdNextOutputLatencyPreparation(page);
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect.poll(async () => (await readProbe(page)).heldOutputLatencyPreparations, { timeout: 30_000 }).toBe(1);

      await pressEscapeAndExpectNoPauseMenu(page);
      const loading = await readProbe(page);
      // Esc를 누른 동안은 아직 Retry 곡 시작 전이다.
      expect(loading.audioPlays).toBe(1);

      await releaseOutputLatencyPreparation(page);
      await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(loading.frames + 10);
      expect((await readProbe(page)).audioPlays).toBe(2);
      await expectPlayingWithoutPause(page);

      await expectEscapePauses(page);
      expect(errors).toEqual([]);
    } finally {
      await releaseOutputLatencyPreparation(page);
    }
  });
});
