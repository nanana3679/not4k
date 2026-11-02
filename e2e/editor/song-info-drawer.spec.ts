/**
 * 곡 정보 드로어와 미저장 변경 확인(RFD 0098).
 *
 * 곡 행이 있는 차트는 툴바의 Song Info로 왼쪽 비모달 드로어를 연다. 열린 채 타임라인 편집·재생을 쓰며, 오프셋은 재생 중
 * 수정할 수 없다(RFD 0099). 미저장 곡 정보가 있으면 드로어 닫기·같은 곡의 다른 차트 전환 전에 저장 또는 변경 취소를 고르고,
 * 에디터 이탈은 저장 후 이동·버리고 이동·취소를 고른다. 테스트 음원은 0.5초라 재생을 확인하는 테스트는 30 BPM 차트(1마디 = 8초)를 쓴다.
 */
import { expect, test, type Page } from '@playwright/test';
import type { ChartJsonV4 } from '../../src/shared/chart';
import { LEAVE_CONFIRM_COPY, PAUSE_TO_EDIT_COPY, SONG_INFO_UNSAVED_COPY } from '../../src/editor/editorCopy';
import { editorTestChart, isChartUploadPath, openEditor, timelineCanvas } from './editorTestSetup';
import { canvasPosition } from './explicitEditorTestHelpers';

test.setTimeout(60_000);

const timing = { bpmChanges: [{ beat: '0', bpm: 120 }], timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 0 };
const songInfo = (page: Page) => page.getByRole('complementary', { name: 'Song Info', exact: true });
const songInfoDialog = (page: Page) => page.getByRole('dialog', { name: SONG_INFO_UNSAVED_COPY.title, exact: true });
const leaveDialog = (page: Page) => page.getByRole('dialog', { name: LEAVE_CONFIRM_COPY.title, exact: true });
const unsavedSave = (page: Page) => page.getByRole('button', { name: 'Save, unsaved changes', exact: true });

async function openSongInfo(page: Page) {
  await page.getByRole('button', { name: 'Song Info', exact: true }).click();
  await expect(songInfo(page)).toBeVisible();
}

async function fillTitle(page: Page, title: string) {
  const field = songInfo(page).getByLabel('Title', { exact: true });
  await field.fill(title);
  await field.press('Enter');
}

async function editorState(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const store = (await import(path)).useEditorStore.getState();
    return { title: store.chart.meta.title as string, offsetMs: store.chart.meta.offsetMs as number,
      notes: store.chart.notes.length as number, isPlaying: store.isPlaying as boolean };
  });
}

/** More 메뉴의 보조 레인 수를 3으로 바꿔 차트만 미저장으로 만든다. */
async function makeChartDirty(page: Page) {
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.locator('select').filter({ has: page.locator('option[value="10"]') }).selectOption('3');
  await page.mouse.click(10, 100);
  await expect(unsavedSave(page)).toBeVisible();
}

async function requestLeave(page: Page) {
  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Songs', exact: true }).click();
  await expect(leaveDialog(page)).toBeVisible();
}

