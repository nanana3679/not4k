import { describe, it, expect } from "vitest";
import {
  validateNoDuplicates,
  validateNoLongOverlap,
  validateTrillExclusive,
  validateTrillLong,
  validateNoTrillZoneOverlap,
  validateNoEventDuplicate,
  validateNoEventOverlap,
  validateNoTutorialInputOverlap,
  validateStopZones,
  validateChart,
  validateChartStructural,
  validateChartSemantic,
  chartViolatingNoteIndices,
  chartViolationIndices,
  validateNoRangeInversion,
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

  it("중복된 두 포인트 노트의 원본 인덱스가 refs에 kind 'note'로 담긴다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 2, beat: beat(0) }, // 무관 노트, 인덱스를 밀기 위함
      { type: "single", lane: 1, beat: beat(0) },
      { type: "double", lane: 1, beat: beat(0) },
    ];
    const errors = validateNoDuplicates(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].refs).toEqual([
      { kind: "note", index: 1 },
      { kind: "note", index: 2 },
    ]);
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

  it("겹치는 노트의 원본 인덱스가 refs에 담긴다 (다른 레인 그룹화 후에도 정확)", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 2, beat: beat(1) },                    // 인덱스 0, 다른 레인
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },    // 인덱스 1
      { type: "single", lane: 2, beat: beat(3) },                    // 인덱스 2, 다른 레인
      { type: "single", lane: 1, beat: beat(2) },                    // 인덱스 3, 겹침 대상
    ];
    const errors = validateNoLongOverlap(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].refs).toEqual([
      { kind: "note", index: 1 },
      { kind: "note", index: 3 },
    ]);
  });
});

// =========================================================================
// 불변 잠금: 한 레인 롱노트 바디 겹침 불가 (RFD 0015 §8 의존)
//
// 판정 엔진의 keyup 소비(가장 이른 release-대상 매칭)는 "한 레인에서 두 롱노트
// 바디가 겹치지 않는다"(→ keyup의 종결 대상 유일)는 배치 불변을 전제한다. 이 불변은 별도 규칙이 아니라 기존 두 규칙의 합으로 강제된다:
//   - 같은 시작 박 → validateNoDuplicates ("Duplicate range start")
//   - 시작 박이 다르면서 겹침 → 한쪽 끝점이 상대 열린 바디에 들어가 validateNoLongOverlap
// 어느 규칙이 잡든 validateChart 레벨에서 거부됨을 잠근다(누가 규칙을 느슨하게 바꾸면 깨지도록).
// =========================================================================

describe("롱노트 겹침 불가 불변 (validateChart, RFD 0008)", () => {
  const chartOf = (notes: NoteEntity[]) =>
    validateChart({ notes, trillZones: [], events: [] });

  it("시작 박이 다르고 바디가 겹치는 두 롱(L1 0~4, L2 2~6)이면 거부", () => {
    expect(chartOf([
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(6) },
    ]).length).toBeGreaterThan(0);
  });

  it("한 롱이 다른 롱을 완전히 포함(L1 0~6, L2 2~4)하면 거부", () => {
    expect(chartOf([
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(6) },
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(4) },
    ]).length).toBeGreaterThan(0);
  });

  it("같은 시작 박의 두 롱(L1 0~4, L2 0~6)이면 거부 (중복 시작점)", () => {
    expect(chartOf([
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(6) },
    ]).length).toBeGreaterThan(0);
  });

  it("doubleLong과 long의 바디가 겹쳐도(같은 레인) 거부", () => {
    expect(chartOf([
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(6) },
    ]).length).toBeGreaterThan(0);
  });

  it("연결(끝점=시작점 맞닿음, L1 0~2 / L2 2~4)은 허용 — 겹침 아님", () => {
    expect(chartOf([
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(2) },
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(4) },
    ])).toEqual([]);
  });

  it("다른 레인의 롱노트 바디 겹침은 허용", () => {
    expect(chartOf([
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "long", lane: 2, beat: beat(2), endBeat: beat(6) },
    ])).toEqual([]);
  });
});

// =========================================================================
// 규칙 3: trillZone 전용
// =========================================================================

