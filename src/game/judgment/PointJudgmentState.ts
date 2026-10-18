import type { Lane } from "../../shared/constants";
import { JUDGMENT_WINDOWS, type JudgmentWindows } from "../../shared/constants";
import type { CompiledJudgmentChart } from "./compiledJudgmentChart";
import type { NoteJudgmentEvent } from "./NoteJudgmentCore";

export interface PointCandidate { noteIndex: number; unitIndex: number; timeMs: number }

interface HeadSlot extends PointCandidate {
  itemId: string;
  lane: Lane;
  grace: boolean;
  used: boolean;
  expired: boolean;
  usedKey?: string;
}

function grade(delta: number, windows: JudgmentWindows): NoteJudgmentEvent["grade"] {
  const distance = Math.abs(delta);
  if (distance <= windows.PERFECT) return "perfect";
  if (distance <= windows.GREAT) return "great";
  if (distance <= windows.GOOD) return "good";
  return "miss";
}

/** Point/head matching state kept separate from long-body inheritance. */
export class PointJudgmentState {
  private readonly windows: JudgmentWindows;
  private readonly slots: HeadSlot[];
  private readonly keysByNote = new Map<number, Set<string>>();
  private readonly trillZoneByNote: ReadonlyMap<number, number>;
  private readonly trillKeysByZone = new Map<number, Set<string>>();

  constructor(
    compiled: CompiledJudgmentChart,
    windows: JudgmentWindows = JUDGMENT_WINDOWS,
    trillZoneByNote: ReadonlyMap<number, number> = (compiled as CompiledJudgmentChart & { trillZoneByNote?: ReadonlyMap<number, number> }).trillZoneByNote ?? new Map(),
  ) {
    this.windows = windows;
    this.trillZoneByNote = trillZoneByNote;
    this.slots = compiled.items.filter(item => item.kind === "head").map(item => ({
      noteIndex: item.noteIndex, unitIndex: item.unitIndex, timeMs: item.timeMs,
      itemId: item.itemId ?? item.id, lane: item.lane as Lane,
      grace: !!compiled.rawNotes?.[item.noteIndex] && !("endBeat" in compiled.rawNotes[item.noteIndex]) && !!(compiled.rawNotes[item.noteIndex] as { grace?: boolean }).grace,
      used: false, expired: false,
    }));
  }

  /** Apply the one alternation decision shared by heads in a confirmation batch. */
  finalizeBatch(events: readonly NoteJudgmentEvent[]): NoteJudgmentEvent[] {
    const result = events.map(event => ({ ...event }));
    const groups = new Map<string, { zone: number; at: number; events: NoteJudgmentEvent[] }>();
    const misses: NoteJudgmentEvent[] = [];
    for (const event of result) {
      const zone = this.trillZoneByNote.get(event.noteIndex);
      if (event.kind !== "head" || zone === undefined) continue;
      if (event.grade === "miss") { misses.push(event); continue; }
      const eventAt = event.inputAt ?? event.confirmedAt;
      const groupKey = `${zone}\u0000${eventAt}`;
      const group = groups.get(groupKey) ?? { zone, at: eventAt, events: [] }; group.events.push(event); groups.set(groupKey, group);
    }
    const actions = [...misses.map(event => ({ at: event.confirmedAt, miss: event })), ...[...groups.values()].map(group => ({ at: group.at, group }))]
      .sort((a, b) => a.at - b.at);
    for (const action of actions) {
      if ("miss" in action) {
        const zone = this.trillZoneByNote.get(action.miss.noteIndex); if (zone !== undefined) this.trillKeysByZone.delete(zone);
        continue;
      }
      const { zone, events: group } = action.group;
      const previous = this.trillKeysByZone.get(zone) ?? new Set<string>();
      // Decide alternation for the whole simultaneous mapping.  Filtering
      // each event greedily by the previous set makes the result depend on
      // which key was assigned to which head first (A/B permutation).  A
      // batch containing at least one genuinely new physical key may choose
      // the highest-grade legal mapping; only an all-repeated batch fails.
      const hasNewKey = group.some(event => event.key !== undefined && !previous.has(event.key));
      const eligible = hasNewKey ? group.filter(event => event.key !== undefined) : [];
      const rank: Record<NoteJudgmentEvent["grade"], number> = { miss: -1, goodTrill: 0, good: 1, great: 2, perfect: 3 };
      eligible.sort((a, b) => {
        const aSlot = this.slots.find(slot => slot.itemId === a.itemId); const bSlot = this.slots.find(slot => slot.itemId === b.itemId);
        return (rank[b.grade] - rank[a.grade]) || ((aSlot?.timeMs ?? a.confirmedAt) - (bSlot?.timeMs ?? b.confirmedAt)) || ((a.itemId ?? "").localeCompare(b.itemId ?? ""));
      });
      const selected = eligible[0];
      for (const event of group) {
        if (event !== selected) event.grade = "goodTrill";
      }
      this.trillKeysByZone.set(zone, new Set(group.flatMap(event => event.key ? [event.key] : [])));
    }
    return result;
  }

