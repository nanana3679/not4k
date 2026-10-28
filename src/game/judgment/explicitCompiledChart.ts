import type { Beat } from "../../shared/types/beat";
import { beatCompare } from "../../shared/types/beat";
import type { ExplicitNoteEntity } from "../../shared/types/chart";
import { isExplicitNote } from "../../shared/types/chart";
import { isMainLane } from "../../shared/chart/laneAxis";
import type { ExplicitBodyConnection, ExplicitNoteRelations } from "../../shared/chart/explicitNoteRelations";
import { createChartTiming } from "../../shared/timing/chartTiming";
import type { ChartTiming } from "../../shared/timing/chartTiming";
import { validateChartDocument } from "../../shared/validation/documentValidation";
import type { ChartDocumentValidation, ChartDocumentValidationInput } from "../../shared/validation/documentValidation";

export interface ExplicitSourceRef { readonly noteIndex: number }
export interface ExplicitBodyUnitRef { readonly bodyIndex: number; readonly ordinal: number }

interface ExplicitScoreItemBase {
  readonly id: string;
  readonly source: ExplicitSourceRef;
  readonly ordinal: number;
  readonly lane: number;
  readonly beat: Beat;
  readonly timeMs: number;
  readonly weight: 3;
}

/** 유지에는 독립 입력·Grace가 없으며 릴리즈 수량은 바디 몫 수와 별개다. */
export type ExplicitScoreItem = ExplicitScoreItemBase & (
  | { readonly kind: "tap"; readonly pointKind: "single" | "double" | "trill";
    readonly grace: boolean; readonly startsBodyIndices: readonly number[]; readonly trillZoneIndex?: number }
  | { readonly kind: "release"; readonly grace: boolean; readonly bodyIndex?: number;
    readonly boundaryKind: "standalone" | "end" | "decrease" }
  | { readonly kind: "tick"; readonly bodyIndex: number; readonly bodyUnit: ExplicitBodyUnitRef }
);

export interface ExplicitCompiledBodyUnit {
  readonly id: string;
  readonly source: ExplicitSourceRef;
  readonly ref: ExplicitBodyUnitRef;
  readonly lane: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly weight: 0;
}

export interface ExplicitCompiledBody {
  readonly source: ExplicitSourceRef;
  readonly lane: number;
  readonly beat: Beat;
  readonly endBeat: Beat;
  readonly startMs: number;
  readonly endMs: number;
  readonly holdCount: 1 | 2;
  readonly trill: boolean;
  readonly trillZoneIndex?: number;
  readonly startPointIndices: readonly number[];
  readonly releaseIndices: readonly number[];
  readonly sustainIndices: readonly number[];
  readonly units: readonly ExplicitCompiledBodyUnit[];
}

export interface ExplicitCompiledConnection extends ExplicitBodyConnection { readonly boundaryMs: number }

/** 구형 CompiledJudgmentChart와 별도 계약. 런타임 상태나 커서 제외 정책을 만들지 않는다. */
export interface ExplicitCompiledChart {
  readonly format: "explicit";
  readonly timing: ChartTiming;
  readonly relations: ExplicitNoteRelations;
  readonly scoreItems: readonly ExplicitScoreItem[];
  readonly bodyUnits: readonly ExplicitCompiledBodyUnit[];
  readonly bodies: readonly ExplicitCompiledBody[];
  readonly connections: readonly ExplicitCompiledConnection[];
  readonly theoreticalWeight: number;
  readonly totalJudgments: number;
}

export class ExplicitChartCompileError extends Error {
  constructor(readonly validation: ChartDocumentValidation) {
    const issues = [...validation.structural, ...validation.semantic, ...validation.runtimeIncompatible];
    super(`명시 차트 컴파일 실패: ${issues.map(issue => issue.message).join("; ")}`);
    this.name = "ExplicitChartCompileError";
  }
}

