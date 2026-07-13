import { describe, it, expect, vi } from "vitest";
import { SelectMode, type SelectModeCallbacks } from "./SelectMode";
import { emptySelection, normalizeSelection, type Selection } from "../stores/selectionSlice";
import { beat, beatToFloat, withAuxNotes } from "../../shared";
import type { Chart, Beat, Lane, NoteEntity, ExtraNoteEntity, TrillZone } from "../../shared";

function makeChart(overrides?: Partial<Chart>): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    events: [{ type: "bpm" as const, beat: beat(0, 1), bpm: 120, editorLane: 1 }, { type: "timeSignature" as const, beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 }],
    ...overrides,
  };
}

function makeCallbacks(
  chartOrOverrides?: Chart | Record<string, unknown>,
  opts: {
    extraNotes?: ExtraNoteEntity[];
    extraLaneCount?: number;
  } = {},
) {
  let currentExtraNotes = opts.extraNotes ?? [];
  const extraLaneCount = opts.extraLaneCount ?? 0;

  // Support legacy overrides pattern (Record<string, unknown>)
  const overrides = (chartOrOverrides && !('meta' in chartOrOverrides))
    ? chartOrOverrides as Record<string, unknown>
    : {};

  // 선택의 소유자(SelectionSlice)를 흉내 내는 페이크 — 실제 게이트(normalizeSelection)를
  // 그대로 사용해 프로덕션과 의미론을 맞춘다. 게이트가 읽는 차트는 프로덕션 store처럼
  // onChartUpdate로 추적하고, SelectMode 생성 시점의 초기 차트는 makeMode가 동기화한다.
  let currentChart: Chart = (chartOrOverrides && 'meta' in chartOrOverrides)
    ? chartOrOverrides as Chart
    : makeChart();
  let selection: Selection = emptySelection();
  const selectionChart = () => currentExtraNotes.length > 0
    ? { ...currentChart, notes: withAuxNotes(currentChart.notes, currentExtraNotes) }
    : currentChart;

  return {
    onChartUpdate: vi.fn((chart: Chart) => {
      currentChart = chart;
    }),
    getSelection: () => selection,
    setSelection: (s: Selection) => {
      // ③: normalizeSelection은 chart.notes에서 auxCount를 파생한다 — 페이크의 메인 차트와
      // 보조 배열을 통합 차트로 합쳐 넘겨 프로덕션과 동일 의미론을 유지한다 (RFD 0018).
      selection = normalizeSelection(s, selectionChart());
      return true; // 페이크는 §3-5 게이트 없음(항상 통과) — 게이트 결합 검증은 integration 테스트 담당
    },
    setSelectionTransient: (s: Selection) => {
      selection = normalizeSelection(s, selectionChart());
    },
    /** 테스트 검증용 — 페이크가 소유한 선택 상태를 읽는다 */
    getSelectionState: () => selection,
    /** 게이트가 읽을 차트를 동기화한다 (프로덕션에서 store.chart가 먼저 갱신되는 것에 대응) */
    syncChart: (chart: Chart) => {
      currentChart = chart;
    },
    yToBeat: (_y: number): Beat => beat(0),
    yToBeatRaw: (_y: number): Beat => beat(0),
    snapBeat: (b: Beat): Beat => b,
    getSnapStep: (): Beat => beat(4, 4),
    getMaxBeatFloat: () => 100,
    xToLane: (x: number): Lane | null => (x >= 1 && x <= 4 ? x as Lane : null),
    xToUnifiedLane: (x: number): number | null =>
      x >= 1 && x < 5 + extraLaneCount ? x : null,
    hitTestNote: () => null,
    onWarn: vi.fn(),
    // Extra lane callbacks
    xToExtraLane: (x: number): number | null => {
      // x 5..5+extraLaneCount-1 → extraLane 1..extraLaneCount
      if (extraLaneCount > 0 && x >= 5 && x < 5 + extraLaneCount) return x - 4;
      return null;
    },
    getExtraNotes: () => currentExtraNotes,
    getExtraLaneCount: () => extraLaneCount,
    onExtraNotesUpdate: vi.fn((notes: ExtraNoteEntity[]) => {
      currentExtraNotes = notes;
    }),
    ...overrides,
  };
}

/** SelectMode 생성 + 페이크 게이트의 차트 동기화 (모든 테스트의 공통 진입점) */
function makeMode(
  chart: Chart,
  cb: SelectModeCallbacks & { syncChart: (chart: Chart) => void },
): SelectMode {
  cb.syncChart(chart);
  return new SelectMode(chart, cb);
}

/** 선택 조작용 페이크 핸들 (구 private 필드 직접 조작을 게이트 경유 커밋으로 대체) */
type SelectionFake = {
  getSelectionState: () => Selection;
  setSelection: (s: Selection) => void;
};

/** 현재 선택에 노트 인덱스를 추가해 게이트를 지나 커밋한다 */
function addNotesToSelection(cb: SelectionFake, ...indices: number[]): void {
  const cur = cb.getSelectionState();
  cb.setSelection({ ...cur, notes: new Set([...cur.notes, ...indices]) });
}

/** 현재 선택에 엑스트라 노트 인덱스를 추가해 게이트를 지나 커밋한다 */
function addExtraNotesToSelection(cb: SelectionFake, ...indices: number[]): void {
  const cur = cb.getSelectionState();
  cb.setSelection({ ...cur, extraNotes: new Set([...cur.extraNotes, ...indices]) });
}

// ---------------------------------------------------------------------------
// handlePointerDown 수식자 운반
// ---------------------------------------------------------------------------

describe("SelectMode — handlePointerDown 수식자 운반", () => {
  it("gesture의 x/y/shift/alt/toggle를 onPointerDown으로 그대로 전달", () => {
    const chart = makeChart();
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);
    const spy = vi.spyOn(mode, "onPointerDown");
    mode.handlePointerDown({ x: 5, y: 3, shiftKey: true, altKey: true, toggleSelection: true });
    expect(spy).toHaveBeenCalledWith(5, 3, true, true, true);
  });
});

// ---------------------------------------------------------------------------
// onPointerMove 프리뷰 PUSH (훅이 getter를 PULL하던 것 대체)
// ---------------------------------------------------------------------------

describe("SelectMode — onPointerMove 프리뷰 반환", () => {
  it("이동 드래그 중 onPointerMove는 원본 위치를 담은 preview.moveOrigins를 반환", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks({ hitTestNote: (x: number) => (x === 1 ? 0 : null) });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.beginMoveDrag(1, 0);
    const result = mode.onPointerMove(2, 1); // 레인 1 → 2로 이동

    expect(mode.isMoveDragging).toBe(true);
    expect(result.preview?.moveOrigins?.length).toBe(1);
    // moveOrigins는 이동 전 원본 레인(1)을 유지한다
    expect(result.preview?.moveOrigins?.[0].lane).toBe(1);
  });

  it("박스 셀렉트 중 onPointerMove는 preview.boxSelectRect를 반환", () => {
    const chart = makeChart();
    const cb = makeCallbacks(); // 빈 영역(hitTestNote=null) → 박스 셀렉트 시작
    const mode = makeMode(chart, cb);

    mode.onPointerDown(1, 0, false, false);
    const result = mode.onPointerMove(2, 5);

    expect(mode.isBoxSelecting).toBe(true);
    expect(result.preview?.boxSelectRect).toBeDefined();
  });

  it("드래그 중이 아니면 preview는 비어 있다", () => {
    const chart = makeChart();
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    const result = mode.onPointerMove(2, 5);

    expect(result.preview?.boxSelectRect).toBeUndefined();
    expect(result.preview?.moveOrigins).toBeUndefined();
  });
});

describe("SelectMode — handlePointerUp", () => {
  it("onPointerUp을 호출하고 clearDragPreview 신호를 반환", () => {
    const chart = makeChart();
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);
    const spy = vi.spyOn(mode, "onPointerUp");
    const result = mode.handlePointerUp({ x: 2, y: 3, shiftKey: false, altKey: false, toggleSelection: false });
    expect(spy).toHaveBeenCalledWith(2, 3);
    expect(result.clearDragPreview).toBe(true);
  });
});

describe("SelectMode — 박스 셀렉트 idempotency", () => {
  it("박스 진행 중 onPointerDown 재호출은 무시된다(중복 시작·시작점 리셋 방지)", () => {
    const chart = makeChart();
    const cb = makeCallbacks(); // 빈 영역(hitTestNote=null) → 박스 셀렉트
    const mode = makeMode(chart, cb);

    mode.onPointerDown(1, 0, false, false); // 박스 시작 at y=0
    mode.onPointerMove(2, 5);
    const startYBefore = mode.boxSelectPixelRect?.startY;

    mode.onPointerDown(3, 9, false, false); // 재호출 → 가드로 무시

    expect(mode.isBoxSelecting).toBe(true);
    expect(mode.boxSelectPixelRect?.startY).toBe(startYBefore); // 시작점 유지
  });
});

// ---------------------------------------------------------------------------
// 드래그 재진입 가드 — 트릴존 리사이즈 재시작 버그
// ---------------------------------------------------------------------------

describe("SelectMode — 드래그 재진입 가드", () => {
  it("트릴존 리사이즈 진행 중 onPointerDown 재호출은 무시된다(매 move마다 origin 리셋 방지)", () => {
    // 터치 empty-select 후보 재생 경로는 매 move마다 onPointerDown(startX,startY)을 재호출한다.
    // 그 좌표가 트릴존 끝이면 resize가 매번 재시작돼 origin이 현재(이동된) 값으로 리셋된다.
    const chart = makeChart({
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(6) }],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      snapBeat: (b: Beat): Beat => b,
      hitTestTrillZoneEnd: (x: number): number | null => (x === 9 ? 0 : null),
    });
    const mode = makeMode(chart, cb);
    const priv = mode as unknown as { resizingOriginalEndBeat: Beat | null };

    mode.onPointerDown(9, 6, false, false); // 트릴존 끝(endBeat=6) 잡고 리사이즈 시작
    expect(mode.computeHoveredTrillZone(0, 0)).toBe(0); // 드래그 중이면 hover 히트 없어도 래치로 0

    mode.onPointerMove(9, 10); // 끝을 beat10으로 늘림 → zone.endBeat=10
    expect(beatToFloat(priv.resizingOriginalEndBeat!)).toBe(6); // origin은 원래값 유지

    mode.onPointerDown(9, 10, false, false); // 재호출 → 가드로 무시(재시작 안 됨)
    expect(beatToFloat(priv.resizingOriginalEndBeat!)).toBe(6); // 이동된 10으로 리셋되지 않음
  });
});

// ---------------------------------------------------------------------------
// 트릴존 hover 래치 — draggingTrillZoneIndex getter PULL을 대체하는 PUSH 메서드
// ---------------------------------------------------------------------------

describe("SelectMode — computeHoveredTrillZone", () => {
  it("드래그 아닐 때는 (x,y) 위 구간의 hitTestTrillZone 결과를 반환", () => {
    const cb = makeCallbacks({ hitTestTrillZone: (x: number): number | null => (x === 7 ? 2 : null) });
    const mode = makeMode(makeChart(), cb);
    expect(mode.computeHoveredTrillZone(7, 0)).toBe(2); // 구간 위 → hover
    expect(mode.computeHoveredTrillZone(1, 0)).toBe(null); // 빈 곳 → null
  });

  it("리사이즈 드래그 중이면 hover 히트와 무관하게 래치된 구간을 반환", () => {
    const chart = makeChart({ trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(6) }] });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      snapBeat: (b: Beat): Beat => b,
      hitTestTrillZoneEnd: (x: number): number | null => (x === 9 ? 0 : null),
      hitTestTrillZone: (): number | null => 2, // 커서가 다른 구간(2) 위여도
    });
    const mode = makeMode(chart, cb);
    mode.onPointerDown(9, 6, false, false); // 구간0 리사이즈 시작 → 래치 0
    expect(mode.computeHoveredTrillZone(99, 99)).toBe(0); // hover=2 무시하고 래치 0 유지
  });
});

// ---------------------------------------------------------------------------
// 리사이즈 프리뷰 — 낙관적 표시 (RFD 0017)
// ---------------------------------------------------------------------------

describe("SelectMode — 리사이즈 프리뷰 (낙관적 표시)", () => {
  // 구간[2,6] 레인1, 안에 트릴노트 beat4
  function setup() {
    const chart = makeChart({
      notes: [{ type: "trill", lane: 1 as Lane, beat: beat(4) }],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(6) }],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      snapBeat: (b: Beat): Beat => b,
      hitTestTrillZoneEnd: (x: number): number | null => (x === 9 ? 0 : null),
    });
    const mode = makeMode(chart, cb);
    const priv = mode as unknown as { chart: Chart };
    return { mode, cb, priv };
  }

  it("트릴존 끝을 트릴노트 안쪽(beat5)까지 축소하면 프리뷰 적용됨", () => {
    const { mode, priv } = setup();
    mode.onPointerDown(9, 6, false, false); // 리사이즈 시작
    mode.onPointerMove(9, 5); // endBeat 6→5, 트릴노트 beat4 여전히 안 → 유효
    expect(beatToFloat(priv.chart.trillZones[0].endBeat)).toBe(5);
  });

  it("트릴존 끝을 트릴노트 밖(beat3)으로 축소하면 프리뷰가 위반 위치를 그대로 표시(낙관적 편집)", () => {
    const { mode, cb, priv } = setup();
    mode.onPointerDown(9, 6, false, false);
    mode.onPointerMove(9, 5); // 유효 → endBeat=5
    const callsAfterValid = cb.onChartUpdate.mock.calls.length;

    mode.onPointerMove(9, 3); // endBeat 3이면 트릴노트 beat4가 구간 밖(의미 위반) — 낙관적으로 그대로 표시

    expect(beatToFloat(priv.chart.trillZones[0].endBeat)).toBe(3); // 위반 위치까지 축소 반영
    expect(cb.onChartUpdate.mock.calls.length).toBeGreaterThan(callsAfterValid); // 프리뷰 재커밋됨
  });
});

