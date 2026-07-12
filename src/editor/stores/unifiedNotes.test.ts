import { describe, it, expect } from "vitest";
import { unifiedNotes, extraToNote, splitViolationNoteIndices } from "./unifiedNotes";
import { beat } from "../../shared";
import type { NoteEntity, ExtraNoteEntity } from "../../shared";

const mainA: NoteEntity = { type: "single", lane: 1, beat: beat(0) };
const mainB: NoteEntity = { type: "long", lane: 4, beat: beat(1), endBeat: beat(2) };
const extraP: ExtraNoteEntity = { type: "single", extraLane: 1, beat: beat(0) };
const extraR: ExtraNoteEntity = { type: "doubleLong", extraLane: 3, beat: beat(2), endBeat: beat(4) };

describe("extraToNote", () => {
  it("extraLane 1 포인트 노트 → lane 5 NoteEntity로 변환, extraLane 필드는 남지 않음", () => {
    const converted = extraToNote(extraP);
    expect(converted).toEqual({ type: "single", lane: 5, beat: beat(0) });
    expect("extraLane" in converted).toBe(false);
  });

  it("extraLane 3 구간 노트 → lane 7, endBeat 보존", () => {
    expect(extraToNote(extraR)).toEqual({
      type: "doubleLong",
      lane: 7,
      beat: beat(2),
      endBeat: beat(4),
    });
  });
});

describe("unifiedNotes", () => {
  it("메인 노트는 인덱스 그대로 0..n-1, 보조는 n부터 순서 보존 append — unified[n+j] = extraNotes[j]", () => {
    const notes = [mainA, mainB];
    const extras = [extraP, extraR];

    const unified = unifiedNotes(notes, extras);

    expect(unified).toHaveLength(4);
    expect(unified[0]).toBe(mainA);
    expect(unified[1]).toBe(mainB);
    expect(unified[2]).toEqual({ type: "single", lane: 5, beat: beat(0) });
    expect(unified[3]).toEqual({ type: "doubleLong", lane: 7, beat: beat(2), endBeat: beat(4) });
  });

  it("보조 노트가 없으면 메인 노트만 담긴 배열", () => {
    expect(unifiedNotes([mainA], [])).toEqual([mainA]);
  });

  it("메인 노트가 없으면 보조 변환 결과만 — extraLane 2 → lane 6", () => {
    const extras: ExtraNoteEntity[] = [{ type: "trill", extraLane: 2, beat: beat(1) }];
    expect(unifiedNotes([], extras)).toEqual([{ type: "trill", lane: 6, beat: beat(1) }]);
  });

  it("같은 (notes, extraNotes) 참조쌍으로 두 번 호출하면 같은 배열 인스턴스 반환 (셀렉터 identity 안정)", () => {
    const notes = [mainA];
    const extras = [extraP];

    expect(unifiedNotes(notes, extras)).toBe(unifiedNotes(notes, extras));
  });

  it("notes 참조가 바뀌면 새 배열 인스턴스 반환", () => {
    const extras = [extraP];
    const first = unifiedNotes([mainA], extras);
    const second = unifiedNotes([mainA], extras); // 새 배열 리터럴 = 다른 참조

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const notes = [mainA];
    const extras = [extraP];
    unifiedNotes(notes, extras);

    expect(notes).toEqual([mainA]);
    expect(extras).toEqual([extraP]);
  });
});

describe("splitViolationNoteIndices", () => {
  it("mainCount=3일 때 {1, 3, 5} → main {1}, extra {0, 2} (통합 인덱스 → extraNotes 인덱스 번역)", () => {
    expect(splitViolationNoteIndices(new Set([1, 3, 5]), 3)).toEqual({
      main: new Set([1]),
      extra: new Set([0, 2]),
    });
  });

  it("전부 메인 범위(mainCount=4, {0, 3})면 extra는 빈 집합", () => {
    expect(splitViolationNoteIndices(new Set([0, 3]), 4)).toEqual({
      main: new Set([0, 3]),
      extra: new Set(),
    });
  });

  it("mainCount=0이면 전부 extra로 — 통합 인덱스가 그대로 extraNotes 인덱스", () => {
    expect(splitViolationNoteIndices(new Set([0, 2]), 0)).toEqual({
      main: new Set(),
      extra: new Set([0, 2]),
    });
  });

  it("빈 집합이면 양쪽 다 빈 집합", () => {
    expect(splitViolationNoteIndices(new Set(), 3)).toEqual({
      main: new Set(),
      extra: new Set(),
    });
  });
});
