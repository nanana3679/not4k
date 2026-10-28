import { JUDGMENT_WINDOWS, MAINTENANCE_GRACE_MS } from "../../shared/constants/judgment";
import type { JudgmentWindows } from "../../shared/constants/judgment";
import { LaneHoldTracker } from "./LaneHoldTracker";
import type { ExplicitCompiledBody, ExplicitCompiledChart, ExplicitScoreItem } from "./explicitCompiledChart";
import { createExplicitPlaybackChartView, selectExplicitPlaybackChart } from "./explicitPlaybackChart";
import type {
  ExplicitBodyUnitSnapshot, ExplicitConfirmationPhase, ExplicitConfirmedFact, ExplicitGrade,
  ExplicitHeldKey, ExplicitItemSnapshot, ExplicitJudgmentInput, ExplicitJudgmentSnapshot, ExplicitObservedInputBatch,
} from "./ExplicitJudgmentState";

type Settlement = Extract<ExplicitConfirmedFact, { kind: "settlement" }>;
type FactInput = { [K in ExplicitConfirmedFact["kind"]]:
  Omit<Extract<ExplicitConfirmedFact, { kind: K }>, "id"> }[ExplicitConfirmedFact["kind"]];
interface ItemRuntime { readonly item: ExplicitScoreItem; settlement: Settlement | null }
interface UnitRuntime {
  readonly body: BodyRuntime;
  readonly ordinal: number;
  readonly id: string;
  /** 이 몫의 시작을 맡는 시작 탭 항목. double 탭 + single 바디는 한 몫이 두 항목을 모두 맡는다. */
  readonly startTaps: readonly ItemRuntime[];
  startedAt: number | null;
  completedAt: number | null;
  failedAt: number | null;
  failureFactId: string | null;
  startFact: ExplicitConfirmedFact | null;
  completeFact: ExplicitConfirmedFact | null;
  startKey: string | null;
  inherited: boolean;
  judgedFrom: number | null;
  tapDecisionAt: number | null;
  /** 재개한 남은 부분에는 원래 시작 탭의 바디 시작 의무를 다시 부과하지 않는다. */
  reentered: boolean;
  /** 마지막으로 다시 연 재개 차수. 같은 차수에서 시작한 몫끼리만 시작 키가 겹치지 않게 비교한다. */
  resumeEpoch: number;
}
interface BodyRuntime {
  readonly body: ExplicitCompiledBody;
  activationStartMs: number;
  readonly units: UnitRuntime[];
  readonly startTaps: ItemRuntime[];
  readonly tapDownByKey: Map<string, number>;
}
interface InputToken {
  readonly input: ExplicitJudgmentInput;
  readonly inputId: string;
  readonly sequence: number;
  readonly rawAt: number;
  readonly observedAt: number;
  readonly heldAt: number;
}

export interface ExplicitJudgmentCoreOptions {
  readonly windows?: JudgmentWindows;
  /** 임시 사례 설정을 주입한다. 최종 제품 유예를 새로 확정하지 않는다. */
  readonly maintenanceGraceMs?: number;
  /** 새 세션의 재생 범위. 이 시각 앞의 명시 항목은 Miss 없이 제외한다. */
  readonly startTimeMs?: number;
  /** 초기 hold를 준비만 한다. resumeAt 또는 명시적인 판정 진행 전에는 바디·점수를 처리하지 않는다. */
  readonly preheldKeys?: readonly ExplicitHeldKey[];
}

/** 명시 항목과 실제 바디 몫을 실행한다. 점수·렌더러는 확정 사실과 snapshot만 소비한다. */
export class ExplicitJudgmentCore {
  private readonly windows: JudgmentWindows;
  private readonly maintenanceGraceMs: number;
  private holds: LaneHoldTracker;
  private readonly laneByHeldKey = new Map<string, number>();
  private readonly lastHeldAtByLane = new Map<number, number>();
  private readonly items: ItemRuntime[];
  private readonly bodies: BodyRuntime[];
  private readonly bodyByIndex: Map<number, BodyRuntime>;
  private readonly timelineByLane = new Map<number, number[]>();
  private readonly timelineIndexByLane = new Map<number, number>();
  private readonly tapKeysByNote = new Map<number, Set<string>>();
  private readonly releaseUsesByNote = new Map<number, Map<string, number>>();
  private readonly trillKeysByZone = new Map<number, Set<string>>();
  private clock = -Infinity;
  private inputSequence = 0;
  private resumeEpoch = 0;
  private readonly facts: ExplicitConfirmedFact[] = [];
  private currentPlaybackChart: ExplicitCompiledChart;