// ---------------------------------------------------------------------------
// 복사 / 잘라내기
// ---------------------------------------------------------------------------

describe("SelectMode — 복사/잘라내기", () => {
  it("선택된 노트가 없으면 copy()는 0을 반환", () => {
    const chart = makeChart();
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    expect(mode.copy()).toBe(0);
  });

  it("선택된 노트를 copy()하면 노트 수 반환", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    expect(mode.copy()).toBe(1);
    expect(mode.hasClipboard).toBe(true);
  });

  it("cut()하면 노트가 삭제되고 클립보드에 저장", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1 as Lane, beat: beat(0) },
      { type: "single", lane: 2 as Lane, beat: beat(1) },
    ];
    const chart = makeChart({ notes });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    const count = mode.cut();

    expect(count).toBe(1);
    expect(mode.hasClipboard).toBe(true);
    // deleteSelected should have been called — onChartUpdate with fewer notes
    expect(cb.onChartUpdate).toHaveBeenCalled();
    const updatedChart = cb.onChartUpdate.mock.calls[cb.onChartUpdate.mock.calls.length - 1][0] as Chart;
    expect(updatedChart.notes.length).toBe(1);
    expect(updatedChart.notes[0].lane).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 모바일 터치 선택
// ---------------------------------------------------------------------------

describe("SelectMode — 모바일 터치 선택", () => {
  it("터치 토글 선택에서 선택되지 않은 노트를 탭하면 기존 선택을 유지하고 추가", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks({
      hitTestNote: (x: number) => (x === 1 ? 0 : x === 2 ? 1 : null),
    });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.onPointerDown(2, 1, false, false, true);

    const selected = cb.getSelectionState().notes;
    expect([...selected].sort()).toEqual([0, 1]);
  });

  it("터치 토글 선택에서 이미 선택된 노트를 탭하면 선택에서 제거", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks({
      hitTestNote: () => 0,
    });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.onPointerDown(1, 0, false, false, true);

    const selected = cb.getSelectionState().notes;
    expect([...selected]).toEqual([]);
  });

  it("롱프레스용 selectExtraNote는 메인 선택을 비우고 엑스트라 노트만 선택", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const cb = makeCallbacks(undefined, { extraNotes, extraLaneCount: 1 });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.selectExtraNote(0);

    const mainSelected = cb.getSelectionState().notes;
    const extraSelected = cb.getSelectionState().extraNotes;
    expect([...mainSelected]).toEqual([]);
    expect([...extraSelected]).toEqual([0]);
  });

  it("롱프레스 이동을 이미 선택된 노트에서 시작하면 기존 다중 선택을 유지", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks({
      hitTestNote: (x: number) => (x === 1 ? 0 : x === 2 ? 1 : null),
    });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.onPointerDown(2, 1, false, false, true);
    mode.beginTouchMoveDragFromNote(0, 1, 0);

    expect([...mode.selection].sort()).toEqual([0, 1]);
    expect(mode.isMoveDragging).toBe(true);
    expect(mode.moveOrigins.size).toBe(2);
  });

  it("롱프레스 이동을 선택되지 않은 노트에서 시작하면 해당 노트만 이동 대상으로 선택", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.beginTouchMoveDragFromNote(1, 2, 1);

    expect([...mode.selection]).toEqual([1]);
    expect(mode.isMoveDragging).toBe(true);
    expect(mode.moveOrigins.size).toBe(1);
  });

  it("롱프레스 이동을 이미 선택된 엑스트라 노트에서 시작하면 기존 엑스트라 다중 선택을 유지", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(0) },
      { type: "single", extraLane: 2, beat: beat(1) },
    ];
    const cb = makeCallbacks(
      {
        hitTestExtraNote: (x: number) => (x === 5 ? 0 : x === 6 ? 1 : null),
      },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    mode.selectExtraNote(0);
    mode.onPointerDown(6, 1, false, false, true);
    mode.beginTouchMoveDragFromExtraNote(0, 5, 0);

    const extraSelected = cb.getSelectionState().extraNotes;
    expect([...extraSelected].sort()).toEqual([0, 1]);
    expect(mode.isMoveDragging).toBe(true);
  });

  it("beginLongPressDrag: 노트 히트면 이동 드래그를 시작한다", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 1 as Lane, beat: beat(0) }] });
    const mode = makeMode(chart, makeCallbacks());
    const started = mode.beginLongPressDrag(1, 0, { noteEndHit: null, noteHit: 0, extraHit: null });
    expect(started).toBe(true);
    expect(mode.isMoveDragging).toBe(true);
    expect([...mode.selection]).toEqual([0]);
  });

  it("beginLongPressDrag: 노트 끝 히트가 노트보다 우선해 리사이즈(이동 아님)를 시작한다", () => {
    const chart = makeChart({
      notes: [{ type: "long", lane: 1 as Lane, beat: beat(1), endBeat: beat(1) }],
    });
    const mode = makeMode(chart, makeCallbacks());
    const started = mode.beginLongPressDrag(1, 1, { noteEndHit: 0, noteHit: 0, extraHit: null });
    expect(started).toBe(true);
    expect(mode.isMoveDragging).toBe(false); // 리사이즈라 이동 드래그가 아니다
    expect([...mode.selection]).toEqual([0]);
  });

  it("beginLongPressDrag: 노트 히트 없고 엑스트라 히트면 엑스트라 이동을 시작한다", () => {
    const extraNotes: ExtraNoteEntity[] = [{ type: "single", extraLane: 1, beat: beat(0) }];
    const cb = makeCallbacks({}, { extraNotes, extraLaneCount: 2 });
    const mode = makeMode(makeChart(), cb);
    const started = mode.beginLongPressDrag(5, 0, { noteEndHit: null, noteHit: null, extraHit: 0 });
    expect(started).toBe(true);
    expect(mode.isMoveDragging).toBe(true);
  });

  it("beginLongPressDrag: 아무 히트도 없으면 드래그를 시작하지 않고 false를 반환한다", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 1 as Lane, beat: beat(0) }] });
    const mode = makeMode(chart, makeCallbacks());
    const started = mode.beginLongPressDrag(1, 0, { noteEndHit: null, noteHit: null, extraHit: null });
    expect(started).toBe(false);
    expect(mode.isMoveDragging).toBe(false);
  });

  it("선택되지 않은 메인 노트를 첫 드래그로 바로 이동", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks({
      hitTestNote: (x: number, y: number) => (x === 1 && y === 0 ? 0 : null),
      yToBeat: (y: number): Beat => beat(y),
    });
    const mode = makeMode(chart, cb);

    mode.onPointerDown(1, 0, false, false);
    mode.onPointerMove(2, 1);
    mode.onPointerUp(2, 1);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes[0].lane).toBe(2);
    expect(updated.notes[0].beat.n / updated.notes[0].beat.d).toBe(1);
  });

  it("선택된 엑스트라 노트를 snap 단위로 위아래 이동", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const cb = makeCallbacks(
      {
        hitTestExtraNote: () => 0,
      },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    mode.onPointerDown(5, 2, false, false);
    mode.moveBySnap("up");

    const movedUp = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(movedUp[0].beat.n / movedUp[0].beat.d).toBe(3);

    mode.moveBySnap("down");

    const movedDown = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(movedDown[0].beat.n / movedDown[0].beat.d).toBe(2);
  });

  it("선택된 메인 노트를 롱프레스 시작점에서 드래그 이동", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
    });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.beginMoveDrag(1, 0);
    mode.onPointerMove(2, 1);
    mode.onPointerUp(2, 1);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes[0].lane).toBe(2);
    expect(updated.notes[0].beat.n / updated.notes[0].beat.d).toBe(1);
  });

  it("여러 메인 노트 드래그 이동은 결과 위치가 아니라 이동량만 snap 단위로 적용", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(1, 16) },
        { type: "single", lane: 2 as Lane, beat: beat(2, 16) },
        { type: "single", lane: 3 as Lane, beat: beat(3, 16) },
      ],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y, 16),
      snapBeat: (b: Beat): Beat => beat(Math.round((b.n / b.d) * 4), 4),
    });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    addNotesToSelection(cb, 1, 2);
    mode.beginMoveDrag(1, 0);
    mode.onPointerMove(1, 4);
    mode.onPointerUp(1, 4);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes.map((n) => n.beat.n / n.beat.d)).toEqual([
      5 / 16,
      6 / 16,
      7 / 16,
    ]);
  });

  it("선택된 엑스트라 노트를 롱프레스 시작점에서 드래그 이동", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const cb = makeCallbacks(
      {
        yToBeat: (y: number): Beat => beat(y),
      },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    mode.selectExtraNote(0);
    mode.beginMoveDrag(5, 2);
    mode.onPointerMove(6, 3);
    mode.onPointerUp(6, 3);

    const updated = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(updated[0].extraLane).toBe(2);
    expect(updated[0].beat.n / updated[0].beat.d).toBe(3);
  });

  it("여러 엑스트라 노트 드래그 이동도 기존 세부 오프셋을 보존", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(1, 16) },
      { type: "single", extraLane: 1, beat: beat(2, 16) },
    ];
    const cb = makeCallbacks(
      {
        yToBeat: (y: number): Beat => beat(y, 16),
        snapBeat: (b: Beat): Beat => beat(Math.round((b.n / b.d) * 4), 4),
      },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    mode.selectExtraNote(0);
    addExtraNotesToSelection(cb, 1);
    mode.beginMoveDrag(5, 0);
    mode.onPointerMove(5, 4);
    mode.onPointerUp(5, 4);

    const updated = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(updated.map((n) => n.beat.n / n.beat.d)).toEqual([
      5 / 16,
      6 / 16,
    ]);
  });

  it("길이 0인 롱노트를 롱프레스 시작점에서 드래그 이동", () => {
    const chart = makeChart({
      notes: [
        { type: "long", lane: 1 as Lane, beat: beat(1), endBeat: beat(1) },
      ],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
    });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.beginMoveDrag(1, 1);
    mode.onPointerMove(2, 3);
    mode.onPointerUp(2, 3);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes[0]).toMatchObject({
      lane: 2,
      beat: beat(3),
      endBeat: beat(3),
    });
  });

  it("길이 0인 롱노트 끝점을 롱프레스로 리사이즈", () => {
    const chart = makeChart({
      notes: [
        { type: "long", lane: 1 as Lane, beat: beat(1), endBeat: beat(1) },
      ],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
    });
    const mode = makeMode(chart, cb);

    expect(mode.beginNoteEndResizeDrag(0)).toBe(true);
    mode.onPointerMove(1, 3);
    mode.onPointerUp(1, 3);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes[0]).toMatchObject({
      beat: beat(1),
      endBeat: beat(3),
    });
  });
});

// ---------------------------------------------------------------------------
// 롱노트 끝 캡 리사이즈 (미선택 상태에서 한 동작으로)
// ---------------------------------------------------------------------------

