/**
 * 판정 모드
 */
export const JudgmentMode = {
  NORMAL: "normal",
  EASY: "easy",
} as const;

export type JudgmentMode =
  (typeof JudgmentMode)[keyof typeof JudgmentMode];

/**
 * 판정 윈도우 타입
 */
export interface JudgmentWindows {
  readonly PERFECT: number;
  readonly GREAT: number;
  readonly GOOD: number;
  readonly BAD: number;
}

/**
 * 판정 윈도우 (ms) — scoring.md 기준
 *
 * 노트 기준 시점으로부터 입력이 허용되는 ± 범위.
 */
export const JUDGMENT_WINDOWS: JudgmentWindows = {
  PERFECT: 41,
  GREAT: 82,
  GOOD: 120,
  BAD: 160,
} as const;

/**
 * 쉬운 판정 윈도우 (ms) — maimai DX Tap 기준
 *
 * maimai 판정: Perfect ±50ms, Great ±100ms, Good ±150ms.
 * BAD는 maimai에 없으므로 Good 기반으로 확장 (±200ms).
 */
export const JUDGMENT_WINDOWS_EASY: JudgmentWindows = {
  PERFECT: 50,
  GREAT: 100,
  GOOD: 150,
  BAD: 200,
} as const;

/**
 * 판정 모드에 따른 윈도우 반환
 */
export function getJudgmentWindows(mode: JudgmentMode): JudgmentWindows {
  return mode === JudgmentMode.EASY ? JUDGMENT_WINDOWS_EASY : JUDGMENT_WINDOWS;
}

/**
 * 바디 유지 판정 grace period (ms)
 *
 * 키를 잠깐 떼었다 다시 눌러도 유지로 인정하는 허용 시간.
 */
export const GRACE_PERIOD_MS = 12;

/**
 * 판정 등급
 */
export const JudgmentGrade = {
  PERFECT: "perfect",
  GREAT: "great",
  GOOD: "good",
  /** 트릴 교대 실패 — 일반 Good과 별도 집계 (1점) */
  GOOD_TRILL: "goodTrill",
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
  [JudgmentGrade.GOOD_TRILL]: 1,
  [JudgmentGrade.BAD]: 0,
  [JudgmentGrade.MISS]: 0,
};
