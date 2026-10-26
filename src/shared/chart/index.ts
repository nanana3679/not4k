/**
 * 차트 JSON 직렬화/역직렬화
 *
 * Beat 객체를 문자열("3/4", "0", "7")로 직렬화하고,
 * 파싱 시 Beat 객체로 복원한다.
 */

import type {
  Chart,
  ChartMeta,
  ChartDocument,
  DocumentExtraNoteEntity,
  TrillZone,
  RestZone,
  ChartEvent,
  ExtraNoteEntity,
  TutorialDiagramId,
} from "../types/chart";
import { isExplicitNote } from "../types/chart";
import { beatFromString, beatToString } from "../types/beat";
import { formatDifficultyLabel } from '../chartDifficulty';

// 메인/보조 레인 경계 레이어 (RFD 0018)
export * from "./laneAxis";
export * from "./auxAdapter";
export { ChartFormatError, UnsupportedChartContentError, assertLegacyNotes, requireLegacyChart } from "./noteDocument";
import {
  ChartFormatError, assertLegacyNotes, assertSupportedChartVersion, parseDocumentNote,
  requireLegacyChart, serializeDocumentNote,
  type DocumentNoteJson, type LegacyNoteJson,
} from "./noteDocument";
import { extraToNote, noteToExtra } from "./auxAdapter";
import { fromAuxIndex, toAuxIndex } from "./laneAxis";

// ---------------------------------------------------------------------------
// JSON 스키마 타입 (Beat → string)
// ---------------------------------------------------------------------------

/** v1 singleLong은 읽을 때만 구형 long으로 이름을 정규화한다. */
interface LegacyRangeNoteJson {
  type: "singleLong";
  lane: number;
  beat: string;
  endBeat: string;
  holdOnly?: boolean;
}

type ExtraNoteJson<T> = T extends { lane: number } ? Omit<T, "lane"> & { extraLane: number } : never;
type DocumentExtraNoteJson = ExtraNoteJson<DocumentNoteJson | LegacyRangeNoteJson>;

interface TrillZoneJson {
  lane: 1 | 2 | 3 | 4;
  beat: string;
  endBeat: string;
}

interface RestZoneJson {
  lane: 1 | 2 | 3 | 4;
  beat: string;
  endBeat: string;
}

// -- v3 이벤트 JSON (디스크리미네이티드 유니온) --

interface BpmEventJson {
  type: "bpm";
  beat: string;
  bpm: number;
  editorLane?: number;
}

interface TimeSignatureEventJson {
  type: "timeSignature";
  beat: string;
  beatPerMeasure: string;
  editorLane?: number;
}

interface TextEventJson {
  type: "text";
  beat: string;
  endBeat: string;
  text: string;
  editorLane?: number;
}

interface AutoEventJson {
  type: "auto";
  beat: string;
  endBeat: string;
  editorLane?: number;
}

interface StopEventJson {
  type: "stop";
  beat: string;
  endBeat: string;
  editorLane?: number;
}

interface TutorialInputEventJson {
  type: "tutorialInput";
  beat: string;
  endBeat: string;
  lane: 1 | 2 | 3 | 4;
  keyCode: string;
  keyLabel?: string;
  editorLane?: number;
}

interface TutorialDiagramEventJson {
  type: "tutorialDiagram";
  beat: string;
  endBeat: string;
  diagramId: TutorialDiagramId;
  editorLane?: number;
}

type ChartEventJson =
  | BpmEventJson
  | TimeSignatureEventJson
  | TextEventJson
  | AutoEventJson
  | StopEventJson
  | TutorialInputEventJson
  | TutorialDiagramEventJson;

// -- v2 레거시 이벤트 JSON (composable 구조) --

interface LegacyEventMarkerJson {
  beat: string;
  endBeat: string;
  text?: string;
  bpm?: number;
  beatPerMeasure?: string;
  stop?: true;
}

/** 입력용 (역직렬화 — 레거시 이벤트도 허용) */
export interface ChartJson {
  version?: number;
  meta: ChartMeta;
  notes: (DocumentNoteJson | LegacyRangeNoteJson)[];
  trillZones: TrillZoneJson[];
  /** restZone 도입(RFD 0019) 이전 차트에는 없음 — 부재 시 []로 파싱한다 */
  restZones?: RestZoneJson[];
  events: (ChartEventJson | LegacyEventMarkerJson)[];
}

