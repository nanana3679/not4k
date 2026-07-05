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
// 불변 잠금: 한 레인 롱노트 바디 겹침 불가 (RFD 0015 §8 의존)
//
// 판정 엔진의 R2 keyup 소비(가장 이른 release-대상 매칭)는 "한 레인에서 두 롱노트
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
