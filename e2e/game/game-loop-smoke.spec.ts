import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

// 게임 루프 스모크(#151). 다른 게임 스펙이 덮지 않은 연결만 거칠게 확인한다: 곡 도중 일시정지한 뒤 Resume·Retry를 거쳐도
// 게임 루프가 곡 끝까지 판정을 이어 결과 화면에 도달하는지, 결과 화면의 항목과 Back으로 곡 선택에 돌아가는지.
// `AutoEvent` 완주와 결과(note-judgment.spec.ts), 실제 키 입력 판정(manual-note-judgment.spec.ts), 곡 끝 전까지 보는
// 일시정지·Resume·Retry(flight-background.spec.ts·gear-motion.spec.ts)는 각 스펙이 맡는다.
// Esc는 콤보가 1이 된 렌더 프레임 안에서 브라우저가 보낸다. 테스트 러너를 왕복해 누르면 부하가 클 때 Esc가 뒤 노트보다 늦게 도착할 수 있다.
// swiftshader의 렌더 프레임 지터에 흔들릴 수 있는 점수 값은 보지 않고 결과 도달·항목 표시·판정 수·콤보·곡 시간·재생 시작 위치만 본다.

/** 차트의 single 노트 수. single 노트는 노트마다 판정이 1개라 한 번 완주한 결과의 판정 수 합이 이 값이다. */
const SINGLE_NOTE_COUNT = 4;
/** 일시정지 메뉴를 띄워 둔 채 기다리는 벽시계 시간(ms). 일시정지 중에도 곡 시간이 흐르는 회귀라면 Resume 뒤 곡 시간이 이만큼 건너뛰어 아래 상한을 넘는다. */
const PAUSE_HOLD_MS = 2000;
/**
 * Resume 뒤 첫 렌더 프레임까지 곡 시간이 멈춘 곳에서 나아가도 되는 상한(ms). 곡 시간은 Resume을 누른 순간부터 다시 흐르므로
 * 정상이면 그 뒤 첫 렌더 프레임까지(렌더 프레임 간격 하나, swiftshader 부하에서 수백 ms)만 나아간다.
 */
const RESUME_SONG_TIME_ADVANCE_LIMIT_MS = 1000;

const GAME_STORE_PATH = '/src/game/stores/gameStore.ts';
const GAME_RENDERER_PATH = '/src/game/renderer/GameRenderer.ts';
const AUDIO_ENGINE_PATH = '/src/game/audio/AudioEngine.ts';

// index.html이 불러오는 외부 글꼴. 테스트에서는 기록 없이 중단해 대체 글꼴로 그린다.
const GOOGLE_FONTS_ORIGINS = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);

/**
 * page.route까지 오는 페이지 요청을 모두 가로채, 연결된 Supabase 프로젝트나 자격 증명과 무관하게 같은 화면을 보게 한다.
 * - 경로가 `/rest/v1/`·`/storage/v1/`·`/auth/v1/`로 시작하는 요청(origin 무관): `GET /rest/v1/songs`는 빈 곡 목록으로 응답한다
 *   (결과 화면의 Back으로 연 곡 선택 화면이 부른다). 그 밖의 요청은 500으로 응답하고 기록한다.
 *   OPTIONS 204 분기는 지금은 쓰이지 않는다. Playwright(1.58, Chromium)는 page.route로 가로채는 요청의 CORS preflight에 스스로 답해
 *   처리기에는 본 요청(여기서는 GET)만 온다. preflight 처리가 바뀌어 OPTIONS가 여기까지 와도 예상 밖 요청으로 기록되거나 곡 목록 요청이 막히지 않도록 남겨 둔다.
 * - 앱 origin의 GET은 그대로 통과시킨다.
 * - Google Fonts origin의 요청은 기록하지 않고 중단한다.
 * - 나머지(앱 origin의 GET이 아닌 요청, Supabase API 경로가 아닌 그 밖의 origin 요청)는 중단하고 기록한다.
 *   index.html의 CSP(connect-src·img-src 등)가 막는 origin의 요청은 브라우저가 보내기 전에 막혀 page.route에 오지 않으므로
 *   여기 기록되지 않는다(콘솔의 CSP 위반 오류로만 남는다).
 * 기록은 `${method} ${origin}${pathname}` 형식으로 돌려주는 배열에 쌓이며, 중단한 요청에는 ` (aborted)`를 붙인다.
 */
