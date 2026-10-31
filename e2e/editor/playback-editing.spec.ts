/**
 * 에디터 재생 중 편집 제한(RFD 0099).
 *
 * 재생 중에는 생성·이동·삭제·Undo가 차트와 history를 바꾸지 않고 재생도 멈추지 않는다. 정지하면 같은 조작이 다시 동작한다.
 * 테스트 음원은 0.5초라 타임라인이 1마디에서 끝나고, 재생은 타임라인 끝에서 저절로 멈춘다. 120 BPM이면 2초뿐이라
 * 30 BPM 차트(1마디 = 8초)로 재생 구간을 넉넉히 둔다. 재생 커서를 따라가는 자동 스크롤은 꺼서 누를 좌표가 움직이지 않게 한다.
 */
import { expect, test, type Page } from '@playwright/test';
import type { ChartJsonV4 } from '../../src/shared/chart';
import { editorTestChart, openEditor } from './editorTestSetup';
import { canvasPosition } from './explicitEditorTestHelpers';

test.setTimeout(60_000);

/** 30 BPM·4/4. 1박 = 2000ms. 1박에 1·2레인 탭이 있다. */
const slowChart = (): ChartJsonV4 => ({
  ...editorTestChart(),
  version: 4,
  events: [{ type: 'bpm', beat: '0', bpm: 30, editorLane: 1 }, { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 }],
  notes: [
    { type: 'tap', lane: 1, beat: '1', kind: 'single' },
    { type: 'tap', lane: 2, beat: '1', kind: 'single' },
  ],
});

/** canvasPosition은 120 BPM(1박 = 500ms) 기준이다. 30 BPM 차트의 박은 4배 시각에 있다. */
const at30Bpm = (page: Page, lane: number, beat: number) => canvasPosition(page, lane, beat * 4);

async function clickAt(page: Page, lane: number, beat: number) {
  const point = await at30Bpm(page, lane, beat);
  await page.mouse.click(point.x, point.y);
}

async function dragAt(page: Page, from: { lane: number; beat: number }, to: { lane: number; beat: number }) {
  const a = await at30Bpm(page, from.lane, from.beat);
  const b = await at30Bpm(page, to.lane, to.beat);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

async function editorState(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const store = (await import(path)).useEditorStore.getState();
    return {
      notes: JSON.stringify(store.chart.notes),
      noteLanes: store.chart.notes.map((note: { lane: number }) => note.lane),
      selection: [...store.selection.notes],
      past: store.historyPast.length,
      future: store.historyFuture.length,
      isPlaying: store.isPlaying,
    };
  });
}

/** 재생 커서를 따라 스크롤하면 누를 좌표가 움직인다. 재생 옵션 메뉴에서 자동 스크롤을 끈다. */
async function turnOffAutoScroll(page: Page) {
  await page.getByRole('button', { name: 'Playback options', exact: true }).click();
  await page.getByRole('button', { name: 'Auto Scroll ✓', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Auto Scroll', exact: true })).toBeVisible();
  await page.mouse.click(5, 5); // 메뉴 바깥 덮개를 눌러 닫는다
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function startPlayback(page: Page) {
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
}

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await openEditor(page, { audio: true, chart: slowChart() });
  await turnOffAutoScroll(page);
});
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test('30 BPM 곡을 재생하는 동안 1레인 탭 끌기·Delete·Ctrl+Z·Create 클릭은 차트와 history를 바꾸지 않고 재생이 이어지며, 정지 뒤 같은 Create 클릭은 3레인 1박에 탭을 놓는다', async ({ page }) => {
  // 정지 중 편집 하나로 Undo할 history를 만든다(4레인 1박 탭).
  await clickAt(page, 4, 1);
  await page.keyboard.press('s');
  await clickAt(page, 1, 1);
  const before = await editorState(page);
  expect(before.noteLanes).toEqual([1, 2, 4]);
  expect(before.selection).toEqual([0]);
  expect(before.past).toBe(1);

  await startPlayback(page);
  await dragAt(page, { lane: 1, beat: 1 }, { lane: 3, beat: 1 });
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('c');
  await clickAt(page, 3, 1);

  await expect(page.getByText('Pause playback to edit').first()).toBeVisible();
  expect(await editorState(page)).toEqual({ ...before, isPlaying: true });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await clickAt(page, 3, 1);
  expect((await editorState(page)).noteLanes).toEqual([1, 2, 4, 3]);
});

test('선택한 1레인 탭을 2레인까지 끄는 중 Space로 재생하면 2레인까지 확정하고 4레인까지 더 끌어도 움직이지 않으며, 정지 뒤 Ctrl+Z로 1레인에 돌아온다', async ({ page }) => {
  await page.keyboard.press('s');
  await clickAt(page, 1, 1);
  const from = await at30Bpm(page, 1, 1);
  const mid = await at30Bpm(page, 2, 1);
  const to = await at30Bpm(page, 4, 1);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 5 });
  await expect.poll(async () => (await editorState(page)).noteLanes).toEqual([2, 2]);
  await startPlayback(page);
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();

  const playing = await editorState(page);
  expect(playing.noteLanes).toEqual([2, 2]);
  expect(playing.past).toBe(1);
  expect(playing.isPlaying).toBe(true);

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.keyboard.press('Control+z');
  expect((await editorState(page)).noteLanes).toEqual([1, 2]);
});
