import { test, expect as baseExpect, type Page } from '@playwright/test';
import { canvasPosition, timingColumnPosition } from './explicitEditorTestHelpers';
import { editorTestChart, openEditor, timelineCanvas, waitForTimelineReady } from './editorTestSetup';

// 이 파일은 한 테스트에 전체 렌더를 부르는 단계(선택·접기·붙여넣기·Undo)가 많다. SwiftShader 병렬 실행에서는 선택 한 번의 렌더가
// 메인 스레드를 6～9초 잡아(기능 전 커밋도 같다) 기본 5초 대기·60초 제한으로는 부하에 밀린다.
const expect = baseExpect.configure({ timeout: 30_000 });
test.setTimeout(120_000);

const STORAGE_KEY = 'not4k-editor-song-common-collapsed';
const collapseButton = (page: Page) => page.getByRole('button', { name: 'BPM·박자표 열 접기', exact: true });
const expandButton = (page: Page) => page.getByRole('button', { name: 'BPM·박자표 열 펼치기', exact: true });

/** 0박 초기 설정과 4박 BPM 180, 1박 탭이 있는 차트. */
function chartWithBpmAtBeat4() {
  const chart = editorTestChart([{ type: 'single', lane: 1, beat: '1' }]);
  return { ...chart, events: [...chart.events, { type: 'bpm' as const, beat: '4', bpm: 180 }] };
}

async function editorState(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    const { chart, selection, songCommonCollapsed, editTransaction } = (await import(path)).useEditorStore.getState();
    return {
      songCommonCollapsed: songCommonCollapsed as boolean,
      noteCount: chart.notes.length as number,
      bpmCount: chart.events.filter((event: { type: string }) => event.type === 'bpm').length as number,
      selectedNotes: selection.notes.size as number,
      selectedEvents: selection.events.size as number,
      pending: editTransaction !== null,
    };
  });
}

/** 다시 불러온 페이지도 `openEditor`처럼 타임라인 초기화까지 기다린다. 개발 서버의 전체 로드는 기본 5초를 넘길 수 있다. */
async function reloadEditor(page: Page) {
  await page.reload();
  await timelineCanvas(page).waitFor({ timeout: 30_000 });
  await waitForTimelineReady(page);
}

const storedValue = (page: Page) => page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEY);

/**
 * Select 모드로 바꾼다. 구형 노트 차트는 `openEditor`가 변환 모달을 닫고 돌아오는데, 단축키 차단은 그 뒤 passive effect에서 풀려
 * 바로 누른 S가 무시될 수 있다.
 */
async function enterSelectMode(page: Page) {
  await expect(async () => {
    await page.keyboard.press('s');
    const mode = await page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      return (await import(path)).useEditorStore.getState().mode as string;
    });
    expect(mode).toBe('select');
  }).toPass({ timeout: 30_000 });
}

/** Select 모드로 바꾸고 Ctrl+A로 `noteCount`개 노트를 고른다. 모드 전환은 다음 렌더에야 단축키에 닿아 첫 입력이 무시될 수 있다. */
async function selectAllInSelectMode(page: Page, noteCount: number) {
  await enterSelectMode(page);
  await expect(async () => {
    await page.keyboard.press('Control+a');
    expect((await editorState(page)).selectedNotes).toBe(noteCount);
  }).toPass({ timeout: 30_000 });
}

/** Select 모드로 바꾸고 4박 BPM을 눌러 고른 뒤 복사한다. */
async function copyBpmAtBeat4(page: Page) {
  await enterSelectMode(page);
  const column = await timingColumnPosition(page, 'bpm', 4);
  // 모드 전환은 다음 렌더에야 캔버스 입력에 닿아 첫 클릭이 Create 모드로 갈 수 있다.
  await expect(async () => {
    await page.mouse.click(column.x, column.y);
    expect((await editorState(page)).selectedEvents).toBe(1);
  }).toPass({ timeout: 30_000 });
  await page.keyboard.press('Control+c');
  await expect(page.getByText('1개 항목 복사됨', { exact: true })).toBeVisible();
}

