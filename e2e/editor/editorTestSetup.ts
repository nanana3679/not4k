/**
 * 에디터 E2E 공통 진입 도우미.
 *
 * 에디터는 `/editor?songId=…&difficulty=…`로만 열린다. 파라미터가 없으면 `/game`으로 보내고
 * (src/editor/App.tsx), 곡 행과 함께 읽은 `charts` 행의 `chart_path`(NULL이면 Storage의 `songs/{songId}/{difficulty}.json`)에서
 * 차트를, 음원 경로는 `songs` 테이블에서 읽는다. 저장은 새 경로 `songs/{songId}/{difficulty}-{UUID}.json`·`.extra.json`에
 * 올린 뒤 `save_chart`·`create_chart` RPC로 확정한다(RFD 0107). 이 도우미는 Supabase HTTP 경계(`/rest/v1`·`/storage/v1`·
 * `/auth/v1`)를 전부 로컬 응답으로 끝내고 앱과 같은 URL로 진입해 타임라인 canvas 또는 예상 Error 화면을 기다린다.
 * 실제 DB·Storage에는 요청이 닿지 않으므로 `.env.local`의 Supabase URL·키는 실제 값이 아니어도 된다. 다만 둘 다
 * 비어 있지 않아야 하고(src/supabase/client.ts가 시작할 때 던진다), URL은 index.html CSP `connect-src`의
 * `https://*.supabase.co`에 맞아야 한다. 맞지 않으면 브라우저가 요청을 보내기 전에 막아 mock까지 오지 않는다.
 *
 * 관리자 권한은 개발 서버의 관리자 우회(`.env.local`의 `VITE_DEV_ADMIN=true`,
 * src/shared/hooks/useAuth.ts)에 기댄다. 우회가 꺼져 Access Denied가 보이면 원인을 적은 오류로 바로 실패한다.
 *
 * 구형 노트가 있는 차트를 열면 에디터가 1차 기계 변환을 묻는 모달을 띄운다(RFD 0037 §8-1). 기존 spec이 구형 동작을
 * 그대로 확인하도록 이 도우미는 기본으로 "구형 그대로 열기"를 누른다. `legacyConversion`으로 변환하거나 모달을 그대로 둘 수 있다.
 *
 * 타임라인 PIXI Application은 ticker(autoStart)로 유휴 중에도 렌더 프레임마다 다시 그린다. E2E의 SwiftShader에서는
 * 이 프레임이 GPU 프로세스에 밀려 쌓여, 페이지를 닫을 때 브라우저가 수십 초 멈추고 다음 테스트의 context 생성이
 * 시간 초과된다. 그래서 이 도우미는 ticker를 멈춘다. 차트·선택·뷰포트가 바뀌면 에디터가 `app.render()`를 직접 불러
 * canvas가 갱신되지만, hover·고스트·재생 커서처럼 ticker에 맡긴 갱신은 canvas에 그려지지 않는다(DOM 동작은 그대로).
 */
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { SongTiming } from '../../src/shared/songAssets/songTiming';
import type { ChartJsonV3, ChartJsonV4, ExtraNotesJson } from '../../src/shared/chart';

export const EDITOR_TEST_SONG_ID = 'e2e-editor-song';
export const EDITOR_TEST_DIFFICULTY = 'normal';
/** 0.5초 무음 WAV(e2e/global-setup.ts가 없으면 만든다). */
export const EDITOR_TEST_AUDIO_FILE = fileURLToPath(new URL('../fixtures/test-audio.wav', import.meta.url));

