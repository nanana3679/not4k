import { test, expect, type Locator, type Page } from '@playwright/test';
import { installProbe as installExplicitProbe, probe as readExplicitProbe, preparationTarget } from '../explicitPlaybackProbe';
import type { Chart } from '../../src/shared';
import { STORAGE_BUCKET, songChartExtraPath, songChartPath } from '../../src/shared/storage';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

// 게임 루프 스모크(#151). 다른 게임 스펙이 덮지 않은 연결만 거칠게 확인한다: 곡 도중 일시정지한 뒤 Resume·Retry를 거쳐도
// 게임 루프가 곡 끝까지 판정을 이어 결과 화면에 도달하는지, 결과 화면의 항목과 Back으로 곡 선택에 돌아가는지,
// 에디터 테스트 플레이(커서부터 시작)가 커서 뒤 노트만 판정하고 결과 화면·일시정지 메뉴에서 에디터 주소로 돌아가는지.
// 에디터 테스트 플레이는 에디터 화면을 거치지 않고(에디터 E2E 진입은 #308), 에디터의 Test Play가 부르는 performPlayTest로 게임 스토어에 넣는다.
// `AutoEvent` 완주와 결과(note-judgment.spec.ts), 실제 키 입력 판정(manual-note-judgment.spec.ts), 곡 끝 전까지 보는
// 일시정지·Resume·Retry(flight-background.spec.ts·gear-motion.spec.ts)는 각 스펙이 맡는다.
// Esc는 콤보가 1이 된 렌더 프레임 안에서 브라우저가 보낸다. 테스트 러너를 왕복해 누르면 부하가 클 때 Esc가 뒤 노트보다 늦게 도착할 수 있다.
// swiftshader의 렌더 프레임 지터에 흔들릴 수 있는 점수 값(달성률·랭크)은 보지 않고 결과 도달·항목 표시·판정 수·콤보·Full Combo·곡 시간·
// 재생 시작 위치와 에디터로 돌아갈 때의 주소·게임 스토어 상태만 본다. `AutoEvent` 입력은 노트 시각을 그대로 실어 보내 렌더 프레임이 늦어도
// Miss가 나지 않으므로, Retry 뒤 콤보 최댓값과 Full Combo는 지터와 무관하다.

/** 차트의 single 노트 수. single 노트는 노트마다 판정이 1개라 한 번 완주한 결과의 판정 수 합이 이 값이다. */
const SINGLE_NOTE_COUNT = 4;
/** 일시정지 메뉴를 띄워 둔 채 기다리는 벽시계 시간(ms). 일시정지 중에도 곡 시간이 흐르는 회귀라면 Resume 뒤 곡 시간이 이만큼 건너뛰어 아래 상한을 넘는다. */
const PAUSE_DURATION_MS = 2000;

/** 에디터 Test Play `커서부터 시작`의 커서 위치(ms). 첫 노트(1초)와 둘째 노트(3초) 사이라 첫 노트만 커서 앞에 남는다. */
const EDITOR_CURSOR_MS = 2000;
/** 커서 뒤 single 노트 수(3·3.5·4초). 테스트 플레이는 커서 앞 노트를 판정하지 않으므로 커서부터 완주한 결과의 판정 수 합이 이 값이다. */
const NOTES_AFTER_EDITOR_CURSOR = 3;
/** 테스트 플레이를 연 에디터의 곡(실제 곡이 아니다)과 난이도. */
const EDITOR_SONG_ID = 'game-loop-smoke';
const EDITOR_DIFFICULTY = 'normal';
/**
 * 테스트 플레이를 연 에디터 주소. 에디터는 `window.location.pathname + window.location.search`를 넘긴다.
 * 돌아간 에디터는 songId·difficulty가 없으면 `/game`을 새로 읽고, Storage 경로 규칙(소문자·숫자로 시작하고 소문자·숫자·`.`·`_`·`-`만)에
 * 맞지 않는 songId에는 예외를 던지므로 규칙에 맞는 둘을 둔다.
 */
