/**
 * SelectMode × 실제 editorStore(§3-5 선택 해제 게이트 포함) 결합 테스트.
 *
 * SelectMode.test.ts의 페이크 setSelection은 게이트가 없어(항상 통과) 게이트 거부와
 * 얽힌 동작 — select→move 가드, 삭제/붙여넣기 취소의 커밋 순서, 박스 프리뷰 확정 —
 * 을 검증할 수 없다. 여기서는 진짜 store에 배선해 그 사각지대를 커버한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectMode, type SelectModeCallbacks } from "./SelectMode";
import { makeFakeSpace } from "../timeline/makeFakeSpace";
import { createTimelineSpace } from "../timeline/TimelineSpace";
import { scheduleFromGrabTarget } from "../hooks/touchEditRouting";
import { useEditorStore } from "../stores/editorStore";
import { emptySelection, type Selection } from "../stores/selectionSlice";
import { beat, beatToFloat, auxNotesAsExtra, withAuxNotes, chartViolationIndices } from "../../shared";
import type { Chart, Beat, Lane, NoteEntity, ExtraNoteEntity, ChartEvent } from "../../shared";

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

  let mode: SelectMode;
  const cb = {
    onChartUpdate: (c: Chart) => {
      useEditorStore.getState().setChart(c);
      mode.setChart(useEditorStore.getState().chart);
    },
    getSelection: () => useEditorStore.getState().selection,
    setSelection: setSelectionSpy,
    setSelectionTransient: (s: Selection) =>
      useEditorStore.getState().setSelectionTransient(s),
    // 좌표/히트만 space로 — 선택 게이트 콜백(setSelection 등)은 실제 store 결합 그대로.
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
    onExtraNotesUpdate: (e: ExtraNoteEntity[]) => {
      const cur = useEditorStore.getState().chart;
      useEditorStore.getState().setChart({ ...cur, notes: withAuxNotes(cur.notes, e) });
    },
  };
  mode = new SelectMode(useEditorStore.getState().chart, cb);
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

// ---------------------------------------------------------------------------
// 보조 레인 롱노트 끝 캡 리사이즈 × 실제 TimelineSpace·store (#100)
// ---------------------------------------------------------------------------

/**
 * useTimelineSpace와 같은 배선(store 라이브 읽기)으로 실제 TimelineSpace를 조립한다. 렌더러 대신
 * y(px)=시간(ms) 항등 매핑과 타임라인 8000ms를 쓴다 — 120 BPM이라 y=500이 1박, snap=4는 1박 격자,
 * x=250은 보조 레인 1(lane 5)이다(LANE_WIDTH=60·TIMELINE_WIDTH=240·EXTRA_LANE_WIDTH=60).
 */
function makeRealSpaceIntegration(
  notes: NoteEntity[],
  opts: { events?: ChartEvent[]; snapDivision?: number } = {},
) {
  const chart = fullChart(notes);
  useEditorStore.setState({
    chart: opts.events ? { ...chart, events: opts.events } : chart,
    selection: emptySelection(),
    extraLaneCount: 2,
    snapDivision: opts.snapDivision ?? 4,
    historyPast: [],
    historyFuture: [],
    historyLastCaptureAt: 0,
  });
  const space = createTimelineSpace({
    getChart: () => useEditorStore.getState().chart,
    getSnapDivision: () => useEditorStore.getState().snapDivision,
    getSelectedNotes: () => useEditorStore.getState().selection.notes,
    getExtraLaneCount: () => useEditorStore.getState().extraLaneCount,
    yToTime: (y) => y,
    getTotalTimelineMs: () => 8000,
  });
  const cb: SelectModeCallbacks = {
    onChartUpdate: (c: Chart) => {
      useEditorStore.getState().setChart(c);
      mode.setChart(useEditorStore.getState().chart);
    },
    getSelection: () => useEditorStore.getState().selection,
    setSelection: (s: Selection) => useEditorStore.getState().setSelection(s),
    setSelectionTransient: (s: Selection) => useEditorStore.getState().setSelectionTransient(s),
    space,
    getExtraLaneCount: () => useEditorStore.getState().extraLaneCount,
    onWarn: vi.fn(),
  };
  const mode = new SelectMode(useEditorStore.getState().chart, cb);
  return { mode, space, store: useEditorStore };
}

