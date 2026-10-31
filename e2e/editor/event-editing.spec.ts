import { test, expect, type Page } from '@playwright/test';
import type { ChartJsonV3, ExtraNotesJson } from '../../src/shared/chart';
import { canvasPosition } from './explicitEditorTestHelpers';
import {
  EDITOR_TEST_CHART_UPLOAD_PATH,
  EDITOR_TEST_EXTRA_UPLOAD_PATH,
  editorTestChart,
  openEditor,
  readUploadedJson,
} from './editorTestSetup';

test.setTimeout(60_000);

/** 0박 BPM·박자가 모두 editorLane 없이 기본 보조 레인1에 겹친 차트. */
function chartWithoutEditorLanes() {
  const chart = editorTestChart();
  chart.events = chart.events.map(({ editorLane: _editorLane, ...event }) => event);
  return chart;
}

async function eventLanes(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    return (await import(path)).useEditorStore.getState().chart.events.map((event: { editorLane?: number }) => event.editorLane);
  });
}

/** 0박의 통합 레인 위치를 더블클릭한다. 음원을 불러온 뒤 0박이 canvas 밖이면 먼저 그 위치로 스크롤한다. */
async function dblclickInitialEvent(page: Page, column: number) {
  let position = await canvasPosition(page, column, 0);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  if (position.y < box.y || position.y > box.y + box.height) {
    await canvas.dispatchEvent('wheel', { deltaY: position.y - (box.y + box.height / 2) });
    position = await canvasPosition(page, column, 0);
  }
  await page.mouse.dblclick(position.x, position.y);
}

/**
 * 위반 차트를 열 때 경고 알림과 함께 남는 콘솔 오류를 모은다. 알림은 몇 초 뒤 사라져, 음원까지 불러온 뒤의
 * DOM 확인으로는 놓칠 수 있다.
 */
function recordLoadViolationLogs(page: Page): string[] {
  const logs: string[] = [];
  page.on('console', message => {
    if (message.text().includes('로드된 차트에 배치 제약 위반')) logs.push(message.text());
  });
  return logs;
}

