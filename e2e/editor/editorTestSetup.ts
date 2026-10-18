/**
 * 에디터 E2E 공통 진입 도우미.
 *
 * 에디터는 `/editor?songId=…&difficulty=…`로만 열린다. 파라미터가 없으면 `/game`으로 보내고
 * (src/editor/App.tsx), 차트는 Supabase Storage의 `songs/{songId}/{difficulty}.json`에서,
 * 음원 경로는 `songs` 테이블에서 읽는다. 이 도우미는 Supabase HTTP 경계(`/rest/v1`·`/storage/v1`·
 * `/auth/v1`)를 전부 로컬 응답으로 끝내고 앱과 같은 URL로 진입해 타임라인 canvas를 기다린다.
 * 실제 DB·Storage에는 요청이 닿지 않으므로 `.env.local`의 Supabase URL·키는 실제 값이 아니어도 된다.
 *
 * 관리자 권한은 개발 서버의 관리자 우회(`.env.local`의 `VITE_DEV_ADMIN=true`,
 * src/shared/hooks/useAuth.ts)에 기댄다. 우회가 꺼져 Access Denied가 보이면 원인을 적은 오류로 바로 실패한다.
 *
 * 타임라인 PIXI Application은 ticker(autoStart)로 유휴 중에도 렌더 프레임마다 다시 그린다. E2E의 SwiftShader에서는
 * 이 프레임이 GPU 프로세스에 밀려 쌓여, 페이지를 닫을 때 브라우저가 수십 초 멈추고 다음 테스트의 context 생성이
 * 시간 초과된다. 그래서 이 도우미는 ticker를 멈춘다. 차트·선택·뷰포트가 바뀌면 에디터가 `app.render()`를 직접 불러
 * canvas가 갱신되지만, hover·고스트·재생 커서처럼 ticker에 맡긴 갱신은 canvas에 그려지지 않는다(DOM 동작은 그대로).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { ChartJsonV3 } from '../../src/shared/chart';

export const EDITOR_TEST_SONG_ID = 'e2e-editor-song';
export const EDITOR_TEST_DIFFICULTY = 'normal';
/** 0.5초 무음 WAV(e2e/global-setup.ts가 없으면 만든다). */
export const EDITOR_TEST_AUDIO_FILE = fileURLToPath(new URL('../fixtures/test-audio.wav', import.meta.url));

const SUPABASE_PATH = /^\/(rest|storage|auth)\/v1\//;
const SONG_DIR = `songs/${EDITOR_TEST_SONG_ID}`;
const PUBLIC_SONG_DIR = `/storage/v1/object/public/assets/${SONG_DIR}`;
const UPLOAD_SONG_DIR = `/storage/v1/object/assets/${SONG_DIR}`;
const AUDIO_PATH = `${SONG_DIR}/audio.wav`;