describe("SelectMode — 롱노트 끝 캡 리사이즈", () => {
  it("롱노트 끝 캡을 잡으면 미리 선택 안 해도 리사이즈되고 그 노트가 선택된다", () => {
    const chart = makeChart({
      notes: [{ type: "long", lane: 1 as Lane, beat: beat(2), endBeat: beat(6) }],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      hitTestNote: () => 0, // 끝 위치의 z-order 최상위 = 롱노트 0
      hitTestNoteEnd: () => 0,
    });
    const mode = makeMode(chart, cb);

    mode.onPointerDown(1, 6, false, false);
    mode.onPointerMove(1, 9);
    mode.onPointerUp(1, 9);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes[0]).toMatchObject({ beat: beat(2), endBeat: beat(9) });
    expect([...mode.selection]).toEqual([0]);
  });

  it("끝점에 다른 노트가 위에 있으면(o-o- 겹침) 끝 캡 리사이즈가 가로채지 않는다", () => {
    const chart = makeChart({
      notes: [
        { type: "long", lane: 1 as Lane, beat: beat(2), endBeat: beat(6) }, // idx0
        { type: "single", lane: 1 as Lane, beat: beat(6) }, // idx1: 롱노트 끝점 위에 겹친 단노트
      ],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      hitTestNote: () => 1, // 최상위는 단노트
      hitTestNoteEnd: () => 0, // 끝점은 롱노트 0
    });
    const mode = makeMode(chart, cb);

    mode.onPointerDown(1, 6, false, false);

    // 리사이즈로 가로채지 않고 단노트(idx1)가 선택돼야 한다.
    expect([...mode.selection]).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// 붙여넣기
// ---------------------------------------------------------------------------

describe("SelectMode — 붙여넣기", () => {
  it("클립보드가 비어있으면 paste()는 0 반환", () => {
    const chart = makeChart();
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    expect(mode.paste(beat(4))).toBe(0);
    expect(mode.isPendingPaste).toBe(false);
  });

  it("붙여넣기 시 커서 위치에 노트 배치 + 배치 대기 상태 진입", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    // 첫 번째 노트만 선택 후 복사
    mode.selectNote(0);
    mode.copy();

    // beat(4)에 붙여넣기
    const count = mode.paste(beat(4));

    expect(count).toBe(1);
    expect(mode.isPendingPaste).toBe(true);

    // onChartUpdate should have been called with new notes appended
    expect(cb.onChartUpdate).toHaveBeenCalled();
  });

  it("롱노트 복사 시 duration 보존", () => {
    const chart = makeChart({
      notes: [
        { type: "long", lane: 1 as Lane, beat: beat(2), endBeat: beat(6) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();

    // beat(10)에 붙여넣기 — anchor는 beat(2), offset = beat(8)
    mode.paste(beat(10));

    const updatedChart = cb.onChartUpdate.mock.calls[cb.onChartUpdate.mock.calls.length - 1][0] as Chart;
    const pasted = updatedChart.notes[updatedChart.notes.length - 1];
    expect(pasted.type).toBe("long");
    expect(pasted.beat.n / pasted.beat.d).toBe(10);
    expect('endBeat' in pasted).toBe(true);
    if ('endBeat' in pasted) {
      // endBeat = 10 + (6-2) = 14
      expect(pasted.endBeat.n / pasted.endBeat.d).toBe(14);
    }
  });

  it("여러 노트 복사 시 상대 위치 보존", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(2) },
        { type: "single", lane: 3 as Lane, beat: beat(4) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    // 두 노트 모두 선택
    mode.selectNote(0);
    // 두 번째 노트도 게이트를 지나 선택에 추가
    addNotesToSelection(cb, 1);
    mode.copy();

    // beat(10)에 붙여넣기 — anchor = beat(2), offset = beat(8)
    mode.paste(beat(10));

    const updatedChart = cb.onChartUpdate.mock.calls[cb.onChartUpdate.mock.calls.length - 1][0] as Chart;
    const pastedNotes = updatedChart.notes.slice(2); // 원본 2개 뒤에 추가됨

    expect(pastedNotes.length).toBe(2);
    // 첫 노트: beat(2) + beat(8) = beat(10), lane 1
    expect(pastedNotes[0].beat.n / pastedNotes[0].beat.d).toBe(10);
    expect(pastedNotes[0].lane).toBe(1);
    // 둘째 노트: beat(4) + beat(8) = beat(12), lane 3
    expect(pastedNotes[1].beat.n / pastedNotes[1].beat.d).toBe(12);
    expect(pastedNotes[1].lane).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 배치 확정 / 취소
// ---------------------------------------------------------------------------

describe("SelectMode — 붙여넣기 확정/취소", () => {
  function setupPaste() {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(4)); // 비어있는 위치에 붙여넣기

    return { chart, cb, mode };
  }

  it("confirmPlacement — 제약 만족 시 배치 확정", () => {
    const { mode } = setupPaste();

    mode.confirmPlacement();

    expect(mode.isPendingPaste).toBe(false);
  });

  it("cancelPaste — 붙여넣은 노트 제거, 원래 상태 복원", () => {
    const { cb, mode } = setupPaste();

    mode.cancelPaste();

    expect(mode.isPendingPaste).toBe(false);
    // 원래 노트만 남아야 함
    const lastChart = cb.onChartUpdate.mock.calls[cb.onChartUpdate.mock.calls.length - 1][0] as Chart;
    expect(lastChart.notes.length).toBe(1);
    expect(lastChart.notes[0].beat.n / lastChart.notes[0].beat.d).toBe(0);
  });

  it("confirmPlacement — 중복 위치 붙여넣기(의미 위반)도 낙관 확정된다 (place-then-fix, RFD 0017 §2)", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(0)); // 같은 위치에 붙여넣기 = 중복(의미 위반)

    mode.confirmPlacement();

    // 붙여넣기 확정도 이동과 동형 — 구조 위반만 거부, 의미 위반은 transient 커밋(해칭·게이트가 강제)
    expect(mode.isPendingPaste).toBe(false);
    expect(cb.onWarn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 배치 대기 중 이동
// ---------------------------------------------------------------------------

describe("SelectMode — 붙여넣기 후 이동", () => {
  it("movePasteBySnap('up')으로 위치 이동", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(4));

    // 이동 전 위치 확인
    let lastChart = cb.onChartUpdate.mock.calls[cb.onChartUpdate.mock.calls.length - 1][0] as Chart;
    const pastedBefore = lastChart.notes[lastChart.notes.length - 1];
    expect(pastedBefore.beat.n / pastedBefore.beat.d).toBe(4);

    // snap 1단위 위로 이동
    mode.movePasteBySnap('up');

    lastChart = cb.onChartUpdate.mock.calls[cb.onChartUpdate.mock.calls.length - 1][0] as Chart;
    const pastedAfter = lastChart.notes[lastChart.notes.length - 1];
    expect(pastedAfter.beat.n / pastedAfter.beat.d).toBe(5); // 4 + 1 snap step
  });

  it("movePasteByLane('right')로 레인 이동", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(4)); // lane 1에 붙여넣기

    mode.movePasteByLane('right');

    const lastChart = cb.onChartUpdate.mock.calls[cb.onChartUpdate.mock.calls.length - 1][0] as Chart;
    const pasted = lastChart.notes[lastChart.notes.length - 1];
    expect(pasted.lane).toBe(2);
  });

  it("레인 4에서 movePasteByLane('right') 시 이동 안 됨", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 4 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(4)); // lane 4에 붙여넣기

    const callCountBefore = cb.onChartUpdate.mock.calls.length;
    mode.movePasteByLane('right');

    // onChartUpdate should NOT have been called again (move blocked)
    expect(cb.onChartUpdate.mock.calls.length).toBe(callCountBefore);
  });
});

// ---------------------------------------------------------------------------
// 차트 범위 밖 붙여넣기 방지
// ---------------------------------------------------------------------------

describe("SelectMode — 차트 범위 밖 붙여넣기 방지", () => {
  it("붙여넣기 위치가 maxBeat를 초과하면 paste()는 0을 반환하고 경고", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    // maxBeatFloat = 16 (4마디)
    const cb = makeCallbacks({ getMaxBeatFloat: () => 16 });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();

    // beat(20)에 붙여넣기 → 16 초과
    const count = mode.paste(beat(20));

    expect(count).toBe(0);
    expect(mode.isPendingPaste).toBe(false);
    expect(cb.onWarn).toHaveBeenCalled();
  });

  it("롱노트 endBeat가 maxBeat를 초과하면 paste()는 0을 반환", () => {
    const chart = makeChart({
      notes: [
        { type: "long", lane: 1 as Lane, beat: beat(0), endBeat: beat(4) },
      ],
    });
    const cb = makeCallbacks({ getMaxBeatFloat: () => 16 });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();

    // beat(14)에 붙여넣기 → endBeat = 14 + 4 = 18 > 16
    const count = mode.paste(beat(14));

    expect(count).toBe(0);
    expect(mode.isPendingPaste).toBe(false);
    expect(cb.onWarn).toHaveBeenCalled();
  });

  it("음수 beat 위치에 붙여넣기 시 paste()는 0을 반환", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(2) },
        { type: "single", lane: 2 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    // beat(2)와 beat(0) 모두 선택 — anchor는 beat(0)
    mode.selectNote(0);
    addNotesToSelection(cb, 1);
    mode.copy();

    // beat(0)에 붙여넣기하면 anchor=beat(0)이므로 beat(0)과 beat(2)에 배치 → OK
    // 하지만 음수 offset을 만들려면: targetBeat < anchorBeat 중 가장 작은 노트
    // anchor = min(beat(2), beat(0)) = beat(0)
    // 그래서 beat(2) 노트는 target + 2에 배치됨
    // 음수를 만들려면 target 자체가 음수여야 함 — beat 함수로 음수 생성
    const negBeat = { n: -2, d: 1 };
    const count = mode.paste(negBeat);

    expect(count).toBe(0);
    expect(mode.isPendingPaste).toBe(false);
    expect(cb.onWarn).toHaveBeenCalled();
  });

  it("범위 경계에 정확히 맞는 붙여넣기는 성공", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks({ getMaxBeatFloat: () => 16 });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();

    // beat(16) = maxBeat 경계에 정확히 → 허용
    const count = mode.paste(beat(16));

    expect(count).toBe(1);
    expect(mode.isPendingPaste).toBe(true);
  });

  it("movePasteBySnap으로 maxBeat를 초과하면 이동 거부", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks({ getMaxBeatFloat: () => 16 });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(16)); // 경계에 배치

    const callCountBefore = cb.onChartUpdate.mock.calls.length;
    mode.movePasteBySnap('up'); // 16 + 1 = 17 > 16 → 거부

    expect(cb.onChartUpdate.mock.calls.length).toBe(callCountBefore);
  });

  it("movePasteBySnap으로 beat 0 미만이면 이동 거부", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks({ getMaxBeatFloat: () => 16 });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(0, 1)); // beat 0에 배치

    const callCountBefore = cb.onChartUpdate.mock.calls.length;
    mode.movePasteBySnap('down'); // 0 - 1 = -1 < 0 → 거부

    expect(cb.onChartUpdate.mock.calls.length).toBe(callCountBefore);
  });
});

// ---------------------------------------------------------------------------
// moveByLane — 메인 레인 내 이동
// ---------------------------------------------------------------------------

describe("SelectMode.moveByLane — 메인 레인 내 이동", () => {
  it("레인 2 노트를 왼쪽으로 이동하면 레인 1로 이동", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 2 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(chart);
    const mode = makeMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("left");

    const updated = cb.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes[0].lane).toBe(1);
  });

  it("레인 1 노트를 왼쪽으로 이동하면 차단", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(chart);
    const mode = makeMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("left");

    expect(cb.onChartUpdate).not.toHaveBeenCalled();
  });

  it("레인 3 노트를 오른쪽으로 이동하면 레인 4로 이동", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 3 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(chart);
    const mode = makeMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("right");

    const updated = cb.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes[0].lane).toBe(4);
  });

  it("이동으로 같은 레인·박 중복(의미 위반)이 생겨도 롤백 없이 커밋된다 (낙관적 편집)", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks(chart);
    const mode = makeMode(chart, cb);
    mode.selectNote(1); // 레인 2 노트 선택

    mode.moveByLane("left"); // 레인 2 → 1 → 레인1 beat0 노트와 중복(의미 위반)

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes[1].lane).toBe(1); // 원위치(레인2)로 되돌리지 않고 중복 상태로 커밋
  });
});

// ---------------------------------------------------------------------------
// moveByLane — 메인 레인 4 → 엑스트라 레인 1 변환
// ---------------------------------------------------------------------------