const SUPABASE_PATH = /^\/(rest|storage|auth)\/v1\//;
const SONG_DIR = `songs/${EDITOR_TEST_SONG_ID}`;
const PUBLIC_SONG_DIR = `/storage/v1/object/public/assets/${SONG_DIR}`;
const UPLOAD_SONG_DIR = `/storage/v1/object/assets/${SONG_DIR}`;
const AUDIO_PATH = `${SONG_DIR}/audio.wav`;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** 테스트 곡 차트의 charts 행 ID. 열 때 리비전은 `EDITOR_TEST_CHART_REVISION`이다. */
export function editorTestChartId(difficulty: string): string {
  const hex = createHash('sha256').update(difficulty).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const EDITOR_TEST_CHART_REVISION = 3;
/** `storedChartPaths`로 열 때 normal 행이 가리키는 메인·보조 JSON 경로(bucket 안 경로). */
export const EDITOR_TEST_STORED_CHART_PATH = `${SONG_DIR}/${EDITOR_TEST_DIFFICULTY}-stored.json`;
export const EDITOR_TEST_STORED_EXTRA_PATH = `${SONG_DIR}/${EDITOR_TEST_DIFFICULTY}-stored.extra.json`;
/** Save가 차트 메인 JSON을 새 경로 `songs/{songId}/{difficulty}-{UUID}.json`에 업로드하는 요청 경로인가. */
export function isChartUploadPath(path: string, difficulty = EDITOR_TEST_DIFFICULTY): boolean {
  return new RegExp(`^${UPLOAD_SONG_DIR}/${difficulty}-${UUID}\\.json$`).test(path);
}
/** Save가 보조 레인 JSON을 새 경로 `songs/{songId}/{difficulty}-{UUID}.extra.json`에 업로드하는 요청 경로인가. */
export function isExtraUploadPath(path: string, difficulty = EDITOR_TEST_DIFFICULTY): boolean {
  return new RegExp(`^${UPLOAD_SONG_DIR}/${difficulty}-${UUID}\\.extra\\.json$`).test(path);
}

/** 0박 120 BPM·4/4 이벤트만 있는 v3 차트. 노트를 넘기면 그대로 담는다. */
export function editorTestChart(notes: ChartJsonV3['notes'] = []): ChartJsonV3 {
  return {
    version: 3,
    meta: { title: 'E2E 에디터 곡', artist: 'Offline', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes,
    trillZones: [],
    restZones: [],
    events: [{ type: 'bpm', beat: '0', bpm: 120, editorLane: 1 }, { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 }],
  };
}

export interface SupabaseWrite {
  method: string;
  path: string;
  body: string | null;
}

export interface OpenedEditor {
  /** GET이 아닌 Supabase 요청(저장 등). 로컬 응답으로 끝나 실제 서버에는 닿지 않는다. */
  supabaseWrites: SupabaseWrite[];
  /** mock 응답을 정하지 않은 Supabase 요청. 500으로 끝낸다. */
  unexpectedSupabaseRequests: string[];
}

export interface OpenEditorOptions {
  /** Storage에 저장된 차트. 기본은 노트 없는 `editorTestChart()`. */
  chart?: (ChartJsonV3 | ChartJsonV4) & ExtraNotesJson;
  /** 별도 보조 파일. 생략하면 404다. 구형 NULL 경로는 내장 자료로 폴백하고 storedChartPaths는 로드 오류다. */
  extra?: ExtraNotesJson | string;
  /** 기본은 타임라인 진입. error면 App의 Error 화면에서 반환하여 로드 실패를 검증할 수 있다. */
  expectedLoadState?: 'timeline' | 'error';
  /** true면 곡에 음원(`EDITOR_TEST_AUDIO_FILE`)이 있어 진입할 때 함께 불러온다. */
  audio?: boolean;
  /** false면 songs 조회에 null을 반환해 곡 행 없이 남은 차트 파일을 연다. */
  songRow?: boolean;
  /** 생략하면 timing NULL인 미이행 곡. 지정하면 공유 타이밍 변경 확인을 검증한다. */
  songTiming?: SongTiming | null;
  /** 같은 곡의 다른 차트. 타이밍 이행 비교용 파일도 이 로컬 응답에서 제공한다. */
  otherCharts?: Record<string, ChartJsonV3 | ChartJsonV4>;
  songSaveError?: 'PT409' | '42501';
  /** 지정하면 `save_chart`가 이 SQLSTATE로 거부한다. */
  chartSaveError?: 'PT409' | 'PT404' | '42501';
  /** true면 normal 행이 `EDITOR_TEST_STORED_CHART_PATH`·`EDITOR_TEST_STORED_EXTRA_PATH`를 가리키고 차트를 그 경로에서만 준다. */
  storedChartPaths?: boolean;
  /**
   * 구형 차트 변환 모달 처리. 기본 `decline`은 모달이 뜨면 "구형 그대로 열기"를 눌러 구형 그대로 연다(뜨지 않으면 아무것도 안 함).
   * `convert`는 모달이 떠야 하며 "변환"을 누른 뒤 결과 화면을 닫는다. `manual`은 모달을 그대로 두어 spec이 직접 다룬다.
   */
  legacyConversion?: 'decline' | 'convert' | 'manual';
  /**
   * 타임라인 렌더러 초기화를 이 시간(ms)만큼 늦춘다. 렌더러가 처음 부르는 pixi.js/unsafe-eval 청크 응답을 늦추는 방식이다.
   * 주면 렌더러 준비를 기다리지 않고 canvas가 보이면 바로 돌아온다. 준비 전의 조작을 확인하는 spec이 쓰고,
   * 끝나기 전에 `waitForTimelineReady`로 준비를 기다려야 한다. `legacyConversion`은 `manual`이어야 한다.
   */
  rendererInitDelayMs?: number;
}

/** 구형 노트가 있는 차트를 새로 열 때 뜨는 변환 모달(변환 전). */
export const legacyConversionOffer = (page: Page) => page.getByRole('dialog', { name: '구형 차트 변환', exact: true });
/** 변환 뒤 같은 모달의 결과 화면. */
export const legacyConversionResult = (page: Page) => page.getByRole('dialog', { name: '변환 완료', exact: true });

export async function openEditor(page: Page, options: OpenEditorOptions = {}): Promise<OpenedEditor> {
  const chart = options.chart ?? editorTestChart();
  const audio = options.audio ?? false;
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('에디터 E2E에는 Playwright baseURL이 필요하다');
  const appOrigin = new URL(baseURL).origin;
  const supabaseWrites: SupabaseWrite[] = [];
  const unexpectedSupabaseRequests: string[] = [];
  const chartRows = [EDITOR_TEST_DIFFICULTY, ...Object.keys(options.otherCharts ?? {})].map(difficulty_label => ({
    id: editorTestChartId(difficulty_label), song_id: EDITOR_TEST_SONG_ID, difficulty_label,
    difficulty_level: chart.meta.difficultyLevel, revision: EDITOR_TEST_CHART_REVISION,
    chart_path: options.storedChartPaths && difficulty_label === EDITOR_TEST_DIFFICULTY ? EDITOR_TEST_STORED_CHART_PATH : null,
    chart_extra_path: options.storedChartPaths && difficulty_label === EDITOR_TEST_DIFFICULTY ? EDITOR_TEST_STORED_EXTRA_PATH : null,
  }));

  const uploadedFilesByPath = new Map<string, string>();
  const selectChartRows = (columns: string) => chartRows.map(row => columns === '*' ? { ...row }
    : Object.fromEntries(columns.split(',').map(column => [column, row[column as keyof typeof row]])));

  // 앱 서버 밖으로 나가는 요청만 가로챈다. Supabase는 로컬 응답으로 끝내고, 그 밖(웹폰트 등)은 보내지 않는다.
  await page.route((url) => url.origin !== appOrigin, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (!SUPABASE_PATH.test(path)) { await route.abort(); return; }
    if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    if (method !== 'GET') supabaseWrites.push({ method, path, body: request.postData() });

    const uploaded = uploadedFilesByPath.get(path.replace('/storage/v1/object/public/assets/', ''));
    if (method === 'GET' && uploaded !== undefined) {
      await route.fulfill({ body: uploaded, contentType: 'application/json' }); return;
    }
    const mainChartPath = options.storedChartPaths ? EDITOR_TEST_STORED_CHART_PATH : `${SONG_DIR}/${EDITOR_TEST_DIFFICULTY}.json`;
    const extraChartPath = options.storedChartPaths ? EDITOR_TEST_STORED_EXTRA_PATH : `${SONG_DIR}/${EDITOR_TEST_DIFFICULTY}.extra.json`;
    if (method === 'GET' && path === `/storage/v1/object/public/assets/${mainChartPath}`) {
      await route.fulfill({ json: chart }); return;
    }
    for (const [difficulty, otherChart] of Object.entries(options.otherCharts ?? {})) {
      if (method === 'GET' && path === `${PUBLIC_SONG_DIR}/${difficulty}.json`) {
        await route.fulfill({ json: otherChart }); return;
      }
    }
    if (method === 'GET' && path === `/storage/v1/object/public/assets/${extraChartPath}`) {
      await route.fulfill(options.extra === undefined
        ? { status: 404, json: { error: 'not_found' } }
        : typeof options.extra === 'string' ? { body: options.extra, contentType: 'application/json' } : { json: options.extra });
      return;
    }
    if (method === 'GET' && path === '/rest/v1/songs') {
      if (options.songRow === false) { await route.fulfill({ json: null }); return; }
      const embeddedCharts = url.searchParams.get('select')?.match(/charts\(([^)]*)\)/);
      await route.fulfill({ json: {
        title: chart.meta.title, artist: chart.meta.artist, jacket_url: chart.meta.imageFile,
        timing: options.songTiming ?? null, revision: 1,
        audio_url: audio ? AUDIO_PATH : chart.meta.audioFile,
        preview_url: chart.meta.previewAudioFile || null, preview_start: chart.meta.previewStart ?? null, preview_end: chart.meta.previewEnd ?? null,
        duration: null, gameplay_start: null, gameplay_end: null, gameplay_fade_in: null, gameplay_fade_out: null,
        // 로더는 곡 행과 함께 charts 행을 읽어 차트 파일 경로·저장 대상(ID·리비전)을 정한다.
        ...(embeddedCharts ? { charts: selectChartRows(embeddedCharts[1]) } : {}),
      } });
      return;
    }
    if (audio && method === 'GET' && path === `/storage/v1/object/public/assets/${AUDIO_PATH}`) {
      await route.fulfill({ contentType: 'audio/wav', body: readFileSync(EDITOR_TEST_AUDIO_FILE) }); return;
    }
    // Save: 차트·보조 레인 JSON을 새 경로에 업로드(곡 미디어 업로드도 같은 폴더)한 뒤 save_chart·create_chart로 확정
    if (method === 'POST' && path.startsWith(`${UPLOAD_SONG_DIR}/`)) {
      if (path.endsWith('.json')) {
        uploadedFilesByPath.set(path.replace('/storage/v1/object/assets/', ''), JSON.stringify(readUploadedJson({
          method, path, body: request.postData(),
        })));
      }
      await route.fulfill({ json: { Key: path.replace('/storage/v1/object/', '') } }); return;
    }
    if (method === 'GET' && path === '/rest/v1/charts') {
      await route.fulfill({ json: selectChartRows(url.searchParams.get('select') ?? '*') }); return;
    }
    if (method === 'POST' && path === '/rest/v1/rpc/save_song') {
      if (options.songSaveError) {
        await route.fulfill({ status: options.songSaveError === 'PT409' ? 409 : 403,
          json: { code: options.songSaveError, message: 'offline save rejected' } }); return;
      }
      await route.fulfill({ json: 7 }); return;
    }
    if (method === 'POST' && path === '/rest/v1/rpc/save_chart') {
      if (options.chartSaveError) {
        await route.fulfill({ status: options.chartSaveError === '42501' ? 403 : options.chartSaveError === 'PT404' ? 404 : 409,
          json: { code: options.chartSaveError, message: 'offline chart save rejected' } }); return;
      }
      const args = JSON.parse(request.postData() ?? '{}') as {
        p_chart_id: string; p_expected_revision: number; p_difficulty_level: number;
        p_chart_path: string; p_chart_extra_path: string;
      };
      const row = chartRows.find(row => row.id === args.p_chart_id);
      if (!row) {
        await route.fulfill({ status: 404, json: { code: 'PT404', message: 'chart_not_found' } }); return;
      }
      if (row.revision !== args.p_expected_revision) {
        await route.fulfill({ status: 409, json: { code: 'PT409', message: 'chart_revision_conflict' } }); return;
      }
      row.chart_path = args.p_chart_path;
      row.chart_extra_path = args.p_chart_extra_path;
      row.difficulty_level = args.p_difficulty_level;
      row.revision += 1;
      await route.fulfill({ json: row.revision }); return;
    }
    if (method === 'POST' && path === '/rest/v1/rpc/create_chart') {
      const args = JSON.parse(request.postData() ?? '{}') as {
        p_song_id: string; p_difficulty_label: string; p_difficulty_level: number;
        p_chart_path: string; p_chart_extra_path: string;
      };
      if (chartRows.some(row => row.song_id === args.p_song_id && row.difficulty_label === args.p_difficulty_label)) {
        await route.fulfill({ status: 409, json: { code: '23505', message: 'duplicate key' } }); return;
      }
      const row = { id: randomUUID(), song_id: args.p_song_id, difficulty_label: args.p_difficulty_label,
        difficulty_level: args.p_difficulty_level, revision: 0,
        chart_path: args.p_chart_path, chart_extra_path: args.p_chart_extra_path };
      chartRows.push(row);
      await route.fulfill({ json: [{ chart_id: row.id, revision: row.revision }] }); return;
    }
    unexpectedSupabaseRequests.push(`${method} ${path}`);
    await route.fulfill({ status: 500, json: { error: 'Unexpected offline test request' } });
  });

  // pixi.js가 Application 초기화 때 부르는 globalThis.__PIXI_APP_INIT__로 ticker를 멈춘다. 이 이름은 pixi 공개 타입
  // 선언에 있는 DevTools hook이지만 부르는 쪽은 @internal 클래스(ApplicationInitHook)라 바뀔 수 있어, 진입 끝에서
  // 멈췄는지 확인한다. 8.21에서는 TickerPlugin이 ApplicationInitHook보다 먼저 ticker를 켠다. microtask는 나중에
  // plugin 순서가 바뀌어도 ticker가 켜진 뒤에 멈추게 하는 대비다.
  await page.addInitScript(() => {
    const pixiHooks = globalThis as unknown as {
      __PIXI_APP_INIT__?: (app: { stop(): void }) => void;
      __e2ePixiTickerStopped?: boolean;
    };
    pixiHooks.__PIXI_APP_INIT__ = (app) => queueMicrotask(() => {
      app.stop();
      pixiHooks.__e2ePixiTickerStopped = true;
    });
  });

  if (options.rendererInitDelayMs !== undefined) {
    if (options.legacyConversion !== 'manual') throw new Error('rendererInitDelayMs는 legacyConversion: manual과 함께 쓴다');
    const delayMs = options.rendererInitDelayMs;
    await page.route((url) => url.origin === appOrigin && url.pathname.includes('unsafe-eval'), async (route) => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      await route.continue();
    });
  }

  await page.goto(`/editor?songId=${EDITOR_TEST_SONG_ID}&difficulty=${EDITOR_TEST_DIFFICULTY}`);
  const timeline = page.locator('canvas').first();
  const accessDenied = page.getByRole('heading', { name: 'Access Denied', exact: true });
  const loadError = page.getByRole('heading', { name: 'Error', exact: true });
  await timeline.or(accessDenied).or(loadError).first().waitFor();
  if (await accessDenied.isVisible()) {
    throw new Error('에디터가 Access Denied를 보였다. 에디터 E2E는 개발 서버의 관리자 우회가 필요하다: .env.local에 VITE_DEV_ADMIN=true');
  }
  if (options.expectedLoadState === 'error') {
    await expect(loadError).toBeVisible();
    return { supabaseWrites, unexpectedSupabaseRequests };
  }
  if (await loadError.isVisible()) {
    // 차트를 불러오지 못하면 에디터는 제목·원인 문구·Back to Songs 버튼만 있는 Error 화면을 보인다(src/editor/App.tsx).
    const errorText = (await loadError.locator('xpath=..').innerText()).replace(/\s*\n\s*/g, ' / ');
    throw new Error(`에디터가 Error 화면을 보였다(${errorText}). mock 응답을 정하지 않은 Supabase 요청: ${unexpectedSupabaseRequests.join(', ') || '없음'}`);
  }
  if (options.rendererInitDelayMs !== undefined) return { supabaseWrites, unexpectedSupabaseRequests };
  await waitForTimelineReady(page);
  if (audio) {
    // 첫 음원을 불러오는 동안에는 화면 전체를 덮는 로딩 표시가 입력을 막는다.
    await expect(page.getByRole('status').filter({ hasText: 'Loading audio...' })).toBeHidden({ timeout: 15_000 });
  }
  // 변환 모달은 타임라인 canvas와 같은 렌더에 나타나므로 여기서 보이는지 바로 판단할 수 있다.
  const legacyConversion = options.legacyConversion ?? 'decline';
  const offer = legacyConversionOffer(page);
  if (legacyConversion === 'decline' && await offer.isVisible()) {
    await offer.getByRole('button', { name: '구형 그대로 열기', exact: true }).click();
    await expect(offer).toBeHidden();
  } else if (legacyConversion === 'convert') {
    await expect(offer, '구형 노트가 있는 차트인데 변환 모달이 뜨지 않았다').toBeVisible();
    await offer.getByRole('button', { name: '변환', exact: true }).click();
    const result = legacyConversionResult(page);
    await result.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(result).toBeHidden();
  }
  return { supabaseWrites, unexpectedSupabaseRequests };
}