describe("validateTrillExclusive", () => {
  it("트릴 노트가 trillZone 안에 있으면 OK", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(0) },
      { type: "trill", lane: 1, beat: beat(1) },
    ];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateTrillExclusive(notes, zones)).toEqual([]);
  });

  it("트릴 노트가 trillZone 밖이면 에러", () => {
    const notes: NoteEntity[] = [{ type: "trill", lane: 1, beat: beat(5) }];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateTrillExclusive(notes, zones)).toHaveLength(1);
  });

  it("비-트릴 노트가 trillZone 안이면 에러", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1, beat: beat(2) }];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateTrillExclusive(notes, zones)).toHaveLength(1);
  });

  it("다른 레인의 trillZone은 무관", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 2, beat: beat(2) }];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateTrillExclusive(notes, zones)).toEqual([]);
  });

  it("존 밖 트릴 노트의 원본 인덱스가 refs에 kind 'note'로 담긴다", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(0) },  // 인덱스 0, 존 안 → OK
      { type: "trill", lane: 1, beat: beat(5) },  // 인덱스 1, 존 밖 → 위반
    ];
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    const errors = validateTrillExclusive(notes, zones);
    expect(errors).toHaveLength(1);
    expect(errors[0].refs).toEqual([{ kind: "note", index: 1 }]);
  });
});

// =========================================================================
// 트릴 롱노트: 헤드 필수 + hold-only 불가 (RFD 0005, 교대는 헤드 keydown 기반)
// =========================================================================

describe("validateTrillLong", () => {
  it("헤드(trill 포인트)가 있는 일반 trillLong은 OK", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(0) }, // 헤드
      { type: "trillLong", lane: 1, beat: beat(0), endBeat: beat(2) },
    ];
    expect(validateTrillLong(notes)).toEqual([]);
  });

  it("hold-only trillLong이면 에러 (교대 보상↔처벌 모순)", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(0) },
      { type: "trillLong", lane: 1, beat: beat(0), endBeat: beat(2), holdOnly: true },
    ];
    const errors = validateTrillLong(notes);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].rule).toBe("trillLongInvalid");
  });

  it("헤드 없는 trillLong(length>0)이면 에러 — 교대 비교 대상 없음", () => {
    const notes: NoteEntity[] = [
      { type: "trillLong", lane: 1, beat: beat(0), endBeat: beat(2) }, // 헤드 없음
    ];
    const errors = validateTrillLong(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("trillLongInvalid");
  });

  it("헤드 없는 length-0 trillLong(트릴 슬라이드)도 에러 (length 무관 금지)", () => {
    const notes: NoteEntity[] = [
      { type: "trillLong", lane: 1, beat: beat(2), endBeat: beat(2) }, // length 0, 헤드 없음
    ];
    const errors = validateTrillLong(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("trillLongInvalid");
  });

  it("일반 long/doubleLong은 hold-only·헤드 없음 모두 허용 (트릴 아님)", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(2), holdOnly: true }, // 헤드 없는 hold-only 롱 OK
      { type: "doubleLong", lane: 2, beat: beat(0), endBeat: beat(2), holdOnly: true },
    ];
    expect(validateTrillLong(notes)).toEqual([]);
  });

  it("hold-only이면서 헤드도 없으면 두 규칙 위반이 각각 보고된다 (두 검사 독립)", () => {
    // 두 검사가 else-if로 묶이거나 하나가 다른 하나를 가리면 이 케이스가 1건만 보고된다.
    const notes: NoteEntity[] = [
      { type: "trillLong", lane: 1, beat: beat(0), endBeat: beat(2), holdOnly: true }, // 헤드 없음 + hold-only
    ];
    const errors = validateTrillLong(notes);
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.rule === "trillLongInvalid")).toBe(true);
  });

  it("trill 노트가 다른 레인에 있으면 헤드로 인정되지 않아 에러 — 헤드는 같은 레인이어야", () => {
    // hasHead의 lane 조건 가드. 엉뚱한 레인의 trill이 헤드로 오인되면 안 된다.
    const notes: NoteEntity[] = [
      { type: "trill", lane: 2, beat: beat(0) },              // 다른 레인의 trill
      { type: "trillLong", lane: 1, beat: beat(0), endBeat: beat(2) },
    ];
    const errors = validateTrillLong(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("trillLongInvalid");
  });

  it("trill 노트가 다른 박에 있으면 헤드로 인정되지 않아 에러 — 헤드는 같은 시작 박이어야", () => {
    // hasHead의 beat 조건 가드. 시작 박이 어긋난 trill은 헤드가 아니다.
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(1) },              // 시작 박이 다른 trill
      { type: "trillLong", lane: 1, beat: beat(0), endBeat: beat(2) },
    ];
    const errors = validateTrillLong(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("trillLongInvalid");
  });
});

