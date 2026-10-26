import { JUDGMENT_WINDOWS } from "../../shared/constants/judgment";
import { ScoreManager } from "../scoring/ScoreManager";
import type { ScoreState } from "../scoring/ScoreManager";
import type { ExplicitCompiledChart } from "./explicitCompiledChart";
import { ExplicitJudgmentCore } from "./ExplicitJudgmentCore";
import type { ExplicitJudgmentCoreOptions } from "./ExplicitJudgmentCore";
import { ExplicitJudgmentDisplay } from "./ExplicitJudgmentDisplay";
import { ExplicitSessionHistory } from "./ExplicitSessionHistory";
import type { ExplicitSessionOperation } from "./ExplicitSessionHistory";
import type {
  ExplicitConfirmedFact, ExplicitDisplaySource, ExplicitJudgmentDisplayState, ExplicitJudgmentEffect,
  ExplicitHeldKey, ExplicitJudgmentInput, ExplicitJudgmentSnapshot, ExplicitObservedInputBatch,
} from "./ExplicitJudgmentState";

let sessionInstanceCount = 0;

export interface ExplicitSessionResult {
  readonly snapshot: ExplicitJudgmentSnapshot;
  readonly score: Readonly<ScoreState>;
  readonly combo: number;
  readonly facts: readonly ExplicitConfirmedFact[];
  readonly effects: readonly ExplicitJudgmentEffect[];
  readonly display: ExplicitJudgmentDisplayState | null;
}

export interface ExplicitSessionReconstruction {
  readonly session: ExplicitJudgmentSession;
  /** 고도 등 지속 상태만 복원한다. 과거 글자·타격·소리로 다시 소비하지 않는다. */
  readonly prefixEffects: readonly ExplicitJudgmentEffect[];
  readonly heldKeys: readonly ExplicitHeldKey[];
}

/** 새 compiler → pure core → 실제 ScoreManager의 단일 정산 소유자. 기존 세션을 우회 어댑트하지 않는다. */
export class ExplicitJudgmentSession {
  readonly instanceId = `explicit-session:${++sessionInstanceCount}`;
  private readonly core: ExplicitJudgmentCore;
  private readonly scoreManager: ScoreManager;
  private judgmentDisplay = new ExplicitJudgmentDisplay(this.instanceId);
  private readonly initialOptions: ExplicitJudgmentCoreOptions;
  private readonly history: ExplicitSessionHistory;
  private readonly displaySourceByItem: ReadonlyMap<string, ExplicitDisplaySource>;
  private readonly displaySourceByBodyUnit: ReadonlyMap<string, ExplicitDisplaySource>;
  private appliedFactCount = 0;
  private drainedEffectCount = 0;
  private readonly effectHistory: ExplicitJudgmentEffect[] = [];
  private currentCombo = 0;
  private comboGroup: { at: number; phase: string; before: number; successes: number; missed: boolean } | null = null;
  private finalized = false;
  readonly latestJudgmentDeadlineMs: number;

  constructor(private readonly chart: ExplicitCompiledChart, options: ExplicitJudgmentCoreOptions = {}) {
    this.initialOptions = Object.freeze({ ...options,
      windows: options.windows && Object.freeze({ ...options.windows }),
      preheldKeys: options.preheldKeys && Object.freeze(options.preheldKeys.map(key => Object.freeze({ ...key }))),
    });
    this.history = new ExplicitSessionHistory(options.startTimeMs);
    this.core = new ExplicitJudgmentCore(chart, options);
    const playbackChart = this.core.playbackChart;
    this.displaySourceByItem = new Map(playbackChart.scoreItems.map(item => [item.id,
      Object.freeze({ noteIndex: item.source.noteIndex, ordinal: item.ordinal })]));
    this.displaySourceByBodyUnit = new Map(playbackChart.bodyUnits.map(unit => [unit.id,
      Object.freeze({ noteIndex: unit.source.noteIndex, ordinal: unit.ref.ordinal })]));
    this.scoreManager = new ScoreManager(playbackChart.scoreItems.map(item => ({ id: item.id,
      noteIndex: item.source.noteIndex, unitIndex: item.ordinal, kind: item.kind,
      timeMs: item.timeMs, weight3: item.weight })), options.windows ?? JUDGMENT_WINDOWS);
    this.latestJudgmentDeadlineMs = Math.max(options.startTimeMs ?? 0, ...playbackChart.bodies.flatMap(body => [body.startMs, body.endMs]),
      ...playbackChart.scoreItems.map(item => item.timeMs)) + (options.windows ?? JUDGMENT_WINDOWS).GOOD;
    this.applyFacts();
  }