const EDITOR_RETURN_URL = `/editor?songId=${EDITOR_SONG_ID}&difficulty=${EDITOR_DIFFICULTY}`;
/**
 * 돌아간 에디터가 Storage에서 읽는 차트 두 개의 공개 URL 경로. 에디터와 같은 경로 함수(songChartPath·songChartExtraPath)로 만들며,
 * `/storage/v1/object/public/assets/songs/game-loop-smoke/normal.json`과 `…/normal.extra.json`이다.
 */
const EDITOR_CHART_READ_PATHS = new Set(
  [songChartPath, songChartExtraPath].map(chartPath => `/storage/v1/object/public/${STORAGE_BUCKET}/${chartPath(EDITOR_SONG_ID, EDITOR_DIFFICULTY)}`),
);

const GAME_STORE_PATH = '/src/game/stores/gameStore.ts';
const GAME_RENDERER_PATH = '/src/game/renderer/GameRenderer.ts';
const AUDIO_ENGINE_PATH = '/src/game/audio/AudioEngine.ts';
const PERFORM_PLAY_TEST_PATH = '/src/editor/playtest/performPlayTest.ts';

/** Supabase API 경로(origin 무관). */
const SUPABASE_API_PATH = /^\/(rest|storage|auth)\/v1\//;

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
 * 에디터 주소로 돌아가는 테스트는 플레이 화면을 떠나기 직전에 answerEditorChartReadsWithNotFound를 더 건다.
 */
