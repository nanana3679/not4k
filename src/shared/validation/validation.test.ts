import { describe, it, expect } from "vitest";
import {
  validateNoDuplicates,
  validateNoLongOverlap,
  validateTrillExclusive,
  validateNoTrillZoneOverlap,
  validateNoEventOverlap,
  validateStopZones,
  validateChart,
  isNaturalNumber,
  validateTimeSigNatural,
  validateTimeSigAtMeasureStart,
  isMeasureBoundary,
} from "./index";
import { beat } from "../types/beat";
import type { NoteEntity, TrillZone, ChartEvent, TimeSignatureMarker } from "../types/chart";

// =========================================================================
// 규칙 1: 동일 위치 중복 금지 (슬롯 기반)
// =========================================================================

describe("validateNoDuplicates", () => {
  it("중복 없으면 에러 없음", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 1, beat: beat(1) },
      { type: "single", lane: 2, beat: beat(0) },
    ];
    expect(validateNoDuplicates(notes)).toEqual([]);
  });

  it("같은 레인·같은 박자에 포인트 노트 중복이면 에러", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "double", lane: 1, beat: beat(0) },
    ];
    expect(validateNoDuplicates(notes)).toHaveLength(1);
    expect(validateNoDuplicates(notes)[0].rule).toBe("duplicate");
  });

  it("포인트 노트 + 롱노트 시작점 공존 허용 (롱노트 헤드)", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateNoDuplicates(notes)).toEqual([]);
  });

  it("포인트 노트 + 롱노트 끝점 공존 허용", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(4) },
    ];
    expect(validateNoDuplicates(notes)).toEqual([]);
  });

  it("롱노트 끝점 + 롱노트 시작점 공존 허용 (o-o- 패턴)", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "long", lane: 1, beat: beat(4), endBeat: beat(8) },
    ];
    expect(validateNoDuplicates(notes)).toEqual([]);
  });

  it("같은 위치에 롱노트 시작 2개는 에러", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(2) },
    ];
    expect(validateNoDuplicates(notes)).toHaveLength(1);
  });

  it("같은 위치에 롱노트 끝 2개는 에러", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "doubleLong", lane: 1, beat: beat(2), endBeat: beat(4) },
    ];
    expect(validateNoDuplicates(notes)).toHaveLength(1);
  });
});

// =========================================================================
// 규칙 2: 롱노트 구간 내 겹침 금지
// =========================================================================

describe("validateNoLongOverlap", () => {
  it("롱노트 바디 안에 다른 노트가 없으면 에러 없음", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(4) }, // 경계 → OK
      { type: "single", lane: 2, beat: beat(2) }, // 다른 레인 → OK
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });

  it("롱노트 바디 열린 구간 안에 노트가 있으면 에러", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(2) },
    ];
    const errors = validateNoLongOverlap(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("longOverlap");
  });

  it("경계(시작점/끝점)는 허용 — o-o- 패턴", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(2) },
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(4) },
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });

  it("롱노트 시작점에 포인트 노트 공존 허용", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });

  it("롱노트 끝점에 포인트 노트 공존 허용", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(4) },
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });
});

// =========================================================================
// 규칙 3: 트릴 구간 전용
// =========================================================================

describe("validateTrillExclusive", () => {
  it("트릴 노트가 트릴 구간 안에 있으면 OK", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(0) },
      { type: "trill", lane: 1, beat: beat(1) },
    ];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateTrillExclusive(notes, zones)).toEqual([]);
  });

  it("트릴 노트가 트릴 구간 밖이면 에러", () => {
    const notes: NoteEntity[] = [{ type: "trill", lane: 1, beat: beat(5) }];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateTrillExclusive(notes, zones)).toHaveLength(1);
  });

  it("비-트릴 노트가 트릴 구간 안이면 에러", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1, beat: beat(2) }];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateTrillExclusive(notes, zones)).toHaveLength(1);
  });

  it("다른 레인의 트릴 구간은 무관", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 2, beat: beat(2) }];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateTrillExclusive(notes, zones)).toEqual([]);
  });
});

// =========================================================================
// 규칙 4: 트릴 구간 겹침 금지
// =========================================================================