  get snapshot(): ExplicitJudgmentSnapshot { return this.core.snapshot; }
  get playbackChart(): ExplicitCompiledChart { return this.core.playbackChart; }
  get facts(): readonly ExplicitConfirmedFact[] { return this.core.confirmed; }
  get effects(): readonly ExplicitJudgmentEffect[] { return Object.freeze([...this.effectHistory]); }
  get combo(): number { return this.currentCombo; }
  /** 프레임 표시용 점수 조회. 전체 사실·효과 이력을 복사하거나 소비하지 않는다. */
  get score(): Readonly<ScoreState> {
    const score = this.scoreManager.getState();
    return Object.freeze({ ...score, judgmentCounts: Object.freeze(score.judgmentCounts) });
  }
  /** 현재 글자 상태를 읽어도 효과 소비 커서는 움직이지 않는다. */
  get display(): ExplicitJudgmentDisplayState | null { return this.judgmentDisplay.current; }

  /** core 재진입 시각과 화면의 곡 위치를 분리해 입력 오프셋의 합법적인 창을 유지한다. */
  resumeAt(atMs: number, preheldKeys?: readonly ExplicitHeldKey[],
    observedSongTimeMs = Math.max(atMs, this.history.latestSongTimeMs), playbackStartMs = atMs): void {
    this.assertOpen();
    this.history.validateObservation(observedSongTimeMs);
    this.core.resumeAt(atMs, preheldKeys, playbackStartMs);
    this.applyFacts();
    this.history.append({ kind: "resume", atMs, heldKeys: preheldKeys, playbackStartMs }, observedSongTimeMs);
  }

  /** 재개 뒤에야 안 준비 중 hold 변화를 현재 core 시각의 hold로만 맞춘다. 바뀐 레인 밖의 바디는 건드리지 않는다. */
  syncHeldKeys(atMs: number, heldKeys: readonly ExplicitHeldKey[],
    observedSongTimeMs = Math.max(atMs, this.history.latestSongTimeMs)): void {
    this.assertOpen();
    this.history.validateObservation(observedSongTimeMs);
    this.core.syncHeldKeys(atMs, heldKeys);
    this.applyFacts();
    this.history.append({ kind: "syncHeldKeys", atMs, heldKeys }, observedSongTimeMs);
  }

  processBatch(at: number, inputs: readonly ExplicitJudgmentInput[],
    observedSongTimeMs = Math.max(at, this.core.time, this.history.latestSongTimeMs)): void {
    this.assertOpen();
    this.history.validateObservation(observedSongTimeMs);
    this.core.processBatch(at, inputs);
    this.applyFacts();
    this.history.append({ kind: "batch", atMs: at, inputs }, observedSongTimeMs);
  }

  processObservedBatch(rawAt: number, inputs: readonly ExplicitJudgmentInput[], observedAt: number,
    observedSongTimeMs = Math.max(observedAt, this.core.time, this.history.latestSongTimeMs)): void {
    this.processObservedBatches([{ rawAtMs: rawAt, inputs }], observedAt, observedSongTimeMs);
  }

  processObservedBatches(groups: readonly ExplicitObservedInputBatch[], observedAt: number,
    observedSongTimeMs = Math.max(observedAt, this.core.time, this.history.latestSongTimeMs)): void {
    this.assertOpen();
    this.history.validateObservation(observedSongTimeMs);
    this.core.processObservedBatches(groups, observedAt);
    this.applyFacts();
    this.history.append({ kind: "observedBatches", observedAtMs: observedAt, groups }, observedSongTimeMs);
  }

  advance(at: number, observedSongTimeMs = Math.max(at, this.history.latestSongTimeMs)): void {
    this.assertOpen();
    this.history.validateObservation(observedSongTimeMs);
    this.core.advance(at);
    this.applyFacts();
    this.history.append({ kind: "advance", atMs: at }, observedSongTimeMs);
  }

  /**
   * T까지 실제 관측한 연산만 새 세션에서 순서대로 재생한다. raw/노트/확정 시각으로 거르지 않는다.
   * 원래 커서 범위를 다시 사용하며 T를 새 점수 범위로 삼지 않는다. 기존 관측·세션은 불변이다.
   * core 시각은 오프셋 때문에 T와 다를 수 있어 임의로 advance(T)하지 않는다.
   */
  reconstructAt(songTimeMs: number): ExplicitSessionReconstruction {
    const session = new ExplicitJudgmentSession(this.chart, this.initialOptions);
    for (const entry of this.history.prefixThrough(songTimeMs)) {
      session.replay(entry.operation, entry.observedSongTimeMs);
    }
    session.history.observeThrough(songTimeMs);
    const prefixEffects = session.drainEffects();
    session.judgmentDisplay = new ExplicitJudgmentDisplay(session.instanceId);
    return Object.freeze({ session, prefixEffects, heldKeys: session.core.heldKeysSnapshot });
  }

