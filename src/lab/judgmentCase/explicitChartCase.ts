/** v4 문서를 원형 그대로 보존하며 새 판정 소비자에 필요한 시간 뷰만 만든다. */
import { deserializeChartDocument } from "../../shared/chart";
import { isMainLane } from "../../shared/chart/laneAxis";
import { createChartTiming } from "../../shared/timing/chartTiming";
import { isExplicitNote } from "../../shared/types/chart";
import type { ChartDocument, ExplicitNoteEntity } from "../../shared/types/chart";
import type { JudgmentCaseAction, JudgmentCaseInput, JudgmentCaseZone } from "./chartCase";

export interface ExplicitCaseNote {
  readonly index: number;
  readonly id: string;
  readonly note: ExplicitNoteEntity;
  readonly startMs: number;
  readonly endMs?: number;
}

export interface ExplicitChartCase {
  readonly mode: "explicit";
  readonly title: string;
  readonly chart: ChartDocument;
  readonly notes: readonly ExplicitCaseNote[];
  readonly inputs: readonly JudgmentCaseInput[];
  readonly actions: readonly JudgmentCaseAction[];
  readonly trillZones: readonly JudgmentCaseZone[];
}

export function explicitCaseFromDocument(chart: ChartDocument, fallbackTitle = ""): ExplicitChartCase {
  const timing = createChartTiming(chart);
  const atMs = timing.beatToMs;
  const notes = chart.notes.flatMap((note, index): ExplicitCaseNote[] => isMainLane(note.lane) && isExplicitNote(note)
    ? [{ index, id: `N${index + 1}`, note, startMs: timing.noteTimesMs.get(index)!,
      ...(timing.noteEndTimesMs.has(index) ? { endMs: timing.noteEndTimesMs.get(index)! } : {}) }] : []);
  const inputs = chart.events.flatMap((event, eventIndex): JudgmentCaseInput[] => event.type === "tutorialInput"
    ? [{ eventIndex, key: event.keyCode, label: event.keyLabel?.trim() || event.keyCode.replace(/^(?:Key|Digit)(?=.$)/, ""),
      lane: event.lane, downMs: atMs(event.beat), upMs: atMs(event.endBeat) }] : []);
  const actions = inputs.flatMap((input, inputIndex): JudgmentCaseAction[] => [
    { atMs: input.downMs, key: input.key, lane: input.lane, type: "down", inputIndex },
    ...(input.upMs === null ? [] : [{ atMs: input.upMs, key: input.key, lane: input.lane, type: "up" as const, inputIndex }]),
  ]).sort((a, b) => a.atMs - b.atMs || a.inputIndex - b.inputIndex);
  return { mode: "explicit", title: chart.meta.title || fallbackTitle, chart, notes, inputs, actions,
    trillZones: chart.trillZones.filter(zone => isMainLane(zone.lane)).map(zone => ({ lane: zone.lane,
      startMs: atMs(zone.beat), endMs: atMs(zone.endBeat) })) };
}

/** 수동 설계·legacy 텍스트를 새 판정으로 암묵 변환하지 않는다. */
export function explicitCaseFromSource(source: string, fallbackTitle = ""): ExplicitChartCase {
  let json: unknown;
  try { json = JSON.parse(source); } catch { throw new Error("--explicit은 v4 ChartDocument JSON이 필요합니다"); }
  if (!json || typeof json !== "object" || !("version" in json) || json.version !== 4) {
    throw new Error("--explicit은 version: 4 ChartDocument JSON만 받습니다. 구형 입력은 자동 변환하지 않습니다");
  }
  return explicitCaseFromDocument(deserializeChartDocument(source), fallbackTitle);
}