/** 왼쪽 마디 레일을 눌러 커서를 옮긴다. 붙여넣기는 커서에 놓이므로 초기 BPM이 있는 0박을 피한다. */
async function seekOnRail(page: Page, at: number) {
  const box = (await timelineCanvas(page).boundingBox())!;
  const { y } = await canvasPosition(page, 1, at);
  await page.mouse.click(box.x + 4, y);
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/editor/stores/editorStore.ts';
    return (await import(path)).useEditorStore.getState().currentTimeMs as number;
  })).toBeGreaterThan(0);
}

test.describe('넓은 화면', () => {
  test('저장값이 없으면 펼친 채 시작하고 접으면 펼치기 버튼만 남아 메인 레인 1이 곡 공통 폭 108px만큼 왼쪽으로 온다', async ({ page }) => {
    await openEditor(page);
    await expect(collapseButton(page)).toBeVisible();
    await expect(collapseButton(page)).toHaveAttribute('aria-expanded', 'true');
    const before = await canvasPosition(page, 1, 1);

    await collapseButton(page).click();

    await expect(expandButton(page)).toBeVisible();
    await expect(expandButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(collapseButton(page)).toHaveCount(0);
    expect((await editorState(page)).songCommonCollapsed).toBe(true);
    const after = await canvasPosition(page, 1, 1);
    expect(before.x - after.x).toBeCloseTo(108, 0);
    expect(after.y).toBeCloseTo(before.y, 3);
  });

  test('버튼은 마디 레일 맨 위에 있어 접어도 펼쳐도 메인 레인 1 왼쪽에 놓이고 첫 곡 공통 열을 덮지 않는다', async ({ page }) => {
    await openEditor(page);
    const canvas = (await timelineCanvas(page).boundingBox())!;
    const expanded = (await collapseButton(page).boundingBox())!;
    const bpm = await timingColumnPosition(page, 'bpm', 1);
    expect(expanded.y).toBeCloseTo(canvas.y, 0);
    expect(expanded.x + expanded.width).toBeLessThanOrEqual(bpm.x - 29);

    await collapseButton(page).click();

    const collapsed = (await expandButton(page).boundingBox())!;
    const lane = await canvasPosition(page, 1, 1);
    expect(collapsed.x + collapsed.width).toBeLessThanOrEqual(lane.x - 29);
  });

  test('마우스를 옮기지 않고 같은 좌표를 세 번 누르면 접고 펼치고 접으며 BPM이 생기지 않고 커서도 움직이지 않는다', async ({ page }) => {
    await openEditor(page);
    const button = (await collapseButton(page).boundingBox())!;
    const x = button.x + button.width / 2;
    const y = button.y + button.height / 2;
    const before = await editorState(page);

    await page.mouse.click(x, y);
    await expect(expandButton(page)).toBeVisible();
    await page.mouse.click(x, y);
    await expect(collapseButton(page)).toBeVisible();
    await page.mouse.click(x, y);
    await expect(expandButton(page)).toBeVisible();

    expect((await expandButton(page).boundingBox())!.x).toBeCloseTo(button.x, 0);
    const after = await editorState(page);
    expect(after.bpmCount).toBe(before.bpmCount);
    const currentTimeMs = await page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      return (await import(path)).useEditorStore.getState().currentTimeMs as number;
    });
    expect(currentTimeMs).toBe(0);
  });

  test('접고 다시 불러와도 접힌 채 시작하고 펼치면 다시 불러온 뒤에도 펼쳐져 있다', async ({ page }) => {
    await openEditor(page);
    await collapseButton(page).click();
    expect(await storedValue(page)).toBe('true');

    await reloadEditor(page);
    await expect(expandButton(page)).toBeVisible();
    expect((await editorState(page)).songCommonCollapsed).toBe(true);

    await expandButton(page).click();
    expect(await storedValue(page)).toBe('false');
    await reloadEditor(page);
    await expect(collapseButton(page)).toBeVisible();
  });

  test('접어도 미저장 표시가 생기지 않고 Save 버튼은 저장할 변경이 없는 상태로 남는다', async ({ page }) => {
    await openEditor(page);
    await collapseButton(page).click();
    await expect(page.getByRole('button', { name: 'Save, unsaved changes', exact: true })).toHaveCount(0);
  });

  test('곡 행이 없는 차트에서도 같은 버튼으로 접고 펼친다', async ({ page }) => {
    await openEditor(page, { songRow: false });
    await collapseButton(page).click();
    await expect(expandButton(page)).toBeVisible();
    await expandButton(page).click();
    await expect(collapseButton(page)).toBeVisible();
  });

  test('Tab으로 온 포커스에서 Enter·Space로 접고 펼치며 재생은 시작되지 않고 뒤따르는 S 키는 Select 모드로 바꾼다', async ({ page }) => {
    await openEditor(page);
    await collapseButton(page).focus();

    await page.keyboard.press('Enter');
    await expect(expandButton(page)).toBeFocused();
    expect((await editorState(page)).songCommonCollapsed).toBe(true);

    await page.keyboard.press('Space');
    await expect(collapseButton(page)).toBeFocused();
    expect((await editorState(page)).songCommonCollapsed).toBe(false);

    await page.keyboard.press('s');
    await expect.poll(() => page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      const { mode, isPlaying } = (await import(path)).useEditorStore.getState();
      return { mode, isPlaying };
    })).toEqual({ mode: 'select', isPlaying: false });
  });

  test('마우스로 접은 뒤에도 Space가 버튼을 다시 누르지 않고 단축키로 간다', async ({ page }) => {
    await openEditor(page);
    await collapseButton(page).click();
    await expect(expandButton(page)).not.toBeFocused();
    await page.keyboard.press('s');
    await expect.poll(() => page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      return (await import(path)).useEditorStore.getState().mode;
    })).toBe('select');
  });

  test('접은 채 Ctrl+A와 Delete를 눌러도 숨은 4박 BPM은 남고 1박 탭만 지워진다', async ({ page }) => {
    await openEditor(page, { chart: chartWithBpmAtBeat4() });
    await collapseButton(page).click();

    await selectAllInSelectMode(page, 1);
    expect((await editorState(page)).selectedEvents).toBe(0);
    await page.keyboard.press('Delete');

    await expect.poll(() => editorState(page)).toMatchObject({ noteCount: 0, bpmCount: 2 });
  });

  test('펼친 채 Ctrl+A는 4박 BPM도 고르고 접으면 그 선택이 빠진다', async ({ page }) => {
    await openEditor(page, { chart: chartWithBpmAtBeat4() });
    await selectAllInSelectMode(page, 1);
    expect((await editorState(page)).selectedEvents).toBe(1);

    await collapseButton(page).click();

    await expect.poll(async () => (await editorState(page)).selectedEvents).toBe(0);
  });

  test('4박 BPM을 복사하고 접은 뒤 붙이면 펼쳐지고 저장값은 접힘으로 남으며 Undo해도 다시 접히지 않는다', async ({ page }) => {
    await openEditor(page, { chart: chartWithBpmAtBeat4() });
    await copyBpmAtBeat4(page);
    await seekOnRail(page, 2);
    await collapseButton(page).click();

    await page.keyboard.press('Control+v');

    await expect(collapseButton(page)).toBeVisible();
    await expect.poll(() => editorState(page)).toMatchObject({ songCommonCollapsed: false, bpmCount: 3, selectedEvents: 1, pending: true });
    expect(await storedValue(page)).toBe('true');

    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+z');
    await expect.poll(() => editorState(page)).toMatchObject({ songCommonCollapsed: false, bpmCount: 2 });
  });

  test('접은 채 4박 BPM 삭제를 Undo해도 펼쳐지지 않고 BPM은 차트로 돌아온다', async ({ page }) => {
    await openEditor(page, { chart: chartWithBpmAtBeat4() });
    await copyBpmAtBeat4(page);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await editorState(page)).bpmCount).toBe(1);
    await collapseButton(page).click();

    await page.keyboard.press('Control+z');

    await expect.poll(() => editorState(page)).toMatchObject({ songCommonCollapsed: true, bpmCount: 2 });
    await expect(expandButton(page)).toBeVisible();
  });

  test('붙여넣기 대기 중 접으면 그 자리로 확정하고 Undo 1번에 붙인 BPM이 사라진다', async ({ page }) => {
    await openEditor(page, { chart: chartWithBpmAtBeat4() });
    await copyBpmAtBeat4(page);
    await seekOnRail(page, 2);
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await editorState(page)).pending).toBe(true);

    await collapseButton(page).click();

    await expect.poll(() => editorState(page)).toMatchObject({ songCommonCollapsed: true, pending: false, selectedEvents: 0, bpmCount: 3 });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await editorState(page)).bpmCount).toBe(2);
  });

  test('접은 채 Create 모드로 펼친 배치의 bpm 열 자리를 눌러도 BPM이 생기지 않고 커서만 그 자리로 옮겨진다', async ({ page }) => {
    await openEditor(page);
    const column = await timingColumnPosition(page, 'bpm', 2);
    await collapseButton(page).click();

    await page.mouse.click(column.x, column.y);

    await expect.poll(() => page.evaluate(async () => {
      const path = '/src/editor/stores/editorStore.ts';
      return (await import(path)).useEditorStore.getState().currentTimeMs as number;
    })).toBeGreaterThan(0);
    expect(await editorState(page)).toMatchObject({ bpmCount: 1, noteCount: 0 });
  });
});