test.describe('곡 정보 드로어', () => {
  test('드로어를 연 채 Play로 재생하면 Offset 입력·증감 버튼은 비활성이고 Title은 활성이며, Pause 뒤 Offset 45를 적용하고 Offset 입력에서 50을 친 채 Space를 누르면 50을 적용하고 재생한다', async ({ page }) => {
    const slow: ChartJsonV4 = { ...editorTestChart(), version: 4, notes: [],
      events: [{ type: 'bpm', beat: '0', bpm: 30, editorLane: 1 }, { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 }] };
    await openEditor(page, { audio: true, chart: slow });
    await openSongInfo(page);
    await expect(timelineCanvas(page)).toBeVisible();
    const offset = songInfo(page).getByLabel('Offset (ms)', { exact: true });

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect(offset).toBeDisabled();
    await expect(offset).toHaveAttribute('title', PAUSE_TO_EDIT_COPY);
    await expect(songInfo(page).getByRole('button', { name: '+10', exact: true })).toBeDisabled();
    await expect(songInfo(page).getByLabel('Title', { exact: true })).toBeEnabled();

    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(offset).toBeEnabled();
    await offset.fill('45');
    await offset.press('Enter');
    await expect.poll(async () => (await editorState(page)).offsetMs).toBe(45);
    await expect(songInfo(page)).toBeVisible();

    await offset.fill('50');
    await offset.press('Space');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    expect(await editorState(page)).toMatchObject({ offsetMs: 50, isPlaying: true });
  });

  test('Title을 바꾸고 닫기를 누르면 확인 창이 저장 후 닫기에 포커스를 두고 뒤 화면을 막으며, Tab은 창 안에서 돌고 Escape는 취소로 닫은 뒤 포커스를 닫기 버튼에 돌려준다', async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing });
    await openSongInfo(page);
    await fillTitle(page, '새 제목');
    const close = songInfo(page).getByRole('button', { name: 'Close song info', exact: true });

    await close.click();
    const dialog = songInfoDialog(page);
    await expect(dialog.getByRole('button', { name: '저장 후 닫기', exact: true })).toBeFocused();
    await expect(page.locator('div[inert]')).toHaveCount(1);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: '저장 후 닫기', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('div[inert]')).toHaveCount(0);
    await expect(close).toBeFocused();
    await expect(songInfo(page).getByLabel('Title', { exact: true })).toHaveValue('새 제목');
    expect(editor.supabaseWrites).toEqual([]);
  });

  test('S로 Select 모드에 둔 뒤 Upload Jacket 버튼에 키보드 포커스를 두고 Enter를 누르면 배치 확정 단축키가 아니라 파일 선택 창이 열리고 고른 new.png가 미리보기에 보인다', async ({ page }) => {
    await openEditor(page, { songTiming: timing });
    // 파일 선택 창 가로채기는 기다리기 시작한 뒤 비동기로 켜진다(Playwright가 응답을 기다리지 않는다). 키 한 번은 그보다 먼저
    // 창을 열 수 있으므로, 드로어를 열기 전에 기다리기 시작해 Enter를 누를 때는 가로채기가 켜져 있게 한다.
    const chooser = page.waitForEvent('filechooser');
    await openSongInfo(page);
    // 포커스는 드로어 밖(툴바의 Song Info)이라 S는 단축키다. Select 모드의 Enter는 배치 확정 단축키다.
    await page.keyboard.press('s');
    await expect.poll(() => page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      return (await import(path)).useEditorStore.getState().mode as string;
    })).toBe('select');
    const upload = songInfo(page).getByRole('button', { name: 'Upload Jacket', exact: true });

    await upload.focus();
    await page.keyboard.press('Enter');
    await (await chooser).setFiles({ name: 'new.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });

    await expect(songInfo(page).getByRole('img', { name: 'Jacket', exact: true })).toBeVisible();
    await expect(unsavedSave(page)).toBeVisible();
  });

  test('Title을 새 제목으로 바꾸고 닫기를 누르면 Unsaved Song Info 확인이 뜨고, 취소하면 드로어와 새 제목이 남는다', async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing });
    await openSongInfo(page);
    await fillTitle(page, '새 제목');

    await songInfo(page).getByRole('button', { name: 'Close song info', exact: true }).click();
    await expect(songInfoDialog(page)).toBeVisible();
    await expect(songInfoDialog(page).getByText(SONG_INFO_UNSAVED_COPY.closeBody, { exact: true })).toBeVisible();
    await songInfoDialog(page).getByRole('button', { name: '취소', exact: true }).click();

    await expect(songInfoDialog(page)).toHaveCount(0);
    await expect(songInfo(page)).toBeVisible();
    await expect(songInfo(page).getByLabel('Title', { exact: true })).toHaveValue('새 제목');
    expect(editor.supabaseWrites).toEqual([]);
  });

  test('드로어를 연 채 1레인 2박에 탭을 놓고 Title을 바꾼 뒤 변경 취소 후 닫기를 고르면 제목만 돌아가 탭은 남고 Ctrl+Z로 새 제목이 돌아온다', async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing });
    await openSongInfo(page);
    const point = await canvasPosition(page, 1, 2);
    await page.mouse.click(point.x, point.y);
    await expect.poll(async () => (await editorState(page)).notes).toBe(1);
    await fillTitle(page, '새 제목');

    await songInfo(page).getByRole('button', { name: 'Close song info', exact: true }).click();
    await songInfoDialog(page).getByRole('button', { name: '변경 취소 후 닫기', exact: true }).click();

    await expect(songInfo(page)).toHaveCount(0);
    expect(await editorState(page)).toMatchObject({ title: 'E2E 에디터 곡', notes: 1 });
    await expect(unsavedSave(page)).toBeVisible();
    expect(editor.supabaseWrites).toEqual([]);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await editorState(page)).title).toBe('새 제목');
    expect((await editorState(page)).notes).toBe(1);
  });

  test('Title을 바꾼 뒤 저장 후 닫기를 고르면 save_song 1회 뒤 드로어가 닫히고 Save 표시가 깨끗하다', async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing });
    await openSongInfo(page);
    await fillTitle(page, '새 제목');

    await songInfo(page).getByRole('button', { name: 'Close song info', exact: true }).click();
    await songInfoDialog(page).getByRole('button', { name: '저장 후 닫기', exact: true }).click();

    await expect(page.getByText('Song saved', { exact: true })).toBeVisible();
    await expect(songInfo(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    const songSaves = editor.supabaseWrites.filter(write => write.path === '/rest/v1/rpc/save_song');
    expect(songSaves).toHaveLength(1);
    expect(JSON.parse(songSaves[0].body!)).toMatchObject({ p_title: '새 제목' });
    expect(editor.unexpectedSupabaseRequests).toEqual([]);
  });

  test('save_song이 PT409로 거부되면 저장 후 닫기를 골라도 드로어와 새 제목이 남는다', async ({ page }) => {
    await openEditor(page, { songTiming: timing, songSaveError: 'PT409' });
    await openSongInfo(page);
    await fillTitle(page, '새 제목');

    await songInfo(page).getByRole('button', { name: 'Close song info', exact: true }).click();
    await songInfoDialog(page).getByRole('button', { name: '저장 후 닫기', exact: true }).click();

    await expect(page.getByText('다른 곳에서 곡을 변경했습니다', { exact: false })).toBeVisible();
    await expect(songInfo(page)).toBeVisible();
    await expect(songInfo(page).getByLabel('Title', { exact: true })).toHaveValue('새 제목');
    await expect(unsavedSave(page)).toBeVisible();
  });
});

