/**
 * 고스트 노트 호버 동작 검증 테스트
 *
 * 변경 전: snap 위치에 노트가 있으면 고스트를 숨기고 해당 노트를 하이라이트
 * 변경 후: 커서가 노트에 직접 hover할 때만 하이라이트, 고스트는 항상 표시
 *
 * 이 테스트는 hitTestNoteAt(raw beat)과 noteExistsAtSnap(snapped beat)의
 * 동작 차이를 검증하여, 올바른 함수가 호버 판정에 사용되는지 확인한다.
 */

import { describe, it, expect } from "vitest";
import { hitTestNoteAt, hitTestExtraNoteAt, noteExistsAtSnap, extraNoteExistsAtSnap } from "./hitTest";
import type { NoteEntity, ExtraNoteEntity } from "../../shared/types";

/** beat fraction helper */
const beat = (n: number, d: number = 1) => ({ n, d });

// ---------------------------------------------------------------------------
// 메인 레인: raw beat vs snapped beat 호버 판정 차이
// ---------------------------------------------------------------------------

describe("고스트 노트 호버 — 메인 레인", () => {
  const notes: NoteEntity[] = [
    { type: "single", lane: 1 as 1, beat: beat(1) },  // beat 1.0
  ];

  it("커서가 노트 위에 직접 있으면 hitTestNoteAt으로 히트 (raw beat = 1.0)", () => {
    // 커서의 raw beat가 노트 위치와 같을 때 → 호버 하이라이트 해야 함
    expect(hitTestNoteAt(notes, 1, 1.0)).toBe(0);
  });

  it("커서가 노트에서 약간 떨어져도 tolerance(1/16) 이내이면 히트", () => {
    // raw beat 0.95 → |1.0 - 0.95| = 0.05 < 1/16(0.0625) → 히트
    expect(hitTestNoteAt(notes, 1, 0.95)).toBe(0);
  });

  it("커서가 노트에서 tolerance(1/16) 밖이면 미스 — 고스트만 표시", () => {
    // raw beat 0.9 → |1.0 - 0.9| = 0.1 > 1/16(0.0625) → 미스
    expect(hitTestNoteAt(notes, 1, 0.9)).toBeNull();
  });

  it("snap이 노트 위치로 스냅되어도 커서가 멀면 hitTestNoteAt은 미스 (핵심 동작 변경)", () => {
    // 예: snap=1/4, 커서 raw beat = 0.8, snap 결과 = 1.0
    // 변경 전: noteExistsAtSnap(notes, 1, 1.0) → 0 (히트, 고스트 숨김)
    // 변경 후: hitTestNoteAt(notes, 1, 0.8) → null (미스, 고스트 표시)
    const rawBeat = 0.8;
    const snappedBeat = 1.0;

    // 이전 방식: snap 위치 기준 → 노트 존재, 고스트 억제
    expect(noteExistsAtSnap(notes, 1, snappedBeat)).toBe(0);

    // 새 방식: raw 위치 기준 → 노트 미스, 고스트 표시
    expect(hitTestNoteAt(notes, 1, rawBeat)).toBeNull();
  });

  it("snap 위치에 노트가 있고 커서도 노트 위에 직접 있으면 둘 다 히트", () => {
    // raw beat = 1.02, snapped = 1.0
    const rawBeat = 1.02;
    const snappedBeat = 1.0;

    expect(noteExistsAtSnap(notes, 1, snappedBeat)).toBe(0);
    expect(hitTestNoteAt(notes, 1, rawBeat)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 엑스트라 레인: raw beat vs snapped beat 호버 판정 차이
// ---------------------------------------------------------------------------

describe("고스트 노트 호버 — 엑스트라 레인", () => {
  const extraNotes: ExtraNoteEntity[] = [
    { type: "single", extraLane: 1, beat: beat(2) },  // beat 2.0
  ];

  it("커서가 엑스트라 노트 위에 직접 있으면 hitTestExtraNoteAt으로 히트", () => {
    expect(hitTestExtraNoteAt(extraNotes, 1, 2.0)).toBe(0);
  });

  it("snap이 엑스트라 노트로 스냅되어도 커서가 멀면 hitTestExtraNoteAt은 미스", () => {
    const rawBeat = 1.7;
    const snappedBeat = 2.0;

    // 이전 방식: snap 기준 → 히트
    expect(extraNoteExistsAtSnap(extraNotes, 1, snappedBeat)).toBe(0);

    // 새 방식: raw 기준 → 미스
    expect(hitTestExtraNoteAt(extraNotes, 1, rawBeat)).toBeNull();
  });

  it("커서가 엑스트라 노트 tolerance 이내이면 히트", () => {
    // |2.0 - 1.96| = 0.04 < 1/16(0.0625) → 히트
    expect(hitTestExtraNoteAt(extraNotes, 1, 1.96)).toBe(0);
  });

  it("커서가 엑스트라 노트 tolerance 밖이면 미스", () => {
    // |2.0 - 1.93| = 0.07 > 1/16(0.0625) → 미스
    expect(hitTestExtraNoteAt(extraNotes, 1, 1.93)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 롱노트: raw beat 호버 판정
// ---------------------------------------------------------------------------

describe("고스트 노트 호버 — 롱노트 범위", () => {
  const notes: NoteEntity[] = [
    { type: "long", lane: 2 as 2, beat: beat(4), endBeat: beat(8) },
  ];

  it("커서가 롱노트 범위 안에 있으면 히트", () => {
    expect(hitTestNoteAt(notes, 2, 5.0)).toBe(0);
    expect(hitTestNoteAt(notes, 2, 6.5)).toBe(0);
  });

  it("커서가 롱노트 시작 직전이라도 tolerance 이내면 히트", () => {
    // 4.0 - 0.05 = 3.95, tolerance 1/16 = 0.0625
    expect(hitTestNoteAt(notes, 2, 3.95)).toBe(0);
  });

  it("커서가 롱노트 범위 밖이면 미스 — snap이 범위 안으로 스냅되어도 무관", () => {
    const rawBeat = 3.5;  // 롱노트 범위 밖
    const snappedBeat = 4.0;  // snap이 롱노트 시작점으로 스냅

    // 이전 방식: snap 기준 → 히트
    expect(noteExistsAtSnap(notes, 2, snappedBeat)).toBe(0);

    // 새 방식: raw 기준 → 미스
    expect(hitTestNoteAt(notes, 2, rawBeat)).toBeNull();
  });
});
