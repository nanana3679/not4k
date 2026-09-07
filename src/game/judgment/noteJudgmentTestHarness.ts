import type { Lane } from "../../shared/constants";
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
