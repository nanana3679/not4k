import { describe, it, expect } from "vitest";
import { decideJudgmentEffects, noteDisplayEffect } from "./judgmentEffects";
import type { JudgmentResult } from "./JudgmentEngine";
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

describe("decideJudgmentEffects", () => {
  it("비-miss 싱글(deltaMs=12) → 점수에 deltaMs 반영 + bomb 레인 1 + debug 기록", () => {
    const fx = decideJudgmentEffects(result({ grade: JudgmentGrade.GREAT, deltaMs: 12 }), single);
    expect(fx.noteIndex).toBe(0);
    expect(fx.scoreRecord).toEqual({ grade: JudgmentGrade.GREAT, deltaMs: 12 });
    expect(fx.judgmentText).toEqual({ grade: JudgmentGrade.GREAT, deltaMs: 12 });
    expect(fx.bomb).toBe(1);
    expect(fx.noteDisplay).toEqual({ body: null, visibility: "processed" });
    expect(fx.debug).toEqual({
      grade: JudgmentGrade.GREAT,
      deltaMs: 12,
      doubleSubIndex: undefined,
      isBody: false,
    });
  });

  it("비-miss 롱노트 바디(끝점) → 점수에서 deltaMs 생략, 표시엔 유지, debug는 isBody=true로 기록", () => {
    // 바디 끝점(connection/termination)도 디버그에 기록한다 — 홀드 트릴 체인·릴리즈 검증용.
    const fx = decideJudgmentEffects(result({ grade: JudgmentGrade.PERFECT, deltaMs: 5 }), long);
    expect(fx.scoreRecord).toEqual({ grade: JudgmentGrade.PERFECT });
    expect(fx.judgmentText).toEqual({ grade: JudgmentGrade.PERFECT, deltaMs: 5 });
    expect(fx.bomb).toBe(1);
    expect(fx.debug).toEqual({
      grade: JudgmentGrade.PERFECT,
      deltaMs: 5,
      doubleSubIndex: undefined,
      isBody: true,
    });
  });

  it("miss 싱글 → bomb 없음 + 미스 표시 + 바디 실패 표시", () => {
    const fx = decideJudgmentEffects(result({ grade: JudgmentGrade.MISS }), single);
    expect(fx.bomb).toBeNull();
    expect(fx.noteDisplay).toEqual({ body: "failed", visibility: "missed" });
  });

  it("더블 롱노트 부분 실패(right) → bomb 없음 + 부분실패 표시 + 가시성 변화 없음 + 점수는 miss(deltaMs 생략)", () => {
    const fx = decideJudgmentEffects(
      result({ grade: JudgmentGrade.MISS, isPartialBodyFail: true, failedSide: "right" }),
      long,
    );
    expect(fx.bomb).toBeNull();
    expect(fx.scoreRecord).toEqual({ grade: JudgmentGrade.MISS });
    expect(fx.noteDisplay).toEqual({ body: { partialFailed: "right" }, visibility: "unchanged" });
  });

  it("더블 노트 첫 입력(subIndex 0) → debug에 doubleSubIndex 0 운반 + 더블 부분 표시", () => {
    const fx = decideJudgmentEffects(result({ grade: JudgmentGrade.PERFECT, subIndex: 0 }), double);
    expect(fx.debug?.doubleSubIndex).toBe(0);
    expect(fx.noteDisplay.visibility).toBe("doublePartial");
  });
});
