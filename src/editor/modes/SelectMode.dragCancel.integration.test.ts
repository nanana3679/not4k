/**
 * 진행 중 select 드래그 × 실제 editorStore — 모드 전환·undo/redo·차트 교체·Esc가 드래그를 먼저 끝내는지.
 *
 * App 배선을 그대로 따른다: SelectMode의 차트 쓰기는 store.setChart로 가고, store가 차트를 바꾸면
 * SelectMode.setChart로 되먹인다(App의 [chart] effect). selectDragControl은 캔버스 훅처럼
 * createSelectDragControl로 store에 등록하고, dragCheckpoint는 App처럼 store 액션에 잇는다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectMode } from "./SelectMode";
import { createSelectDragControl } from "./selectDragControl";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import { useEditorStore } from "../stores/editorStore";
import { emptySelection } from "../stores/selectionSlice";
import { beat, beatToFloat } from "../../shared";
import type { Chart, NoteEntity } from "../../shared";

vi.mock("../../shared/toast", () => ({ showToast: vi.fn() }));

function fullChart(notes: NoteEntity[]): Chart {
  return {
    meta: {
      title: "Test",
      artist: "",
      difficultyLabel: "NORMAL",
      difficultyLevel: 1,
      imageFile: "",
      audioFile: "",
      previewAudioFile: "",
      offsetMs: 0,
    },
    notes,
    trillZones: [],
    events: [
      { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: "timeSignature", beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ],
  };
}

// 노트 A = lane 1·beat 0 → 좌표 (1, 0), 노트 B = lane 3·beat 4 → 좌표 (3, 4)
const noteA: NoteEntity = { type: "single", lane: 1, beat: beat(0) };
const noteB: NoteEntity = { type: "single", lane: 3, beat: beat(4) };

const unsubscribers: (() => void)[] = [];

afterEach(() => {
  while (unsubscribers.length > 0) unsubscribers.pop()?.();
  vi.useRealTimers();
});

/** history 병합창(600ms)을 다루려고 Date만 가짜 시계로 바꾼다. */
function setClock(ms: number): void {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(ms);
}

function setup(notes: NoteEntity[]) {
  useEditorStore.setState({
    chart: fullChart(notes),
    mode: "select",
    selection: emptySelection(),
    historyPast: [],
    historyFuture: [],
    historyLastCaptureAt: 0,
    lastValidSnapshot: null,
    selectDragControl: null,
    dragCheckpoint: null,
  });
  const mode = new SelectMode(useEditorStore.getState().chart, {
    onChartUpdate: (c) => useEditorStore.getState().setChart(c),
    getSelection: () => useEditorStore.getState().selection,
    setSelection: (s) => useEditorStore.getState().setSelection(s),
    setSelectionTransient: (s) => useEditorStore.getState().setSelectionTransient(s),
    space: makeFakeSpace({
      hitTestUnifiedNote: (x, y) => (x === 1 && y === 0 ? 0 : x === 3 && y === 4 ? 1 : null),
    }),
    // App과 같은 배선 — 프레임을 쓴 드래그의 취소는 store의 dragCheckpoint로 되돌린다
    dragCheckpoint: {
      capture: () => useEditorStore.getState().captureDragCheckpoint(),
      restore: () => useEditorStore.getState().restoreDragCheckpoint(),
      discard: () => useEditorStore.getState().discardDragCheckpoint(),
    },
  });
  // App의 [chart] effect — store 차트가 바뀌면(undo·loadChart 등 포함) 모드에 되먹인다
  unsubscribers.push(useEditorStore.subscribe((state, prev) => {
    if (state.chart !== prev.chart) mode.setChart(state.chart);
  }));
  const renderer = { clearMoveOrigins: vi.fn(), clearBoxSelectRect: vi.fn() };
  useEditorStore.getState().setSelectDragControl(createSelectDragControl(() => mode, () => renderer));
  return { mode, renderer, store: useEditorStore };
}

/** 노트 A를 잡아 (2, 3)으로 끈다 — 프리뷰가 라이브로 적용돼 A가 lane 2·beat 3에 있다. */
function dragNoteA(mode: SelectMode): void {
  mode.onPointerDown(1, 0, false, false); // 미선택 A 클릭 = 단독 선택 + 이동 드래그 시작
  mode.onPointerMove(2, 3);
}

