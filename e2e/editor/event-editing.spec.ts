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
    test(`0박 ${label} 이벤트를 더블클릭하면 변경 이벤트 제목과 초기 설정 삭제 보호를 표시하고 Editor lane 선택은 없다`, async ({ page }) => {
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
      // 초기 BPM·박자의 보조 레인은 1·2로 고정이라(RFD 0082) 값만 편집한다.
      await expect(page.getByRole('combobox', { name: 'Editor lane', exact: true })).toHaveCount(0);
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

  test('editorLane 없는 0박 BPM·박자를 열면 BPM은 보조 레인1 그대로·박자는 보조 레인2로 옮긴 깨끗한 기본 상태이고 저장할 때만 반영한다', async ({ page }) => {
    const loadViolationLogs = recordLoadViolationLogs(page);
    const editor = await openEditor(page, { chart: chartWithoutEditorLanes(), audio: true });
    await expectCleanLoadBaseline(page);
    expect(loadViolationLogs).toEqual([]);
    expect(editor.supabaseWrites).toEqual([]);
    expect(await eventLanes(page)).toEqual([undefined, 2]);
    // 박자는 둘째 보조 칸(통합 레인 6 위치)으로 옮겨져 그 자리를 더블클릭하면 박자 편집 창이 열린다.
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await dblclickInitialEvent(page, 6);
    await expect(page.getByRole('heading', { name: 'Edit Time Signature Change Event', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(editor.supabaseWrites).toEqual([]);

    await page.getByRole('button', { name: 'Save chart', exact: true }).click();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    const upload = editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH);
    expect(upload).toBeDefined();
    const saved = readUploadedJson(upload!) as ChartJsonV3;
    // editorLane 없는 BPM은 이미 보조 레인1이라 editorLane을 새로 쓰지 않는다. 옮긴 박자만 editorLane 2를 적는다.
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

  test('보조 레인3의 text [0,2)를 초기 BPM 자리인 보조 레인1로 드래그하면 위반·미저장·Undo가 생기고 Undo·Redo로 오간다', async ({ page }) => {
    const chart = { ...editorTestChart(), extraLaneCount: 3 };
    chart.events = [...chart.events, { type: 'text', beat: '0', endBeat: '2', text: 'hello', editorLane: 3 }];
    const editor = await openEditor(page, { chart });
    await expectCleanLoadBaseline(page);
    expect(await eventLanes(page)).toEqual([1, 2, 3]);

    // 초기 BPM 편집 창은 값만 고친다. 레인을 고르는 칸이 없다.
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await dblclickInitialEvent(page, 5);
    await expect(page.getByRole('heading', { name: 'Edit BPM Change Event', exact: true })).toBeVisible();
    await expect(page.getByLabel('BPM', { exact: true })).toHaveValue('120');
    await expect(page.getByRole('combobox', { name: 'Editor lane', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // 셋째 보조 칸(통합 레인 7)의 text 몸통을 첫째 보조 칸(통합 레인 5)으로 끌면 0박 BPM 자리와 겹친다.
    const from = await canvasPosition(page, 7, 1);
    const to = await canvasPosition(page, 5, 1);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => eventLanes(page)).toEqual([1, 2, 1]);
    await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();

    await page.keyboard.press('Control+z');
    await expectCleanLoadBaseline(page);
    expect(await eventLanes(page)).toEqual([1, 2, 3]);
    await page.keyboard.press('Control+y');
    await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true })).toBeVisible();
    expect(await eventLanes(page)).toEqual([1, 2, 1]);

    // 편집 중에 만든 겹침은 자동으로 옮기지 않고 저장을 막는다.
    await page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: '배치 제약 조건 위반', exact: true })).toBeVisible();
    await expect(page.getByText('[eventOverlap]', { exact: true })).toBeVisible();
    expect(await eventLanes(page)).toEqual([1, 2, 1]);
    expect(editor.supabaseWrites).toEqual([]);
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('파일에서 초기 BPM·박자보다 앞에 적힌 보조 레인1·2의 text·auto [0,4)는 열 때 레인을 옮기지 않아 위반 2건으로 열리고 저장은 [eventOverlap] 2건으로 막히며, 보조 레인 수 2 → 4로 늘려 text·auto를 레인3·4로 옮기면 위반이 풀려 초기 BPM·박자가 맨 앞인 순서로 저장된다', async ({ page }) => {
    const chart = editorTestChart();
    // 파일 순서는 [text, auto, BPM, 박자]다. 열면 초기 BPM·박자가 이벤트 목록 맨 앞으로 와 [BPM, 박자, text, auto]가 된다.
    chart.events = [
      { type: 'text', beat: '0', endBeat: '4', text: 'hello', editorLane: 1 },
      { type: 'auto', beat: '0', endBeat: '4', editorLane: 2 },
      ...chart.events,
    ];
    const loadViolationLogs = recordLoadViolationLogs(page);
    const editor = await openEditor(page, { chart });

    // 열 때는 초기 설정만 고정 자리에 두고 일반 이벤트는 옮기지 않는다. 위반 표시와 경고만 있고 미저장 표시·Undo는 없다.
    await expect.poll(() => loadViolationLogs.length).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: '배치 제약 위반 2건 목록 열기', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    expect(await eventLanes(page)).toEqual([1, 2, 1, 2]);
    expect(await extraLaneCount(page)).toBe(2);
    expect(editor.supabaseWrites).toEqual([]);

    await page.getByRole('button', { name: 'Save chart', exact: true }).click();
    await expect(page.getByRole('heading', { name: '배치 제약 조건 위반', exact: true })).toBeVisible();
    await expect(page.getByText('[eventOverlap]', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '배치 제약 조건 위반', exact: true })).toHaveCount(0);
    expect(editor.supabaseWrites).toEqual([]);

    // 로드 경고 알림은 화면 아래 가운데에 떠 0박 근처 canvas를 가릴 수 있으므로 사라진 뒤 끈다.
    await expect(page.getByText('이 차트에 배치 제약 위반 2건이 있습니다 — 수리 후 저장할 수 있습니다', { exact: true }))
      .toBeHidden({ timeout: 10_000 });
    await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
    await page.locator('select').filter({ has: page.locator('option[value="10"]') }).selectOption('4');
    await page.mouse.click(10, 100);
    await expect.poll(() => extraLaneCount(page)).toBe(4);

    // 첫째·둘째 보조 칸(통합 레인 5·6)의 text·auto 몸통을 셋째·넷째 보조 칸(통합 레인 7·8)으로 끈다.
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await dragEventBodyToColumn(page, 5, 7, 2);
    await expect.poll(() => eventLanes(page)).toEqual([1, 2, 3, 2]);
    await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();
    await dragEventBodyToColumn(page, 6, 8, 2);
    await expect.poll(() => eventLanes(page)).toEqual([1, 2, 3, 4]);
    await expect(page.getByRole('button', { name: /배치 제약 위반.*목록 열기/ })).toHaveCount(0);
    expect(editor.supabaseWrites).toEqual([]);

    await page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true }).click();
    await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
    expect(readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH)!)).toMatchObject({ events: [
      { type: 'bpm', beat: '0', bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 },
      { type: 'text', beat: '0', endBeat: '4', text: 'hello', editorLane: 3 },
      { type: 'auto', beat: '0', endBeat: '4', editorLane: 4 },
    ] });
    expect(readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH)!))
      .toMatchObject({ extraLaneCount: 4 });
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });
});