// =========================================================================
// 규칙 4: trillZone 겹침 금지
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

  it("trillZone은 노트/롱노트와 독립 (여기서 검사하지 않음)", () => {
    // 이 함수는 trillZone끼리만 검사한다
    const zones: TrillZone[] = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateNoTrillZoneOverlap(zones)).toEqual([]);
  });

  it("겹치는 두 존이면 refs에 두 존 인덱스가 kind 'trillZone'으로 담긴다", () => {
    const zones: TrillZone[] = [
      { lane: 2, beat: beat(0), endBeat: beat(4) },  // 인덱스 0, 무관 레인
      { lane: 1, beat: beat(0), endBeat: beat(4) },  // 인덱스 1
      { lane: 1, beat: beat(2), endBeat: beat(6) },  // 인덱스 2, 겹침 대상
    ];
    const errors = validateNoTrillZoneOverlap(zones);
    expect(errors).toHaveLength(1);
    expect(errors[0].refs).toEqual([
      { kind: "trillZone", index: 1 },
      { kind: "trillZone", index: 2 },
    ]);
  });
});

// =========================================================================
// 규칙 5: 같은 beat에 같은 타입 시점 이벤트 중복 금지
// =========================================================================

describe("validateNoEventDuplicate", () => {
  it("같은 beat에 bpm이 2개면 에러", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "bpm", beat: beat(0), bpm: 180 },
    ];
    const errors = validateNoEventDuplicate(events);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("eventDuplicate");
  });

  it("같은 beat에 timeSignature가 2개면 에러", () => {
    const events: ChartEvent[] = [
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(3) },
    ];
    expect(validateNoEventDuplicate(events)).toHaveLength(1);
  });

  it("같은 beat에 bpm + timeSignature는 다른 타입이므로 허용", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
    ];
    expect(validateNoEventDuplicate(events)).toEqual([]);
  });

  it("다른 beat에 같은 타입은 허용", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "bpm", beat: beat(4), bpm: 180 },
    ];
    expect(validateNoEventDuplicate(events)).toEqual([]);
  });

  it("구간 이벤트(text, auto, stop)는 검사하지 않음", () => {
    const events: ChartEvent[] = [
      { type: "text", beat: beat(0), endBeat: beat(4), text: "A" },
      { type: "text", beat: beat(0), endBeat: beat(8), text: "B" },
    ];
    expect(validateNoEventDuplicate(events)).toEqual([]);
  });
});

// =========================================================================
// 규칙 6: 이벤트 마커 겹침 금지
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

  it("tutorialInput은 일반 구간 이벤트 겹침 검사에서 제외", () => {
    const events: ChartEvent[] = [
      { type: "tutorialInput", beat: beat(0), endBeat: beat(4), lane: 1, keyCode: "KeyD" },
      { type: "tutorialInput", beat: beat(2), endBeat: beat(6), lane: 1, keyCode: "KeyF" },
    ];
    expect(validateNoEventOverlap(events)).toEqual([]);
  });

  it("tutorialDiagram은 같은 시간에 겹쳐도 일반 구간 이벤트 겹침 검사에서 제외", () => {
    const events: ChartEvent[] = [
      { type: "tutorialDiagram", beat: beat(0), endBeat: beat(4), diagramId: "connected-switch" },
      { type: "tutorialDiagram", beat: beat(2), endBeat: beat(6), diagramId: "connected-overlap" },
    ];
    expect(validateNoEventOverlap(events)).toEqual([]);
  });

  it("겹치는 두 이벤트의 원본 인덱스가 refs에 담긴다 — 앞에 다른 타입 이벤트가 끼어 인덱스가 밀려도 정확", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(0), bpm: 120 },                       // 인덱스 0, 필터 대상 아님
      { type: "tutorialInput", beat: beat(0), endBeat: beat(4), lane: 1, keyCode: "KeyD" }, // 인덱스 1, 필터 대상 아님
      { type: "text", beat: beat(0), endBeat: beat(4), text: "A" },    // 인덱스 2
      { type: "bpm", beat: beat(1), bpm: 140 },                       // 인덱스 3, 필터 대상 아님
      { type: "text", beat: beat(2), endBeat: beat(6), text: "B" },    // 인덱스 4, 겹침 대상
    ];
    const errors = validateNoEventOverlap(events);
    expect(errors).toHaveLength(1);
    expect(errors[0].refs).toEqual([
      { kind: "event", index: 2 },
      { kind: "event", index: 4 },
    ]);
  });
});