test.describe('같은 곡의 다른 차트로 전환', () => {
  test('변경이 없으면 차트 목록의 BREAKTHROUGH(hard)를 누르는 즉시 difficulty=hard를 연다', async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing, otherCharts: { hard: editorTestChart() } });
    await openSongInfo(page);
    await expect(songInfo(page).getByRole('button', { name: /INFILTRATION/ })).toBeDisabled();

    await songInfo(page).getByRole('button', { name: 'BREAKTHROUGH', exact: true }).click();

    await expect(page).toHaveURL(/\/editor\?songId=e2e-editor-song&difficulty=hard$/);
    await expect(timelineCanvas(page)).toBeVisible();
    expect(editor.supabaseWrites).toEqual([]);
  });

  test('Title을 바꾼 뒤 hard를 누르면 곡 정보 확인이 뜨고 변경 취소 후 전환을 고르면 저장 없이 hard를 연다', async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing, otherCharts: { hard: editorTestChart() } });
    await openSongInfo(page);
    await fillTitle(page, '새 제목');

    await songInfo(page).getByRole('button', { name: 'BREAKTHROUGH', exact: true }).click();
    await expect(songInfoDialog(page).getByText(SONG_INFO_UNSAVED_COPY.switchBody, { exact: true })).toBeVisible();
    await songInfoDialog(page).getByRole('button', { name: '변경 취소 후 전환', exact: true }).click();

    await expect(page).toHaveURL(/difficulty=hard$/);
    expect(editor.supabaseWrites).toEqual([]);
  });

  test('Title을 바꾸고 hard 전환에서 취소를 고르면 normal에 남고 새 제목이 유지된다', async ({ page }) => {
    await openEditor(page, { songTiming: timing, otherCharts: { hard: editorTestChart() } });
    await openSongInfo(page);
    await fillTitle(page, '새 제목');

    await songInfo(page).getByRole('button', { name: 'BREAKTHROUGH', exact: true }).click();
    await songInfoDialog(page).getByRole('button', { name: '취소', exact: true }).click();

    await expect(page).toHaveURL(/difficulty=normal$/);
    expect((await editorState(page)).title).toBe('새 제목');
  });
});

