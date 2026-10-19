import { test, expect, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

// 게임 루프 스모크(#151). 다른 게임 스펙이 덮지 않은 연결만 거칠게 확인한다: 곡 도중 일시정지한 뒤 Resume·Retry를 거쳐도
// 게임 루프가 곡 끝까지 판정을 이어 결과 화면에 도달하는지, 결과 화면의 항목과 Back으로 곡 선택에 돌아가는지.
// `AutoEvent` 완주와 결과(note-judgment.spec.ts), 실제 키 입력 판정(manual-note-judgment.spec.ts), 곡 끝 전까지 보는
// 일시정지·Resume·Retry(flight-background.spec.ts·gear-motion.spec.ts)는 각 스펙이 맡는다.
// swiftshader의 렌더 프레임 지터에 흔들릴 수 있는 점수 값은 보지 않고 결과 도달·항목 표시·판정 수·콤보·곡 시간의 방향만 본다.

/** 차트의 single 노트 수. single 노트는 노트마다 판정이 1개라 한 번 완주한 결과의 판정 수 합이 이 값이다. */
const SINGLE_NOTE_COUNT = 4;
/** 첫 노트의 곡 시간(ms). 120 BPM에서 2박이다. */
const FIRST_NOTE_MS = 1000;

// index.html이 불러오는 외부 글꼴. 테스트에서는 기록 없이 중단해 대체 글꼴로 그린다.
const GOOGLE_FONTS_ORIGINS = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);

/**
 * 페이지의 모든 요청을 가로채, 연결된 Supabase 프로젝트나 자격 증명과 무관하게 같은 화면을 보게 한다.
 * - 경로가 `/rest/v1/`·`/storage/v1/`·`/auth/v1/`로 시작하는 요청(origin 무관): OPTIONS는 204, `GET /rest/v1/songs`는 빈 곡 목록으로
 *   응답한다(결과 화면의 Back으로 연 곡 선택 화면이 부른다). 그 밖의 요청은 500으로 응답하고 기록한다.
 * - 앱 origin의 GET은 그대로 통과시킨다.
 * - Google Fonts origin의 요청은 기록하지 않고 중단한다.
 * - 나머지(그 밖의 origin, 앱 origin의 GET이 아닌 요청)는 중단하고 기록한다.
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

interface GameLoopProbe {
  /** 렌더러별(처음 관찰한 순서) 렌더 프레임마다 그린 곡 시간(ms, renderFrame의 songTimeMs). 플레이 화면은 초기화(첫 재생·Retry)마다 새 렌더러를 만든다. */
  songTimesByRenderer: number[][];
  /** 렌더러별 화면 콤보(updateCombo)의 최댓값. 그 재생에서 판정이 일어나면 1 이상이다. */
  maxComboByRenderer: number[];
}

/**
 * 실제 PlayScreen이 만든 GameRenderer를 renderFrame·updateCombo 관찰로 잡는다(그리기와 판정은 바꾸지 않는다).
 * warm-up(`prepareForPlayback`)의 첫 프레임도 renderFrame이라, 렌더러 번호와 첫 곡 시간은 곡 재생 전에 생긴다.
 */
async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const probe: GameLoopProbe = { songTimesByRenderer: [], maxComboByRenderer: [] };
    (window as unknown as { __gameLoopProbe: GameLoopProbe }).__gameLoopProbe = probe;
    const rendererPath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/renderer/GameRenderer.ts') ?? '/src/game/renderer/GameRenderer.ts';
    const { GameRenderer }: typeof import('../../src/game/renderer/GameRenderer') = await import(rendererPath);
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
    const updateCombo = GameRenderer.prototype.updateCombo;
    GameRenderer.prototype.updateCombo = function (combo) {
      const index = rendererIndexOf(this);
      probe.maxComboByRenderer[index] = Math.max(probe.maxComboByRenderer[index], combo);
      return updateCombo.call(this, combo);
    };
  });
}

async function readProbe(page: Page): Promise<GameLoopProbe> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __gameLoopProbe: GameLoopProbe }).__gameLoopProbe;
    return { songTimesByRenderer: probe.songTimesByRenderer.map(times => [...times]), maxComboByRenderer: [...probe.maxComboByRenderer] };
  });
}

async function readGameState(page: Page) {
  return page.evaluate(async () => {
    const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const { screen, lastResult } = useGameStore.getState();
    return { screen, lastResult };
  });
}