export function compileExplicitJudgmentChart(
  document: ChartDocumentValidationInput & { readonly meta: { readonly offsetMs: number } },
  suppliedTiming?: ChartTiming,
): ExplicitCompiledChart {
  const validation = validateChartDocument(document);
  if (!validation.canPlayExplicit) throw new ExplicitChartCompileError(validation);
  const timing = suppliedTiming ?? createChartTiming(document);
  const relations = validation.relations;
  const main = document.notes.flatMap((note, noteIndex) => isMainLane(note.lane) && isExplicitNote(note)
    ? [{ note, noteIndex }] : []).sort((a, b) => beatCompare(a.note.beat, b.note.beat)
      || a.note.lane - b.note.lane || a.note.type.localeCompare(b.note.type) || a.noteIndex - b.noteIndex);
  const timeAt = (index: number, end = false): number => {
    const time = (end ? timing.noteEndTimesMs : timing.noteTimesMs).get(index);
    if (time === undefined || !Number.isFinite(time)) throw new Error(`ChartTiming의 ${end ? "끝 " : ""}시각이 없습니다: note ${index}`);
    return time;
  };
  const zoneFor = (note: ExplicitNoteEntity): number | undefined => {
    if (!((note.type === "tap" && note.kind === "trill") || (note.type === "body" && note.trill))) return undefined;
    const index = document.trillZones.findIndex(zone => zone.lane === note.lane
      && beatCompare(zone.beat, note.beat) <= 0
      && beatCompare("endBeat" in note ? note.endBeat : note.beat, zone.endBeat) <= 0);
    return index < 0 ? undefined : index;
  };
  const bodies: ExplicitCompiledBody[] = relations.bodies.filter(body => isMainLane(body.note.lane)).map(body => {
    const { note, noteIndex } = body;
    const startMs = timeAt(noteIndex);
    const endMs = timeAt(noteIndex, true);
    return { source: { noteIndex }, lane: note.lane, beat: note.beat, endBeat: note.endBeat, startMs, endMs,
      holdCount: note.holdCount, trill: note.trill === true, trillZoneIndex: zoneFor(note),
      startPointIndices: body.startPointIndices, releaseIndices: body.endReleaseIndices,
      sustainIndices: body.sustainIndices,
      units: Array.from({ length: note.holdCount }, (_, ordinal) => ({
        id: `b${noteIndex}:hold:${ordinal}`, source: { noteIndex }, ref: { bodyIndex: noteIndex, ordinal },
        lane: note.lane, startMs, endMs, weight: 0 as const,
      })) };
  });
  const scoreItems: ExplicitScoreItem[] = [];
  for (const { note, noteIndex } of main) {
    if (note.type === "body") continue;
    const count = note.type === "tap" ? (note.kind === "double" ? 2 : 1) : note.count;
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const base: ExplicitScoreItemBase = { id: `n${noteIndex}:${note.type}:${ordinal}`, source: { noteIndex },
        ordinal, lane: note.lane, beat: note.beat, timeMs: timeAt(noteIndex), weight: 3 };
      if (note.type === "tap") {
        scoreItems.push({ ...base, kind: "tap", pointKind: note.kind, grace: note.grace === true,
          startsBodyIndices: relations.bodies.filter(body => body.startPointIndices.includes(noteIndex)).map(body => body.noteIndex),
          trillZoneIndex: zoneFor(note) });
      } else if (note.type === "release") {
        const bodyIndex = relations.releaseBodyByNote.get(noteIndex);
        const decreased = relations.connections.some(c => c.predecessorIndex === bodyIndex && c.predecessorHoldCount > c.successorHoldCount);
        scoreItems.push({ ...base, kind: "release", grace: note.grace === true, bodyIndex,
          boundaryKind: bodyIndex === undefined ? "standalone" : decreased ? "decrease" : "end" });
      } else {
        const bodyIndex = relations.sustainBodyByNote.get(noteIndex);
        if (bodyIndex === undefined) throw new Error(`검증된 유지 표식의 소속이 없습니다: note ${noteIndex}`);
        scoreItems.push({ ...base, kind: "tick", bodyIndex, bodyUnit: { bodyIndex, ordinal } });
      }
    }
  }
  const connections = relations.connections.filter(c => isMainLane(c.lane))
    .map(connection => ({ ...connection, boundaryMs: timeAt(connection.successorIndex) }));
  return { format: "explicit", timing, relations, scoreItems, bodies, connections,
    bodyUnits: bodies.flatMap(body => body.units), totalJudgments: scoreItems.length,
    theoreticalWeight: scoreItems.reduce((sum, item) => sum + item.weight, 0) };
}