test.describe('에디터 이탈의 저장 후 이동·버리고 이동·취소', () => {
  test('보조 레인 수를 3으로 바꾸고 Back to Songs에서 취소를 고르면 에디터에 남고 미저장 표시가 남는다', async ({ page }) => {
    await openEditor(page, { songTiming: timing });
    await makeChartDirty(page);

    await requestLeave(page);
    await expect(leaveDialog(page).getByRole('button', { name: '저장 후 이동', exact: true })).toBeVisible();
    await leaveDialog(page).getByRole('button', { name: '취소', exact: true }).click();

    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/editor\?/);
    await expect(unsavedSave(page)).toBeVisible();
  });

  test('저장 후 이동을 고르면 차트를 새 경로에 올리고 save_chart로 확정한 뒤 /game으로 이동한다', async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing });
    await makeChartDirty(page);

    await requestLeave(page);
    await leaveDialog(page).getByRole('button', { name: '저장 후 이동', exact: true }).click();

    await expect(page).toHaveURL(/\/game$/);
    const paths = editor.supabaseWrites.map(write => write.path);
    expect(paths.some(path => isChartUploadPath(path))).toBe(true);
    expect(paths).toContain('/rest/v1/rpc/save_chart');
  });

  test('버리고 이동을 고르면 아무것도 저장하지 않고 /game으로 이동한다', async ({ page }) => {
    const editor = await openEditor(page, { songTiming: timing });
    await makeChartDirty(page);

    await requestLeave(page);
    await leaveDialog(page).getByRole('button', { name: '버리고 이동', exact: true }).click();

    await expect(page).toHaveURL(/\/game$/);
    expect(editor.supabaseWrites).toEqual([]);
  });

  test('저장 후 이동에서 save_chart가 PT409로 거부되면 이동하지 않고 미저장 표시가 남는다', async ({ page }) => {
    await openEditor(page, { songTiming: timing, chartSaveError: 'PT409' });
    await makeChartDirty(page);

    await requestLeave(page);
    await leaveDialog(page).getByRole('button', { name: '저장 후 이동', exact: true }).click();

    await expect(page.getByText('다른 곳에서 이 차트를 저장했습니다', { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/editor\?/);
    await expect(unsavedSave(page)).toBeVisible();
  });
});

test('곡 행이 없는 차트는 Song Info 없이 More 메뉴의 Offset 줄로 오프셋을 편집한다', async ({ page }) => {
  await openEditor(page, { songRow: false });
  await expect(page.getByRole('button', { name: 'Song Info', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'More editor actions', exact: true }).click();
  await page.getByRole('button', { name: 'Offset', exact: true }).click();

  await expect(page.getByLabel('Audio offset milliseconds', { exact: true })).toBeVisible();
});
