import { JudgmentGrade, JUDGMENT_SCORES, JUDGMENT_WINDOWS, type JudgmentWindows, Rank, getRank } from "../../shared";

export type ScoreItemKind = "head" | "release" | "holdOnly";
export interface ScoreItem {
  readonly id: string; readonly noteIndex: number; readonly unitIndex: number;
  readonly kind: ScoreItemKind; readonly timeMs: number; readonly weight3: number;
}
export interface ScoreState {
  totalNotes: number; processedNotes: number; maxPossibleScore: number;
  earnedScore: number; achievementRate: number; rank: Rank; isFullCombo: boolean;
  judgmentCounts: Record<JudgmentGrade, number>; goodTrillCount: number;
  fastCount: number; slowCount: number; liveDenominatorWeight: number;
  finalDenominatorWeight: number;
}
function emptyJudgmentCounts(): Record<JudgmentGrade, number> {
  return { [JudgmentGrade.PERFECT]: 0, [JudgmentGrade.GREAT]: 0, [JudgmentGrade.GOOD]: 0,
    [JudgmentGrade.GOOD_TRILL]: 0, [JudgmentGrade.BAD]: 0, [JudgmentGrade.MISS]: 0 };
}

/** Score chart-defined items; numeric construction remains a legacy adapter. */
export class ScoreManager {
  private scoreItems: Map<string, ScoreItem> = new Map();
  private settledItems: Set<string> = new Set();
  private earnedScore = 0; private hasBadOrMiss = false;
  private judgmentCounts = emptyJudgmentCounts(); private fastCount = 0; private slowCount = 0;
  private liveDenominatorWeight = 0; private finalDenominatorWeight = 0;
  private readonly legacyMode: boolean;
  private readonly fastSlowThreshold: number;
  private finalized = false;

  constructor(scoreItemsOrCount: readonly ScoreItem[] | number, windowsOrThreshold: JudgmentWindows | number = JUDGMENT_WINDOWS) {
    this.legacyMode = typeof scoreItemsOrCount === "number";
    this.fastSlowThreshold = typeof windowsOrThreshold === "number" ? windowsOrThreshold : windowsOrThreshold.PERFECT / 2;
    this.reset(scoreItemsOrCount);
  }

  /** Settle one score item. A duplicate id is ignored and returns false. */
  settleScoreItem(itemId: string, grade: JudgmentGrade, deltaMs?: number): boolean {
    const item = this.scoreItems.get(itemId);
    if (!item || this.settledItems.has(itemId)) return false;
    this.settledItems.add(itemId); this.liveDenominatorWeight += item.weight3;
    this.earnedScore += (item.weight3 * JUDGMENT_SCORES[grade]) / 3;
    this.judgmentCounts[grade]++; this.recordTiming(deltaMs, grade, item.kind);
    if (grade === JudgmentGrade.BAD || grade === JudgmentGrade.MISS) this.hasBadOrMiss = true;
    return true;
  }

  /** Settle a dependent endpoint at zero without an additional Miss statistic. */
  settleDependentZero(itemId: string): boolean {
    const item = this.scoreItems.get(itemId);
    if (!item || this.settledItems.has(itemId)) return false;
    this.settledItems.add(itemId); this.liveDenominatorWeight += item.weight3; return true;
  }

  /** A maintenance/connection failure: Full Combo and Miss stats only. */
  recordUnscoredMiss(): void { this.judgmentCounts[JudgmentGrade.MISS]++; this.hasBadOrMiss = true; }

  /** Freeze the result against the chart's full theoretical denominator. */
  finalize(): Readonly<ScoreState> { this.finalized = true; return this.getState(); }

  /** Alias for integrations that name the terminal read explicitly. */
  getFinalState(): Readonly<ScoreState> { return this.finalize(); }

  /** Compatibility API for callers that still record an implicit sequence. */
  recordJudgment(grade: JudgmentGrade, deltaMs?: number): void {
    const next = [...this.scoreItems.keys()].find((id) => !this.settledItems.has(id));
    if (next !== undefined) { this.settleScoreItem(next, grade, deltaMs); return; }
    if (!this.legacyMode) throw new RangeError("정적 score item을 초과해 정산할 수 없습니다");
    const id = `legacy:extra:${this.settledItems.size}`;
    this.scoreItems.set(id, { id, noteIndex: -1, unitIndex: -1, kind: "head", timeMs: 0, weight3: 3 });
    this.finalDenominatorWeight += 3; this.settleScoreItem(id, grade, deltaMs);
  }

  getState(): Readonly<ScoreState> {
    const denominator = this.finalized ? this.finalDenominatorWeight : this.liveDenominatorWeight;
    const achievementRate = denominator > 0 ? (this.earnedScore / denominator) * 100 : 0;
    return { totalNotes: this.scoreItems.size, processedNotes: this.settledItems.size,
      maxPossibleScore: this.finalDenominatorWeight, earnedScore: this.earnedScore,
      achievementRate, rank: getRank(achievementRate), isFullCombo: !this.hasBadOrMiss,
      judgmentCounts: { ...this.judgmentCounts }, goodTrillCount: this.judgmentCounts[JudgmentGrade.GOOD_TRILL],
      fastCount: this.fastCount, slowCount: this.slowCount,
      liveDenominatorWeight: this.liveDenominatorWeight, finalDenominatorWeight: this.finalDenominatorWeight };
  }

  reset(scoreItemsOrCount: readonly ScoreItem[] | number): void {
    const items: readonly ScoreItem[] = typeof scoreItemsOrCount === "number"
      ? Array.from({ length: scoreItemsOrCount }, (_, index): ScoreItem => ({
          id: `legacy:${index}`, noteIndex: index, unitIndex: 0, kind: "head", timeMs: index, weight3: 3,
        })) : scoreItemsOrCount;
    this.scoreItems = new Map(items.map((item) => [item.id, item])); this.settledItems = new Set();
    this.earnedScore = 0; this.hasBadOrMiss = false; this.judgmentCounts = emptyJudgmentCounts();
    this.fastCount = 0; this.slowCount = 0; this.liveDenominatorWeight = 0;
    this.finalDenominatorWeight = items.reduce((sum, item) => sum + item.weight3, 0);
    this.finalized = false;
  }

  private recordTiming(deltaMs: number | undefined, grade: JudgmentGrade, kind: ScoreItemKind): void {
    const threshold = this.fastSlowThreshold;
    // `holdOnly`/H has no timing grade. Callers can suppress timing (Grace)
    // by omitting deltaMs; release raw timing remains accepted.
    if (kind !== "holdOnly" && deltaMs != null && grade !== JudgmentGrade.MISS && Math.abs(deltaMs) > threshold) {
      if (deltaMs < 0) this.fastCount++; else if (deltaMs > 0) this.slowCount++;
    }
  }
}