function laneBeat(index: number): [number, number] {
  const note = useEditorStore.getState().chart.notes[index];
  return [note.lane, beatToFloat(note.beat)];
}

describe("진행 중 select 드래그 × 모드 전환(setMode)", () => {
  it("노트 A를 lane 2·beat 3으로 끌던 중 setMode('create')는 A를 원위치(lane 1·beat 0)로 되돌린 뒤 create 모드로 바꾼다", () => {
    const { mode, renderer, store } = setup([noteA]);
    dragNoteA(mode);
    expect(laneBeat(0)).toEqual([2, 3]);

    store.getState().setMode("create");

    expect(store.getState().mode).toBe("create");
    expect(laneBeat(0)).toEqual([1, 0]);
    expect(mode.isMoveDragging).toBe(false);
    expect(renderer.clearMoveOrigins).toHaveBeenCalled(); // 원위치 고스트가 create 모드 렌더에 남지 않는다
  });

  it("모드 전환으로 끝난 드래그는 select로 돌아와 버튼 없이 lane 4·beat 6으로 움직여도 노트 A를 옮기지 않는다", () => {
    const { mode, store } = setup([noteA]);
    dragNoteA(mode);

    store.getState().setMode("create");
    store.getState().setMode("select");
    mode.onPointerMove(4, 6);

    expect(laneBeat(0)).toEqual([1, 0]);
  });

  it("드래그 중 같은 select 모드로 setMode('select')를 부르면 드래그를 유지해 노트 A가 lane 2·beat 3에 남는다", () => {
    const { mode, store } = setup([noteA]);
    dragNoteA(mode);

    store.getState().setMode("select");

    expect(mode.isMoveDragging).toBe(true);
    expect(laneBeat(0)).toEqual([2, 3]);
  });
});

describe("진행 중 select 드래그 × undo/redo", () => {
  it("드래그 중 undo()는 드래그만 취소하고 false — 노트 A는 원위치, 드래그 전 편집(노트 B 추가)은 남고 historyFuture는 비어 있다", () => {
    setClock(10_000);
    const { mode, store } = setup([noteA]);
    store.getState().setChart(fullChart([noteA, noteB])); // 드래그 전 편집
    setClock(12_000);
    dragNoteA(mode);

    expect(store.getState().undo()).toBe(false);

    expect(mode.isMoveDragging).toBe(false);
    expect(store.getState().chart.notes).toHaveLength(2); // B 추가가 되돌려지지 않았다
    expect(laneBeat(0)).toEqual([1, 0]);
    expect(store.getState().historyFuture).toHaveLength(0); // undo가 실행됐다면 현재 상태가 future에 쌓인다
  });

  it("안 움직인 드래그(down만) 중 redo()는 드래그만 끝내고 false — redo 스택(노트 B 추가)이 남아 다음 redo()가 B를 다시 적용한다", () => {
    setClock(10_000);
    const { mode, store } = setup([noteA]);
    store.getState().setChart(fullChart([noteA, noteB]));
    expect(store.getState().undo()).toBe(true); // B 추가를 되돌려 redo 스택에 둔다
    mode.onPointerDown(1, 0, false, false); // A를 잡기만 하고 움직이지 않는다

    expect(store.getState().redo()).toBe(false);

    expect(mode.isMoveDragging).toBe(false);
    expect(store.getState().chart.notes).toHaveLength(1);
    expect(store.getState().historyFuture).toHaveLength(1); // 취소가 차트를 다시 쓰지 않아 redo 스택이 그대로다
    expect(store.getState().redo()).toBe(true);
    expect(store.getState().chart.notes).toHaveLength(2);
  });

  it("박스 선택 드래그 중 undo()는 박스를 닫고 시작 전 선택(노트 0)을 되돌린 뒤 false를 반환한다", () => {
    const { mode, store } = setup([noteA, noteB]);
    mode.selectNote(0);
    mode.onPointerDown(4, 9, false, false); // 빈 곳 → 박스 시작(프리뷰로 선택 비움)
    mode.onPointerMove(2, 2); // lane 2~4 × beat 2~9 → 노트 B(1)만 포함
    expect(store.getState().selection.notes).toEqual(new Set([1]));

    expect(store.getState().undo()).toBe(false);

    expect(mode.isBoxSelecting).toBe(false);
    expect(store.getState().selection.notes).toEqual(new Set([0]));
  });
});

