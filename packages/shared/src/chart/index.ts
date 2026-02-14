/**
 * 차트 JSON 직렬화/역직렬화
 *
 * Beat 객체를 문자열("3/4", "0", "7")로 직렬화하고,
 * 파싱 시 Beat 객체로 복원한다.
 */

import type {
  Chart,
  ChartMeta,
  BpmMarker,
  TimeSignatureMarker,
  NoteEntity,
  TrillZone,
  Message,
} from "../types/chart";
import { beatFromString, beatToString } from "../types/beat";

// ---------------------------------------------------------------------------
// JSON 스키마 타입 (Beat → string)
// ---------------------------------------------------------------------------

interface BpmMarkerJson {
  beat: string;
  bpm: number;
}

interface TimeSignatureMarkerJson {
  measure: number;
  beatPerMeasure: string;
}

interface PointNoteJson {
  type: "single" | "double" | "trill";
  lane: 1 | 2 | 3 | 4;
  beat: string;
}

interface RangeNoteJson {
  type: "singleLong" | "doubleLong" | "trillLong";
  lane: 1 | 2 | 3 | 4;
  beat: string;
  endBeat: string;
}

type NoteEntityJson = PointNoteJson | RangeNoteJson;

interface TrillZoneJson {
  lane: 1 | 2 | 3 | 4;
  beat: string;
  endBeat: string;
}

interface MessageJson {
  beat: string;
  endBeat: string;
  text: string;
}

export interface ChartJson {
  meta: ChartMeta;
  bpmMarkers: BpmMarkerJson[];
  timeSignatures: TimeSignatureMarkerJson[];
  notes: NoteEntityJson[];
  trillZones: TrillZoneJson[];
  messages: MessageJson[];
}

// ---------------------------------------------------------------------------
// 직렬화: Chart → ChartJson → string
// ---------------------------------------------------------------------------

function serializeBpmMarker(m: BpmMarker): BpmMarkerJson {
  return { beat: beatToString(m.beat), bpm: m.bpm };
}

function serializeTimeSignature(m: TimeSignatureMarker): TimeSignatureMarkerJson {
  return {
    measure: m.measure,
    beatPerMeasure: beatToString(m.beatPerMeasure),
  };
}

function serializeNote(n: NoteEntity): NoteEntityJson {
  if ("endBeat" in n) {
    return {
      type: n.type,
      lane: n.lane,
      beat: beatToString(n.beat),
      endBeat: beatToString(n.endBeat),
    };
  }
  return { type: n.type, lane: n.lane, beat: beatToString(n.beat) };
}

function serializeTrillZone(z: TrillZone): TrillZoneJson {
  return {
    lane: z.lane,
    beat: beatToString(z.beat),
    endBeat: beatToString(z.endBeat),
  };
}

function serializeMessage(m: Message): MessageJson {
  return {
    beat: beatToString(m.beat),
    endBeat: beatToString(m.endBeat),
    text: m.text,
  };
}

/** Chart → JSON 객체 */
export function chartToJson(chart: Chart): ChartJson {
  return {
    meta: chart.meta,
    bpmMarkers: chart.bpmMarkers.map(serializeBpmMarker),
    timeSignatures: chart.timeSignatures.map(serializeTimeSignature),
    notes: chart.notes.map(serializeNote),
    trillZones: chart.trillZones.map(serializeTrillZone),
    messages: chart.messages.map(serializeMessage),
  };
}

/** Chart → JSON 문자열 */
export function serializeChart(chart: Chart): string {
  return JSON.stringify(chartToJson(chart), null, 2);
}

// ---------------------------------------------------------------------------
// 역직렬화: string → ChartJson → Chart
// ---------------------------------------------------------------------------

function parseBpmMarker(m: BpmMarkerJson): BpmMarker {
  return { beat: beatFromString(m.beat), bpm: m.bpm };
}

function parseTimeSignature(m: TimeSignatureMarkerJson): TimeSignatureMarker {
  return {
    measure: m.measure,
    beatPerMeasure: beatFromString(m.beatPerMeasure),
  };
}

function parseNote(n: NoteEntityJson): NoteEntity {
  if ("endBeat" in n) {
    return {
      type: n.type,
      lane: n.lane,
      beat: beatFromString(n.beat),
      endBeat: beatFromString(n.endBeat),
    };
  }
  return { type: n.type, lane: n.lane, beat: beatFromString(n.beat) };
}

function parseTrillZone(z: TrillZoneJson): TrillZone {
  return {
    lane: z.lane,
    beat: beatFromString(z.beat),
    endBeat: beatFromString(z.endBeat),
  };
}

function parseMessage(m: MessageJson): Message {
  return {
    beat: beatFromString(m.beat),
    endBeat: beatFromString(m.endBeat),
    text: m.text,
  };
}

/** JSON 객체 → Chart */
export function chartFromJson(json: ChartJson): Chart {
  return {
    meta: json.meta,
    bpmMarkers: json.bpmMarkers.map(parseBpmMarker),
    timeSignatures: json.timeSignatures.map(parseTimeSignature),
    notes: json.notes.map(parseNote),
    trillZones: json.trillZones.map(parseTrillZone),
    messages: json.messages.map(parseMessage),
  };
}

/** JSON 문자열 → Chart */
export function deserializeChart(str: string): Chart {
  const json: ChartJson = JSON.parse(str);
  return chartFromJson(json);
}
