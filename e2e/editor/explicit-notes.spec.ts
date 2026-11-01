import { expect, test, type Page } from '@playwright/test';
import type { ChartJsonV4, ExtraNotesJson } from '../../src/shared/chart';
import { editorTestChart, openEditor, readUploadedJson, EDITOR_TEST_CHART_UPLOAD_PATH, EDITOR_TEST_EXTRA_UPLOAD_PATH } from './editorTestSetup';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
});
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

import { canvasPosition, drag, notes } from './explicitEditorTestHelpers';

const entitySelect = (page: Page) => page.locator('select').filter({ has: page.locator('option[value="single"]') });

test('Grace 더블 드래그는 Esc 취소·생성·Undo·Redo·v4 저장과 재로드에서 탭·바디·릴리즈 수량을 보존한다', async ({ page }, info) => {
  const editor = await openEditor(page);
  await entitySelect(page).selectOption('double');
  await page.getByRole('button', { name: 'Grace', exact: true }).click();
  await drag(page, 1, 1, 3, true); expect(await notes(page)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await drag(page, 1, 1, 3);
  const created = await notes(page);
  expect(created).toMatchObject([
    { type: 'tap', kind: 'double', grace: true }, { type: 'body', holdCount: 2 }, { type: 'release', count: 2, grace: true },
  ]);
  expect(created[1]).not.toHaveProperty('holdOnly'); expect(created[1]).not.toHaveProperty('grace');
  await expect(page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await notes(page)).toEqual([]);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await notes(page)).toEqual(created);
  await page.screenshot({ path: info.outputPath('grace-double-explicit.png') });
  await page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
  const saved = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH)!) as ChartJsonV4;
  const extra = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH)!) as ExtraNotesJson;
  expect(saved.version).toBe(4);
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
  await openEditor(page, { chart: saved, extra }); expect(await notes(page)).toEqual(created);
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test('v4 혼합 main과 aux를 저장·재로드하면 구형 false·holdOnly와 명시 Grace·수량·순서가 같다', async ({ page }, info) => {
  const chart: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [
    { type: 'single', lane: 4, beat: '0', grace: false },
    { type: 'long', lane: 4, beat: '0', endBeat: '2', holdOnly: true },
    { type: 'tap', kind: 'double', lane: 1, beat: '0', grace: true },
    { type: 'body', holdCount: 2, lane: 1, beat: '0', endBeat: '4' },
    { type: 'tick', count: 2, lane: 1, beat: '2' },
    { type: 'release', count: 1, lane: 1, beat: '4', grace: false },
  ] };
  const extra: ExtraNotesJson = { version: 4, extraLaneCount: 3, extraNotes: [
    { type: 'double', extraLane: 3, beat: '0', grace: false },
    { type: 'body', holdCount: 1, extraLane: 2, beat: '1', endBeat: '1' },
    { type: 'tick', count: 1, extraLane: 2, beat: '1' },
    { type: 'release', count: 2, extraLane: 1, beat: '3', grace: true },
  ] };
  const editor = await openEditor(page, { chart, extra }); const before = await notes(page);
  await page.screenshot({ path: info.outputPath('mixed-explicit-main-aux.png') });
  await page.getByRole('button', { name: 'Save chart', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
  const savedMain = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH)!) as ChartJsonV4;
  const savedExtra = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH)!) as ExtraNotesJson;
  expect(savedMain).toEqual(chart); expect(savedExtra).toEqual(extra);
  await openEditor(page, { chart: savedMain, extra: savedExtra }); expect(await notes(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test('빈 aux 틱 클릭→재클릭은 0길이 body1+tick1→body2+tick2이며 세 번째 클릭은 Undo를 늘리지 않는다', async ({ page }) => {
  const editor = await openEditor(page); await entitySelect(page).selectOption('tick');
  const at = await canvasPosition(page, 5, 2);
  await page.mouse.click(at.x, at.y);
  expect(await notes(page)).toMatchObject([{ type: 'body', holdCount: 1, lane: 5 }, { type: 'tick', count: 1, lane: 5 }]);
  await page.mouse.click(at.x, at.y);
  const doubled = await notes(page);
  expect(doubled).toMatchObject([{ type: 'body', holdCount: 2, lane: 5 }, { type: 'tick', count: 2, lane: 5 }]);
  await page.mouse.click(at.x, at.y); expect(await notes(page)).toEqual(doubled);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await notes(page)).toMatchObject([{ type: 'body', holdCount: 1 }, { type: 'tick', count: 1 }]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await notes(page)).toEqual([]);
  expect(editor.supabaseWrites).toEqual([]);
});

test('숨은 aux3의 바디 밖 tick은 열람·확정이 가능하고 툴바 위반·숨은 레인 안내가 저장을 차단한다', async ({ page }) => {
  const editor = await openEditor(page, { extra: { version: 4, extraLaneCount: 3,
    extraNotes: [{ type: 'tick', count: 1, extraLane: 3, beat: '2' }] } });
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.locator('select').filter({ has: page.locator('option[value="10"]') }).selectOption('2');
  await page.mouse.click(10, 100);
  await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: '배치 제약 조건 위반', exact: true })).toBeVisible();
  await expect(page.getByText(/숨은 보조 레인\(3\)의 위반/)).toBeVisible();
  expect(editor.supabaseWrites).toEqual([]);
});