  peek(lane: Lane, key: string, at: number): PointCandidate | undefined {
    const usedKeys = this.keysByNote;
    return this.slots
      .filter(slot => !slot.used && !slot.expired && slot.lane === lane && Math.abs(at - slot.timeMs) <= this.windows.GOOD)
      .filter(slot => !(usedKeys.get(slot.noteIndex)?.has(key)))
      .sort((a, b) => a.timeMs - b.timeMs || a.noteIndex - b.noteIndex || a.unitIndex - b.unitIndex)
      .map(({ noteIndex, unitIndex, timeMs }) => ({ noteIndex, unitIndex, timeMs }))[0];
  }

  consume(candidate: PointCandidate, key: string, at: number): NoteJudgmentEvent {
    const slot = this.slots.find(item => item.noteIndex === candidate.noteIndex && item.unitIndex === candidate.unitIndex && !item.used && !item.expired);
    if (!slot) throw new Error("이미 소비되었거나 만료된 head slot입니다");
    if (slot.lane !== undefined && Math.abs(at - slot.timeMs) > this.windows.GOOD) throw new Error("head 입력이 Good 창 밖입니다");
    if (this.keysByNote.get(slot.noteIndex)?.has(key)) throw new Error("double head에 이미 사용한 물리 키입니다");
    slot.used = true; slot.usedKey = key;
    const keys = this.keysByNote.get(slot.noteIndex) ?? new Set<string>(); keys.add(key); this.keysByNote.set(slot.noteIndex, keys);
    const deltaMs = at - slot.timeMs;
    return { kind: "head", noteIndex: slot.noteIndex, unitIndex: slot.unitIndex, itemId: slot.itemId,
      grade: slot.grace ? "perfect" : grade(deltaMs, this.windows), deltaMs, inputAt: at, confirmedAt: at, key, consumed: true };
  }

  expireBefore(at: number, inclusive = false): NoteJudgmentEvent[] {
    const events: NoteJudgmentEvent[] = [];
    for (const slot of this.slots) {
      if (slot.used || slot.expired || (inclusive ? at < slot.timeMs + this.windows.GOOD : at <= slot.timeMs + this.windows.GOOD)) continue;
      slot.expired = true;
      events.push({ kind: "head", noteIndex: slot.noteIndex, unitIndex: slot.unitIndex, itemId: slot.itemId,
        grade: "miss", deltaMs: this.windows.GOOD, inputAt: null, confirmedAt: slot.timeMs + this.windows.GOOD, consumed: false, phase: "deadline" });
    }
    events.sort((a, b) => a.confirmedAt - b.confirmedAt || (a.itemId ?? "").localeCompare(b.itemId ?? ""));
    return events;
  }

  isComplete(noteIndex: number): boolean {
    const slots = this.slots.filter(slot => slot.noteIndex === noteIndex);
    return slots.length > 0 && slots.every(slot => slot.used || slot.expired);
  }

  remaining(noteIndex: number): number { return this.slots.filter(slot => slot.noteIndex === noteIndex && !slot.used && !slot.expired).length; }

  usedKeys(noteIndex: number): readonly string[] { return [...(this.keysByNote.get(noteIndex) ?? [])]; }
}