describe("SelectMode.moveByLane — 메인→엑스트라 변환", () => {
  it("레인 4 노트를 오른쪽으로 이동하면 extraLane 1로 변환 (extraLaneCount > 0)", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 4 as Lane, beat: beat(2) }],
    });
    const cb = makeCallbacks(chart, { extraLaneCount: 2 });
    const mode = makeMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("right");

    // 메인 노트에서 제거됨
    const updated = cb.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(0);

    // 엑스트라 노트로 추가됨
    expect(cb.onExtraNotesUpdate).toHaveBeenCalled();
    const extraNotes = cb.onExtraNotesUpdate.mock.calls[0][0] as ExtraNoteEntity[];
    expect(extraNotes).toHaveLength(1);
    expect(extraNotes[0].extraLane).toBe(1);
    expect(extraNotes[0].type).toBe("single");
  });

  it("레인 4 롱노트를 오른쪽으로 이동하면 endBeat 포함하여 엑스트라로 변환", () => {
    const chart = makeChart({
      notes: [
        { type: "long", lane: 4 as Lane, beat: beat(0), endBeat: beat(4) },
      ],
    });
    const cb = makeCallbacks(chart, { extraLaneCount: 1 });
    const mode = makeMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("right");

    const extraNotes = cb.onExtraNotesUpdate.mock.calls[0][0] as ExtraNoteEntity[];
    expect(extraNotes).toHaveLength(1);
    expect(extraNotes[0].extraLane).toBe(1);
    expect("endBeat" in extraNotes[0]).toBe(true);
  });

  it("레인 4 노트를 오른쪽으로 이동 시 extraLaneCount=0이면 차단", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 4 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(chart, { extraLaneCount: 0 });
    const mode = makeMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("right");

    expect(cb.onChartUpdate).not.toHaveBeenCalled();
    expect(cb.onExtraNotesUpdate).not.toHaveBeenCalled();
  });

  it("메인→엑스트라 변환 후 선택이 엑스트라로 전환됨", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 4 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(chart, { extraLaneCount: 2 });
    const mode = makeMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("right");

    // 메인 선택 해제
    expect(cb.getSelectionState().notes.size).toBe(0);

    // 엑스트라 선택 설정
    expect(cb.getSelectionState().extraNotes.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// moveByLane — 엑스트라 레인 내 이동
// ---------------------------------------------------------------------------

describe("SelectMode.moveByLane — 엑스트라 레인 내 이동", () => {
  it("extraLane 1 노트를 오른쪽으로 이동하면 extraLane 2로 이동", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(0) },
    ];
    const cb = makeCallbacks(chart, { extraNotes, extraLaneCount: 3 });

    // 엑스트라 노트를 선택하기 위해 hitTestExtraNote가 0을 반환하도록 설정
    const mode = makeMode(chart, { ...cb, hitTestExtraNote: () => 0 });
    mode.onPointerDown(5, 0, false, false); // 엑스트라 영역 클릭

    mode.moveByLane("right");

    expect(cb.onExtraNotesUpdate).toHaveBeenCalled();
    const updated = cb.onExtraNotesUpdate.mock.calls[0][0] as ExtraNoteEntity[];
    expect(updated[0].extraLane).toBe(2);
  });

  it("extraLane 최대값 노트를 오른쪽으로 이동하면 차단", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 3, beat: beat(0) },
    ];
    const cb = makeCallbacks(chart, { extraNotes, extraLaneCount: 3 });
    const mode = makeMode(chart, { ...cb, hitTestExtraNote: () => 0 });
    mode.onPointerDown(5, 0, false, false);

    mode.moveByLane("right");

    expect(cb.onExtraNotesUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// moveByLane — 엑스트라 레인 1 → 메인 레인 4 변환
// ---------------------------------------------------------------------------

describe("SelectMode.moveByLane — 엑스트라→메인 변환", () => {
  it("extraLane 1 노트를 왼쪽으로 이동하면 메인 레인 4로 변환", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const cb = makeCallbacks(chart, { extraNotes, extraLaneCount: 2 });
    const mode = makeMode(chart, { ...cb, hitTestExtraNote: () => 0 });
    mode.onPointerDown(5, 2, false, false);

    mode.moveByLane("left");

    // 메인 노트에 추가됨
    const updated = cb.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(1);
    expect(updated.notes[0].lane).toBe(4);
    expect(updated.notes[0].type).toBe("single");

    // 엑스트라 노트에서 제거됨
    expect(cb.onExtraNotesUpdate).toHaveBeenCalled();
    const updatedExtra = cb.onExtraNotesUpdate.mock.calls[0][0] as ExtraNoteEntity[];
    expect(updatedExtra).toHaveLength(0);
  });

  it("extraLane 1 롱노트를 왼쪽으로 이동하면 endBeat 포함하여 메인으로 변환", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "long", extraLane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    const cb = makeCallbacks(chart, { extraNotes, extraLaneCount: 1 });
    const mode = makeMode(chart, { ...cb, hitTestExtraNote: () => 0 });
    mode.onPointerDown(5, 0, false, false);

    mode.moveByLane("left");

    const updated = cb.onChartUpdate.mock.calls[0][0] as Chart;
    expect(updated.notes).toHaveLength(1);
    expect(updated.notes[0].lane).toBe(4);
    expect("endBeat" in updated.notes[0]).toBe(true);
  });

  it("엑스트라→메인 변환 후 선택이 메인으로 전환됨", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(0) },
    ];
    const cb = makeCallbacks(chart, { extraNotes, extraLaneCount: 1 });
    const mode = makeMode(chart, { ...cb, hitTestExtraNote: () => 0 });
    mode.onPointerDown(5, 0, false, false);

    mode.moveByLane("left");

    // 엑스트라 선택 해제
    expect(cb.getSelectionState().extraNotes.size).toBe(0);

    // 메인 선택 설정
    expect(cb.getSelectionState().notes.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 박스 선택 — 마디 밖 커서 처리
// ---------------------------------------------------------------------------

describe("SelectMode — 박스 선택 마디 밖 커서", () => {
  it("박스 선택 중 pointerUp이 레인 밖(xToLane=null)에서 발생해도 선택이 유지된다", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
        { type: "single", lane: 3 as Lane, beat: beat(2) },
      ],
    });
    // yToBeatRaw maps y directly to beat for predictable box selection
    const cb = makeCallbacks({
      yToBeatRaw: (y: number): Beat => beat(y),
    });
    const mode = makeMode(chart, cb);

    // Start box select at lane 1, beat 0 (pointerDown on empty area)
    mode.onPointerDown(1, 0, false, false);

    // Drag to lane 3, beat 3 — covers all 3 notes
    mode.onPointerMove(3, 3);

    // Release cursor outside the lane area (x=10 → xToLane returns null)
    mode.onPointerUp(10, 3);

    // Selection should still contain the notes selected during drag
    const lastSelection = cb.getSelectionState().notes;
    expect(lastSelection.size).toBe(3);
  });

  it("박스 선택 중 커서가 레인 밖으로 이동해도 이전 레인 범위가 유지된다", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks({
      yToBeatRaw: (y: number): Beat => beat(y),
    });
    const mode = makeMode(chart, cb);

    // Start box select at lane 1, beat 0
    mode.onPointerDown(1, 0, false, false);

    // Drag to lane 2, beat 2 — covers both notes
    mode.onPointerMove(2, 2);

    // Move cursor outside lane area (x=10 → xToLane returns null)
    mode.onPointerMove(10, 2);

    // The box select should still have the previous lane range
    // isBoxSelecting should still be true
    expect(mode.isBoxSelecting).toBe(true);

    // Release inside lane area to finalize
    mode.onPointerUp(2, 2);

    const lastSelection = cb.getSelectionState().notes;
    expect(lastSelection.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 박스 선택 — 엑스트라 레인 노트 선택
// ---------------------------------------------------------------------------

describe("SelectMode — 박스 선택 엑스트라 레인", () => {
  it("lane 5 beat 0에서 lane 6 beat 2까지 드래그하면 범위 안 보조 노트 2개가 선택된다", () => {
    const chart = makeChart({ notes: [
      { type: "single", lane: 5, beat: beat(0) },
      { type: "single", lane: 6, beat: beat(1) },
      { type: "single", lane: 5, beat: beat(3) },
    ] });
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    // 엑스트라 레인 1(x=5), beat 0에서 시작
    mode.onPointerDown(5, 0, false, false);
    // 엑스트라 레인 2(x=6), beat 2까지 드래그
    mode.onPointerMove(6, 2);
    expect(mode.boxSelectPixelRect).toMatchObject({ startLane: 5, endLane: 6 });
    mode.onPointerUp(6, 2);

    const lastExtraSel = cb.getSelectionState().extraNotes;
    // extraNotes[0] (lane 1, beat 0)과 extraNotes[1] (lane 2, beat 1)이 선택됨
    expect(lastExtraSel.size).toBe(2);
    expect(lastExtraSel.has(0)).toBe(true);
    expect(lastExtraSel.has(1)).toBe(true);
    // extraNotes[2] (beat 3)은 범위 밖
    expect(lastExtraSel.has(2)).toBe(false);
  });

  it("lane 5 안에서만 드래그하면 lane 5 노트 1개만 선택된다", () => {
    const chart = makeChart({ notes: [
      { type: "single", lane: 5, beat: beat(0) },
      { type: "single", lane: 6, beat: beat(0) },
    ] });
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    // 엑스트라 레인 1(x=5)에서만 드래그
    mode.onPointerDown(5, 0, false, false);
    mode.onPointerMove(5, 1);
    mode.onPointerUp(5, 1);

    const lastExtraSel = cb.getSelectionState().extraNotes;
    expect(lastExtraSel.size).toBe(1);
    expect(lastExtraSel.has(0)).toBe(true); // extraLane 1만
    expect(lastExtraSel.has(1)).toBe(false); // extraLane 2는 제외
  });

  it("lane 3에서 lane 5까지 드래그하면 lane 3·4 메인 노트와 lane 5 보조 노트가 선택된다", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 3 as Lane, beat: beat(1) },
        { type: "single", lane: 4 as Lane, beat: beat(1) },
        { type: "single", lane: 1 as Lane, beat: beat(1) }, // 범위 밖 (레인 1-2는 미포함)
        { type: "single", lane: 5, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    // 메인 레인 3(x=3), beat 0에서 시작
    mode.onPointerDown(3, 0, false, false);
    // 엑스트라 레인 1(x=5), beat 2까지 드래그
    mode.onPointerMove(5, 2);
    mode.onPointerUp(5, 2);

    // 메인 노트: 레인 3, 4 (beat 1)이 선택, 레인 1은 범위 밖
    const lastMainSel = cb.getSelectionState().notes;
    expect(lastMainSel.size).toBe(2);
    expect(lastMainSel.has(0)).toBe(true); // lane 3
    expect(lastMainSel.has(1)).toBe(true); // lane 4

    // 엑스트라 노트: extraLane 1 (beat 1)이 선택
    const lastExtraSel = cb.getSelectionState().extraNotes;
    expect(lastExtraSel.size).toBe(1);
    expect(lastExtraSel.has(0)).toBe(true);
  });

  it("lane 5~6 beat 0~2에 노트가 없으면 보조 선택은 0개다", () => {
    const chart = makeChart({ notes: [
      { type: "single", lane: 5, beat: beat(5) },
    ] });
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    mode.onPointerDown(5, 0, false, false);
    mode.onPointerMove(6, 2);
    mode.onPointerUp(6, 2);

    const lastExtraSel = cb.getSelectionState().extraNotes;
    expect(lastExtraSel.size).toBe(0);
  });

  it("lane 5 박스를 beat 1에서 beat 3으로 넓히면 보조 선택이 1개에서 2개로 갱신된다", () => {
    const chart = makeChart({ notes: [
      { type: "single", lane: 5, beat: beat(0) },
      { type: "single", lane: 5, beat: beat(2) },
    ] });
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraLaneCount: 1 },
    );
    const mode = makeMode(chart, cb);

    mode.onPointerDown(5, 0, false, false);

    // 작은 범위 드래그 — beat 0~1만 포함
    mode.onPointerMove(5, 1);
    let sel = cb.getSelectionState().extraNotes;
    expect(sel.size).toBe(1);
    expect(sel.has(0)).toBe(true);

    // 범위 확대 — beat 0~3 포함
    mode.onPointerMove(5, 3);
    sel = cb.getSelectionState().extraNotes;
    expect(sel.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 선택 동질성 (트릴-같은구간 XOR 일반, Shift 추가/박스)
// ---------------------------------------------------------------------------

describe("SelectMode — 선택 동질성", () => {
  // 인덱스 0,1: 구간0(레인1) 트릴, 2: 구간1(레인2) 트릴, 3: 일반(레인3)
  function makeChartH(): Chart {
    return makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(2) },  // 0
        { type: "trill", lane: 1 as Lane, beat: beat(3) },  // 1
        { type: "trill", lane: 2 as Lane, beat: beat(7) },  // 2
        { type: "single", lane: 3 as Lane, beat: beat(1) }, // 3
      ],
      trillZones: [
        { lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }, // 구간0
        { lane: 2 as Lane, beat: beat(6), endBeat: beat(8) }, // 구간1
      ],
    });
  }
  // x값(=인덱스)으로 노트를 히트테스트
  const hitByIndex = { hitTestNote: (x: number) => (x >= 0 && x <= 3 ? x : null) };

  it("같은 구간 트릴노트는 Shift로 추가된다", () => {
    const cb = makeCallbacks(hitByIndex);
    const mode = makeMode(makeChartH(), cb);
    mode.selectNote(0);
    mode.onPointerDown(1, 0, true, false); // shift-click 인덱스 1(같은 구간0)

    const sel = cb.getSelectionState().notes;
    expect([...sel].sort()).toEqual([0, 1]);
    expect(cb.onWarn).not.toHaveBeenCalled();
  });

  it("다른 구간 트릴노트는 Shift 추가가 막히고 토스트", () => {
    const cb = makeCallbacks(hitByIndex);
    const mode = makeMode(makeChartH(), cb);
    mode.selectNote(0);
    mode.onPointerDown(2, 0, true, false); // shift-click 인덱스 2(구간1)

    expect([...mode.selection]).toEqual([0]);
    expect(cb.onWarn).toHaveBeenCalledWith(expect.stringContaining("다른 트릴 구간"));
  });

  it("트릴 선택에 일반노트 Shift 추가가 막히고 토스트", () => {
    const cb = makeCallbacks(hitByIndex);
    const mode = makeMode(makeChartH(), cb);
    mode.selectNote(0);
    mode.onPointerDown(3, 0, true, false); // shift-click 인덱스 3(일반)

    expect([...mode.selection]).toEqual([0]);
    expect(cb.onWarn).toHaveBeenCalledWith(expect.stringContaining("일반 노트"));
  });

  it("일반 선택에 트릴노트 Shift 추가가 막힌다", () => {
    const cb = makeCallbacks(hitByIndex);
    const mode = makeMode(makeChartH(), cb);
    mode.selectNote(3);
    mode.onPointerDown(0, 0, true, false); // shift-click 인덱스 0(트릴)

    expect([...mode.selection]).toEqual([3]);
    expect(cb.onWarn).toHaveBeenCalled();
  });

  it("박스는 트릴 노트를 개별로 집지 않고 겹치는 구간 유닛과 일반 노트를 함께 집는다 (RFD 0016 §4.3)", () => {
    const cb = makeCallbacks();
    cb.yToBeatRaw = (y: number): Beat => beat(y); // y를 박자로 매핑
    const mode = makeMode(makeChartH(), cb);
    // 빈 영역(레인1, beat0)에서 박스 시작 → 레인3, beat10까지 드래그
    mode.onPointerDown(1, 0, false, false);
    mode.onPointerMove(3, 10);

    const sel = cb.getSelectionState();
    // 트릴 노트 0,1,2는 개별 미픽업 — 일반 노트 3만 notes로
    expect([...sel.notes]).toEqual([3]);
    // 구간0(레인1)·구간1(레인2)은 박스와 겹쳐 유닛으로 픽업
    expect([...sel.zones].sort()).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// 트릴 노트 이동 제약 (구간 안에서만, 레인 변경 불가)
// ---------------------------------------------------------------------------

describe("SelectMode — 트릴 노트 이동 제약", () => {
  // 구간[2,6] 레인1, 트릴 노트 1개
  function makeChartT(noteBeat: Beat): Chart {
    return makeChart({
      notes: [{ type: "trill", lane: 1 as Lane, beat: noteBeat }],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(6) }],
    });
  }

  it("moveByLane은 트릴 선택에서 차단되고 토스트", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartT(beat(3)), cb);
    mode.selectNote(0);
    mode.moveByLane("right");

    expect(cb.onChartUpdate).not.toHaveBeenCalled(); // 이동 적용 안 됨
    expect(cb.onWarn).toHaveBeenCalledWith(expect.stringContaining("레인 이동"));
  });

  it("moveBySnap(up)이 구간 안이면 이동된다", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartT(beat(3)), cb);
    mode.selectNote(0);
    mode.moveBySnap("up"); // +1박 → beat4, 구간[2,6] 안

    const calls = cb.onChartUpdate.mock.calls;
    const updated = calls[calls.length - 1][0] as Chart;
    expect(beatToFloat(updated.notes[0].beat)).toBe(4);
  });

  it("moveBySnap(up)이 구간 상단을 벗어나면 차단되고 토스트", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartT(beat(6)), cb); // 이미 상단 경계
    mode.selectNote(0);
    mode.moveBySnap("up"); // +1박 → beat7 > 6 → 차단

    expect(cb.onChartUpdate).not.toHaveBeenCalled();
    expect(cb.onWarn).toHaveBeenCalledWith(expect.stringContaining("구간 안에서만"));
  });

  it("드래그 이동은 구간 하단 경계까지만 클램프된다", () => {
    const cb = makeCallbacks();
    cb.yToBeat = (y: number): Beat => beat(y);
    cb.snapBeat = (b: Beat): Beat => b;
    const mode = makeMode(makeChartT(beat(3)), cb);
    mode.selectNote(0);

    // beat3에서 시작해 아래로 크게(-5) 드래그 → 하단 zone.beat2까지만 (offset -1)
    mode.beginTouchMoveDragFromNote(0, 1, 3);
    mode.onPointerMove(1, -2);

    const calls = cb.onChartUpdate.mock.calls;
    const updated = calls[calls.length - 1][0] as Chart;
    expect(beatToFloat(updated.notes[0].beat)).toBe(2); // 구간 밖(beat-2)으로 안 나감
  });
});