test.describe('좁은 화면', () => {
  test.use({ viewport: { width: 500, height: 800 } });

  test('저장값이 없으면 접힌 채 시작하고 펼치면 그 값이 저장되어 다시 불러와도 펼쳐져 있다', async ({ page }) => {
    await openEditor(page);
    await expect(expandButton(page)).toBeVisible();
    expect((await editorState(page)).songCommonCollapsed).toBe(true);
    expect(await storedValue(page)).toBeNull();

    await expandButton(page).click();
    await expect(collapseButton(page)).toBeVisible();
    expect(await storedValue(page)).toBe('false');

    await reloadEditor(page);
    await expect(collapseButton(page)).toBeVisible();
  });

  test('접힌 채 시작한 뒤 BPM을 붙여 자동으로 펼쳐져도 값을 저장하지 않아 다시 불러오면 접힌 채 시작한다', async ({ page }) => {
    await openEditor(page, { chart: chartWithBpmAtBeat4() });
    await expandButton(page).click();
    await copyBpmAtBeat4(page);
    await seekOnRail(page, 2);
    await collapseButton(page).click();
    await page.evaluate(key => window.localStorage.removeItem(key), STORAGE_KEY);

    await page.keyboard.press('Control+v');
    await expect(collapseButton(page)).toBeVisible();
    expect(await storedValue(page)).toBeNull();

    await reloadEditor(page);
    await expect(expandButton(page)).toBeVisible();
  });

  test('시작부터 접힌 채 Create 모드로 레인 1 4박을 누르면 BPM 없이 탭이 놓이고 펼친 뒤 bpm 열을 누르면 BPM이 생긴다', async ({ page }) => {
    await openEditor(page);
    const lane = await canvasPosition(page, 1, 4);
    await page.mouse.click(lane.x, lane.y);
    await expect.poll(() => editorState(page)).toMatchObject({ noteCount: 1, bpmCount: 1 });

    await expandButton(page).click();

    const column = await timingColumnPosition(page, 'bpm', 4);
    await page.mouse.click(column.x, column.y);
    await expect.poll(() => editorState(page)).toMatchObject({ noteCount: 1, bpmCount: 2 });
  });
});

test.describe('휴대폰 폭', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('접힌 채 레인을 가로로 민 뒤 펼치면 왼쪽 끝으로 돌아가 bpm 열을 눌러 BPM을 만들 수 있다', async ({ page }) => {
    await openEditor(page);
    const canvas = (await timelineCanvas(page).boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Shift');

    await expandButton(page).click();

    const column = await timingColumnPosition(page, 'bpm', 4);
    await page.mouse.click(column.x, column.y);
    await expect.poll(async () => (await editorState(page)).bpmCount).toBe(2);
  });
});
