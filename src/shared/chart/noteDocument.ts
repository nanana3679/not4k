import type { Beat } from "../types/beat";
import { beatFromString, beatToString } from "../types/beat";
import type { Chart, ChartDocument, DocumentNoteEntity, NoteEntity } from "../types/chart";

type NoteJson<T> = T extends DocumentNoteEntity
  ? Omit<T, "beat" | "endBeat"> & { beat: string } & (T extends { endBeat: Beat } ? { endBeat: string } : object)
  : never;

export type DocumentNoteJson = NoteJson<DocumentNoteEntity>;
export type LegacyNoteJson = NoteJson<NoteEntity>;

/** 저장 형식 오류는 보조 파일 누락과 달리 무시하면 원본을 유실할 수 있다. */
export class ChartFormatError extends Error {
  constructor(message: string) {
    super(`차트 파싱 실패: ${message}`);
    this.name = "ChartFormatError";
  }
}

export class UnsupportedChartContentError extends ChartFormatError {
  constructor(context: string) {
    super(`${context}에서는 명시적 노트 형식을 지원하지 않습니다`);
    this.name = "UnsupportedChartContentError";
  }
}

export function assertSupportedChartVersion(version: unknown): void {
  if (version !== undefined && version !== 1 && version !== 2 && version !== 3 && version !== 4) {
    throw new ChartFormatError(`지원하지 않는 version: ${String(version)}`);
  }
}

/** 외부 JS 입력도 포함한 구형 실행 경계. 항목을 걸러내거나 변환하지 않는다. */
export function assertLegacyNotes(notes: DocumentNoteEntity[], context?: string): asserts notes is NoteEntity[];
export function assertLegacyNotes(notes: readonly DocumentNoteEntity[], context?: string): asserts notes is readonly NoteEntity[];
export function assertLegacyNotes(notes: readonly DocumentNoteEntity[], context = "구형 소비자"): asserts notes is readonly NoteEntity[] {
  for (const note of notes) {
    if (!["single", "double", "trill", "long", "doubleLong", "trillLong"].includes(note.type)) {
      throw new UnsupportedChartContentError(context);
    }
  }
}

export function requireLegacyChart(chart: ChartDocument, context = "구형 차트 reader"): Chart {
  // readonly assertion으로 원본 배열을 변경하지 않고 소비자의 좁은 계약을 증명한다.
  const notes = chart.notes;
  assertLegacyNotes(notes, context);
  return { ...chart, notes: [...notes] };
}

export function serializeDocumentNote(note: NoteEntity): LegacyNoteJson;
export function serializeDocumentNote(note: DocumentNoteEntity): DocumentNoteJson;
export function serializeDocumentNote(note: DocumentNoteEntity): DocumentNoteJson {
  const common = { type: note.type, lane: note.lane, beat: beatToString(note.beat) };
  if ("endBeat" in note) {
    const endBeat = beatToString(note.endBeat);
    if (note.type === "body") {
      if (note.holdCount === 2) return { ...common, type: note.type, endBeat, holdCount: 2 };
      return { ...common, type: note.type, endBeat, holdCount: 1, ...(note.trill === undefined ? {} : { trill: note.trill }) };
    }
    return { ...common, type: note.type, endBeat, ...(note.holdOnly === undefined ? {} : { holdOnly: note.holdOnly }) };
  }
  if (note.type === "tick") return { ...common, type: note.type, count: note.count };
  const grace = note.grace === undefined ? {} : { grace: note.grace };
  if (note.type === "tap") return { ...common, type: note.type, kind: note.kind, ...grace };
  if (note.type === "release") return { ...common, type: note.type, count: note.count, ...grace };
  return { ...common, type: note.type, ...grace };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ChartFormatError("노트가 객체가 아닙니다");
  return value as Record<string, unknown>;
}

