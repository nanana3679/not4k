/**
 * 구형 차트 1차 기계 변환 모달·결과 화면·변환 검토 목록(RFD 0037 §8-1, docs/spec/chart-editor.md "구형 차트 변환 모달과 변환 검토 목록").
 * Supabase 요청은 editorTestSetup의 로컬 응답으로 끝나 실제 Storage에 쓰지 않는다.
 */
import { expect, test, type Page } from '@playwright/test';
import type { ChartJsonV3, ChartJsonV4, ExtraNotesJson } from '../../src/shared/chart';
import {
  EDITOR_TEST_CHART_UPLOAD_PATH,
  EDITOR_TEST_EXTRA_UPLOAD_PATH,
  editorTestChart,
  legacyConversionOffer,
  legacyConversionResult,
  openEditor,
  readUploadedJson,
} from './editorTestSetup';
import { notes } from './explicitEditorTestHelpers';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
});
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

// 레인 1: head 있는 single 롱노트. 레인 2: head 있는 2→1 감소 연결(head 없는 경계라 검토 항목).
// 보조 레인 1: single Point. 보조 레인 2: 트릴 롱노트(끝에 릴리즈를 두지 않아 검토 항목).
const legacyMain: ChartJsonV3 = editorTestChart([
  { type: 'single', lane: 1, beat: '0' },
  { type: 'long', lane: 1, beat: '0', endBeat: '2' },
  { type: 'double', lane: 2, beat: '4' },
  { type: 'doubleLong', lane: 2, beat: '4', endBeat: '6' },
  { type: 'long', lane: 2, beat: '6', endBeat: '8' },
]);
const legacyExtra: ExtraNotesJson = { extraLaneCount: 2, extraNotes: [
  { type: 'single', extraLane: 1, beat: '1' },
  { type: 'trill', extraLane: 2, beat: '2' },
  { type: 'trillLong', extraLane: 2, beat: '2', endBeat: '3' },
] };
const COUNTS = '탭 4 · 바디 4 · 릴리즈 2 · 틱 0 · 검토할 항목 2';
const CONVERTED_TYPES = ['tap', 'body', 'release', 'tap', 'body', 'body', 'release', 'tap', 'tap', 'body'];
const LEGACY_TYPES = ['single', 'long', 'double', 'doubleLong', 'long', 'single', 'trill', 'trillLong'];

const reviewPanel = (page: Page) => page.getByRole('complementary', { name: '변환 검토', exact: true });

/** 에디터 모드·재생 커서·선택한 노트(레인·박 문자열)를 읽는다. */
async function cursorAndSelection(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/editor/stores/editorStore.ts';
    const beatPath = '/src/shared/types/beat.ts';
    const [{ useEditorStore }, { beatToString }] = await Promise.all([import(storePath), import(beatPath)]);
    const state = useEditorStore.getState();
    const selected = [...state.selection.notes as Set<number>].sort((a, b) => a - b).map((index) => {
      const note = state.chart.notes[index];
      return { type: note.type, lane: note.lane, beat: beatToString(note.beat), ...('endBeat' in note ? { endBeat: beatToString(note.endBeat) } : {}) };
    });
    return { mode: state.mode, currentTimeMs: state.currentTimeMs, selected };
  });
}

