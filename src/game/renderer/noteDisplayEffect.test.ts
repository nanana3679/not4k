import { describe, it, expect } from "vitest";
import { noteDisplayEffect } from "./noteDisplayEffect";
import type { JudgmentResult } from "../judgment/JudgmentEngine";
import { JudgmentGrade, NoteType } from "../../shared/constants";
import { beat } from "../../shared/types/beat";
import type { NoteEntity } from "../../shared/types/chart";

const single: NoteEntity = { type: NoteType.SINGLE, lane: 1, beat: beat(0, 1) } as NoteEntity;
const long: NoteEntity = { type: NoteType.LONG, lane: 1, beat: beat(0, 1), endBeat: beat(4, 1) } as NoteEntity;
const double: NoteEntity = { type: NoteType.DOUBLE, lane: 1, beat: beat(0, 1) } as NoteEntity;

function result(over: Partial<JudgmentResult>): JudgmentResult {
  return { noteIndex: 0, grade: JudgmentGrade.PERFECT, deltaMs: 0, ...over };
}

describe("noteDisplayEffect", () => {
  it("비-miss 포인트 노트 → 처리됨, 바디 표시 없음", () => {
    expect(noteDisplayEffect(result({ grade: JudgmentGrade.PERFECT }), single)).toEqual({
      body: null,
      visibility: "processed",
    });
  });

  it("비-miss 롱노트 바디 → 처리됨, 바디 표시 없음", () => {
    expect(noteDisplayEffect(result({ grade: JudgmentGrade.GREAT }), long)).toEqual({
      body: null,
      visibility: "processed",
    });
  });

  it("miss 포인트 노트 → 미스 + 바디 실패 표시", () => {
    expect(noteDisplayEffect(result({ grade: JudgmentGrade.MISS }), single)).toEqual({
      body: "failed",
      visibility: "missed",
    });
  });

  it("miss 롱노트 바디 → 미스 + 바디 실패 표시", () => {
    expect(noteDisplayEffect(result({ grade: JudgmentGrade.MISS }), long)).toEqual({
      body: "failed",
      visibility: "missed",
    });
  });

  it("더블 롱노트 부분 실패(left) → 부분실패 표시, 가시성 변화 없음", () => {
    expect(
      noteDisplayEffect(result({ grade: JudgmentGrade.MISS, isPartialBodyFail: true, failedSide: "left" }), long),
    ).toEqual({
      body: { partialFailed: "left" },
      visibility: "unchanged",
    });
  });

  it("더블 노트 첫 입력(subIndex 0, 비-miss) → 더블 부분", () => {
    expect(noteDisplayEffect(result({ grade: JudgmentGrade.PERFECT, subIndex: 0 }), double)).toEqual({
      body: null,
      visibility: "doublePartial",
    });
  });

  it("더블 노트 둘째 입력(subIndex 1, 비-miss) → 처리됨", () => {
    expect(noteDisplayEffect(result({ grade: JudgmentGrade.PERFECT, subIndex: 1 }), double)).toEqual({
      body: null,
      visibility: "processed",
    });
  });
});
