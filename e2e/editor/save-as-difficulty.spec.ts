import { test, expect } from '@playwright/test';
import { EDITOR_TEST_SONG_ID, EDITOR_TEST_CHART_REVISION, editorTestChartId, editorTestChart, isChartUploadPath, isExtraUploadPath, openEditor } from './editorTestSetup';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

test('NORMAL의 Save As는 INFILTRATION을 제외하고 LIFTOFF 덮어쓰기 확인 후 기존 easy 행(UUID·리비전 3)에 save_chart로 저장한다', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  const editor = await openEditor(page, {
    otherCharts: { easy: editorTestChart() },
    songTiming: { bpmChanges: [{ beat: '0', bpm: 120 }],
      timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 0 },
  });
  const writes = editor.supabaseWrites;
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Save As', exact: true }).click();
  const target = page.getByLabel('Target Difficulty');
  await expect(target.locator('option')).toHaveText(['LIFTOFF', 'INFILTRATION (current)', 'BREAKTHROUGH']);
  await expect(target.locator('option[value="INFILTRATION"]')).toHaveJSProperty('disabled', true);
  await target.selectOption('LIFTOFF');
  await page.getByRole('heading', { name: 'Save As (다른 이름으로 저장)', exact: true }).locator('..').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overwrite Existing Chart', exact: true })).toBeVisible();
  await expect(page.getByText('LIFTOFF 난이도에 이미 차트가 존재합니다.')).toBeVisible();
  expect(writes).toEqual([]);

  await page.getByRole('button', { name: 'Overwrite', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`songId=${EDITOR_TEST_SONG_ID}&difficulty=easy$`));
  // 새 경로 두 곳에 올린 뒤 덮어쓰기 대상 행을 save_chart로 확정한다. create_chart·결정적 경로 덮어쓰기는 없다.
  await expect.poll(() => writes.length).toBe(3);
  expect(writes.slice(0, 2).every(write => write.method === 'POST' && (isChartUploadPath(write.path, 'easy') || isExtraUploadPath(write.path, 'easy')))).toBe(true);
  expect(writes[2].path).toBe('/rest/v1/rpc/save_chart');
  expect(JSON.parse(writes[2].body!)).toMatchObject({ p_chart_id: editorTestChartId('easy'), p_expected_revision: EDITOR_TEST_CHART_REVISION, p_difficulty_level: 5 });
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Save As', exact: true }).click();
  await expect(target.locator('option[value="LIFTOFF"]')).toHaveJSProperty('disabled', true);
  await expect(target).toHaveValue('INFILTRATION');
  expect(dialogs).toEqual([]);
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
