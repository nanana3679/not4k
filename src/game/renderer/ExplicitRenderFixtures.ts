import { beat } from "../../shared/types/beat";
import type { ChartDocument, DocumentNoteEntity } from "../../shared/types/chart";
import { compileExplicitJudgmentChart } from "../judgment/explicitCompiledChart";
import type { ExplicitCompiledChart } from "../judgment/explicitCompiledChart";
import type { ExplicitBodyUnitSnapshot, ExplicitItemSnapshot, ExplicitJudgmentSnapshot } from "../judgment/ExplicitJudgmentState";

/** G1 표시 fixture 전용. 세션 판정 결과를 생성하거나 기대값으로 주장하지 않는다. */
export function explicitRenderChart(notes?: DocumentNoteEntity[], trillZones: ChartDocument["trillZones"] = []): ExplicitCompiledChart {
  const chart: ChartDocument = {
    meta: { title: "G1 표시 fixture", artist: "fixture", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0 },
    notes: notes ?? [
      { type: "release", beat: beat(6), lane: 1, count: 2, grace: true },
      { type: "sustain", beat: beat(4), lane: 1, count: 2 },
      { type: "body", beat: beat(2), endBeat: beat(6), lane: 1, holdCount: 2 },
      { type: "point", beat: beat(2), lane: 1, kind: "double", grace: true },
    ],
    events: [{ type: "bpm", beat: beat(0), bpm: 120 }], trillZones,
  };
  return compileExplicitJudgmentChart(chart);
}

export function explicitRenderSnapshot(chart: ExplicitCompiledChart, options: {
  atMs?: number;
  body?: readonly ExplicitBodyUnitSnapshot["state"][];
  items?: Readonly<Record<number, readonly ExplicitItemSnapshot["state"][]>>;
} = {}): ExplicitJudgmentSnapshot {
  return {
    atMs: options.atMs ?? 2000,
    bodyUnits: chart.bodyUnits.map((unit, index) => {
      const state = options.body?.[index] ?? "waiting";
      return { id: unit.id, ref: unit.ref, lane: unit.lane, state,
        actualStartMs: ["active", "recovering", "complete"].includes(state) ? unit.startMs : null,
        completedAtMs: state === "complete" ? unit.endMs - 100 : null,
        failedAtMs: state === "failed" ? unit.startMs + 200 : null,
        failureFactId: state === "failed" ? `fixture-failure:${unit.id}` : null,
        maintenanceSinceMs: state === "recovering" ? 1990 : null,
        maintenanceDeadlineMs: state === "recovering" ? 2010 : null, pointStatus: "none" };
    }),
    items: chart.scoreItems.map(item => {
      const state = options.items?.[item.source.noteIndex]?.[item.ordinal] ?? "pending";
      return { id: item.id, sourceNoteIndex: item.source.noteIndex, ordinal: item.ordinal, kind: item.kind, state,
        waitingReason: state === "waiting" ? "bodyRecovery" : null,
        grade: state === "success" ? "perfect" : state === "miss" ? "miss" : null,
        settlementFactId: ["success", "miss", "dependentZero"].includes(state) ? `fixture-settle:${item.id}` : null };
    }),
  };
}
