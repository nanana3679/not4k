/**
 * 차트 JSON 직렬화/역직렬화
 *
 * Beat 객체를 문자열("3/4", "0", "7")로 직렬화하고,
 * 파싱 시 Beat 객체로 복원한다.
 */

import type {
  Chart,
  ChartMeta,
  NoteEntity,
  PointNote,
  TrillZone,
  ChartEvent,
  ExtraNoteEntity,
} from "../types/chart";
import { beatFromString, beatToString } from "../types/beat";

// ---------------------------------------------------------------------------
// JSON 스키마 타입 (Beat → string)
// ---------------------------------------------------------------------------

interface PointNoteJson {
  type: "single" | "double" | "trill";
  lane: 1 | 2 | 3 | 4;
  beat: string;
  grace?: boolean;
}

interface RangeNoteJson {
  type: "long" | "doubleLong" | "trillLong";
  lane: 1 | 2 | 3 | 4;
  beat: string;
  endBeat: string;
}

/** 레거시 v1 포맷 (singleLong 결합 엔티티) */
interface LegacyRangeNoteJson {
  type: "singleLong" | "doubleLong" | "trillLong";
  lane: 1 | 2 | 3 | 4;
  beat: string;
  endBeat: string;
}

type NoteEntityJson = PointNoteJson | RangeNoteJson;

interface ExtraPointNoteJson {
  type: "single" | "double" | "trill";
  extraLane: number;
  beat: string;
}

interface ExtraRangeNoteJson {
  type: "long" | "doubleLong" | "trillLong";
  extraLane: number;
  beat: string;
  endBeat: string;
}

type ExtraNoteEntityJson = ExtraPointNoteJson | ExtraRangeNoteJson;

interface TrillZoneJson {
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

type ChartEventJson = BpmEventJson | TimeSignatureEventJson | TextEventJson | AutoEventJson | StopEventJson;

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
  notes: NoteEntityJson[];
  trillZones: TrillZoneJson[];
  events: (ChartEventJson | LegacyEventMarkerJson)[];
}

/** 출력용 (직렬화 — 항상 v3 ChartEventJson) */
export interface ChartJsonV3 {
  version: 3;
  meta: ChartMeta;
  notes: NoteEntityJson[];
  trillZones: TrillZoneJson[];
  events: ChartEventJson[];
}

// ---------------------------------------------------------------------------
// 직렬화: Chart → ChartJson → string
// ---------------------------------------------------------------------------

function serializeNote(n: NoteEntity): NoteEntityJson {
  if ("endBeat" in n) {
    return {
      type: n.type,
      lane: n.lane,
      beat: beatToString(n.beat),
      endBeat: beatToString(n.endBeat),
    };
  }
  const json: PointNoteJson = { type: n.type, lane: n.lane, beat: beatToString(n.beat) };
  if (n.grace) json.grace = true;
  return json;
}

function serializeTrillZone(z: TrillZone): TrillZoneJson {
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
  }
}

/** Chart → JSON 객체 (v3) */
export function chartToJson(chart: Chart): ChartJsonV3 {
  return {
    version: 3,
    meta: chart.meta,
    notes: chart.notes.map(serializeNote),
    trillZones: chart.trillZones.map(serializeTrillZone),
    events: chart.events.map(serializeEvent),
  };
}