describe("validateNoTrillZoneOverlap", () => {
  it("같은 레인에서 겹치지 않으면 OK", () => {
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
      { lane: 1, beat: beat(4), endBeat: beat(8) }, // 끝-시작 인접 OK
    ];
    expect(validateNoTrillZoneOverlap(zones)).toEqual([]);
  });

  it("다른 레인이면 겹쳐도 OK", () => {
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
      { lane: 2, beat: beat(2), endBeat: beat(6) },
    ];
    expect(validateNoTrillZoneOverlap(zones)).toEqual([]);
  });

  it("같은 레인에서 열린 구간이 겹치면 에러", () => {
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
      { lane: 1, beat: beat(2), endBeat: beat(6) },
    ];
    expect(validateNoTrillZoneOverlap(zones)).toHaveLength(1);
    expect(validateNoTrillZoneOverlap(zones)[0].rule).toBe("trillZoneOverlap");
  });

  it("트릴 구간은 노트/롱노트와 독립 (여기서 검사하지 않음)", () => {
    // 이 함수는 트릴 구간끼리만 검사한다
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateNoTrillZoneOverlap(zones)).toEqual([]);
  });
});

// =========================================================================
// 규칙 5: 이벤트 마커 겹침 금지
// =========================================================================

describe("validateNoEventOverlap", () => {
  it("겹치지 않으면 에러 없음", () => {
    const events: ChartEvent[] = [
      { type: "text", beat: beat(0), endBeat: beat(4), text: "A" },
      { type: "text", beat: beat(4), endBeat: beat(8), text: "B" },
    ];
    expect(validateNoEventOverlap(events)).toEqual([]);
  });

  it("열린 구간이 겹치면 에러", () => {
    const events: ChartEvent[] = [
      { type: "text", beat: beat(0), endBeat: beat(4), text: "A" },
      { type: "text", beat: beat(2), endBeat: beat(6), text: "B" },
    ];
    expect(validateNoEventOverlap(events)).toHaveLength(1);
  });

  it("완전 포함도 에러", () => {
    const events: ChartEvent[] = [
      { type: "text", beat: beat(0), endBeat: beat(8), text: "A" },
      { type: "text", beat: beat(2), endBeat: beat(6), text: "B" },
    ];
    expect(validateNoEventOverlap(events).length).toBeGreaterThan(0);
  });
});

// =========================================================================
// 규칙 6: stop 구간 내 싱글/더블/롱노트 금지
// =========================================================================

describe("validateStopZones", () => {
  it("stop 구간 밖의 노트는 에러 없음", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(5) },
    ];
    const events: ChartEvent[] = [
      { type: "stop", beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateStopZones(notes, events)).toEqual([]);
  });

  it("stop 구간 내 싱글 노트는 에러", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(2) },
    ];
    const events: ChartEvent[] = [
      { type: "stop", beat: beat(0), endBeat: beat(4) },
    ];
    const errors = validateStopZones(notes, events);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("stopZone");
  });

  it("stop 구간 내 더블 노트는 에러", () => {
    const notes: NoteEntity[] = [
      { type: "double", lane: 2, beat: beat(1) },
    ];
    const events: ChartEvent[] = [
      { type: "stop", beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateStopZones(notes, events)).toHaveLength(1);
  });

  it("stop 구간 내 롱노트 시작점은 에러", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(6) },
    ];
    const events: ChartEvent[] = [
      { type: "stop", beat: beat(0), endBeat: beat(4) },
    ];
    const errors = validateStopZones(notes, events);
    expect(errors).toHaveLength(1);
  });

  it("stop 구간 내 롱노트 끝점은 에러", () => {
    const notes: NoteEntity[] = [
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(3) },
    ];
    const events: ChartEvent[] = [
      { type: "stop", beat: beat(2), endBeat: beat(6) },
    ];
    const errors = validateStopZones(notes, events);
    expect(errors).toHaveLength(1);
  });

  it("stop 구간 내 트릴 노트도 에러", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(2) },
    ];
    const events: ChartEvent[] = [
      { type: "stop", beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateStopZones(notes, events)).toHaveLength(1);
  });

  it("stop 구간 내 트릴롱 시작점/끝점은 에러", () => {
    const notes: NoteEntity[] = [
      { type: "trillLong", lane: 1, beat: beat(1), endBeat: beat(3) },
    ];
    const events: ChartEvent[] = [
      { type: "stop", beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateStopZones(notes, events)).toHaveLength(2);
  });

  it("롱노트 바디가 stop 구간을 관통하는 것은 허용", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(8) },
    ];
    const events: ChartEvent[] = [
      { type: "stop", beat: beat(2), endBeat: beat(6) },
    ];
    expect(validateStopZones(notes, events)).toEqual([]);
  });

  it("stop이 아닌 이벤트는 노트를 제한하지 않음", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(2) },
    ];
    const events: ChartEvent[] = [
      { type: "text", beat: beat(0), endBeat: beat(4), text: "hello" },
    ];
    expect(validateStopZones(notes, events)).toEqual([]);
  });
});