async function guardOfflineRequests(page: Page, appOrigin: string): Promise<string[]> {
  const unexpectedRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const requestLabel = `${method} ${url.origin}${path}`;
    if (/^\/(rest|storage|auth)\/v1\//.test(path)) {
      if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
      if (method === 'GET' && path === '/rest/v1/songs') { await route.fulfill({ json: [] }); return; }
      unexpectedRequests.push(requestLabel);
      await route.fulfill({ status: 500, json: { error: 'Unexpected offline test request' } });
      return;
    }
    if (url.origin === appOrigin && method === 'GET') { await route.continue(); return; }
    if (!GOOGLE_FONTS_ORIGINS.has(url.origin)) unexpectedRequests.push(`${requestLabel} (aborted)`);
    await route.abort();
  });
  return unexpectedRequests;
}

/**
 * 앱이 실제로 불러온 소스 모듈 URL. Vite는 HMR 뒤 같은 소스에 `?t=`를 붙일 수 있어, 다른 URL로 import하면 다른 모듈(다른 class·store)을 받는다.
 * resource timing 항목이 없으면(버퍼가 찬 경우 등) 경로를 그대로 쓴다.
 */
async function appModuleUrl(page: Page, path: string): Promise<string> {
  return page.evaluate((modulePath) => performance.getEntriesByType('resource').map(entry => entry.name)
    .find(url => new URL(url).pathname === modulePath) ?? modulePath, path);
}

interface GameLoopProbe {
  /** 렌더러별(처음 관찰한 순서) 렌더 프레임마다 그린 곡 시간(ms, renderFrame의 songTimeMs). 플레이 화면은 초기화(첫 재생·Retry)마다 새 렌더러를 만든다. */
  songTimesByRenderer: number[][];
  /** 렌더러별 화면 콤보(updateCombo)의 최댓값. Miss는 콤보를 0으로 표시하므로(updateCombo(0)) 그 재생에서 Miss가 아닌 판정이 나오면 1 이상이다. */
  maxComboByRenderer: number[];
  /**
   * AudioEngine별(처음 play한 순서) play(offsetMs)로 받은 재생 시작 위치(ms). 플레이 화면은 초기화(첫 재생·Retry)마다 새 AudioEngine을 만들고,
   * Resume은 같은 AudioEngine이 멈춘 위치에서 play로 다시 재생한다.
   */
  playOffsetsByEngine: number[][];
}

/**
 * 실제 PlayScreen이 만든 GameRenderer·AudioEngine을 renderFrame·updateCombo·play 관찰로 잡는다(그리기·판정·재생은 바꾸지 않는다).
 * warm-up(`prepareForPlayback`)의 첫 프레임도 renderFrame이라 렌더러 번호는 곡 재생 전에 생긴다.
 * escapeAtFirstComboOfRenderer번째 렌더러가 콤보 1 이상을 처음 표시하면 그 렌더 프레임 안에서 플레이 화면의 keydown 처리기에 Esc를 한 번 보낸다.
 */
