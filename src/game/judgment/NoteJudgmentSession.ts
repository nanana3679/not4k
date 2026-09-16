import type { JudgmentWindows } from "../../shared/constants";
import { JUDGMENT_WINDOWS } from "../../shared/constants";
import { ScoreManager, type ScoreState } from "../scoring/ScoreManager";
import {
  decideConfirmedJudgmentEffects,
  type ConfirmedJudgmentEffects,
} from "./confirmedJudgmentEffects";
import {
  NoteJudgmentCore,
  type JudgmentInput,
  type NoteJudgmentEvent,
} from "./NoteJudgmentCore";
import type { CompiledJudgmentChart } from "./compiledJudgmentChart";

export interface NoteJudgmentSessionView {
  readonly at: number;
  readonly events: readonly NoteJudgmentEvent[];
  readonly effects: readonly ConfirmedJudgmentEffects[];
  readonly combo: number;
}

export interface NoteJudgmentSessionOptions {
  readonly windows?: JudgmentWindows;
  readonly onBatchConfirmed?: (view: NoteJudgmentSessionView) => void;
}

/**
 * compiled chart, pure core, score 정산, 확정 효과를 한 플레이 세션으로 묶는다.
 * 입력 배열의 순서와 timestamp는 core에 그대로 전달하며 session은 재정렬하거나 보정하지 않는다.
 */
export class NoteJudgmentSession {
  readonly core: NoteJudgmentCore;
  readonly score: ScoreManager;
  private readonly notes: CompiledJudgmentChart["rawNotes"];
  private readonly windows: JudgmentWindows;
  private readonly onBatchConfirmed?: (view: NoteJudgmentSessionView) => void;
  private readonly effectsByEvent: ConfirmedJudgmentEffects[] = [];
  private finalized = false;

  constructor(
    private readonly chart: CompiledJudgmentChart,
    options: NoteJudgmentSessionOptions = {},
  ) {
    this.notes = chart.rawNotes;
    this.windows = options.windows ?? JUDGMENT_WINDOWS;
    this.onBatchConfirmed = options.onBatchConfirmed;
    this.score = new ScoreManager(chart.scoreItems, this.windows);
    this.core = new NoteJudgmentCore(chart, {
      windows: this.windows,
      onConfirmed: (event) => this.applyConfirmedEvent(event),
      onBatchConfirmed: (events, at) => this.publishBatch(events, at),
    });
  }

  processBatch(at: number, inputs: readonly JudgmentInput[]): void {
    this.assertOpen();
    this.core.processBatch(at, inputs);
  }

  processObservedBatch(rawAt: number, inputs: readonly JudgmentInput[], observedAt: number): void {
    this.assertOpen();
    this.core.processObservedBatch(rawAt, inputs, observedAt);
  }

  advance(at: number): void {
    this.assertOpen();
    this.core.advance(at);
  }

  /** 모든 S/E + Good deadline을 지나 남은 이벤트를 확정하고 이론 분모를 고정한다. */
  finalize(): Readonly<ScoreState> {
    if (this.finalized) return this.score.getFinalState();
    const deadline = this.chart.notes.reduce(
      (latest, note) => Math.max(latest, note.startMs, note.endMs ?? note.startMs), 0,
    ) + this.windows.GOOD + 1;
    this.advance(Math.max(deadline, this.core.time));
    this.finalized = true;
    return this.score.finalize();
  }

  get events(): readonly NoteJudgmentEvent[] { return this.core.confirmed; }
  get effects(): readonly ConfirmedJudgmentEffects[] { return this.effectsByEvent; }
  get combo(): number { return this.core.combo; }
  get unitStates() { return this.core.bodyStates; }
  get bodyStates() { return this.core.bodyStates; }
  get connections() { return this.chart.connections; }

  private applyConfirmedEvent(event: NoteJudgmentEvent): void {
    const note = this.notes[event.noteIndex];
    if (!note) throw new RangeError(`존재하지 않는 noteIndex: ${event.noteIndex}`);
    const effects = decideConfirmedJudgmentEffects(event, note);
    switch (effects.scoreAction.type) {
      case "settleItem":
        if (!this.score.settleScoreItem(effects.scoreAction.itemId, effects.scoreAction.grade, effects.scoreAction.deltaMs)) {
          throw new Error(`중복 또는 미등록 score item: ${effects.scoreAction.itemId}`);
        }
        break;
      case "dependentZero":
        if (!this.score.settleDependentZero(effects.scoreAction.itemId)) {
          throw new Error(`중복 또는 미등록 dependent item: ${effects.scoreAction.itemId}`);
        }
        break;
      case "unscoredMiss":
        this.score.recordUnscoredMiss();
        break;
    }
    this.effectsByEvent.push(effects);
  }

  private publishBatch(events: readonly NoteJudgmentEvent[], at: number): void {
    if (!this.onBatchConfirmed) return;
    const start = this.effectsByEvent.length - events.length;
    this.onBatchConfirmed({
      at,
      events,
      effects: this.effectsByEvent.slice(start),
      combo: this.core.combo,
    });
  }

  private assertOpen(): void {
    if (this.finalized) throw new Error("이미 finalize된 NoteJudgmentSession입니다");
  }

}
