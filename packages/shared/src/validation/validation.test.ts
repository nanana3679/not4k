import { describe, it, expect } from "vitest";
import {
  validateNoDuplicates,
  validateNoLongOverlap,
  validateTrillExclusive,
  validateNoMessageOverlap,
  validateChart,
} from "./index";
import { beat } from "../types/beat";
import type { NoteEntity, TrillZone, Message } from "../types/chart";

describe("validateNoDuplicates", () => {
  it("중복 없으면 에러 없음", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "single", lane: 1, beat: beat(1) },
      { type: "single", lane: 2, beat: beat(0) },
    ];
    expect(validateNoDuplicates(notes)).toEqual([]);
  });

  it("같은 레인·같은 박자에 중복이면 에러", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0) },
      { type: "double", lane: 1, beat: beat(0) },
    ];
    expect(validateNoDuplicates(notes)).toHaveLength(1);
    expect(validateNoDuplicates(notes)[0].rule).toBe("duplicate");
  });

  it("롱노트 끝점도 중복 체크 대상", () => {
    const notes: NoteEntity[] = [
      { type: "singleLongBody", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(4) }, // 끝점과 같은 위치
    ];
    expect(validateNoDuplicates(notes)).toHaveLength(1);
  });
});

describe("validateNoLongOverlap", () => {
  it("롱노트 바디 안에 다른 노트가 없으면 에러 없음", () => {
    const notes: NoteEntity[] = [
      { type: "singleLongBody", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(4) }, // 경계에 있음 → OK
      { type: "single", lane: 2, beat: beat(2) }, // 다른 레인 → OK
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });

  it("롱노트 바디 열린 구간 안에 노트가 있으면 에러", () => {
    const notes: NoteEntity[] = [
      { type: "singleLongBody", lane: 1, beat: beat(0), endBeat: beat(4) },
      { type: "single", lane: 1, beat: beat(2) }, // 열린 구간 내부
    ];
    const errors = validateNoLongOverlap(notes);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("longOverlap");
  });

  it("경계(시작점/끝점)는 허용 — o-o- 패턴", () => {
    const notes: NoteEntity[] = [
      { type: "singleLongBody", lane: 1, beat: beat(0), endBeat: beat(2) },
      { type: "singleLongBody", lane: 1, beat: beat(2), endBeat: beat(4) },
    ];
    expect(validateNoLongOverlap(notes)).toEqual([]);
  });
});

describe("validateTrillExclusive", () => {
  it("트릴 노트가 트릴 구간 안에 있으면 OK", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(0) },
      { type: "trill", lane: 1, beat: beat(1) },
    ];
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateTrillExclusive(notes, zones)).toEqual([]);
  });

  it("트릴 노트가 트릴 구간 밖이면 에러", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(5) },
    ];
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    const errors = validateTrillExclusive(notes, zones);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("trillExclusive");
  });

  it("비-트릴 노트가 트릴 구간 안이면 에러", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(2) },
    ];
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    const errors = validateTrillExclusive(notes, zones);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("trillExclusive");
  });

  it("다른 레인의 트릴 구간은 무관", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 2, beat: beat(2) },
    ];
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(4) },
    ];
    expect(validateTrillExclusive(notes, zones)).toEqual([]);
  });
});

describe("validateNoMessageOverlap", () => {
  it("겹치지 않으면 에러 없음", () => {
    const msgs: Message[] = [
      { beat: beat(0), endBeat: beat(4), text: "A" },
      { beat: beat(4), endBeat: beat(8), text: "B" }, // 끝-시작 인접 OK
    ];
    expect(validateNoMessageOverlap(msgs)).toEqual([]);
  });

  it("열린 구간이 겹치면 에러", () => {
    const msgs: Message[] = [
      { beat: beat(0), endBeat: beat(4), text: "A" },
      { beat: beat(2), endBeat: beat(6), text: "B" }, // 겹침
    ];
    const errors = validateNoMessageOverlap(msgs);
    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe("messageOverlap");
  });

  it("완전 포함도 에러", () => {
    const msgs: Message[] = [
      { beat: beat(0), endBeat: beat(8), text: "A" },
      { beat: beat(2), endBeat: beat(6), text: "B" }, // A 안에 완전 포함
    ];
    expect(validateNoMessageOverlap(msgs).length).toBeGreaterThan(0);
  });
});

describe("validateChart", () => {
  it("유효한 차트는 에러 없음", () => {
    const result = validateChart({
      notes: [
        { type: "single", lane: 1, beat: beat(0) },
        { type: "single", lane: 2, beat: beat(1) },
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
        { type: "single", lane: 1, beat: beat(0) }, // duplicate
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