// ---------------------------------------------------------------------------
// 구간 단위 선택 (핸들로 구간+노트 선택, 자유 이동)
// ---------------------------------------------------------------------------

describe("SelectMode — 구간 단위 선택", () => {
  // 구간0[lane1, 2~4]에 트릴노트 2개(beat2, beat3), 구간 밖 일반노트 1개
  function makeChartZ(): Chart {
    return makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(2) },  // 0 (구간0)
        { type: "trill", lane: 1 as Lane, beat: beat(3) },  // 1 (구간0)
        { type: "single", lane: 3 as Lane, beat: beat(9) }, // 2 (밖)
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }],
    });
  }

  it("selectZoneUnit은 구간 유닛만 선택하고 내부 트릴노트를 notes에 주입하지 않는다 (RFD 0016)", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartZ(), cb);
    mode.selectZoneUnit(0);

    expect([...mode.selectedZones]).toEqual([0]);
    expect([...mode.selection]).toEqual([]); // 내부 노트는 실행 시점 파생 — 주입 없음
    const zoneSel = cb.getSelectionState().zones;
    expect([...zoneSel]).toEqual([0]);
  });

  it("핸들 클릭으로 구간 유닛만 선택된다(notes 주입 없음)", () => {
    const cb = makeCallbacks({
      hitTestTrillZoneHandle: () => 0,
    });
    const mode = makeMode(makeChartZ(), cb);
    mode.onPointerDown(1, 0, false, false); // 핸들 히트 → 구간0 선택

    expect([...mode.selectedZones]).toEqual([0]);
    expect([...mode.selection]).toEqual([]);
  });

  it("핸들 Shift 클릭은 기존 선택을 교체하지 않고 zones에 구간을 토글로 추가한다(다중 구간)", () => {
    // 구간 2개: x=1 → 구간0, x=2 → 구간1 핸들
    const chart = makeChart({
      notes: [],
      trillZones: [
        { lane: 1 as Lane, beat: beat(2), endBeat: beat(4) },
        { lane: 2 as Lane, beat: beat(6), endBeat: beat(8) },
      ],
    });
    const cb = makeCallbacks({
      hitTestTrillZoneHandle: (x: number): number | null => (x === 1 ? 0 : x === 2 ? 1 : null),
    });
    const mode = makeMode(chart, cb);

    mode.selectZoneUnit(0);
    mode.onPointerDown(2, 0, true, false); // Shift + 구간1 핸들 → 추가

    expect([...cb.getSelectionState().zones].sort()).toEqual([0, 1]);

    mode.onPointerDown(2, 0, true, false); // 같은 핸들 다시 → 토글 제거
    expect([...cb.getSelectionState().zones]).toEqual([0]);
  });

  it("핸들 토글 탭은 일반 노트 선택을 유지한 채 zones만 바꾼다(공존)", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 3 as Lane, beat: beat(9) }],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }],
    });
    const cb = makeCallbacks({
      hitTestTrillZoneHandle: (x: number): number | null => (x === 1 ? 0 : null),
    });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.onPointerDown(1, 0, false, false, true); // 토글 탭으로 구간0 추가

    const sel = cb.getSelectionState();
    expect([...sel.notes]).toEqual([0]); // 일반 노트 유지
    expect([...sel.zones]).toEqual([0]); // 구간 유닛 공존
  });

  it("구간 단위 드래그는 구간+노트를 같은 오프셋으로 자유 이동(레인+박자)", () => {
    const cb = makeCallbacks({
      hitTestTrillZoneHandle: () => 0,
    });
    cb.yToBeat = (y: number): Beat => beat(y);
    cb.snapBeat = (b: Beat): Beat => b;
    const mode = makeMode(makeChartZ(), cb);

    // 핸들(lane1, beat2)에서 시작 → (lane2, beat5)로 드래그: +1레인, +3박
    mode.onPointerDown(1, 2, false, false);
    mode.onPointerMove(2, 5);

    const calls = cb.onChartUpdate.mock.calls;
    const updated = calls[calls.length - 1][0] as Chart;
    // 구간 이동
    expect(updated.trillZones[0].lane).toBe(2);
    expect(beatToFloat(updated.trillZones[0].beat)).toBe(5);
    expect(beatToFloat(updated.trillZones[0].endBeat)).toBe(7);
    // 노트도 함께 이동
    expect(updated.notes[0].lane).toBe(2);
    expect(beatToFloat(updated.notes[0].beat)).toBe(5);
    expect(beatToFloat(updated.notes[1].beat)).toBe(6);
  });

  it("노트를 클릭하면 구간 단위 선택이 해제된다", () => {
    const cb = makeCallbacks({
      hitTestNote: (x: number) => (x === 2 ? 2 : null),
    });
    const mode = makeMode(makeChartZ(), cb);
    mode.selectZoneUnit(0);
    expect([...mode.selectedZones]).toEqual([0]);

    mode.onPointerDown(2, 0, false, false); // 일반 노트(인덱스2) 클릭
    expect([...mode.selectedZones]).toEqual([]); // 구간 선택 해제
    expect([...cb.getSelectionState().zones]).toEqual([]);
  });

  it("구간 단위에서 ↑(moveBySnap)은 구간+노트를 함께 +1박 이동", () => {
    const cb = makeCallbacks({ hitTestTrillZoneHandle: () => 0 });
    const mode = makeMode(makeChartZ(), cb);
    mode.selectZoneUnit(0);
    mode.moveBySnap("up"); // snapStep = 1박

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(beatToFloat(updated.trillZones[0].beat)).toBe(3);
    expect(beatToFloat(updated.trillZones[0].endBeat)).toBe(5);
    expect(beatToFloat(updated.notes[0].beat)).toBe(3);
    expect(beatToFloat(updated.notes[1].beat)).toBe(4);
  });

  it("구간 단위에서 →(moveByLane)은 구간+노트를 함께 레인 이동(1→2)", () => {
    const cb = makeCallbacks({ hitTestTrillZoneHandle: () => 0 });
    const mode = makeMode(makeChartZ(), cb);
    mode.selectZoneUnit(0);
    mode.moveByLane("right");

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.trillZones[0].lane).toBe(2);
    expect(updated.notes[0].lane).toBe(2);
    expect(updated.notes[1].lane).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 혼합 선택 — 일반 노트 + 구간 유닛 공존과 실행 시점 파생 (RFD 0016)
// ---------------------------------------------------------------------------

describe("SelectMode — 혼합 선택(일반 노트+구간 유닛, RFD 0016)", () => {
  // 구간0[lane1, 2~4]에 트릴노트 2개(beat2, beat3), 일반노트(lane3, beat9), 선택 밖 노트(lane4, beat0)
  function makeChartM(): Chart {
    return makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(2) },  // 0 (구간0 내부 — 파생 대상)
        { type: "trill", lane: 1 as Lane, beat: beat(3) },  // 1 (구간0 내부 — 파생 대상)
        { type: "single", lane: 3 as Lane, beat: beat(9) }, // 2 (직접 선택할 일반)
        { type: "single", lane: 4 as Lane, beat: beat(0) }, // 3 (선택 밖)
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }],
    });
  }

  /** 일반 노트 2 + 구간0을 함께 선택한다(게이트 경유 — 공존 상태) */
  function selectMixed(cb: SelectionFake): void {
    cb.setSelection({ notes: new Set([2]), extraNotes: new Set(), zones: new Set([0]) });
  }

  it("박스가 구간[2,4]과 부분만 겹쳐도(beat 3~5) 구간 유닛으로 픽업한다(겹침 기준, 포함 아님)", () => {
    const cb = makeCallbacks({ yToBeatRaw: (y: number): Beat => beat(y) });
    const mode = makeMode(makeChartM(), cb);

    mode.onPointerDown(1, 3, false, false); // 빈 영역(lane1, beat3)에서 박스 시작
    mode.onPointerMove(1, 5);               // beat5까지 — 구간 끝(4)만 걸침

    const sel = cb.getSelectionState();
    expect([...sel.zones]).toEqual([0]);
    expect([...sel.notes]).toEqual([]); // 내부 트릴 노트 개별 미픽업
  });

  it("박스가 다른 레인(3~4)만 덮으면 lane1 구간은 픽업하지 않는다", () => {
    const cb = makeCallbacks({ yToBeatRaw: (y: number): Beat => beat(y) });
    const mode = makeMode(makeChartM(), cb);

    mode.onPointerDown(3, 0, false, false);
    mode.onPointerMove(4, 10);

    const sel = cb.getSelectionState();
    expect([...sel.zones]).toEqual([]);
    expect([...sel.notes].sort()).toEqual([2, 3]); // 일반 노트만
  });

  it("혼합 moveBySnap(up)은 구간·내부 파생 노트·일반 노트를 같은 +1박 오프셋으로 이동", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartM(), cb);
    selectMixed(cb);

    mode.moveBySnap("up"); // snapStep = 1박

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(beatToFloat(updated.trillZones[0].beat)).toBe(3);
    expect(beatToFloat(updated.trillZones[0].endBeat)).toBe(5);
    expect(beatToFloat(updated.notes[0].beat)).toBe(3);  // 파생 노트 동반
    expect(beatToFloat(updated.notes[1].beat)).toBe(4);  // 파생 노트 동반
    expect(beatToFloat(updated.notes[2].beat)).toBe(10); // 일반 노트 동일 오프셋
    expect(beatToFloat(updated.notes[3].beat)).toBe(0);  // 선택 밖 노트는 불변
  });

  it("혼합 드래그 이동은 구간·파생 노트·일반 노트가 같은 +1박 오프셋으로 움직인다", () => {
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      snapBeat: (b: Beat): Beat => b,
    });
    const mode = makeMode(makeChartM(), cb);
    selectMixed(cb);

    mode.beginMoveDrag(3, 9);   // 일반 노트 위치에서 드래그 시작
    mode.onPointerMove(3, 10);  // 레인 유지, +1박
    mode.onPointerUp(3, 10);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(beatToFloat(updated.trillZones[0].beat)).toBe(3);
    expect(beatToFloat(updated.notes[0].beat)).toBe(3);
    expect(beatToFloat(updated.notes[1].beat)).toBe(4);
    expect(beatToFloat(updated.notes[2].beat)).toBe(10);
  });

  it("혼합 레인 이동이 막히면(구간이 lane1에서 왼쪽) no-op + 토스트", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartM(), cb);
    selectMixed(cb);

    mode.moveByLane("left"); // 구간 lane1 → 0은 범위 밖

    expect(cb.onChartUpdate).not.toHaveBeenCalled();
    expect(cb.onWarn).toHaveBeenCalledWith(expect.stringContaining("이동할 수 없습니다"));
  });

  it("혼합 moveBySnap 결과가 중복 노트(의미 위반)여도 롤백 없이 커밋된다 (낙관적 편집, RFD 0017)", () => {
    // 일반 노트(beat9)의 +1박 목적지(lane3, beat10)에 기존 노트가 있음 → 의미 위반(중복)
    const chart = makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(2) },
        { type: "single", lane: 3 as Lane, beat: beat(9) },
        { type: "single", lane: 3 as Lane, beat: beat(10) }, // 충돌 대상
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);
    cb.setSelection({ notes: new Set([1]), extraNotes: new Set(), zones: new Set([0]) });

    mode.moveBySnap("up");

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(beatToFloat(updated.notes[1].beat)).toBe(10); // 중복 위치로 커밋(해칭·게이트가 강제)
    expect(cb.onWarn).not.toHaveBeenCalled();
  });

  it("혼합 드래그 결과가 중복 노트(의미 위반)여도 pointerUp에서 위반 위치 그대로 커밋된다 (낙관적 편집)", () => {
    const chart = makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(2) },
        { type: "single", lane: 3 as Lane, beat: beat(9) },
        { type: "single", lane: 3 as Lane, beat: beat(10) }, // 충돌 대상
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      snapBeat: (b: Beat): Beat => b,
    });
    const mode = makeMode(chart, cb);
    cb.setSelection({ notes: new Set([1]), extraNotes: new Set(), zones: new Set([0]) });

    mode.beginMoveDrag(3, 9);
    mode.onPointerMove(3, 10); // 라이브 프리뷰 적용
    mode.onPointerUp(3, 10);   // 의미 위반(중복)이어도 낙관 커밋 — 되돌리기는 undo

    const committed = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(beatToFloat(committed.notes[1].beat)).toBe(10);      // 일반 노트: 위반 위치 유지
    expect(beatToFloat(committed.notes[0].beat)).toBe(3);       // 파생 노트: +1박 이동 유지
    expect(beatToFloat(committed.trillZones[0].beat)).toBe(3);  // 구간: +1박 이동 유지
  });

  it("혼합 삭제는 구간+내부 파생 노트+일반 노트를 함께 지우고 나머지는 남긴다", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartM(), cb);
    selectMixed(cb);

    mode.deleteSelected();

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.trillZones.length).toBe(0);
    expect(updated.notes.length).toBe(1);   // 선택 밖 노트만 생존
    expect(updated.notes[0].lane).toBe(4);
  });

  it("혼합 복사 왕복: 일반1+파생2+구간1 = count 4, 붙여넣기에 구간·내부 노트·일반 노트가 모두 재생성", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartM(), cb);
    selectMixed(cb);

    expect(mode.copy()).toBe(4);

    // anchor = beat2(구간·트릴 시작) → target beat12 = +10박
    mode.paste(beat(12));

    const pasted = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(pasted.trillZones.length).toBe(2);
    const newZone = pasted.trillZones[1];
    expect(beatToFloat(newZone.beat)).toBe(12);
    expect(beatToFloat(newZone.endBeat)).toBe(14);
    // 원본 4개 + 붙여넣은 3개(트릴2 + 일반1)
    expect(pasted.notes.length).toBe(7);
    const newBeats = pasted.notes.slice(4).map((n) => beatToFloat(n.beat)).sort((a, b) => a - b);
    expect(newBeats).toEqual([12, 13, 19]);
  });

  it("Shift로 일반 노트를 추가해도 zones가 유지된다(공존)", () => {
    const cb = makeCallbacks({ hitTestNote: (x: number) => (x === 2 ? 2 : null) });
    const mode = makeMode(makeChartM(), cb);
    mode.selectZoneUnit(0);

    mode.onPointerDown(2, 0, true, false); // Shift-click 일반 노트(인덱스2)

    const sel = cb.getSelectionState();
    expect([...sel.notes]).toEqual([2]);
    expect([...sel.zones]).toEqual([0]); // 구간 유닛 보존
  });

  it("트릴 노트를 토글로 추가하면 게이트가 zones를 자동으로 비운다(개별 트릴 모드 배타)", () => {
    const cb = makeCallbacks({ hitTestNote: (x: number) => (x === 0 ? 0 : null) });
    const mode = makeMode(makeChartM(), cb);
    mode.selectZoneUnit(0);

    mode.onPointerDown(0, 0, false, false, true); // 토글 탭으로 트릴 노트(인덱스0) 추가

    const sel = cb.getSelectionState();
    expect([...sel.notes]).toEqual([0]);
    expect([...sel.zones]).toEqual([]); // 트릴 모드 진입 → zones 비움
  });
});