test('보조 레인 수 3인 혼합 main과 명시 aux는 열자마자 Save chart에 저장 안 됨 표시가 없고, Save As는 새 난이도·레벨만 바꾸고 노트와 독립 버전을 보존한다', async ({ page }) => {
  const chart = { ...editorTestChart(), version: 4 as const, notes: [
    { type: 'single' as const, lane: 4, beat: '0', grace: false },
    { type: 'release' as const, count: 2 as const, lane: 1, beat: '2', grace: true },
  ] };
  const extra: ExtraNotesJson = { version: 4, extraLaneCount: 3, extraNotes: [
    { type: 'body', holdCount: 2, extraLane: 3, beat: '2', endBeat: '2' },
    { type: 'tick', count: 2, extraLane: 3, beat: '2' },
  ] };
  const editor = await openEditor(page, { chart, extra });
  // 보조 레인 수 3을 정한 뒤 savedChartJson을 만들어야 편집 전 차트가 dirty가 아니다(기본 2로 만들면 'Save chart, unsaved changes').
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
  await page.route('**/rest/v1/charts?*', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Save As', exact: true }).click();
  await page.getByLabel('Target Difficulty').selectOption('LIFTOFF');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/difficulty=liftoff$/);
  const saved = readUploadedJson(editor.supabaseWrites.find(write => write.path.endsWith('/liftoff.json'))!) as ChartJsonV4;
  const savedExtra = readUploadedJson(editor.supabaseWrites.find(write => write.path.endsWith('/liftoff.extra.json'))!) as ExtraNotesJson;
  expect(saved.notes).toEqual(chart.notes); expect(saved.version).toBe(4);
  expect(saved.meta).toEqual({ ...chart.meta, difficultyLabel: 'LIFTOFF' });
  expect(savedExtra).toEqual(extra);
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
});

test('터치 double 롱프레스의 1→3박 드래그는 마우스와 같은 Grace 탭·Body·Release 수량2를 만든다', async ({ page }) => {
  await openEditor(page); await entitySelect(page).selectOption('double');
  await page.getByRole('button', { name: 'Grace', exact: true }).click();
  const start = await canvasPosition(page, 2, 1); const end = await canvasPosition(page, 2, 3);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await notes(page)).toMatchObject([
    { type: 'tap', kind: 'double', lane: 2, grace: true }, { type: 'body', holdCount: 2, lane: 2 }, { type: 'release', count: 2, lane: 2, grace: true },
  ]);
  await cdp.detach();
});

test('보조 트릴 구간 생성·트릴 바디·구간 유닛 이동·Undo·저장·재로드는 같은 레인 규칙과 파일 분리를 보존한다', async ({ page }) => {
  // 같은 테스트에서 에디터를 두 번 연다(렌더러 초기화 2회). 차트·선택을 바꾸는 조작마다 SwiftShader 전체 다시 그리기가
  // 여러 번 일어나 기본 30초 안팎이 걸려, 부하가 조금만 있어도 마지막 대기에서 시간 초과가 났다.
  test.setTimeout(60_000);
  const editor = await openEditor(page);
  await entitySelect(page).selectOption('trillZone');
  await drag(page, 5, 1, 4);
  await entitySelect(page).selectOption('single');
  await drag(page, 5, 2, 3);
  expect(await notes(page)).toMatchObject([
    { type: 'tap', kind: 'trill', lane: 5 }, { type: 'body', trill: true, lane: 5 },
  ]);
  await page.keyboard.press('s');
  const zone = await canvasPosition(page, 5, 1.5);
  await page.mouse.click(zone.x, zone.y);
  await page.keyboard.press('ArrowRight');
  expect((await notes(page)).map(note => note.lane)).toEqual([6, 6]);
  await page.keyboard.press('Control+z');
  expect((await notes(page)).map(note => note.lane)).toEqual([5, 5]);
  await page.keyboard.press('Control+Shift+z');
  expect((await notes(page)).map(note => note.lane)).toEqual([6, 6]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
  const main = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH)!) as ChartJsonV4;
  const extra = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH)!) as ExtraNotesJson;
  expect(main.notes).toEqual([]); expect(main.trillZones).toEqual([]);
  expect(extra.extraTrillZones).toEqual([{ extraLane: 2, beat: '1', endBeat: '4' }]);
  expect(extra.extraNotes).toMatchObject([{ type: 'tap', kind: 'trill', extraLane: 2 }, { type: 'body', trill: true, extraLane: 2 }]);
  const before = await notes(page);
  await openEditor(page, { chart: main, extra });
  expect(await notes(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test('기존 보조 zone 밖 trill은 자동 생성 없이 위반으로 열고 저장을 차단한다', async ({ page }) => {
  const editor = await openEditor(page, { extra: { version: 3, extraLaneCount: 2,
    extraNotes: [{ type: 'trill', extraLane: 1, beat: '2' }] } });
  await expect(page.getByRole('button', { name: '배치 제약 위반 1건 목록 열기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save chart', exact: true }).click();
  await expect(page.getByRole('heading', { name: '배치 제약 조건 위반', exact: true })).toBeVisible();
  expect(await notes(page)).toMatchObject([{ type: 'trill', lane: 5 }]);
  expect(editor.supabaseWrites).toEqual([]);
});
