/**
 * DeleteMode × 통합 chart.notes 인덱스 공간 (RFD 0018 ④d).
 *
 * ④bc 이후 선택·이동·paste는 chart.notes 통합 인덱스로 동작하고, 통합 이동은 lane만
 * 바꾸며 배열 위치를 유지하고 paste는 끝에 append한다 — 즉 chart.notes의
 * [...main, ...aux] 정규형 파티션은 더 이상 불변이 아니다. Delete 경로는 파티션이
 * 깨진 차트에서도 "클릭한 노트가 정확히 삭제"돼야 한다.
 *
 * 하니스는 App.tsx의 DeleteMode 배선을 미러한다(좌표 규약: x=통합 lane, y=beatFloat).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteMode } from "./DeleteMode";
import { SelectMode } from "./SelectMode";
import { ClipboardManager } from "./ClipboardManager";
import { useEditorStore } from "../stores/editorStore";
import { emptySelection, type Selection } from "../stores/selectionSlice";
import { beat } from "../../shared";
import { hitTestNoteAt } from "../timeline/hitTest";
import type { Chart, NoteEntity, Beat, Lane } from "../../shared";

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

function seedChart(notes: NoteEntity[]) {
  useEditorStore.setState({
    chart: fullChart(notes),
    selection: emptySelection(),
    historyPast: [],
    historyFuture: [],
    historyLastCaptureAt: 0,
    extraLaneCount: 2,
  });
}

// --- 좌표 규약: x = 통합 lane(1..4 메인, 5+ 보조), y = beatFloat ---

const xToLane = (x: number): Lane | null => (x >= 1 && x <= 4 ? (x as Lane) : null);

/** useCoordinateHelpers.hitTestUnifiedNote 미러 — 메인·보조 통합 인덱스 반환 */
const hitTestUnifiedNote = (x: number, y: number): number | null => {
  const lane = x >= 1 ? x : null;
  if (lane === null) return null;
  return hitTestNoteAt(useEditorStore.getState().chart.notes, lane, y);
};

/**
 * App.tsx의 DeleteMode 배선 미러 (RFD 0018 ④d):
 * 통합 차트(chart.notes 전체) + 통합 히트테스트 — 어댑터·별도 보조 축 없음.
 */
function wireDeleteModeAsApp(): DeleteMode {
  return new DeleteMode(useEditorStore.getState().chart, {
    onChartUpdate: (c: Chart) => useEditorStore.getState().setChart(c),
    hitTestNote: hitTestUnifiedNote,
  });
}

/** SelectMode 최소 배선 (moveByLane으로 실제 통합 이동을 일으키기 위한 하니스) */
function wireSelectMode(): SelectMode {
  const modeRef: { current: SelectMode | null } = { current: null };
  const cb = {
    onChartUpdate: (c: Chart) => {
      useEditorStore.getState().setChart(c);
      modeRef.current?.setChart(useEditorStore.getState().chart);
    },
    getSelection: () => useEditorStore.getState().selection,
    setSelection: (s: Selection) => useEditorStore.getState().setSelection(s),
    setSelectionTransient: (s: Selection) => useEditorStore.getState().setSelectionTransient(s),
    yToBeat: (y: number): Beat => beat(y),
    yToBeatRaw: (y: number): Beat => beat(y),
    snapBeat: (b: Beat): Beat => b,
    getSnapStep: (): Beat => beat(4, 4),
    getMaxBeatFloat: () => 100,
    xToLane,
    xToUnifiedLane: (x: number): number | null => (x >= 1 ? x : null),
    hitTestNote: hitTestUnifiedNote,
    getExtraLaneCount: () => useEditorStore.getState().extraLaneCount,
    onWarn: vi.fn(),
  };
  const mode = new SelectMode(useEditorStore.getState().chart, cb);
  modeRef.current = mode;
  return mode;
}

