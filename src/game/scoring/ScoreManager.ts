import {
  JudgmentGrade,
  JUDGMENT_SCORES,
  JUDGMENT_WINDOWS,
  Rank,
  getRank,
} from "../../shared";

export interface ScoreState {
  totalNotes: number; // total judgment count (each judgment = 1)
  processedNotes: number; // judgments recorded so far
  maxPossibleScore: number; // totalNotes * 3 (all Perfect)
  earnedScore: number; // sum of judgment scores
  achievementRate: number; // (earnedScore / processedNotes*3) * 100, based on processed notes
  rank: Rank; // computed from achievementRate
  combo: number;
  maxCombo: number;
  isFullCombo: boolean; // no Bad or Miss
  judgmentCounts: Record<JudgmentGrade, number>; // per-grade count
  goodTrillCount: number; // separate GOOD_TRILL count (also in judgmentCounts)
  fastCount: number;
  slowCount: number;
}

export class ScoreManager {
  private totalNotes: number;
  private processedNotes: number;
  private earnedScore: number;
  private combo: number;
  private maxCombo: number;
  private hasBadOrMiss: boolean;
  private judgmentCounts: Record<JudgmentGrade, number>;
  private fastCount: number;
  private slowCount: number;

  constructor(totalJudgmentCount: number) {
    this.totalNotes = totalJudgmentCount;
    this.processedNotes = 0;
    this.earnedScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hasBadOrMiss = false;
    this.fastCount = 0;
    this.slowCount = 0;
    this.judgmentCounts = {
      [JudgmentGrade.PERFECT]: 0,
      [JudgmentGrade.GREAT]: 0,
      [JudgmentGrade.GOOD]: 0,
      [JudgmentGrade.GOOD_TRILL]: 0,
      [JudgmentGrade.BAD]: 0,
      [JudgmentGrade.MISS]: 0,
    };
  }

  /** Record a judgment result. deltaMs is optional — only passed for head judgments with user input. */
  recordJudgment(grade: JudgmentGrade, deltaMs?: number): void {
    // Update processed count and score
    this.processedNotes++;
    this.earnedScore += JUDGMENT_SCORES[grade];

    // Update judgment counts
    this.judgmentCounts[grade]++;

    // Track FAST/SLOW (only when deltaMs is provided, grade is not MISS,
    // and outside the inner half of Perfect window)
    const fastSlowThreshold = JUDGMENT_WINDOWS.PERFECT / 2;
    if (deltaMs != null && grade !== JudgmentGrade.MISS && Math.abs(deltaMs) > fastSlowThreshold) {
      if (deltaMs < 0) this.fastCount++;
      else if (deltaMs > 0) this.slowCount++;
    }

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
    const processedMaxScore = this.processedNotes * 3;
    const achievementRate =
      processedMaxScore > 0 ? (this.earnedScore / processedMaxScore) * 100 : 0;

    return {
      totalNotes: this.totalNotes,
      processedNotes: this.processedNotes,
      maxPossibleScore,
      earnedScore: this.earnedScore,
      achievementRate,
      rank: getRank(achievementRate),
      combo: this.combo,
      maxCombo: this.maxCombo,
      isFullCombo: !this.hasBadOrMiss,
      judgmentCounts: { ...this.judgmentCounts },
      goodTrillCount: this.judgmentCounts[JudgmentGrade.GOOD_TRILL],
      fastCount: this.fastCount,
      slowCount: this.slowCount,
    };
  }

  /** Reset all state */
  reset(totalJudgmentCount: number): void {
    this.totalNotes = totalJudgmentCount;
    this.processedNotes = 0;
    this.earnedScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hasBadOrMiss = false;
    this.fastCount = 0;
    this.slowCount = 0;
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
