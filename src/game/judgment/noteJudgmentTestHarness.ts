import { JUDGMENT_WINDOWS, type Lane } from "../../shared/constants";
import type { NoteEntity, PointNote, RangeNote, TrillZone } from "../../shared/types";
import { ScoreManager } from "../scoring/ScoreManager";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { NoteJudgmentCore, type NoteJudgmentEvent, type NoteJudgmentCoreOptions } from "./NoteJudgmentCore";
import { decideConfirmedJudgmentEffects } from "./confirmedJudgmentEffects";

// 사례의 ms 수치를 Beat에도 그대로 사용해 정확한 인접 관계를 보존한다.
export function point(at: number, type: PointNote["type"] = "single", lane: Lane = 1): PointNote {
  return { type, lane, beat: { n: at, d: 1 } };
}

export function body(start: number, end: number, type: RangeNote["type"] = "long", holdOnly = false, lane: Lane = 1): RangeNote {
  return { type, lane, beat: { n: start, d: 1 }, endBeat: { n: end, d: 1 }, ...(holdOnly ? { holdOnly: true } : {}) };
}

export interface CaseInput { key: string; lane?: Lane; type: "down" | "up" }
export const down = (key: string, lane: Lane = 1): CaseInput => ({ key, lane, type: "down" });
export const up = (key: string, lane: Lane = 1): CaseInput => ({ key, lane, type: "up" });

export function createHarness(notes: readonly NoteEntity[], options: NoteJudgmentCoreOptions = {}, zones: readonly TrillZone[] = []) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d]));
  const ends = new Map<number, number>();
  notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n / note.endBeat.d); });
  const compiled = compileJudgmentChart(notes, starts, ends, zones);
  const score = new ScoreManager(compiled.scoreItems, options.windows);
  const events: NoteJudgmentEvent[] = [];
  const core = new NoteJudgmentCore(compiled, {
    ...options,
    onConfirmed(event) {
      events.push(event);
      const action = decideConfirmedJudgmentEffects(event, notes[event.noteIndex]).scoreAction;
      if (action.type === "unscoredMiss") {
        score.recordUnscoredMiss();
      } else {
        const settled = action.type === "dependentZero"
          ? score.settleDependentZero(action.itemId)
          : score.settleScoreItem(action.itemId, action.grade, action.deltaMs);
        if (!settled) throw new Error(`미등록 또는 중복 점수 정산: ${action.itemId}`);
      }
      options.onConfirmed?.(event);
    },
  });
  return {
    core, score, events, compiled,
    at(time: number, ...inputs: CaseInput[]) {
      core.processBatch(time, inputs.map(input => ({ ...input, lane: input.lane ?? 1 })));
    },
  };
}

export function judgments(events: readonly NoteJudgmentEvent[]) {
  return events.filter(event => event.kind !== "dependentZero");
}

export function counts(events: readonly NoteJudgmentEvent[]) {
  const result = { perfect: 0, great: 0, good: 0, goodTrill: 0, miss: 0 };
  for (const event of judgments(events)) result[event.grade]++;
  return result;
}

/** 키 하나의 누름 구간 [키, down 시각, up 시각]. up 시각이 없으면 끝까지 떼지 않는다. */
export type KeyHold = readonly [key: string, downAt: number, upAt?: number];

/**
 * 누름 구간들을 시각순 batch로 재생하고, 마지막 노트·입력 시각에 Good 창을 더한 기한 뒤까지 진행한 harness를 돌려준다.
 * 같은 키를 여러 번 누르면 구간을 여러 개 적는다(예: ["A", 1000, 1090], ["A", 1140, 1200]). 같은 시각에서는 up을 down보다
 * 먼저 넣어 구간을 적은 순서와 관계없이 떼고 다시 누른 것으로 재생한다. 같은 키의 구간이 겹치거나 up이 down보다 늦지 않으면
 * (길이 0인 구간은 up이 먼저 들어가 계속 누른 것이 되므로) 예외를 던진다.
 */
export function playHolds(notes: readonly NoteEntity[], holds: readonly KeyHold[], options: NoteJudgmentCoreOptions = {}, zones: readonly TrillZone[] = []) {
  const h = createHarness(notes, options, zones);
  const byKey = new Map<string, KeyHold[]>();
  for (const hold of holds) {
    if (hold[2] !== undefined && hold[2] <= hold[1]) throw new Error(`키 ${hold[0]}의 up이 down보다 늦지 않음: ${hold.join("–")}`);
    byKey.set(hold[0], [...(byKey.get(hold[0]) ?? []), hold]);
  }
  for (const [key, keyHolds] of byKey) {
    const sorted = [...keyHolds].sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < sorted.length; i++) {
      const previousUp = sorted[i - 1][2];
      if (previousUp === undefined || previousUp > sorted[i][1]) throw new Error(`키 ${key}의 누름 구간이 겹침: ${sorted[i - 1].join("–")}, ${sorted[i].join("–")}`);
    }
  }
  const byTime = new Map<number, CaseInput[]>();
  const add = (at: number, input: CaseInput) => byTime.set(at, [...(byTime.get(at) ?? []), input]);
  for (const [key, downAt, upAt] of holds) {
    add(downAt, down(key));
    if (upAt !== undefined) add(upAt, up(key));
  }
  const times = [...byTime.keys()].sort((a, b) => a - b);
  for (const at of times) h.at(at, ...byTime.get(at)!.sort((a, b) => (a.type === "up" ? 0 : 1) - (b.type === "up" ? 0 : 1)));
  const noteTimes = notes.flatMap(note => "endBeat" in note ? [note.beat.n / note.beat.d, note.endBeat.n / note.endBeat.d] : [note.beat.n / note.beat.d]);
  h.at(Math.max(...noteTimes, ...times) + (options.windows ?? JUDGMENT_WINDOWS).GOOD + 1);
  return h;
}

/** 끝까지 진행한 뒤 정산하지 않은 점수 항목. maintenanceMiss는 무득점 Miss라 항목을 정산하지 않는다. */
export function unsettledItemIds(h: ReturnType<typeof createHarness>): string[] {
  const settled = new Set(h.events.filter(event => event.kind !== "maintenanceMiss" && event.itemId !== undefined).map(event => event.itemId));
  return h.compiled.scoreItems.filter(item => !settled.has(item.itemId)).map(item => item.itemId);
}