const noteKey = (n: NoteEntity) => `${n.type}:${n.lane}@${n.beat.n}/${n.beat.d}`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("파티션 깨진 통합 차트에서의 클릭 삭제 (RFD 0018 ④d)", () => {
  it("moveByLane으로 메인 노트가 lane5(보조)로 제자리 이동해 파티션이 깨진 뒤, lane1@4 클릭 삭제는 그 노트만 지운다 (다른 노트 오삭제 없음)", () => {
    // 정규형 시작: 메인 3개 (lane4@0, lane1@4, lane2@8)
    seedChart([
      { type: "single", lane: 4, beat: beat(0) },
      { type: "single", lane: 1, beat: beat(4) },
      { type: "single", lane: 2, beat: beat(8) },
    ]);
    const select = wireSelectMode();
    expect(useEditorStore.getState().setSelection({ ...emptySelection(), notes: new Set([0]) })).toBe(true);
    select.moveByLane("right"); // lane4 → lane5 (보조), 배열 위치 유지

    // 파티션 깨짐 확인: 보조 노트(lane5)가 메인 노트들 앞에 있다
    const broken = useEditorStore.getState().chart.notes;
    expect(broken.map((n) => n.lane)).toEqual([5, 1, 2]);

    // lane1@4 노트를 클릭 삭제
    wireDeleteModeAsApp().onPointerDown(1, 4);

    const after = useEditorStore.getState().chart.notes;
    expect(after.map(noteKey)).toEqual(["single:5@0/1", "single:2@8/1"]); // lane1@4만 삭제
  });

  it("paste가 보조 노트 뒤에 메인 노트를 append해 파티션이 깨진 뒤, 붙여넣어진 lane1@4 클릭 삭제는 그 노트만 지운다", () => {
    // 정규형 시작: [main lane1@0, aux lane5@0]
    seedChart([
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 5, beat: beat(0) },
    ]);
    const clip = new ClipboardManager();
    const store = useEditorStore.getState();
    expect(clip.copy(store.chart, new Set([0]))).toBe(1);
    const result = clip.paste(
      useEditorStore.getState().chart,
      beat(4),
      {
        getSnapStep: () => beat(4, 4),
        getMaxBeatFloat: () => 100,
        onChartUpdate: (c) => useEditorStore.getState().setChart(c),
      },
      () => useEditorStore.getState().setSelection(emptySelection()),
    );
    expect(result).not.toBeNull();

    // 파티션 깨짐 확인: aux(lane5) 뒤에 메인(lane1@4)이 append됐다
    const broken = useEditorStore.getState().chart.notes;
    expect(broken.map((n) => n.lane)).toEqual([1, 5, 1]);

    // 붙여넣어진 lane1@4 노트를 클릭 삭제
    wireDeleteModeAsApp().onPointerDown(1, 4);

    const after = useEditorStore.getState().chart.notes;
    expect(after.map(noteKey)).toEqual(["single:1@0/1", "single:5@0/1"]); // lane1@4만 삭제
  });

  it("파티션 깨진 차트에서 보조 노트(lane5@0) 클릭 삭제는 그 노트만 지우고 나머지 배열 순서를 보존한다 (재정렬 없음)", () => {
    // 파티션 깨진 상태를 재현: [aux lane5@0, main lane1@4, aux lane6@8, main lane2@12]
    seedChart([
      { type: "single", lane: 4, beat: beat(0) },
      { type: "single", lane: 1, beat: beat(4) },
      { type: "single", lane: 6, beat: beat(8) },
      { type: "single", lane: 2, beat: beat(12) },
    ]);
    const select = wireSelectMode();
    expect(useEditorStore.getState().setSelection({ ...emptySelection(), notes: new Set([0]) })).toBe(true);
    select.moveByLane("right"); // lane4 → lane5, 배열 위치 유지
    expect(useEditorStore.getState().chart.notes.map((n) => n.lane)).toEqual([5, 1, 6, 2]);

    // 보조 lane5@0 노트를 클릭 삭제 (x=5 = 보조 첫 레인)
    wireDeleteModeAsApp().onPointerDown(5, 0);

    const after = useEditorStore.getState().chart.notes;
    expect(after.map(noteKey)).toEqual(["single:1@4/1", "single:6@8/1", "single:2@12/1"]);
  });
});