describe("진행 중 select 드래그 × Esc(cancelSelectDrag)", () => {
  it("드래그 중 cancelSelectDrag()는 노트 A를 원위치(lane 1·beat 0)로 되돌리고 true, 드래그가 끝난 뒤 다시 부르면 false", () => {
    const { mode, store } = setup([noteA]);
    dragNoteA(mode);

    expect(store.getState().cancelSelectDrag()).toBe(true);

    expect(laneBeat(0)).toEqual([1, 0]);
    expect(mode.isMoveDragging).toBe(false);
    expect(store.getState().cancelSelectDrag()).toBe(false);
  });
});

describe("진행 중 select 드래그 × 차트 교체", () => {
  it("드래그 중 loadChart(새 차트)는 드래그를 버리고 새 차트를 그대로 싣는다 — 이후 lane 4·beat 6으로 움직여도 새 차트가 바뀌지 않는다", () => {
    const { mode, renderer, store } = setup([noteA]);
    dragNoteA(mode);
    const loaded = fullChart([{ type: "single", lane: 4, beat: beat(8) }]);

    store.getState().loadChart(loaded);
    mode.onPointerMove(4, 6);

    expect(store.getState().chart).toBe(loaded);
    expect(mode.isMoveDragging).toBe(false);
    expect(renderer.clearMoveOrigins).toHaveBeenCalled();
  });

  it("드래그 중 revertToLastValid()는 노트 A를 원위치로 되돌린 뒤 마지막 유효 상태로 복귀하고, 이어진 undo()는 끌던 위치(lane 2·beat 3)가 아니라 원위치의 위반 상태로 돌아간다", () => {
    const { mode, store } = setup([noteA]);
    store.getState().loadChart(fullChart([noteA, noteB])); // 유효 차트 → 막다른 탈출 씨앗
    // A와 무관한 위반(노트 B 중복)을 만든다 — A를 끄는 동안에도 차트는 계속 위반이라 씨앗이 바뀌지 않는다
    store.getState().setChart(fullChart([noteA, noteB, noteB]));
    dragNoteA(mode);

    store.getState().revertToLastValid();

    expect(mode.isMoveDragging).toBe(false);
    expect(store.getState().chart.notes).toHaveLength(2); // 마지막 유효 상태(A·B)
    expect(laneBeat(0)).toEqual([1, 0]);

    store.getState().undo();

    expect(store.getState().chart.notes).toHaveLength(3); // 복귀 직전 상태(B 중복)
    expect(laneBeat(0)).toEqual([1, 0]); // 드래그 위치가 아니라 원위치
  });
});

// ---------------------------------------------------------------------------
// 취소 뒤 history — 프레임마다 setChart가 history를 쌓으므로(600ms 병합창), 프레임을 쓴 드래그를
// 취소하면 차트·history·lastValidSnapshot을 첫 프레임 직전 상태로 한 번에 되돌려야 한다.
// ---------------------------------------------------------------------------

/** 첫 프레임 직전과 비교할 store 상태 — 복원은 같은 참조를 되돌려 놓는다. */
function preDragState() {
  const s = useEditorStore.getState();
  return {
    chart: s.chart,
    historyPast: s.historyPast,
    historyFuture: s.historyFuture,
    historyLastCaptureAt: s.historyLastCaptureAt,
    lastValidSnapshot: s.lastValidSnapshot,
  };
}

function expectPreDragState(before: ReturnType<typeof preDragState>): void {
  const s = useEditorStore.getState();
  expect(s.chart).toBe(before.chart);
  expect(s.historyPast).toBe(before.historyPast);
  expect(s.historyFuture).toBe(before.historyFuture);
  expect(s.historyLastCaptureAt).toBe(before.historyLastCaptureAt);
  expect(s.lastValidSnapshot).toBe(before.lastValidSnapshot);
}