// ---------------------------------------------------------------------------
// 트릴존 삭제 연동
// ---------------------------------------------------------------------------

describe("SelectMode — 삭제 연동", () => {
  function makeChartZ(): Chart {
    return makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(2) },  // 0 (구간0)
        { type: "trill", lane: 1 as Lane, beat: beat(3) },  // 1 (구간0)
        { type: "single", lane: 3 as Lane, beat: beat(9) }, // 2 (밖)
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }],
    });
  }

  it("구간 단위 삭제는 구간과 안의 트릴노트를 함께 지운다", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartZ(), cb);
    mode.selectZoneUnit(0);
    mode.deleteSelected();

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.trillZones.length).toBe(0);
    expect(updated.notes.length).toBe(1);        // 구간 밖 일반노트만 남음
    expect(updated.notes[0].lane).toBe(3);
  });

  it("노트 단위 삭제는 노트만 지우고 구간은 남긴다", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartZ(), cb);
    mode.selectNote(0); // 트릴 포인트 노트(노트 단위)
    mode.deleteSelected();

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.trillZones.length).toBe(1);    // 구간 유지
    expect(updated.notes.length).toBe(2);         // 노트 1개만 삭제
  });
});

// ---------------------------------------------------------------------------
// 트릴존 복사/붙여넣기
// ---------------------------------------------------------------------------

describe("SelectMode — 트릴존 복붙", () => {
  function makeChartZ(): Chart {
    return makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(2) },  // 0 (구간0)
        { type: "trill", lane: 1 as Lane, beat: beat(3) },  // 1 (구간0)
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }],
    });
  }

  it("구간 단위 복사는 노트+구간을 함께 담는다(count = 노트2 + 구간1)", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartZ(), cb);
    mode.selectZoneUnit(0);
    expect(mode.copy()).toBe(3);
  });

  it("구간 단위 붙여넣기는 구간+노트를 같은 오프셋으로 생성", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartZ(), cb);
    mode.selectZoneUnit(0);
    mode.copy();
    // anchor=2, target=6 → +4박
    mode.paste(beat(6));

    const pasted = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(pasted.trillZones.length).toBe(2); // 원본 + 붙여넣은 구간
    const newZone = pasted.trillZones[1];
    expect(newZone.lane).toBe(1);
    expect(beatToFloat(newZone.beat)).toBe(6);
    expect(beatToFloat(newZone.endBeat)).toBe(8);
    // 붙여넣은 트릴노트들 (원본 2 + 새 2)
    expect(pasted.notes.length).toBe(4);
    expect(beatToFloat(pasted.notes[2].beat)).toBe(6);
    expect(beatToFloat(pasted.notes[3].beat)).toBe(7);
  });

  it("노트 단위 트릴 복사는 구간 단위로 승격되어 구간도 함께 복사된다", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartZ(), cb);
    mode.selectNote(0); // 트릴 노트 1개(노트 단위)
    expect(mode.copy()).toBe(2); // 노트1 + 구간1(승격)

    mode.paste(beat(6));
    const pasted = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(pasted.trillZones.length).toBe(2); // 구간도 붙여넣어짐
  });

  it("일반 노트 복사는 구간을 담지 않는다", () => {
    const cb = makeCallbacks();
    const chart = makeChart({
      notes: [{ type: "single", lane: 1 as Lane, beat: beat(2) }],
      trillZones: [],
    });
    const mode = makeMode(chart, cb);
    mode.selectNote(0);
    expect(mode.copy()).toBe(1); // 노트만
  });
});

// ---------------------------------------------------------------------------
// cancel — editCancel(두 손가락 내비 가로채기)로 드래그가 커밋 없이 끊길 때
// ---------------------------------------------------------------------------

describe("SelectMode — cancel (editCancel 드래그 폐기)", () => {
  it("이동 드래그 중 cancel은 노트를 드래그 시작 레인(1)으로 되돌리고 clearDragPreview를 반환", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks({ hitTestNote: (x: number) => (x === 1 ? 0 : null) });
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.beginMoveDrag(1, 0);
    mode.onPointerMove(2, 0); // 레인 1 → 2로 이동(라이브 적용)
    expect((cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart).notes[0].lane).toBe(2);

    const result = mode.cancel();

    expect(result.clearDragPreview).toBe(true);
    expect(mode.isMoveDragging).toBe(false);
    expect((cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart).notes[0].lane).toBe(1); // 원위치
  });

  it("트릴존 리사이즈 중 cancel은 endBeat를 원본(6)으로 되돌린다", () => {
    const chart = makeChart({
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(6) }],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      hitTestTrillZoneEnd: (x: number): number | null => (x === 9 ? 0 : null),
    });
    const mode = makeMode(chart, cb);

    mode.onPointerDown(9, 6, false, false); // 트릴존 끝 잡고 리사이즈 시작
    mode.onPointerMove(9, 10); // endBeat 6→10 (라이브 적용)
    expect(beatToFloat((cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart).trillZones[0].endBeat)).toBe(10);

    const result = mode.cancel();

    expect(result.clearDragPreview).toBe(true);
    expect(beatToFloat((cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart).trillZones[0].endBeat)).toBe(6);
  });

  it("엑스트라 노트 이동 중 cancel은 extraLane을 원본(1)으로 되돌린다", () => {
    const extraNotes: ExtraNoteEntity[] = [{ type: "single", extraLane: 1, beat: beat(0) }];
    const cb = makeCallbacks(undefined, { extraNotes, extraLaneCount: 2 });
    const mode = makeMode(makeChart(), cb);

    mode.beginLongPressDrag(5, 0, { noteEndHit: null, noteHit: null, extraHit: 0 });
    mode.onPointerMove(6, 0); // extraLane 1 → 2 (라이브 적용)
    expect((cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[])[0].extraLane).toBe(2);

    const result = mode.cancel();

    expect(result.clearDragPreview).toBe(true);
    expect((cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[])[0].extraLane).toBe(1);
  });

  it("박스 선택 중 cancel은 차트 변이 없이 박스만 닫는다", () => {
    const chart = makeChart();
    const cb = makeCallbacks(); // 빈 영역 → 박스 셀렉트
    const mode = makeMode(chart, cb);

    mode.onPointerDown(1, 0, false, false);
    mode.onPointerMove(2, 5);
    expect(mode.isBoxSelecting).toBe(true);

    const result = mode.cancel();

    expect(result.clearDragPreview).toBe(true);
    expect(mode.isBoxSelecting).toBe(false);
    expect(cb.onChartUpdate).not.toHaveBeenCalled();
  });

  it("구간 단위(트릴존+노트) 이동 중 cancel은 구간과 안의 노트를 전부 원위치로 되돌린다", () => {
    const cb = makeCallbacks({
      hitTestTrillZoneHandle: () => 0,
    });
    cb.yToBeat = (y: number): Beat => beat(y);
    cb.snapBeat = (b: Beat): Beat => b;
    const chart = makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(2) },
        { type: "trill", lane: 1 as Lane, beat: beat(3) },
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(2), endBeat: beat(4) }],
    });
    const mode = makeMode(chart, cb);

    mode.onPointerDown(1, 2, false, false); // 핸들 히트 → 구간 단위 드래그 시작
    mode.onPointerMove(2, 5); // +1레인 +3박 (라이브 적용)
    const moved = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(moved.trillZones[0].lane).toBe(2);

    const result = mode.cancel();

    expect(result.clearDragPreview).toBe(true);
    const restored = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(restored.trillZones[0].lane).toBe(1);
    expect(beatToFloat(restored.trillZones[0].beat)).toBe(2);
    expect(beatToFloat(restored.trillZones[0].endBeat)).toBe(4);
    expect(restored.notes[0].lane).toBe(1);
    expect(beatToFloat(restored.notes[0].beat)).toBe(2);
    expect(beatToFloat(restored.notes[1].beat)).toBe(3);
  });

  it("엑스트라 롱노트 이동 중 cancel은 beat(0)와 endBeat(2)를 원위치로 되돌린다", () => {
    const extraNotes: ExtraNoteEntity[] = [
      { type: "long", extraLane: 1, beat: beat(0), endBeat: beat(2) },
    ];
    const cb = makeCallbacks(undefined, { extraNotes, extraLaneCount: 2 });
    cb.yToBeat = (y: number): Beat => beat(y);
    const mode = makeMode(makeChart(), cb);

    mode.beginLongPressDrag(5, 0, { noteEndHit: null, noteHit: null, extraHit: 0 });
    mode.onPointerMove(6, 3); // +1레인 +3박 (라이브 적용)
    const moved = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(moved[0].extraLane).toBe(2);
    expect(beatToFloat(moved[0].beat)).toBe(3);

    const result = mode.cancel();

    expect(result.clearDragPreview).toBe(true);
    const restored = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(restored[0].extraLane).toBe(1);
    expect(beatToFloat(restored[0].beat)).toBe(0);
    expect("endBeat" in restored[0] ? beatToFloat(restored[0].endBeat) : -1).toBe(2);
  });

  it("드래그 중이 아니면 cancel은 아무것도 하지 않는다", () => {
    const mode = makeMode(makeChart(), makeCallbacks());

    const result = mode.cancel();

    expect(result.clearDragPreview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 트릴 쌍 동반 선택 — 쌍소멸과 대칭: 한쪽만 선택-이동하면 배치 제약(헤드 필수)에
// 걸려 롤백되므로, trill 헤드 ↔ trillLong 바디는 한 단위로 선택한다
// ---------------------------------------------------------------------------

describe("SelectMode — 트릴 쌍 동반 선택", () => {
  const pairChart = () =>
    makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(0) }, // 헤드
        { type: "trillLong", lane: 1 as Lane, beat: beat(0), endBeat: beat(2) }, // 바디
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(0), endBeat: beat(4) }],
    });

  it("trill 헤드를 selectNote하면 trillLong 바디도 함께 선택된다", () => {
    const mode = makeMode(pairChart(), makeCallbacks());

    mode.selectNote(0);

    expect([...mode.selection].sort()).toEqual([0, 1]);
  });

  it("노트 클릭(onPointerDown 실경로)으로도 트릴 쌍이 함께 선택된다", () => {
    const cb = makeCallbacks({ hitTestNote: (x: number) => (x === 1 ? 0 : null) });
    const mode = makeMode(pairChart(), cb);

    mode.onPointerDown(1, 0, false, false); // 마우스 클릭 선택 분기 (selectNote 미경유)

    expect([...mode.selection].sort()).toEqual([0, 1]);
  });

  it("trillLong 바디를 selectNote해도 헤드가 함께 선택된다", () => {
    const mode = makeMode(pairChart(), makeCallbacks());

    mode.selectNote(1);

    expect([...mode.selection].sort()).toEqual([0, 1]);
  });

  it("쌍 선택 후 +1박 이동(존 안)은 롤백 없이 헤드·바디가 함께 움직인다", () => {
    const cb = makeCallbacks({ hitTestNote: (x: number) => (x === 1 ? 0 : null) });
    cb.yToBeat = (y: number): Beat => beat(y);
    cb.snapBeat = (b: Beat): Beat => b;
    const mode = makeMode(pairChart(), cb);

    mode.selectNote(0); // 쌍 동반 선택
    mode.beginMoveDrag(1, 0);
    mode.onPointerMove(1, 1); // 레인 유지 +1박 (트릴 단위 이동은 존 안 클램프)
    mode.onPointerUp(1, 1);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(beatToFloat(updated.notes[0].beat)).toBe(1); // 헤드 이동
    expect(beatToFloat(updated.notes[1].beat)).toBe(1); // 바디 시작 이동
    expect(beatToFloat((updated.notes[1] as { endBeat: Beat }).endBeat)).toBe(3); // 길이 보존
  });
});