/** 출력용 (직렬화 — 항상 v3 ChartEventJson) */
export interface ChartJsonV3 {
  version: 3;
  meta: ChartMeta;
  notes: LegacyNoteJson[];
  trillZones: TrillZoneJson[];
  restZones: RestZoneJson[];
  events: ChartEventJson[];
}

/** 출력용: 항목별 구형/명시 의미를 보존하는 v4. */
export interface ChartJsonV4 extends Omit<ChartJsonV3, "version" | "notes"> {
  version: 4;
  notes: DocumentNoteJson[];
}

// ---------------------------------------------------------------------------
// 직렬화: Chart → ChartJson → string
// ---------------------------------------------------------------------------

function serializeTrillZone(z: TrillZone): TrillZoneJson {
  return {
    lane: z.lane,
    beat: beatToString(z.beat),
    endBeat: beatToString(z.endBeat),
  };
}

function serializeRestZone(z: RestZone): RestZoneJson {
  return {
    lane: z.lane,
    beat: beatToString(z.beat),
    endBeat: beatToString(z.endBeat),
  };
}

function serializeEvent(e: ChartEvent): ChartEventJson {
  switch (e.type) {
    case "bpm":
      return { type: "bpm", beat: beatToString(e.beat), bpm: e.bpm, ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "timeSignature":
      return { type: "timeSignature", beat: beatToString(e.beat), beatPerMeasure: beatToString(e.beatPerMeasure), ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "text":
      return { type: "text", beat: beatToString(e.beat), endBeat: beatToString(e.endBeat), text: e.text, ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "auto":
      return { type: "auto", beat: beatToString(e.beat), endBeat: beatToString(e.endBeat), ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "stop":
      return { type: "stop", beat: beatToString(e.beat), endBeat: beatToString(e.endBeat), ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "tutorialInput":
      return {
        type: "tutorialInput",
        beat: beatToString(e.beat),
        endBeat: beatToString(e.endBeat),
        lane: e.lane,
        keyCode: e.keyCode,
        ...(e.keyLabel !== undefined && { keyLabel: e.keyLabel }),
        ...(e.editorLane !== undefined && { editorLane: e.editorLane }),
      };
    case "tutorialDiagram":
      return {
        type: "tutorialDiagram",
        beat: beatToString(e.beat),
        endBeat: beatToString(e.endBeat),
        diagramId: e.diagramId,
        ...(e.editorLane !== undefined && { editorLane: e.editorLane }),
      };
  }
}

/** 구형 전용은 기존 v3, 명시/혼합 문서는 v4. 버전이 항목 의미를 바꾸지 않는다. */
export function chartToJson(chart: Chart): ChartJsonV3;
export function chartToJson(chart: ChartDocument): ChartJsonV3 | ChartJsonV4;
export function chartToJson(chart: ChartDocument): ChartJsonV3 | ChartJsonV4 {
  const common = {
    trillZones: chart.trillZones.map(serializeTrillZone),
    restZones: (chart.restZones ?? []).map(serializeRestZone),
    events: chart.events.map(serializeEvent),
  };
  if (chart.notes.some(isExplicitNote)) return { version: 4, meta: chart.meta, notes: chart.notes.map(serializeDocumentNote), ...common };
  const legacy = requireLegacyChart(chart);
  return { version: 3, meta: chart.meta, notes: legacy.notes.map((note) => serializeDocumentNote(note)), ...common };
}

/** Chart → JSON 문자열 */
export function serializeChart(chart: ChartDocument): string {
  return JSON.stringify(chartToJson(chart), null, 2);
}

/**
 * Save As용 메타데이터 생성 — 대상 난이도/레벨로 변환한 ChartMeta를 반환한다.
 * 현재 난이도와 같은 대상을 지정하면 null을 반환한다.
 */
export function buildSaveAsMeta(
  meta: ChartMeta,
  targetDifficulty: string,
  targetLevel: number,
): ChartMeta | null {
  if (formatDifficultyLabel(meta.difficultyLabel) === formatDifficultyLabel(targetDifficulty)) {
    return null;
  }
  return {
    ...meta,
    difficultyLabel: targetDifficulty.toUpperCase(),
    difficultyLevel: targetLevel,
  };
}

// ---------------------------------------------------------------------------
// 역직렬화: string → ChartJson → Chart
// ---------------------------------------------------------------------------

function parseTrillZone(z: TrillZoneJson): TrillZone {
  return {
    lane: z.lane,
    beat: beatFromString(z.beat),
    endBeat: beatFromString(z.endBeat),
  };
}

function parseRestZone(z: RestZoneJson): RestZone {
  return {
    lane: z.lane,
    beat: beatFromString(z.beat),
    endBeat: beatFromString(z.endBeat),
  };
}

/** v3 ChartEventJson → ChartEvent */
function parseEvent(e: ChartEventJson): ChartEvent {
  switch (e.type) {
    case "bpm":
      return { type: "bpm", beat: beatFromString(e.beat), bpm: e.bpm, ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "timeSignature":
      return { type: "timeSignature", beat: beatFromString(e.beat), beatPerMeasure: beatFromString(e.beatPerMeasure), ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "text":
      return { type: "text", beat: beatFromString(e.beat), endBeat: beatFromString(e.endBeat), text: e.text, ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "auto":
      return { type: "auto", beat: beatFromString(e.beat), endBeat: beatFromString(e.endBeat), ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "stop":
      return { type: "stop", beat: beatFromString(e.beat), endBeat: beatFromString(e.endBeat), ...(e.editorLane !== undefined && { editorLane: e.editorLane }) };
    case "tutorialInput":
      return {
        type: "tutorialInput",
        beat: beatFromString(e.beat),
        endBeat: beatFromString(e.endBeat),
        lane: e.lane,
        keyCode: e.keyCode,
        ...(e.keyLabel !== undefined && { keyLabel: e.keyLabel }),
        ...(e.editorLane !== undefined && { editorLane: e.editorLane }),
      };
    case "tutorialDiagram":
      return {
        type: "tutorialDiagram",
        beat: beatFromString(e.beat),
        endBeat: beatFromString(e.endBeat),
        diagramId: e.diagramId,
        ...(e.editorLane !== undefined && { editorLane: e.editorLane }),
      };
  }
}

/**
 * v2 레거시 EventMarkerJson → ChartEvent[] 마이그레이션.
 * 하나의 composable 이벤트를 여러 개의 독립 이벤트로 분리한다.
 */
function migrateLegacyEvent(e: LegacyEventMarkerJson): ChartEvent[] {
  const events: ChartEvent[] = [];
  if (e.bpm !== undefined) {
    events.push({ type: "bpm", beat: beatFromString(e.beat), bpm: e.bpm });
  }
  if (e.beatPerMeasure !== undefined) {
    events.push({ type: "timeSignature", beat: beatFromString(e.beat), beatPerMeasure: beatFromString(e.beatPerMeasure) });
  }
  if (e.text !== undefined) {
    events.push({ type: "text", beat: beatFromString(e.beat), endBeat: beatFromString(e.endBeat), text: e.text });
  }
  if (e.stop) {
    events.push({ type: "stop", beat: beatFromString(e.beat), endBeat: beatFromString(e.endBeat) });
  }
  return events;
}

/** 이벤트 JSON이 v3 형식(type 필드 보유)인지 판별 */
function isChartEventJson(e: ChartEventJson | LegacyEventMarkerJson): e is ChartEventJson {
  return "type" in e;
}

/** JSON 객체 → 보존 가능한 저장 문서. 의미 위반/구형 존재는 읽기 차단 사유가 아니다. */
export function chartDocumentFromJson(json: ChartJson): ChartDocument {
  assertSupportedChartVersion(json.version);
  const events: ChartEvent[] = [];
  for (const e of json.events ?? []) {
    if (isChartEventJson(e)) {
      const event = parseEvent(e);
      if (!event) throw new ChartFormatError(`지원하지 않는 이벤트 type: ${String(e.type)}`);
      events.push(event);
    } else {
      if ((json.version ?? 1) >= 3) throw new ChartFormatError("version 3/4 이벤트에는 type이 필요합니다");
      events.push(...migrateLegacyEvent(e));
    }
  }
  return {
    meta: json.meta,
    notes: json.notes.map((note) => parseDocumentNote(note, json.version)),
    trillZones: json.trillZones.map(parseTrillZone),
    restZones: (json.restZones ?? []).map(parseRestZone),
    events,
  };
}

/** 기존 소비자는 명시 항목을 구형 점수로 실행하거나 편집하지 못한다. */
export function chartFromJson(json: ChartJson): Chart {
  return requireLegacyChart(chartDocumentFromJson(json));
}

/** JSON 문자열 → 저장 문서. 기존 UI 진입과 분리된 공용 읽기 경계다. */
export function deserializeChartDocument(str: string): ChartDocument {
  let json: ChartJson;
  try {
    json = JSON.parse(str);
  } catch {
    throw new ChartFormatError("유효한 JSON이 아닙니다");
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new ChartFormatError("최상위 값이 객체가 아닙니다");
  if (!json.meta || typeof json.meta !== "object" || Array.isArray(json.meta)) throw new ChartFormatError("meta 필드가 없거나 유효하지 않습니다");
  if (!Array.isArray(json.notes)) throw new ChartFormatError("notes 필드가 배열이 아닙니다");
  if (!Array.isArray(json.trillZones)) throw new ChartFormatError("trillZones 필드가 배열이 아닙니다");
  if (json.restZones !== undefined && !Array.isArray(json.restZones)) throw new ChartFormatError("restZones 필드가 배열이 아닙니다");
  if (json.events !== undefined && !Array.isArray(json.events)) throw new ChartFormatError("events 필드가 배열이 아닙니다");
  return chartDocumentFromJson(json);
}

export function deserializeChart(str: string): Chart {
  return requireLegacyChart(deserializeChartDocument(str));
}

// ---------------------------------------------------------------------------
// Extra 노트 직렬화 (에디터 전용)
// ---------------------------------------------------------------------------

export interface ExtraNotesJson {
  version?: number;
  extraNotes?: DocumentExtraNoteJson[];
  extraLaneCount?: number;
}

/** 구형 보조 파일은 기존 모양 유지, 명시 항목이 있으면 version 4를 명시한다. */
export function serializeExtraNotes(extraNotes: readonly DocumentExtraNoteEntity[], extraLaneCount: number): string {
  const notes = extraNotes.map(extraToNote);
  return JSON.stringify({
    ...(notes.some(isExplicitNote) ? { version: 4 } : {}),
    extraNotes: notes.map((note) => {
      const { type, lane, beat, ...rest } = serializeDocumentNote(note);
      return { type, extraLane: toAuxIndex(lane), beat, ...rest };
    }),
    extraLaneCount,
  }, null, 2);
}

/** 공용 보조 reader. 메인 JSON에 내장된 과거 보조 자료도 받는다. */
export function parseExtraNotesDocument(json: ExtraNotesJson): { extraNotes: DocumentExtraNoteEntity[]; extraLaneCount: number } {
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new ChartFormatError("보조 자료가 객체가 아닙니다");
  assertSupportedChartVersion(json.version);
  if (json.extraNotes !== undefined && !Array.isArray(json.extraNotes)) throw new ChartFormatError("extraNotes 필드가 배열이 아닙니다");
  const extraLaneCount = json.extraLaneCount ?? 0;
  if (!Number.isInteger(extraLaneCount) || extraLaneCount < 0) throw new ChartFormatError("extraLaneCount는 0 이상의 정수여야 합니다");
  const extraNotes = (json.extraNotes ?? []).map((value) => {
    if (!value || typeof value !== "object") throw new ChartFormatError("보조 노트가 객체가 아닙니다");
    const { extraLane, ...rest } = value;
    const note = parseDocumentNote({ ...rest, lane: extraLane }, json.version);
    // 파일의 extraLane 숫자를 읽은 뒤 실제 보조 lane으로 매핑한다.
    return noteToExtra({ ...note, lane: fromAuxIndex(note.lane) });
  });
  return { extraNotes, extraLaneCount };
}

/** 구형 에디터 경계. 새 보조 항목을 조용히 버리지 않으며 호출자가 오류를 전달해야 한다. */
export function parseExtraNotes(json: ExtraNotesJson): { extraNotes: ExtraNoteEntity[]; extraLaneCount: number } {
  const result = parseExtraNotesDocument(json);
  const notes = result.extraNotes.map(extraToNote);
  assertLegacyNotes(notes, "구형 보조 reader");
  return { extraNotes: notes.map((note) => noteToExtra(note)), extraLaneCount: result.extraLaneCount };
}

export * from "./explicitNoteRelations";
