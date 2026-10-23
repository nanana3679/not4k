import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

type Renderer = import('../../src/game/renderer/GameRenderer').GameRenderer;

/**
 * 실제 PlayScreen이 만든 GameRenderer를 renderFrame 관찰로 잡는다. renderFrame이 끝날 때마다 그 프레임에 그린
 * 기어 버튼 상태(레인 1~4를 쉼표로, 대기는 idle, 그 밖에는 단계-색 pressed-single·releasing-double 등)와 그 프레임의 곡 시각(renderFrame의 첫 인자, ms)을 기록한다.
 *
 * 렌더러에 넘기는 deltaMs만 16ms 이하로 묶는다(곡 시각과 판정은 그대로). 뗌 곡선은 deltaMs만큼 나아가 150ms에 끝나는데, 부하가 걸린
 * swiftshader에서는 프레임 간격이 150~350ms까지 벌어져 뗀 뒤 첫 프레임에 곡선이 끝나고 releasing 프레임이 남지 않는다.
 * 곡선이 나아가는 양을 벽시계 대신 그린 프레임 수로 정해 releasing을 거치는지 부하와 상관없이 확인한다.
 */
async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const win = window as unknown as Record<string, unknown>;
    if (win.__gearButtonRenderer !== undefined) return;
    win.__gearButtonRenderer = null;
    win.__gearButtonLog = [];
    win.__gearButtonTimes = [];
    const rendererPath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
    const renderFrame = GameRenderer.prototype.renderFrame;
    const maxFrameDeltaMs = 16;
    GameRenderer.prototype.renderFrame = function (songTimeMs, deltaMs = maxFrameDeltaMs) {
      const result = renderFrame.call(this, songTimeMs, Math.min(deltaMs, maxFrameDeltaMs));
      win.__gearButtonRenderer = this;
      (win.__gearButtonLog as (string | null)[]).push(this.gearButtonStates?.map(state => (state.phase === 'idle' ? 'idle' : `${state.phase}-${state.color}`)).join(',') ?? null);
      (win.__gearButtonTimes as number[]).push(songTimeMs);
      return result;
    };
  });
}

async function readProbe(page: Page) {
  return page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    const renderer = win.__gearButtonRenderer as Renderer | null;
    const log = win.__gearButtonLog as (string | null)[];
    return {
      frames: log.length,
      log: [...log],
      times: [...(win.__gearButtonTimes as number[])],
      states: renderer?.gearButtonStates?.map(state => ({ phase: state.phase, color: state.color, releaseMs: state.releaseMs })) ?? null,
    };
  });
}

/** 누름과 프레임 경계를 같은 브라우저 작업에서 잡아 다음 renderFrame이 첫 입력 프레임인지 확인한다. */
async function pressBeforeNextFrame(page: Page, code: string) {
  return page.evaluate(code => {
    const win = window as unknown as Record<string, unknown>;
    const frame = (win.__gearButtonLog as (string | null)[]).length;
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    return frame;
  }, code);
}

/** 브라우저 requestAnimationFrame을 count번 기다린다(벽시계 대기 대신 화면 프레임 수로 기다린다). */
async function waitAnimationFrames(page: Page, count: number) {
  await page.evaluate((frames) => new Promise<void>((resolve) => {
    let left = frames;
    const step = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), count);
}

/**
 * 기어 그림 좌표(원본 px) 둘레 다섯 점(±1 논리 px)의 화면 RGB 평균. 살아 있는 렌더러의 기어 배치(gearLayout)로 논리 좌표를 구하고,
 * 게임 캔버스 스크린샷에서 그 점을 읽는다.
 */
async function gearColor(page: Page, point: { x: number; y: number }): Promise<number[]> {
  const canvas = page.getByTestId('gameplay-canvas');
  const shot = (await canvas.screenshot()).toString('base64');
  return page.evaluate(async ({ shot, point }) => {
    const win = window as unknown as Record<string, unknown>;
    const renderer = win.__gearButtonRenderer as Renderer;
    const layout = renderer.gearLayout!;
    const logicalWidth = (renderer as unknown as { width: number }).width;
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const perLogical = image.naturalWidth / logicalWidth;
    const centerX = layout.x + point.x * layout.scale;
    const centerY = layout.y + point.y * layout.scale;
    const offsets = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    const sum = [0, 0, 0];
    for (const [dx, dy] of offsets) {
      const data = context.getImageData(Math.round((centerX + dx) * perLogical), Math.round((centerY + dy) * perLogical), 1, 1).data;
      for (let channel = 0; channel < 3; channel++) sum[channel] += data[channel];
    }
    return sum.map(value => value / offsets.length);
  }, { shot, point });
}

interface PlayChart {
  notes: unknown[];
  events: unknown[];
}

async function startLocalPlay(page: Page, chart: PlayChart) {
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await installProbe(page);
  await page.evaluate(async (chart) => {
    const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const state = useGameStore.getState();
    // 기본 TKL 바인딩: 레인 2는 KeyE·KeyD·KeyC·KeyO. 기어 버튼 픽셀이 시간에 따라 바뀌지 않게 gearMotion은 끈다.
    state.updateSettings({ isFirstLaunch: false, renderHeight: 720, masterVolume: 0, gearMotion: false });
    state.setChartData({
      meta: { title: 'Gear button check', artist: 'Local', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: chart.notes as never,
      trillZones: [],
      events: chart.events as never,
    });
    state.setAudioBuffer(new AudioBuffer({ length: 44100 * 90, sampleRate: 44100, numberOfChannels: 1 }));
    useGameStore.setState({ screen: 'play', startTimeMs: 0, editorReturnUrl: null });
  }, chart);
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await readProbe(page)).frames, { timeout: 30_000 }).toBeGreaterThan(10);
}

