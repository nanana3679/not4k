import { describe, it, expect } from "vitest";
import { hitTestNoteAt, hitTestExtraNoteAt, noteExistsAtSnap, extraNoteExistsAtSnap } from "./hitTest";
import { beat } from "../../shared";
import type { NoteEntity, ExtraNoteEntity } from "../../shared";

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