  constructor(readonly chart: ExplicitCompiledChart, options: ExplicitJudgmentCoreOptions = {}) {
    this.currentPlaybackChart = options.startTimeMs === undefined ? chart : selectExplicitPlaybackChart(chart, options.startTimeMs);
    const playbackChart = this.currentPlaybackChart;
    this.windows = { ...(options.windows ?? JUDGMENT_WINDOWS) };
    const grace = options.maintenanceGraceMs ?? MAINTENANCE_GRACE_MS;
    if (![this.windows.PERFECT, this.windows.GREAT, this.windows.GOOD, grace].every(Number.isFinite)
      || this.windows.PERFECT < 0 || this.windows.GREAT < this.windows.PERFECT
      || this.windows.GOOD < this.windows.GREAT || grace < 0) throw new RangeError("유효하지 않은 판정 창/유지 유예");
    this.maintenanceGraceMs = grace;
    if (options.startTimeMs !== undefined && !Number.isFinite(options.startTimeMs)) throw new RangeError("재생 시작 시각은 유한해야 합니다");
    this.validateHeldKeys(options.preheldKeys ?? []);
    if (options.preheldKeys?.length && options.startTimeMs === undefined) throw new RangeError("preheld에는 재생 시작 시각이 필요합니다");
    this.holds = new LaneHoldTracker(grace);
    this.items = playbackChart.scoreItems.map(item => ({ item, settlement: null })).sort((a, b) =>
      a.item.timeMs - b.item.timeMs || a.item.source.noteIndex - b.item.source.noteIndex || a.item.ordinal - b.item.ordinal);
    this.bodies = playbackChart.bodies.map(body => {
      const startTaps = this.items.filter(({ item }) => item.kind === "tap" && item.startsBodyIndices.includes(body.source.noteIndex));
      const runtime: BodyRuntime = { body, activationStartMs: body.startMs, startTaps, units: [], tapDownByKey: new Map() };
      for (const unit of body.units) {
        // single 탭은 double의 높은 hold 기준을 맡고 비담당 몫은 낮은 기준을 먼저 채운다.
        // 몫보다 많은 탭(double 탭 + single 바디)은 가장 높은 몫이 모두 맡아 먼저 성공한 down으로 시작한다.
        const offset = body.holdCount - startTaps.length;
        const unitStartTaps = offset >= 0 ? startTaps.filter((_, index) => index === unit.ref.ordinal - offset)
          : startTaps.filter((_, index) => index === unit.ref.ordinal || (unit.ref.ordinal === body.holdCount - 1 && index >= body.holdCount));
        runtime.units.push({ body: runtime, ordinal: unit.ref.ordinal, id: unit.id, startTaps: unitStartTaps,
          startedAt: null, completedAt: null, failedAt: null, failureFactId: null,
          startFact: null, completeFact: null, startKey: null, inherited: false, judgedFrom: null, tapDecisionAt: null,
          reentered: false, resumeEpoch: 0 });
      }
      return runtime;
    });
    this.bodyByIndex = new Map(this.bodies.map(body => [body.body.source.noteIndex, body]));
    for (let lane = 1; lane <= 4; lane++) {
      this.timelineByLane.set(lane, [...new Set([...playbackChart.bodies.filter(body => body.lane === lane).flatMap(body => [body.startMs, body.endMs]),
        ...playbackChart.scoreItems.filter(item => item.lane === lane && item.kind === "tick").map(item => item.timeMs)])].sort((a, b) => a - b));
      this.timelineIndexByLane.set(lane, 0);
    }
    if (options.startTimeMs !== undefined) {
      this.replaceHeldKeys(options.startTimeMs, options.preheldKeys ?? []);
      this.clock = options.startTimeMs;
    }
  }

  get time(): number { return this.clock; }
  get heldKeysSnapshot(): readonly ExplicitHeldKey[] {
    return Object.freeze([...this.laneByHeldKey].map(([key, lane]) => Object.freeze({ key, lane })));
  }
  get playbackChart(): ExplicitCompiledChart { return this.currentPlaybackChart; }
  get confirmed(): readonly ExplicitConfirmedFact[] { return Object.freeze([...this.facts]); }

  /** 준비가 끝난 뒤 멈춘 시각에서만 재개한다. 기존 정산·실패·완료와 pending 항목은 보존한다. */
  resumeAt(atMs: number, preheldKeys: readonly ExplicitHeldKey[] = this.heldKeysSnapshot, playbackStartMs = atMs): void {
    if (!Number.isFinite(atMs) || atMs !== this.clock) throw new RangeError("재개 시각은 멈춘 판정 시각과 같아야 합니다");
    if (!Number.isFinite(playbackStartMs)) throw new RangeError("표시 시작 시각은 유한해야 합니다");
    this.validateHeldKeys(preheldKeys);
    this.currentPlaybackChart = createExplicitPlaybackChartView(this.currentPlaybackChart, playbackStartMs, this.currentPlaybackChart.scoreItems);
    this.resumeEpoch++;
    this.replaceHeldKeys(atMs, preheldKeys);
    for (const runtime of this.bodies) {
      if (runtime.body.endMs < atMs || (runtime.body.startMs >= atMs
        && !runtime.units.some(unit => this.open(unit) && unit.startedAt !== null))) continue;
      runtime.activationStartMs = Math.max(runtime.body.startMs, atMs);
      for (const unit of runtime.units) {
        if (!this.open(unit)) continue;
        // 되감기 뒤에도 미처리 시작 탭의 일반 실패 종속은 면제하지 않는다.
        unit.reentered = !unit.startTaps.length || this.tapSatisfied(unit) || unit.startTaps.every(tap => tap.settlement !== null);
        unit.resumeEpoch = this.resumeEpoch;
        unit.startedAt = null; unit.startFact = null; unit.startKey = null;
        unit.inherited = false; unit.judgedFrom = null; unit.tapDecisionAt = null;
      }
    }
    this.rebuildTimeline(atMs);
    this.sweep(atMs, true);
  }