const BPM_EVENTS = [
  { type: 'bpm', beat: { n: 0, d: 1 }, bpm: 120 },
  { type: 'timeSignature', beat: { n: 0, d: 1 }, beatPerMeasure: { n: 4, d: 1 } },
];
/** 노트가 50초 뒤에 하나뿐인 차트(입력해도 판정할 노트가 없다). */
const QUIET_CHART: PlayChart = { notes: [{ type: 'single', lane: 1, beat: { n: 100, d: 1 } }], events: BPM_EVENTS };
// 2번 키 앞면(원본 437, 1250): 대기는 어두운 금속, 15px 눌리면 연파랑(싱글)으로 빛나는 곳이다.
const KEY_TWO_FACE = { x: 437, y: 1250 };
const blueOverRed = ([red, , blue]: number[]) => blue - red;
const maxDifference = (a: number[], b: number[]) => Math.max(...a.map((value, channel) => Math.abs(value - b[channel])));

test.describe('실제 플레이의 기어 버튼 누름', () => {
  test.describe.configure({ timeout: 90_000 });

  test('레인 2 KeyD를 누르면 누른 뒤 첫 렌더 프레임부터 기어 2번 버튼이 pressed·싱글이고 키 앞면이 연파랑으로 빛나며, 떼면 releasing을 거쳐 대기(idle)로 돌아와 기어 그림 색이 된다', async ({ page }) => {
    const errors: string[] = [];
    const requested: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await startLocalPlay(page, QUIET_CHART);
    // 기어 버튼 아틀라스는 기어 그림·빈 유리처럼 스킨과 함께 받는 스킨 공통 에셋이다.
    expect(requested).toContain('/gear/gear-buttons.png');
    expect((await readProbe(page)).states?.map(state => state.phase)).toEqual(['idle', 'idle', 'idle', 'idle']);
    const idleFace = await gearColor(page, KEY_TWO_FACE);
    expect(Math.max(...idleFace)).toBeLessThan(90);

    const atPress = await pressBeforeNextFrame(page, 'KeyD');
    // 세션이 큐를 모두 처리한 뒤 그린 첫 프레임부터 맞는 색이다.
    await waitAnimationFrames(page, 3);
    const afterPress = await readProbe(page);
    expect(afterPress.states?.[1]).toEqual({ phase: 'pressed', color: 'single', releaseMs: 0 });
    expect(afterPress.log[atPress]).toBe('idle,pressed-single,idle,idle');
    await expect.poll(async () => blueOverRed(await gearColor(page, KEY_TWO_FACE)), { timeout: 30_000 }).toBeGreaterThan(80);

    const beforeRelease = await readProbe(page);
    await page.keyboard.up('KeyD');
    await expect.poll(async () => (await readProbe(page)).states?.[1].phase, { timeout: 10_000 }).toBe('idle');
    const released = (await readProbe(page)).log.slice(beforeRelease.frames);
    expect(released).toContain('idle,releasing-single,idle,idle');
    expect(released.at(-1)).toBe('idle,idle,idle,idle');
    await expect.poll(async () => maxDifference(await gearColor(page, KEY_TWO_FACE), idleFace), { timeout: 30_000 }).toBeLessThan(12);
    expect(errors).toEqual([]);
  });

  test('레인 2 KeyD를 누른 채 같은 레인 KeyO를 누르면(노트를 치지 않은 공입력, 키 2개) 그 뒤 첫 렌더 프레임부터 2번 버튼이 pressed-double이고 키 앞면이 금색이며, KeyO를 떼도 마지막 누름의 금색을 유지한다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await startLocalPlay(page, QUIET_CHART);
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await readProbe(page)).states?.[1].color).toBe('single');
    const atSecond = await pressBeforeNextFrame(page, 'KeyO');
    await waitAnimationFrames(page, 3);
    const afterSecond = await readProbe(page);
    expect(afterSecond.states?.[1]).toEqual({ phase: 'pressed', color: 'double', releaseMs: 0 });
    expect(afterSecond.log[atSecond]).toBe('idle,pressed-double,idle,idle');
    await expect.poll(async () => { const [red, , blue] = await gearColor(page, KEY_TWO_FACE); return red - blue; }, { timeout: 30_000 }).toBeGreaterThan(80);
    await page.keyboard.up('KeyO');
    await waitAnimationFrames(page, 2);
    expect((await readProbe(page)).states?.[1]).toMatchObject({ phase: 'pressed', color: 'double' });
    await page.keyboard.up('KeyD');
    await expect.poll(async () => (await readProbe(page)).states?.[1].phase, { timeout: 10_000 }).toBe('idle');
    expect(errors).toEqual([]);
  });

  test('KeyD를 누른 채 일시정지(Esc)하고 떼면 기어 2번 버튼은 pressed로 멈춰 있고, Resume 뒤 큐의 up을 처리한 첫 프레임부터 돌아와 대기가 된다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await startLocalPlay(page, QUIET_CHART);
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await readProbe(page)).states?.[1].phase).toBe('pressed');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    await page.keyboard.up('KeyD');
    const paused = await readProbe(page);
    expect(paused.states?.[1]).toEqual({ phase: 'pressed', color: 'single', releaseMs: 0 });
    await waitAnimationFrames(page, 30);
    const stillPaused = await readProbe(page);
    expect(stillPaused.frames).toBe(paused.frames);
    expect(stillPaused.states?.[1]).toEqual({ phase: 'pressed', color: 'single', releaseMs: 0 });

    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect.poll(async () => (await readProbe(page)).states?.[1].phase, { timeout: 10_000 }).toBe('idle');
    expect((await readProbe(page)).log[paused.frames]).toBe('idle,releasing-single,idle,idle');
    expect(errors).toEqual([]);
  });

  test('AutoPlayer가 친 노트는 노트 종류로 색이 정해져 첫 렌더 프레임부터 맞다: 레인 1 싱글(1.5초)은 연파랑, 레인 2 더블(2초)은 금색, 레인 3 롱노트(2.5~4.5초) 중 3.5초 싱글 노트는 키 2개를 누르고 있어도 연파랑이다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await startLocalPlay(page, {
      notes: [
        { type: 'single', lane: 1, beat: { n: 3, d: 1 } },
        { type: 'double', lane: 2, beat: { n: 4, d: 1 } },
        { type: 'long', lane: 3, beat: { n: 5, d: 1 }, endBeat: { n: 9, d: 1 } },
        { type: 'single', lane: 3, beat: { n: 7, d: 1 } },
      ],
      events: [...BPM_EVENTS, { type: 'auto', beat: { n: 0, d: 1 }, endBeat: { n: 12, d: 1 } }],
    });
    // 4.5초(롱노트 끝) 뒤 150ms가 지나면 모두 대기다.
    await expect.poll(async () => {
      const { log, times } = await readProbe(page);
      return log.some(entry => entry?.split(',')[2] !== 'idle') && times.at(-1)! > 4800 && log.at(-1) === 'idle,idle,idle,idle';
    }, { timeout: 30_000 }).toBe(true);
    const { log, times } = await readProbe(page);
    const lane = (index: number) => log.map((entry, frame) => ({ state: entry?.split(',')[index], timeMs: times[frame] }));
    const shown = (index: number) => lane(index).filter(frame => frame.state !== 'idle').map(frame => frame.state);
    // 각 레인에서 버튼이 보인 모든 렌더 프레임의 색. 소비된 노트의 색으로 바로 누르므로 레인 3의 키가 2개여도 금색 프레임은 없다.
    expect(shown(0).length).toBeGreaterThan(0);
    expect(shown(0).every(state => state!.endsWith('-single'))).toBe(true);
    expect(shown(1).length).toBeGreaterThan(0);
    expect(shown(1).every(state => state!.endsWith('-double'))).toBe(true);
    expect(shown(2).every(state => state!.endsWith('-single'))).toBe(true);
    // 렌더 프레임 수는 환경마다 다르므로 곡 시각으로 본다. 그리는 시각(시각 시간)과 합성 입력 시각 사이 차이를 150ms 띄워 둔다.
    // 롱노트를 누르는 동안(2.65~4.35초, 3.5초 싱글 노트 포함)에는 모든 렌더 프레임에서 연파랑으로 눌려 있다.
    const holding = lane(2).filter(frame => frame.timeMs > 2650 && frame.timeMs < 4350);
    expect(holding.length).toBeGreaterThan(0);
    expect(holding.every(frame => frame.state === 'pressed-single')).toBe(true);
    // 레인 4에는 노트가 없으므로 늘 대기다.
    expect(lane(3).every(frame => frame.state === 'idle')).toBe(true);
    expect(errors).toEqual([]);
  });
});
