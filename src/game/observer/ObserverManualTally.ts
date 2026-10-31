import { JUDGMENT_WINDOWS } from "../../shared/constants/judgment";
import type { JudgmentWindows } from "../../shared/constants/judgment";
import type { ExplicitCompiledChart } from "../judgment/explicitCompiledChart";
import type { ExplicitJudgmentEffect } from "../judgment/ExplicitJudgmentState";
import type { ExplicitConfirmedEffectSink } from "../judgment/ExplicitSessionRendererAdapter";
import { ScoreManager } from "../scoring/ScoreManager";
import type { ScoreItem } from "../scoring/ScoreManager";

/** 수동 연습 중 HUD에 보이는 값. 달성률은 구간에 점수 항목이 없으면 null(표시 안 함)이다. */
export interface ObserverManualStats {
  readonly combo: number;
  readonly achievementRate: number | null;
}

/**
 * 옵저버의 수동 콤보·달성률. 시작한 시각 이후에 확정되고 집계 중에 받은 판정 효과만 센다.
 * Auto가 처리한 항목의 점수·이론 가중치는 받지 않으므로 달성률 분모에도 들어가지 않는다(RFD 0075).
 * 세션과 같은 정산(`ScoreManager`)과 같은 콤보 묶음 규칙을 쓴다. 판정 자체는 세션이 소유한다.
 */
export class ObserverManualTally implements ExplicitConfirmedEffectSink {
  private readonly scoreItems: readonly ScoreItem[];
  private scoreManager: ScoreManager | null = null;
  private startAtMs = Infinity;
  private currentCombo = 0;
  private comboGroup: { at: number; phase: string; before: number; successes: number; missed: boolean } | null = null;

  /** chart는 판정 세션과 같은 재생 범위다. 항목 id·가중치를 세션의 ScoreManager와 같게 만든다. */
  constructor(chart: ExplicitCompiledChart, private readonly windows: JudgmentWindows = JUDGMENT_WINDOWS) {
    this.scoreItems = chart.scoreItems.map(item => Object.freeze({ id: item.id, noteIndex: item.source.noteIndex,
      unitIndex: item.ordinal, kind: item.kind, timeMs: item.timeMs, weight3: item.weight }));
  }

  get isRunning(): boolean { return this.scoreManager !== null; }

  /** 집계 중이 아니면(Auto) null이다. */
  get stats(): ObserverManualStats | null {
    if (!this.scoreManager) return null;
    const score = this.scoreManager.getState();
    // 일반 플레이 HUD와 같다. 이론 가중치가 0인 범위만 달성률을 숨기고, 아직 정산이 없으면 0%다.
    return Object.freeze({ combo: this.currentCombo,
      achievementRate: score.finalDenominatorWeight > 0 ? score.achievementRate : null });
  }

  /** 이전 집계를 버리고 atMs 이후 확정 효과부터 0에서 센다. */
  start(atMs: number): void {
    if (!Number.isFinite(atMs)) throw new RangeError("수동 집계 시작 시각은 유한해야 합니다");
    this.scoreManager = new ScoreManager(this.scoreItems, this.windows);
    this.startAtMs = atMs;
    this.currentCombo = 0;
    this.comboGroup = null;
  }

  /** 집계를 끝내고 버린다. 다시 start할 때까지 효과를 무시한다. */
  stop(): void {
    this.scoreManager = null;
    this.startAtMs = Infinity;
    this.currentCombo = 0;
    this.comboGroup = null;
  }

  applyConfirmedEffects(effects: readonly ExplicitJudgmentEffect[]): void {
    const scoreManager = this.scoreManager;
    if (!scoreManager) return;
    for (const effect of effects) {
      if (effect.confirmedAt < this.startAtMs) continue;
      // ExplicitJudgmentSession.applyFacts와 같은 정산이다. 중복·미등록 항목은 연결 오류로 본다.
      if (effect.scoreAction === "unscoredMiss") scoreManager.recordUnscoredMiss();
      else if (effect.scoreAction === "dependentZero") {
        if (effect.itemId === null || !scoreManager.settleDependentZero(effect.itemId)) {
          throw new Error(`중복/미등록 종속 항목: ${effect.itemId}`);
        }
      } else if (effect.itemId === null || effect.grade === null
        || !scoreManager.settleScoreItem(effect.itemId, effect.grade, effect.timingDeltaMs ?? undefined)) {
        throw new Error(`중복/미등록 점수 항목: ${effect.itemId}`);
      }
      this.applyCombo(effect);
    }
  }

  /** ExplicitJudgmentSession.applyCombo와 같다. 같은 confirmedAt·phase 묶음에 Miss가 있으면 0, 없으면 성공 수만큼 더한다. */
  private applyCombo(effect: ExplicitJudgmentEffect): void {
    if (effect.comboAction === "none") return;
    if (!this.comboGroup || this.comboGroup.at !== effect.confirmedAt || this.comboGroup.phase !== effect.phase) {
      this.comboGroup = { at: effect.confirmedAt, phase: effect.phase, before: this.currentCombo, successes: 0, missed: false };
    }
    if (effect.comboAction === "break") this.comboGroup.missed = true;
    else this.comboGroup.successes++;
    this.currentCombo = this.comboGroup.missed ? 0 : this.comboGroup.before + this.comboGroup.successes;
  }
}