  private replay(operation: ExplicitSessionOperation, observedSongTimeMs: number): void {
    switch (operation.kind) {
      case "advance": this.advance(operation.atMs, observedSongTimeMs); break;
      case "batch": this.processBatch(operation.atMs, operation.inputs, observedSongTimeMs); break;
      case "observedBatches": this.processObservedBatches(operation.groups, operation.observedAtMs, observedSongTimeMs); break;
      case "resume": this.resumeAt(operation.atMs, operation.heldKeys, observedSongTimeMs, operation.playbackStartMs); break;
      case "syncHeldKeys": this.syncHeldKeys(operation.atMs, operation.heldKeys, observedSongTimeMs); break;
    }
  }

  /** 하나의 효과 소비자가 가져간 이력은 상태 재조회·재부착 뒤에도 다시 전달하지 않는다. */
  drainEffects(): readonly ExplicitJudgmentEffect[] {
    const pending = Object.freeze(this.effectHistory.slice(this.drainedEffectCount));
    this.drainedEffectCount = this.effectHistory.length;
    return pending;
  }

  result(): ExplicitSessionResult {
    return Object.freeze({ snapshot: this.snapshot, score: this.score, combo: this.combo, facts: this.facts,
      effects: this.effects, display: this.display });
  }

  finalize(): ExplicitSessionResult {
    if (!this.finalized) {
      this.advance(Math.max(this.core.time, this.latestJudgmentDeadlineMs + 1));
      if (this.snapshot.items.some(item => item.settlementFactId === null)) throw new Error("명시 점수 항목이 미정산 상태입니다");
      this.scoreManager.finalize();
      this.finalized = true;
    }
    return this.result();
  }

  private applyFacts(): void {
    for (const fact of this.core.readConfirmedSince(this.appliedFactCount)) {
      this.appliedFactCount++;
      if (fact.kind !== "settlement" && !(fact.kind === "bodyFailed" && fact.unscoredMiss)) continue;
      const base = { sequence: this.effectHistory.length + 1, factId: fact.id, confirmedAt: fact.confirmedAt,
        phase: fact.phase, lane: fact.lane, displayUpdate: null };
      let effect: ExplicitJudgmentEffect;
      if (fact.kind === "bodyFailed") {
        this.scoreManager.recordUnscoredMiss();
        effect = { ...base, itemId: null, scoreAction: "unscoredMiss", grade: "miss", timingDeltaMs: null,
          comboAction: "break", altitudeAction: "failure", displayGrade: "miss", hitGrade: null };
      } else if (fact.outcome === "dependentZero") {
        if (!this.scoreManager.settleDependentZero(fact.itemId)) throw new Error(`중복/미등록 종속 항목: ${fact.itemId}`);
        effect = { ...base, itemId: fact.itemId, scoreAction: "dependentZero", grade: null, timingDeltaMs: null,
          comboAction: "none", altitudeAction: "none", displayGrade: null, hitGrade: null };
      } else {
        if (fact.grade === null || !this.scoreManager.settleScoreItem(fact.itemId, fact.grade, fact.timingDeltaMs ?? undefined)) {
          throw new Error(`중복/미등록 점수 항목: ${fact.itemId}`);
        }
        const missed = fact.grade === "miss";
        effect = { ...base, itemId: fact.itemId, scoreAction: "settleItem", grade: fact.grade, timingDeltaMs: fact.timingDeltaMs,
          comboAction: missed ? "break" : "increment", altitudeAction: missed ? "failure" : "success",
          displayGrade: fact.grade, hitGrade: fact.grade === "miss" ? null : fact.grade };
      }
      if (effect.displayGrade !== null) {
        const source = fact.kind === "bodyFailed" ? this.displaySourceByBodyUnit.get(fact.bodyUnitId)!
          : this.displaySourceByItem.get(fact.itemId)!;
        effect = { ...effect, displayUpdate: this.judgmentDisplay.confirm(fact.confirmedAt, {
          grade: effect.displayGrade, timingDeltaMs: effect.timingDeltaMs,
          rawDeltaMs: fact.kind === "settlement" ? fact.rawDeltaMs : null, source,
        }) };
      }
      this.applyCombo(effect);
      this.effectHistory.push(Object.freeze(effect));
    }
  }

  private applyCombo(effect: ExplicitJudgmentEffect): void {
    if (effect.comboAction === "none") return;
    if (!this.comboGroup || this.comboGroup.at !== effect.confirmedAt || this.comboGroup.phase !== effect.phase) {
      this.comboGroup = { at: effect.confirmedAt, phase: effect.phase, before: this.currentCombo, successes: 0, missed: false };
    }
    if (effect.comboAction === "break") this.comboGroup.missed = true;
    else this.comboGroup.successes++;
    this.currentCombo = this.comboGroup.missed ? 0 : this.comboGroup.before + this.comboGroup.successes;
  }

  private assertOpen(): void { if (this.finalized) throw new Error("이미 finalize된 ExplicitJudgmentSession입니다"); }
}
