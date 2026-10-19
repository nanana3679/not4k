/**
 * 진행 중 select 드래그 × 실제 editorStore — 모드 전환·undo/redo·차트 교체·Esc가 드래그를 먼저 끝내는지.
 *
 * App 배선을 그대로 따른다: SelectMode의 차트 쓰기는 store.setChart로 가고, store가 차트를 바꾸면
 * SelectMode.setChart로 되먹인다(App의 [chart] effect). 드래그 통로는 App처럼
 * createSelectDragControl로 store에 등록한다.
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
  });
  const mode = new SelectMode(useEditorStore.getState().chart, {
    onChartUpdate: (c) => useEditorStore.getState().setChart(c),
    getSelection: () => useEditorStore.getState().selection,
    setSelection: (s) => useEditorStore.getState().setSelection(s),
    setSelectionTransient: (s) => useEditorStore.getState().setSelectionTransient(s),
    space: makeFakeSpace({
      hitTestUnifiedNote: (x, y) => (x === 1 && y === 0 ? 0 : x === 3 && y === 4 ? 1 : null),
    }),
  });
  // App의 [chart] effect — store 차트가 바뀌면(undo·loadChart 등 포함) 모드에 되먹인다
  unsubscribers.push(useEditorStore.subscribe((state, prev) => {
    if (state.chart !== prev.chart) mode.setChart(state.chart);
  }));
  const renderer = { clearMoveOrigins: vi.fn(), clearBoxSelectRect: vi.fn() };
  useEditorStore.getState().setSelectDragControl(createSelectDragControl(mode, () => renderer));
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
