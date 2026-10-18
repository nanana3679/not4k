import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/**
 * 곡 시작 전 준비(GameRenderer.prepareForPlayback, #239)의 회귀 가드. 실제 PlayScreen이 만든 렌더러의 Pixi 텍스처 시스템에서
 * `_initSource`(소스를 처음 GPU 업로드하거나, 자동 GC로 해제된 소스를 다시 GPU 업로드하는 곳)를 감싸, 스킨·기어 이미지의 GPU 업로드가
 * 준비 단계와 재생 중 어느 쪽에서 일어났는지 센다. 재생 중 모든 프레임에서 SkinManager가 불러온 소스의 `autoGarbageCollect`도 확인한다.
 */
interface PreuploadProbe {
  /** prepareForPlayback이 불린 횟수. */
  prepared: number;
  /** prepareForPlayback 안에서 일어난 스킨·기어 이미지 GPU 업로드 수. */
  preparedUploads: number;
  /** prepareForPlayback이 끝난 뒤(재생 중)에 일어난 스킨·기어 이미지 GPU 업로드의 경로. */
  playUploads: string[];
  /** 재생 중 renderFrame마다 센, `autoGarbageCollect`가 true인 스킨 소스 수의 최댓값. */
  gcEnabledMax: number;
  /** 재생 중 확인한 renderFrame 수. */
  checkedFrames: number;
}

async function installProbe(page: Page) {
  await page.evaluate(async () => {
    type Source = import('pixi.js').TextureSource;
    const win = window as unknown as Record<string, unknown>;
    const probe: PreuploadProbe = { prepared: 0, preparedUploads: 0, playUploads: [], gcEnabledMax: 0, checkedFrames: 0 };
    const sources: Source[] = [];
    const before: boolean[] = [];
    win.__preuploadProbe = probe;
    win.__preuploadSources = sources;
    win.__preuploadBefore = before;
    let phase: 'idle' | 'prepare' | 'play' = 'idle';

    const rendererPath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
    type Internals = {
      app: { renderer: { texture: { _initSource(source: Source): unknown } } };
      skinManager: import('../../src/game/skin/SkinManager').SkinManager;
    };

    const prepare = GameRenderer.prototype.prepareForPlayback;
    GameRenderer.prototype.prepareForPlayback = function (...args) {
      const self = this as unknown as Internals;
      const system = self.app.renderer.texture;
      const initSource = system._initSource;
      system._initSource = function (source: Source) {
        if (/\/(skins|gear)\//.test(source.label ?? '')) {
          if (phase === 'prepare') probe.preparedUploads += 1;
          else if (phase === 'play') probe.playUploads.push(new URL(source.label, location.href).pathname);
        }
        return initSource.call(this, source);
      };
      for (const texture of self.skinManager.getLoadedTextures().values()) {
        sources.push(texture.source);
        before.push(texture.source.autoGarbageCollect);
      }
      phase = 'prepare';
      try { return prepare.apply(this, args); } finally {
        phase = 'play';
        probe.prepared += 1;
      }
    };

    const renderFrame = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (...args) {
      if (phase === 'play') {
        probe.checkedFrames += 1;
        probe.gcEnabledMax = Math.max(probe.gcEnabledMax, sources.filter(source => source.autoGarbageCollect).length);
      }
      return renderFrame.apply(this, args);
    };
  });
}

async function readProbe(page: Page) {
  return page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    const probe = win.__preuploadProbe as PreuploadProbe;
    const sources = win.__preuploadSources as import('pixi.js').TextureSource[];
    const before = win.__preuploadBefore as boolean[];
    return {
      ...probe,
      playUploads: [...probe.playUploads],
      sourceCount: sources.length,
      gcEnabledBefore: before.filter(Boolean).length,
      /** 지금 `autoGarbageCollect`가 준비 전 값과 다른 소스 수. */
      differentFromBefore: sources.filter((source, index) => source.autoGarbageCollect !== before[index]).length,
    };
  });
}

async function readScreen(page: Page) {
  return page.evaluate(async () => {
    const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    return useGameStore.getState().screen;
  });
}

/** 120 BPM(1박 = 500ms). 0~5박은 자동 재생(키봄·켜짐 바디), 6박부터는 입력이 없어 MISS(실패 노트)가 된다. 음원은 5초. */
async function startPlay(page: Page) {
  await page.evaluate(async () => {
    const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const b = (n: number, d = 1) => ({ n, d });
    const state = useGameStore.getState();
    state.updateSettings({ isFirstLaunch: false, debugMode: false, renderHeight: 720, masterVolume: 0, gearMotion: true });
    state.setChartData({
      meta: { title: 'Texture preupload check', artist: 'Local', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: [
        { type: 'single', lane: 1, beat: b(2) },
        { type: 'double', lane: 2, beat: b(5, 2) },
        { type: 'long', lane: 3, beat: b(3), endBeat: b(4) },
        { type: 'doubleLong', lane: 4, beat: b(7, 2), endBeat: b(9, 2) },
        { type: 'single', lane: 1, beat: b(4), grace: true },
        { type: 'single', lane: 2, beat: b(6) },
        { type: 'double', lane: 3, beat: b(13, 2) },
        { type: 'long', lane: 4, beat: b(7), endBeat: b(15, 2) },
      ],
      trillZones: [],
      events: [
        { type: 'bpm', beat: b(0), bpm: 120 },
        { type: 'timeSignature', beat: b(0), beatPerMeasure: b(4) },
        { type: 'auto', beat: b(0), endBeat: b(5) },
      ],
    });
    state.setAudioBuffer(new AudioBuffer({ length: 44100 * 5, sampleRate: 44100, numberOfChannels: 1 }));
    useGameStore.setState({ screen: 'play', lastResult: null, startTimeMs: 0, editorReturnUrl: null });
  });
}

test.describe('곡 시작 전 텍스처 GPU 업로드 (#239)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('5초 곡(자동 재생 키봄·켜짐 바디, 6박부터 MISS)을 재생하는 동안 스킨·기어 이미지 GPU 업로드는 0번이고 스킨 소스는 모든 프레임에서 autoGarbageCollect false, 결과 화면으로 나가면 준비 전 값으로 돌아간다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/game');
    await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await installProbe(page);
    await startPlay(page);
    await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 30_000 });
    await page.mouse.click(20, 20);

    // 곡이 끝나 결과 화면으로 넘어갈 때까지 재생 중 GPU 업로드와 autoGarbageCollect를 지켜본다.
    await expect.poll(() => readScreen(page), { timeout: 60_000 }).toBe('result');
    const probe = await readProbe(page);
    expect(probe.prepared).toBe(1);
    // 감싸기가 실제로 동작하는지: 준비 단계에서 스킨·기어 이미지(키봄 16장 포함)를 GPU 업로드했다.
    expect(probe.preparedUploads).toBeGreaterThan(20);
    expect(probe.playUploads).toEqual([]);
    expect(probe.checkedFrames).toBeGreaterThan(0);
    expect(probe.gcEnabledMax).toBe(0);

    // 플레이 화면을 나가면 렌더러 dispose가 준비 전 값(불러온 이미지는 true)으로 되돌린다.
    expect(probe.sourceCount).toBeGreaterThan(20);
    expect(probe.gcEnabledBefore).toBeGreaterThan(0);
    await expect.poll(async () => (await readProbe(page)).differentFromBefore, { timeout: 10_000 }).toBe(0);
    expect(errors).toEqual([]);
  });
});
