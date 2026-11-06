import { test, expect, type Page } from '@playwright/test';
import type { ChartJsonV3 } from '../../src/shared/chart';
import { timingColumnPosition } from './explicitEditorTestHelpers';
import { isChartUploadPath, openEditor, readUploadedJson } from './editorTestSetup';

test.setTimeout(60_000);

async function storeChart(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const { chart } = (await import(path)).useEditorStore.getState();
    return { noteCount: chart.notes.length as number,
      events: chart.events.map((event: { type: string; bpm?: number; beat: { n: number; d: number } }) =>
        ({ type: event.type, bpm: event.bpm, beat: event.beat.n / event.beat.d })) };
  });
}

test('Create 모드 Single 도구로 bpm 열 4박을 클릭하면 노트 없이 BPM 120이 생기고 저장 파일의 BPM에 editorLane이 없다', async ({ page }) => {
  const editor = await openEditor(page);
  await expect(page.locator('select').filter({ has: page.locator('option[value="single"]') })).toHaveValue('single');

  const column = await timingColumnPosition(page, 'bpm', 4);
  await page.mouse.click(column.x, column.y);

  await expect.poll(() => storeChart(page)).toEqual({ noteCount: 0, events: [
    { type: 'bpm', bpm: 120, beat: 0 },
    { type: 'timeSignature', beat: 0 },
    { type: 'bpm', bpm: 120, beat: 4 },
  ] });

  // timing NULL 곡의 이행을 거절하면 곡 저장 없이 차트 파일만 저장해 파일 내용을 볼 수 있다.
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Save, unsaved changes', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();

  const uploaded = readUploadedJson(editor.supabaseWrites.find(write => isChartUploadPath(write.path))!) as ChartJsonV3;
  expect(uploaded.events.map(event => event.type)).toEqual(['bpm', 'timeSignature', 'bpm']);
  expect(uploaded.events[2]).toMatchObject({ type: 'bpm', bpm: 120 });
  for (const event of uploaded.events) expect(event).not.toHaveProperty('editorLane');
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});
