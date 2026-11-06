import { test, expect, type Page } from '@playwright/test';
import type { ChartJsonV3, ExtraNotesJson } from '../../src/shared/chart';
import { canvasPosition, timingColumnPosition } from './explicitEditorTestHelpers';
import {
  isChartUploadPath,
  isExtraUploadPath,
  editorTestChart,
  openEditor,
  readUploadedJson,
} from './editorTestSetup';

test.setTimeout(60_000);

async function eventLanes(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    return (await import(path)).useEditorStore.getState().chart.events.map((event: { editorLane?: number }) => event.editorLane);
  });
}

async function extraLaneCount(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    return (await import(path)).useEditorStore.getState().extraLaneCount as number;
  });
}

/** `at`박에 있는 이벤트 몸통을 같은 박의 다른 통합 레인으로 끈다. */
async function dragEventBodyToColumn(page: Page, fromColumn: number, toColumn: number, at: number) {
  const from = await canvasPosition(page, fromColumn, at);
  const to = await canvasPosition(page, toColumn, at);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
}

/** 0박의 곡 공통 열을 더블클릭한다. 음원을 불러온 뒤 0박이 canvas 밖이면 먼저 그 위치로 스크롤한다. */
async function dblclickInitialEvent(page: Page, column: 'bpm' | 'timeSignature') {
  let position = await timingColumnPosition(page, column, 0);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  if (position.y < box.y || position.y > box.y + box.height) {
    await canvas.dispatchEvent('wheel', { deltaY: position.y - (box.y + box.height / 2) });
    position = await timingColumnPosition(page, column, 0);
  }
  await page.mouse.dblclick(position.x, position.y);
}

