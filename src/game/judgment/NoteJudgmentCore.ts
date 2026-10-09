import type { NoteEntity, RangeNote } from "../../shared/types";
import { JUDGMENT_WINDOWS, type JudgmentWindows } from "../../shared/constants";
import { ConnectionCorrections } from "./ConnectionCorrections";
import { ConfirmationCombo } from "./ConfirmationCombo";
import { compileJudgmentChart, type CompiledJudgmentChart } from "./compiledJudgmentChart";
import { PointJudgmentState, type PointCandidate } from "./PointJudgmentState";
import { ZeroHoldOnlyState } from "./ZeroHoldOnlyState";

/** A deliberately small seam between chart compilation and the judgment runtime. */
export interface JudgmentChartLike {
  readonly notes: readonly NoteEntity[];
  readonly noteTimesMs: ReadonlyMap<number, number> | readonly (number | undefined)[];
  readonly noteEndTimesMs?: ReadonlyMap<number, number> | readonly (number | undefined)[];
  /** Optional output of compiledJudgmentChart. */
  readonly units?: readonly CompiledUnit[];
  readonly scoreItems?: readonly { itemId: string; noteIndex: number; unitIndex?: number; weight?: number }[];
  readonly connections?: readonly { predecessorIndex: number; successorIndex: number; boundaryMs: number }[];
}
interface DirectCompiledChart {
  readonly rawNotes: readonly NoteEntity[];
  readonly noteTimesMs: ReadonlyMap<number, number> | readonly (number | undefined)[];
  readonly noteEndTimesMs: ReadonlyMap<number, number> | readonly (number | undefined)[];
  readonly notes: readonly { noteIndex: number; lane: number; startMs: number; endMs?: number; headIndex?: number; units: readonly { ordinal: number; endMs: number }[] }[];
  readonly connections: readonly { predecessorIndex: number; successorIndex: number; boundaryMs: number }[];
  readonly items: readonly { id: string; itemId?: string; kind: string; noteIndex: number; unitIndex?: number; unitOrdinal?: number; weight?: number }[];
  readonly trillZoneByNote?: ReadonlyMap<number, number>;
}

export interface CompiledUnit {
  noteIndex: number;
  unitIndex: number;
  lane: number;
  startMs: number;
  endMs: number;
  holdOnly?: boolean;
  predecessor?: number;
  successor?: number;
}

export type JudgmentEventKind = "head" | "release" | "holdOnly" | "maintenanceMiss" | "dependentZero";
export type JudgmentGrade = "perfect" | "great" | "good" | "goodTrill" | "miss";

export interface NoteJudgmentEvent {
  kind: JudgmentEventKind;
  noteIndex: number;
  unitIndex?: number;
  itemId?: string;
  grade: JudgmentGrade;
  deltaMs: number;
  inputAt: number | null;
  confirmedAt: number;
  /** Physical key belonging to the down/up which consumed this event. */
  key?: string;
  /** True for an actual keyup release; holdOnly and maintenance are false. */
  consumed: boolean;
  /** Explicitly distinguishes a connection from a scored judgment. */
  bodyState?: "active" | "inherited" | "failed" | "complete";
  phase?: "input" | "deadline";
}

export interface NoteJudgmentCoreOptions {
  windows?: JudgmentWindows;
  onConfirmed?: (event: NoteJudgmentEvent) => void;
  onBatchConfirmed?: (events: readonly NoteJudgmentEvent[], at: number) => void;
}

interface PressToken { key: string; lane: number; at: number; upAt?: number; correctionId?: string; used: boolean; valid: boolean; released: boolean; connectionConsumed: boolean; claimedAt?: number }
interface UnitState {
  noteIndex: number; unitIndex: number; lane: number; start: number; end: number;
  holdOnly: boolean; active: boolean; failed: boolean; complete: boolean;
  startedAt: number | null; registered: Set<string>; tokens: PressToken[];
  inherited: boolean; endResolved: boolean;
  terminal: boolean; forwarded: boolean;
  late: boolean;
  /**
   * The predecessor press carrying this unit's share of a headless inheritance
   * (RFD 0020 §2.14). Sibling units of one note never carry the same released
   * press; a new key that takes the unit over replaces it.
   */
  share?: PressToken;
}
/**
 * How a unit's share stands for a new down in its start window (RFD 0020 §2.14):
 * - unprepared: no predecessor continues it (an independent body or an increase unit, NJ-A06);
 * - prepared: a held key prepares or keeps it, or a head at its start decides it (§2.6, NJ-A04);
 * - releasedSatisfied: only released keys prepared it, and a released up at or after its E−Good satisfies it;
 * - releasedUnsatisfied: only released keys prepared it, and no released up satisfies it.
 */
type ShareState = "unprepared" | "prepared" | "releasedSatisfied" | "releasedUnsatisfied";
function isReleasedShare(state: ShareState): boolean { return state === "releasedSatisfied" || state === "releasedUnsatisfied"; }
interface PointState { noteIndex: number; at: number; lane: number; needed: number; done: boolean; missed: boolean; keys: Set<string> }
export interface JudgmentInput { key: string; lane?: number; type: "press" | "release" | "down" | "up" }

function timeAt(value: ReadonlyMap<number, number> | readonly (number | undefined)[], index: number): number | undefined {
  return Array.isArray(value) ? value[index] : (value as ReadonlyMap<number, number>).get(index);
}
function isRange(note: NoteEntity): note is RangeNote { return "endBeat" in note; }
function unitCount(note: NoteEntity): number { return note.type === "doubleLong" ? 2 : 1; }
function gradeFor(delta: number, windows: JudgmentWindows): JudgmentGrade {
  const a = Math.abs(delta);
  if (a <= windows.PERFECT) return "perfect";
  if (a <= windows.GREAT) return "great";
  if (a <= windows.GOOD) return "good";
  return "miss";
}

/**
 * Pure, clock-injected note judgment runtime. It has no renderer, score manager,
 * keyboard, or frame-loop dependency. Calls may be made in any frame sizes;
 * `advance` performs the same deadline sweep for every skipped interval.
 */
export class NoteJudgmentCore {
  readonly events: NoteJudgmentEvent[] = [];
  private readonly notes: readonly NoteEntity[];
  private readonly times: ReadonlyMap<number, number> | readonly (number | undefined)[];
  private readonly ends: ReadonlyMap<number, number> | readonly (number | undefined)[];
  private readonly windows: JudgmentWindows;
  private readonly onConfirmed?: (event: NoteJudgmentEvent) => void;
  private readonly onBatchConfirmed?: (events: readonly NoteJudgmentEvent[], at: number) => void;
  private currentCombo = 0;
  private readonly confirmationCombo = new ConfirmationCombo();
  private batchingEvents: NoteJudgmentEvent[] | undefined;
  private readonly itemQueues = new Map<string, string[]>();
  private readonly points: PointState[] = [];
  private readonly pointState: PointJudgmentState;
  private readonly zeroHoldState: ZeroHoldOnlyState;
  private readonly units: UnitState[] = [];
  private readonly unitsByNote = new Map<number, UnitState[]>();
  private readonly connectionAdjacency = new Map<number, Set<number>>();
  private readonly unitsByEnd = new Map<string, UnitState[]>();
  private readonly unitsByStart = new Map<string, UnitState[]>();
  private readonly forwardedCapacity = new Map<number, number>();
  private readonly carriedCapacity = new Map<number, number>();
  private readonly waivedSurplus = new Map<number, number>();
  private readonly held = new Map<string, PressToken>();
  private readonly pendingUps: PressToken[] = [];
  private readonly correctionLedgers = new Map<string, ConnectionCorrections>();
  private correctionSerial = 0;
  private readonly connections?: ReadonlySet<string>;
  private now = -Infinity;
  private observedRawAt: number | undefined;
  private observedConfirmedAt: number | undefined;

  /** Canonical adapter for compiledJudgmentChart output. */
  static fromCompiled(
    sourceNotes: readonly NoteEntity[],
    noteTimesMs: readonly number[],
    noteEndTimesMs: readonly (number | undefined)[],
    compiled: { connections: readonly { predecessorIndex: number; successorIndex: number; boundaryMs: number }[]; items: readonly { id: string; itemId?: string; kind: string; noteIndex: number; unitIndex?: number; unitOrdinal?: number; weight?: number }[] },
    options: NoteJudgmentCoreOptions = {},
  ): NoteJudgmentCore {
    const core = new NoteJudgmentCore({
      notes: sourceNotes,
      noteTimesMs,
      noteEndTimesMs,
      connections: compiled.connections,
      scoreItems: compiled.items.map(item => ({ itemId: item.id, noteIndex: item.noteIndex, unitIndex: item.unitOrdinal, weight: item.weight })),
    }, options);
    for (const item of compiled.items) {
      const key = `${item.noteIndex}:${item.kind}`;
      const queue = core.itemQueues.get(key) ?? []; queue.push(item.itemId ?? item.id); core.itemQueues.set(key, queue);
    }
    return core;
  }
  private itemIds = new Map<string, string>();