  /**
   * 재개 hold를 정한 뒤에야 안 hold 변화를 현재 판정 시각에 반영한다. 탭·릴리즈 입력으로 처리하지 않는다.
   * resumeAt과 달리 바디 시작·시작 창·유지 기한을 다시 열지 않고, hold가 바뀐 레인의 hold 기록만 고친다.
   * 새로 잡힌 키는 시작 창이 이미 열린 대기 몫을 그 시각에 preheld처럼 시작하고, 놓인 키는 그 시각부터 hold 부족이다.
   */
  syncHeldKeys(atMs: number, heldKeys: readonly ExplicitHeldKey[]): void {
    if (!Number.isFinite(atMs) || atMs !== this.clock) throw new RangeError("hold 반영 시각은 현재 판정 시각과 같아야 합니다");
    this.validateHeldKeys(heldKeys);
    const laneByKey = new Map(heldKeys.map(({ key, lane }) => [key, lane]));
    const changedLanes = new Set<number>();
    for (const [key, lane] of [...this.laneByHeldKey]) if (laneByKey.get(key) !== lane) {
      this.laneByHeldKey.delete(key); this.holds.up(key, atMs); changedLanes.add(lane);
    }
    for (const [key, lane] of laneByKey) if (!this.laneByHeldKey.has(key)) {
      this.laneByHeldKey.set(key, lane); this.holds.down(key, lane, atMs); changedLanes.add(lane);
    }
    for (const lane of changedLanes) this.lastHeldAtByLane.set(lane, Math.max(this.lastHeldAtByLane.get(lane) ?? atMs, atMs));
    for (const runtime of this.bodies) {
      if (!changedLanes.has(runtime.body.lane) || runtime.activationStartMs > atMs) continue;
      for (const unit of runtime.units) this.tryStart(unit, atMs, "preheld", null, this.tapSatisfied(unit));
    }
    this.reconcile(atMs, "timeline");
  }

  private validateHeldKeys(keys: readonly ExplicitHeldKey[]): void {
    if (keys.some(key => !key.key || !Number.isInteger(key.lane) || key.lane < 1 || key.lane > 4)
      || new Set(keys.map(key => key.key)).size !== keys.length) throw new RangeError("preheld에는 서로 다른 key와 main lane(1～4)이 필요합니다");
  }

  private replaceHeldKeys(atMs: number, keys: readonly ExplicitHeldKey[]): void {
    this.holds = new LaneHoldTracker(this.maintenanceGraceMs);
    this.laneByHeldKey.clear();
    // 점수에는 원래 raw 시각을 쓰되 이전 활성 구간의 hold 기록으로 되돌아가지 않는다.
    for (let lane = 1; lane <= 4; lane++) this.lastHeldAtByLane.set(lane, atMs);
    for (const { key, lane } of keys) {
      this.laneByHeldKey.set(key, lane);
      this.holds.down(key, lane, atMs);
    }
  }

  private rebuildTimeline(fromMs: number): void {
    for (let lane = 1; lane <= 4; lane++) {
      this.timelineByLane.set(lane, [...new Set([
        ...this.bodies.filter(runtime => runtime.body.lane === lane).flatMap(runtime => [runtime.activationStartMs, runtime.body.endMs]),
        ...this.items.filter(runtime => runtime.item.lane === lane && runtime.item.kind === "tick").map(runtime => runtime.item.timeMs),
      ])].filter(time => time >= fromMs).sort((a, b) => a - b));
      this.timelineIndexByLane.set(lane, 0);
    }
  }

