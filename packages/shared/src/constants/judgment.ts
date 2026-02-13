/**
 * 판정 윈도우 (ms) — scoring.md 기준
 *
 * 노트 기준 시점으로부터 입력이 허용되는 ± 범위.
 */
export const JUDGMENT_WINDOWS = {
  PERFECT: 41,
  GREAT: 82,
  GOOD: 120,
  BAD: 160,
} as const;

/**
 * 판정 등급
 */
export const JudgmentGrade = {
  PERFECT: "perfect",
  GREAT: "great",
  GOOD: "good",
  BAD: "bad",
  MISS: "miss",
} as const;

export type JudgmentGrade =
  (typeof JudgmentGrade)[keyof typeof JudgmentGrade];

/**
 * 판정 등급별 점수 — scoring.md 기준
 */
export const JUDGMENT_SCORES: Record<JudgmentGrade, number> = {
  [JudgmentGrade.PERFECT]: 3,
  [JudgmentGrade.GREAT]: 2,
  [JudgmentGrade.GOOD]: 1,
  [JudgmentGrade.BAD]: 0,
  [JudgmentGrade.MISS]: 0,
};