// ---------------------------------------------------------------------------
// beginBoxSelect — 노트 위 터치 드래그의 박스 승격 진입점 (RFD 0016 §4.4)
// ---------------------------------------------------------------------------

describe("SelectMode — beginBoxSelect (박스 승격)", () => {
  it("기존 선택 {0}을 비우고 박스 드래그를 시작한다", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1, beat: beat(0) }],
    });
    const cb = makeCallbacks(chart);
    const mode = makeMode(chart, cb as never);
    cb.setSelection({ notes: new Set([0]), extraNotes: new Set(), zones: new Set() });

    mode.beginBoxSelect(2, 10);

    expect(mode.isBoxSelecting).toBe(true);
    expect(cb.getSelectionState().notes).toEqual(new Set());
  });

  it("드래그 진행 중이면 재호출이 무시된다(시작점 유지)", () => {
    const chart = makeChart();
    const mode = makeMode(chart, makeCallbacks(chart) as never);

    mode.beginBoxSelect(2, 10);
    const startYBefore = mode.boxSelectPixelRect?.startY;
    mode.beginBoxSelect(3, 99);

    expect(mode.isBoxSelecting).toBe(true);
    expect(mode.boxSelectPixelRect?.startY).toBe(startYBefore);
  });
});

// ---------------------------------------------------------------------------
// RFD 0016 후속 fix — 엑스트라→메인(오른쪽→왼쪽) 크로싱 박스, 구간 롱프레스 이동
// ---------------------------------------------------------------------------

describe("SelectMode — 엑스트라→메인 크로싱 박스 (오른쪽→왼쪽 드래그)", () => {
  it("lane 5에서 lane 2까지 끌면 lane 2~4 메인 노트와 lane 5 보조 노트가 선택되고 lane 1은 제외된다", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1, beat: beat(1) },
        { type: "single", lane: 2, beat: beat(1) },
        { type: "single", lane: 3, beat: beat(1) },
        { type: "single", lane: 4, beat: beat(1) },
        { type: "single", lane: 5, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    mode.onPointerDown(5, 0, false, false); // 엑스트라 레인 1, beat 0에서 시작
    mode.onPointerMove(2, 2);               // 메인 레인 2, beat 2까지 왼쪽으로
    mode.onPointerUp(2, 2);

    const selected = cb.getSelectionState();
    expect(selected.notes).toEqual(new Set([1, 2, 3])); // 레인 2·3·4
    expect(selected.notes.has(0)).toBe(false);          // 레인 1은 박스 밖
    expect(selected.extraNotes).toEqual(new Set([0]));
  });
});

describe("SelectMode — 구간 유닛 롱프레스 이동 (RFD 0016 §4.4)", () => {
  const zone: TrillZone = { lane: 1, beat: beat(0), endBeat: beat(2) };

  it("미선택 구간(zoneHit=0) 롱프레스는 그 구간 단독 선택으로 전환하고 이동을 시작한다", () => {
    const chart = makeChart({
      trillZones: [zone],
      notes: [{ type: "trill", lane: 1, beat: beat(1) }],
    });
    const cb = makeCallbacks(chart);
    const mode = makeMode(chart, cb as never);

    const ok = mode.beginLongPressDrag(1, 0, {
      noteEndHit: null, noteHit: null, extraHit: null, zoneHit: 0,
    });

    expect(ok).toBe(true);
    expect(mode.isMoveDragging).toBe(true);
    expect(cb.getSelectionState().zones).toEqual(new Set([0]));
  });

  it("선택된 구간 롱프레스는 기존 혼합 선택(일반 노트 {1} 포함)을 유지한 채 이동을 시작한다", () => {
    const chart = makeChart({
      trillZones: [zone],
      notes: [
        { type: "trill", lane: 1, beat: beat(1) },
        { type: "single", lane: 3, beat: beat(1) },
      ],
    });
    const cb = makeCallbacks(chart);
    const mode = makeMode(chart, cb as never);
    cb.setSelection({ notes: new Set([1]), extraNotes: new Set(), zones: new Set([0]) });

    const ok = mode.beginLongPressDrag(1, 0, {
      noteEndHit: null, noteHit: null, extraHit: null, zoneHit: 0,
    });

    expect(ok).toBe(true);
    expect(cb.getSelectionState().notes).toEqual(new Set([1]));
    expect(cb.getSelectionState().zones).toEqual(new Set([0]));
  });
});

// ---------------------------------------------------------------------------
// 혼합 이동(메인+엑스트라 동반) — beat 오프셋은 선택 전체가 공유하고,
// 레인 오프셋은 앵커(잡은 쪽) 축에만 적용된다 (RFD 0016 §4.2)
// ---------------------------------------------------------------------------

describe("SelectMode — 혼합 이동(메인+엑스트라 동반, RFD 0016 §4.2)", () => {
  /** 메인 single(lane2, beat1) + 엑스트라 single(extraLane1, beat1), extraLaneCount=2, 혼합 선택 상태 */
  function setupMixed(overrides?: { extraBeat?: number; extraLane?: number }) {
    const chart = makeChart({
      notes: [{ type: "single", lane: 2 as Lane, beat: beat(1) }],
    });
    const extraNotes: ExtraNoteEntity[] = [
      {
        type: "single",
        extraLane: overrides?.extraLane ?? 1,
        beat: beat(overrides?.extraBeat ?? 1),
      },
    ];
    const cb = makeCallbacks(
      {
        yToBeat: (y: number): Beat => beat(y),
        snapBeat: (b: Beat): Beat => b,
      },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);
    cb.setSelection({ notes: new Set([0]), extraNotes: new Set([0]), zones: new Set() });
    return { cb, mode };
  }

  it("이미 선택된 메인 노트 롱프레스 이동 시작은 엑스트라 선택 {0}을 비우지 않는다(선택 붕괴 제거)", () => {
    const { cb, mode } = setupMixed();

    mode.beginTouchMoveDragFromNote(0, 2, 1);

    expect(cb.getSelectionState().notes).toEqual(new Set([0]));
    expect(cb.getSelectionState().extraNotes).toEqual(new Set([0]));
    expect(mode.isMoveDragging).toBe(true);
  });

  it("이미 선택된 엑스트라 노트 롱프레스 이동 시작은 메인 선택 {0}을 비우지 않는다(선택 붕괴 제거)", () => {
    const { cb, mode } = setupMixed();

    mode.beginTouchMoveDragFromExtraNote(0, 5, 1);

    expect(cb.getSelectionState().notes).toEqual(new Set([0]));
    expect(cb.getSelectionState().extraNotes).toEqual(new Set([0]));
    expect(mode.isMoveDragging).toBe(true);
  });

  it("이미 선택된 엑스트라 노트 클릭(onPointerDown)은 혼합 선택을 유지한 채 이동 드래그를 시작한다", () => {
    const chart = makeChart({ notes: [{ type: "single", lane: 2 as Lane, beat: beat(1) }] });
    const extraNotes: ExtraNoteEntity[] = [{ type: "single", extraLane: 1, beat: beat(1) }];
    const cb = makeCallbacks(
      {
        yToBeat: (y: number): Beat => beat(y),
        hitTestExtraNote: (x: number) => (x === 5 ? 0 : null),
      },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);
    cb.setSelection({ notes: new Set([0]), extraNotes: new Set([0]), zones: new Set() });

    mode.onPointerDown(5, 1, false, false);

    expect(mode.isMoveDragging).toBe(true);
    expect(cb.getSelectionState().notes).toEqual(new Set([0])); // 메인 선택 유지(붕괴 제거)
  });

  it("메인 앵커 드래그(+1레인 +1박): 메인은 lane 2→3·beat 1→2, 엑스트라는 beat 1→2만 동반(extraLane 1 불변)", () => {
    const { cb, mode } = setupMixed();

    mode.beginTouchMoveDragFromNote(0, 2, 1);
    mode.onPointerMove(3, 2); // +1레인 +1박
    mode.onPointerUp(3, 2);

    const chartAfter = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(chartAfter.notes[0].lane).toBe(3);
    expect(beatToFloat(chartAfter.notes[0].beat)).toBe(2);
    const extraAfter = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(extraAfter[0].extraLane).toBe(1); // 앵커가 메인이므로 엑스트라 레인 불변
    expect(beatToFloat(extraAfter[0].beat)).toBe(2); // beat만 동반
  });

  it("엑스트라 앵커 드래그(+1레인 +1박): 엑스트라는 extraLane 1→2·beat 1→2, 메인 노트·구간·파생 노트는 beat만 동반(lane 불변)", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 2 as Lane, beat: beat(1) }, // 0 직접 선택한 일반
        { type: "trill", lane: 1 as Lane, beat: beat(1) },  // 1 구간0 내부(파생)
        { type: "trill", lane: 1 as Lane, beat: beat(2) },  // 2 구간0 내부(파생)
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(1), endBeat: beat(3) }],
    });
    const extraNotes: ExtraNoteEntity[] = [{ type: "single", extraLane: 1, beat: beat(1) }];
    const cb = makeCallbacks(
      { yToBeat: (y: number): Beat => beat(y), snapBeat: (b: Beat): Beat => b },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);
    cb.setSelection({ notes: new Set([0]), extraNotes: new Set([0]), zones: new Set([0]) });

    mode.beginTouchMoveDragFromExtraNote(0, 5, 1);
    mode.onPointerMove(6, 2); // 엑스트라 축 +1레인, +1박
    mode.onPointerUp(6, 2);

    const extraAfter = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(extraAfter[0].extraLane).toBe(2);
    expect(beatToFloat(extraAfter[0].beat)).toBe(2);
    const chartAfter = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(chartAfter.notes[0].lane).toBe(2);                   // 메인 레인 불변
    expect(beatToFloat(chartAfter.notes[0].beat)).toBe(2);      // beat 동반
    expect(beatToFloat(chartAfter.notes[1].beat)).toBe(2);      // 구간 파생 노트 동반
    expect(beatToFloat(chartAfter.notes[2].beat)).toBe(3);
    expect(chartAfter.trillZones[0].lane).toBe(1);              // 구간 레인 불변
    expect(beatToFloat(chartAfter.trillZones[0].beat)).toBe(2); // 구간 beat 동반
    expect(beatToFloat(chartAfter.trillZones[0].endBeat)).toBe(4);
  });

  it("혼합 드래그 커밋: pointerUp에서 chart(onChartUpdate)와 extraNotes(onExtraNotesUpdate)가 둘 다 이동 결과(beat 1→3)로 갱신된다", () => {
    const { cb, mode } = setupMixed();

    mode.beginTouchMoveDragFromNote(0, 2, 1);
    mode.onPointerMove(2, 3); // 레인 유지 +2박
    mode.onPointerUp(2, 3);

    const chartAfter = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    const extraAfter = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(beatToFloat(chartAfter.notes[0].beat)).toBe(3);
    expect(beatToFloat(extraAfter[0].beat)).toBe(3);
  });

  it("혼합 드래그 결과가 중복 노트(의미 위반)여도 메인·엑스트라 둘 다 이동 위치(beat 2)로 커밋된다 (낙관적 편집)", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 2 as Lane, beat: beat(1) },
        { type: "single", lane: 2 as Lane, beat: beat(2) }, // 충돌 대상
      ],
    });
    const extraNotes: ExtraNoteEntity[] = [{ type: "single", extraLane: 1, beat: beat(1) }];
    const cb = makeCallbacks(
      { yToBeat: (y: number): Beat => beat(y), snapBeat: (b: Beat): Beat => b },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);
    cb.setSelection({ notes: new Set([0]), extraNotes: new Set([0]), zones: new Set() });

    mode.beginTouchMoveDragFromNote(0, 2, 1);
    mode.onPointerMove(2, 2); // 노트0 → (lane2, beat2) = 노트1과 중복(라이브 적용)
    mode.onPointerUp(2, 2);   // 의미 위반이어도 낙관 커밋 — 되돌리기는 undo

    const chartAfter = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(beatToFloat(chartAfter.notes[0].beat)).toBe(2); // 중복 위치로 커밋
    const extraAfter = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(beatToFloat(extraAfter[0].beat)).toBe(2); // 엑스트라도 함께 커밋
  });

  it("혼합 드래그 중 cancel()은 메인(lane 2, beat 1)과 엑스트라(beat 1)를 모두 원위치로 복원한다", () => {
    const { cb, mode } = setupMixed();

    mode.beginTouchMoveDragFromNote(0, 2, 1);
    mode.onPointerMove(3, 2); // +1레인 +1박(라이브 적용)
    const result = mode.cancel();

    expect(result.clearDragPreview).toBe(true);
    const chartAfter = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(chartAfter.notes[0].lane).toBe(2);
    expect(beatToFloat(chartAfter.notes[0].beat)).toBe(1);
    const extraAfter = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(extraAfter[0].extraLane).toBe(1);
    expect(beatToFloat(extraAfter[0].beat)).toBe(1);
  });

  it("혼합 moveBySnap(up): 메인 beat 1→2·엑스트라 beat 1→2 동반(lane·extraLane 불변)", () => {
    const { cb, mode } = setupMixed(); // snapStep = 1박

    mode.moveBySnap("up");

    const chartAfter = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(beatToFloat(chartAfter.notes[0].beat)).toBe(2);
    expect(chartAfter.notes[0].lane).toBe(2);
    const extraAfter = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(beatToFloat(extraAfter[0].beat)).toBe(2);
    expect(extraAfter[0].extraLane).toBe(1);
  });

  it("혼합 moveBySnap(up): 엑스트라가 maxBeat(100)에 있으면 전체 no-op — 메인도 이동하지 않는다", () => {
    const { cb, mode } = setupMixed({ extraBeat: 100 });

    mode.moveBySnap("up"); // 엑스트라 101 > maxBeat 100 → 전체 차단

    expect(cb.onChartUpdate).not.toHaveBeenCalled();
    expect(cb.onExtraNotesUpdate).not.toHaveBeenCalled();
  });

  it("혼합 moveByLane(right): 메인은 lane 2→3, 엑스트라는 extraLane 1→2로 각자 축 평행이동(beat 불변)", () => {
    const { cb, mode } = setupMixed();

    mode.moveByLane("right");

    const chartAfter = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(chartAfter.notes[0].lane).toBe(3);
    expect(beatToFloat(chartAfter.notes[0].beat)).toBe(1); // beat 불변
    const extraAfter = cb.onExtraNotesUpdate.mock.calls.at(-1)?.[0] as ExtraNoteEntity[];
    expect(extraAfter[0].extraLane).toBe(2);
    expect(beatToFloat(extraAfter[0].beat)).toBe(1);
  });

  it("혼합 moveByLane(right): 엑스트라가 최대 레인(2)이면 전체 no-op + 토스트(메인 lane 2 유지)", () => {
    const { cb, mode } = setupMixed({ extraLane: 2 });

    mode.moveByLane("right"); // 엑스트라 3 > extraLaneCount 2 → 전체 차단

    expect(cb.onChartUpdate).not.toHaveBeenCalled();
    expect(cb.onExtraNotesUpdate).not.toHaveBeenCalled();
    expect(cb.onWarn).toHaveBeenCalledWith(expect.stringContaining("이동할 수 없습니다"));
  });
});