describe("validateNoTutorialInputOverlap", () => {
  it("같은 lane+keyCode의 tutorialInput 구간이 겹치면 에러", () => {
    const events: ChartEvent[] = [
      { type: "tutorialInput", beat: beat(0), endBeat: beat(4), lane: 1, keyCode: "KeyD" },
      { type: "tutorialInput", beat: beat(2), endBeat: beat(6), lane: 1, keyCode: "KeyD" },
    ];
    const errors = validateNoTutorialInputOverlap(events);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("tutorialInputOverlap");
  });

  it("같은 lane+keyCode라도 끝과 시작이 같은 tutorialInput 구간은 허용", () => {
    const events: ChartEvent[] = [
      { type: "tutorialInput", beat: beat(0), endBeat: beat(4), lane: 1, keyCode: "KeyD" },
      { type: "tutorialInput", beat: beat(4), endBeat: beat(6), lane: 1, keyCode: "KeyD" },
    ];
    expect(validateNoTutorialInputOverlap(events)).toEqual([]);
  });

  it("같은 lane에서 다른 keyCode의 tutorialInput 구간이 겹치면 허용", () => {
    const events: ChartEvent[] = [
      { type: "tutorialInput", beat: beat(0), endBeat: beat(4), lane: 1, keyCode: "KeyD" },
      { type: "tutorialInput", beat: beat(2), endBeat: beat(6), lane: 1, keyCode: "KeyF" },
    ];
    expect(validateNoTutorialInputOverlap(events)).toEqual([]);
  });

  it("다른 lane의 같은 keyCode tutorialInput 구간이 겹치면 허용", () => {
    const events: ChartEvent[] = [
      { type: "tutorialInput", beat: beat(0), endBeat: beat(4), lane: 1, keyCode: "KeyD" },
      { type: "tutorialInput", beat: beat(2), endBeat: beat(6), lane: 2, keyCode: "KeyD" },
    ];
    expect(validateNoTutorialInputOverlap(events)).toEqual([]);
  });

  it("validateChart는 같은 키의 tutorialInput 겹침을 tutorialInputOverlap으로 보고", () => {
    const errors = validateChart({
      notes: [],
      trillZones: [],
      events: [
        { type: "tutorialInput", beat: beat(0), endBeat: beat(4), lane: 1, keyCode: "KeyD" },
        { type: "tutorialInput", beat: beat(2), endBeat: beat(6), lane: 1, keyCode: "KeyD" },
      ],
    });
    expect(errors.some((error) => error.rule === "tutorialInputOverlap")).toBe(true);
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

  it("stop 구간 내 노트의 원본 인덱스가 refs에 note+event로 담긴다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(10) },  // 인덱스 0, 구간 밖
      { type: "single", lane: 1, beat: beat(2) },   // 인덱스 1, 구간 내 → 위반
    ];
    const events: ChartEvent[] = [
      { type: "text", beat: beat(0), endBeat: beat(1), text: "x" }, // 인덱스 0, stop 아님
      { type: "stop", beat: beat(0), endBeat: beat(4) },            // 인덱스 1
    ];
    const errors = validateStopZones(notes, events);
    expect(errors).toHaveLength(1);
    expect(errors[0].refs).toEqual([
      { kind: "note", index: 1 },
      { kind: "event", index: 1 },
    ]);
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

  it("구간 역전(endBeat<beat)도 rangeInverted로 보고한다(구조가 합집합에 포함)", () => {
    const result = validateChart({
      notes: [{ type: "long", lane: 1, beat: beat(4), endBeat: beat(2) }],
      trillZones: [],
      events: [],
    });
    expect(result.some(e => e.rule === "rangeInverted")).toBe(true);
  });

  it("동일 참조 입력은 memo로 같은 배열 인스턴스를 재사용", () => {
    const input = { notes: [] as NoteEntity[], trillZones: [] as TrillZone[], events: [] as ChartEvent[] };
    const first = validateChart(input);
    const second = validateChart(input);
    expect(second).toBe(first);
  });
});

// =========================================================================
// 구조 검증 (역전) + 구조/의미 분리 (RFD 0017 §3-1)
// =========================================================================

describe("validateNoRangeInversion", () => {
  it("롱노트 endBeat<beat 역전이면 rangeInverted 반환", () => {
    const notes: NoteEntity[] = [{ type: "long", lane: 1, beat: beat(4), endBeat: beat(2) }];
    const errors = validateNoRangeInversion(notes, [], []);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("rangeInverted");
  });

  it("endBeat==beat 길이 0 롱노트는 역전이 아니라 통과", () => {
    const notes: NoteEntity[] = [{ type: "long", lane: 1, beat: beat(4), endBeat: beat(4) }];
    expect(validateNoRangeInversion(notes, [], [])).toEqual([]);
  });

  it("정상 롱노트(endBeat>beat)는 통과", () => {
    const notes: NoteEntity[] = [{ type: "long", lane: 1, beat: beat(0), endBeat: beat(4) }];
    expect(validateNoRangeInversion(notes, [], [])).toEqual([]);
  });

  it("TrillZone endBeat<beat도 rangeInverted로 잡는다", () => {
    const zones: TrillZone[] = [{ lane: 2, beat: beat(8), endBeat: beat(4) }];
    const errors = validateNoRangeInversion([], zones, []);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("rangeInverted");
  });

  it("구간 이벤트(stop) endBeat<beat도 rangeInverted로 잡는다", () => {
    const events: ChartEvent[] = [{ type: "stop", beat: beat(4), endBeat: beat(2) }];
    const errors = validateNoRangeInversion([], [], events);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("rangeInverted");
  });

  it("포인트 노트(endBeat 없음)는 검사 대상이 아니다", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1, beat: beat(0) }];
    expect(validateNoRangeInversion(notes, [], [])).toEqual([]);
  });
});

