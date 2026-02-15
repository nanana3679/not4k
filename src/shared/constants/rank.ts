/**
 * 랭크 시스템 — scoring.md 기준
 *
 * 달성률 단일 기준으로 산출. 게이지 없음, 무조건 완주.
 */

export const Rank = {
  SSS: "SSS",
  SS: "SS",
  S: "S",
  AAA: "AAA",
  AA: "AA",
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  F: "F",
} as const;

export type Rank = (typeof Rank)[keyof typeof Rank];

/**
 * 랭크별 달성률 임계값 (%). 내림차순 정렬.
 * 달성률 >= threshold 이면 해당 랭크.
 */
export const RANK_THRESHOLDS: ReadonlyArray<{
  rank: Rank;
  threshold: number;
}> = [
  { rank: Rank.SSS, threshold: 99.5 },
  { rank: Rank.SS, threshold: 99.0 },
  { rank: Rank.S, threshold: 97.0 },
  { rank: Rank.AAA, threshold: 95.0 },
  { rank: Rank.AA, threshold: 90.0 },
  { rank: Rank.A, threshold: 85.0 },
  { rank: Rank.B, threshold: 80.0 },
  { rank: Rank.C, threshold: 70.0 },
  { rank: Rank.D, threshold: 60.0 },
];

/** 달성률로 랭크를 산출한다 */
export function getRank(achievementRate: number): Rank {
  for (const { rank, threshold } of RANK_THRESHOLDS) {
    if (achievementRate >= threshold) return rank;
  }
  return Rank.F;
}
