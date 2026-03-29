import { describe, it, expect, vi } from "vitest";
import { SelectMode } from "./SelectMode";
import { beat } from "../../shared";
import type { Chart, Beat, Lane, NoteEntity, ExtraNoteEntity } from "../../shared";

function makeChart(overrides?: Partial<Chart>): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    events: [{ type: "bpm" as const, beat: beat(0, 1), bpm: 120 }, { type: "timeSignature" as const, beat: beat(0, 1), beatPerMeasure: beat(4, 1) }],
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

  return {
    onChartUpdate: vi.fn(),
    onSelectionChange: vi.fn(),
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
    onExtraSelectionChange: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 복사 / 잘라내기
// ---------------------------------------------------------------------------

describe("SelectMode — 복사/잘라내기", () => {
  it("선택된 노트가 없으면 copy()는 0을 반환", () => {
    const chart = makeChart();
    const cb = makeCallbacks();
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
// 붙여넣기
// ---------------------------------------------------------------------------

describe("SelectMode — 붙여넣기", () => {
  it("클립보드가 비어있으면 paste()는 0 반환", () => {
    const chart = makeChart();
    const cb = makeCallbacks();
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

    // 두 노트 모두 선택
    mode.selectNote(0);
    // Directly manipulate for test: copy with both selected
    (mode as any).selectedIndices.add(1);
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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

    // beat(0) lane(1) 노트를 복사하고 beat(4)에 붙여넣기 → 기존 노트와 중복
    // 먼저 복사할 노트 추가
    (mode as any).chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 1 as Lane, beat: beat(4) }, // 기존 노트
      ],
    });
    mode.setChart((mode as any).chart);
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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

    // beat(2)와 beat(0) 모두 선택 — anchor는 beat(0)
    mode.selectNote(0);
    (mode as any).selectedIndices.add(1);
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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);

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
    const mode = new SelectMode(chart, cb);
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
    const mode = new SelectMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("left");

    expect(cb.onChartUpdate).not.toHaveBeenCalled();
  });

  it("레인 3 노트를 오른쪽으로 이동하면 레인 4로 이동", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 3 as Lane, beat: beat(0) }],
    });
    const cb = makeCallbacks(chart);
    const mode = new SelectMode(chart, cb);
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
    const mode = new SelectMode(chart, cb);
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
    const mode = new SelectMode(chart, cb);
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
    const mode = new SelectMode(chart, cb);
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
    const mode = new SelectMode(chart, cb);
    mode.selectNote(0);

    mode.moveByLane("right");

    // 메인 선택 해제
    const mainSel = cb.onSelectionChange.mock.calls;
    const lastMainSel = mainSel[mainSel.length - 1][0] as Set<number>;
    expect(lastMainSel.size).toBe(0);

    // 엑스트라 선택 설정
    const extraSel = cb.onExtraSelectionChange.mock.calls;
    const lastExtraSel = extraSel[extraSel.length - 1][0] as Set<number>;
    expect(lastExtraSel.size).toBe(1);
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
    (cb as any).hitTestExtraNote = () => 0;
    const mode = new SelectMode(chart, cb as any);
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
    (cb as any).hitTestExtraNote = () => 0;
    const mode = new SelectMode(chart, cb as any);
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
    (cb as any).hitTestExtraNote = () => 0;
    const mode = new SelectMode(chart, cb as any);
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
    (cb as any).hitTestExtraNote = () => 0;
    const mode = new SelectMode(chart, cb as any);
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
    (cb as any).hitTestExtraNote = () => 0;
    const mode = new SelectMode(chart, cb as any);
    mode.onPointerDown(5, 0, false, false);

    mode.moveByLane("left");

    // 엑스트라 선택 해제
    const extraSel = cb.onExtraSelectionChange.mock.calls;
    const lastExtraSel = extraSel[extraSel.length - 1][0] as Set<number>;
    expect(lastExtraSel.size).toBe(0);

    // 메인 선택 설정
    const mainSel = cb.onSelectionChange.mock.calls;
    const lastMainSel = mainSel[mainSel.length - 1][0] as Set<number>;
    expect(lastMainSel.size).toBe(1);
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
    const mode = new SelectMode(chart, cb as any);

    // Start box select at lane 1, beat 0 (pointerDown on empty area)
    mode.onPointerDown(1, 0, false, false);

    // Drag to lane 3, beat 3 — covers all 3 notes
    mode.onPointerMove(3, 3);

    // Release cursor outside the lane area (x=10 → xToLane returns null)
    mode.onPointerUp(10, 3);

    // Selection should still contain the notes selected during drag
    const calls = cb.onSelectionChange.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastSelection = calls[calls.length - 1][0] as Set<number>;
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
    const mode = new SelectMode(chart, cb as any);

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

    const calls = cb.onSelectionChange.mock.calls;
    const lastSelection = calls[calls.length - 1][0] as Set<number>;
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
    const mode = new SelectMode(chart, cb as any);

    // 엑스트라 레인 1(x=5), beat 0에서 시작
    mode.onPointerDown(5, 0, false, false);
    // 엑스트라 레인 2(x=6), beat 2까지 드래그
    mode.onPointerMove(6, 2);
    mode.onPointerUp(6, 2);

    const extraCalls = cb.onExtraSelectionChange.mock.calls;
    const lastExtraSel = extraCalls[extraCalls.length - 1][0] as Set<number>;
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
    const mode = new SelectMode(chart, cb as any);

    // 엑스트라 레인 1(x=5)에서만 드래그
    mode.onPointerDown(5, 0, false, false);
    mode.onPointerMove(5, 1);
    mode.onPointerUp(5, 1);

    const extraCalls = cb.onExtraSelectionChange.mock.calls;
    const lastExtraSel = extraCalls[extraCalls.length - 1][0] as Set<number>;
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
    const mode = new SelectMode(chart, cb as any);

    // 메인 레인 3(x=3), beat 0에서 시작
    mode.onPointerDown(3, 0, false, false);
    // 엑스트라 레인 1(x=5), beat 2까지 드래그
    mode.onPointerMove(5, 2);
    mode.onPointerUp(5, 2);

    // 메인 노트: 레인 3, 4 (beat 1)이 선택, 레인 1은 범위 밖
    const mainCalls = cb.onSelectionChange.mock.calls;
    const lastMainSel = mainCalls[mainCalls.length - 1][0] as Set<number>;
    expect(lastMainSel.size).toBe(2);
    expect(lastMainSel.has(0)).toBe(true); // lane 3
    expect(lastMainSel.has(1)).toBe(true); // lane 4

    // 엑스트라 노트: extraLane 1 (beat 1)이 선택
    const extraCalls = cb.onExtraSelectionChange.mock.calls;
    const lastExtraSel = extraCalls[extraCalls.length - 1][0] as Set<number>;
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
    const mode = new SelectMode(chart, cb as any);

    mode.onPointerDown(5, 0, false, false);
    mode.onPointerMove(6, 2);
    mode.onPointerUp(6, 2);

    const extraCalls = cb.onExtraSelectionChange.mock.calls;
    const lastExtraSel = extraCalls[extraCalls.length - 1][0] as Set<number>;
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
    const mode = new SelectMode(chart, cb as any);

    mode.onPointerDown(5, 0, false, false);

    // 작은 범위 드래그 — beat 0~1만 포함
    mode.onPointerMove(5, 1);
    let extraCalls = cb.onExtraSelectionChange.mock.calls;
    let sel = extraCalls[extraCalls.length - 1][0] as Set<number>;
    expect(sel.size).toBe(1);
    expect(sel.has(0)).toBe(true);

    // 범위 확대 — beat 0~3 포함
    mode.onPointerMove(5, 3);
    extraCalls = cb.onExtraSelectionChange.mock.calls;
    sel = extraCalls[extraCalls.length - 1][0] as Set<number>;
    expect(sel.size).toBe(2);
  });
});