/** 노트의 lane과 박을 실수로 바꿔 비교한다 — 스냅 결과의 분모({n:12,d:4} 등)와 무관하게 읽는다. */
function laneAndBeats(n: NoteEntity) {
  return {
    lane: n.lane,
    beat: beatToFloat(n.beat),
    endBeat: "endBeat" in n ? beatToFloat(n.endBeat) : null,
  };
}

describe("보조 레인 롱노트 끝 캡 리사이즈 × 실제 TimelineSpace·store (#100)", () => {
  const auxLong: NoteEntity = { type: "long", lane: 5, beat: beat(0), endBeat: beat(2) };
  // 보조 lane 5 칸 = 이벤트 editorLane 1 칸. idx 2의 auto 구간 이벤트 끝(2박)이 auxLong 끝과 겹친다.
  const eventsWithAutoEndAt2: ChartEvent[] = [
    { type: "bpm", beat: beat(0), bpm: 120, editorLane: 1 },
    { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    { type: "auto", beat: beat(0), endBeat: beat(2), editorLane: 1 },
  ];

  afterEach(() => {
    vi.useRealTimers();
  });

  it("미선택 보조 lane 5 롱노트(0→2박) 끝 캡(x=250·y=1000)을 y=1400(2.8박)까지 끌면 이동이 아니라 리사이즈 — lane 5·시작 0박 유지, endBeat는 snap=4로 3박, 그 노트가 단독 선택된다", () => {
    const { mode, store } = makeRealSpaceIntegration([auxLong]);

    mode.onPointerDown(250, 1000, false, false);
    mode.onPointerMove(250, 1400);
    mode.onPointerUp(250, 1400);

    expect(laneAndBeats(store.getState().chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 3 });
    expect(store.getState().selection.notes).toEqual(new Set([0]));
  });

  it("보조 롱노트 끝 캡을 시작점 아래 y=-500(-1박)까지 끌면 endBeat가 시작 0박에 클램프돼 길이 0이 된다 (메인과 같은 최소 길이)", () => {
    const { mode, store } = makeRealSpaceIntegration([auxLong]);

    mode.onPointerDown(250, 1000, false, false);
    mode.onPointerMove(250, -500);
    mode.onPointerUp(250, -500);

    expect(laneAndBeats(store.getState().chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 0 });
  });

  it("병합창 600ms(HISTORY_COALESCE_MS) 안에서 끝 캡을 3박→4박으로 끌면 히스토리 1건으로 남아 undo 한 번에 0→2박으로 복원된다", () => {
    // 병합 검사는 Date.now()를 읽는다 — 시각을 고정해 기계 부하와 무관하게 한 창 안에 둔다
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { mode, store } = makeRealSpaceIntegration([auxLong]);

    mode.onPointerDown(250, 1000, false, false);
    mode.onPointerMove(250, 1500);
    mode.onPointerMove(250, 2000);
    mode.onPointerUp(250, 2000);
    expect(laneAndBeats(store.getState().chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 4 });
    expect(store.getState().historyPast).toHaveLength(1);

    store.getState().undo();

    expect(laneAndBeats(store.getState().chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 2 });
  });

  it("lane 5의 0→1박 롱노트 끝을 3박까지 늘려 2→4박 롱노트와 겹쳐도 낙관 커밋되고 두 노트(0·1)가 위반으로 잡힌다", () => {
    const { mode, store } = makeRealSpaceIntegration([
      { type: "long", lane: 5, beat: beat(0), endBeat: beat(1) },
      { type: "long", lane: 5, beat: beat(2), endBeat: beat(4) },
    ]);

    mode.onPointerDown(250, 500, false, false); // 0번 끝(1박)
    mode.onPointerMove(250, 1500);
    mode.onPointerUp(250, 1500);

    const chart = store.getState().chart;
    expect(laneAndBeats(chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 3 });
    expect(chartViolationIndices(chart).notes).toEqual(new Set([0, 1]));
  });

  it("터치 select down: 보조 롱노트 끝 캡(x=250·y=1000)은 탭 토글이 아니라 지연 드래그(emptySelectBox)로 스케줄된다", () => {
    const { mode } = makeRealSpaceIntegration([auxLong]);

    expect(scheduleFromGrabTarget(mode.resolveGrabAt(250, 1000))).toBe("emptySelectBox");
  });

  it("터치 롱프레스: 보조 롱노트 끝(x=250·y=1000)에서 롱프레스 발화와 같은 히트로 beginLongPressDrag하면 리사이즈가 시작돼 y=1400에서 endBeat 3박", () => {
    const { mode, space, store } = makeRealSpaceIntegration([auxLong]);

    // useCanvasEvents의 롱프레스 발화(armHoldTimer)가 만드는 히트 조합과 같다
    const started = mode.beginLongPressDrag(250, 1000, {
      noteEndHit: space.hitTestNoteEnd(250, 1000),
      noteHit: space.hitTestUnifiedNote(250, 1000),
      zoneHit: space.hitTestTrillZone(250, 1000),
    });
    mode.onPointerMove(250, 1400);
    mode.onPointerUp(250, 1400);

    expect(started).toBe(true);
    expect(laneAndBeats(store.getState().chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 3 });
  });

  it("snap=32에서 미선택 보조 롱노트 끝과 구간 이벤트(idx 2) 끝이 2박에서 겹치면 끌기가 이벤트 끝을 3박으로 늘리고 노트는 0→2박 그대로", () => {
    const { mode, store } = makeRealSpaceIntegration([auxLong], {
      events: eventsWithAutoEndAt2,
      snapDivision: 32,
    });

    mode.onPointerDown(250, 1000, false, false);
    mode.onPointerMove(250, 1500);
    mode.onPointerUp(250, 1500);

    const chart = store.getState().chart;
    const auto = chart.events[2];
    expect("endBeat" in auto ? beatToFloat(auto.endBeat) : null).toBe(3);
    expect(laneAndBeats(chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 2 });
  });

  it("snap=32에서 같은 겹침이라도 보조 롱노트를 먼저 선택하고 끌면 노트 끝이 3박으로 늘고 이벤트 끝은 2박 그대로", () => {
    const { mode, store } = makeRealSpaceIntegration([auxLong], {
      events: eventsWithAutoEndAt2,
      snapDivision: 32,
    });
    store.getState().setSelection(sel({ notes: new Set([0]) }));

    mode.onPointerDown(250, 1000, false, false);
    mode.onPointerMove(250, 1500);
    mode.onPointerUp(250, 1500);

    const chart = store.getState().chart;
    const auto = chart.events[2];
    expect(laneAndBeats(chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 3 });
    expect("endBeat" in auto ? beatToFloat(auto.endBeat) : null).toBe(2);
  });

  it("hover 커서 resolveNoteEndCapAt: 보조 롱노트 끝(x=250·y=1000)은 0, 같은 2박에 구간 이벤트 끝이 겹치면(snap=32) 미선택일 때 null·노트를 선택하면 0", () => {
    expect(makeRealSpaceIntegration([auxLong]).mode.resolveNoteEndCapAt(250, 1000)).toBe(0);

    const { mode, store } = makeRealSpaceIntegration([auxLong], {
      events: eventsWithAutoEndAt2,
      snapDivision: 32,
    });
    expect(mode.resolveNoteEndCapAt(250, 1000)).toBeNull();
    store.getState().setSelection(sel({ notes: new Set([0]) }));
    expect(mode.resolveNoteEndCapAt(250, 1000)).toBe(0);
  });

  // 끝이 2.25박인 보조 롱노트 — 2박에서 끝나는 구간 이벤트와 같은 칸이지만 두 끝은 다른 위치다.
  // snap=4면 이벤트 끝 히트 영역(스냅한 박 기준 ±0.5박)이 노트 끝 캡(y=1125)까지 덮는다.
  const auxLongEndAt225: NoteEntity = { type: "long", lane: 5, beat: beat(0), endBeat: beat(9, 4) };

  it("snap=4에서 보조 롱노트 끝(2.25박)이 구간 이벤트 끝(2박)의 히트 영역 안이어도 끝 캡(y=1125)을 y=1500까지 끌면 노트 끝이 3박으로 늘고 이벤트 끝은 2박 그대로", () => {
    const { mode, store } = makeRealSpaceIntegration([auxLongEndAt225], { events: eventsWithAutoEndAt2 });

    expect(mode.resolveNoteEndCapAt(250, 1125)).toBe(0); // 커서도 ns-resize
    mode.onPointerDown(250, 1125, false, false);
    mode.onPointerMove(250, 1500);
    mode.onPointerUp(250, 1500);

    const chart = store.getState().chart;
    const auto = chart.events[2];
    expect(laneAndBeats(chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 3 });
    expect("endBeat" in auto ? beatToFloat(auto.endBeat) : null).toBe(2);
  });

  it("hover 리사이즈 캡 computeResizeHoverNote: snap=32에서 두 끝이 같은 2박이면 미선택 보조 롱노트의 끝 캡 위(y=1000)는 null로 캡을 숨기고, 몸통 위(y=500)는 0, 노트를 선택하면 끝 캡 위도 0", () => {
    const { mode, store } = makeRealSpaceIntegration([auxLong], {
      events: eventsWithAutoEndAt2,
      snapDivision: 32,
    });

    expect(mode.computeResizeHoverNote(250, 1000)).toBeNull();
    expect(mode.computeResizeHoverNote(250, 500)).toBe(0);
    store.getState().setSelection(sel({ notes: new Set([0]) }));
    expect(mode.computeResizeHoverNote(250, 1000)).toBe(0);
  });

  it("hover 리사이즈 캡 computeResizeHoverNote: 두 끝이 다른 위치(노트 2.25박·이벤트 2박, snap=4)면 끝 캡 위(y=1125)도 0, 이벤트 없는 보조 롱노트 끝(y=1000)도 0", () => {
    expect(
      makeRealSpaceIntegration([auxLongEndAt225], { events: eventsWithAutoEndAt2 }).mode.computeResizeHoverNote(250, 1125),
    ).toBe(0);
    expect(makeRealSpaceIntegration([auxLong]).mode.computeResizeHoverNote(250, 1000)).toBe(0);
  });

  it("hover 리사이즈 캡 computeResizeHoverNote: 겹친 노트 위반 상태(lane 5 doubleLong 1→2박 idx 0, long 0→2박 idx 1, 2박에 끝나는 구간 이벤트, snap=32)에서 끝(y=1000)은 최상위 long(1)의 캡도 숨긴다 — down은 eventEndCap", () => {
    const { mode } = makeRealSpaceIntegration(
      [
        { type: "doubleLong", lane: 5, beat: beat(1), endBeat: beat(2) },
        { type: "long", lane: 5, beat: beat(0), endBeat: beat(2) },
      ],
      { events: eventsWithAutoEndAt2, snapDivision: 32 },
    );

    expect(mode.resolveGrabAt(250, 1000)).toEqual({ kind: "eventEndCap", index: 2 });
    expect(mode.computeResizeHoverNote(250, 1000)).toBeNull();
  });

  it("터치 롱프레스는 끝 캡 양보가 없다: snap=32에서 미선택 보조 롱노트 끝과 구간 이벤트 끝이 같은 2박이어도 롱프레스 히트로 y=1500까지 끌면 노트 끝이 3박으로 늘고 이벤트 끝은 2박 그대로", () => {
    const { mode, space, store } = makeRealSpaceIntegration([auxLong], {
      events: eventsWithAutoEndAt2,
      snapDivision: 32,
    });

    // useCanvasEvents의 롱프레스 발화(armHoldTimer)가 만드는 히트 조합과 같다
    const started = mode.beginLongPressDrag(250, 1000, {
      noteEndHit: space.hitTestNoteEnd(250, 1000),
      noteHit: space.hitTestUnifiedNote(250, 1000),
      zoneHit: space.hitTestTrillZone(250, 1000),
    });
    mode.onPointerMove(250, 1500);
    mode.onPointerUp(250, 1500);

    const chart = store.getState().chart;
    const auto = chart.events[2];
    expect(started).toBe(true);
    expect(laneAndBeats(chart.notes[0])).toEqual({ lane: 5, beat: 0, endBeat: 3 });
    expect("endBeat" in auto ? beatToFloat(auto.endBeat) : null).toBe(2);
  });
});
