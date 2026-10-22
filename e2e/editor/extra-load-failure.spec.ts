import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
// 에디터 WebGL(swiftshader) 부팅과 context 준비가 부하에 따라 30초를 넘길 수 있다
test.describe.configure({ timeout: 60_000 });

const songId = 'extra-load-check';
const chart = {
  version: 3,
  meta: { title: 'Extra load check', artist: 'Offline', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes: [], trillZones: [], restZones: [],
  events: [{ type: 'bpm', beat: '0', bpm: 120 }, { type: 'timeSignature', beat: '0', beatPerMeasure: '4' }],
};

type FulfillOptions = NonNullable<Parameters<Route['fulfill']>[0]>;

// 모든 Supabase 요청은 로컬 응답으로 종료한다. 실제 DB/Storage 쓰기는 허용하지 않는다.
async function mockOfflineSupabase(page: Page, baseURL: string, extraResponse: FulfillOptions) {
  const writes: string[] = [];
  const unexpectedApiRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (/^\/(rest|storage|auth)\/v1\//.test(path)) {
      if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
      if (method !== 'GET') writes.push(`${method} ${path}`);
      if (method === 'GET' && path.endsWith(`/songs/${songId}/normal.json`)) {
        await route.fulfill({ json: chart }); return;
      }
      if (method === 'GET' && path.endsWith(`/songs/${songId}/normal.extra.json`)) {
        await route.fulfill(extraResponse); return;
      }
      if (method === 'GET' && path === '/rest/v1/songs') {
        await route.fulfill({ json: { audio_url: null, duration: null, gameplay_start: null, gameplay_end: null } }); return;
      }
      unexpectedApiRequests.push(`${method} ${path}`);
      await route.fulfill({ status: 500, json: { error: 'Unexpected offline test request' } }); return;
    }
    if (url.origin === new URL(baseURL).origin && method === 'GET') {
      await route.continue(); return;
    }
    await route.abort();
  });

  return { writes, unexpectedApiRequests, pageErrors };
}

test('보조 파일 요청이 HTTP 500이면 에디터 대신 Error 화면에 "보조 차트 가져오기 실패: HTTP 500"과 Back to Songs를 보여 주고 쓰기 요청은 0건이다', async ({ page, baseURL }) => {
  const offline = await mockOfflineSupabase(page, baseURL!, { status: 500, json: { error: 'Internal Server Error' } });

  await page.goto(`/editor?songId=${songId}&difficulty=normal`);

  await expect(page.getByRole('heading', { name: 'Error', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('보조 차트 가져오기 실패: HTTP 500', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Songs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More editor actions', exact: true })).toHaveCount(0);
  expect(offline.writes).toEqual([]);
  expect(offline.unexpectedApiRequests).toEqual([]);
  expect(offline.pageErrors).toEqual([]);
});

test('보조 파일 요청에 Supabase가 객체 없음(HTTP 400, NoSuchKey)으로 답하면 에디터가 열리고 쓰기 요청은 0건이다', async ({ page, baseURL }) => {
  const offline = await mockOfflineSupabase(page, baseURL!, {
    status: 400,
    json: { statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' },
  });

  await page.goto(`/editor?songId=${songId}&difficulty=normal`);

  await expect(page.getByRole('button', { name: 'More editor actions', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Error', exact: true })).toHaveCount(0);
  expect(offline.writes).toEqual([]);
  expect(offline.unexpectedApiRequests).toEqual([]);
  expect(offline.pageErrors).toEqual([]);

  // 에디터 WebGL 페이지를 테스트 안에서 내린다 — 부하가 높을 때 context 정리가 다음 테스트 준비를 막지 않도록
  await page.goto('about:blank');
});
