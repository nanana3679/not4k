import { expect, test, type Page } from '@playwright/test';
import type { ChartJsonV4 } from '../../src/shared/chart';
import { editorTestChart, openEditor } from './editorTestSetup';
import { canvasPosition, notes } from './explicitEditorTestHelpers';

test.setTimeout(60_000);

const family = (): ChartJsonV4 => ({ ...editorTestChart(), version: 4, notes: [
  { type: 'body', lane: 1, beat: '1', endBeat: '3', holdCount: 1 },
  { type: 'point', lane: 1, beat: '1', kind: 'single' },
  { type: 'sustain', lane: 1, beat: '2', count: 1 },
  { type: 'release', lane: 1, beat: '3', count: 1 },
  { type: 'point', lane: 1, beat: '5/2', kind: 'double' },
] });
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts'; const store = (await import(path)).useEditorStore.getState();
    return { selection: [...store.selection.notes].sort((a: number, b: number) => a - b), past: store.historyPast.length, future: store.historyFuture.length, transaction: store.editTransaction !== null };
  });
}
async function click(page: Page, at: number, lane = 1, alt = false) {
  const point = await canvasPosition(page, lane, at);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.click(point.x, point.y);
  if (alt) await page.keyboard.up('Alt');
}
async function selectMode(page: Page) { await page.keyboard.press('s'); }
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const errors: string[] = []; pageErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test('바디 선택·Release 제외·lane이동은 실제 set만 옮기고 선택된 Sustain 클릭은 set을 유지하며 미선택 Release 직접클릭은 그 항목만 고른다', async ({ page }) => {
  await openEditor(page, { chart: family() }); await selectMode(page);
  await click(page, 1.5); expect((await state(page)).selection).toEqual([0, 1, 2, 3]);
  await click(page, 3, 1, true); expect((await state(page)).selection).toEqual([0, 1, 2]);
  await page.keyboard.press('ArrowRight');
  expect((await notes(page)).map(note => note.lane)).toEqual([2, 2, 2, 1, 1]);
  await click(page, 2, 2); expect((await state(page)).selection).toEqual([0, 1, 2]);
  await click(page, 3); expect((await state(page)).selection).toEqual([3]);
});

test('partial box는 바디 연결집합을 고르고 Ctrl+A·Delete·Undo는 전체 노트와 선택index를 보존한다', async ({ page }) => {
  await openEditor(page, { chart: family() }); await selectMode(page);
  const start = await canvasPosition(page, 2, 1.3); const end = await canvasPosition(page, 1, 1.7);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 4 }); await page.mouse.up();
  expect((await state(page)).selection).toEqual([0, 1, 2, 3]);
  await page.keyboard.press('Control+a'); expect((await state(page)).selection).toEqual([0, 1, 2, 3, 4]);
  await page.keyboard.press('Delete'); expect(await notes(page)).toEqual([]);
  await page.keyboard.press('Control+z'); expect(await notes(page)).toHaveLength(5); expect((await state(page)).selection).toEqual([]);
});

test('Sustain 제외 Cut은 clipboard·chart·selection·history를 보존하고 copy만 한 표식의 illegal paste는 confirm·deselect 뒤 저장을 막는다', async ({ page }) => {
  const editor = await openEditor(page, { chart: family() }); await selectMode(page);
  await click(page, 2.5); await page.keyboard.press('Control+c');
  await click(page, 1.5); await click(page, 2, 1, true); const before = await state(page); const original = await notes(page);
  await page.keyboard.press('Control+x'); expect(await state(page)).toEqual(before); expect(await notes(page)).toEqual(original);
  // 거부한 Cut이 clipboard의 double Point를 덮지 않았다.
  await page.keyboard.press('Control+v'); await page.keyboard.press('Enter');
  expect((await notes(page)).at(-1)).toMatchObject({ type: 'point', kind: 'double' });
  await page.keyboard.press('Control+z');
  await click(page, 2); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await page.keyboard.press('Enter');
  expect((await notes(page)).at(-1)).toMatchObject({ type: 'sustain', beat: { n: 0, d: 1 } });
  await click(page, 1.5, 3); expect((await state(page)).selection).toEqual([]);
  await page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: '배치 제약 조건 위반', exact: true })).toBeVisible();
  expect(editor.supabaseWrites).toEqual([]); expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test('Shift resize는 선택된 끝Release만 따라가며 Sustain 밖 축소를 막고 제외 Release는 원위치다', async ({ page }) => {
  await openEditor(page, { chart: family() }); await selectMode(page); await click(page, 1.5);
  await page.keyboard.press('Shift+ArrowUp');
  const extended = await notes(page); expect(extended[0]).toMatchObject({ endBeat: extended[3].beat }); expect(extended[2].beat).toEqual({ n: 2, d: 1 });
  await click(page, extended[3].beat.n / extended[3].beat.d, 1, true);
  await page.keyboard.press('Shift+ArrowUp'); expect((await notes(page))[3].beat).toEqual(extended[3].beat);
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowDown');
  const shrunk = await notes(page); expect(shrunk[0]).toMatchObject({ endBeat: { n: 2, d: 1 } }); expect(shrunk[2].beat).toEqual({ n: 2, d: 1 });
});