  /** append-only 기록의 새 구간만 복사한다. 반환 배열은 이후 확정·진행 무효화로 바뀌지 않는다. */
  readConfirmedSince(cursor: number): readonly ExplicitConfirmedFact[] {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.facts.length) throw new RangeError("확정 사실 cursor가 유효하지 않습니다");
    return Object.freeze(this.facts.slice(cursor));
  }

  get snapshot(): ExplicitJudgmentSnapshot {
    const bodyUnits: ExplicitBodyUnitSnapshot[] = this.bodies.flatMap(runtime => runtime.units.map(unit => {
      const recovering = unit.startedAt !== null && this.open(unit) && !this.filled(unit);
      const since = recovering ? Math.max(this.holds.belowSince(runtime.body.lane, this.need(unit)) ?? -Infinity,
        unit.judgedFrom ?? unit.startedAt!) : null;
      return Object.freeze({ id: unit.id, ref: Object.freeze({ ...runtime.body.units[unit.ordinal].ref }), lane: runtime.body.lane,
        state: unit.failedAt !== null ? "failed" : unit.completedAt !== null ? "complete" : unit.startedAt === null ? "waiting" : recovering ? "recovering" : "active",
        actualStartMs: unit.startedAt, completedAtMs: unit.completedAt, failedAtMs: unit.failedAt, failureFactId: unit.failureFactId,
        maintenanceSinceMs: since, maintenanceDeadlineMs: recovering ? this.maintenanceDeadline(unit) ?? null : null,
        tapStatus: !unit.startTaps.length ? "none" : this.tapSatisfied(unit) ? "satisfied"
          : this.tapMissed(unit) ? "missed" : "waiting" });
    }));
    const items: ExplicitItemSnapshot[] = this.items.map(({ item, settlement }) => {
      const unit = item.kind === "tick" ? this.bodyByIndex.get(item.bodyIndex)?.units[item.bodyUnit.ordinal] : undefined;
      const waiting = !settlement && unit && item.timeMs <= this.clock;
      return Object.freeze({ id: item.id, kind: item.kind, sourceNoteIndex: item.source.noteIndex, ordinal: item.ordinal,
        state: settlement ? settlement.outcome === "dependentZero" ? "dependentZero" : settlement.grade === "miss" ? "miss" : "success"
          : waiting ? "waiting" : "pending",
        waitingReason: waiting ? unit.startedAt === null ? "bodyStart" : "bodyRecovery" : null,
        grade: settlement?.grade ?? null, settlementFactId: settlement?.id ?? null });
    });
    return Object.freeze({ atMs: this.clock, bodyUnits: Object.freeze(bodyUnits), items: Object.freeze(items) });
  }

  processBatch(at: number, inputs: readonly ExplicitJudgmentInput[]): void {
    if (at < this.clock) throw new RangeError("과거 raw 입력은 processObservedBatch로 전달해야 합니다");
    this.processObservedBatch(at, inputs, at);
  }

  processObservedBatch(rawAt: number, inputs: readonly ExplicitJudgmentInput[], observedAt: number): void {
    this.processObservedBatches([{ rawAtMs: rawAt, inputs }], observedAt);
  }

  /** 한 drain의 여러 raw 묶음은 전부 되돌린 다음 시간순으로 재생하고 마지막에만 관측 시각까지 진행한다. */
  processObservedBatches(groups: readonly ExplicitObservedInputBatch[], observedAt: number): void {
    if (!Number.isFinite(observedAt)) throw new RangeError("observed 시각이 유효하지 않습니다");
    for (const group of groups) this.validateBatch(group.rawAtMs, group.inputs, observedAt);
    const now = Math.max(this.clock, observedAt);
    this.sweep(now, false);
    this.clock = now;
    const sorted = groups.map((group, order) => ({ ...group, order })).sort((a, b) => a.rawAtMs - b.rawAtMs || a.order - b.order);
    const tokensByRaw = new Map<number, InputToken[]>();
    const firstHeldByLane = new Map<number, number>();
    const heldAtByLane = new Map(this.lastHeldAtByLane);
    const simulatedLaneByHeldKey = new Map(this.laneByHeldKey);
    for (const group of sorted) {
      const tokens = tokensByRaw.get(group.rawAtMs) ?? [];
      for (const input of group.inputs) {
        const lane = input.lane!;
        const heldAt = Math.max(group.rawAtMs, heldAtByLane.get(lane) ?? -Infinity);
        const down = input.type === "down" || input.type === "press";
        const accepted = down ? !simulatedLaneByHeldKey.has(input.key) : simulatedLaneByHeldKey.get(input.key) === lane;
        if (accepted) {
          if (down) simulatedLaneByHeldKey.set(input.key, lane); else simulatedLaneByHeldKey.delete(input.key);
          heldAtByLane.set(lane, heldAt);
          firstHeldByLane.set(lane, Math.min(heldAt, firstHeldByLane.get(lane) ?? Infinity));
        }
        const sequence = this.inputSequence++;
        tokens.push({ input, sequence, inputId: `input:${sequence}`, rawAt: group.rawAtMs, observedAt, heldAt });
      }
      tokensByRaw.set(group.rawAtMs, tokens);
    }
    for (const [lane, at] of firstHeldByLane) this.invalidateProgress(lane, at);
    for (const [rawAt, tokens] of tokensByRaw) {
      if (!tokens.length) continue;
      // 각 레인의 clamp는 hold 기록에만 적용한다. raw는 창·등급과 원래 입력 인과를 보존한다.
      const at = Math.max(rawAt, Math.min(...tokens.map(token => token.heldAt)));
      this.sweep(at, true);
      this.applyTokens(tokens);
      this.reconcile(at, "input");
    }
    this.sweep(now, true);
    this.reconcile(now, "input");
  }

  advance(at: number): void {
    if (!Number.isFinite(at) || at < this.clock) throw new RangeError("advance 시각은 유한하고 현재 시각 이상이어야 합니다");
    this.sweep(at, true);
    this.clock = at;
  }

  private validateBatch(rawAt: number, inputs: readonly ExplicitJudgmentInput[], observedAt: number): void {
    if (!Number.isFinite(rawAt) || rawAt > observedAt) throw new RangeError("raw/observed 시각이 유효하지 않습니다");
    if (inputs.some(input => !Number.isInteger(input.lane) || input.lane! < 1 || input.lane! > 4
      || !input.key || !["down", "up", "press", "release"].includes(input.type))) {
      throw new RangeError("모든 명시 판정 입력에는 key와 main lane(1～4)이 필요합니다");
    }
  }

  /** 서로 다른 키는 배정을 함께 계산하되 같은 키의 원래 down/up 순서는 바꾸지 않는다. */
  private applyTokens(tokens: readonly InputToken[]): void {
    const queuesByKey = new Map<string, InputToken[]>();
    for (const token of tokens) {
      const queue = queuesByKey.get(token.input.key) ?? [];
      queue.push(token); queuesByKey.set(token.input.key, queue);
    }
    const tapHits: { runtime: ItemRuntime; token: InputToken; grade: ExplicitGrade }[] = [];
    while (queuesByKey.size) {
      const heads = [...queuesByKey.values()].map(queue => queue[0]);
      const ups = heads.filter(token => this.action(token) === "up");
      const ordered = ups.length ? this.orderUps(ups) : heads.sort((a, b) => a.input.key.localeCompare(b.input.key));
      for (const token of ordered) {
        this.applyInput(token, tapHits);
        const queue = queuesByKey.get(token.input.key)!;
        queue.shift(); if (!queue.length) queuesByKey.delete(token.input.key);
      }
    }
    this.settleTapHits(tapHits);
  }

  /** 이른 항목을 우선하는 최대 매칭. 여러 적격 키의 배정을 함께 비교하여 수신 순서로 기회를 잃지 않는다. */
  private orderUps(tokens: readonly InputToken[]): InputToken[] {
    const assignedByItem = new Map<ItemRuntime, InputToken>();
    const assignedByToken = new Map<InputToken, ItemRuntime>();
    const candidates = new Map(tokens.map(token => [token, this.items.filter(item => this.eligibleRelease(item, token))]));
    const visit = (token: InputToken, seen: Set<ItemRuntime>): boolean => {
      for (const item of candidates.get(token)!) {
        if (seen.has(item)) continue;
        seen.add(item);
        const previous = assignedByItem.get(item);
        if (!previous || visit(previous, seen)) {
          assignedByItem.set(item, token); assignedByToken.set(token, item); return true;
        }
      }
      return false;
    };
    for (const token of [...tokens].sort((a, b) => a.input.key.localeCompare(b.input.key))) visit(token, new Set());
    return [...tokens].sort((a, b) => this.items.indexOf(assignedByToken.get(a)!) - this.items.indexOf(assignedByToken.get(b)!))
      .sort((a, b) => Number(!assignedByToken.has(a)) - Number(!assignedByToken.has(b)));
  }

  private action(token: InputToken): "down" | "up" { return token.input.type === "down" || token.input.type === "press" ? "down" : "up"; }

  private applyInput(token: InputToken, tapHits: { runtime: ItemRuntime; token: InputToken; grade: ExplicitGrade }[]): void {
    const { input, rawAt, heldAt, observedAt, inputId, sequence } = token;
    const lane = input.lane!;
    const action = this.action(token);
    const accepted = action === "down" ? !this.laneByHeldKey.has(input.key) : this.laneByHeldKey.get(input.key) === lane;
    const candidate = accepted ? this.items.find(runtime => {
      const { item, settlement } = runtime;
      if (settlement || item.lane !== lane || Math.abs(rawAt - item.timeMs) > this.windows.GOOD) return false;
      if (action === "up") return this.eligibleRelease(runtime, token);
      return item.kind === "tap" && !tapHits.some(hit => hit.runtime === runtime)
        && !this.tapKeysByNote.get(item.source.noteIndex)?.has(input.key);
    }) : undefined;
    this.confirm({ kind: "input", inputId, key: input.key, action, lane, atMs: rawAt, confirmedAt: this.clock,
      phase: "input", observedAt, heldAtMs: heldAt, accepted, consumedItemId: candidate?.item.id ?? null });
    if (!accepted) return;
    this.lastHeldAtByLane.set(lane, heldAt);
    if (action === "down") { this.laneByHeldKey.set(input.key, lane); this.holds.down(input.key, lane, heldAt); }
    else { this.laneByHeldKey.delete(input.key); this.holds.up(input.key, heldAt); }
    if (candidate) {
      const { item } = candidate;
      const grade = "grace" in item && item.grace ? "perfect" : this.grade(rawAt - item.timeMs);
      if (item.kind === "tap") {
        const keys = this.tapKeysByNote.get(item.source.noteIndex) ?? new Set(); keys.add(input.key);
        this.tapKeysByNote.set(item.source.noteIndex, keys);
        tapHits.push({ runtime: candidate, token, grade });
        for (const bodyIndex of item.startsBodyIndices) this.bodyByIndex.get(bodyIndex)?.tapDownByKey.set(input.key, sequence);
      } else {
        const uses = this.releaseUsesByNote.get(item.source.noteIndex) ?? new Map(); uses.set(input.key, sequence);
        this.releaseUsesByNote.set(item.source.noteIndex, uses);
        this.settle(candidate, grade, rawAt, "input", inputId, rawAt - item.timeMs);
      }
    }
    if (action === "down") {
      for (const runtime of this.bodies) {
        // 재개는 시작 창을 T로 옮기지만 차트 시각의 원래 창은 닫지 않는다. 그 창의 늦게 관측한 down도 hold 시각(≥T)에 시작한다.
        if (runtime.body.lane !== lane || (Math.abs(rawAt - runtime.activationStartMs) > this.windows.GOOD
          && Math.abs(rawAt - runtime.body.startMs) > this.windows.GOOD)) continue;
        const own = candidate && runtime.units.find(unit => !unit.reentered && unit.startTaps.includes(candidate));
        // 여러 탭을 맡은 몫은 먼저 성공한 탭 down으로만 판단한다. 다음 탭 성공이 시작·유지 기준을 옮기지 않는다.
        if (own && this.open(own) && own.tapDecisionAt === null) {
          own.judgedFrom = heldAt; own.tapDecisionAt = heldAt;
          if (own.startedAt === null) this.tryStart(own, heldAt, "down", token, true);
        }
        for (const unit of runtime.units) if (unit.startedAt === null) {
          if (!unit.startTaps.length || unit.reentered) this.tryStart(unit, heldAt, "down", token);
          else if (this.tapSatisfied(unit)) this.tryStart(unit, heldAt, "down", token, true);
        }
      }
    } else {
      for (const runtime of this.bodies) {
        if (runtime.body.lane !== lane || rawAt < runtime.body.endMs - this.windows.GOOD) continue;
        const unit = [...runtime.units].reverse().find(unit => this.open(unit) && unit.startedAt !== null && heldAt >= unit.startedAt);
        if (unit) this.complete(unit, heldAt, "earlyUp", "input", inputId);
      }
    }
  }

  private eligibleRelease(runtime: ItemRuntime, token: InputToken): boolean {
    const { item, settlement } = runtime;
    const { input, rawAt } = token;
    if (settlement || item.kind !== "release" || item.lane !== input.lane || Math.abs(rawAt - item.timeMs) > this.windows.GOOD
      || this.laneByHeldKey.get(input.key) !== input.lane) return false;
    const previousUse = this.releaseUsesByNote.get(item.source.noteIndex)?.get(input.key);
    const body = item.bodyIndex === undefined ? undefined : this.bodyByIndex.get(item.bodyIndex);
    if (previousUse !== undefined && (!body || (body.tapDownByKey.get(input.key) ?? -Infinity) <= previousUse)) return false;
    if (!body) return true;
    const started = body.units.filter(unit => unit.startedAt !== null && unit.failedAt === null && unit.startedAt <= token.heldAt).length;
    const releases = this.items.filter(runtime => runtime.item.kind === "release" && runtime.item.source.noteIndex === item.source.noteIndex);
    const consumed = releases.filter(runtime => runtime.settlement?.outcome === "graded" && runtime.settlement.grade !== "miss").length;
    // single 바디+doubleRelease는 한 실제 시작으로 두 기회를 열지만 double 유지의 두 몫을 대신하지 않는다.
    return started > 0 && (body.body.holdCount === 1 || consumed < started);
  }

  private settleTapHits(hits: { runtime: ItemRuntime; token: InputToken; grade: ExplicitGrade }[]): void {
    const groupsByZone = new Map<number, typeof hits>();
    for (const hit of hits) {
      const item = hit.runtime.item;
      if (item.kind === "tap" && item.trillZoneIndex !== undefined) {
        const group = groupsByZone.get(item.trillZoneIndex) ?? []; group.push(hit); groupsByZone.set(item.trillZoneIndex, group);
      }
    }
    const rank: Record<ExplicitGrade, number> = { miss: -1, goodTrill: 0, good: 1, great: 2, perfect: 3 };
    for (const [zone, group] of groupsByZone) {
      const previous = this.trillKeysByZone.get(zone) ?? new Set();
      const selected = group.some(hit => !previous.has(hit.token.input.key)) ? [...group].sort((a, b) =>
        rank[b.grade] - rank[a.grade] || a.runtime.item.timeMs - b.runtime.item.timeMs || a.runtime.item.id.localeCompare(b.runtime.item.id))[0] : undefined;
      for (const hit of group) if (hit !== selected) hit.grade = "goodTrill";
      this.trillKeysByZone.set(zone, new Set(group.map(hit => hit.token.input.key)));
    }
    for (const { runtime, token, grade } of hits) this.settle(runtime, grade, token.rawAt, "input", token.inputId, token.rawAt - runtime.item.timeMs);
  }

  private grade(delta: number): Exclude<ExplicitGrade, "miss"> {
    return Math.abs(delta) <= this.windows.PERFECT ? "perfect" : Math.abs(delta) <= this.windows.GREAT ? "great" : "good";
  }
  private open(unit: UnitRuntime): boolean { return unit.failedAt === null && unit.completedAt === null; }
  /** 맡은 시작 탭 중 하나라도 성공했다. */
  private tapSatisfied(unit: UnitRuntime): boolean {
    return unit.startTaps.some(tap => tap.settlement !== null && tap.settlement.grade !== "miss");
  }
  /** 맡은 시작 탭이 모두 Miss다. 하나라도 성공하거나 대기 중이면 탭 Miss 실패가 아니다. */
  private tapMissed(unit: UnitRuntime): boolean {
    return unit.startTaps.length > 0 && unit.startTaps.every(tap => tap.settlement?.grade === "miss");
  }
  private need(unit: UnitRuntime): number {
    return unit.body.units.filter(other => other.ordinal <= unit.ordinal && other.failedAt === null
      && other.completedAt === null && (other.startedAt !== null || (other.tapDecisionAt !== null
        && this.tapSatisfied(other)))).length;
  }
  private filled(unit: UnitRuntime): boolean { return this.holds.count(unit.body.body.lane) >= this.need(unit); }
  private heldKeys(lane: number): string[] { return [...this.laneByHeldKey].filter(([, value]) => value === lane).map(([key]) => key).sort(); }

  private tryStart(unit: UnitRuntime, at: number, via: "preheld" | "down", token: InputToken | null, ownTap = false): void {
    if (!this.open(unit) || unit.startedAt !== null) return;
    const runtime = unit.body;
    const active = runtime.units.filter(other => this.open(other) && other.startedAt !== null).length;
    if (this.holds.count(runtime.body.lane) <= active) return;
    const used = new Set(runtime.units.filter(other => other.resumeEpoch === unit.resumeEpoch
      && other.startedAt !== null && other.failedAt === null).map(other => other.startKey));
    const key = this.heldKeys(runtime.body.lane).find(key => !used.has(key));
    if (key === undefined) return;
    if (unit.startTaps.length && !unit.reentered && !ownTap) {
      if (!this.hasHealthyPredecessor(unit)) return;
      unit.inherited = true;
    }
    unit.startedAt = at; unit.startKey = key; unit.judgedFrom ??= at;
    unit.startFact = this.confirm({ kind: "bodyStarted", bodyUnitId: unit.id, lane: runtime.body.lane,
      actualStartMs: at, atMs: at, confirmedAt: Math.max(at, this.clock), phase: via === "down" ? "input" : "timeline",
      via, inputId: token?.inputId ?? null, provisional: via === "preheld" });
    if (at >= runtime.body.endMs) this.complete(unit, at, "lateStart", via === "down" ? "input" : "timeline", token?.inputId ?? null);
  }

  private hasHealthyPredecessor(unit: UnitRuntime): boolean {
    return this.chart.connections.filter(c => c.successorIndex === unit.body.body.source.noteIndex)
      .some(c => this.bodyByIndex.get(c.predecessorIndex)?.units.some(previous => previous.startedAt !== null && previous.failedAt === null));
  }

  private complete(unit: UnitRuntime, at: number, reason: "end" | "earlyUp" | "lateStart", phase: ExplicitConfirmationPhase, inputId: string | null): void {
    if (!this.open(unit) || unit.startedAt === null || at < unit.startedAt) return;
    unit.completedAt = at;
    unit.completeFact = this.confirm({ kind: "bodyCompleted", bodyUnitId: unit.id, lane: unit.body.body.lane,
      atMs: at, confirmedAt: Math.max(at, this.clock), phase, reason, inputId, provisional: phase === "timeline" });
    this.settleTicks(unit, at, phase, true);
  }

  /**
   * 한 몫의 실패를 확정하고 그 몫의 남은 틱 노트와 잃은 릴리즈를 종속 0점으로 정산한다. 실패는 연결된 다른 바디로 번지지 않는다.
   * 탭 없는 2→1 감소에서 앞 두 몫이 모두 실패해도 뒤 single은 자기 시작 조건(시작 창 안 새 down 또는 차트 시작 시각 hold)으로
   * 새로 시작하고, 시작하지 못하면 자기 시작 시간 초과로 실패한다(사용자 결정 2026-10-27).
   */
  private fail(unit: UnitRuntime, at: number, reason: "startTimeout" | "maintenance" | "tapMiss", causeFactId: string | null): void {
    if (!this.open(unit)) return;
    unit.failedAt = at;
    const fact = this.confirm({ kind: "bodyFailed", bodyUnitId: unit.id, lane: unit.body.body.lane,
      atMs: at, confirmedAt: Math.max(at, this.clock), phase: "deadline", reason, causeFactId, unscoredMiss: reason !== "tapMiss" });
    unit.failureFactId = fact.id;
    for (const item of this.items) if (!item.settlement && item.item.kind === "tick"
      && item.item.bodyIndex === unit.body.body.source.noteIndex && item.item.bodyUnit.ordinal === unit.ordinal) {
      this.settle(item, null, at, "deadline", null, null, fact.id);
    }
    this.settleLostReleases(unit.body, at, fact.id);
  }

  private settleLostReleases(runtime: BodyRuntime, at: number, cause: string): void {
    const failed = runtime.units.filter(unit => unit.failedAt !== null).length;
    for (const noteIndex of runtime.body.releaseIndices) {
      const releases = this.items.filter(item => item.item.kind === "release" && item.item.source.noteIndex === noteIndex);
      const decrease = releases.some(item => item.item.kind === "release" && item.item.boundaryKind === "decrease");
      const lost = decrease ? Math.min(releases.length, failed) : runtime.body.holdCount === 1
        ? (failed ? releases.length : 0) : releases.length === 1 ? Number(failed === 2) : failed;
      let remaining = lost - releases.filter(item => item.settlement?.outcome === "dependentZero").length;
      for (const item of [...releases].reverse()) if (!item.settlement && remaining > 0) {
        this.settle(item, null, at, "deadline", null, null, cause); remaining--;
      }
    }
  }

  private maintenanceDeadline(unit: UnitRuntime): number | undefined {
    if (!this.open(unit) || (unit.startTaps.length && !unit.reentered && unit.tapDecisionAt === null)
      || (unit.startedAt === null && unit.judgedFrom === null)) return undefined;
    // 탭은 처리했어도 두 번째 물리 키가 없어 실제 시작하지 못한 몫은 실제 down부터 부족 상태다.
    if (unit.startedAt === null) return unit.judgedFrom! + this.maintenanceGraceMs;
    return this.holds.failureDeadline(unit.body.body.lane, this.need(unit), { judgedFrom: unit.judgedFrom ?? unit.startedAt!,
      ...(unit.body.startTaps.length && !unit.reentered ? {} : { refillUntil: unit.body.activationStartMs + this.windows.GOOD }) });
  }

  private settle(runtime: ItemRuntime, grade: ExplicitGrade | null, at: number, phase: ExplicitConfirmationPhase,
    inputId: string | null = null, rawDeltaMs: number | null = null, causeFactId: string | null = null): void {
    if (runtime.settlement) return;
    const { item } = runtime;
    const timingDeltaMs = grade !== "miss" && item.kind !== "tick" && !item.grace ? rawDeltaMs : null;
    const fact = this.confirm({ kind: "settlement", itemId: item.id, itemKind: item.kind, lane: item.lane,
      atMs: at, confirmedAt: Math.max(at, this.clock), phase, outcome: grade === null ? "dependentZero" : "graded",
      grade, inputId, rawDeltaMs, timingDeltaMs, causeFactId });
    if (fact.kind !== "settlement") throw new Error("정산 사실 종류 오류");
    runtime.settlement = fact;
    if (grade === "miss" && item.kind === "tap" && item.trillZoneIndex !== undefined) this.trillKeysByZone.delete(item.trillZoneIndex);
  }

  private settleTicks(unit: UnitRuntime, at: number, phase: ExplicitConfirmationPhase, all = false): void {
    for (const item of this.items) if (!item.settlement && item.item.kind === "tick"
      && item.item.bodyIndex === unit.body.body.source.noteIndex && item.item.bodyUnit.ordinal === unit.ordinal
      && (all || item.item.timeMs <= at)) this.settle(item, "perfect", at, phase);
  }

  private reconcile(at: number, phase: ExplicitConfirmationPhase): void {
    for (const runtime of this.bodies) for (const unit of runtime.units) {
      if (!this.open(unit) || unit.startedAt === null || !this.filled(unit)) continue;
      this.settleTicks(unit, at, phase);
      if (at >= runtime.body.endMs) this.complete(unit, at, "end", phase, null);
    }
  }

  /** 점수·실패는 확정 사실이다. 입력 없는 S/E와 탭 기한의 충족 판단만 다시 계산한다. */
  private invalidateProgress(lane: number, at: number): void {
    for (const runtime of this.bodies.filter(runtime => runtime.body.lane === lane)) for (const unit of runtime.units) {
      if (unit.failedAt !== null) continue;
      const invalidated: string[] = [];
      if (unit.completeFact?.kind === "bodyCompleted" && unit.completeFact.provisional && unit.completedAt! > at) {
        invalidated.push(unit.completeFact.id); unit.completedAt = null; unit.completeFact = null;
      }
      if (unit.startFact?.kind === "bodyStarted" && unit.startFact.provisional && unit.startedAt! > at && unit.completedAt === null) {
        invalidated.push(unit.startFact.id); unit.startedAt = null; unit.startFact = null; unit.startKey = null;
        unit.inherited = false; unit.judgedFrom = null;
      }
      if (this.tapMissed(unit) && unit.tapDecisionAt !== null && unit.tapDecisionAt >= at) {
        unit.tapDecisionAt = null; unit.judgedFrom = unit.startedAt;
      }
      if (invalidated.length) this.confirm({ kind: "bodyProgressInvalidated", bodyUnitId: unit.id,
        invalidatedFactIds: Object.freeze(invalidated), lane, atMs: at, confirmedAt: this.clock, phase: "input" });
    }
    const timeline = this.timelineByLane.get(lane)!;
    const previous = this.timelineIndexByLane.get(lane)!;
    const index = timeline.findIndex(time => time > at);
    this.timelineIndexByLane.set(lane, Math.min(previous, index < 0 ? timeline.length : index));
  }

  private sweep(limit: number, includeTimelineAtLimit: boolean): void {
    while (true) {
      let next = Infinity;
      for (let lane = 1; lane <= 4; lane++) {
        const at = this.timelineByLane.get(lane)![this.timelineIndexByLane.get(lane)!] ?? Infinity;
        if (at < limit || (includeTimelineAtLimit && at === limit)) next = Math.min(next, at);
      }
      for (const runtime of this.items) if (!runtime.settlement && runtime.item.kind !== "tick") {
        const deadline = runtime.item.timeMs + this.windows.GOOD;
        if (deadline < limit) next = Math.min(next, deadline);
      }
      for (const runtime of this.bodies) for (const unit of runtime.units) {
        if (!this.open(unit)) continue;
        const deadline = this.unitDeadline(unit);
        if (deadline !== undefined && deadline < limit) next = Math.min(next, deadline);
      }
      if (next === Infinity) return;
      this.clock = Math.max(this.clock, next);
      for (let lane = 1; lane <= 4; lane++) {
        const timeline = this.timelineByLane.get(lane)!;
        const index = this.timelineIndexByLane.get(lane)!;
        if (timeline[index] !== next) continue;
        this.timelineIndexByLane.set(lane, index + 1);
        for (const runtime of this.bodies) if (runtime.body.lane === lane && runtime.activationStartMs === next) {
          for (const unit of runtime.units) this.tryStart(unit, next, "preheld", null);
        }
      }
      this.reconcile(next, "timeline");
      if (next === limit) continue;
      for (const runtime of this.items) if (!runtime.settlement && runtime.item.kind !== "tick" && runtime.item.timeMs + this.windows.GOOD === next) {
        this.settle(runtime, "miss", next, "deadline");
      }
      for (const runtime of this.bodies) for (const unit of [...runtime.units].reverse()) {
        if (!this.open(unit)) continue;
        if (unit.startTaps.length && !unit.reentered && unit.tapDecisionAt === null && unit.startTaps[0].item.timeMs + this.windows.GOOD === next) {
          unit.tapDecisionAt = next;
          if (!unit.inherited || unit.startedAt === null || !this.filled(unit)) this.fail(unit, next, "tapMiss", unit.startTaps[0].settlement!.id);
          else unit.judgedFrom = next;
        } else if (unit.startedAt === null && runtime.activationStartMs + this.windows.GOOD === next) this.fail(unit, next, "startTimeout", null);
        else if (this.maintenanceDeadline(unit) === next) this.fail(unit, next, "maintenance", null);
      }
    }
  }

  private unitDeadline(unit: UnitRuntime): number | undefined {
    if (unit.startTaps.length && !unit.reentered && unit.tapDecisionAt === null) return unit.startTaps[0].item.timeMs + this.windows.GOOD;
    if (!unit.reentered && unit.startedAt === null && this.tapSatisfied(unit)) return this.maintenanceDeadline(unit);
    return unit.startedAt === null ? unit.body.activationStartMs + this.windows.GOOD : this.maintenanceDeadline(unit);
  }

  private confirm(fact: FactInput): ExplicitConfirmedFact {
    const confirmed = Object.freeze({ ...fact, id: `fact:${this.facts.length}` });
    this.facts.push(confirmed); return confirmed;
  }
}
