import { test, expect, type Page } from '@playwright/test';
import { EDITOR_TEST_AUDIO_FILE, EDITOR_TEST_CHART_UPLOAD_PATH, editorTestChart, openEditor, type OpenedEditor } from './editorTestSetup';

const timing = { bpmChanges: [{ beat: '0', bpm: 120 }],
  timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 0 };
const save = (page: Page) => page.getByRole('button', { name: 'Save, unsaved changes', exact: true });
const meta = (page: Page) => page.getByRole('heading', { name: 'Chart Metadata', exact: true }).locator('..');
async function openMeta(page: Page) {
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Meta', exact: true }).click();
}
async function editSongAndChart(page: Page) {
  await openMeta(page);
  await page.getByLabel('Title', { exact: true }).fill('저장할 곡');
  await page.getByLabel('Offset (ms)', { exact: true }).fill('45');
  await page.getByLabel('Difficulty Level', { exact: true }).fill('6');
  await meta(page).getByRole('button', { name: 'Save', exact: true }).click();
}
async function startSave(page: Page, action: 'Save' | 'Save As') {
  if (action === 'Save') { await save(page).click(); return; }
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Save As', exact: true }).click();
  await page.getByLabel('Target Difficulty').selectOption('LIFTOFF');
  await page.getByRole('heading', { name: 'Save As (다른 이름으로 저장)', exact: true }).locator('..')
    .getByRole('button', { name: 'Save', exact: true }).click();
}
function expectSongBeforeChart(editor: OpenedEditor, path = EDITOR_TEST_CHART_UPLOAD_PATH) {
  const rpcIndex = editor.supabaseWrites.findIndex(write => write.path === '/rest/v1/rpc/save_song');
  const chartIndex = editor.supabaseWrites.findIndex(write => write.path === path);
  expect(rpcIndex).toBeGreaterThanOrEqual(0);
  expect(chartIndex).toBeGreaterThan(rpcIndex);
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
}

