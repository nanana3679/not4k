import { describe, it, expect } from "vitest";
import { hiddenViolationLanes } from "./unifiedNotes";
import { beat } from "../../shared";
import type { NoteEntity, ValidationError } from "../../shared";

describe("hiddenViolationLanes (§8-7 숨은 보조 위반 안내)", () => {
  const err = (indices: number[]): ValidationError => ({
    rule: "duplicate",
    message: "dup",
    refs: indices.map((index) => ({ kind: "note" as const, index })),
  });

  it("extraLaneCount 1에서 lane 6(보조 2) 위반 노트 → [6] (숨은 레인)", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 6, beat: beat(0) },
      { type: "single", lane: 6, beat: beat(0) },
    ];
    expect(hiddenViolationLanes([err([0, 1])], notes, 1)).toEqual([6]);
  });

  it("extraLaneCount 2에서 lane 6 위반은 보이는 레인 — 빈 목록", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 6, beat: beat(0) },
      { type: "single", lane: 6, beat: beat(0) },
    ];
    expect(hiddenViolationLanes([err([0, 1])], notes, 2)).toEqual([]);
  });

  it("메인 레인 위반은 extraLaneCount 0이어도 항상 보임 — 빈 목록", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 2, beat: beat(0) },
      { type: "single", lane: 2, beat: beat(0) },
    ];
    expect(hiddenViolationLanes([err([0, 1])], notes, 0)).toEqual([]);
  });

  it("숨은 레인 6·8이 섞이면 오름차순 [6, 8], 중복 제거", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 8, beat: beat(0) },
      { type: "single", lane: 8, beat: beat(0) },
      { type: "single", lane: 6, beat: beat(1) },
      { type: "single", lane: 6, beat: beat(1) },
    ];
    expect(hiddenViolationLanes([err([0, 1]), err([2, 3])], notes, 1)).toEqual([6, 8]);
  });

  it("refs 없는 위반은 무시", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 7, beat: beat(0) }];
    expect(hiddenViolationLanes([{ rule: "duplicate", message: "no refs" }], notes, 0)).toEqual([]);
  });
});