async function installProbe(page: Page, { escapeAtFirstComboOfRenderer }: { escapeAtFirstComboOfRenderer: number }) {
  const [rendererUrl, audioEngineUrl] = await Promise.all([appModuleUrl(page, GAME_RENDERER_PATH), appModuleUrl(page, AUDIO_ENGINE_PATH)]);
  await page.evaluate(async ({ rendererUrl, audioEngineUrl, escapeRenderer }) => {
    const probe: GameLoopProbe = { songTimesByRenderer: [], maxComboByRenderer: [], playOffsetsByEngine: [] };
    (window as unknown as { __gameLoopProbe: GameLoopProbe }).__gameLoopProbe = probe;
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererUrl);
    const { AudioEngine }: typeof import('../../src/game/audio/AudioEngine') = await import(audioEngineUrl);

    const indexByRenderer = new WeakMap<object, number>();
    const rendererIndexOf = (renderer: object) => {
      let index = indexByRenderer.get(renderer);
      if (index === undefined) {
        index = probe.songTimesByRenderer.length;
        indexByRenderer.set(renderer, index);
        probe.songTimesByRenderer.push([]);
        probe.maxComboByRenderer.push(0);
      }
      return index;
    };
    const renderFrame = GameRenderer.prototype.renderFrame;
    GameRenderer.prototype.renderFrame = function (songTimeMs, deltaMs) {
      probe.songTimesByRenderer[rendererIndexOf(this)].push(songTimeMs);
      return renderFrame.call(this, songTimeMs, deltaMs);
    };
    let escapeSent = false;
    const updateCombo = GameRenderer.prototype.updateCombo;
    GameRenderer.prototype.updateCombo = function (combo) {
      const index = rendererIndexOf(this);
      probe.maxComboByRenderer[index] = Math.max(probe.maxComboByRenderer[index], combo);
      updateCombo.call(this, combo);
      // 콤보 1을 표시하는 렌더 프레임 안에서 플레이 화면이 듣는 window keydown으로 Esc를 보낸다. 테스트 러너를 왕복하지 않아 부하가 커도 뒤 노트보다 먼저 일시정지한다.
      if (index === escapeRenderer && combo >= 1 && !escapeSent) {
        escapeSent = true;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      }
    };

    const indexByEngine = new WeakMap<object, number>();
    const play = AudioEngine.prototype.play;
    AudioEngine.prototype.play = function (offsetMs) {
      let index = indexByEngine.get(this);
      if (index === undefined) {
        index = probe.playOffsetsByEngine.length;
        indexByEngine.set(this, index);
        probe.playOffsetsByEngine.push([]);
      }
      probe.playOffsetsByEngine[index].push(offsetMs ?? 0);
      return play.call(this, offsetMs);
    };
  }, { rendererUrl, audioEngineUrl, escapeRenderer: escapeAtFirstComboOfRenderer });
}

async function readProbe(page: Page): Promise<GameLoopProbe> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __gameLoopProbe: GameLoopProbe }).__gameLoopProbe;
    return {
      songTimesByRenderer: probe.songTimesByRenderer.map(times => [...times]),
      maxComboByRenderer: [...probe.maxComboByRenderer],
      playOffsetsByEngine: probe.playOffsetsByEngine.map(offsets => [...offsets]),
    };
  });
}

async function readGameState(page: Page) {
  const storeUrl = await appModuleUrl(page, GAME_STORE_PATH);
  return page.evaluate(async (url) => {
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(url);
    const { screen, lastResult } = useGameStore.getState();
    return { screen, lastResult };
  }, storeUrl);
}

/**
 * renderer번째(만든 순서, 0부터) 렌더러가 콤보 1 이상을 표시할 때까지 화면 프레임마다 확인한다. Miss는 콤보를 0으로 표시하므로
 * 그 재생에서 Miss가 아닌 첫 판정을 기다리는 것이다. 곡 로딩을 포함해 30초까지 기다린다.
 */
async function waitForFirstCombo(page: Page, { renderer }: { renderer: number }) {
  await page.waitForFunction(
    (index) => ((window as unknown as { __gameLoopProbe: GameLoopProbe }).__gameLoopProbe.maxComboByRenderer[index] ?? 0) >= 1,
    renderer,
    { polling: 'raf', timeout: 30_000 },
  );
}

/**
 * 120 BPM(1박 = 500ms)에서 single 노트 4개(1·3·3.5·4초, 레인 1~4)를 `AutoEvent`(0~5초)로 자동 재생하는 5초 무음 곡을 플레이 화면에 띄운다.
 * 첫 노트 뒤 2초를 비워, 콤보 1에서 보낸 Esc가 렌더 프레임이 아주 느려도 둘째 노트 전에 일시정지하게 한다.
 * 곡 선택·로딩 화면(Supabase)을 거치지 않고 게임 스토어에 차트·음원을 직접 넣는다. 곡 시작은 기다리지 않는다(캔버스는 로딩 중에도 있다).
 */