test('음원 저장 중 Meta를 열어 완료 뒤 제목만 적용하면 다음 Save가 업로드 경로를 유지하고 미디어를 다시 올리지 않는다', async ({ page }) => {
  const editor = await openEditor(page, { songTiming: timing });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let blocked = false;
  await page.route('**/rest/v1/rpc/save_song', async route => {
    if (!blocked) { blocked = true; await pending; }
    await route.fallback();
  });
  await openMeta(page);
  await page.locator('input[type="file"][accept="audio/*"]').setInputFiles(EDITOR_TEST_AUDIO_FILE);
  await expect(page.getByText('Replace Audio', { exact: true })).toBeVisible();
  await meta(page).getByRole('button', { name: 'Save', exact: true }).click();
  await save(page).click();
  await expect.poll(() => blocked).toBe(true);
  await openMeta(page);
  await page.getByLabel('Title', { exact: true }).fill('저장 뒤 제목');
  release();
  await expect(page.getByText('Song saved', { exact: true })).toBeVisible();
  const first = JSON.parse(editor.supabaseWrites.find(write => write.path === '/rest/v1/rpc/save_song')!.body!);
  await meta(page).getByRole('button', { name: 'Save', exact: true }).click();
  await save(page).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  const requests = editor.supabaseWrites.filter(write => write.path === '/rest/v1/rpc/save_song');
  expect(requests).toHaveLength(2);
  expect(JSON.parse(requests[1].body!)).toMatchObject({
    p_title: '저장 뒤 제목', p_audio_url: first.p_audio_url, p_preview_url: first.p_preview_url,
  });
  expect(editor.supabaseWrites.filter(write => /\/storage\/v1\/object\/assets\/.*\/(audio|preview)-/.test(write.path))).toHaveLength(2);
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test('timing NULL에서 Title·Offset 45ms·자켓·음원을 바꿔 Save하면 이행 확인 1회 뒤 새 경로 3개와 곡만 저장한다', async ({ page }) => {
  const editor = await openEditor(page);
  await openMeta(page);
  await page.getByLabel('Title', { exact: true }).fill('저장할 곡');
  await page.getByLabel('Offset (ms)', { exact: true }).fill('45');
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'new.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.locator('input[type="file"][accept="audio/*"]').setInputFiles(EDITOR_TEST_AUDIO_FILE);
  await expect(page.getByText('Replace Audio', { exact: true })).toBeVisible();
  await meta(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(save(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Save song/i })).toHaveCount(0);
  expect(editor.supabaseWrites).toEqual([]);
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  await save(page).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain('이 곡의 다른 차트도 이 타이밍을 따릅니다');
  const rpc = editor.supabaseWrites.find(write => write.path === '/rest/v1/rpc/save_song')!;
  const values = JSON.parse(rpc.body!);
  expect(values).toMatchObject({ p_expected_revision: 1, p_title: '저장할 곡', p_duration: 0.5,
    p_timing: { offsetMs: 45, bpmChanges: [{ beat: '0', bpm: 120 }] } });
  for (const key of ['p_jacket_url', 'p_audio_url', 'p_preview_url']) {
    expect(values[key]).toMatch(/^songs\/e2e-editor-song\/(jacket|audio|preview)-[a-f0-9-]+\./);
    const uploadIndex = editor.supabaseWrites.findIndex(write => write.path === `/storage/v1/object/assets/${values[key]}`);
    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeLessThan(editor.supabaseWrites.indexOf(rpc));
  }
  expect(editor.supabaseWrites.some(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH)).toBe(false);
  expect(editor.supabaseWrites.some(write => write.path === '/rest/v1/songs')).toBe(false);
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

for (const action of ['Save', 'Save As'] as const) {
  test(`Offset 0→45·Lv.5→6을 ${action}하면 다른 차트 2개 확인 1회 뒤 곡 → 차트 순서로 저장한다`, async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing,
      otherCharts: { hard: editorTestChart(), breakthrough: editorTestChart() } });
    await editSongAndChart(page);
    const dialogs: string[] = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    await startSave(page, action);
    await expect(page.getByText(action === 'Save' ? 'Chart saved' : 'Chart saved as LIFTOFF Lv.6', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    expect(dialogs).toHaveLength(1); expect(dialogs[0]).toContain('다른 차트 2개');
    expectSongBeforeChart(editor, action === 'Save' ? EDITOR_TEST_CHART_UPLOAD_PATH : EDITOR_TEST_CHART_UPLOAD_PATH.replace('/normal.json', '/liftoff.json'));
    if (action === 'Save As') await expect(page).toHaveURL(/difficulty=liftoff$/);
  });

  test(`Offset 0→45·Lv.5→6 변경의 ${action} 확인을 취소하면 RPC·업로드 0회이고 미저장 표시와 이탈 확인이 남는다`, async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing, otherCharts: { hard: editorTestChart() } });
    await editSongAndChart(page);
    const dialogs: string[] = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await startSave(page, action);
    // Save As는 대상 난이도 조회 동안 툴바 Save가 아직 활성이다. 확인 도착을 먼저 기다린다.
    await expect.poll(() => dialogs).toHaveLength(1);
    await expect(save(page)).toBeEnabled();
    expect(dialogs).toHaveLength(1); expect(dialogs[0]).toContain('다른 차트 1개');
    expect(editor.supabaseWrites).toEqual([]);
    if (action === 'Save As') await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openMeta(page);
    await expect(page.getByLabel('Offset (ms)', { exact: true })).toHaveValue('45');
    await expect(page.getByLabel('Difficulty Level', { exact: true })).toHaveValue('6');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.getByRole('button', { name: 'Back to Songs', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes', exact: true })).toBeVisible();
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });
}

for (const [action, code, message] of [['Save', 'PT409', '다른 곳에서 곡을 변경했습니다'], ['Save As', '42501', '관리자 권한이 없습니다']] as const) {
  test(`${action} 곡 저장이 ${code}로 거부되면 차트 업로드 0회이고 미저장 변경을 유지한다`, async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing, songSaveError: code });
    await editSongAndChart(page);
    page.on('dialog', dialog => dialog.accept());
    await startSave(page, action);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(save(page)).toBeEnabled();
    expect(editor.supabaseWrites.map(write => write.path)).toEqual(['/rest/v1/rpc/save_song']);
    await expect(page).toHaveURL(/difficulty=normal$/);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });
}

test('timing NULL에서 제목을 바꾼 Save의 이행 확인에 BPM 180인 hard가 보이고 취소하면 쓰기 0회다', async ({ page }) => {
  const hard = editorTestChart(); hard.events[0] = { type: 'bpm', beat: '0', bpm: 180 };
  const editor = await openEditor(page, { otherCharts: { hard } });
  await openMeta(page);
  await page.getByLabel('Title', { exact: true }).fill('새 제목');
  await meta(page).getByRole('button', { name: 'Save', exact: true }).click();
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await save(page).click();
  await expect(save(page)).toBeEnabled();
  expect(dialogs).toHaveLength(1); expect(dialogs[0]).toContain('타이밍이 다른 차트: hard');
  expect(editor.supabaseWrites).toEqual([]); expect(editor.unexpectedSupabaseRequests).toEqual([]);
});