describe("진행 중 select 드래그 × 취소 뒤 history(첫 프레임 직전으로 복원)", () => {
  /** 10초에 노트 B를 추가하고 12초에 노트 A를 잡는다(아직 프레임 없음). */
  function setupDragAfterAddingB() {
    setClock(10_000);
    const ctx = setup([noteA]);
    ctx.store.getState().setChart(fullChart([noteA, noteB]));
    setClock(12_000);
    ctx.mode.onPointerDown(1, 0, false, false); // A 단독 선택 + 이동 드래그 시작
    return { ...ctx, before: preDragState() };
  }

  it("(a) A를 lane 2·beat 3으로 끌고 0.7초 뒤 Esc(cancelSelectDrag)하면 차트·history·lastValidSnapshot이 첫 프레임 직전과 같고, 다음 undo()가 노트 B를 지운다", () => {
    const { mode, store, before } = setupDragAfterAddingB();
    mode.onPointerMove(2, 3);
    setClock(12_700);

    store.getState().cancelSelectDrag();

    expectPreDragState(before);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().chart.notes).toEqual([noteA]);
  });

  it("(b) B 추가 2초 뒤 A를 끌던 중 undo()는 드래그만 취소해 history가 첫 프레임 직전과 같고, 두 번째 undo()가 노트 B를 지운다", () => {
    const { mode, store, before } = setupDragAfterAddingB();
    mode.onPointerMove(2, 3);

    expect(store.getState().undo()).toBe(false);

    expectPreDragState(before);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().chart.notes).toEqual([noteA]);
  });

  it("(c) 1초 간격 프레임으로 A를 lane 2의 beat 1·2·3까지 끈 긴 드래그를 Esc로 취소하면 history가 첫 프레임 직전과 같아 다음 undo()가 그 위치들을 거치지 않고 노트 B를 지운다", () => {
    const { mode, store, before } = setupDragAfterAddingB();
    mode.onPointerMove(2, 1);
    setClock(13_000);
    mode.onPointerMove(2, 2);
    setClock(14_000);
    mode.onPointerMove(2, 3);
    setClock(14_100);

    store.getState().cancelSelectDrag();

    expectPreDragState(before);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().chart.notes).toEqual([noteA]);
  });

  it("(d) redo 스택(노트 B 추가)을 남긴 채 A를 끌면 첫 프레임이 redo 스택을 비우지만, Esc로 취소하면 redo 스택이 돌아와 redo()가 B를 다시 적용한다", () => {
    setClock(10_000);
    const { mode, store } = setup([noteA]);
    store.getState().setChart(fullChart([noteA, noteB]));
    store.getState().undo(); // B 추가를 redo 스택으로 보낸다
    setClock(12_000);
    mode.onPointerDown(1, 0, false, false);
    const before = preDragState();
    mode.onPointerMove(2, 3);
    expect(store.getState().historyFuture).toHaveLength(0);

    store.getState().cancelSelectDrag();

    expectPreDragState(before);
    expect(store.getState().redo()).toBe(true);
    expect(store.getState().chart.notes).toEqual([noteA, noteB]);
  });

  it("(e) A 위 중복 노트 B'로 위반인 차트에서 A를 끈 유효한 프레임이 lastValidSnapshot이 돼도, Esc로 취소하면 lastValidSnapshot이 첫 프레임 직전 값으로 돌아오고 다음 undo()가 B'를 지운다", () => {
    setClock(10_000);
    const { mode, store } = setup([noteA]);
    store.getState().loadChart(fullChart([noteA])); // 유효 → lastValidSnapshot = A만 있는 차트
    store.getState().setChart(fullChart([noteA, noteA])); // 중복 B' → 위반, lastValidSnapshot 유지
    setClock(12_000);
    mode.onPointerDown(1, 0, false, false);
    const before = preDragState();
    mode.onPointerMove(2, 3); // A가 비켜 위반이 풀린 프레임 → lastValidSnapshot이 이 프레임으로 옮겨 간다
    expect(store.getState().lastValidSnapshot?.chart).toBe(store.getState().chart);

    store.getState().cancelSelectDrag();

    expectPreDragState(before);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().chart.notes).toEqual([noteA]);
  });

  it("pointercancel·두 손가락 editCancel 경로(SelectMode.cancel 직접)로 0.7초 뒤 취소해도 차트·history가 첫 프레임 직전과 같다", () => {
    const { mode, before } = setupDragAfterAddingB();
    mode.onPointerMove(2, 3);
    setClock(12_700);

    mode.cancel();

    expectPreDragState(before);
  });

  it("A를 lane 2·beat 3으로 끌어 드롭하면 A가 그 자리에 남고, undo()는 A를 드래그 전 위치(lane 1·beat 0)로 되돌린다(드롭의 history는 그대로)", () => {
    const { mode, store } = setupDragAfterAddingB();
    mode.onPointerMove(2, 3);

    mode.onPointerUp(2, 3);

    expect(laneBeat(0)).toEqual([2, 3]);
    expect(store.getState().undo()).toBe(true);
    expect(laneBeat(0)).toEqual([1, 0]);
    expect(store.getState().chart.notes).toHaveLength(2);
  });
});

