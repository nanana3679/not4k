import { describe, expect, it } from "vitest";
import { beat, type NoteEntity } from "../shared";
import {
  auxSelectionIndexToNoteIndex,
  noteIndexToAuxSelectionIndex,
  projectAuxNotes,
  replaceAuxNotes,
  splitNoteViolationIndices,
} from "./auxNoteProjection";

const interleaved: NoteEntity[] = [
  { type: "single", lane: 1, beat: beat(0) },
  { type: "single", lane: 5, beat: beat(1) },
  { type: "single", lane: 2, beat: beat(2) },
  { type: "single", lane: 7, beat: beat(3) },
];

describe("보조 노트 투영", () => {
  it("메인·보조 노트가 교차해도 projectAuxNotes는 lane=5,7 순서를 유지", () => {
    expect(projectAuxNotes(interleaved).map((note) => note.lane)).toEqual([5, 7]);
  });

  it("보조 노트 2개를 교체해도 메인 노트의 전역 index 0,2를 유지", () => {
    const replaced = replaceAuxNotes(interleaved, [
      { type: "single", lane: 6, beat: beat(4) },
      { type: "single", lane: 8, beat: beat(5) },
    ]);

    expect(replaced.map((note) => note.lane)).toEqual([1, 6, 2, 8]);
    expect(replaced[0]).toBe(interleaved[0]);
    expect(replaced[2]).toBe(interleaved[2]);
  });

  it("보조 노트를 한 개 추가하면 기존 전역 순서를 보존하고 끝에 추가", () => {
    const replaced = replaceAuxNotes(interleaved, [
      ...projectAuxNotes(interleaved),
      { type: "single", lane: 8, beat: beat(4) },
    ]);

    expect(replaced.map((note) => note.lane)).toEqual([1, 5, 2, 7, 8]);
  });

  it("전역 note index 3과 보조 투영 index 1은 서로 왕복", () => {
    expect(auxSelectionIndexToNoteIndex(interleaved, 1)).toBe(3);
    expect(noteIndexToAuxSelectionIndex(interleaved, 3)).toBe(1);
  });

  it("메인 note index 2와 범위 밖 보조 index 2는 변환 불가", () => {
    expect(noteIndexToAuxSelectionIndex(interleaved, 2)).toBeNull();
    expect(auxSelectionIndexToNoteIndex(interleaved, 2)).toBeNull();
  });

  it("전역 위반 index 0,3은 메인 index 0과 보조 투영 index 1로 분리", () => {
    expect(splitNoteViolationIndices(interleaved, new Set([0, 3]))).toEqual({
      main: new Set([0]),
      aux: new Set([1]),
    });
  });
});
