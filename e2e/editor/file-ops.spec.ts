import { test, expect, type Page } from '@playwright/test';
import type { ChartJsonV3 } from '../../src/shared/chart';
import {
  EDITOR_TEST_AUDIO_FILE,
  EDITOR_TEST_SONG_ID,
  editorTestChart,
  openEditor,
  readUploadedJson,
  type OpenedEditor,
} from './editorTestSetup';

const CHART_UPLOAD_PATH = `/storage/v1/object/assets/songs/${EDITOR_TEST_SONG_ID}/normal.json`;

/** Save chart를 누르고 저장이 끝난 뒤 Storage에 업로드된 차트 JSON을 돌려준다. */
async function saveChart(page: Page, editor: OpenedEditor): Promise<ChartJsonV3> {
  await page.getByRole('button', { name: 'Save chart', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
  const upload = editor.supabaseWrites.find((write) => write.method === 'POST' && write.path === CHART_UPLOAD_PATH);
  expect(upload, `${CHART_UPLOAD_PATH} 업로드가 없다`).toBeDefined();
  return readUploadedJson(upload!) as ChartJsonV3;
}

test.describe('에디터 차트 저장·불러오기와 음원 로드', () => {
  test('Save chart를 누르면 songs/{songId}/normal.json에 v3 차트 JSON을 업로드하고 Chart saved 토스트를 띄운다', async ({ page }) => {
    const editor = await openEditor(page);

    const uploaded = await saveChart(page, editor);

    expect(uploaded).toMatchObject({ version: 3, meta: { title: 'E2E 에디터 곡', difficultyLabel: 'NORMAL' } });
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
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
