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
  TrillZone,
  EventMarker,
} from "../types/chart";
import { beatFromString, beatToString } from "../types/beat";

// ---------------------------------------------------------------------------
// JSON 스키마 타입 (Beat → string)
// ---------------------------------------------------------------------------

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

interface EventMarkerJson {
  beat: string;
  endBeat: string;
  text?: string;
  bpm?: number;
  beatPerMeasure?: string;
  stop?: true;
}

export interface ChartJson {
  meta: ChartMeta;
  notes: NoteEntityJson[];
  trillZones: TrillZoneJson[];
  events: EventMarkerJson[];
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
  return { type: n.type, lane: n.lane, beat: beatToString(n.beat) };
}

function serializeTrillZone(z: TrillZone): TrillZoneJson {
  return {
    lane: z.lane,
    beat: beatToString(z.beat),
    endBeat: beatToString(z.endBeat),
  };
}

function serializeEvent(e: EventMarker): EventMarkerJson {
  const json: EventMarkerJson = {
    beat: beatToString(e.beat),
    endBeat: beatToString(e.endBeat),
  };
  if (e.text !== undefined) json.text = e.text;
  if (e.bpm !== undefined) json.bpm = e.bpm;
  if (e.beatPerMeasure !== undefined) json.beatPerMeasure = beatToString(e.beatPerMeasure);
  if (e.stop) json.stop = true;
  return json;
}

/** Chart → JSON 객체 */
export function chartToJson(chart: Chart): ChartJson {
  return {
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
  return { type: n.type, lane: n.lane, beat: beatFromString(n.beat) };
}

function parseTrillZone(z: TrillZoneJson): TrillZone {
  return {
    lane: z.lane,
    beat: beatFromString(z.beat),
    endBeat: beatFromString(z.endBeat),
  };
}

function parseEvent(e: EventMarkerJson): EventMarker {
  const marker: EventMarker = {
    beat: beatFromString(e.beat),
    endBeat: beatFromString(e.endBeat),
  };
  if (e.text !== undefined) marker.text = e.text;
  if (e.bpm !== undefined) marker.bpm = e.bpm;
  if (e.beatPerMeasure !== undefined) marker.beatPerMeasure = beatFromString(e.beatPerMeasure);
  if (e.stop) marker.stop = true;
  return marker;
}

/** JSON 객체 → Chart (레거시 bpmMarkers/timeSignatures 필드는 무시) */
export function chartFromJson(json: ChartJson): Chart {
  return {
    meta: json.meta,
    notes: json.notes.map(parseNote),
    trillZones: json.trillZones.map(parseTrillZone),
    events: (json.events ?? []).map(parseEvent),
  };
}

/** JSON 문자열 → Chart */
export function deserializeChart(str: string): Chart {
  const json: ChartJson = JSON.parse(str);
  return chartFromJson(json);
}