/** Chart → JSON 문자열 */
export function serializeChart(chart: Chart): string {
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
  if (meta.difficultyLabel.toUpperCase() === targetDifficulty.toUpperCase()) {
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

function parseNote(n: NoteEntityJson): NoteEntity {
  if ("endBeat" in n) {
    return {
      type: n.type,
      lane: n.lane,
      beat: beatFromString(n.beat),
      endBeat: beatFromString(n.endBeat),
    };
  }
  const note: PointNote = { type: n.type, lane: n.lane, beat: beatFromString(n.beat) };
  if (n.grace) note.grace = true;
  return note;
}

function parseTrillZone(z: TrillZoneJson): TrillZone {
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

/** JSON 객체 → Chart */
export function chartFromJson(json: ChartJson): Chart {
  // v3: 디스크리미네이티드 유니온 이벤트
  if (json.version && json.version >= 3) {
    return {
      meta: json.meta,
      notes: json.notes.map(parseNote),
      trillZones: json.trillZones.map(parseTrillZone),
      events: (json.events ?? []).map((e) => parseEvent(e as ChartEventJson)),
    };
  }

  // v2: composable EventMarker → ChartEvent[] 마이그레이션
  if (json.version && json.version >= 2) {
    const events: ChartEvent[] = [];
    for (const e of json.events ?? []) {
      if (isChartEventJson(e)) {
        events.push(parseEvent(e));
      } else {
        events.push(...migrateLegacyEvent(e));
      }
    }
    return {
      meta: json.meta,
      notes: json.notes.map(parseNote),
      trillZones: json.trillZones.map(parseTrillZone),
      events,
    };
  }

  // v1 레거시: "singleLong" → "long" 타입명 변경
  const legacyNotes = json.notes as (PointNoteJson | LegacyRangeNoteJson)[];
  const migratedNotes: NoteEntity[] = [];

  for (const n of legacyNotes) {
    if ("endBeat" in n) {
      const ln = n as LegacyRangeNoteJson;
      if (ln.type === "singleLong") {
        migratedNotes.push({
          type: "long",
          lane: ln.lane,
          beat: beatFromString(ln.beat),
          endBeat: beatFromString(ln.endBeat),
        });
      } else {
        migratedNotes.push(parseNote(n as RangeNoteJson));
      }
    } else {
      migratedNotes.push(parseNote(n));
    }
  }

  const events: ChartEvent[] = [];
  for (const e of json.events ?? []) {
    if (isChartEventJson(e)) {
      events.push(parseEvent(e));
    } else {
      events.push(...migrateLegacyEvent(e));
    }
  }

  return {
    meta: json.meta,
    notes: migratedNotes,
    trillZones: json.trillZones.map(parseTrillZone),
    events,
  };
}

/** JSON 문자열 → Chart */
export function deserializeChart(str: string): Chart {
  let json: ChartJson;
  try {
    json = JSON.parse(str);
  } catch {
    throw new Error("차트 파싱 실패: 유효한 JSON이 아닙니다");
  }
  if (!json || typeof json !== "object") {
    throw new Error("차트 파싱 실패: 최상위 값이 객체가 아닙니다");
  }
  if (!json.meta || typeof json.meta !== "object") {
    throw new Error("차트 파싱 실패: meta 필드가 없거나 유효하지 않습니다");
  }
  if (!Array.isArray(json.notes)) {
    throw new Error("차트 파싱 실패: notes 필드가 배열이 아닙니다");
  }
  if (!Array.isArray(json.trillZones)) {
    throw new Error("차트 파싱 실패: trillZones 필드가 배열이 아닙니다");
  }
  return chartFromJson(json);
}

// ---------------------------------------------------------------------------
// Extra 노트 직렬화 (에디터 전용)
// ---------------------------------------------------------------------------

function serializeExtraNote(n: ExtraNoteEntity): ExtraNoteEntityJson {
  if ("endBeat" in n) {
    return {
      type: n.type,
      extraLane: n.extraLane,
      beat: beatToString(n.beat),
      endBeat: beatToString(n.endBeat),
    };
  }
  return { type: n.type, extraLane: n.extraLane, beat: beatToString(n.beat) };
}

function parseExtraNote(n: ExtraNoteEntityJson): ExtraNoteEntity {
  if ("endBeat" in n) {
    return {
      type: n.type,
      extraLane: n.extraLane,
      beat: beatFromString(n.beat),
      endBeat: beatFromString(n.endBeat),
    };
  }
  return { type: n.type, extraLane: n.extraLane, beat: beatFromString(n.beat) };
}

/** Extra 노트 데이터 → JSON 문자열 (별도 .extra.json 파일용) */
export function serializeExtraNotes(
  extraNotes: ExtraNoteEntity[],
  extraLaneCount: number,
): string {
  return JSON.stringify({
    extraNotes: extraNotes.map(serializeExtraNote),
    extraLaneCount,
  }, null, 2);
}

/** extra JSON에서 데이터 추출 */
export function parseExtraNotes(json: {
  extraNotes?: ExtraNoteEntityJson[];
  extraLaneCount?: number;
}): {
  extraNotes: ExtraNoteEntity[];
  extraLaneCount: number;
} {
  return {
    extraNotes: (json.extraNotes ?? []).map(parseExtraNote),
    extraLaneCount: json.extraLaneCount ?? 0,
  };
}