/** 0박 120 BPM·4/4 이벤트만 있는 v3 차트. 노트를 넘기면 그대로 담는다. */
export function editorTestChart(notes: ChartJsonV3['notes'] = []): ChartJsonV3 {
  return {
    version: 3,
    meta: { title: 'E2E 에디터 곡', artist: 'Offline', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes,
    trillZones: [],
    restZones: [],
    events: [{ type: 'bpm', beat: '0', bpm: 120 }, { type: 'timeSignature', beat: '0', beatPerMeasure: '4' }],
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
  chart?: ChartJsonV3;
  /** true면 곡에 음원(`EDITOR_TEST_AUDIO_FILE`)이 있어 진입할 때 함께 불러온다. */
  audio?: boolean;
}

export async function openEditor(page: Page, options: OpenEditorOptions = {}): Promise<OpenedEditor> {
  const chart = options.chart ?? editorTestChart();
  const audio = options.audio ?? false;
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('에디터 E2E에는 Playwright baseURL이 필요하다');
  const appOrigin = new URL(baseURL).origin;
  const supabaseWrites: SupabaseWrite[] = [];
  const unexpectedSupabaseRequests: string[] = [];

  // 앱 서버 밖으로 나가는 요청만 가로챈다. Supabase는 로컬 응답으로 끝내고, 그 밖(웹폰트 등)은 보내지 않는다.
  await page.route((url) => url.origin !== appOrigin, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (!SUPABASE_PATH.test(path)) { await route.abort(); return; }
    if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    if (method !== 'GET') supabaseWrites.push({ method, path, body: request.postData() });

    if (method === 'GET' && path === `${PUBLIC_SONG_DIR}/${EDITOR_TEST_DIFFICULTY}.json`) {
      await route.fulfill({ json: chart }); return;
    }
    if (method === 'GET' && path === `${PUBLIC_SONG_DIR}/${EDITOR_TEST_DIFFICULTY}.extra.json`) {
      await route.fulfill({ status: 404, json: { error: 'not_found' } }); return;
    }
    if (method === 'GET' && path === '/rest/v1/songs') {
      await route.fulfill({ json: {
        audio_url: audio ? AUDIO_PATH : null,
        duration: null, gameplay_start: null, gameplay_end: null, gameplay_fade_in: null, gameplay_fade_out: null,
      } });
      return;
    }
    if (audio && method === 'GET' && path === `/storage/v1/object/public/assets/${AUDIO_PATH}`) {
      await route.fulfill({ contentType: 'audio/wav', body: readFileSync(EDITOR_TEST_AUDIO_FILE) }); return;
    }
    // Save chart: 차트·보조 레인 JSON 업로드와 charts 행 upsert
    if (method === 'POST' && path.startsWith(`${UPLOAD_SONG_DIR}/`)) {
      await route.fulfill({ json: { Key: path.replace('/storage/v1/object/', '') } }); return;
    }
    if (method === 'POST' && path === '/rest/v1/charts') {
      await route.fulfill({ status: 201, json: [] }); return;
    }
    unexpectedSupabaseRequests.push(`${method} ${path}`);
    await route.fulfill({ status: 500, json: { error: 'Unexpected offline test request' } });
  });

  // pixi.js가 Application 초기화 때 부르는 devtools hook으로 ticker를 멈춘다. hook은 plugin 초기화 도중에
  // 불리므로 microtask로 미뤄 TickerPlugin이 ticker를 켠 뒤에 멈춘다.
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

  await page.goto(`/editor?songId=${EDITOR_TEST_SONG_ID}&difficulty=${EDITOR_TEST_DIFFICULTY}`);
  const timeline = page.locator('canvas').first();
  const accessDenied = page.getByRole('heading', { name: 'Access Denied', exact: true });
  await timeline.or(accessDenied).first().waitFor();
  if (await accessDenied.isVisible()) {
    throw new Error('에디터가 Access Denied를 보였다. 에디터 E2E는 개발 서버의 관리자 우회가 필요하다: .env.local에 VITE_DEV_ADMIN=true');
  }
  await expect.poll(
    () => page.evaluate(() => (globalThis as { __e2ePixiTickerStopped?: boolean }).__e2ePixiTickerStopped === true),
    { message: '타임라인 PIXI ticker를 멈추지 못했다. pixi.js의 __PIXI_APP_INIT__ hook이 바뀌었는지 확인할 것', timeout: 15_000 },
  ).toBe(true);
  if (audio) {
    // 첫 음원을 불러오는 동안에는 화면 전체를 덮는 로딩 표시가 입력을 막는다.
    await expect(page.getByRole('status').filter({ hasText: 'Loading audio...' })).toBeHidden();
  }
  return { supabaseWrites, unexpectedSupabaseRequests };
}

/** Storage 업로드(multipart/form-data) 본문에서 파일 부분을 JSON으로 읽는다. */
export function readUploadedJson(write: SupabaseWrite): unknown {
  const body = write.body ?? '';
  const delimiter = body.slice(0, body.indexOf('\r\n'));
  const filePart = body.split(delimiter).find((part) => part.includes('filename='));
  if (!delimiter || !filePart) throw new Error(`${write.method} ${write.path} 본문에 업로드 파일이 없다`);
  return JSON.parse(filePart.slice(filePart.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''));
}