async function guardOfflineRequests(page: Page, appOrigin: string): Promise<string[]> {
  const unexpectedRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const requestLabel = `${method} ${url.origin}${path}`;
    if (SUPABASE_API_PATH.test(path)) {
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
 * 플레이 화면을 떠나 에디터 주소로 돌아가기 직전에 건다. 돌아간 에디터는 에디터 스토어에 이 곡이 없어 Storage에서 차트 두 개(EDITOR_CHART_READ_PATHS)를 읽는다.
 * 그 두 경로의 GET만 guardOfflineRequests보다 먼저(나중에 건 route가 먼저 받는다) 받아, 실제 Supabase에 보내지 않고 404로 응답하며 예상 밖 요청으로 기록하지 않는다.
 * 그 밖의 요청(두 경로의 GET이 아닌 요청, 다른 Supabase 경로의 요청)은 guardOfflineRequests로 넘겨 계속 예상 밖 요청으로 기록한다.
 * 차트를 읽지 못한 에디터는 PIXI 타임라인을 만들지 않은 채 오류 화면(관리자, 개발 서버의 `VITE_DEV_ADMIN=true`) 또는 Access Denied(비관리자)에서 멈춘다.
 * 둘 다 Back to Songs 버튼이 있는 정적 화면이라 실제 Supabase 데이터와 무관하고, 그 뒤로는 요청을 보내지 않는다.
 * 편집 화면까지 열면 PIXI 티커가 SwiftShader에서 페이지를 닫는 데 수십 초가 걸리게 해 다음 테스트를 흔들 수 있다(#308).
 */
async function answerEditorChartReadsWithNotFound(page: Page) {
  await page.route(url => EDITOR_CHART_READ_PATHS.has(url.pathname), async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    await route.fulfill({ status: 404, json: { message: 'Not found in offline test' } });
  });
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
  /** AudioEngine별(처음 play한 순서) play(offsetMs)로 받은 재생 시작 위치(ms). Resume은 같은 AudioEngine이 멈춘 위치에서 play로 다시 재생한다. */
  playOffsetsByEngine: number[][];
}

/**
 * 실제 PlayScreen이 만든 GameRenderer·AudioEngine을 renderFrame·updateCombo·play 관찰로 잡는다. 감싼 메서드는 인자와 동작을 그대로 넘기고,
 * 재생을 바꾸는 것은 아래 Esc 하나뿐이다: escapeAtFirstComboOfRendererIndex번째 렌더러가 콤보 1 이상을 처음 표시하는 렌더 프레임 안에서
 * 포커스된 요소에서 window까지 버블링하는 Esc keydown을 한 번 보내 일시정지한다. null이면 Esc를 보내지 않는다.
 * warm-up(`prepareForPlayback`)의 첫 프레임도 renderFrame이라 렌더러 번호는 곡 재생 전에 생긴다.
 */
async function installProbe(page: Page, { escapeAtFirstComboOfRendererIndex }: { escapeAtFirstComboOfRendererIndex: number | null }) {
  const [rendererUrl, audioEngineUrl] = await Promise.all([appModuleUrl(page, GAME_RENDERER_PATH), appModuleUrl(page, AUDIO_ENGINE_PATH)]);
  await page.evaluate(async ({ rendererUrl, audioEngineUrl, escapeRendererIndex }) => {
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
      // 콤보 1을 표시하는 렌더 프레임 안에서, 실제 키 입력처럼 포커스된 요소(없으면 body)에 Esc keydown을 보내 window까지 버블링시킨다
      // (플레이 화면은 window keydown으로 Esc를 받는다). 테스트 러너를 왕복하지 않아 부하가 커도 뒤 노트보다 먼저 일시정지한다.
      if (index === escapeRendererIndex && combo >= 1 && !escapeSent) {
        escapeSent = true;
        (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
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
  }, { rendererUrl, audioEngineUrl, escapeRendererIndex: escapeAtFirstComboOfRendererIndex });
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
    const { screen, lastResult, startTimeMs, editorReturnUrl } = useGameStore.getState();
    return { screen, lastResult, startTimeMs, editorReturnUrl };
  }, storeUrl);
}

/**
 * rendererIndex번째(만든 순서, 0부터) 렌더러가 콤보 1 이상을 표시할 때까지 화면 프레임마다 확인한다. Miss는 콤보를 0으로 표시하므로
 * 그 재생에서 Miss가 아닌 첫 판정을 기다리는 것이다. 곡 로딩을 포함해 30초까지 기다린다.
 */
async function waitForFirstCombo(page: Page, { rendererIndex }: { rendererIndex: number }) {
  await page.waitForFunction(
    (index) => ((window as unknown as { __gameLoopProbe: GameLoopProbe }).__gameLoopProbe.maxComboByRenderer[index] ?? 0) >= 1,
    rendererIndex,
    { polling: 'raf', timeout: 30_000 },
  );
}

/**
 * 120 BPM(1박 = 500ms)에서 single 노트 4개(1·3·3.5·4초, 레인 1~4)를 `AutoEvent`(0~5초)로 자동 재생하는 5초 무음 곡을 플레이 화면에 띄운다.
 * 첫 노트 뒤 2초를 비워, 콤보 1에서 보낸 Esc가 렌더 프레임이 아주 느려도 둘째 노트 전에 일시정지하게 한다.
 * 곡 선택·로딩 화면(Supabase)을 거치지 않고 게임 스토어에 차트·음원을 직접 넣는다. 곡 시작은 기다리지 않는다(캔버스는 로딩 중에도 있다).
 * editorCursorMs를 주면 에디터 Test Play의 `커서부터 시작`으로 연다: 에디터가 부르는 performPlayTest에 이 커서 위치(ms)와 돌아갈 주소
 * EDITOR_RETURN_URL을 넘겨 차트·음원·startTimeMs·editorReturnUrl·screen을 넣는다. 에디터는 그 뒤 react-router로 `/game`에 가지만,
 * 테스트는 이미 `/game`에 있어 옮겨 가지 않는다.
 */
async function startAutoPlay(page: Page, { escapeAtFirstComboOfRendererIndex, editorCursorMs }: { escapeAtFirstComboOfRendererIndex: number | null; editorCursorMs?: number }) {
  await page.goto('/game');
  await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  // AudioContext를 시작할 수 있게 사용자 gesture를 먼저 준다.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await installProbe(page, { escapeAtFirstComboOfRendererIndex });
  if (editorCursorMs === undefined) await installExplicitProbe(page);
  const [storeUrl, performPlayTestUrl] = await Promise.all([appModuleUrl(page, GAME_STORE_PATH), appModuleUrl(page, PERFORM_PLAY_TEST_PATH)]);
  const playTestStart = await page.evaluate(async ({ storeUrl, performPlayTestUrl, editorCursorMs, editorReturnUrl }) => {
    const { useGameStore }: typeof import('../../src/game/stores/gameStore') = await import(storeUrl);
    const b = (n: number, d = 1) => ({ n, d });
    const state = useGameStore.getState();
    state.updateSettings({ isFirstLaunch: false, debugMode: false, renderHeight: 720, masterVolume: 0 });
    const chart: Chart = {
      meta: { title: 'Game loop smoke', artist: 'Local', difficultyLabel: 'NORMAL', difficultyLevel: 1, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
      notes: [
        { type: 'single', lane: 1, beat: b(2) },
        { type: 'single', lane: 2, beat: b(6) },
        { type: 'single', lane: 3, beat: b(7) },
        { type: 'single', lane: 4, beat: b(8) },
      ],
      trillZones: [],
      events: [
        { type: 'bpm', beat: b(0), bpm: 120, editorLane: 1 },
        { type: 'timeSignature', beat: b(0), beatPerMeasure: b(4), editorLane: 2 },
        { type: 'auto', beat: b(0), endBeat: b(10), editorLane: 3 },
      ],
    };
    const audioBuffer = new AudioBuffer({ length: 44100 * 5, sampleRate: 44100, numberOfChannels: 1 });
    if (editorCursorMs === null) {
      const fixturePath = '/e2e/normalPlayFixture.ts';
      const { startNormalFixture } = await import(fixturePath) as typeof import('../normalPlayFixture');
      startNormalFixture({ ...chart, notes: [
        { type: 'tap', kind: 'single', lane: 1, beat: b(2) },
        { type: 'tap', kind: 'single', lane: 2, beat: b(6) },
        { type: 'tap', kind: 'single', lane: 3, beat: b(7) },
        { type: 'tap', kind: 'single', lane: 4, beat: b(8) },
      ] }, audioBuffer);
      return null;
    }
    const { performPlayTest }: typeof import('../../src/editor/playtest/performPlayTest') = await import(performPlayTestUrl);
    const toasts: string[] = [];
    // 에디터(useFileOperations의 handlePlayTest)처럼 게임 스토어의 액션을 넘긴다.
    const started = performPlayTest({
      fromCursor: true,
      audioBuffer,
      isPlaying: false,
      pause: () => {},
      chart,
      currentTimeMs: editorCursorMs,
      returnUrl: editorReturnUrl,
      game: state,
      addToast: message => { toasts.push(message); },
      closeMenu: () => {},
      navigate: () => {},
    });
    return { started, toasts };
  }, { storeUrl, performPlayTestUrl, editorCursorMs: editorCursorMs ?? null, editorReturnUrl: EDITOR_RETURN_URL });
  // performPlayTest는 시작하지 못하면 false를 돌려주고 게임 스토어를 바꾸지 않는다(오디오 없음·배치 제약 위반은 토스트도 띄운다).
  // 여기서 바로 실패시켜, 플레이 화면 캔버스를 30초 기다린 뒤에야 실패하지 않게 한다.
  if (playTestStart) expect(playTestStart, 'performPlayTest 결과').toEqual({ started: true, toasts: [] });
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

/**
 * 에디터 테스트 플레이(startAutoPlay의 editorCursorMs = EDITOR_CURSOR_MS) 중인 화면에서 exitButton을 눌러 에디터 주소로 돌아가고, 돌아간 뒤를 확인한다.
 * 누르기 전에 게임 스토어에 테스트 플레이 상태(startTimeMs = EDITOR_CURSOR_MS, editorReturnUrl = EDITOR_RETURN_URL)가 있는지 보고,
 * answerEditorChartReadsWithNotFound를 건 뒤 누른다. 누른 뒤에는 차례로 확인한다.
 * 1. 주소가 EDITOR_RETURN_URL이다.
 * 2. 돌아간 에디터가 차트를 읽지 못한 화면(Back to Songs)에서 멈출 때까지 기다린다. 에디터가 보낼 요청과 생길 수 있는 pageerror를
 *    afterEach가 확인하기 전에 모두 받기 위해서다. pageerror는 누른 순간에서 끊지 않고 이 화면까지 함께 본다. 주소는 누를 때 바로 바뀌지만,
 *    react-router(7.13)의 BrowserRouter는 화면 전환을 React.startTransition으로 반영해, lazy로 읽는 에디터 코드가 도착할 때까지 게임 화면을
 *    그대로 두었다가 그때 한 번에 바꾼다. Quit이면 일시정지한 플레이 화면의 정리(렌더러·AudioEngine dispose)가 그 커밋에서 일어난다
 *    (Back to Editor는 결과 화면이 뜰 때 플레이 화면을 이미 정리했고, 그 커밋에서는 결과 화면을 내린다).
 * 3. 같은 문서에서 react-router로 옮겨 갔다. 페이지를 새로 읽었다면 관찰 도우미(window.__gameLoopProbe)가 없다(실제 에디터라면 저장하지 않은 편집도 사라진다).
 * 4. 게임 스토어의 테스트 플레이 상태를 지웠다(startTimeMs 0, editorReturnUrl null). 새로 읽은 페이지의 기본값과 같아 3을 확인한 뒤에 본다.
 */
async function leaveTestPlayToEditor(page: Page, exitButton: Locator) {
  const before = await readGameState(page);
  expect({ startTimeMs: before.startTimeMs, editorReturnUrl: before.editorReturnUrl }, '누르기 전 테스트 플레이 상태')
    .toEqual({ startTimeMs: EDITOR_CURSOR_MS, editorReturnUrl: EDITOR_RETURN_URL });
  await answerEditorChartReadsWithNotFound(page);
  await exitButton.click();

  await expect(page).toHaveURL(EDITOR_RETURN_URL);
  await expect(page.getByRole('button', { name: 'Back to Songs', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => '__gameLoopProbe' in window), '새로고침 없이 옮겨 감').toBe(true);
  const after = await readGameState(page);
  expect({ startTimeMs: after.startTimeMs, editorReturnUrl: after.editorReturnUrl }, '돌아간 뒤 테스트 플레이 상태')
    .toEqual({ startTimeMs: 0, editorReturnUrl: null });
}

// 아래 제한 시간과 훅은 이 파일의 모든 테스트에 적용한다.
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

test.describe('게임 루프 스모크(#151): 일시정지 뒤 Resume·Retry를 거쳐 곡 끝 결과 화면까지 pageerror·예상 밖 요청 없이 진행', () => {
  test('AutoEvent single 노트 4개(1·3·3.5·4초) 곡에서 콤보가 1이 된 렌더 프레임에 Esc로 일시정지하면 2초 동안 렌더 프레임이 없고, Resume하면 곡3초 되감기와 실제3초 음악 준비 뒤 다시 판정하며, 결과 화면에 달성률·랭크·Full Combo·판정 분포·FAST/SLOW를 표시한 뒤(판정 수 합 4) Back으로 곡 선택에 돌아간다', async ({ page }) => {
    await startAutoPlay(page, { escapeAtFirstComboOfRendererIndex: 0 });
    const resume = page.getByRole('button', { name: 'Resume', exact: true });
    await expect(resume).toBeVisible({ timeout: 30_000 });
    const framesAtMenu = (await readProbe(page)).songTimesByRenderer[0].length;
    // 일시정지 메뉴를 띄운 채 벽시계로 기다린다. 곡 시간은 AudioContext 시계라 화면 프레임 수로 대신 기다릴 수 없다.
    await page.waitForTimeout(PAUSE_DURATION_MS);
    const paused = await readProbe(page);
    // 메뉴가 떠 있는 동안 게임 루프는 renderFrame을 부르지 않는다(메뉴만 뜨고 루프가 계속 도는 회귀를 잡는다).
    expect(paused.songTimesByRenderer[0].length, '일시정지 중 그린 렌더 프레임').toBe(framesAtMenu);
    const audioPause = (await readExplicitProbe(page)).pauses.at(-1)!;
    const comboAtPause = paused.maxComboByRenderer[0];
    expect(comboAtPause, 'Esc가 마지막 노트 뒤에 도착').toBeLessThan(SINGLE_NOTE_COUNT);

    await resume.click();
    await expect(page.getByTestId('explicit-play')).toHaveAttribute('data-phase', 'music-preparation');
    expect((await readExplicitProbe(page)).chartVisible).toBe(false);
    const result = await expectResultScreen(page);
    const finished = await readProbe(page);
    // Resume은 플레이 화면을 다시 만들지 않고 같은 렌더러·AudioEngine으로 이어 간다.
    expect(finished.songTimesByRenderer).toHaveLength(1);
    expect(finished.playOffsetsByEngine).toHaveLength(1);
    const preparation = (await readExplicitProbe(page)).preparations.at(-1)!;
    const target = Math.max(0, audioPause.positionMs - audioPause.latencyMs * audioPause.rate - 3000);
    expect(preparationTarget(preparation)).toBeCloseTo(target, 5);
    expect(preparation.visibleAfterMs).toBeGreaterThanOrEqual(3000);
    // Resume 뒤에도 남은 노트를 판정해 콤보가 늘었다.
    expect(finished.maxComboByRenderer[0]).toBeGreaterThan(comboAtPause);
    expect(judgmentTotal(result.judgmentCounts)).toBe(SINGLE_NOTE_COUNT);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Song Select' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('No songs found.', { exact: true })).toBeVisible();
  });

  test('AutoEvent single 노트 4개(1·3·3.5·4초) 곡에서 콤보가 1이 된 렌더 프레임에 Esc로 일시정지하고 Retry를 누르면 곡을 0ms부터 다시 재생해 새 렌더러의 콤보를 1부터 다시 세어 최댓값 4가 되고, 결과의 판정 수 합은 Retry 전 판정이 더해지지 않은 4이며 Full Combo는 YES다', async ({ page }) => {
    await startAutoPlay(page, { escapeAtFirstComboOfRendererIndex: 0 });
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    // Retry는 플레이 화면을 다시 초기화해 두 번째 렌더러로 곡을 처음부터 재생하고, 그 재생에서도 판정이 일어난다.
    await expect.poll(async () => (await readProbe(page)).songTimesByRenderer.length, { timeout: 30_000 }).toBe(2);
    await waitForFirstCombo(page, { rendererIndex: 1 });

    const result = await expectResultScreen(page);
    const finished = await readProbe(page);
    expect(finished.songTimesByRenderer).toHaveLength(2);
    // 첫 재생과 Retry는 곡을 0ms부터 한 번씩 재생한다(Retry가 AudioEngine을 새로 만들든 다시 쓰든). Retry가 일시정지한 곡 시간 등
    // 다른 위치부터 재생하거나 멈춘 AudioEngine을 이어 재생하면 0이 아닌 재생 시작 위치가 생겨 여기서 드러난다.
    // (warm-up 렌더 프레임은 재생 시작 전에 그려지므로 어디부터 재생했는지 알려 주지 않는다.)
    expect(finished.playOffsetsByEngine.flat()).toEqual([0, 0]);
    expect((await readExplicitProbe(page)).preparations).toEqual([]);
    expect(judgmentTotal(result.judgmentCounts)).toBe(SINGLE_NOTE_COUNT);
    // Retry 뒤 새 렌더러는 콤보를 1부터 다시 세어 노트 4개를 모두 맞힌 최댓값 4를 표시하고, 결과 화면의 Full Combo 행은 YES다.
    // Retry 전 콤보(1)를 이어 세면 최댓값이 5가 되고, Retry 뒤 놓친 노트가 있으면 4 미만·Full Combo NO가 된다.
    // 어느 쪽이든 판정 수 합은 4라 위 단언으로는 드러나지 않는다. 놓친 노트는 두 단언을 함께 틀리게 하므로 둘 다 보고하도록 soft로 둔다.
    expect.soft(finished.maxComboByRenderer[1], 'Retry 뒤 새 렌더러의 콤보 최댓값').toBe(SINGLE_NOTE_COUNT);
    await expect.soft(page.getByText('Full Combo:', { exact: true }).locator('..'), '결과 화면의 Full Combo 행').toHaveText(/^Full Combo:\s*YES$/);
  });
});

test.describe('게임 루프 스모크(#151): 에디터 테스트 플레이(커서부터 시작, 에디터 화면 없이 performPlayTest로 진입)에서 에디터 주소로 돌아가기까지 pageerror·예상 밖 요청 없이 진행', () => {
  test('에디터 Test Play 진입 함수(performPlayTest)로 커서 2000ms부터 열면 AutoEvent single 노트 4개(1·3·3.5·4초) 곡을 2000ms부터 재생해 커서 뒤 노트 3개만 판정하고(판정 수 합 3), 결과 화면의 Back to Editor를 누르면 새로고침 없이 에디터 주소로 돌아가 startTimeMs 0·editorReturnUrl null이 된다', async ({ page }) => {
    await startAutoPlay(page, { escapeAtFirstComboOfRendererIndex: null, editorCursorMs: EDITOR_CURSOR_MS });
    const result = await expectResultScreen(page);
    const finished = await readProbe(page);
    // 곡을 커서 위치부터 한 번 재생한다. AudioEngine.play에 넘긴 위치만 보면 엔진이 그 위치를 무시하고 0ms부터 재생해도 [2000]이므로,
    // 그 시계로 그린 곡 시간도 본다. 곡 시작 전 준비 프레임은 커서 − 출력 지연 L₀(수십 ms)에, 재생 중 프레임은 그 뒤에 그린다.
    // 0ms부터 재생하면 첫 노트(1초)보다 앞을 그린다.
    expect(finished.playOffsetsByEngine.flat(), 'AudioEngine.play 재생 시작 위치(ms)').toEqual([EDITOR_CURSOR_MS]);
    expect(Math.min(...finished.songTimesByRenderer[0]), '그린 곡 시간 최솟값').toBeGreaterThan(EDITOR_CURSOR_MS - 1000);
    // 커서 앞 노트(1초)는 판정하지 않는다. 판정 대상에 남으면 판정 수 합이 4가 된다.
    expect(judgmentTotal(result.judgmentCounts), '판정 수 합').toBe(NOTES_AFTER_EDITOR_CURSOR);

    const backToEditor = page.getByRole('button', { name: 'Back to Editor', exact: true });
    await expect(backToEditor).toBeVisible();
    await leaveTestPlayToEditor(page, backToEditor);
  });

  test('에디터 Test Play 진입 함수(performPlayTest)로 커서 2000ms부터 열고 콤보가 1이 된 렌더 프레임에 Esc로 일시정지한 뒤 Quit을 누르면 결과를 남기지 않고(lastResult null) 새로고침 없이 에디터 주소로 돌아가 startTimeMs 0·editorReturnUrl null이 된다', async ({ page }) => {
    await startAutoPlay(page, { escapeAtFirstComboOfRendererIndex: 0, editorCursorMs: EDITOR_CURSOR_MS });
    // 커서부터 재생하면 첫 판정(3초) 0.5초 뒤에 다음 노트가 있지만, 이 테스트는 곡 끝(5초) 전에 일시정지하기만 하면 된다.
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible({ timeout: 30_000 });
    await leaveTestPlayToEditor(page, page.getByRole('button', { name: 'Quit', exact: true }));
    // Quit은 곡을 정산하지 않는다.
    expect((await readGameState(page)).lastResult, '저장된 결과').toBeNull();
  });
});