// ---------------------------------------------------------------------------
// 구간 유닛의 파생 내부 노트 드래그 — 단독 선택 교체 없이 유닛째 이동 (RFD 0016 §4.2)
// ---------------------------------------------------------------------------

describe("SelectMode — 파생 내부 노트 드래그 (RFD 0016 §4.2)", () => {
  // zone lane1 [0,4], 내부 트릴 노트 beat1·beat2
  function setupZoneUnit() {
    const chart = makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(1) },
        { type: "trill", lane: 1 as Lane, beat: beat(2) },
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(0), endBeat: beat(4) }],
    });
    const cb = makeCallbacks({
      yToBeat: (y: number): Beat => beat(y),
      snapBeat: (b: Beat): Beat => b,
      hitTestNote: (x: number, y: number) => (x === 1 && y === 1 ? 0 : null), // (1,1) = 내부 노트 0
    });
    const mode = makeMode(chart, cb);
    mode.selectZoneUnit(0);
    return { cb, mode };
  }

  it("존 유닛 선택 중 내부 노트를 잡아 끌면 단독 선택으로 교체되지 않고 유닛째 프리뷰 이동한다", () => {
    const { cb, mode } = setupZoneUnit();

    mode.onPointerDown(1, 1, false, false); // 파생 내부 노트 0 히트
    mode.onPointerMove(1, 3); // +2박 프리뷰

    const priv = mode as unknown as { chart: Chart };
    expect(cb.getSelectionState().zones).toEqual(new Set([0])); // 유닛 선택 유지
    expect(cb.getSelectionState().notes).toEqual(new Set()); // 단독 선택으로 교체 안 됨
    expect(beatToFloat(priv.chart.trillZones[0].beat)).toBe(2); // 존 0→2
    expect(priv.chart.notes.map((n) => beatToFloat(n.beat))).toEqual([3, 4]); // 파생 노트 동반 이동
  });

  it("터치 롱프레스도 동일 — 파생 내부 노트에서 이동을 시작해도 유닛 선택이 유지된다", () => {
    const { cb, mode } = setupZoneUnit();

    const ok = mode.beginTouchMoveDragFromNote(0, 1, 1);
    mode.onPointerMove(1, 3);

    expect(ok).toBe(true);
    expect(cb.getSelectionState().zones).toEqual(new Set([0])); // 단독 선택 전환 없음
    const priv = mode as unknown as { chart: Chart };
    expect(beatToFloat(priv.chart.trillZones[0].beat)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 메인↔엑스트라 레인 드래그 변환 — 키보드 변환(moveByLane)의 드래그 판
// ---------------------------------------------------------------------------

describe("SelectMode — 메인↔엑스트라 드래그 변환", () => {
  it("메인 노트(lane4, beat0)를 엑스트라 레인 2 위(beat2)에 놓으면 그 레인의 엑스트라 노트로 변환된다", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 4 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(
      {
        yToBeat: (y: number): Beat => beat(y),
        snapBeat: (b: Beat): Beat => b,
        hitTestNote: (x: number, y: number) => (x === 4 && y === 0 ? 0 : null),
      },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    mode.onPointerDown(4, 0, false, false); // 노트 클릭 → 이동 시작
    mode.onPointerMove(6, 2); // x=6 → xToLane null·extraLane 2, beat 프리뷰 +2
    mode.onPointerUp(6, 2);   // 엑스트라 레인 2 위에서 드롭 → 변환

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes).toHaveLength(0); // 메인에서 제거
    const extras = cb.getExtraNotes!();
    expect(extras).toHaveLength(1);
    expect(extras[0].extraLane).toBe(2); // 드롭한 레인
    expect(beatToFloat(extras[0].beat)).toBe(2); // 드래그 beat 프리뷰 반영
    expect(cb.getSelectionState().extraNotes).toEqual(new Set([0])); // 선택도 엑스트라로 전환
  });

  it("엑스트라 노트(extraLane1, beat0)를 메인 레인 3 위(beat1)에 놓으면 그 레인의 메인 노트로 변환된다", () => {
    const chart = makeChart();
    const cb = makeCallbacks(
      { yToBeat: (y: number): Beat => beat(y), snapBeat: (b: Beat): Beat => b },
      { extraNotes: [{ type: "single", extraLane: 1, beat: beat(0) }], extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);
    mode.selectExtraNote(0);

    mode.beginMoveDrag(5, 0);  // x=5 → 엑스트라 축 앵커
    mode.onPointerMove(3, 1);  // x=3 → 메인 레인 영역, beat 프리뷰 +1
    mode.onPointerUp(3, 1);    // 메인 레인 3 위에서 드롭 → 변환

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.notes).toHaveLength(1);
    expect(updated.notes[0].lane).toBe(3); // 드롭한 레인
    expect(beatToFloat(updated.notes[0].beat)).toBe(1); // beat 프리뷰 반영
    expect(cb.getExtraNotes!()).toHaveLength(0); // 엑스트라에서 제거
    expect(cb.getSelectionState().notes).toEqual(new Set([0])); // 선택도 메인으로 전환
  });

  it("존 유닛 선택은 엑스트라 영역에 놓아도 변환되지 않는다 (경계 프리뷰 상태로 커밋)", () => {
    const chart = makeChart({
      notes: [{ type: "trill", lane: 4 as Lane, beat: beat(1) }],
      trillZones: [{ lane: 4 as Lane, beat: beat(0), endBeat: beat(2) }],
    });
    const cb = makeCallbacks(
      { yToBeat: (y: number): Beat => beat(y), snapBeat: (b: Beat): Beat => b },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);
    mode.selectZoneUnit(0);

    mode.beginMoveDrag(4, 0);
    mode.onPointerMove(6, 2); // 엑스트라 영역 — 레인 고정, beat만 +2
    mode.onPointerUp(6, 2);

    const updated = cb.onChartUpdate.mock.calls.at(-1)?.[0] as Chart;
    expect(updated.trillZones).toHaveLength(1); // 존 유지(변환 없음)
    expect(updated.notes).toHaveLength(1);
    expect(updated.notes[0].lane).toBe(4); // 레인은 경계에 고정
    expect(beatToFloat(updated.notes[0].beat)).toBe(3); // beat는 따라옴 (1+2)
    expect(cb.getExtraNotes!()).toHaveLength(0);
  });

  it("메인 이동 중 엑스트라 영역에 들어서는 즉시 변환되어 드래그가 이어진다 (순간이동 없음)", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 3 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(
      {
        yToBeat: (y: number): Beat => beat(y),
        snapBeat: (b: Beat): Beat => b,
        hitTestNote: (x: number, y: number) => (x === 3 && y === 0 ? 0 : null),
      },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);
    const priv = mode as unknown as { chart: Chart };

    mode.onPointerDown(3, 0, false, false);
    mode.onPointerMove(4, 1); // 메인 안: lane 3→4, beat +1
    expect(priv.chart.notes[0].lane).toBe(4);

    mode.onPointerMove(6, 2); // 엑스트라 영역 진입 → 이 프레임에서 즉시 변환(beat=+2 반영)
    expect(priv.chart.notes).toHaveLength(0); // 메인에서 빠지고
    expect(cb.getExtraNotes!()[0].extraLane).toBe(2); // 포인터의 엑스트라 레인으로
    expect(beatToFloat(cb.getExtraNotes!()[0].beat)).toBe(2);

    mode.onPointerMove(5, 3); // 변환 후에도 드래그 계속 — 엑스트라 축 안에서 레인·beat 라이브
    expect(cb.getExtraNotes!()[0].extraLane).toBe(1);
    expect(beatToFloat(cb.getExtraNotes!()[0].beat)).toBe(3);

    mode.onPointerUp(5, 3);
    expect(cb.getExtraNotes!()[0].extraLane).toBe(1); // 드롭은 커밋일 뿐(이미 변환됨)
  });

  it("경계를 넘은 뒤 cancel하면 변환까지 되돌려 시작 시점으로 원상복구된다", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 3 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(
      {
        yToBeat: (y: number): Beat => beat(y),
        snapBeat: (b: Beat): Beat => b,
        hitTestNote: (x: number, y: number) => (x === 3 && y === 0 ? 0 : null),
      },
      { extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);
    const priv = mode as unknown as { chart: Chart };

    mode.onPointerDown(3, 0, false, false);
    mode.onPointerMove(6, 2); // 경계 횡단 → 엑스트라로 변환됨
    expect(priv.chart.notes).toHaveLength(0);

    mode.cancel();

    expect(priv.chart.notes).toHaveLength(1); // 메인으로 복원
    expect(priv.chart.notes[0].lane).toBe(3);
    expect(beatToFloat(priv.chart.notes[0].beat)).toBe(0);
    expect(cb.getExtraNotes!()).toHaveLength(0); // 변환 흔적 없음
    expect(cb.getSelectionState().notes).toEqual(new Set([0])); // 선택도 시작 시점으로
  });
});
