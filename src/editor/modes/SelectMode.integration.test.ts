/**
 * SelectMode × 실제 editorStore(§3-5 선택 해제 게이트 포함) 결합 테스트.
 *
 * SelectMode.test.ts의 페이크 setSelection은 게이트가 없어(항상 통과) 게이트 거부와
 * 얽힌 동작 — select→move 가드, 삭제/붙여넣기 취소의 커밋 순서, 박스 프리뷰 확정 —
 * 을 검증할 수 없다. 여기서는 진짜 store에 배선해 그 사각지대를 커버한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelectMode } from "./SelectMode";
import { useEditorStore } from "../stores/editorStore";
import { emptySelection, type Selection } from "../stores/selectionSlice";
import { beat, beatToFloat } from "../../shared";
import type { Chart, Beat, Lane, NoteEntity } from "../../shared";
import { projectAuxNotes } from "../auxNoteProjection";

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

function sel(input: Partial<Selection>): Selection {
  return { ...emptySelection(), ...input };
}

// 픽스처: 0·1이 같은 레인·박 중복(의미 위반, §3-5 대상), 2는 무관(lane2 beat2)
const dupNotes: NoteEntity[] = [
  { type: "single", lane: 1, beat: beat(0) },
  { type: "single", lane: 1, beat: beat(0) },
  { type: "single", lane: 2, beat: beat(2) },
];

function makeIntegration(
  notes: NoteEntity[],
  hitTestNote: (x: number, y: number) => number | null,
) {
  useEditorStore.setState({
    chart: fullChart(notes),
    selection: emptySelection(),
    historyPast: [],
    historyFuture: [],
    historyLastCaptureAt: 0,
  });

  // 모든 게이트 커밋의 반환값을 기록한다 — false가 하나라도 있으면 어떤 경로가
  // 게이트에 거부된 채 진행됐다는 뜻(예: 삭제가 차트 커밋 전에 해제를 시도)
  const setSelectionSpy = vi.fn((s: Selection) => useEditorStore.getState().setSelection(s));

  const cb = {
    onChartUpdate: (c: Chart) => {
      useEditorStore.getState().setChart(c);
      mode.setChart(useEditorStore.getState().chart);
    },
    getSelection: () => useEditorStore.getState().selection,
    setSelection: setSelectionSpy,
    setSelectionTransient: (s: Selection) =>
      useEditorStore.getState().setSelectionTransient(s),
    yToBeat: (y: number): Beat => beat(y),
    yToBeatRaw: (y: number): Beat => beat(y),
    snapBeat: (b: Beat): Beat => b,
    getSnapStep: (): Beat => beat(4, 4),
    getMaxBeatFloat: () => 100,
    xToLane: (x: number): Lane | null => (x >= 1 && x <= 4 ? (x as Lane) : null),
    hitTestNote,
    onWarn: vi.fn(),
    getExtraNotes: () => projectAuxNotes(useEditorStore.getState().chart.notes),
    onExtraNotesUpdate: (e: NoteEntity[]) => useEditorStore.getState().setExtraNotes(e),
  };
  const mode = new SelectMode(useEditorStore.getState().chart, cb);
  return { mode, cb, setSelectionSpy, store: useEditorStore };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("select→move seam × §3-5 게이트 (stale 선택 오이동 방지)", () => {
  it("위반 노트를 쥔 채 다른 노트를 클릭+드래그해도 게이트가 거부하면 아무것도 이동하지 않는다", () => {
    const { mode, store } = makeIntegration(dupNotes, (x, y) => (x === 2 && y === 2 ? 2 : null));
    store.getState().setSelection(sel({ notes: new Set([0]) })); // 위반 당사자 선택 (∅→{0} 통과)
    const before = store.getState().chart.notes.map((n) => beatToFloat(n.beat));

    mode.onPointerDown(2, 2, false, false); // 노트 2 클릭 → 교체 전이 {0}→{2} 거부
    mode.onPointerMove(2, 3); // 드래그 시도
    mode.onPointerUp(2, 3);

    expect(store.getState().selection.notes).toEqual(new Set([0])); // 선택 유지(§3-5)
    expect(store.getState().chart.notes.map((n) => beatToFloat(n.beat))).toEqual(before); // 오이동 없음
  });

  it("터치 롱프레스(beginTouchMoveDragFromNote)도 게이트 거부 시 이동을 시작하지 않고 false를 반환한다", () => {
    const { mode, store } = makeIntegration(dupNotes, () => null);
    store.getState().setSelection(sel({ notes: new Set([0]) }));

    const ok = mode.beginTouchMoveDragFromNote(2, 2, 2); // 노트 2로 교체 시도 → 거부

    expect(ok).toBe(false);
    expect(mode.isMoveDragging).toBe(false);
    expect(store.getState().selection.notes).toEqual(new Set([0]));
  });
});

describe("차트 축소 커밋의 게이트 면제 — 커밋 순서 회귀 가드", () => {
  it("위반 노트 deleteSelected는 성공하고, 그 과정의 모든 게이트 커밋이 통과한다(차트 커밋→해제 순서)", () => {
    const { mode, store, setSelectionSpy } = makeIntegration(dupNotes, () => null);
    store.getState().setSelection(sel({ notes: new Set([0, 1]) })); // 위반 당사자 둘 다
    setSelectionSpy.mockClear();

    mode.deleteSelected();

    expect(store.getState().chart.notes).toHaveLength(1); // 무관 노트만 남음
    expect(store.getState().selection).toEqual(emptySelection());
    // 순서를 뒤집으면(해제→차트 커밋) 첫 커밋이 게이트에 거부돼 false가 기록된다
    expect(setSelectionSpy.mock.results.every((r) => r.value === true)).toBe(true);
  });

  it("위반 위치에 붙여넣은 pending paste의 취소(cancelPaste)는 성공하고 게이트 거부 없이 끝난다", () => {
    const { mode, store, setSelectionSpy } = makeIntegration(
      [{ type: "single", lane: 1, beat: beat(0) }],
      () => null,
    );
    store.getState().setSelection(sel({ notes: new Set([0]) }));
    mode.copy();
    mode.paste(beat(0)); // 같은 위치 → 중복(의미 위반) 낙관 커밋
    expect(store.getState().chart.notes).toHaveLength(2);
    setSelectionSpy.mockClear();

    mode.cancelPaste();

    expect(store.getState().chart.notes).toHaveLength(1); // 복원
    expect(store.getState().selection).toEqual(emptySelection());
    expect(setSelectionSpy.mock.results.every((r) => r.value === true)).toBe(true);
  });
});

describe("박스 드래그 × §3-5 — 프레임은 프리뷰, 확정은 (시작 전 → 최종) 전이 하나", () => {
  it("위반 선택을 쥔 채 박스 드래그: 중간 프레임은 얼지 않고, 위반 노트를 안 덮은 최종 확정은 거부되어 시작 전 선택이 유지된다", () => {
    const { mode, store } = makeIntegration(dupNotes, () => null);
    store.getState().setSelection(sel({ notes: new Set([0]) })); // 위반 당사자 선택

    mode.onPointerDown(3, 3, false, false); // 빈 곳 → 박스 시작(프리뷰 clear, 게이트 미발화)
    mode.onPointerMove(2, 1); // lanes 2..3 × beats 1..3 → 노트 2만 포함

    // 중간 프레임: 프리뷰(transient)라 게이트에 얼어붙지 않고 박스 내용이 반영된다
    expect(store.getState().selection.notes).toEqual(new Set([2]));

    mode.onPointerUp(2, 1); // 확정: {0}→{2} 전이 → 위반 노트 0을 떨구므로 거부

    expect(store.getState().selection.notes).toEqual(new Set([0])); // 시작 전 선택 복원·유지
  });

  it("박스가 위반 노트를 포함해 끝나면 removed=∅이라 확정이 통과한다", () => {
    const { mode, store } = makeIntegration(dupNotes, () => null);
    store.getState().setSelection(sel({ notes: new Set([0]) }));

    mode.onPointerDown(4, 3, false, false); // 빈 곳(lane4)
    mode.onPointerMove(1, 0); // lanes 1..4 × beats 0..3 → 0·1·2 전부
    mode.onPointerUp(1, 0);

    expect(store.getState().selection.notes).toEqual(new Set([0, 1, 2]));
  });

  it("박스 드래그를 cancel하면 프리뷰가 버려지고 시작 전 선택이 복원된다", () => {
    const { mode, store } = makeIntegration(dupNotes, () => null);
    store.getState().setSelection(sel({ notes: new Set([0]) }));

    mode.onPointerDown(3, 3, false, false);
    mode.onPointerMove(2, 1);
    expect(store.getState().selection.notes).toEqual(new Set([2])); // 프리뷰 반영

    mode.cancel();

    expect(store.getState().selection.notes).toEqual(new Set([0])); // 복원
  });

  it("위반이 없으면 박스 확정이 그대로 통과한다 (기존 박스 UX 불변)", () => {
    const clean: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 2, beat: beat(2) },
    ];
    const { mode, store } = makeIntegration(clean, () => null);
    store.getState().setSelection(sel({ notes: new Set([0]) }));

    mode.onPointerDown(3, 3, false, false);
    mode.onPointerMove(2, 1); // 노트 1(lane2,b2)만 포함
    mode.onPointerUp(2, 1);

    expect(store.getState().selection.notes).toEqual(new Set([1])); // 교체 확정
  });
});