async function startAutoPlay(page: Page, { escapeAtFirstComboOfRenderer }: { escapeAtFirstComboOfRenderer: number }) {
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  // AudioContext를 시작할 수 있게 사용자 gesture를 먼저 준다.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await installProbe(page, { escapeAtFirstComboOfRenderer });
  const storeUrl = await appModuleUrl(page, GAME_STORE_PATH);
  await page.evaluate(async (url) => {
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(url);
    const b = (n: number, d = 1) => ({ n, d });
    const state = useGameStore.getState();
    state.updateSettings({ isFirstLaunch: false, debugMode: false, renderHeight: 720, masterVolume: 0 });
    state.setChartData({
      meta: { title: 'Game loop smoke', artist: 'Local', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: [
        { type: 'single', lane: 1, beat: b(2) },
        { type: 'single', lane: 2, beat: b(6) },
        { type: 'single', lane: 3, beat: b(7) },
        { type: 'single', lane: 4, beat: b(8) },
      ],
      trillZones: [],
      events: [
        { type: 'bpm', beat: b(0), bpm: 120 },
        { type: 'timeSignature', beat: b(0), beatPerMeasure: b(4) },
        { type: 'auto', beat: b(0), endBeat: b(10) },
      ],
    });
    state.setAudioBuffer(new AudioBuffer({ length: 44100 * 5, sampleRate: 44100, numberOfChannels: 1 }));
    useGameStore.setState({ screen: 'play', lastResult: null, startTimeMs: 0, editorReturnUrl: null });
  }, storeUrl);
  await expect(page.getByTestId('gameplay-canvas')).toBeVisible({ timeout: 30_000 });
}

/**
 * 곡이 끝나 결과 화면이 될 때까지 기다리고, 저장된 결과(lastResult)의 달성률·랭크·Full Combo 값과 판정 분포·FAST/SLOW 행이
 * 화면에 보이는지 확인한다. 값이 맞는지는 보지 않는다. 저장된 결과를 돌려준다.
 */
async function expectResultScreen(page: Page) {
  await expect.poll(async () => (await readGameState(page)).screen, { timeout: 30_000 }).toBe('result');
  const { lastResult } = await readGameState(page);
  expect(lastResult).not.toBeNull();
  await expect(page.getByRole('heading', { name: 'Result', exact: true })).toBeVisible();
  await expect(page.getByText(`${lastResult!.achievementRate.toFixed(2)}%`, { exact: true })).toBeVisible();
  await expect(page.getByText(lastResult!.rank, { exact: true })).toBeVisible();
  await expect(page.getByText('Full Combo:', { exact: true })).toBeVisible();
  await expect(page.getByText(lastResult!.isFullCombo ? 'YES' : 'NO', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Judgments', exact: true })).toBeVisible();
  for (const label of ['PERFECT:', 'GREAT:', 'GOOD:', 'MISS:', 'GOOD◇:', 'FAST:', 'SLOW:']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Timing', exact: true })).toBeVisible();
  return lastResult!;
}

/** 결과의 등급별 판정 수(goodTrill·bad 포함) 합. */
function judgmentTotal(judgmentCounts: Record<string, number>): number {
  return Object.values(judgmentCounts).reduce((sum, count) => sum + count, 0);
}

test.describe('게임 루프 스모크(#151): 일시정지 뒤 Resume·Retry를 거쳐 곡 끝 결과 화면까지 pageerror·예상 밖 요청 없이 진행', () => {
  test.describe.configure({ timeout: 90_000 });

  let unexpectedRequests: string[] = [];
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page, baseURL }) => {
    pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    unexpectedRequests = await guardOfflineRequests(page, new URL(baseURL!).origin);
  });

  test.afterEach(() => {
    // 페이지를 닫지 않고 지금까지 기록된 요청과 예외를 확인한다. 여기서 닫으면 실패 때 Playwright가 남기는
    // error-context.md(페이지 스냅샷)가 만들어지지 않는다.
    expect(pageErrors).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
  });

  test('AutoEvent single 노트 4개(1·3·3.5·4초) 곡에서 콤보가 1이 된 렌더 프레임에 Esc로 일시정지하고 2초 뒤 Resume하면 곡 시간이 멈춘 곳에서 1초 안으로 이어져 남은 노트를 판정하고, 결과 화면에 달성률·랭크·Full Combo·판정 분포·FAST/SLOW를 표시한 뒤(판정 수 합 4) Back으로 곡 선택에 돌아간다', async ({ page }) => {
    await startAutoPlay(page, { escapeAtFirstComboOfRenderer: 0 });
    const resume = page.getByRole('button', { name: 'Resume', exact: true });
    await expect(resume).toBeVisible({ timeout: 30_000 });
    // 일시정지 메뉴를 띄운 채 벽시계로 기다린다. 곡 시간은 AudioContext 시계라 화면 프레임 수로 대신 기다릴 수 없다.
    await page.waitForTimeout(PAUSE_HOLD_MS);
    const paused = await readProbe(page);
    const framesBeforePause = paused.songTimesByRenderer[0].length;
    const songTimeAtPause = paused.songTimesByRenderer[0].at(-1)!;
    const comboAtPause = paused.maxComboByRenderer[0];
    expect(comboAtPause, 'Esc가 마지막 노트 뒤에 도착').toBeLessThan(SINGLE_NOTE_COUNT);

    await resume.click();
    const result = await expectResultScreen(page);
    const finished = await readProbe(page);
    // Resume은 플레이 화면을 다시 만들지 않고 같은 렌더러·AudioEngine으로 이어 간다.
    expect(finished.songTimesByRenderer).toHaveLength(1);
    expect(finished.playOffsetsByEngine).toHaveLength(1);
    // 일시정지 메뉴가 떠 있는 동안에는 renderFrame이 불리지 않으므로 framesBeforePause번째가 Resume 뒤 첫 렌더 프레임이다.
    // 그 곡 시간은 처음(0초)으로 돌아가지 않고(곡 시간 계산의 부동소수 오차 1ms 허용), 일시정지한 2초를 건너뛰지도 않는다.
    const songTimeAfterResume = finished.songTimesByRenderer[0][framesBeforePause];
    expect(songTimeAfterResume).toBeGreaterThanOrEqual(songTimeAtPause - 1);
    expect(songTimeAfterResume).toBeLessThan(songTimeAtPause + RESUME_SONG_TIME_ADVANCE_LIMIT_MS);
    // Resume 뒤에도 남은 노트를 판정해 콤보가 늘었다.
    expect(finished.maxComboByRenderer[0]).toBeGreaterThan(comboAtPause);
    expect(judgmentTotal(result.judgmentCounts)).toBe(SINGLE_NOTE_COUNT);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('No songs found.', { exact: true })).toBeVisible();
  });

  test('AutoEvent single 노트 4개(1·3·3.5·4초) 곡에서 콤보가 1이 된 렌더 프레임에 Esc로 일시정지하고 Retry를 누르면 새 AudioEngine이 곡을 0ms부터 다시 재생해 새 렌더러가 판정하고, 결과의 판정 수 합은 Retry 전 판정이 더해지지 않은 4다', async ({ page }) => {
    await startAutoPlay(page, { escapeAtFirstComboOfRenderer: 0 });
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    // Retry는 플레이 화면을 다시 초기화해 두 번째 렌더러로 곡을 처음부터 재생하고, 그 재생에서도 판정이 일어난다.
    await expect.poll(async () => (await readProbe(page)).songTimesByRenderer.length, { timeout: 30_000 }).toBe(2);
    await waitForFirstCombo(page, { renderer: 1 });

    const result = await expectResultScreen(page);
    const finished = await readProbe(page);
    expect(finished.songTimesByRenderer).toHaveLength(2);
    // 첫 재생과 Retry는 각자 새 AudioEngine을 만들어 곡을 0ms부터 한 번 재생한다. Retry가 일시정지한 곡 시간 등 다른 위치부터 재생하면 여기서 드러난다.
    // (warm-up 렌더 프레임은 재생 시작 전에 그려지므로 어디부터 재생했는지 알려 주지 않는다.)
    expect(finished.playOffsetsByEngine).toEqual([[0], [0]]);
    expect(judgmentTotal(result.judgmentCounts)).toBe(SINGLE_NOTE_COUNT);
  });
});
