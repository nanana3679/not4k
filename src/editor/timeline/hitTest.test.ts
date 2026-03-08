import { describe, it, expect } from "vitest";
import { hitTestNoteAt, hitTestExtraNoteAt, noteExistsAtSnap, extraNoteExistsAtSnap, hitTestRangeNoteRegion } from "./hitTest";
import { beat } from "../../shared";
import type { NoteEntity, ExtraNoteEntity, RangeNote } from "../../shared";

// ---------------------------------------------------------------------------
// hitTestNoteAt
// ---------------------------------------------------------------------------

describe("hitTestNoteAt", () => {
  const notes: NoteEntity[] = [
    { type: "single", lane: 1 as 1, beat: beat(0) },           // index 0: beat 0
    { type: "single", lane: 2 as 2, beat: beat(1) },           // index 1: beat 1
    { type: "single", lane: 1 as 1, beat: beat(3, 16) },       // index 2: beat 3/16 (non-snap position)
    { type: "long", lane: 3 as 3, beat: beat(2), endBeat: beat(4) }, // index 3: range 2~4
  ];

  it("포인트 노트의 정확한 위치에서 히트", () => {
    expect(hitTestNoteAt(notes, 1, 0)).toBe(0);
    expect(hitTestNoteAt(notes, 2, 1)).toBe(1);
  });

  it("포인트 노트 tolerance(1/16) 이내에서 히트", () => {
    // 3/16 = 0.1875, tolerance = 1/16 = 0.0625
    // 0.1875 + 0.06 = 0.2475 → within tolerance
    expect(hitTestNoteAt(notes, 1, 0.2475)).toBe(2);
  });

  it("포인트 노트 tolerance 밖이면 미스", () => {
    // 0 + 0.07 > 1/16 tolerance
    expect(hitTestNoteAt(notes, 1, 0.07)).toBeNull();
  });

  it("다른 레인의 노트는 히트하지 않음", () => {
    expect(hitTestNoteAt(notes, 2, 0)).toBeNull();
    expect(hitTestNoteAt(notes, 1, 1)).toBeNull();
  });

  it("레인지 노트 범위 안에서 히트", () => {
    expect(hitTestNoteAt(notes, 3, 2)).toBe(3);
    expect(hitTestNoteAt(notes, 3, 3)).toBe(3);
    expect(hitTestNoteAt(notes, 3, 4)).toBe(3);
  });

  it("레인지 노트 범위 밖이면 미스 (tolerance 포함)", () => {
    // 2 - 1/16 - 0.01 = 1.9275 → tolerance 밖
    expect(hitTestNoteAt(notes, 3, 1.92)).toBeNull();
    // 4 + 1/16 + 0.01 = 4.0725 → tolerance 밖
    expect(hitTestNoteAt(notes, 3, 4.08)).toBeNull();
  });

  it("snap=1/4에서도 1/16 위치 노트를 정확히 히트 (snap 독립)", () => {
    // beat 3/16 = 0.1875 — snap 1/4에서 가장 가까운 grid는 0 or 0.25
    // raw beat 0.1875로 hitTest하면 index 2를 히트해야 함
    expect(hitTestNoteAt(notes, 1, 3 / 16)).toBe(2);
  });

  it("길이 0인 롱노트도 tolerance 이내에서 히트", () => {
    const zeroLengthNotes: NoteEntity[] = [
      { type: "long", lane: 1 as 1, beat: beat(2), endBeat: beat(2) },
    ];
    expect(hitTestNoteAt(zeroLengthNotes, 1, 2)).toBe(0);
    expect(hitTestNoteAt(zeroLengthNotes, 1, 2.05)).toBe(0);
    expect(hitTestNoteAt(zeroLengthNotes, 1, 1.95)).toBe(0);
    // tolerance 밖
    expect(hitTestNoteAt(zeroLengthNotes, 1, 2.08)).toBeNull();
  });

  it("빈 레인에서 미스", () => {
    expect(hitTestNoteAt(notes, 4, 0)).toBeNull();
  });

  it("빈 노트 배열에서 미스", () => {
    expect(hitTestNoteAt([], 1, 0)).toBeNull();
  });

  it("커스텀 tolerance 적용", () => {
    // beat 0, tolerance 0.01 → 0.005 is within
    expect(hitTestNoteAt(notes, 1, 0.005, 0.01)).toBe(0);
    // 0.02 is outside 0.01 tolerance
    expect(hitTestNoteAt(notes, 1, 0.02, 0.01)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hitTestNoteAt — selectedNotes 우선순위
// ---------------------------------------------------------------------------

describe("hitTestNoteAt selectedNotes 우선순위", () => {
  // 롱노트 A: beat=0~4, 롱노트 B: beat=4~8, 같은 레인
  const sharedNotes: NoteEntity[] = [
    { type: "long", lane: 1 as 1, beat: beat(0), endBeat: beat(4) },  // index 0
    { type: "long", lane: 1 as 1, beat: beat(4), endBeat: beat(8) },  // index 1
  ];

  it("selectedNotes 없으면 공유 endpoint에서 먼저 발견된 노트 반환 (기존 동작)", () => {
    // 둘 다 히트, 같은 z-order(strictly >) → 먼저 발견된 index 0
    expect(hitTestNoteAt(sharedNotes, 1, 4)).toBe(0);
  });

  it("selectedNotes에 첫 번째 롱노트가 있으면 공유 endpoint에서 첫 번째 반환", () => {
    const selected = new Set([0]);
    expect(hitTestNoteAt(sharedNotes, 1, 4, undefined, selected)).toBe(0);
  });

  it("selectedNotes에 두 번째 롱노트가 있으면 공유 endpoint에서 두 번째 반환", () => {
    const selected = new Set([1]);
    expect(hitTestNoteAt(sharedNotes, 1, 4, undefined, selected)).toBe(1);
  });

  it("selectedNotes가 비어 있으면 기존 동작과 동일", () => {
    const selected = new Set<number>();
    expect(hitTestNoteAt(sharedNotes, 1, 4, undefined, selected)).toBe(0);
  });

  it("선택 우선순위가 z-order보다 높음", () => {
    // single(z=2)과 long(z=1)이 겹칠 때, long이 선택되어 있으면 long 우선
    const mixed: NoteEntity[] = [
      { type: "long", lane: 1 as 1, beat: beat(0), endBeat: beat(4) },  // index 0, z=1
      { type: "single", lane: 1 as 1, beat: beat(4) },                  // index 1, z=2
    ];
    // 선택 없으면 single(z=2) 우선
    expect(hitTestNoteAt(mixed, 1, 4)).toBe(1);
    // long이 선택되면 long(z=1+bonus) 우선
    const selected = new Set([0]);
    expect(hitTestNoteAt(mixed, 1, 4, undefined, selected)).toBe(0);
  });

  it("겹치지 않는 위치에서는 selectedNotes와 무관하게 정상 히트", () => {
    const selected = new Set([0]);
    // beat=2는 롱노트 A만 히트
    expect(hitTestNoteAt(sharedNotes, 1, 2, undefined, selected)).toBe(0);
    // beat=6는 롱노트 B만 히트
    expect(hitTestNoteAt(sharedNotes, 1, 6, undefined, selected)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// hitTestExtraNoteAt
// ---------------------------------------------------------------------------

describe("hitTestExtraNoteAt", () => {
  const extraNotes: ExtraNoteEntity[] = [
    { type: "single", extraLane: 1, beat: beat(2) },
    { type: "long", extraLane: 2, beat: beat(1), endBeat: beat(3) },
  ];

  it("포인트 extra 노트 히트", () => {
    expect(hitTestExtraNoteAt(extraNotes, 1, 2)).toBe(0);
  });

  it("레인지 extra 노트 범위 안에서 히트", () => {
    expect(hitTestExtraNoteAt(extraNotes, 2, 1.5)).toBe(1);
    expect(hitTestExtraNoteAt(extraNotes, 2, 3)).toBe(1);
  });

  it("다른 extra 레인은 미스", () => {
    expect(hitTestExtraNoteAt(extraNotes, 1, 1.5)).toBeNull();
    expect(hitTestExtraNoteAt(extraNotes, 3, 2)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// noteExistsAtSnap
// ---------------------------------------------------------------------------

describe("noteExistsAtSnap", () => {
  const notes: NoteEntity[] = [
    { type: "single", lane: 1 as 1, beat: beat(1) },            // beat 1.0
    { type: "single", lane: 1 as 1, beat: beat(3, 16) },        // beat 0.1875
    { type: "long", lane: 2 as 2, beat: beat(0), endBeat: beat(2) },
  ];

  it("snap 위치와 노트가 정확히 일치하면 히트", () => {
    expect(noteExistsAtSnap(notes, 1, 1.0)).toBe(0);
  });

  it("snap 위치와 노트가 1/32 이상 차이나면 미스", () => {
    // 3/16 = 0.1875, snapped to 0.25 (1/4)
    // |0.25 - 0.1875| = 0.0625 > 1/32(0.03125) → miss
    expect(noteExistsAtSnap(notes, 1, 0.25)).toBeNull();
  });

  it("레인지 노트의 범위 안 snap 위치면 히트", () => {
    expect(noteExistsAtSnap(notes, 2, 0.5)).toBe(2);
    expect(noteExistsAtSnap(notes, 2, 1.0)).toBe(2);
  });

  it("레인지 노트 범위 밖 snap 위치면 미스", () => {
    expect(noteExistsAtSnap(notes, 2, 2.5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extraNoteExistsAtSnap
// ---------------------------------------------------------------------------

describe("extraNoteExistsAtSnap", () => {
  const extraNotes: ExtraNoteEntity[] = [
    { type: "single", extraLane: 1, beat: beat(4) },
  ];

  it("snap 위치와 extra 노트가 일치하면 히트", () => {
    expect(extraNoteExistsAtSnap(extraNotes, 1, 4.0)).toBe(0);
  });

  it("snap 위치와 extra 노트가 다르면 미스", () => {
    expect(extraNoteExistsAtSnap(extraNotes, 1, 4.05)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hitTestRangeNoteRegion
// ---------------------------------------------------------------------------

describe("hitTestRangeNoteRegion", () => {
  const rangeNote: RangeNote = {
    type: "long",
    lane: 1 as 1,
    beat: beat(2),    // startBeat = 2.0
    endBeat: beat(6), // endBeat = 6.0
  };

  it("시작점(beat=2) 정확한 위치에서 head 반환", () => {
    expect(hitTestRangeNoteRegion(rangeNote, 2.0)).toBe("head");
  });

  it("시작점 tolerance(1/16) 이내에서 head 반환", () => {
    expect(hitTestRangeNoteRegion(rangeNote, 2.05)).toBe("head");
    expect(hitTestRangeNoteRegion(rangeNote, 1.95)).toBe("head");
  });

  it("끝점(beat=6) 정확한 위치에서 end 반환", () => {
    expect(hitTestRangeNoteRegion(rangeNote, 6.0)).toBe("end");
  });

  it("끝점 tolerance(1/16) 이내에서 end 반환", () => {
    expect(hitTestRangeNoteRegion(rangeNote, 5.95)).toBe("end");
    expect(hitTestRangeNoteRegion(rangeNote, 6.05)).toBe("end");
  });

  it("시작점과 끝점 사이 중간 위치에서 body 반환", () => {
    expect(hitTestRangeNoteRegion(rangeNote, 3.0)).toBe("body");
    expect(hitTestRangeNoteRegion(rangeNote, 4.0)).toBe("body");
    expect(hitTestRangeNoteRegion(rangeNote, 5.0)).toBe("body");
  });

  it("tolerance 직후 바디 영역에서 body 반환", () => {
    // 2 + 1/16 + 약간 = 2.07 → head tolerance 밖, body 영역
    expect(hitTestRangeNoteRegion(rangeNote, 2.07)).toBe("body");
    // 6 - 1/16 - 약간 = 5.93 → end tolerance 밖, body 영역
    expect(hitTestRangeNoteRegion(rangeNote, 5.93)).toBe("body");
  });

  it("범위 밖이면 null 반환", () => {
    expect(hitTestRangeNoteRegion(rangeNote, 1.9)).toBeNull();
    expect(hitTestRangeNoteRegion(rangeNote, 6.1)).toBeNull();
  });

  it("짧은 롱노트에서 head/end 영역 겹칠 때 가까운 쪽 반환", () => {
    const shortNote: RangeNote = {
      type: "long",
      lane: 1 as 1,
      beat: beat(4),
      endBeat: beat(33, 8), // 4.125 — head/end tolerance 영역 겹침
    };
    // 정확히 시작점에서 → head
    expect(hitTestRangeNoteRegion(shortNote, 4.0)).toBe("head");
    // 정확히 끝점에서 → end
    expect(hitTestRangeNoteRegion(shortNote, 4.125)).toBe("end");
    // 중간 지점 (4.0625) → 둘 다 tolerance 이내, 거리 같음 → head 우선
    expect(hitTestRangeNoteRegion(shortNote, 4.0625)).toBe("head");
    // 중간보다 끝에 가까움 → end
    expect(hitTestRangeNoteRegion(shortNote, 4.07)).toBe("end");
  });

  it("길이 0인 롱노트에서 정확한 위치는 head 반환", () => {
    const zeroNote: RangeNote = {
      type: "long",
      lane: 1 as 1,
      beat: beat(3),
      endBeat: beat(3),
    };
    expect(hitTestRangeNoteRegion(zeroNote, 3.0)).toBe("head");
  });

  it("커스텀 tolerance 적용", () => {
    // tolerance=0.5 → 2.4는 head 영역
    expect(hitTestRangeNoteRegion(rangeNote, 2.4, 0.5)).toBe("head");
    // tolerance=0.01 → 2.02는 head 밖
    expect(hitTestRangeNoteRegion(rangeNote, 2.02, 0.01)).toBe("body");
  });
});