describe("validateChartStructural / validateChartSemantic 분리", () => {
  it("구조 검증은 역전+분자0박자표만 포함하고 의미 위반(중복)은 제외", () => {
    const input = {
      notes: [
        { type: "single", lane: 1, beat: beat(0) },
        { type: "single", lane: 1, beat: beat(0) }, // 중복(의미)
        { type: "long", lane: 2, beat: beat(4), endBeat: beat(2) }, // 역전(구조)
      ] as NoteEntity[],
      trillZones: [] as TrillZone[],
      events: [
        { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(0) }, // 분자0(구조)
      ] as ChartEvent[],
    };
    const structural = validateChartStructural(input);
    expect(structural.some(e => e.rule === "rangeInverted")).toBe(true);
    expect(structural.some(e => e.rule === "timeSigNotNatural")).toBe(true);
    expect(structural.some(e => e.rule === "duplicate")).toBe(false);
  });

  it("의미 검증은 역전(구조)을 포함하지 않는다", () => {
    const input = {
      notes: [{ type: "long", lane: 2, beat: beat(4), endBeat: beat(2) }] as NoteEntity[],
      trillZones: [] as TrillZone[],
      events: [] as ChartEvent[],
    };
    expect(validateChartSemantic(input).some(e => e.rule === "rangeInverted")).toBe(false);
  });

  it("구조+의미를 합치면 validateChart와 같은 위반 집합(rule)을 낸다", () => {
    const input = {
      notes: [
        { type: "single", lane: 1, beat: beat(0) },
        { type: "single", lane: 1, beat: beat(0) },
      ] as NoteEntity[],
      trillZones: [] as TrillZone[],
      events: [] as ChartEvent[],
    };
    const combined = [...validateChartStructural(input), ...validateChartSemantic(input)]
      .map(e => e.rule)
      .sort();
    const whole = validateChart(input).map(e => e.rule).sort();
    expect(combined).toEqual(whole);
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

describe("validateChart memo", () => {
  it("세 배열 참조가 같으면 결과 배열을 재사용한다 (프리뷰 이중검증 비용 절감)", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1, beat: { n: 0, d: 1 } }];
    const trillZones: TrillZone[] = [];
    const events: ChartEvent[] = [];

    const first = validateChart({ notes, trillZones, events });
    const second = validateChart({ notes, trillZones, events }); // 입력 객체는 새로, 배열 참조는 동일

    expect(second).toBe(first);
  });

  it("배열 참조가 하나라도 다르면 새로 검증한다", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1, beat: { n: 0, d: 1 } }];
    const trillZones: TrillZone[] = [];
    const events: ChartEvent[] = [];

    const first = validateChart({ notes, trillZones, events });
    const second = validateChart({ notes: [...notes], trillZones, events });

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});

