import { expect, test } from '@playwright/test';
import { canvasPosition } from './explicitEditorTestHelpers';
import { editorTestChart, openEditor } from './editorTestSetup';

test.setTimeout(60_000);

test('같은 레인으로 옮긴 text·auto는 배치 위반으로 저장·테스트를 막고 레인을 나누면 저장된다', async ({ page }) => {
  const chart = { ...editorTestChart(), version: 4 as const, notes: [
    { type: 'tap' as const, kind: 'single' as const, lane: 1, beat: '2' },
  ] };
  chart.events = [...chart.events,
    { type: 'text', beat: '2', endBeat: '4', text: 'text', editorLane: 1 },
    { type: 'auto', beat: '2', endBeat: '4', editorLane: 2 },
  ];
  const editor = await openEditor(page, { chart, audio: true });
  await expect(page.getByRole('button', { name: /배치 제약 위반.*목록 열기/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const event = await canvasPosition(page, 6, 3);
  await page.mouse.click(event.x, event.y);
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    return [...(await import(path)).useEditorStore.getState().selection.events];
  })).toEqual([3]);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Playback options', exact: true }).click();
  await expect(page.getByRole('button', { name: '처음부터 시작 · 명시 차트', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '커서부터 시작', exact: true })).toBeDisabled();
  await page.mouse.click(10, 100);
  await page.getByRole('button', { name: 'Save, unsaved changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: '배치 제약 조건 위반', exact: true })).toBeVisible();
  await expect(page.getByText('[eventOverlap]', { exact: true })).toBeVisible();
  expect(editor.supabaseWrites).toEqual([]);
  await page.getByRole('button', { name: '닫기', exact: true }).click();

  // 위반 상태를 선택 해제해도 진단은 남으며, 겹친 몸통의 뒤쪽 auto를 골라 수리한다.
  const empty = await canvasPosition(page, 3, 2);
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();
  const overlap = await canvasPosition(page, 5, 3);
  await page.mouse.click(overlap.x, overlap.y);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /배치 제약 위반.*목록 열기/ })).toHaveCount(0);
  // 원래 레인으로 돌려 원본과 같아졌으므로 dirty 표시도 사라진다.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});
