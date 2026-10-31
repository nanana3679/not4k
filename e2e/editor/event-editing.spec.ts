import { test, expect } from '@playwright/test';
import { canvasPosition } from './explicitEditorTestHelpers';
import {
  EDITOR_TEST_CHART_UPLOAD_PATH,
  editorTestChart,
  openEditor,
  readUploadedJson,
} from './editorTestSetup';

test.setTimeout(60_000);

function eventChart() {
  const chart = editorTestChart();
  chart.events = [
    { type: 'bpm', beat: '0', bpm: 120, editorLane: 1 },
    { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 },
    { type: 'bpm', beat: '4', bpm: 180, editorLane: 1 },
  ];
  return chart;
}

test.describe('BPM·박자 변경 이벤트 편집', () => {
  for (const { label, column } of [
    { label: 'BPM Change', column: 5 },
    { label: 'Time Signature Change', column: 6 },
  ]) {
    test(`0박 ${label} 이벤트를 더블클릭하면 변경 이벤트 제목과 초기 설정 삭제 보호를 표시한다`, async ({ page }) => {
      await openEditor(page, { chart: eventChart() });
      // 첫째·둘째 보조 칸은 화면에서 통합 레인 5·6과 같은 위치다.
      const position = await canvasPosition(page, column, 0);
      await page.mouse.dblclick(position.x, position.y);

      await expect(page.getByRole('heading', { name: `Edit ${label} Event`, exact: true })).toBeVisible();
      const deleteButton = page.getByTitle('Cannot delete initial event', { exact: true });
      await expect(deleteButton).toBeDisabled();
      await expect(deleteButton).toHaveAttribute('title', 'Cannot delete initial event');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('heading', { name: `Edit ${label} Event`, exact: true })).toHaveCount(0);
    });
  }

  test('4박 BPM 180 이벤트를 150으로 편집해 저장하면 JSON type bpm을 유지하고 재편집·삭제할 수 있다', async ({ page }) => {
    const editor = await openEditor(page, { chart: eventChart() });
    const position = await canvasPosition(page, 5, 4);
    await page.mouse.dblclick(position.x, position.y);

    await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toBeVisible();
    await page.getByLabel('BPM', { exact: true }).fill('150');
    await expect(page.getByTitle('Delete event', { exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true }).click();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();

    const upload = editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH);
    expect(upload).toBeDefined();
    expect(readUploadedJson(upload!)).toMatchObject({
      events: [
        { type: 'bpm', beat: '0', bpm: 120 },
        { type: 'timeSignature', beat: '0', beatPerMeasure: '4' },
        { type: 'bpm', beat: '4', bpm: 150 },
      ],
    });

    // BPM을 바꾸면 전체 타임라인 높이가 달라질 수 있으므로 현재 투영으로 다시 찾는다.
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const projectedPosition = await canvasPosition(page, 5, 4);
    await canvas.dispatchEvent('wheel', { deltaY: projectedPosition.y - (box.y + box.height / 2) });
    const updatedPosition = await canvasPosition(page, 5, 4);
    await page.mouse.dblclick(updatedPosition.x, updatedPosition.y);
    await expect(page.getByLabel('BPM', { exact: true })).toHaveValue('150');
    await page.getByTitle('Delete event', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      return (await import(path)).useEditorStore.getState().chart.events.length;
    })).toBe(2);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });
});
