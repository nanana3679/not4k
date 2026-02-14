import { describe, it, expect } from "vitest";
import {
  validateNoDuplicates,
  validateNoLongOverlap,
  validateTrillExclusive,
  validateNoTrillZoneOverlap,
  validateNoMessageOverlap,
  validateChart,
} from "./index";
import { beat } from "../types/beat";
import type { NoteEntity, TrillZone, Message } from "../types/chart";

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
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateNoDuplicates(notes)).toEqual([]);
  });

  it("포인트 노트 + 롱노트 끝점 공존 허용", () => {
    const notes: NoteEntity[] = [
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(4) },
    ];
    expect(validateNoDuplicates(notes)).toEqual([]);
  });

  it("롱노트 끝점 + 롱노트 시작점 공존 허용 (o-o- 패턴)", () => {
    const notes: NoteEntity[] = [
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "singleLong", lane: 1, beat: beat(4), endBeat: beat(8) },
    ];
    expect(validateNoDuplicates(notes)).toEqual([]);
  });

  it("같은 위치에 롱노트 시작 2개는 에러", () => {
    const notes: NoteEntity[] = [
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(2) },
    ];
    expect(validateNoDuplicates(notes)).toHaveLength(1);
  });

  it("같은 위치에 롱노트 끝 2개는 에러", () => {
    const notes: NoteEntity[] = [
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
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
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(4) }, // 경계 → OK
      { type: "single", lane: 2, beat: beat(2) }, // 다른 레인 → OK
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });

  it("롱노트 바디 열린 구간 안에 노트가 있으면 에러", () => {
    const notes: NoteEntity[] = [
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(2) },
    ];
    const errors = validateNoLongOverlap(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("longOverlap");
  });

  it("경계(시작점/끝점)는 허용 — o-o- 패턴", () => {
    const notes: NoteEntity[] = [
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(2) },
      { type: "singleLong", lane: 1, beat: beat(2), endBeat: beat(4) },
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });

  it("롱노트 시작점에 포인트 노트 공존 허용", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });

  it("롱노트 끝점에 포인트 노트 공존 허용", () => {
    const notes: NoteEntity[] = [
      { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
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
// 규칙 5: 메시지 겹침 금지
// =========================================================================

describe("validateNoMessageOverlap", () => {
  it("겹치지 않으면 에러 없음", () => {
    const msgs: Message[] = [
      { beat: beat(0), endBeat: beat(4), text: "A" },
      { beat: beat(4), endBeat: beat(8), text: "B" },
    ];
    expect(validateNoMessageOverlap(msgs)).toEqual([]);
  });

  it("열린 구간이 겹치면 에러", () => {
    const msgs: Message[] = [
      { beat: beat(0), endBeat: beat(4), text: "A" },
      { beat: beat(2), endBeat: beat(6), text: "B" },
    ];
    expect(validateNoMessageOverlap(msgs)).toHaveLength(1);
  });

  it("완전 포함도 에러", () => {
    const msgs: Message[] = [
      { beat: beat(0), endBeat: beat(8), text: "A" },
      { beat: beat(2), endBeat: beat(6), text: "B" },
    ];
    expect(validateNoMessageOverlap(msgs).length).toBeGreaterThan(0);
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
        { type: "singleLong", lane: 1, beat: beat(0), endBeat: beat(4) },
        { type: "single", lane: 1, beat: beat(4) },
        { type: "singleLong", lane: 1, beat: beat(4), endBeat: beat(8) },
      ],
      trillZones: [],
      messages: [],
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
      messages: [
        { beat: beat(0), endBeat: beat(4), text: "A" },
        { beat: beat(2), endBeat: beat(6), text: "B" }, // overlap
      ],
    });
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});