test('우클릭 900ms 연속삭제는 노트뒤 Body를 관통하지 않고 Undo1개이며 별개gesture는 따로 Undo한다', async ({ page }) => {
  await openEditor(page, { chart: family() }); const sustain = await canvasPosition(page, 1, 2); const middle = await canvasPosition(page, 1, 2.5);
  await page.mouse.move(sustain.x, sustain.y); await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(900); await page.mouse.move(sustain.x + 1, sustain.y); await page.mouse.move(middle.x, middle.y, { steps: 1 });
  await page.mouse.move(middle.x + 1, middle.y); await page.mouse.up({ button: 'right' });
  expect((await notes(page)).map(note => note.type)).toEqual(['body', 'point', 'release']); expect((await state(page)).past).toBe(1);
  const body = await canvasPosition(page, 1, 1.5); await page.mouse.click(body.x, body.y, { button: 'right' });
  expect(await notes(page)).toEqual([]); expect((await state(page)).past).toBe(2);
  await page.keyboard.press('Control+z'); expect(await notes(page)).toHaveLength(3); await page.keyboard.press('Control+z'); expect(await notes(page)).toHaveLength(5);
});

test('우클릭중 Esc는 삭제만 복구하고 up전 move로 다시 지우지 않으며 기존 Undo를 유지한다', async ({ page }) => {
  await openEditor(page, { chart: family() }); await selectMode(page); await click(page, 2.5); await page.keyboard.press('ArrowRight');
  const before = await notes(page); const history = (await state(page)).past;
  const sustain = await canvasPosition(page, 1, 2); const start = await canvasPosition(page, 1, 1);
  await page.mouse.move(sustain.x, sustain.y); await page.mouse.down({ button: 'right' }); expect(await notes(page)).toHaveLength(4);
  await page.keyboard.press('Escape'); await page.mouse.move(start.x, start.y); expect(await notes(page)).toEqual(before);
  await page.mouse.up({ button: 'right' }); expect((await state(page)).past).toBe(history); expect((await state(page)).transaction).toBe(false);
});

test('우클릭중 Ctrl+Z는 삭제를 먼저 Undo하고 뒤늦은 Esc·move가 복구상태를 바꾸지 않는다', async ({ page }) => {
  await openEditor(page, { chart: family() }); const original = await notes(page); const sustain = await canvasPosition(page, 1, 2); const start = await canvasPosition(page, 1, 1);
  await page.mouse.move(sustain.x, sustain.y); await page.mouse.down({ button: 'right' });
  await page.keyboard.press('Control+z'); expect(await notes(page)).toEqual(original);
  const history = await state(page); await page.keyboard.press('Escape'); await page.mouse.move(start.x, start.y); await page.mouse.up({ button: 'right' });
  expect(await notes(page)).toEqual(original); expect(await state(page)).toEqual(history);
});

test('실제 touch 미선택 handle은 연결선택 후 resize하고 선택된handle에서는 제외 Point를 되살리지 않는다', async ({ page }) => {
  const chart = family(); chart.notes = chart.notes.filter(note => note.type !== 'release');
  await openEditor(page, { chart }); await selectMode(page);
  const cdp = await page.context().newCDPSession(page);
  await page.locator('select').filter({ has: page.locator('option[value="8"]') }).selectOption('8');
  const resize = async (start: number, end: number) => {
    const source = await canvasPosition(page, 1, start); const target = await canvasPosition(page, 1, end);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...source, id: 1 }] }); await page.waitForTimeout(650);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...target, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await resize(3, 3.5); expect((await notes(page))[0]).toMatchObject({ endBeat: { n: 7, d: 2 } }); expect((await state(page)).selection).toEqual([0, 1, 2]);
  await click(page, 1, 1, true); expect((await state(page)).selection).toEqual([0, 2]);
  await resize(3.5, 4); expect((await notes(page))[0]).toMatchObject({ endBeat: { n: 4, d: 1 } }); expect((await state(page)).selection).toEqual([0, 2]);
  await cdp.detach();
});
