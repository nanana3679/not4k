import { describe, it, expect, vi } from "vitest";
import { SelectMode, type SelectModeCallbacks } from "./SelectMode";
import { emptySelection, normalizeSelection, type Selection } from "../stores/selectionSlice";
import { beat, beatToFloat } from "../../shared";
import type { Chart, Beat, Lane, NoteEntity, ExtraNoteEntity } from "../../shared";

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

  return {
    onChartUpdate: vi.fn((chart: Chart) => {
      currentChart = chart;
    }),
    getSelection: () => selection,
    setSelection: (s: Selection) => {
      selection = normalizeSelection(s, currentChart, currentExtraNotes);
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
    hitTestNote: () => null,
    onViolationsChange: vi.fn(),
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
// 리사이즈 프리뷰 제약 — 커밋과 동일한 validateChart 게이트
// ---------------------------------------------------------------------------

describe("SelectMode — 리사이즈 프리뷰 제약", () => {
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

  it("트릴존 끝을 트릴노트 밖(beat3)으로 축소하면 프리뷰 미적용(직전 유효값 유지)", () => {
    const { mode, cb, priv } = setup();
    mode.onPointerDown(9, 6, false, false);
    mode.onPointerMove(9, 5); // 유효 → endBeat=5
    const callsAfterValid = cb.onChartUpdate.mock.calls.length;

    mode.onPointerMove(9, 3); // endBeat 3이면 트릴노트 beat4가 구간 밖 → 위반 → 미적용

    expect(beatToFloat(priv.chart.trillZones[0].endBeat)).toBe(5); // 5에서 안 줄어듦
    expect(cb.onChartUpdate.mock.calls.length).toBe(callsAfterValid); // onChartUpdate 재호출 없음
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
    const { cb, mode } = setupPaste();

    mode.confirmPlacement();

    expect(mode.isPendingPaste).toBe(false);
    expect(cb.onViolationsChange).toHaveBeenCalledWith(new Set());
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

  it("confirmPlacement — 중복 위치에 붙여넣기 시 확정 거부", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(0)); // 같은 위치에 붙여넣기 = 중복

    mode.confirmPlacement();

    // 여전히 pending 상태
    expect(mode.isPendingPaste).toBe(true);
    expect(cb.onWarn).toHaveBeenCalled();
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
// 위반 감지
// ---------------------------------------------------------------------------

describe("SelectMode — 붙여넣기 위반 감지", () => {
  it("중복 위치에 붙여넣기 시 violationsChange에 위반 인덱스 전달", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(4) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    // beat(0) lane(1) 노트를 복사하고 beat(4)에 붙여넣기 → 기존 노트와 중복
    // 먼저 복사할 노트 추가
    const chartWithSource = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 1 as Lane, beat: beat(4) }, // 기존 노트
      ],
    });
    cb.syncChart(chartWithSource);
    mode.setChart(chartWithSource);
    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(4)); // beat(0) + offset(4) = beat(4) → 중복

    // onViolationsChange should have been called with the pasted note index
    expect(cb.onViolationsChange).toHaveBeenCalled();
    const lastCall = cb.onViolationsChange.mock.calls[cb.onViolationsChange.mock.calls.length - 1];
    const violations = lastCall[0] as Set<number>;
    expect(violations.size).toBeGreaterThan(0);
  });

  it("빈 위치에 붙여넣기 시 위반 없음", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
      ],
    });
    const cb = makeCallbacks();
    const mode = makeMode(chart, cb);

    mode.selectNote(0);
    mode.copy();
    mode.paste(beat(8)); // 충돌 없는 위치

    const lastCall = cb.onViolationsChange.mock.calls[cb.onViolationsChange.mock.calls.length - 1];
    const violations = lastCall[0] as Set<number>;
    expect(violations.size).toBe(0);
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
  it("엑스트라 레인 영역에서 드래그하면 해당 범위의 엑스트라 노트가 선택된다", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(0) },
      { type: "single", extraLane: 2, beat: beat(1) },
      { type: "single", extraLane: 1, beat: beat(3) }, // 범위 밖
    ];
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    // 엑스트라 레인 1(x=5), beat 0에서 시작
    mode.onPointerDown(5, 0, false, false);
    // 엑스트라 레인 2(x=6), beat 2까지 드래그
    mode.onPointerMove(6, 2);
    mode.onPointerUp(6, 2);

    const lastExtraSel = cb.getSelectionState().extraNotes;
    // extraNotes[0] (lane 1, beat 0)과 extraNotes[1] (lane 2, beat 1)이 선택됨
    expect(lastExtraSel.size).toBe(2);
    expect(lastExtraSel.has(0)).toBe(true);
    expect(lastExtraSel.has(1)).toBe(true);
    // extraNotes[2] (beat 3)은 범위 밖
    expect(lastExtraSel.has(2)).toBe(false);
  });

  it("엑스트라 레인 단일 레인만 드래그하면 해당 레인 노트만 선택된다", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(0) },
      { type: "single", extraLane: 2, beat: beat(0) },
    ];
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraNotes, extraLaneCount: 2 },
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

  it("메인 레인에서 엑스트라 레인까지 드래그하면 양쪽 노트 모두 선택된다", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 3 as Lane, beat: beat(1) },
        { type: "single", lane: 4 as Lane, beat: beat(1) },
        { type: "single", lane: 1 as Lane, beat: beat(1) }, // 범위 밖 (레인 1-2는 미포함)
      ],
    });
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(1) },
    ];
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraNotes, extraLaneCount: 2 },
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

  it("엑스트라 노트가 없는 영역에서 드래그하면 엑스트라 선택은 비어있다", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(5) }, // beat 범위 밖
    ];
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraNotes, extraLaneCount: 2 },
    );
    const mode = makeMode(chart, cb);

    mode.onPointerDown(5, 0, false, false);
    mode.onPointerMove(6, 2);
    mode.onPointerUp(6, 2);

    const lastExtraSel = cb.getSelectionState().extraNotes;
    expect(lastExtraSel.size).toBe(0);
  });

  it("박스 선택 중 onPointerMove에서 엑스트라 노트가 실시간으로 선택된다", () => {
    const chart = makeChart();
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(0) },
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const cb = makeCallbacks(
      { yToBeatRaw: (y: number): Beat => beat(y) },
      { extraNotes, extraLaneCount: 1 },
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

  it("박스 선택은 섞이면 한 그룹(최소 인덱스 기준)만 남긴다", () => {
    const cb = makeCallbacks();
    cb.yToBeatRaw = (y: number): Beat => beat(y); // y를 박자로 매핑
    const mode = makeMode(makeChartH(), cb);
    // 빈 영역(레인1, beat0)에서 박스 시작 → 레인3, beat10까지 드래그
    mode.onPointerDown(1, 0, false, false);
    mode.onPointerMove(3, 10);

    const sel = cb.getSelectionState().notes;
    // 후보 0,1(구간0)+2(구간1)+3(일반) 중 최소 인덱스 0 기준 → 0,1만
    expect([...sel].sort()).toEqual([0, 1]);
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

  it("selectZoneUnit은 구간과 안의 트릴노트를 함께 선택하고 콜백을 호출", () => {
    const cb = makeCallbacks();
    const mode = makeMode(makeChartZ(), cb);
    mode.selectZoneUnit(0);

    expect([...mode.selectedZones]).toEqual([0]);
    expect([...mode.selection].sort()).toEqual([0, 1]); // 구간 안 트릴노트
    const zoneSel = cb.getSelectionState().zones;
    expect([...zoneSel]).toEqual([0]);
  });

  it("핸들 클릭으로 구간 단위 선택된다", () => {
    const cb = makeCallbacks({
      hitTestTrillZoneHandle: () => 0,
    });
    const mode = makeMode(makeChartZ(), cb);
    mode.onPointerDown(1, 0, false, false); // 핸들 히트 → 구간0 선택

    expect([...mode.selectedZones]).toEqual([0]);
    expect([...mode.selection].sort()).toEqual([0, 1]);
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