  constructor(chart: JudgmentChartLike | DirectCompiledChart, options?: NoteJudgmentCoreOptions);
  constructor(notes: readonly NoteEntity[], noteTimesMs: ReadonlyMap<number, number> | readonly number[], noteEndTimesMs?: ReadonlyMap<number, number> | readonly (number | undefined)[], options?: NoteJudgmentCoreOptions);
  constructor(
    chartOrNotes: JudgmentChartLike | DirectCompiledChart | readonly NoteEntity[],
    timesOrOptions: NoteJudgmentCoreOptions | ReadonlyMap<number, number> | readonly number[] = {},
    noteEndTimesMs: ReadonlyMap<number, number> | readonly (number | undefined)[] = new Map(),
    maybeOptions: NoteJudgmentCoreOptions = {},
  ) {
    const isNotes = Array.isArray(chartOrNotes);
    const isCompiled = !isNotes && "rawNotes" in (chartOrNotes as object);
    const compiled = isCompiled ? chartOrNotes as DirectCompiledChart : undefined;
    const chart: JudgmentChartLike = isNotes
      ? { notes: chartOrNotes as readonly NoteEntity[], noteTimesMs: timesOrOptions as ReadonlyMap<number, number> | readonly number[], noteEndTimesMs }
      : isCompiled
        ? { notes: compiled!.rawNotes, noteTimesMs: compiled!.noteTimesMs, noteEndTimesMs: compiled!.noteEndTimesMs, connections: compiled!.connections, scoreItems: compiled!.items.map(i => ({ itemId: i.itemId ?? i.id, noteIndex: i.noteIndex, unitIndex: i.unitIndex ?? i.unitOrdinal, weight: i.weight })) }
        : chartOrNotes as JudgmentChartLike;
    const options = isNotes ? maybeOptions : timesOrOptions as NoteJudgmentCoreOptions;
    this.notes = chart.notes;
    this.times = chart.noteTimesMs;
    this.ends = chart.noteEndTimesMs ?? new Map();
    this.connections = chart.connections ? new Set(chart.connections.map(c => `${c.predecessorIndex}:${c.successorIndex}`)) : undefined;
    if (compiled) for (const item of compiled.items) {
      const kind = item.kind;
      const key = `${item.noteIndex}:${kind}`;
      const queue = this.itemQueues.get(key) ?? [];
      queue.push(item.id); this.itemQueues.set(key, queue);
    }
    if (compiled) this.itemIds = new Map(compiled.items.map(item => [`${item.noteIndex}:${item.unitOrdinal ?? 0}:${item.id.split(":")[1] ?? "head"}`, item.id]));
    this.windows = options.windows ?? JUDGMENT_WINDOWS;
    const pointCompiled = compiled
      ? compiled as unknown as CompiledJudgmentChart
      : compileJudgmentChart(this.notes, this.times as readonly number[], this.ends as ReadonlyMap<number, number>);
    this.pointState = new PointJudgmentState(pointCompiled, this.windows, pointCompiled.trillZoneByNote);
    this.zeroHoldState = new ZeroHoldOnlyState(pointCompiled, this.windows.GOOD);
    this.onConfirmed = options.onConfirmed;
    this.onBatchConfirmed = options.onBatchConfirmed;
    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i]; const at = timeAt(this.times, i);
      if (at === undefined) continue;
      if (!isRange(note)) this.points.push({ noteIndex: i, at, lane: note.lane, needed: note.type === "double" ? 2 : 1, done: false, missed: false, keys: new Set() });
      else {
        const end = timeAt(this.ends, i);
        if (end === undefined) continue;
        for (let u = 0; u < unitCount(note); u++) this.units.push({ noteIndex: i, unitIndex: u, lane: note.lane, start: at, end, holdOnly: !!note.holdOnly, active: false, failed: false, complete: false, startedAt: null, registered: new Set(), tokens: [], inherited: false, endResolved: false, terminal: true, forwarded: false, late: false });
      }
    }
    for (const unit of this.units) {
      const group = this.unitsByNote.get(unit.noteIndex) ?? [];
      group.push(unit); this.unitsByNote.set(unit.noteIndex, group);
      const endKey = `${unit.lane}:${unit.end}`;
      const endGroup = this.unitsByEnd.get(endKey) ?? []; endGroup.push(unit); this.unitsByEnd.set(endKey, endGroup);
      const startKey = `${unit.lane}:${unit.start}`;
      const startGroup = this.unitsByStart.get(startKey) ?? []; startGroup.push(unit); this.unitsByStart.set(startKey, startGroup);
    }
    for (const connection of chart.connections ?? []) {
      const left = this.connectionAdjacency.get(connection.predecessorIndex) ?? new Set<number>();
      const right = this.connectionAdjacency.get(connection.successorIndex) ?? new Set<number>();
      left.add(connection.successorIndex); right.add(connection.predecessorIndex);
      this.connectionAdjacency.set(connection.predecessorIndex, left);
      this.connectionAdjacency.set(connection.successorIndex, right);
    }
    for (const u of this.units) {
      const successor = this.units.filter(v => v.lane === u.lane && v.start === u.end && v.noteIndex !== u.noteIndex)
        .sort((a, b) => a.noteIndex - b.noteIndex)[0];
      u.terminal = !successor || u.unitIndex >= this.units.filter(v => v.noteIndex === successor.noteIndex).length;
    }
    // Score-item endpoint capacity is independent of physical successor
    // ordinal. A source double followed by a single still has one valid
    // release slot, even though its second physical unit is non-terminal.
    for (const noteIndex of new Set(this.units.map(unit => unit.noteIndex))) {
      const releaseSlots = this.itemQueues.get(`${noteIndex}:release`)?.length ?? 0;
      if (releaseSlots <= 0) continue;
      for (const unit of this.units.filter(candidate => candidate.noteIndex === noteIndex)) {
        unit.terminal = unit.unitIndex < releaseSlots;
      }
    }
    // Runtime evaluation must follow chart time, independent of the raw note
    // array order. This lets a completed H source prepare its successor in
    // the same deadline pass even when callers store notes in reverse order.
    this.units.sort((a, b) => a.start - b.start || a.lane - b.lane || a.unitIndex - b.unitIndex || a.noteIndex - b.noteIndex);
  }

  get time(): number { return this.now; }
  get combo(): number { return this.currentCombo; }
  get bodyStates(): readonly { noteIndex: number; unitIndex: number; active: boolean; failed: boolean; complete: boolean; registeredKeys: readonly string[] }[] {
    return this.units.map(u => ({ noteIndex: u.noteIndex, unitIndex: u.unitIndex, active: u.active, failed: u.failed, complete: u.complete, registeredKeys: [...u.registered] }));
  }
  private orderInputs(inputs: readonly JudgmentInput[]): JudgmentInput[] {
    const buckets = new Map<string, JudgmentInput[]>();
    for (const input of inputs) (buckets.get(input.key) ?? (buckets.set(input.key, []), buckets.get(input.key)!)).push(input);
    const ordered: JudgmentInput[] = []; const cursors = new Map<string, number>();
    while (ordered.length < inputs.length) {
      let selectedKey: string | undefined; let selected: JudgmentInput | undefined;
      for (const [key, bucket] of buckets) {
        const candidate = bucket[cursors.get(key) ?? 0]; if (!candidate) continue;
        const candidatePhase = candidate.type === "up" || candidate.type === "release" ? 0 : 1;
        const selectedPhase = selected && (selected.type === "up" || selected.type === "release") ? 0 : 1;
        if (!selected || candidatePhase < selectedPhase) { selectedKey = key; selected = candidate; }
      }
      if (!selected || selectedKey === undefined) break;
      cursors.set(selectedKey, (cursors.get(selectedKey) ?? 0) + 1); ordered.push(selected);
    }
    return ordered;
  }
  get confirmed(): readonly NoteJudgmentEvent[] { return this.events; }
  get corrections(): ReadonlyMap<string, ConnectionCorrections> { return this.correctionLedgers; }

  processBatch(at: number, inputs: readonly JudgmentInput[]): void {
    this.prepareInputAt(at);
    // Deadlines crossed while moving to this timestamp are a prior logical
    // phase. They must be delivered before the current input batch and never
    // be re-delivered as part of it.
    const before = this.events.length;
    // Keys are independent, but a single key's down/up causality is sacred.
    // Stable key buckets make A-up/B-down permutations equivalent while
    // preserving A-down/A-up/A-down sequences.
    this.batchingEvents = [];
    try {
      for (const input of this.orderInputs(inputs)) {
        if (input.type === "press" || input.type === "down") this.press(input.key, at, input.lane);
        else this.release(input.key, at, input.lane);
      }
      this.advance(at);
    } finally {
      const batch = this.events.slice(before);
      const finalized = this.pointState.finalizeBatch(batch);
      finalized.forEach((event, index) => Object.assign(this.events[before + index], event));
      this.currentCombo = this.confirmationCombo.applyBatch(finalized);
      this.batchingEvents = undefined;
      for (const event of finalized) this.publishConfirmed(event);
      this.onBatchConfirmed?.(finalized, at);
    }
  }

  /**
   * Delivers an input observed after its raw timestamp.  The observation
   * clock is monotonic; rawAt is retained at this seam for adapters that
   * attach raw timing metadata while the state transition is observed now.
   */
  processObservedBatch(rawAt: number, inputs: readonly JudgmentInput[], observedAt: number): void {
    if (observedAt < this.now) throw new Error("관측 시각은 core 시간보다 과거일 수 없습니다");
    this.sweepBefore(observedAt);
    this.now = observedAt;
    this.observedRawAt = rawAt;
    this.observedConfirmedAt = observedAt;
    const before = this.events.length;
    this.batchingEvents = [];
    try {
      for (const selected of this.orderInputs(inputs)) {
        if (selected.type === "up" || selected.type === "release") this.release(selected.key, rawAt, selected.lane);
        else this.press(selected.key, rawAt, selected.lane);
      }
    } finally {
      this.advance(observedAt);
      this.flushBatch(before);
      this.observedRawAt = undefined;
      this.observedConfirmedAt = undefined;
    }
  }

  press(key: string, at: number = this.now, lane?: number): void {
    const observed = this.observedRawAt;
    if (observed === undefined) this.prepareInputAt(at);
    at = observed ?? at;
    const token: PressToken = { key, lane: lane ?? 1, at, used: false, valid: false, released: false, connectionConsumed: false };
    this.held.set(key, token);
    // A down is consumed by the earliest eligible point, then by a start unit;
    // startTargetFor tells when a start goes ahead of the point (RFD 0020 §2.14).
    const pointCandidate = this.pointState.peek((lane ?? 1) as 1 | 2 | 3 | 4, key, at);
    const point = pointCandidate && this.points.find(p => p.noteIndex === pointCandidate.noteIndex);
    const start = this.startTargetFor(key, at, lane, pointCandidate, point);
    if (start?.aheadOfPoint) {
      this.startByDown(start.unit, key, token, at); return;
    }
    if (pointCandidate && point && !point.keys.has(key)) {
      point.keys.add(key); point.done = point.keys.size >= point.needed; token.used = true; token.valid = true;
      const event = this.pointState.consume(pointCandidate, key, at);
      this.emit(event);
      this.activateForHead(point.noteIndex, key, token, at, point.keys.size - 1);
      return;
    }
    if (start) this.startByDown(start.unit, key, token, at);
  }

  /**
   * The unit a new down of key starts, and whether that start goes ahead of
   * the Point candidate (RFD 0020 §2.14). Units whose start window holds the
   * down are candidates, earliest S first; at one S a share nobody prepared
   * comes first (user decision ①, 2026-10-01). By shareState:
   * - unprepared: the down starts it (NJ-A06);
   * - prepared: with a Point in the window, the Point keeps the down (NJ-A04);
   * - releasedSatisfied: taken over until min(E, S+Good), ahead of a later
   *   Point; a later down goes on to later notes (decision ②). The head at its
   *   own end continues it through the released up and keeps the down
   *   (decision ④, 2026-10-01);
   * - releasedUnsatisfied: taken over until S+Good like an unstarted body
   *   (decision ③), ahead of any Point, its end head included (decision ④,
   *   2026-10-03).
   * Order and takeover read the share through connectedPredecessor, the Point
   * rule through preparingPredecessor; the two differ (see both). A released
   * key's registration blocks no new down on its note, the same key pressed
   * again included (registersKey).
   */
  private startTargetFor(key: string, at: number, lane: number | undefined, pointCandidate: PointCandidate | undefined,
    point: PointState | undefined): { unit: UnitState; aheadOfPoint: boolean } | undefined {
    const inStartWindow = (u: UnitState) => (lane === undefined || u.lane === lane) && Math.abs(at - u.start) <= this.windows.GOOD;
    // Open to a down: alive, not a zero-length holdOnly, and either not started
    // yet (canStart) or a released preparation, which the down takes over.
    const open = (u: UnitState) => !u.failed && !u.complete && !(u.holdOnly && u.start === u.end) &&
      (u.active ? this.releasedPreparation(u) : this.canStart(u));
    // The key must be new to the note; u's own registrations do not count when the down takes u over.
    const keyOnNote = (u: UnitState) => (this.unitsByNote.get(u.noteIndex) ?? [])
      .some(other => (other !== u || !u.active) && this.registersKey(other, key));
    const states = new Map<UnitState, ShareState>();
    for (const u of this.units) {
      if (!inStartWindow(u) || !open(u) || keyOnNote(u)) continue;
      const state = this.shareState(u, this.connectedPredecessor(u));
      // An inherited share its released up satisfies is open only until E (decision ②).
      if (u.active && state === "releasedSatisfied" && at > u.end) continue;
      states.set(u, state);
    }
    const prepared = (u: UnitState) => states.get(u) !== "unprepared";
    const candidates = [...states.keys()].sort((a, b) => a.start - b.start || Number(prepared(a)) - Number(prepared(b)));
    if (!pointCandidate) return candidates.length > 0 ? { unit: candidates[0], aheadOfPoint: true } : undefined;
    const pointIsEndHead = (u: UnitState) => point !== undefined && point.lane === u.lane && point.at === u.end;
    const takesOverBeforePoint = (u: UnitState) => states.get(u) === "releasedUnsatisfied" ||
      states.get(u) === "releasedSatisfied" && !pointIsEndHead(u);
    // With a Point in the window, a share an unfinished predecessor still
    // continues goes to the Point unless it is a released share taken over first.
    const unit = candidates.find(u => this.shareState(u, this.preparingPredecessor(u)) === "unprepared" || takesOverBeforePoint(u));
    if (!unit) return undefined;
    // The start goes ahead only when its S is before the Point. A successor
    // whose live predecessor already registered as many keys as it has units
    // is prepared in full, so then only a released-share takeover goes ahead.
    const preparedSuccessor = this.units.some(predecessor => predecessor.active && !predecessor.failed &&
      predecessor.end === unit.start && predecessor.lane === unit.lane &&
      predecessor.registered.size >= (this.unitsByNote.get(unit.noteIndex)?.length ?? 0));
    return { unit, aheadOfPoint: unit.start < pointCandidate.timeMs && (takesOverBeforePoint(unit) || !preparedSuccessor) };
  }

  release(key: string, at: number = this.now, lane?: number): void {
    const observed = this.observedRawAt;
    if (observed === undefined) this.prepareInputAt(at);
    at = observed ?? at;
    const token = this.held.get(key);
    if (!token) return;
    token.upAt = at;
    // A share this up releases before its unit's start (an up observed after
    // S with an earlier raw time, or a successor inherited by this very up) is
    // chosen again as at S, before and after the up is resolved (§2.14).
    this.reselectShares(token);
    this.resolveUp(token, key, at, lane);
    this.reselectShares(token);
  }

  private resolveUp(token: PressToken, key: string, at: number, lane?: number): void {
    for (const success of this.zeroHoldState.release(key, lane ?? 1, at, true)) {
      const unit = this.units.find(candidate => candidate.noteIndex === success.noteIndex && candidate.unitIndex === success.unitIndex);
      if (unit) unit.complete = true;
      this.emit({ kind: "holdOnly", noteIndex: success.noteIndex, unitIndex: success.unitIndex, itemId: success.itemId, grade: "perfect", deltaMs: 0, inputAt: at, confirmedAt: at, consumed: false, bodyState: "complete" });
    }
    // The up itself is not consumed by holdOnly, but observing it at/after E
    // still lets the maintained unit settle before the physical key leaves.
    // A unit kept only by released keys waits for a new key or S+Good. When
    // this up releases the unit's own last held key before the successor's
    // start, the preparation is void: the successor inherits the pending up
    // at S only provisionally (RFD 0020 §2.14). While another held key still
    // prepares it, this up may finish it now as before (NJ-H03·H07).
    const deferred: UnitState[] = [];
    for (const u of this.units.filter(u => u.active && !u.failed && u.holdOnly && u.end - this.windows.GOOD <= at && (lane === undefined || u.lane === lane) && !this.releasedPreparation(u))) {
      if (this.isHeld(u) || at >= u.end - this.windows.GOOD) {
        if (!u.complete) {
          u.complete = true;
          this.emit({ kind: "holdOnly", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "perfect", deltaMs: 0, inputAt: at, confirmedAt: at, consumed: false, bodyState: "complete" });
        }
        const voidsPreparation = u.tokens.includes(token) && this.heldPreparations(u) <= 1;
        for (const successor of this.units.filter(v => v.start === u.end && v.lane === u.lane && !v.active && !v.failed && !v.complete && Math.abs(at - v.end) <= this.windows.GOOD)) {
          if (at > successor.start || !voidsPreparation) this.tryInherit(successor, u.end);
          else deferred.push(successor);
        }
      }
    }
    this.held.delete(key);
    // A deferred successor still owns this up as a §2.6 candidate of the head
    // at its end, exactly as an immediate inheritance would have registered it.
    const correction = this.registerConnectionUp(token, key, at, deferred);
    if (correction?.status === "absorbed") {
      // The head at the deferred successor's end already succeeded, so this up
      // is its swap now: the successor inherits the up first and is continued
      // through it, as when the up waits for that head (activateForHead). Only
      // a successor ending at the boundary whose ledger absorbed the up is
      // continued; when an earlier boundary absorbed it, the others still
      // choose their share at S (§2.14).
      const continued = deferred.filter(unit => unit.end === correction.end && unit.lane === correction.lane);
      this.pendingUps.push(token);
      for (const successor of continued) this.tryInherit(successor, successor.start);
      const index = this.pendingUps.indexOf(token); if (index >= 0) this.pendingUps.splice(index, 1);
      token.connectionConsumed = true;
      const source = continued.find(unit => unit.active && !unit.failed && !unit.forwarded && unit.tokens.includes(token));
      if (source) { source.complete = true; source.forwarded = true; }
      return;
    }
    if (correction?.status === "pending") {
      this.pendingUps.push(token);
      return;
    }
    // A released share is judged at S+Good from its own key (§2.14): it takes
    // no other key's up, and its key's up is no release of a sibling share.
    const candidate = this.units.filter(u => u.active && u.terminal && !u.failed && !u.complete && !u.holdOnly && !u.endResolved &&
      !this.awaitsReleasedShare(u, token) && (lane === undefined || u.lane === lane) && Math.abs(at - u.end) <= this.windows.GOOD &&
      token.valid && !token.released && !token.connectionConsumed && this.pressPool(u).includes(token))
      .sort((a, b) => a.end - b.end)[0];
    if (!candidate) {
      this.pendingUps.push(token);
      return;
    }
    const related = this.relatedUnits(candidate);
    const obligations = related.filter(unit => unit.active && !unit.failed && !unit.complete).length;
    const liveNote = related.filter(unit => unit.active && !unit.failed && !unit.complete).sort((a, b) => b.start - a.start)[0];
    const exemption = liveNote ? this.waivedSurplus.get(liveNote.noteIndex) ?? 0 : 0;
    const heldCount = this.pressPool(candidate).filter(press => press.valid && !press.released && this.held.get(press.key) === press).length;
    if (heldCount - exemption >= obligations) {
      this.pendingUps.push(token); return;
    }
    token.released = true; candidate.endResolved = true; candidate.complete = true;
    this.emit({ kind: "release", noteIndex: candidate.noteIndex, unitIndex: candidate.unitIndex, grade: gradeFor(at - candidate.end, this.windows), deltaMs: at - candidate.end, inputAt: at, confirmedAt: at, key, consumed: true, bodyState: "complete" });
  }

  /** Advance through chart boundaries so sparse frames cannot skip state transitions. */
  advance(at: number): void {
    if (at < this.now) throw new Error("NoteJudgmentCore 시간은 뒤로 갈 수 없습니다");
    if (this.batchingEvents === undefined) {
      this.sweepBefore(at);
      const before = this.events.length;
      this.batchingEvents = [];
      try { this.evaluateAt(at); } finally { this.flushBatch(before); }
      return;
    }
    this.evaluateAt(at);
  }

  private sweepBefore(at: number): void {
    const boundaries = new Set<number>();
    for (const point of this.points) {
      boundaries.add(point.at);
      boundaries.add(point.at + this.windows.GOOD);
    }
    for (const unit of this.units) {
      boundaries.add(unit.start); boundaries.add(unit.end);
      boundaries.add(unit.start + this.windows.GOOD); boundaries.add(unit.end + this.windows.GOOD);
    }
    for (const time of [...boundaries].filter(t => t >= this.now && t < at).sort((a, b) => a - b)) {
      const before = this.events.length;
      this.batchingEvents = [];
      const isDeadline = this.units.some(unit => unit.start + this.windows.GOOD === time || unit.end + this.windows.GOOD === time) ||
        this.points.some(point => point.at + this.windows.GOOD === time);
      try { this.evaluateAt(time, isDeadline); } finally { this.flushBatch(before); }
    }
  }

  private flushBatch(before: number): void {
    const batch = this.events.slice(before);
    if (batch.length === 0) { this.batchingEvents = undefined; return; }
    const finalized = this.pointState.finalizeBatch(batch);
    finalized.forEach((event, index) => Object.assign(this.events[before + index], event));
    this.batchingEvents = undefined;
    let start = 0;
    while (start < finalized.length) {
      const first = finalized[start];
      let end = start + 1;
      while (end < finalized.length && finalized[end].confirmedAt === first.confirmedAt && (finalized[end].phase ?? "input") === (first.phase ?? "input")) end++;
      const group = finalized.slice(start, end);
      this.currentCombo = this.confirmationCombo.applyBatch(group);
      for (const event of group) this.publishConfirmed(event);
      this.onBatchConfirmed?.(group, first.confirmedAt);
      start = end;
    }
  }

  /** Evaluate one logical timestamp. Deadline helpers intentionally remain strict. */
  private evaluateAt(at: number, inclusiveDeadline = false): void {
    if (at < this.now) throw new Error("NoteJudgmentCore 시간은 뒤로 갈 수 없습니다");
    this.now = at;
    for (const [ledgerKey, ledger] of this.correctionLedgers) {
      const boundaryAt = Number(ledgerKey.slice(ledgerKey.indexOf(":") + 1));
      const ledgerDeadline = boundaryAt + this.windows.GOOD;
      if (at < ledgerDeadline || (at === ledgerDeadline && !inclusiveDeadline)) continue;
      ledger.headWindowClose();
      if (ledger.successfulHeads === 0) continue;
      for (const pending of [...this.pendingUps]) {
        if (!pending.correctionId || !ledger.available.some(record => record.id === pending.correctionId)) continue;
        const upAt = pending.upAt ?? pending.at;
        // A release event needs a release score item left on that note. A
        // continuing body (e.g. a single before an increase) owns none, so an
        // up near its end must not become a release there. A released share
        // and its key's up are judged at that share's S+Good (§2.14).
        const candidate = this.units.filter(unit => unit.active && !unit.failed && !unit.complete && !unit.holdOnly &&
          !this.awaitsReleasedShare(unit, pending) &&
          (this.itemQueues.get(`${unit.noteIndex}:release`)?.length ?? 0) > 0 &&
          Math.abs(upAt - unit.end) <= this.windows.GOOD && unit.tokens.some(token => token === pending || token.key === pending.key && !token.released && !token.connectionConsumed)).sort((a, b) => a.end - b.end)[0];
        const authority = candidate?.tokens.find(token => token === pending || token.key === pending.key && !token.released && !token.connectionConsumed);
        if (!candidate || !authority) continue;
        authority.released = true; candidate.endResolved = true; candidate.complete = true;
        // Defensive (no known outcome depends on it): like every path that spends an up, reselect the shares it carried (§2.14).
        this.reselectShares(authority);
        const index = this.pendingUps.indexOf(pending); if (index >= 0) this.pendingUps.splice(index, 1);
        this.emit({ kind: "release", noteIndex: candidate.noteIndex, unitIndex: candidate.unitIndex, grade: gradeFor(upAt - candidate.end, this.windows), deltaMs: upAt - candidate.end, inputAt: upAt, confirmedAt: ledgerDeadline, key: pending.key, consumed: true, bodyState: "complete", phase: "deadline" });
      }
    }
    const zeroHeld = [...this.held.values()].map(token => ({ key: token.key, lane: token.lane, at: token.at }));
    for (const success of this.zeroHoldState.observeThrough(at, zeroHeld)) {
      const unit = this.units.find(candidate => candidate.noteIndex === success.noteIndex && candidate.unitIndex === success.unitIndex);
      if (unit) unit.complete = true;
      this.emit({ kind: "holdOnly", noteIndex: success.noteIndex, unitIndex: success.unitIndex, itemId: success.itemId, grade: "perfect", deltaMs: 0, inputAt: null, confirmedAt: at, consumed: false, bodyState: "complete" });
    }
    for (const failure of this.zeroHoldState.expireBefore(at, inclusiveDeadline)) {
      const unit = this.units.find(candidate => candidate.noteIndex === failure.noteIndex && candidate.unitIndex === failure.unitIndex);
      if (unit) unit.failed = true;
      this.emit({ kind: "maintenanceMiss", noteIndex: failure.noteIndex, unitIndex: failure.unitIndex, grade: "miss", deltaMs: this.windows.GOOD, inputAt: null, confirmedAt: failure.deadline, consumed: false, phase: "deadline", bodyState: "failed" });
      this.emit({ kind: "dependentZero", noteIndex: failure.noteIndex, unitIndex: failure.unitIndex, itemId: failure.itemId, grade: "miss", deltaMs: 0, inputAt: null, confirmedAt: failure.deadline, consumed: false, phase: "deadline", bodyState: "failed" });
    }
    // Start deadline is S+Good. Release deadline is E+Good.
    for (const expired of this.pointState.expireBefore(at, inclusiveDeadline)) {
      const point = this.points.find(p => p.noteIndex === expired.noteIndex);
      if (!point) continue;
      const firstMiss = !point.missed;
      point.done = true; point.missed = true;
      this.emit(expired);
      if (!firstMiss) continue;
      for (const u of this.units.filter(u => u.start === point.at && u.lane === point.lane && !u.active && !u.complete && !u.failed)) {
        const itemId = this.takeUnitScoreItem(u);
        if (itemId) this.emit({ kind: "dependentZero", noteIndex: u.noteIndex, unitIndex: u.unitIndex, itemId, grade: "miss", deltaMs: 0, inputAt: null, confirmedAt: point.at + this.windows.GOOD, consumed: false, bodyState: "failed" });
        u.failed = true;
      }
      // A provisional connection may have activated the successor before its
      // head deadline.  It has no physical hold to maintain: when that head
      // misses, settle its endpoint exactly once as dependentZero rather than
      // manufacturing a body maintenance miss.
      for (const u of this.units.filter(u => u.start === point.at && u.lane === point.lane && u.active && !u.complete && !u.failed &&
        u.tokens.some(token => this.pendingUps.includes(token) && (token.upAt ?? token.at) < u.start))) {
        const itemId = this.takeUnitScoreItem(u);
        if (itemId) this.emit({ kind: "dependentZero", noteIndex: u.noteIndex, unitIndex: u.unitIndex, itemId, grade: "miss", deltaMs: 0, inputAt: null, confirmedAt: point.at + this.windows.GOOD, consumed: false, bodyState: "failed" });
        u.failed = true;
      }
      for (const u of this.units.filter(u => u.end === point.at && u.lane === point.lane && u.active && !u.complete && !u.failed)) u.failed = true;
      // An up just after the boundary stays pending in this boundary's ledger
      // until this deadline (RFD 0020 §2.12). When the head misses, a
      // successor kept alive only by that up settles exactly as if the up had
      // come before the boundary: dependentZero, no maintenance or release
      // Miss. A successor still held by another registered key keeps going.
      const ledger = this.correctionLedgers.get(`${point.lane}:${point.at}`);
      for (const u of this.units.filter(u => u.start === point.at && u.lane === point.lane && u.active && !u.complete && !u.failed &&
        u.tokens.some(token => this.pendingUps.includes(token) && (ledger?.all.some(record => record.id === token.correctionId) ?? false)) &&
        !this.isHeld(u))) {
        const itemId = this.takeUnitScoreItem(u);
        if (itemId) this.emit({ kind: "dependentZero", noteIndex: u.noteIndex, unitIndex: u.unitIndex, itemId, grade: "miss", deltaMs: 0, inputAt: null, confirmedAt: point.at + this.windows.GOOD, consumed: false, bodyState: "failed" });
        u.failed = true;
      }
    }
    this.connectPreparedBodies(at);
    for (const u of this.units) {
      if (u.holdOnly && u.start === u.end) continue;
      if (!u.active && !u.failed && !u.complete && at >= u.start) this.tryInherit(u, at);
      if (!u.active && !u.failed && !u.complete && (at > u.start + this.windows.GOOD || (inclusiveDeadline && at >= u.start + this.windows.GOOD))) {
        u.failed = true;
        this.emit({ kind: "maintenanceMiss", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "miss", deltaMs: this.windows.GOOD, inputAt: null, confirmedAt: u.start + this.windows.GOOD, consumed: false, bodyState: "failed" });
        const itemId = this.takeUnitScoreItem(u);
        if (itemId) this.emit({ kind: "dependentZero", noteIndex: u.noteIndex, unitIndex: u.unitIndex, itemId, grade: "miss", deltaMs: 0, inputAt: null, confirmedAt: u.start + this.windows.GOOD, consumed: false, bodyState: "failed" });
      }
      if (this.releasedPreparation(u) && (at > u.start + this.windows.GOOD || (inclusiveDeadline && at >= u.start + this.windows.GOOD))) this.settleReleasedPreparation(u);
      const pendingBoundaryUp = this.pendingUps.some(up => Math.abs((up.upAt ?? up.at) - u.end) <= this.windows.GOOD);
      // A pending up can provisionally wake a continuation while its source
      // head is still unresolved.  Keep that unit alive until the connection
      // ledger closes; it is not the same as a physically held token, but it
      // must not become an early maintenance miss either.  An up just after
      // the boundary stays pending in that boundary's ledger in the same way
      // until the connection head's Good window closes (RFD 0020 §2.12).
      const pendingToken = u.tokens.some(token => this.pendingUps.includes(token) && ((token.upAt ?? token.at) < u.start ||
        (token.correctionId !== undefined && (this.correctionLedgers.get(`${u.lane}:${u.start}`)?.pending.some(record => record.id === token.correctionId) ?? false))));
      if (u.active && !u.failed && !u.complete && !u.forwarded && at < u.end && !this.isHeld(u) && !pendingBoundaryUp && !pendingToken) {
        u.failed = true;
        this.emit({ kind: "maintenanceMiss", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "miss", deltaMs: at - u.start, inputAt: null, confirmedAt: at, consumed: false, bodyState: "failed" });
        const itemId = this.takeUnitScoreItem(u);
        if (itemId) this.emit({ kind: "dependentZero", noteIndex: u.noteIndex, unitIndex: u.unitIndex, itemId, grade: "miss", deltaMs: 0, inputAt: null, confirmedAt: at, consumed: false, bodyState: "failed" });
      }
      if (u.active && !u.failed && !u.complete && u.holdOnly && at >= u.end && this.isHeld(u)) {
        u.complete = true;
        this.emit({ kind: "holdOnly", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "perfect", deltaMs: 0, inputAt: null, confirmedAt: u.end, consumed: false, bodyState: "complete" });
      }
      const blockedByMissedHead = this.points.some(p => p.missed && p.lane === u.lane && p.at === u.end);
      // A continuing body owns no release item and only had to be held to its
      // E−Good. Reaching E+Good alive means its key stayed to E−Good, so it
      // completes without a Miss; a failure to continue counts once on the
      // successor (RFD 0020 §2.14). A head boundary keeps §2.12.
      const continuing = !u.terminal && !u.holdOnly && !this.points.some(p => p.lane === u.lane && p.at === u.end);
      if (u.active && !u.failed && !u.complete && !u.forwarded && (at > u.end + this.windows.GOOD || (inclusiveDeadline && at >= u.end + this.windows.GOOD))) {
        if (continuing) { u.complete = true; continue; }
        u.failed = true;
        // A holdOnly end is a Perfect/Miss state judgment and owns no release
        // item (#180). A unit still unresolved here fails once as a state Miss
        // and settles the note's next holdOnly item as dependent 0. A forwarded
        // holdOnly unit is resolved before: held to its end, completed by an up
        // at or after E−Good, or, kept only by a released share, settled at
        // S+Good (§2.14).
        if (u.terminal && !u.holdOnly && !blockedByMissedHead) this.emit({ kind: "release", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "miss", deltaMs: this.windows.GOOD, inputAt: null, confirmedAt: u.end + this.windows.GOOD, consumed: false, bodyState: "failed" });
        else {
          this.emit({ kind: "maintenanceMiss", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "miss", deltaMs: this.windows.GOOD, inputAt: null, confirmedAt: u.end + this.windows.GOOD, consumed: false, bodyState: "failed" });
          const itemId = u.holdOnly ? this.takeUnitScoreItem(u) : undefined;
          if (itemId) this.emit({ kind: "dependentZero", noteIndex: u.noteIndex, unitIndex: u.unitIndex, itemId, grade: "miss", deltaMs: 0, inputAt: null, confirmedAt: u.end + this.windows.GOOD, consumed: false, bodyState: "failed" });
        }
      }
    }
  }
  update(at: number): void { this.advance(at); }
  handlePress(key: string, at: number): void { this.press(key, at); }
  handleRelease(key: string, at: number): void { this.release(key, at); }

  private prepareInputAt(at: number): void {
    if (at < this.now) throw new Error("NoteJudgmentCore 시간은 뒤로 갈 수 없습니다");
    // Keep the input phase just before the timestamp; strict deadline
    // handling then lets an exact-boundary input be consumed before close.
    if (at > this.now && Number.isFinite(this.now)) this.sweepBefore(at);
    this.now = at;
  }

  /**
   * Before it starts, a unit whose predecessor body is still in progress takes
   * a new down only as an increase unit beyond that note's units, or as a
   * share only released keys prepared (RFD 0020 §2.14). Otherwise the
   * predecessor decides it: a held key's share is inherited, never started by
   * another down (§2.1).
   */
  private canStart(u: UnitState): boolean {
    const predecessor = this.preparingPredecessor(u);
    if (!predecessor) return true;
    if (u.unitIndex >= (this.unitsByNote.get(predecessor.noteIndex)?.length ?? 0)) return true;
    return isReleasedShare(this.shareState(u, predecessor));
  }
  /**
   * A unit on u's lane ending at u's start that is still in progress (active,
   * not failed, not complete), whether or not the chart connects it. Unlike
   * connectedPredecessor, a predecessor already complete (e.g. a holdOnly that
   * an up at its E−Good finished) no longer holds u: canStart and the Point
   * rule of startTargetFor then see u as unprepared.
   */
  private preparingPredecessor(u: UnitState): UnitState | undefined {
    return this.units.find(other => other !== u && other.lane === u.lane && other.end === u.start &&
      other.active && !other.failed && !other.complete);
  }
  /**
   * The predecessor inheritance continues u from: a live (active, not failed)
   * unit ending at u's start, of a note the chart connects to u's (tryInherit
   * also requires a registered key). A complete unit still counts, as in
   * continuingCapacity. The share order of a new down (decision ①) and its
   * released-share takeover read u's share through it.
   */
  private connectedPredecessor(u: UnitState): UnitState | undefined {
    return (this.unitsByEnd.get(`${u.lane}:${u.start}`) ?? []).find(p => p.active && !p.failed &&
      (!this.connections || this.connections.has(`${p.noteIndex}:${u.noteIndex}`)));
  }
  private hasHead(u: UnitState): boolean {
    return this.points.some(point => point.lane === u.lane && point.at === u.start);
  }
  /** Keys of the predecessor note still held: only these keep preparing its successor (§2.14). */
  private heldPreparations(predecessor: UnitState): number {
    const tokens = new Set((this.unitsByNote.get(predecessor.noteIndex) ?? []).flatMap(unit => unit.tokens));
    return [...tokens].filter(token => token.valid && !token.released && !token.connectionConsumed &&
      this.held.get(token.key) === token).length;
  }
  /**
   * A press released at or before the start of the inherited headless unit u
   * it prepared (RFD 0020 §2.14): that preparation is void. Head boundaries
   * keep their §2.6/§2.12 provisional connection.
   */
  private voidPreparation(token: PressToken, u: UnitState): boolean {
    return u.inherited && !this.hasHead(u) && this.releasedBefore(token, u);
  }
  /**
   * A live unit whose own share is a void preparation (§2.14): a new down in
   * the start window takes the unit over; otherwise S+Good decides it from
   * the released hold. Only this unit's share counts, so a key still held for
   * a sibling share neither keeps nor blocks it.
   */
  private releasedPreparation(u: UnitState): boolean {
    return u.active && !u.failed && !u.complete && u.share !== undefined && this.voidPreparation(u.share, u);
  }
  /** A key's registration on u, except a released key's void preparation (§2.14). */
  private registersKey(u: UnitState, key: string): boolean {
    return u.tokens.some(token => token.key === key && !this.voidPreparation(token, u));
  }
  private releasedBefore(token: PressToken, u: UnitState): boolean {
    return token.upAt !== undefined && token.upAt <= u.start;
  }
  /**
   * u's ShareState seen through predecessor: connectedPredecessor or
   * preparingPredecessor, as the rule asks. A started unit is released only
   * while it is a released preparation, and its own share's up decides whether
   * it is satisfied. Before S no share is chosen yet, so the note's units fill
   * in unit order: first from the predecessor's held keys, then from released
   * ups that satisfy their unit. A head at S keeps its §2.6/§2.12 connection,
   * so its share is never a released one.
   */
  private shareState(u: UnitState, predecessor: UnitState | undefined): ShareState {
    if (u.active) {
      if (!this.releasedPreparation(u)) return "prepared";
      return this.upSatisfies(u.share!, u) ? "releasedSatisfied" : "releasedUnsatisfied";
    }
    if (!predecessor || u.unitIndex >= this.continuingCapacity(predecessor, u)) return "unprepared";
    const held = this.heldPreparations(predecessor);
    if (this.hasHead(u) || u.unitIndex < held) return "prepared";
    return u.unitIndex < held + this.satisfyingReleasedUps(predecessor, u) ? "releasedSatisfied" : "releasedUnsatisfied";
  }
  /** The press's up is at or after u's E−Good, so it satisfies u by the §2.14 short body rule. */
  private upSatisfies(token: PressToken, u: UnitState): boolean {
    return token.upAt !== undefined && token.upAt >= u.end - this.windows.GOOD;
  }
  /** Released ups in the predecessor's press pool that still prepare u and satisfy it, except another note's release. */
  private satisfyingReleasedUps(predecessor: UnitState, u: UnitState): number {
    return this.pressPool(predecessor).filter(token => this.upSatisfies(token, u) && this.prepares(token, u) &&
      !this.releaseOfOtherNote(token, u)).length;
  }
  /**
   * The press's up is the release another note's released share takes at its
   * S+Good. One up settles one release, so it carries or satisfies no share of
   * u's note; a holdOnly completion does not spend it (§2.3).
   */
  private releaseOfOtherNote(token: PressToken, u: UnitState): boolean {
    return this.units.some(v => v.noteIndex !== u.noteIndex && v.share === token && !v.holdOnly && this.judgesReleasedShare(v));
  }
  /**
   * A new down starts u. Over a released preparation the new key takes that
   * share over (§2.14): only the released presses leave u, while a sibling
   * share's key still held stays registered.
   */
  private startByDown(u: UnitState, key: string, token: PressToken, at: number): void {
    token.used = true; token.valid = true;
    const takeover = u.active;
    // A start on a share an unfinished predecessor continues may forward it (below).
    const preparing = takeover ? undefined : this.preparingPredecessor(u);
    const predecessor = preparing && this.shareState(u, preparing) !== "unprepared" ? preparing : undefined;
    if (takeover) {
      const kept = u.tokens.filter(press => !this.releasedBefore(press, u));
      u.tokens.length = 0; u.tokens.push(...kept);
      u.registered.clear(); for (const press of kept) u.registered.add(press.key);
    }
    this.startUnit(u, key, token, at, false);
    // Once no held key prepares the predecessor, its released share continues
    // through the new key, as an inheritance would forward it.
    if (predecessor && this.heldPreparations(predecessor) === 0) this.forwardOne(predecessor);
  }
  /**
   * No new key took u over by S+Good: the released key of u's own share
   * decides it (§2.14). Held to E−Good, holdOnly is Perfect and a terminal
   * body takes that up as its real release graded by the up time. Released
   * before E−Good, the share was not continued and fails as a start failure.
   * A continuing body has no judgment here and is left to its own end
   * boundary, as is a body whose end has a head: there the up stays a §2.6
   * connection candidate of that head. A share decided after S+Good is
   * confirmed now, never in the past (§2.9).
   */
  private settleReleasedPreparation(u: UnitState): void {
    if (!this.settlesReleasedShare(u)) return;
    const token = u.share;
    if (!token) return;
    const upAt = token.upAt ?? token.at;
    // Defensive: every known input settles exactly at S+Good; a later settlement must not confirm in the past (§2.9).
    const confirmedAt = Math.max(u.start + this.windows.GOOD, this.now);
    if (upAt < u.end - this.windows.GOOD || token.released || token.connectionConsumed) {
      u.failed = true;
      this.emit({ kind: "maintenanceMiss", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "miss", deltaMs: this.windows.GOOD, inputAt: null, confirmedAt, consumed: false, bodyState: "failed" });
      const itemId = this.takeUnitScoreItem(u);
      if (itemId) this.emit({ kind: "dependentZero", noteIndex: u.noteIndex, unitIndex: u.unitIndex, itemId, grade: "miss", deltaMs: 0, inputAt: null, confirmedAt, consumed: false, bodyState: "failed" });
      return;
    }
    u.complete = true;
    if (u.holdOnly) {
      this.emit({ kind: "holdOnly", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "perfect", deltaMs: 0, inputAt: upAt, confirmedAt, consumed: false, bodyState: "complete", phase: "deadline" });
      return;
    }
    token.released = true; u.endResolved = true;
    // A later note that chose this up as its share chooses again (§2.14).
    this.reselectShares(token);
    const index = this.pendingUps.indexOf(token); if (index >= 0) this.pendingUps.splice(index, 1);
    this.emit({ kind: "release", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: gradeFor(upAt - u.end, this.windows), deltaMs: upAt - u.end, inputAt: upAt, confirmedAt, key: token.key, consumed: true, bodyState: "complete", phase: "deadline" });
  }
  /**
   * A released share judged at S+Good: holdOnly, or a terminal body owning a
   * release item with no head at its end. Until then another key's up is not
   * its release.
   */
  private settlesReleasedShare(u: UnitState): boolean {
    return u.holdOnly || u.terminal && (this.itemQueues.get(`${u.noteIndex}:release`)?.length ?? 0) > 0 &&
      !this.points.some(point => point.lane === u.lane && point.at === u.end);
  }
  /** A released preparation that S+Good judges from its own key (settlesReleasedShare). */
  private judgesReleasedShare(u: UnitState): boolean {
    return this.releasedPreparation(u) && this.settlesReleasedShare(u);
  }
  /**
   * A released share is judged at its S+Good from its own key (§2.14), so the
   * up is no release of u now: u is such a share and takes no other key's up,
   * or the up carries such a share of u's note and is no release of a sibling.
   */
  private awaitsReleasedShare(u: UnitState, token: PressToken): boolean {
    return this.judgesReleasedShare(u) ||
      (this.unitsByNote.get(u.noteIndex) ?? []).some(v => v.share === token && this.judgesReleasedShare(v));
  }
  private activateForHead(noteIndex: number, key: string, token: PressToken, at: number, unitIndex: number): void {
    const headStart = timeAt(this.times, noteIndex) ?? at;
    const ledger = this.correctionLedger(headStart, this.notes[noteIndex].lane);
    const spent: PressToken[] = [];
    for (const absorbed of ledger.headSucceeded(1)) {
      const pendingToken = this.pendingUps.find(candidate => candidate.correctionId === absorbed.id);
      if (!pendingToken) continue;
      // An up that released a headless boundary's last held key deferred its
      // successor's inheritance to S (§2.14), yet already waits as this head's
      // §2.6 candidate. The head continues that successor through the up, so
      // it inherits the up first, exactly as an immediate inheritance would.
      for (const deferred of this.units.filter(unit => unit.lane === this.notes[noteIndex].lane && unit.end === headStart &&
        !unit.active && !unit.failed && !unit.complete &&
        (this.unitsByEnd.get(`${unit.lane}:${unit.start}`) ?? []).some(predecessor => predecessor.tokens.includes(pendingToken)))) {
        this.tryInherit(deferred, deferred.start);
      }
      pendingToken.connectionConsumed = true;
      const pendingIndex = this.pendingUps.indexOf(pendingToken);
      if (pendingIndex >= 0) this.pendingUps.splice(pendingIndex, 1);
      const source = this.units.find(unit => unit.lane === this.notes[noteIndex].lane && unit.end === headStart && unit.active && !unit.failed && !unit.forwarded && unit.tokens.includes(pendingToken));
      // The swap hands over one continuing share. When the source note already
      // forwarded that share through another unit (the successor inherited
      // before this head, even if it has since completed: a short holdOnly
      // body or one already forwarded into an increase), a terminal source
      // here owns the 2→1 decrease release and stays open for its real up or
      // E+Good Miss.
      const siblingForwarded = source !== undefined &&
        (this.unitsByNote.get(source.noteIndex) ?? []).some(unit => unit !== source && unit.forwarded);
      if (source && !(source.terminal && siblingForwarded)) { source.complete = true; source.forwarded = true; }
      spent.push(pendingToken);
    }
    const own = this.units.filter(x => x.noteIndex === noteIndex && x.unitIndex === unitIndex && !x.active && !x.failed && !x.complete)[0];
    if (own) this.startUnit(own, key, token, at, false);
    const headed = this.units.find(x => x.start === headStart && x.lane === this.notes[noteIndex].lane && x.unitIndex === unitIndex && !x.active && !x.failed && !x.complete);
    if (headed) this.startUnit(headed, key, token, at, false);
    else {
      const already = this.units.find(x => x.start === headStart && x.lane === this.notes[noteIndex].lane && !x.failed && !x.complete && x.active);
      if (already && !already.tokens.includes(token)) { already.registered.add(key); already.tokens.push(token); }
    }
    // A later physical head of a prepared source can start its headless
    // continuation. This is a maintenance start with no extra point score.
    if (unitIndex > 0) {
      for (const source of this.units.filter(unit => unit.noteIndex !== noteIndex && unit.lane === this.notes[noteIndex].lane && unit.active && unit.startedAt !== null && unit.end <= at && unit.tokens.includes(token))) {
        for (const successor of this.units.filter(unit => unit.lane === source.lane && unit.start === source.end && !unit.active && !unit.failed && !unit.complete)) {
          this.tryInherit(successor, at);
          if (!successor.active) {
            const continuation = source.tokens.find(candidate => candidate.valid && !candidate.released && this.held.has(candidate.key));
            if (continuation) {
              continuation.claimedAt = successor.start;
              this.startUnit(successor, continuation.key, continuation, at, true);
              source.complete = true;
              source.forwarded = true;
            }
          }
        }
      }
    }
    // A late second head can be the physical continue for an already
    // completed holdOnly boundary.  It must receive a fresh continuation
    // claim, while the first late head alone must not pre-start the target.
    for (const source of this.units.filter(x => x.unitIndex > 0 && x.holdOnly && x.complete && x.startedAt === at)) {
      for (const successor of this.units.filter(x => x.lane === source.lane && x.start === source.end && !x.active && !x.failed && !x.complete)) {
        this.tryInherit(successor, at);
        if (!successor.active) {
          const continuation = source.tokens.find(candidate => candidate.valid && !candidate.released && this.held.has(candidate.key));
          if (continuation) {
            continuation.claimedAt = successor.start;
            this.startUnit(successor, continuation.key, continuation, at, true);
            source.complete = true;
            source.forwarded = true;
          }
        }
      }
    }
    // A keyup arriving before a boundary is provisional. If this head makes
    // the connection valid, consume the oldest eligible up for that unit and
    // keep it out of the successor's terminal release queue.
    const predecessor = this.units.find(u => u.lane === this.notes[noteIndex].lane && u.end === headStart && u.active && !u.failed && !u.complete);
    const pending = this.pendingUps.filter(up => (up.upAt ?? up.at) <= at && Math.abs((up.upAt ?? up.at) - headStart) <= this.windows.GOOD)
      .sort((a, b) => a.at - b.at)[0];
    const pendingSuccessor = predecessor && this.units.find(u => u.lane === predecessor.lane && u.start === headStart && !u.failed && !u.complete);
    // A late but legitimate predecessor start does not narrow this correction
    // (NJ-H08): the same up is corrected as after an on-time start.
    if (predecessor && pending && pendingSuccessor &&
      Math.abs((pending.upAt ?? pending.at) - headStart) <= this.windows.GOOD) {
      pending.connectionConsumed = true;
      const successor = pendingSuccessor;
      if (successor && !successor.active) this.tryInherit(successor, headStart);
      // The successor head may have activated its unit before this pending
      // up is observed. In that case settle exactly one continuing source
      // capacity instead of leaving the old source to emit a maintenance miss.
      // A terminal source kept only by its released share (§2.14) whose
      // sibling already forwarded the continuing share owns the 2→1 decrease
      // release, as in the ledger path above.
      const source = (this.unitsByNote.get(predecessor.noteIndex) ?? []).find(unit => unit.active && !unit.failed && !unit.forwarded &&
        unit.tokens.some(candidate => candidate === pending));
      const ownsDecrease = source !== undefined && source.terminal && this.releasedPreparation(source) &&
        (this.unitsByNote.get(source.noteIndex) ?? []).some(unit => unit !== source && unit.forwarded);
      if (source && !ownsDecrease) { source.complete = true; source.forwarded = true; }
      spent.push(pending);
      const index = this.pendingUps.indexOf(pending); if (index >= 0) this.pendingUps.splice(index, 1);
    }
    // Headless/connected units at this start inherit independently from the
    // still alive predecessor. A head never revives a failed predecessor.
    for (const u of this.units.filter(x => x.start === headStart && !x.active && !x.failed && !x.complete)) this.tryInherit(u, headStart);
    // A share carried by an up this head spent as a connection is chosen again
    // once this head's key is registered (§2.14).
    for (const token of spent) this.reselectShares(token);
  }
  private correctionLedger(boundaryAt: number, lane: number): ConnectionCorrections {
    const ledgerKey = `${lane}:${boundaryAt}`;
    const existing = this.correctionLedgers.get(ledgerKey);
    if (existing) return existing;
    const sourceCount = this.unitsByEnd.get(`${lane}:${boundaryAt}`)?.length ?? 0;
    const targetCount = this.unitsByStart.get(`${lane}:${boundaryAt}`)?.length ?? 0;
    const headSlots = this.points.find(point => point.at === boundaryAt && point.lane === lane)?.needed ?? targetCount;
    const ledger = new ConnectionCorrections({
      boundaryAt,
      headWindow: this.windows.GOOD,
      correctionCapacity: Math.min(sourceCount, targetCount, headSlots),
    });
    this.correctionLedgers.set(ledgerKey, ledger);
    return ledger;
  }
  /** Registers an up in the ledger of the earliest head boundary it can swap at, and tells which boundary that is. */
  private registerConnectionUp(token: PressToken, key: string, at: number, deferred: readonly UnitState[] = []) {
    const boundary = [...this.units.filter(unit => unit.active && !unit.failed && unit.tokens.some(candidate => candidate === token)), ...deferred]
      .filter(unit => !unit.holdOnly && Math.abs(unit.end - at) <= this.windows.GOOD)
      .sort((a, b) => a.end - b.end)[0];
    if (!boundary || !this.points.some(point => point.at === boundary.end && point.lane === boundary.lane) ||
      !this.units.some(unit => unit.start === boundary.end && unit.lane === boundary.lane)) return undefined;
    const correctionId = `up-${this.correctionSerial++}`;
    token.correctionId = correctionId;
    const { status } = this.correctionLedger(boundary.end, boundary.lane).up(correctionId, key, at);
    return { status, end: boundary.end, lane: boundary.lane };
  }
  private tryInherit(u: UnitState, at: number): void {
    if (at < u.start) return;
    // A late first start inside S+Good is still a legitimate source. Only a
    // failed predecessor stops inheritance; the late flag never does (NJ-H08).
    const predecessor = (this.unitsByEnd.get(`${u.lane}:${u.start}`) ?? []).find(p => p.active && !p.failed && p.registered.size > 0 &&
      (!this.connections || this.connections.has(`${p.noteIndex}:${u.noteIndex}`)));
    if (!predecessor) return;
    const budget = this.continuingCapacity(predecessor, u);
    if (this.transferredCapacity(predecessor.noteIndex) >= budget) return;
    const pool = this.pressPool(predecessor).filter(t => this.prepares(t, u));
    const token = pool[0];
    if (!token) return;
    // A share is carried by the predecessor note's own presses before any
    // other key of the connected chain.
    const own = new Set((this.unitsByNote.get(predecessor.noteIndex) ?? []).flatMap(unit => unit.tokens));
    const share = this.hasHead(u) ? token : this.pickShare(u, pool.filter(t => own.has(t))) ?? this.pickShare(u, pool);
    if (!share) return;
    this.startUnit(u, token.key, token, at, true);
    u.share = share;
    for (const press of pool) {
      if (!u.tokens.includes(press)) u.tokens.push(press);
      u.registered.add(press.key);
    }
    const targetCount = this.unitsByNote.get(u.noteIndex)?.length ?? 0;
    const extra = Math.max(0, budget - targetCount);
    this.carriedCapacity.set(u.noteIndex, extra);
    this.waivedSurplus.set(u.noteIndex, predecessor.holdOnly ? extra : Math.min(extra, this.waivedSurplus.get(predecessor.noteIndex) ?? 0));
    this.forwardOne(predecessor);
  }

  /** A press that can still prepare u: held, or a pending up within Good of u's end. */
  private prepares(token: PressToken, u: UnitState): boolean {
    return token.valid && !token.released && !token.connectionConsumed &&
      (this.held.get(token.key) === token || this.pendingUps.includes(token) && Math.abs((token.upAt ?? token.at) - u.end) <= this.windows.GOOD);
  }
  /**
   * Each unit of a headless successor continues one share carried by one
   * press, preferring a key still held (§2.14). A released key never carries
   * two sibling shares: a share no other press carries is left to a new key
   * in its start window or fails at S+Good. A held key keeps its former,
   * pool-wide preparation. One up settles one release: an up another note's
   * released share takes as its own release carries no share here, while a
   * holdOnly state completion does not spend it (§2.3).
   */
  private pickShare(u: UnitState, candidates: readonly PressToken[]): PressToken | undefined {
    const siblingShares = new Set((this.unitsByNote.get(u.noteIndex) ?? []).filter(unit => unit !== u).map(unit => unit.share));
    const pool = candidates.filter(t => !this.releaseOfOtherNote(t, u));
    return pool.find(t => t.upAt === undefined && !siblingShares.has(t)) ??
      pool.find(t => !siblingShares.has(t)) ?? pool.find(t => t.upAt === undefined);
  }
  /**
   * A share whose key was released before its unit's start is chosen again
   * as at S once that up is resolved or spent elsewhere (as another body's
   * release or a connection up): a spent up no longer carries it, and a key
   * still preparing the unit may (§2.14).
   */
  private reselectShares(token: PressToken): void {
    for (const u of this.units.filter(u => u.share === token && u.active && !u.failed && !u.complete && u.inherited && this.releasedBefore(token, u))) {
      const predecessors = this.unitsByEnd.get(`${u.lane}:${u.start}`) ?? [];
      const share = this.pickShare(u, [...new Set([...u.tokens, ...predecessors.flatMap(p => p.tokens)])].filter(t => this.prepares(t, u)));
      if (!share) continue;
      u.share = share;
      if (!u.tokens.includes(share)) { u.tokens.push(share); u.registered.add(share.key); }
    }
  }

  private transferredCapacity(noteIndex: number): number {
    return Math.max(this.forwardedCapacity.get(noteIndex) ?? 0, (this.unitsByNote.get(noteIndex) ?? []).filter(unit => unit.forwarded).length);
  }

  private connectPreparedBodies(at: number): void {
    const targets = [...new Map(this.units.filter(unit => unit.start <= at).map(unit => [unit.noteIndex, unit])).values()]
      .sort((a, b) => a.start - b.start);
    for (const target of targets) {
      const own = this.unitsByNote.get(target.noteIndex) ?? [];
      for (const unit of own) if (!unit.active && !unit.failed && !unit.complete) this.tryInherit(unit, at);
      const source = this.connectedPredecessor(target);
      if (!source) continue;
      // A holdOnly source unit may start only after its successor already
      // inherited (key-split double head). Once every source unit has started
      // or failed, the live successor gets the same exempt share as if both
      // had started on time (NJ-H03). This only raises the share; the H04
      // no-double-use rule for non-holdOnly sources stays in tryInherit.
      if (source.holdOnly && own.some(unit => unit.inherited && unit.active && !unit.failed && !unit.complete) &&
        !(this.unitsByNote.get(source.noteIndex) ?? []).some(unit => !unit.active && !unit.failed)) {
        const surplus = this.continuingCapacity(source, target) - own.length;
        if (surplus > (this.carriedCapacity.get(target.noteIndex) ?? 0)) this.carriedCapacity.set(target.noteIndex, surplus);
        if (surplus > (this.waivedSurplus.get(target.noteIndex) ?? 0)) this.waivedSurplus.set(target.noteIndex, surplus);
      }
      const fulfilled = own.filter(unit => unit.active && !unit.failed).length;
      const desired = Math.min(this.continuingCapacity(source, target), fulfilled);
      while (this.transferredCapacity(source.noteIndex) < desired) {
        const before = this.transferredCapacity(source.noteIndex);
        this.forwardOne(source);
        if (this.transferredCapacity(source.noteIndex) === before) break;
      }
    }
  }

  private continuingCapacity(source: UnitState, target: UnitState): number {
    const sourceUnits = this.unitsByNote.get(source.noteIndex) ?? [];
    const targetCount = this.unitsByNote.get(target.noteIndex)?.length ?? 0;
    const prepared = sourceUnits.filter(unit => unit.active && !unit.failed);
    const head = this.points.find(point => point.lane === source.lane && point.at === source.start);
    const extraHeads = Math.max(0, (head?.keys.size ?? 0) - sourceUnits.length);
    // Late partial H decreases first cover their ending share, unless this
    // up can legitimately finish the successor (H05 versus H06). Partial means
    // a source unit still awaits its first start; once every unit has started
    // or failed, late starts keep the on-time exemption (H03, NJ-H08).
    const lateHoldEnding = source.holdOnly && sourceUnits.some(unit => !unit.active && !unit.failed) && prepared.every(unit => unit.late) && Math.abs(this.now - target.end) > this.windows.GOOD;
    const ending = !source.holdOnly || lateHoldEnding ? Math.max(0, sourceUnits.length - targetCount) : 0;
    return Math.max(0, prepared.length + extraHeads + (this.carriedCapacity.get(source.noteIndex) ?? 0) - ending);
  }

  private forwardOne(source: UnitState): void {
    const units = (this.unitsByNote.get(source.noteIndex) ?? []).filter(unit => unit.active && !unit.failed);
    const next = units.find(unit => !unit.forwarded && (!unit.terminal || unit.holdOnly)) ?? units.find(unit => unit.forwarded);
    if (!next) return;
    this.forwardedCapacity.set(source.noteIndex, this.transferredCapacity(source.noteIndex) + 1);
    next.forwarded = true;
    if (!next.holdOnly) next.complete = true;
  }

  private relatedUnits(unit: UnitState): UnitState[] {
    const indices = new Set([unit.noteIndex]);
    const aliveNotes = new Set(this.units.filter(candidate => candidate.active && !candidate.failed).map(candidate => candidate.noteIndex));
    const queue = [unit.noteIndex];
    while (queue.length) {
      const noteIndex = queue.shift()!;
      for (const neighbor of this.connectionAdjacency.get(noteIndex) ?? []) {
        if (!aliveNotes.has(neighbor) || indices.has(neighbor)) continue;
        indices.add(neighbor); queue.push(neighbor);
      }
    }
    return [...indices].flatMap(noteIndex => this.unitsByNote.get(noteIndex) ?? []);
  }

  private pressPool(unit: UnitState): PressToken[] {
    return [...new Set(this.relatedUnits(unit).flatMap(candidate => candidate.tokens))];
  }
  private startUnit(u: UnitState, key: string, token: PressToken, at: number, inherited: boolean): void {
    u.active = true; u.startedAt = at; u.late = at > u.start; u.registered.add(key); u.tokens.push(token); u.inherited = inherited;
    if (!inherited) u.share = token;
    if (u.holdOnly && at >= u.end && !u.complete) {
      u.complete = true;
      this.emit({ kind: "holdOnly", noteIndex: u.noteIndex, unitIndex: u.unitIndex, grade: "perfect", deltaMs: 0, inputAt: at, confirmedAt: at, consumed: false, bodyState: "complete" });
    }
  }
  private isHeld(u: UnitState): boolean {
    // Registration is a press-token capability, not a key capability.  A
    // later press on the same key must not resurrect an old hold after its
    // original token was released.
    // A unit kept only by its released share (§2.14) is held by no key and
    // reserves none: S+Good or a new key decides it.
    if (this.releasedPreparation(u)) return false;
    const reserves = (unit: UnitState) => unit.active && !unit.failed && !unit.complete && !this.releasedPreparation(unit);
    const related = this.relatedUnits(u);
    const earlierReservations = related.filter(unit => unit.start < u.start && reserves(unit)).length;
    const heldCount = this.pressPool(u).filter(token => token.valid && !token.released && this.held.get(token.key) === token).length;
    const live = this.units.filter(unit => unit.noteIndex === u.noteIndex && reserves(unit));
    const ordinal = live.indexOf(u);
    return ordinal < 0 ? heldCount > earlierReservations : ordinal < Math.max(0, heldCount - earlierReservations);
  }
  private emit(event: NoteJudgmentEvent): void {
    if (this.observedConfirmedAt !== undefined) {
      event.confirmedAt = this.observedConfirmedAt;
      // 관측 전 기한은 이미 sweep했다. 여기서 새로 결정된 유지 실패와
      // 상태 완료도 이 입력 묶음의 결과이므로 같은 콤보 phase에 둔다.
      event.phase = "input";
    }
    event.phase ??= event.inputAt === null ? "deadline" : "input";
    if (!event.itemId && event.kind !== "maintenanceMiss" && event.kind !== "dependentZero") {
      const suffix = event.kind === "head" ? "head" : `${event.kind}:${event.unitIndex ?? 0}`;
      const queue = this.itemQueues.get(`${event.noteIndex}:${event.kind}`);
      event.itemId = queue?.shift() ?? this.itemIds.get(`${event.noteIndex}:${event.unitIndex ?? 0}:${event.kind}`) ?? `n${event.noteIndex}:${suffix}`;
    }
    // A deadline reached while preparing a later input is its own logical
    // batch. Finalize it immediately so a head Miss clears its trill set;
    // input batches are finalized once after all same-timestamp events exist.
    if (!this.batchingEvents) Object.assign(event, this.pointState.finalizeBatch([event])[0]);
    this.events.push(event);
    if (this.batchingEvents) this.batchingEvents.push(event);
    else {
      this.currentCombo = this.confirmationCombo.applyBatch([event]);
      this.publishConfirmed(event);
    }
  }

  /**
   * Only terminal release units own scored release items; carried units do
   * not. Items come from the note's FIFO queue, so a double unit may take the
   * note's next item rather than the one with its own ordinal.
   */
  private takeUnitScoreItem(unit: UnitState): string | undefined {
    if (!unit.terminal && !unit.holdOnly) return undefined;
    const queue = this.itemQueues.get(`${unit.noteIndex}:${unit.holdOnly ? "holdOnly" : "release"}`);
    return queue?.shift();
  }
  private publishConfirmed(event: NoteJudgmentEvent): void {
    this.onConfirmed?.(event);
  }
}

export default NoteJudgmentCore;