/** 불러온 기본 상태: 위반 표시·미저장 표시·Undo가 없다. */
async function expectCleanLoadBaseline(page: Page) {
  await expect(page.getByRole('button', { name: /배치 제약 위반.*목록 열기/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
}

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
      await page.getByRole('button', { name: 'Select', exact: true }).click();
      // 첫째·둘째 보조 칸은 화면에서 통합 레인 5·6과 같은 위치다.
      const position = await canvasPosition(page, column, 0);
      await page.mouse.click(position.x, position.y);
      await expect.poll(() => page.evaluate(async () => {
        const path = '/src/editor/stores/editorStore.ts';
        return [...(await import(path)).useEditorStore.getState().selection.events];
      })).toEqual([]);
      await page.mouse.dblclick(position.x, position.y);

      await expect(page.getByRole('heading', { name: `Edit ${label} Event`, exact: true })).toBeVisible();
      const deleteButton = page.getByTitle('Cannot delete initial event', { exact: true });
      await expect(deleteButton).toBeDisabled();
      await expect(deleteButton).toHaveAttribute('title', 'Cannot delete initial event');
      const editorLane = page.getByRole('combobox', { name: 'Editor lane', exact: true });
      await expect(editorLane).toHaveValue(String(column - 4));
      await editorLane.selectOption(column === 5 ? '2' : '1');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('heading', { name: `Edit ${label} Event`, exact: true })).toHaveCount(0);
      await expect.poll(() => page.evaluate(async () => {
        const path = '/src/editor/stores/editorStore.ts';
        return (await import(path)).useEditorStore.getState().chart.events.map((event: { editorLane?: number }) => event.editorLane);
      })).toEqual([1, 2, 1]);
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

  test('editorLane 없는 0박 BPM·박자 겹침은 열 때 박자를 보조 레인2로 분리해 깨끗한 기본 상태로 열고 저장할 때만 반영한다', async ({ page }) => {
    const loadViolationLogs = recordLoadViolationLogs(page);
    const editor = await openEditor(page, { chart: chartWithoutEditorLanes(), audio: true });
    await expectCleanLoadBaseline(page);
    expect(loadViolationLogs).toEqual([]);
    expect(editor.supabaseWrites).toEqual([]);
    expect(await eventLanes(page)).toEqual([undefined, 2]);
    // 박자는 둘째 보조 칸(통합 레인 6 위치)에 있어 더블클릭하면 보조 레인2로 표시된다.
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await dblclickInitialEvent(page, 6);
    await expect(page.getByRole('heading', { name: 'Edit Time Signature Change Event', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Editor lane', exact: true })).toHaveValue('2');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(editor.supabaseWrites).toEqual([]);

    await page.getByRole('button', { name: 'Save chart', exact: true }).click();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    const upload = editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH);
    expect(upload).toBeDefined();
    const saved = readUploadedJson(upload!) as ChartJsonV3;
    expect(saved.events).toEqual([
      { type: 'bpm', beat: '0', bpm: 120 },
      { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 },
    ]);
    const savedExtra = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH)!);

    // 저장한 배치를 다시 열면 옮길 것이 없어 그대로 깨끗하고 아무것도 쓰지 않는다.
    const reopened = await openEditor(page, { chart: saved, extra: savedExtra as ExtraNotesJson, audio: true });
    await expectCleanLoadBaseline(page);
    expect(loadViolationLogs).toEqual([]);
    expect(await eventLanes(page)).toEqual([undefined, 2]);
    expect(reopened.supabaseWrites).toEqual([]);
    expect([...editor.unexpectedSupabaseRequests, ...reopened.unexpectedSupabaseRequests]).toEqual([]);
  });

  test('열 때 분리된 초기 박자를 모달에서 보조 레인1로 옮기면 위반·미저장·Undo가 생기고 Undo·Redo와 모달 수리로 오간다', async ({ page }) => {
    const editor = await openEditor(page, { chart: chartWithoutEditorLanes(), audio: true });
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await dblclickInitialEvent(page, 6);
    await expect(page.getByRole('heading', { name: 'Edit Time Signature Change Event', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Editor lane', exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      return [...(await import(path)).useEditorStore.getState().selection.events];
    })).toEqual([]);

    await page.keyboard.press('Control+z');
    await expectCleanLoadBaseline(page);
    await page.keyboard.press('Control+y');
    await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true })).toBeVisible();

    // 같은 보조 레인1에 겹치면 뒤쪽 항목인 박자가 더블클릭에 잡힌다. 보조 레인2로 돌리면 기본 상태와 같아진다.
    await dblclickInitialEvent(page, 5);
    await expect(page.getByRole('heading', { name: 'Edit Time Signature Change Event', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Editor lane', exact: true })).toHaveValue('1');
    await page.getByRole('combobox', { name: 'Editor lane', exact: true }).selectOption('2');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: /배치 제약 위반.*목록 열기/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
    expect(await eventLanes(page)).toEqual([undefined, 2]);
    expect(editor.supabaseWrites).toEqual([]);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('보조 레인1·2의 text·auto [0,4)와 겹친 초기 BPM·박자는 열 때 레인3·4로 옮기고 보조 레인 수 2 → 4를 기본으로 저장한다', async ({ page }) => {
    const chart = editorTestChart();
    chart.events = [...chart.events,
      { type: 'text', beat: '0', endBeat: '4', text: 'hello', editorLane: 1 },
      { type: 'auto', beat: '0', endBeat: '4', editorLane: 2 },
    ];
    const loadViolationLogs = recordLoadViolationLogs(page);
    const editor = await openEditor(page, { chart, audio: true });
    await expectCleanLoadBaseline(page);
    expect(loadViolationLogs).toEqual([]);
    expect(await eventLanes(page)).toEqual([3, 4, 1, 2]);
    expect(await page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      return (await import(path)).useEditorStore.getState().extraLaneCount;
    })).toBe(4);
    expect(editor.supabaseWrites).toEqual([]);

    await page.getByRole('button', { name: 'Save chart', exact: true }).click();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    expect(readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH)!)).toMatchObject({ events: [
      { type: 'bpm', beat: '0', bpm: 120, editorLane: 3 },
      { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 4 },
      { type: 'text', editorLane: 1 },
      { type: 'auto', editorLane: 2 },
    ] });
    expect(readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH)!))
      .toMatchObject({ extraLaneCount: 4 });
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });
});
