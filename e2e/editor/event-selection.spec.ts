import { test, expect, type Page } from '@playwright/test';
import type { ChartDocument } from '../../src/shared';
import { canvasPosition } from './explicitEditorTestHelpers';
import { editorTestChart, openEditor } from './editorTestSetup';

test.setTimeout(60_000);

function chartFixture() {
  const chart = editorTestChart([{ type: 'single', lane: 1, beat: '2' }]);
  chart.events = [
    { type: 'bpm', beat: '0', bpm: 120, editorLane: 1 },
    { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 },
    { type: 'text', beat: '2', endBeat: '4', text: 'event', editorLane: 1 },
  ];
  return chart;
}

async function editorState(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const state = (await import(path)).useEditorStore.getState();
    const chart: ChartDocument = state.chart;
    return {
      notes: chart.notes.map(note => ({ type: note.type, lane: note.lane, beat: note.beat.n / note.beat.d })),
      events: chart.events.map(event => ({ type: event.type, lane: event.editorLane ?? 1,
        beat: event.beat.n / event.beat.d,
        ...('endBeat' in event ? { endBeat: event.endBeat.n / event.endBeat.d } : {}),
      })),
      selectedNotes: [...state.selection.notes], selectedEvents: [...state.selection.events],
    };
  });
}

test.describe('이벤트의 공통 선택·편집', () => {
  test('TextEvent만 선택해 이동·리사이즈·복사·붙여넣기·undo·redo하면 노트는 그대로다', async ({ page }) => {
    await openEditor(page, { chart: chartFixture() });
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const position = await canvasPosition(page, 5, 3);
    await page.mouse.click(position.x, position.y);
    await expect.poll(() => editorState(page)).toMatchObject({ selectedEvents: [2], selectedNotes: [] });

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await expect.poll(() => editorState(page)).toMatchObject({
      events: [{ type: 'bpm' }, { type: 'timeSignature' }, { type: 'text', beat: 3, endBeat: 6 }],
    });
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await editorState(page)).events.at(-1))
      .toMatchObject({ type: 'text', lane: 2, beat: 1, endBeat: 4 });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await editorState(page)).events.length).toBe(3);
    await page.keyboard.press('Control+y');
    await expect.poll(async () => (await editorState(page)).events.at(-1))
      .toMatchObject({ type: 'text', lane: 2, beat: 1, endBeat: 4 });
    expect((await editorState(page)).notes).toEqual([{ type: 'single', lane: 1, beat: 2 }]);
  });

  test('노트와 이벤트를 Shift로 함께 선택해 이동·삭제하면 한 undo로 둘 다 복구한다', async ({ page }) => {
    await openEditor(page, { chart: chartFixture() });
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const note = await canvasPosition(page, 1, 2);
    const event = await canvasPosition(page, 5, 3);
    await page.mouse.click(note.x, note.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(event.x, event.y);
    await page.keyboard.up('Shift');
    await expect.poll(() => editorState(page)).toMatchObject({ selectedNotes: [0], selectedEvents: [2] });
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => editorState(page)).toMatchObject({
      notes: [{ beat: 3 }], events: [{ type: 'bpm' }, { type: 'timeSignature' }, { beat: 3, endBeat: 5 }],
    });
    await page.keyboard.press('Delete');
    await expect.poll(() => editorState(page)).toMatchObject({ notes: [], events: [{ type: 'bpm' }, { type: 'timeSignature' }] });
    await page.keyboard.press('Control+z');
    await expect.poll(() => editorState(page)).toMatchObject({
      notes: [{ beat: 3 }], events: [{ type: 'bpm' }, { type: 'timeSignature' }, { beat: 3, endBeat: 5 }],
    });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await expect.poll(() => editorState(page)).toMatchObject({ notes: [],
      events: [{ type: 'bpm', beat: 0 }, { type: 'timeSignature', beat: 0 }],
    });
  });

  test('이벤트 몸통을 드래그하는 도중 Esc를 누르면 pointerup 뒤에도 2～4박 원본을 유지한다', async ({ page }) => {
    await openEditor(page, { chart: chartFixture() });
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const from = await canvasPosition(page, 5, 3);
    const to = await canvasPosition(page, 5, 4);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await expect.poll(async () => (await editorState(page)).events[2].beat).toBe(3);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect.poll(async () => (await editorState(page)).events[2]).toMatchObject({ beat: 2, endBeat: 4 });
  });
});
