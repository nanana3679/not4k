import { test, expect, type Page } from '@playwright/test';
import type { ChartJsonV3, ChartJsonV4, ExtraNotesJson } from '../../src/shared/chart';
import {
  EDITOR_TEST_AUDIO_FILE,
  EDITOR_TEST_CHART_UPLOAD_PATH,
  EDITOR_TEST_EXTRA_UPLOAD_PATH,
  editorTestChart,
  openEditor,
  readUploadedJson,
  type OpenedEditor,
} from './editorTestSetup';

/** Save chart를 누르고 저장이 끝난 뒤 Storage에 업로드된 차트 JSON을 돌려준다. */
async function saveChart(page: Page, editor: OpenedEditor): Promise<ChartJsonV3 | ChartJsonV4> {
  await page.getByRole('button', { name: 'Save chart', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
  const upload = editor.supabaseWrites.find((write) => write.method === 'POST' && write.path === EDITOR_TEST_CHART_UPLOAD_PATH);
  expect(upload, `${EDITOR_TEST_CHART_UPLOAD_PATH} 업로드가 없다`).toBeDefined();
  return readUploadedJson(upload!) as ChartJsonV3 | ChartJsonV4;
}

test.describe('에디터 차트 저장·불러오기와 음원 로드', () => {
  test('곡 행이 있으면 Meta의 Title·Artist는 읽기 전용이고 Offset·난이도는 편집 가능하며 Save chart는 곡 제목을 보존한다', async ({ page }) => {
    const editor = await openEditor(page);
    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.getByRole('button', { name: 'Meta', exact: true }).click();

    for (const name of ['Title', 'Artist']) {
      await expect(page.getByLabel(name, { exact: true })).toHaveJSProperty('readOnly', true);
    }
    await expect(page.getByText('Title and Artist are song-level values. Editing will be available with song save.')).toBeVisible();
    for (const name of ['Offset (ms)', 'Difficulty Label', 'Difficulty Level']) {
      await expect(page.getByLabel(name, { exact: true })).toBeEditable();
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const uploaded = await saveChart(page, editor);
    expect(uploaded.meta).toMatchObject({ title: 'E2E 에디터 곡', artist: 'Offline', offsetMs: 0 });
    expect(editor.supabaseWrites.filter(write => write.path === '/rest/v1/songs')).toEqual([]);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('곡 행 없이 차트 파일을 열면 Meta에서 Title·Artist·Offset 45ms를 바꾸고 다시 열어도 편집값이 남는다', async ({ page }) => {
    const editor = await openEditor(page, { songRow: false });
    const openMeta = async () => {
      await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
      await page.getByRole('button', { name: 'Meta', exact: true }).click();
    };
    await openMeta();
    await expect(page.getByText('Title and Artist are song-level values. Editing will be available with song save.')).toHaveCount(0);
    await page.getByLabel('Title', { exact: true }).fill('새 제목');
    await page.getByLabel('Artist', { exact: true }).fill('새 작곡가');
    await page.getByLabel('Offset (ms)', { exact: true }).fill('45');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await openMeta();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('새 제목');
    await expect(page.getByLabel('Artist', { exact: true })).toHaveValue('새 작곡가');
    await expect(page.getByLabel('Offset (ms)', { exact: true })).toHaveValue('45');
    expect(editor.supabaseWrites).toEqual([]);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('Save chart를 누르면 songs/{songId}/normal.json에 v3 차트 JSON을 업로드하고 Chart saved 토스트를 띄운다', async ({ page }) => {
    const editor = await openEditor(page);

    const uploaded = await saveChart(page, editor);

    expect(uploaded).toMatchObject({ version: 3, meta: { title: 'E2E 에디터 곡', difficultyLabel: 'NORMAL' } });
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('차트 JSON 업로드 응답을 기다리는 동안 Save chart가 Saving chart로 비활성이고 처음부터·커서부터 시작도 저장 중 안내와 함께 비활성이며, 저장이 끝나면 둘 다 다시 활성', async ({ page }) => {
    const editor = await openEditor(page);
    let releaseUpload!: () => void;
    const uploadHeld = new Promise<void>((resolve) => { releaseUpload = resolve; });
    // 차트 JSON 업로드(POST)만 붙잡았다가 openEditor의 공통 응답으로 넘긴다.
    await page.route((url) => url.pathname === EDITOR_TEST_CHART_UPLOAD_PATH, async (route) => {
      if (route.request().method() === 'POST') await uploadHeld;
      await route.fallback();
    });

    await page.getByRole('button', { name: 'Save chart', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saving chart', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Playback options', exact: true }).click();
    const fromStart = page.getByRole('button', { name: '처음부터 시작', exact: true });
    const fromCursor = page.getByRole('button', { name: '커서부터 시작', exact: true });
    await expect(fromStart).toBeDisabled();
    await expect(fromStart).toHaveAttribute('title', '저장 중에는 테스트 플레이를 시작할 수 없습니다');
    await expect(fromCursor).toBeDisabled();

    releaseUpload();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    await expect(fromStart).toBeEnabled();
    await expect(fromCursor).toBeEnabled();
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('보조 레인 수를 2 → 3으로 바꾼 뒤 차트 JSON 업로드가 500으로 실패하면 실패 토스트를 띄우고 Save chart의 저장 안 됨 표시가 남으며 Back to Songs가 Unsaved Changes 확인을 띄운다', async ({ page }) => {
    const editor = await openEditor(page);
    await page.route((url) => url.pathname === EDITOR_TEST_CHART_UPLOAD_PATH, async (route) => {
      if (route.request().method() !== 'POST') { await route.fallback(); return; }
      await route.fulfill({ status: 500, json: { statusCode: '500', error: 'Internal Server Error', message: 'upload failed' } });
    });
    // 노트가 없어도 보조 레인 수가 바뀌면 보조 JSON이 달라 dirty다.
    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.locator('select').filter({ has: page.locator('option[value="10"]') }).selectOption('3');
    await page.mouse.click(10, 100);
    const unsavedSave = page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true });

    await unsavedSave.click();

    await expect(page.getByText('저장에 실패했습니다. 잠시 후 다시 시도해주세요.', { exact: true })).toBeVisible();
    await expect(unsavedSave).toBeEnabled();
    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.getByRole('button', { name: 'Back to Songs', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes', exact: true })).toBeVisible();
    // 업로드가 실패하면 charts 행은 upsert하지 않는다.
    expect(editor.supabaseWrites.filter((write) => write.path === '/rest/v1/charts')).toEqual([]);
  });

  test('Storage 차트에 노트 3개가 있으면 진입 후 Save chart로 업로드한 차트에도 같은 노트 3개가 있다', async ({ page }) => {
    const notes: ChartJsonV3['notes'] = [
      { type: 'single', lane: 1, beat: '0' },
      { type: 'single', lane: 2, beat: '1' },
      { type: 'single', lane: 3, beat: '2' },
    ];
    const editor = await openEditor(page, { chart: editorTestChart(notes) });

    const uploaded = await saveChart(page, editor);

    expect(uploaded.notes).toEqual(notes);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('v3 메인과 version 999 보조 파일을 열면 Error를 보이고 타임라인·Save chart·업로드가 없다', async ({ page }) => {
    const editor = await openEditor(page, {
      chart: editorTestChart([{ type: 'single', lane: 1, beat: '0' }]),
      extra: {
        version: 999,
        extraNotes: [{ type: 'single', extraLane: 1, beat: '1', grace: true }],
        extraLaneCount: 1,
      },
      expectedLoadState: 'error',
    });

    await expect(page.getByRole('heading', { name: 'Error', exact: true })).toBeVisible();
    await expect(page.getByText('차트 파싱 실패: 지원하지 않는 version: 999', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Songs', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toHaveCount(0);
    expect(editor.supabaseWrites).toEqual([]);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('구형 보조 노트의 grace·holdOnly가 true·false이면 로드 후 Save chart의 보조 업로드에도 값을 보존한다', async ({ page }) => {
    const chart = editorTestChart([{ type: 'single', lane: 1, beat: '0' }]);
    const extra: ExtraNotesJson = {
      extraNotes: [
        { type: 'single', extraLane: 1, beat: '0', grace: true },
        { type: 'long', extraLane: 1, beat: '0', endBeat: '2', holdOnly: true },
        { type: 'double', extraLane: 2, beat: '4', grace: false },
        { type: 'doubleLong', extraLane: 2, beat: '4', endBeat: '6', holdOnly: false },
      ],
      extraLaneCount: 2,
    };
    const editor = await openEditor(page, { chart, extra });

    const uploaded = await saveChart(page, editor);

    expect(uploaded.notes).toEqual(chart.notes);
    const extraUpload = editor.supabaseWrites.find((write) => write.method === 'POST' && write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH);
    expect(extraUpload, `${EDITOR_TEST_EXTRA_UPLOAD_PATH} 업로드가 없다`).toBeDefined();
    expect(readUploadedJson(extraUpload!)).toEqual(extra);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('보조 파일이 404이면 v3 메인에 내장된 보조 노트 2개를 열고 Save chart로 별도 파일에 보존한다', async ({ page }) => {
    const embeddedExtra = {
      extraNotes: [
        { type: 'single', extraLane: 2, beat: '0', grace: true },
        { type: 'long', extraLane: 2, beat: '0', endBeat: '2', holdOnly: true },
      ],
      extraLaneCount: 2,
    } satisfies ExtraNotesJson;
    const chart = { ...editorTestChart([{ type: 'double', lane: 3, beat: '4' }]), ...embeddedExtra };
    const editor = await openEditor(page, { chart });

    const uploaded = await saveChart(page, editor);

    expect(uploaded.notes).toEqual(chart.notes);
    const extraUpload = editor.supabaseWrites.find((write) => write.method === 'POST' && write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH);
    expect(extraUpload, `${EDITOR_TEST_EXTRA_UPLOAD_PATH} 업로드가 없다`).toBeDefined();
    expect(readUploadedJson(extraUpload!)).toEqual(embeddedExtra);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('별도 aux 200 응답 본문이 빈 문자열이면 v3 메인 내장 aux로 돌아가지 않고 Error 화면에 손상 안내를 보이며 아무것도 업로드하지 않는다', async ({ page }) => {
    const embedded: ExtraNotesJson = { extraLaneCount: 3, extraNotes: [
      { type: 'double', extraLane: 2, beat: '0', grace: false },
      { type: 'doubleLong', extraLane: 2, beat: '0', endBeat: '2', holdOnly: true },
    ] };
    const editor = await openEditor(page, { chart: { ...editorTestChart(), ...embedded, version: 3 }, extra: '', expectedLoadState: 'error' });
    await expect(page.getByText('보조 파일이 유효한 JSON이 아닙니다')).toBeVisible();
    expect(editor.supabaseWrites).toEqual([]);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('Meta 모달의 Upload Audio로 음원 파일을 고르면 페이지 오류 없이 Replace Audio로 바뀐다', async ({ page }) => {
    await openEditor(page);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.getByRole('button', { name: 'Meta', exact: true }).click();
    const fileInput = page.locator('input[type="file"][accept="audio/*"]');
    await fileInput.setInputFiles(EDITOR_TEST_AUDIO_FILE);

    // 디코딩이 끝나 모달이 음원 버퍼를 받으면 버튼 문구가 바뀐다
    await expect(page.getByText('Replace Audio', { exact: true })).toBeVisible();

    // Filter out WebGL-related warnings that may appear in headless mode
    const realErrors = errors.filter(
      (e) => !e.includes('WebGL') && !e.includes('GPU')
    );
    expect(realErrors).toHaveLength(0);
  });
});