/** 타임라인 PIXI ticker를 멈추고 렌더러 초기화(타임라인 범위 설정)까지 끝나기를 기다린다. */
export async function waitForTimelineReady(page: Page, timeout = 15_000): Promise<void> {
  await expect.poll(
    () => page.evaluate(() => (globalThis as { __e2ePixiTickerStopped?: boolean }).__e2ePixiTickerStopped === true),
    { message: '타임라인 PIXI ticker를 멈추지 못했다. pixi.js의 __PIXI_APP_INIT__ hook이 바뀌었는지 확인할 것', timeout },
  ).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const storePath = '/src/editor/stores/editorStore.ts';
    const { useEditorStore } = await import(storePath);
    return useEditorStore.getState().timelineRangeMs !== null;
  }), { timeout, message: '도안을 포함한 타임라인 초기화가 끝나지 않았다' }).toBe(true);
}

/** Storage 업로드(multipart/form-data) 본문에서 파일 부분을 JSON으로 읽는다. */
export function readUploadedJson(write: SupabaseWrite): unknown {
  const body = write.body ?? '';
  const delimiter = body.slice(0, body.indexOf('\r\n'));
  const filePart = body.split(delimiter).find((part) => part.includes('filename='));
  if (!delimiter || !filePart) throw new Error(`${write.method} ${write.path} 본문에 업로드 파일이 없다`);
  return JSON.parse(filePart.slice(filePart.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
}