describe("진행 중 select 드래그 × 삭제(Delete·Ctrl+X·툴바 삭제는 드래그를 먼저 끝낸다)", () => {
  it("유일한 노트 A를 끌던 중 Delete 경로(endSelectDragBeforeDelete 뒤 deleteSelected)는 A를 지우고, 이어진 포인터 이동이 throw하지 않으며 undo()가 A를 원위치(lane 1·beat 0)로 되살린다", () => {
    setClock(10_000);
    const { mode, store } = setup([noteA]);
    setClock(12_000);
    dragNoteA(mode);

    expect(store.getState().endSelectDragBeforeDelete()).toBe(true);
    mode.deleteSelected();

    expect(store.getState().chart.notes).toEqual([]);
    expect(() => mode.onPointerMove(4, 6)).not.toThrow();
    expect(store.getState().chart.notes).toEqual([]);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().chart.notes).toEqual([noteA]);
  });

  it("노트 B를 선택한 채 A만 감싸는 박스를 끌던 중 Delete 경로는 강조된 A를 확정해 지우고 B(lane 3·beat 4)를 남긴다", () => {
    const { mode, store } = setup([noteA, noteB]);
    mode.selectNote(1);
    mode.onPointerDown(1, 2, false, false); // 빈 곳 → 박스 시작
    mode.onPointerMove(1, -1); // lane 1 × beat −1~2 → A만 포함
    expect(store.getState().selection.notes).toEqual(new Set([0]));

    expect(store.getState().endSelectDragBeforeDelete()).toBe(true);
    mode.deleteSelected();

    expect(mode.isBoxSelecting).toBe(false);
    expect(store.getState().chart.notes).toEqual([noteB]);
  });

  it("위반 노트 A를 선택한 채 B만 감싸는 박스를 끌던 중 박스 확정이 §3-5 게이트에 거부되면 endSelectDragBeforeDelete()가 false라 지우지 않고 선택이 A로 남는다", () => {
    const duplicateOfA: NoteEntity = { type: "single", lane: 1, beat: beat(0) };
    const { mode, store } = setup([noteA, duplicateOfA, noteB]); // A·A' 중복 = 의미 위반
    store.getState().setSelection({ ...emptySelection(), notes: new Set([0]) });
    mode.onPointerDown(4, 5, false, false); // 빈 곳 → 박스 시작
    mode.onPointerMove(3, 3); // lane 3~4 × beat 3~5 → B(인덱스 2)만 포함
    expect(store.getState().selection.notes).toEqual(new Set([2]));

    expect(store.getState().endSelectDragBeforeDelete()).toBe(false);

    expect(mode.isBoxSelecting).toBe(false);
    expect(store.getState().selection.notes).toEqual(new Set([0]));
    expect(store.getState().chart.notes).toHaveLength(3);
  });
});

