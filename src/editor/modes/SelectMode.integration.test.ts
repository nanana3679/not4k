/** SelectMode × 실제 store: 구형 의미 위반 수리에서도 선택 교체·이동·취소를 허용한다. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SelectMode } from "./SelectMode";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import { useEditorStore } from "../stores/editorStore";
import { emptySelection, type Selection } from "../stores/selectionSlice";
import { beat, beatToFloat, auxNotesAsExtra, withAuxNotes } from "../../shared";
import type { ChartDocument, Beat, Lane, DocumentNoteEntity, DocumentExtraNoteEntity } from "../../shared";

vi.mock("../../shared/toast", () => ({ showToast: vi.fn() }));

function fullChart(notes: DocumentNoteEntity[]): ChartDocument {
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

const dupNotes: DocumentNoteEntity[] = [
  { type: "single", lane: 1, beat: beat(0) },
  { type: "single", lane: 1, beat: beat(0) },
  { type: "single", lane: 2, beat: beat(2) },
];

function makeIntegration(
  notes: DocumentNoteEntity[],
  hitTestNote: (x: number, y: number) => number | null,
) {
  useEditorStore.setState({
    chart: fullChart(notes),
    selection: emptySelection(),
    historyPast: [],
    historyFuture: [],
    historyLastCaptureAt: 0,
  });

  const setSelectionSpy = vi.fn((s: Selection) => useEditorStore.getState().setSelection(s));

  const cb = {
    onChartUpdate: (c: ChartDocument) => {
      useEditorStore.getState().setChart(c);
      mode.setChart(useEditorStore.getState().chart);
    },
    getSelection: () => useEditorStore.getState().selection,
    setSelection: setSelectionSpy,
    setSelectionTransient: (s: Selection) =>
      useEditorStore.getState().setSelectionTransient(s),
    // SelectMode 의미론: 구 hitTestNote 콜백은 통합 히트테스트 → hitTestUnifiedNote로 주입.
    space: makeFakeSpace({
      yToBeat: (y: number): Beat => beat(y),
      yToBeatRaw: (y: number): Beat => beat(y),
      snapBeat: (b: Beat): Beat => b,
      getSnapStep: (): Beat => beat(4, 4),
      getMaxBeatFloat: () => 100,
      xToLane: (x: number): Lane | null => (x >= 1 && x <= 4 ? (x as Lane) : null),
      xToUnifiedLane: (x: number): number | null => (x >= 1 && x <= 4 ? x : null),
      hitTestUnifiedNote: hitTestNote,
    }),
    onWarn: vi.fn(),
    // ③ 병합 어댑터 (RFD 0018): 보조는 chart.notes(lane 5+)에 살고, 콜백이 파생·병합한다.
    getExtraNotes: () => auxNotesAsExtra(useEditorStore.getState().chart.notes),
    onExtraNotesUpdate: (e: DocumentExtraNoteEntity[]) => {
      const cur = useEditorStore.getState().chart;
      useEditorStore.getState().setChart({ ...cur, notes: withAuxNotes(cur.notes, e) });
    },
  };
  const mode = new SelectMode(useEditorStore.getState().chart, cb);
  return { mode, cb, setSelectionSpy, store: useEditorStore };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("구형 의미 위반 선택 교체와 이동", () => {
  it("위반 노트 {0}에서 노트 {2}를 클릭·드래그하면 {2}만 2→3박 이동한다", () => {
    const { mode, store } = makeIntegration(dupNotes, (x, y) => (x === 2 && y === 2 ? 2 : null));
    store.getState().setSelection(sel({ notes: new Set([0]) })); // 위반 당사자 선택 (∅→{0} 통과)
    const before = store.getState().chart.notes.map((n) => beatToFloat(n.beat));

    mode.onPointerDown(2, 2, false, false);
    mode.onPointerMove(2, 3); // 드래그 시도
    mode.onPointerUp(2, 3);

    expect(store.getState().selection.notes).toEqual(new Set([2]));
    expect(store.getState().chart.notes.map((n) => beatToFloat(n.beat))).toEqual([before[0], before[1], 3]);
  });

  it("구형 위반 노트 {0}에서 노트 {2}를 터치 롱프레스하면 선택을 바꾸고 이동을 시작한다", () => {
    const { mode, store } = makeIntegration(dupNotes, () => null);
    store.getState().setSelection(sel({ notes: new Set([0]) }));

    const ok = mode.beginTouchMoveDragFromNote(2, 2, 2);

    expect(ok).toBe(true);
    expect(mode.isMoveDragging).toBe(true);
    expect(store.getState().selection.notes).toEqual(new Set([2]));
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
  it("위반 노트 {0}을 제외한 박스 드래그도 최종 {2} 선택으로 확정된다", () => {
    const { mode, store } = makeIntegration(dupNotes, () => null);
    store.getState().setSelection(sel({ notes: new Set([0]) })); // 위반 당사자 선택

    mode.onPointerDown(3, 3, false, false); // 빈 곳 → 박스 시작(프리뷰 clear, 게이트 미발화)
    mode.onPointerMove(2, 1); // lanes 2..3 × beats 1..3 → 노트 2만 포함

    expect(store.getState().selection.notes).toEqual(new Set([2]));

    mode.onPointerUp(2, 1);

    expect(store.getState().selection.notes).toEqual(new Set([2]));
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
    const clean: DocumentNoteEntity[] = [
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