// =========================================================================
// 전체 검증
// =========================================================================

describe("validateChart", () => {
  it("유효한 차트는 에러 없음", () => {
    const result = validateChart({
      notes: [
        { type: "single", lane: 1, beat: beat(0) },
        { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
        { type: "single", lane: 1, beat: beat(4) },
        { type: "long", lane: 1, beat: beat(4), endBeat: beat(8) },
      ],
      trillZones: [],
      events: [],
    });
    expect(result).toEqual([]);
  });

  it("여러 규칙 위반을 한 번에 반환", () => {
    const result = validateChart({
      notes: [
        { type: "single", lane: 1, beat: beat(0) },
        { type: "single", lane: 1, beat: beat(0) }, // duplicate point
        { type: "trill", lane: 2, beat: beat(1) },  // trill outside zone
      ],
      trillZones: [],
      events: [
        { type: "text", beat: beat(0), endBeat: beat(4), text: "A" },
        { type: "text", beat: beat(2), endBeat: beat(6), text: "B" }, // overlap
      ],
    });
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("timeSigNotNatural 규칙이 포함되어 있다", () => {
    const result = validateChart({
      notes: [],
      trillZones: [],
      events: [
        { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(-4) },
      ],
    });
    expect(result.some(e => e.rule === "timeSigNotNatural")).toBe(true);
  });
});

// =========================================================================
// 규칙 7: 박자표 분자/분모는 자연수여야 한다
// =========================================================================

describe("isNaturalNumber", () => {
  it("양의 정수 → true", () => {
    expect(isNaturalNumber(1)).toBe(true);
    expect(isNaturalNumber(4)).toBe(true);
    expect(isNaturalNumber(100)).toBe(true);
  });

  it("0 → false", () => {
    expect(isNaturalNumber(0)).toBe(false);
  });

  it("음수 → false", () => {
    expect(isNaturalNumber(-1)).toBe(false);
    expect(isNaturalNumber(-4)).toBe(false);
  });

  it("소수 → false", () => {
    expect(isNaturalNumber(1.5)).toBe(false);
    expect(isNaturalNumber(3.14)).toBe(false);
  });

  it("NaN → false", () => {
    expect(isNaturalNumber(NaN)).toBe(false);
  });

  it("Infinity → false", () => {
    expect(isNaturalNumber(Infinity)).toBe(false);
  });
});

describe("validateTimeSigNatural", () => {
  it("분자/분모가 양의 정수이면 에러 없음", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
      { type: "timeSignature", beat: beat(16), beatPerMeasure: beat(3) },
    ];
    expect(validateTimeSigNatural(events)).toEqual([]);
  });

  it("beatPerMeasure가 없는 이벤트는 검사하지 않음", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(0), bpm: 120 },
    ];
    expect(validateTimeSigNatural(events)).toEqual([]);
  });

  it("분자가 음수이면 에러 — beat(-4)는 약분 후 n=-4, d=1", () => {
    // beat(-4) = { n: -4, d: 1 }
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(-4) },
    ];
    const errors = validateTimeSigNatural(events);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("timeSigNotNatural");
  });

  it("분자가 0이면 에러 — beat(0)은 n=0", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: { n: 0, d: 1 } },
    ];
    const errors = validateTimeSigNatural(events);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("timeSigNotNatural");
  });

  it("7/2 같은 분수 박자도 자연수이므로 허용", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(7, 2) },
    ];
    expect(validateTimeSigNatural(events)).toEqual([]);
  });
});

// =========================================================================
// 규칙 8: 박자표는 마디 시작 위치에만 존재
// =========================================================================