describe("진행 중 select 드래그 × 붙여넣기(Ctrl+V는 드래그를 먼저 취소하고, 대기 중 붙여넣기는 undo/redo가 건드리지 않는다)", () => {
  /** 노트 B를 복사해 두고 A를 lane 2·beat 3으로 끈 뒤, 키보드 Ctrl+V처럼 드래그를 먼저 취소하고 8박에 붙여넣는다. */
  function pasteBWhileDraggingA() {
    setClock(10_000);
    const ctx = setup([noteA, noteB]);
    ctx.store.getState().setSelection({ ...emptySelection(), notes: new Set([1]) });
    ctx.mode.copy();
    setClock(12_000);
    dragNoteA(ctx.mode);
    ctx.store.getState().cancelSelectDrag();
    ctx.mode.paste(beat(8));
    return ctx;
  }

  it("A를 끌던 중 Ctrl+V 경로는 A를 원위치(lane 1·beat 0)로 되돌린 뒤 B 사본을 lane 3·beat 8에 대기시킨다", () => {
    const { mode } = pasteBWhileDraggingA();

    expect(mode.isMoveDragging).toBe(false);
    expect(mode.isPendingPaste).toBe(true);
    expect(laneBeat(0)).toEqual([1, 0]);
    expect(laneBeat(2)).toEqual([3, 8]);
  });

  it("붙여넣기 대기 중 undo()·redo()는 false로 아무것도 되돌리지 않아 B 사본이 남고, movePasteBySnap('up')이 throw 없이 beat 9로 옮기며, 이어진 cancelPaste가 A를 끌던 위치가 아닌 원위치에 둔다", () => {
    const { mode, store } = pasteBWhileDraggingA();

    expect(store.getState().undo()).toBe(false);
    expect(store.getState().redo()).toBe(false);
    expect(store.getState().chart.notes).toHaveLength(3);
    expect(() => mode.movePasteBySnap("up")).not.toThrow();
    expect(laneBeat(2)).toEqual([3, 9]);

    mode.cancelPaste();

    expect(store.getState().chart.notes).toEqual([noteA, noteB]);
  });

  it("Ctrl+V로 대기한 붙여넣기를 Enter(confirmPlacement)로 확정하면 이어진 Esc(cancelSelectDrag)는 false로 아무것도 되돌리지 않아 B 사본과 history가 그대로다", () => {
    const { mode, store } = pasteBWhileDraggingA();
    mode.confirmPlacement();
    const pastLength = store.getState().historyPast.length;

    expect(store.getState().cancelSelectDrag()).toBe(false);

    expect(store.getState().chart.notes).toHaveLength(3);
    expect(laneBeat(2)).toEqual([3, 8]);
    expect(store.getState().historyPast).toHaveLength(pastLength);
  });
});

describe("진행 중 select 드래그 × Enter 확정(confirmPlacement가 드래그를 끝낸다)", () => {
  it("snap 4에서 A를 lane 2·beat 3으로 끈 뒤 moveBySnap('up')·confirmPlacement(Enter)로 lane 2·beat 4를 확정하면 드래그가 끝나 이어진 Esc(cancelSelectDrag)가 그 위치를 되돌리지 않는다", () => {
    setClock(12_000);
    const { mode, store } = setup([noteA]);
    dragNoteA(mode);
    mode.moveBySnap("up");
    expect(laneBeat(0)).toEqual([2, 4]);

    mode.confirmPlacement();

    expect(mode.isMoveDragging).toBe(false);
    expect(store.getState().cancelSelectDrag()).toBe(false);
    expect(laneBeat(0)).toEqual([2, 4]);
  });

  it("A를 lane 2·beat 3으로 끈 뒤 moveBySnap('up')만 하고 Enter 없이 Esc하면 방향키 이동까지 드래그 직전 위치(lane 1·beat 0)로 되돌린다", () => {
    setClock(12_000);
    const { mode, store } = setup([noteA]);
    dragNoteA(mode);
    mode.moveBySnap("up");

    expect(store.getState().cancelSelectDrag()).toBe(true);

    expect(laneBeat(0)).toEqual([1, 0]);
  });

  it("A를 lane 2·beat 3으로 끈 뒤 confirmPlacement(Enter)하면 clearDragPreview를 돌려주며 드래그가 끝나, 이후 lane 4·beat 6으로 움직여도 A가 따라오지 않는다", () => {
    const { mode } = setup([noteA]);
    dragNoteA(mode);

    expect(mode.confirmPlacement().clearDragPreview).toBe(true);

    expect(mode.isMoveDragging).toBe(false);
    mode.onPointerMove(4, 6);
    expect(laneBeat(0)).toEqual([2, 3]);
  });
});

describe("진행 중 select 드래그 × 리사이즈 checkpoint", () => {
  it("롱노트 L 끝을 beginNoteEndResizeDrag로 잡아 endBeat 10까지 한 프레임 쓰고 0.7초 뒤 cancelSelectDrag하면 차트·history·lastValidSnapshot이 첫 프레임 직전과 같은 객체다", () => {
    const longNote: NoteEntity = { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) };
    setClock(10_000);
    const { mode, store } = setup([longNote]);
    store.getState().setChart(fullChart([longNote, noteB]));
    setClock(12_000);
    expect(mode.beginNoteEndResizeDrag(0)).toBe(true);
    const before = preDragState();
    mode.onPointerMove(1, 10);
    expect(store.getState().chart.notes[0]).toMatchObject({ endBeat: beat(10) });
    setClock(12_700);

    store.getState().cancelSelectDrag();

    expectPreDragState(before);
  });
});