function optionalBoolean(n: Record<string, unknown>, key: string): boolean | undefined {
  const value = n[key];
  if (value !== undefined && typeof value !== "boolean") throw new ChartFormatError(`${key}는 boolean이어야 합니다`);
  return value;
}

function count(n: Record<string, unknown>, key: string): 1 | 2 {
  const value = n[key];
  if (value !== 1 && value !== 2) throw new ChartFormatError(`${key}는 1 또는 2여야 합니다`);
  return value;
}

function parseBeat(value: unknown, key: string): Beat {
  if (typeof value !== "string") throw new ChartFormatError(`${key}는 박 문자열이어야 합니다`);
  try {
    const result = beatFromString(value);
    if (!Number.isFinite(result.n) || !Number.isFinite(result.d) || result.d === 0) throw new Error();
    return result;
  } catch {
    throw new ChartFormatError(`${key}의 박 문자열이 유효하지 않습니다`);
  }
}

function checkFields(n: Record<string, unknown>, fields: string[]): void {
  const allowed = new Set(["type", "lane", "beat", ...fields]);
  for (const key of Object.keys(n)) {
    if (!allowed.has(key)) throw new ChartFormatError(`${String(n.type)} 노트가 지원하지 않는 필드: ${key}`);
  }
}

/** 배치 관계는 검사하지 않는다. 바디 밖 tick 등도 수리용으로 그대로 읽는다. */
export function parseDocumentNote(value: unknown, version?: number): DocumentNoteEntity {
  const n = record(value);
  if (typeof n.lane !== "number" || !Number.isFinite(n.lane)) throw new ChartFormatError("lane은 유한한 숫자여야 합니다");
  const lane = n.lane;
  const beat = parseBeat(n.beat, "beat");
  const type = n.type === "singleLong" && (version === undefined || version === 1) ? "long" : n.type;
  if (["tap", "body", "release", "tick"].includes(String(type)) && version !== 4) {
    throw new ChartFormatError("명시적 노트에는 version 4가 필요합니다");
  }
  switch (type) {
    case "single": case "double": case "trill": case "tap": case "release": {
      checkFields(n, type === "tap" ? ["kind", "grace"] : type === "release" ? ["count", "grace"] : ["grace"]);
      const grace = optionalBoolean(n, "grace");
      const flag = grace === undefined ? {} : { grace };
      if (type === "release") return { type, lane, beat, count: count(n, "count"), ...flag };
      if (type === "tap") {
        if (n.kind !== "single" && n.kind !== "double" && n.kind !== "trill") throw new ChartFormatError("tap kind가 유효하지 않습니다");
        return { type, lane, beat, kind: n.kind, ...flag };
      }
      return { type, lane, beat, ...flag };
    }
    case "long": case "doubleLong": case "trillLong": case "body": {
      checkFields(n, type === "body" ? ["endBeat", "holdCount", "trill"] : ["endBeat", "holdOnly"]);
      const endBeat = parseBeat(n.endBeat, "endBeat");
      if (type === "body") {
        const holdCount = count(n, "holdCount");
        if (n.trill !== undefined && n.trill !== true) throw new ChartFormatError("바디 trill은 true만 쓸 수 있습니다(트릴이 아니면 생략)");
        if (n.trill === true && holdCount !== 1) throw new ChartFormatError("trill 바디의 holdCount는 1이어야 합니다");
        if (holdCount === 2) return { type, lane, beat, endBeat, holdCount };
        return { type, lane, beat, endBeat, holdCount, ...(n.trill === true ? { trill: true } : {}) };
      }
      const holdOnly = optionalBoolean(n, "holdOnly");
      return { type, lane, beat, endBeat, ...(holdOnly === undefined ? {} : { holdOnly }) };
    }
    case "tick":
      checkFields(n, ["count"]);
      return { type, lane, beat, count: count(n, "count") };
    default:
      throw new ChartFormatError(`지원하지 않는 노트 type: ${String(n.type)}`);
  }
}