/** 불러온 기본 상태: 위반 표시·미저장 표시·Undo가 없다. */
async function expectCleanLoadBaseline(page: Page) {
  await expect(page.getByRole('button', { name: /배치 제약 위반.*목록 열기/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
}

function eventChart() {
  const chart = editorTestChart();
  chart.events = [
    { type: 'bpm', beat: '0', bpm: 120 },
    { type: 'timeSignature', beat: '0', beatPerMeasure: '4' },
    { type: 'bpm', beat: '4', bpm: 180 },
  ];
  return chart;
}

test.describe('BPM·박자 변경 이벤트 편집', () => {
  for (const { label, column } of [
    { label: 'BPM Change', column: 'bpm' as const },
    { label: 'Time Signature Change', column: 'timeSignature' as const },
  ]) {
    test(`0박 ${label} 이벤트를 더블클릭하면 변경 이벤트 제목과 초기 설정 삭제 보호를 표시하고 Editor lane 선택은 없다`, async ({ page }) => {
      await openEditor(page, { chart: eventChart() });
      await page.getByRole('button', { name: 'Select', exact: true }).click();
      const position = await timingColumnPosition(page, column, 0);
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
      // 초기 BPM·박자는 전용 열에 있어 값만 편집한다(RFD 0082).
      await expect(page.getByRole('combobox', { name: 'Editor lane', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('heading', { name: `Edit ${label} Event`, exact: true })).toHaveCount(0);
      expect(await eventLanes(page)).toEqual([undefined, undefined, undefined]);
    });
  }

  test('4박 BPM 180을 150으로 바꿔 Save하면 이행 확인 뒤 곡 타이밍만 저장하고 재편집·삭제할 수 있다', async ({ page }) => {
    const editor = await openEditor(page, { chart: eventChart() });
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const position = await timingColumnPosition(page, 'bpm', 4);
    await page.mouse.dblclick(position.x, position.y);

    await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toBeVisible();
    await page.getByLabel('BPM', { exact: true }).fill('150');
    await expect(page.getByTitle('Delete event', { exact: true })).toBeEnabled();
    await page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true }).locator('..').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save, unsaved changes', exact: true })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Save, unsaved changes', exact: true }).click();
    await expect(page.getByText('Song saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    const rpc = editor.supabaseWrites.find(write => write.path === '/rest/v1/rpc/save_song')!;
    expect(JSON.parse(rpc.body!).p_timing.bpmChanges).toEqual([
      { beat: '0', bpm: 120 }, { beat: '4', bpm: 150 },
    ]);
    expect(editor.supabaseWrites.some(write => isChartUploadPath(write.path))).toBe(false);

    // BPM을 바꾸면 전체 타임라인 높이가 달라질 수 있으므로 현재 투영으로 다시 찾는다.
    const canvas = page.locator('canvas');
    const box = (await canvas.boundingBox())!;
    const projectedPosition = await timingColumnPosition(page, 'bpm', 4);
    await canvas.dispatchEvent('wheel', { deltaY: projectedPosition.y - (box.y + box.height / 2) });
    const updatedPosition = await timingColumnPosition(page, 'bpm', 4);
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

  test('timing NULL의 4～6박 text를 보조 레인 1→2로 옮긴 뒤 Save 이행을 취소하면 차트만 저장한다', async ({ page }) => {
    const chart = editorTestChart();
    chart.events = [...chart.events, { type: 'text', beat: '4', endBeat: '6', text: 'hello', editorLane: 1 }];
    const editor = await openEditor(page, { chart });
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await dragEventBodyToColumn(page, 5, 6, 5);
    await expect.poll(() => eventLanes(page)).toEqual([undefined, undefined, 2]);
    await expect(page.getByRole('button', { name: 'Save, unsaved changes', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.getByRole('button', { name: 'Back to Songs', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '취소', exact: true }).click();
    const dialogs: string[] = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.getByRole('button', { name: 'Save, unsaved changes', exact: true }).click();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toContain('곡 공통 타이밍으로 올리며');
    const uploaded = readUploadedJson(editor.supabaseWrites.find(write => isChartUploadPath(write.path))!) as ChartJsonV3;
    expect(uploaded.events[2]).toMatchObject({ type: 'text', beat: '4', endBeat: '6', editorLane: 2 });
    expect(editor.supabaseWrites.some(write => write.path === '/rest/v1/rpc/save_song')).toBe(false);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('구형 파일의 0박 BPM editorLane 1·박자 editorLane 2를 열면 값을 버린 깨끗한 기본 상태이고 저장 파일에 editorLane이 없으며 다시 열어도 깨끗하다', async ({ page }) => {
    const editor = await openEditor(page, { chart: editorTestChart(), audio: true });
    await expectCleanLoadBaseline(page);
    expect(editor.supabaseWrites).toEqual([]);
    expect(await eventLanes(page)).toEqual([undefined, undefined]);
    // 박자는 레인 값과 무관하게 timeSignature 열에 있어 그 자리를 더블클릭하면 박자 편집 창이 열린다.
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await dblclickInitialEvent(page, 'timeSignature');
    await expect(page.getByRole('heading', { name: 'Edit Time Signature Change Event', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(editor.supabaseWrites).toEqual([]);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    const upload = editor.supabaseWrites.find(write => isChartUploadPath(write.path));
    expect(upload).toBeDefined();
    const saved = readUploadedJson(upload!) as ChartJsonV3;
    expect(saved.events).toEqual([
      { type: 'bpm', beat: '0', bpm: 120 },
      { type: 'timeSignature', beat: '0', beatPerMeasure: '4' },
    ]);
    const savedExtra = readUploadedJson(editor.supabaseWrites.find(write => isExtraUploadPath(write.path))!);

    const reopened = await openEditor(page, { chart: saved, extra: savedExtra as ExtraNotesJson, audio: true });
    await expectCleanLoadBaseline(page);
    expect(await eventLanes(page)).toEqual([undefined, undefined]);
    expect(reopened.supabaseWrites).toEqual([]);
    expect([...editor.unexpectedSupabaseRequests, ...reopened.unexpectedSupabaseRequests]).toEqual([]);
  });

  test('보조 레인3의 text [0,2)를 보조 레인1로 끌어도 초기 BPM은 전용 열이라 위반이 없고 Undo·Redo로 오간다', async ({ page }) => {
    const chart = { ...editorTestChart(), extraLaneCount: 3 };
    chart.events = [...chart.events, { type: 'text', beat: '0', endBeat: '2', text: 'hello', editorLane: 3 }];
    const editor = await openEditor(page, { chart });
    await expectCleanLoadBaseline(page);
    expect(await eventLanes(page)).toEqual([undefined, undefined, 3]);

    // 초기 BPM 편집 창은 값만 고친다. 레인을 고르는 칸이 없다.
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await dblclickInitialEvent(page, 'bpm');
    await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toBeVisible();
    await expect(page.getByLabel('BPM', { exact: true })).toHaveValue('120');
    await expect(page.getByRole('combobox', { name: 'Editor lane', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // 셋째 보조 칸(통합 레인 7)의 text 몸통을 첫째 보조 칸(통합 레인 5)으로 끈다.
    const from = await canvasPosition(page, 7, 1);
    const to = await canvasPosition(page, 5, 1);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => eventLanes(page)).toEqual([undefined, undefined, 1]);
    await expect(page.getByRole('button', { name: /배치 제약 위반.*목록 열기/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save, unsaved changes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();

    await page.keyboard.press('Control+z');
    await expectCleanLoadBaseline(page);
    expect(await eventLanes(page)).toEqual([undefined, undefined, 3]);
    await page.keyboard.press('Control+y');
    await expect(page.getByRole('button', { name: 'Save, unsaved changes', exact: true })).toBeVisible();
    expect(await eventLanes(page)).toEqual([undefined, undefined, 1]);
    expect(editor.supabaseWrites).toEqual([]);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('파일에서 초기 BPM·박자보다 앞에 적힌 보조 레인1·2의 text·auto [0,4)는 위반 없이 열리고 파일 순서 그대로 저장된다', async ({ page }) => {
    const chart = editorTestChart();
    chart.events = [
      { type: 'text', beat: '0', endBeat: '4', text: 'hello', editorLane: 1 },
      { type: 'auto', beat: '0', endBeat: '4', editorLane: 2 },
      ...chart.events,
    ];
    const editor = await openEditor(page, { chart });

    await expectCleanLoadBaseline(page);
    expect(await eventLanes(page)).toEqual([1, 2, undefined, undefined]);
    expect(await extraLaneCount(page)).toBe(2);
    expect(editor.supabaseWrites).toEqual([]);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    expect((readUploadedJson(editor.supabaseWrites.find(write => isChartUploadPath(write.path))!) as ChartJsonV3).events).toEqual([
      { type: 'text', beat: '0', endBeat: '4', text: 'hello', editorLane: 1 },
      { type: 'auto', beat: '0', endBeat: '4', editorLane: 2 },
      { type: 'bpm', beat: '0', bpm: 120 },
      { type: 'timeSignature', beat: '0', beatPerMeasure: '4' },
    ]);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });
});