test('구형 노트 차트를 열면 dry-run 개수를 묻고, 변환하면 결과·검토 목록 이동·복사·Undo·dirty·v4 저장으로 이어지며 다시 열면 묻지 않는다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const editor = await openEditor(page, { chart: legacyMain, extra: legacyExtra, legacyConversion: 'manual' });
  const offer = legacyConversionOffer(page);
  await expect(offer).toBeVisible();
  await expect(offer.getByLabel('변환하면 만들 노트 수')).toContainText(COUNTS);
  const legacyNotes = await notes(page);
  expect(legacyNotes.map(note => note.type)).toEqual(LEGACY_TYPES);
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();

  await offer.getByRole('button', { name: '변환', exact: true }).click();
  const result = legacyConversionResult(page);
  await expect(result.getByLabel('변환으로 만든 노트 수')).toContainText(COUNTS);
  await expect(result).toContainText("검토할 항목 2건은 '변환 검토' 목록에서 위치로 이동해 고칩니다.");
  const converted = await notes(page);
  expect(converted.map(note => note.type)).toEqual(CONVERTED_TYPES);
  await result.getByRole('button', { name: '검토 목록 열기', exact: true }).click();
  await expect(result).toBeHidden();

  const review = reviewPanel(page);
  await expect(review.getByRole('heading', { name: '변환 검토 2건' })).toBeVisible();
  const rows = review.getByRole('listitem');
  await expect(rows).toHaveText([
    '레인 2 · 2마디 3박감소 연결 2→1 · 경계 비움 · 옮기지 못한 구형 점수 항목 1개',
    '보조 레인 2 · 1마디 4박트릴 바디 끝 · 릴리즈 없음 · 옮기지 못한 구형 점수 항목 1개',
  ]);

  // 행은 index가 아니라 레인·박으로 이동·선택한다: 레인 2 박 6(120 BPM이면 3000ms)에서 끝나는 바디와 시작하는 바디.
  await rows.nth(0).getByRole('button').click();
  await expect.poll(() => cursorAndSelection(page)).toEqual({ mode: 'select', currentTimeMs: 3000, selected: [
    { type: 'body', lane: 2, beat: '4', endBeat: '6' },
    { type: 'body', lane: 2, beat: '6', endBeat: '8' },
  ] });
  await rows.nth(1).getByRole('button').click();
  await expect.poll(() => cursorAndSelection(page)).toEqual({ mode: 'select', currentTimeMs: 1500, selected: [
    { type: 'body', lane: 6, beat: '2', endBeat: '3' },
  ] });

  await review.getByRole('button', { name: '텍스트로 복사', exact: true }).click();
  await expect(page.getByText('변환 검토 목록을 복사했습니다', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe([
    '변환 검토 2건 — E2E 에디터 곡 NORMAL',
    '1. 레인 2 · 2마디 3박 (박 6) · 감소 연결 2→1 · 경계 비움 · 옮기지 못한 구형 점수 항목 1개',
    '2. 보조 레인 2 · 1마디 4박 (박 3) · 트릴 바디 끝 · 릴리즈 없음 · 옮기지 못한 구형 점수 항목 1개',
  ].join('\n'));

  // 변환은 Undo 한 단위이고 저장 스냅샷은 구형 차트라 변환 상태가 dirty다.
  await expect(page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await notes(page)).toEqual(legacyNotes);
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(review).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await notes(page)).toEqual(converted);

  // 목록을 닫아도 세션 동안 툴바 버튼으로 다시 연다.
  await review.getByRole('button', { name: '변환 검토 닫기', exact: true }).click();
  await expect(review).toBeHidden();
  await page.getByRole('button', { name: '변환 검토 2건', exact: true }).click();
  await expect(review).toBeVisible();

  await page.getByRole('button', { name: 'Save chart, unsaved changes', exact: true }).click();
  await expect(page.getByText('Chart saved', { exact: true })).toBeVisible();
  const savedMain = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_CHART_UPLOAD_PATH)!) as ChartJsonV4;
  const savedExtra = readUploadedJson(editor.supabaseWrites.find(write => write.path === EDITOR_TEST_EXTRA_UPLOAD_PATH)!) as ExtraNotesJson;
  expect(savedMain.version).toBe(4);
  expect(savedMain.notes).toEqual([
    { type: 'tap', kind: 'single', lane: 1, beat: '0' },
    { type: 'body', holdCount: 1, lane: 1, beat: '0', endBeat: '2' },
    { type: 'release', count: 1, lane: 1, beat: '2' },
    { type: 'tap', kind: 'double', lane: 2, beat: '4' },
    { type: 'body', holdCount: 2, lane: 2, beat: '4', endBeat: '6' },
    { type: 'body', holdCount: 1, lane: 2, beat: '6', endBeat: '8' },
    { type: 'release', count: 1, lane: 2, beat: '8' },
  ]);
  expect(savedExtra).toEqual({ version: 4, extraLaneCount: 2, extraNotes: [
    { type: 'tap', kind: 'single', extraLane: 1, beat: '1' },
    { type: 'tap', kind: 'trill', extraLane: 2, beat: '2' },
    { type: 'body', holdCount: 1, trill: true, extraLane: 2, beat: '2', endBeat: '3' },
  ] });
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();

  // 저장한 차트에는 구형 노트가 없으므로 다시 열어도 묻지 않고, 새로 열면 이전 세션의 검토 목록도 없다.
  await openEditor(page, { chart: savedMain, extra: savedExtra, legacyConversion: 'manual' });
  await expect(legacyConversionOffer(page)).toHaveCount(0);
  expect(await notes(page)).toEqual(converted);
  await expect(page.getByRole('button', { name: '변환 검토 2건', exact: true })).toHaveCount(0);
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test('구형 노트 차트에서 구형 그대로 열기를 누르면 노트·저장 상태·Undo가 그대로이고 다시 열면 또 묻는다', async ({ page }) => {
  const editor = await openEditor(page, { chart: legacyMain, extra: legacyExtra, legacyConversion: 'manual' });
  const before = await notes(page);
  await legacyConversionOffer(page).getByRole('button', { name: '구형 그대로 열기', exact: true }).click();
  await expect(legacyConversionOffer(page)).toBeHidden();

  expect(await notes(page)).toEqual(before);
  expect(before.map(note => note.type)).toEqual(LEGACY_TYPES);
  await expect(page.getByRole('button', { name: 'Save chart', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^변환 검토/ })).toHaveCount(0);

  await openEditor(page, { chart: legacyMain, extra: legacyExtra, legacyConversion: 'manual' });
  await expect(legacyConversionOffer(page)).toBeVisible();
  await expect(legacyConversionOffer(page).getByLabel('변환하면 만들 노트 수')).toContainText(COUNTS);
  expect(editor.supabaseWrites).toEqual([]);
  expect(editor.unexpectedSupabaseRequests).toEqual([]);
});

test.describe('390×844 좁은 화면', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('변환 검토 목록은 캔버스를 가리지 않고 아래 칸에 붙으며 보조 레인 2 행을 누르면 그 트릴 바디를 선택한다', async ({ page }) => {
    await openEditor(page, { chart: legacyMain, extra: legacyExtra, legacyConversion: 'manual' });
    await legacyConversionOffer(page).getByRole('button', { name: '변환', exact: true }).click();
    await legacyConversionResult(page).getByRole('button', { name: '검토 목록 열기', exact: true }).click();

    const review = reviewPanel(page);
    await expect(review).toBeVisible();
    const canvas = (await page.locator('canvas').boundingBox())!;
    const panel = (await review.boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);
    expect(panel.y + panel.height).toBeLessThanOrEqual(844 + 0.5);
    expect(panel.width).toBeCloseTo(390, 0);
    expect(canvas.height).toBeGreaterThan(300);

    await review.getByRole('listitem').nth(1).getByRole('button').click();
    await expect.poll(() => cursorAndSelection(page)).toEqual({ mode: 'select', currentTimeMs: 1500, selected: [
      { type: 'body', lane: 6, beat: '2', endBeat: '3' },
    ] });
  });
});