describe("isMeasureBoundary", () => {
  const ts4: TimeSignatureMarker[] = [
    { measure: 0, beatPerMeasure: beat(4) },
  ];

  it("beat 0은 항상 마디 경계", () => {
    expect(isMeasureBoundary(beat(0), ts4)).toBe(true);
  });

  it("4/4에서 beat 4는 마디 1의 시작 → 마디 경계", () => {
    expect(isMeasureBoundary(beat(4), ts4)).toBe(true);
  });

  it("4/4에서 beat 8은 마디 2의 시작 → 마디 경계", () => {
    expect(isMeasureBoundary(beat(8), ts4)).toBe(true);
  });

  it("4/4에서 beat 2는 마디 중간 → 마디 경계 아님", () => {
    expect(isMeasureBoundary(beat(2), ts4)).toBe(false);
  });

  it("4/4에서 beat 5는 마디 중간 → 마디 경계 아님", () => {
    expect(isMeasureBoundary(beat(5), ts4)).toBe(false);
  });

  it("3/4에서 beat 3, 6, 9는 마디 경계", () => {
    const ts3: TimeSignatureMarker[] = [
      { measure: 0, beatPerMeasure: beat(3) },
    ];
    expect(isMeasureBoundary(beat(3), ts3)).toBe(true);
    expect(isMeasureBoundary(beat(6), ts3)).toBe(true);
    expect(isMeasureBoundary(beat(9), ts3)).toBe(true);
  });

  it("3/4에서 beat 4는 마디 경계 아님", () => {
    const ts3: TimeSignatureMarker[] = [
      { measure: 0, beatPerMeasure: beat(3) },
    ];
    expect(isMeasureBoundary(beat(4), ts3)).toBe(false);
  });

  it("박자 변경 후에도 경계 판정 — 4/4→3/4 전환", () => {
    const ts: TimeSignatureMarker[] = [
      { measure: 0, beatPerMeasure: beat(4) },  // 마디 0~1: 4박
      { measure: 2, beatPerMeasure: beat(3) },   // 마디 2~: 3박
    ];
    // 마디 2 시작 = beat 8
    expect(isMeasureBoundary(beat(8), ts)).toBe(true);
    // 마디 3 시작 = beat 8 + 3 = 11
    expect(isMeasureBoundary(beat(11), ts)).toBe(true);
    // beat 10은 마디 중간
    expect(isMeasureBoundary(beat(10), ts)).toBe(false);
  });

  it("7/2 같은 분수 박자에서 마디 경계 — beat 0, 3.5, 7", () => {
    const ts: TimeSignatureMarker[] = [
      { measure: 0, beatPerMeasure: beat(7, 2) },
    ];
    expect(isMeasureBoundary(beat(0), ts)).toBe(true);
    expect(isMeasureBoundary(beat(7, 2), ts)).toBe(true);
    expect(isMeasureBoundary(beat(7), ts)).toBe(true);  // 2마디 시작
    expect(isMeasureBoundary(beat(2), ts)).toBe(false);
  });

  it("빈 timeSignatures면 false", () => {
    expect(isMeasureBoundary(beat(0), [])).toBe(false);
  });
});

describe("validateTimeSigAtMeasureStart", () => {
  it("모든 박자표가 마디 시작에 있으면 에러 없음", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
      { type: "timeSignature", beat: beat(16), beatPerMeasure: beat(3) }, // 마디 4 시작
    ];
    expect(validateTimeSigAtMeasureStart(events)).toEqual([]);
  });

  it("마디 중간에 박자표가 있으면 에러", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
      { type: "timeSignature", beat: beat(5), beatPerMeasure: beat(3) }, // beat 5는 마디 중간
    ];
    const errors = validateTimeSigAtMeasureStart(events);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("timeSigNotAtMeasureStart");
  });

  it("단일 이벤트는 항상 유효 (첫 번째 이벤트는 검사 생략)", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
    ];
    expect(validateTimeSigAtMeasureStart(events)).toEqual([]);
  });

  it("beatPerMeasure 없는 이벤트는 무시", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
      { type: "bpm", beat: beat(5), bpm: 120 }, // timesig 없음 — 무시
    ];
    expect(validateTimeSigAtMeasureStart(events)).toEqual([]);
  });

  it("연속 박자 변경 — 4/4→3/4→5/4 모두 마디 시작이면 에러 없음", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
      { type: "timeSignature", beat: beat(8), beatPerMeasure: beat(3) },   // 마디 2 시작
      { type: "timeSignature", beat: beat(14), beatPerMeasure: beat(5) }, // 마디 4 시작 (8 + 3*2 = 14)
    ];
    expect(validateTimeSigAtMeasureStart(events)).toEqual([]);
  });

  it("연속 박자 변경에서 두 번째가 마디 중간이면 에러", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
      { type: "timeSignature", beat: beat(8), beatPerMeasure: beat(3) },   // 마디 2 시작 OK
      { type: "timeSignature", beat: beat(13), beatPerMeasure: beat(5) }, // beat 13 = 8 + 5 — 마디 중간
    ];
    const errors = validateTimeSigAtMeasureStart(events);
    expect(errors).toHaveLength(1);
  });
});
