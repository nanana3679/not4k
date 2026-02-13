import {
  JudgmentGrade,
  JUDGMENT_SCORES,
  Rank,
  getRank,
} from "@not4k/shared";

export interface ScoreState {
  totalNotes: number; // total judgment count (each judgment = 1)
  maxPossibleScore: number; // totalNotes * 3 (all Perfect)
  earnedScore: number; // sum of judgment scores
  achievementRate: number; // (earnedScore / maxPossibleScore) * 100, or 0 if no notes
  rank: Rank; // computed from achievementRate
  combo: number;
  maxCombo: number;
  isFullCombo: boolean; // no Bad or Miss
  judgmentCounts: Record<JudgmentGrade, number>; // per-grade count
  goodTrillCount: number; // separate GOOD_TRILL count (also in judgmentCounts)
}

export class ScoreManager {
  private totalNotes: number;
  private earnedScore: number;
  private combo: number;
  private maxCombo: number;
  private hasBadOrMiss: boolean;
  private judgmentCounts: Record<JudgmentGrade, number>;

  constructor(totalJudgmentCount: number) {
    this.totalNotes = totalJudgmentCount;
    this.earnedScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hasBadOrMiss = false;
    this.judgmentCounts = {
      [JudgmentGrade.PERFECT]: 0,
      [JudgmentGrade.GREAT]: 0,
      [JudgmentGrade.GOOD]: 0,
      [JudgmentGrade.GOOD_TRILL]: 0,
      [JudgmentGrade.BAD]: 0,
      [JudgmentGrade.MISS]: 0,
    };
  }

  /** Record a judgment result */
  recordJudgment(grade: JudgmentGrade): void {
    // Update score
    this.earnedScore += JUDGMENT_SCORES[grade];

    // Update judgment counts
    this.judgmentCounts[grade]++;

    // Update combo
    if (
      grade === JudgmentGrade.PERFECT ||
      grade === JudgmentGrade.GREAT ||
      grade === JudgmentGrade.GOOD ||
      grade === JudgmentGrade.GOOD_TRILL
    ) {
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
    } else {
      // Bad or Miss
      this.combo = 0;
      this.hasBadOrMiss = true;
    }
  }

  /** Get current scoring state (read-only snapshot) */
  getState(): Readonly<ScoreState> {
    const maxPossibleScore = this.totalNotes * 3;
    const achievementRate =
      maxPossibleScore > 0 ? (this.earnedScore / maxPossibleScore) * 100 : 0;

    return {
      totalNotes: this.totalNotes,
      maxPossibleScore,
      earnedScore: this.earnedScore,
      achievementRate,
      rank: getRank(achievementRate),
      combo: this.combo,
      maxCombo: this.maxCombo,
      isFullCombo: !this.hasBadOrMiss,
      judgmentCounts: { ...this.judgmentCounts },
      goodTrillCount: this.judgmentCounts[JudgmentGrade.GOOD_TRILL],
    };
  }

  /** Reset all state */
  reset(totalJudgmentCount: number): void {
    this.totalNotes = totalJudgmentCount;
    this.earnedScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hasBadOrMiss = false;
    this.judgmentCounts = {
      [JudgmentGrade.PERFECT]: 0,
      [JudgmentGrade.GREAT]: 0,
      [JudgmentGrade.GOOD]: 0,
      [JudgmentGrade.GOOD_TRILL]: 0,
      [JudgmentGrade.BAD]: 0,
      [JudgmentGrade.MISS]: 0,
    };
  }
}