// =========================================================================
// chartViolatingNoteIndices — 위반 시각화 단일 소스 (RFD 0017 §3-3)
// =========================================================================

describe("chartViolatingNoteIndices", () => {
  it("겹침을 만드는 두 노트의 인덱스가 모두 위반 집합에 담긴다", () => {
    const result = chartViolatingNoteIndices({
      notes: [
        { type: "long", lane: 1, beat: beat(0), endBeat: beat(4) }, // 0
        { type: "single", lane: 1, beat: beat(2) },                  // 1 — 바디 안 겹침
      ],
      trillZones: [],
      events: [],
    });
    expect(result).toEqual(new Set([0, 1]));
  });

  it("위반이 없으면 빈 집합", () => {
    expect(
      chartViolatingNoteIndices({
        notes: [{ type: "single", lane: 1, beat: beat(0) }],
        trillZones: [],
        events: [],
      }),
    ).toEqual(new Set());
  });

  it("존끼리만 겹치면 노트 집합은 비고 trillZones 집합에 두 존 인덱스가 담긴다", () => {
    const trillZones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
      { lane: 1, beat: beat(2), endBeat: beat(6) },
    ];
    const input = { notes: [], trillZones, events: [] };
    expect(chartViolatingNoteIndices(input)).toEqual(new Set()); // 노트 아님
    expect(chartViolationIndices(input).trillZones).toEqual(new Set([0, 1])); // 존은 하이라이트 대상(6c)
  });
});

describe("chartViolationIndices", () => {
  it("노트 겹침은 notes에, 존 겹침은 trillZones에 종류별로 분리된다", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 2, beat: beat(0), endBeat: beat(4) }, // 0
      { type: "single", lane: 2, beat: beat(2) },                  // 1 — 바디 겹침
    ];
    const trillZones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) }, // 0
      { lane: 1, beat: beat(2), endBeat: beat(6) }, // 1 — 존 겹침
    ];
    const result = chartViolationIndices({ notes, trillZones, events: [] });
    expect(result.notes).toEqual(new Set([0, 1]));
    expect(result.trillZones).toEqual(new Set([0, 1]));
  });
});

// =========================================================================
// 값 기준 중복 검출 — 표현이 달라도 같은 박이면 중복 (스냅형 8/4 vs 약분형 2/1)
// 스냅은 분모=스냅분할값(8/4)을, 이동(beatAdd)은 약분형(2/1)을 만든다.
// =========================================================================

describe("beatKey 값 비교 (표현 무관 중복)", () => {
  it("같은 레인·같은 값·다른 표현(8/4 vs 2/1) 포인트 노트 2개는 중복으로 잡는다", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 2, beat: { n: 8, d: 4 } }, // 스냅형 8/4 = 2.0
      { type: "single", lane: 2, beat: beat(2) },        // 약분형 2/1 = 2.0
    ];
    const errors = validateNoDuplicates(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("duplicate");
    expect(errors[0].refs).toEqual([{ kind: "note", index: 0 }, { kind: "note", index: 1 }]);
  });

  it("스냅형 노트 위로 이동해 겹치면 chartViolationIndices가 두 노트를 잡는다 (사용자 시나리오)", () => {
    const result = chartViolationIndices({
      notes: [
        { type: "single", lane: 2, beat: { n: 8, d: 4 } }, // 생성(스냅) 8/4
        { type: "single", lane: 2, beat: beat(2) },        // 이동(약분) 2/1
      ],
      trillZones: [],
      events: [],
    });
    expect(result.notes).toEqual(new Set([0, 1]));
  });

  it("같은 값·다른 표현 롱노트 시작 2개는 중복(rangeStart)으로 잡는다", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: { n: 8, d: 4 }, endBeat: beat(6) }, // 시작 8/4 = 2
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(7) },        // 시작 2/1 = 2
    ];
    expect(validateNoDuplicates(notes)).toHaveLength(1);
  });
});