/** 브라우저 requestAnimationFrame을 count번 기다린다(벽시계 대기 대신 화면 프레임 수로 기다린다). */
async function waitAnimationFrames(page: Page, count: number) {
  await page.evaluate((frames) => new Promise<void>((resolve) => {
    let left = frames;
    const step = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), count);
}

/** rendererIndex번째 렌더러가 콤보 1 이상을 표시할 때(그 재생의 첫 판정)까지 화면 프레임마다 확인한다. 곡 로딩을 포함해 30초까지 기다린다. */
async function waitForFirstJudgment(page: Page, rendererIndex: number) {
  await page.waitForFunction(
    (index) => ((window as unknown as { __gameLoopProbe: GameLoopProbe }).__gameLoopProbe.maxComboByRenderer[index] ?? 0) >= 1,
    rendererIndex,
    { polling: 'raf', timeout: 30_000 },
  );
}

/**
 * 120 BPM(1박 = 500ms)에서 single 노트 4개(1·2·3·4초, 레인 1~4)를 `AutoEvent`(0~5초)로 자동 재생하는 5초 무음 곡을 플레이 화면에 띄운다.
 * 곡 선택·로딩 화면(Supabase)을 거치지 않고 게임 스토어에 차트·음원을 직접 넣는다. 곡 시작은 기다리지 않는다(캔버스는 로딩 중에도 있다).
 */
async function startAutoPlay(page: Page) {
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  // AudioContext를 시작할 수 있게 사용자 gesture를 먼저 준다.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await installProbe(page);
  await page.evaluate(async () => {
    const storePath = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/game/stores/gameStore.ts') ?? '/src/game/stores/gameStore.ts';
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storePath);
    const b = (n: number, d = 1) => ({ n, d });
    const state = useGameStore.getState();
    state.updateSettings({ isFirstLaunch: false, debugMode: false, renderHeight: 720, masterVolume: 0 });
    state.setChartData({
      meta: { title: 'Game loop smoke', artist: 'Local', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: [
        { type: 'single', lane: 1, beat: b(2) },
        { type: 'single', lane: 2, beat: b(4) },
        { type: 'single', lane: 3, beat: b(6) },
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
  });
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

  test('AutoEvent single 노트 4개(1~4초) 곡에서 첫 판정 뒤 Esc로 일시정지하고 Resume하면 멈춘 곡 시간부터 이어 남은 노트를 판정하고, 결과 화면에 달성률·랭크·Full Combo·판정 분포·FAST/SLOW를 표시한 뒤(판정 수 합 4) Back으로 곡 선택에 돌아간다', async ({ page }) => {
    await startAutoPlay(page);
    await waitForFirstJudgment(page, 0);

    await page.keyboard.press('Escape');
    const resume = page.getByRole('button', { name: 'Resume', exact: true });
    await expect(resume).toBeVisible();
    // 일시정지가 게임 루프에 반영되도록 화면 프레임 몇 개를 기다린 뒤, 멈춘 때까지 그린 곡 시간과 콤보를 읽는다.
    await waitAnimationFrames(page, 5);
    const paused = await readProbe(page);
    const framesBeforePause = paused.songTimesByRenderer[0].length;
    const songTimeAtPause = paused.songTimesByRenderer[0].at(-1)!;
    const comboAtPause = paused.maxComboByRenderer[0];
    expect(comboAtPause).toBeGreaterThanOrEqual(1);

    await resume.click();
    const result = await expectResultScreen(page);
    const finished = await readProbe(page);
    // Resume은 플레이 화면을 다시 만들지 않고 같은 렌더러로 이어 간다. 일시정지 중에는 렌더 프레임이 없으므로
    // Resume 뒤 첫 프레임의 곡 시간은 처음(0초)으로 돌아가지 않고 멈춘 곡 시간 이상이다(곡 시간 계산의 부동소수 오차 1ms 허용).
    expect(finished.songTimesByRenderer).toHaveLength(1);
    expect(finished.songTimesByRenderer[0][framesBeforePause]).toBeGreaterThanOrEqual(songTimeAtPause - 1);
    // Resume 뒤에도 남은 노트를 판정해 콤보가 늘었다(마지막 노트는 첫 노트 3초 뒤라 그 전에 일시정지한다).
    expect(finished.maxComboByRenderer[0]).toBeGreaterThan(comboAtPause);
    expect(judgmentTotal(result.judgmentCounts)).toBe(SINGLE_NOTE_COUNT);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('No songs found.', { exact: true })).toBeVisible();
  });

  test('AutoEvent single 노트 4개(1~4초) 곡에서 첫 판정 뒤 일시정지 메뉴 Retry를 누르면 새 렌더러가 첫 노트(1초) 앞부터 다시 재생해 판정하고, 결과의 판정 수 합은 Retry 전 판정이 더해지지 않은 4다', async ({ page }) => {
    await startAutoPlay(page);
    await waitForFirstJudgment(page, 0);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    // Retry는 플레이 화면을 다시 초기화해 두 번째 렌더러로 곡을 처음부터 재생하고, 그 재생에서도 판정이 일어난다.
    await expect.poll(async () => (await readProbe(page)).songTimesByRenderer.length, { timeout: 30_000 }).toBe(2);
    await waitForFirstJudgment(page, 1);

    const result = await expectResultScreen(page);
    const finished = await readProbe(page);
    expect(finished.songTimesByRenderer).toHaveLength(2);
    // 새 렌더러의 첫 렌더 프레임(warm-up)은 첫 노트보다 앞선 곡 시간이다(일시정지한 곡 시간에서 이어 가지 않는다).
    expect(finished.songTimesByRenderer[1][0]).toBeLessThan(FIRST_NOTE_MS);
    expect(judgmentTotal(result.judgmentCounts)).toBe(SINGLE_NOTE_COUNT);
  });
});
