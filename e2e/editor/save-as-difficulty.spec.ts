import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

test('NORMAL의 Save As는 INFILTRATION을 제외하고 LIFTOFF 덮어쓰기 확인 후 기존 easy 키를 유지한다', async ({ page, baseURL }) => {
  const songId = 'save-as-alias-check';
  const chart = {
    version: 3,
    meta: { title: 'Save As alias check', artist: 'Offline', difficultyLabel: 'NORMAL', difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes: [], trillZones: [], restZones: [],
    events: [{ type: 'bpm', beat: '0', bpm: 120 }, { type: 'timeSignature', beat: '0', beatPerMeasure: '4' }],
  };
  const writes: { method: string; path: string; body: string }[] = [];
  const unexpectedApiRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  // 모든 Supabase 요청은 로컬 응답으로 종료한다. 실제 DB/Storage 쓰기는 허용하지 않는다.
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (/^\/(rest|storage|auth)\/v1\//.test(path)) {
      if (method === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
      if (method !== 'GET') writes.push({ method, path, body: request.postData() ?? '' });
      if (method === 'GET' && path.endsWith(`/songs/${songId}/normal.json`)) {
        await route.fulfill({ json: chart }); return;
      }
      if (method === 'GET' && path.endsWith(`/songs/${songId}/normal.extra.json`)) {
        await route.fulfill({ status: 404, json: { error: 'No extra chart' } }); return;
      }
      if (method === 'GET' && path === '/rest/v1/songs') {
        await route.fulfill({ json: { audio_url: null, duration: null, gameplay_start: null, gameplay_end: null } }); return;
      }
      if (method === 'GET' && path === '/rest/v1/charts') {
        await route.fulfill({ json: [{ difficulty_label: 'normal' }, { difficulty_label: 'easy' }] }); return;
      }
      if (method === 'POST' && [
        `/storage/v1/object/assets/songs/${songId}/easy.json`,
        `/storage/v1/object/assets/songs/${songId}/easy.extra.json`,
      ].includes(path)) {
        await route.fulfill({ json: { Key: path.replace('/storage/v1/object/', '') } }); return;
      }
      if (method === 'POST' && path === '/rest/v1/charts') {
        await route.fulfill({ status: 201, json: [] }); return;
      }
      unexpectedApiRequests.push(`${method} ${path}`);
      await route.fulfill({ status: 500, json: { error: 'Unexpected offline test request' } }); return;
    }
    if (url.origin === new URL(baseURL!).origin && method === 'GET') {
      await route.continue(); return;
    }
    await route.abort();
  });

  await page.goto(`/editor?songId=${songId}&difficulty=normal`);
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Save As', exact: true }).click();
  const target = page.getByLabel('Target Difficulty');
  await expect(target.locator('option')).toHaveText(['LIFTOFF', 'INFILTRATION (current)', 'BREAKTHROUGH']);
  await expect(target.locator('option[value="INFILTRATION"]')).toHaveJSProperty('disabled', true);
  await target.selectOption('LIFTOFF');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overwrite Existing Chart', exact: true })).toBeVisible();
  await expect(page.getByText('LIFTOFF 난이도에 이미 차트가 존재합니다.')).toBeVisible();
  expect(writes).toEqual([]);

  await page.getByRole('button', { name: 'Overwrite', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`songId=${songId}&difficulty=easy$`));
  expect(writes.map(write => `${write.method} ${write.path}`).sort()).toEqual([
    'POST /rest/v1/charts',
    `POST /storage/v1/object/assets/songs/${songId}/easy.extra.json`,
    `POST /storage/v1/object/assets/songs/${songId}/easy.json`,
  ]);
  expect(JSON.parse(writes.find(write => write.path === '/rest/v1/charts')!.body)).toMatchObject({
    song_id: songId, difficulty_label: 'easy', difficulty_level: 5,
  });
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Save As', exact: true }).click();
  await expect(target.locator('option[value="LIFTOFF"]')).toHaveJSProperty('disabled', true);
  await expect(target).toHaveValue('INFILTRATION');
  expect(unexpectedApiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
