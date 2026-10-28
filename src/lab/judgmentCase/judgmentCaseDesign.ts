/** 수동 설계 그림의 입력 계약. 차트 변환·판정·게임 규칙 검증은 하지 않는다. */
import { formatMs } from "./judgmentCaseLayout";

export type DesignTone = "neutral" | "success" | "failure" | "proposal";
export type DesignNoteKind = "body" | "tap" | "release" | "tick" | "marker";
export interface DesignNote {
  id: string;
  name: string;
  kind: DesignNoteKind;
  lane: number;
  count: number;
  startMs: number;
  endMs: number;
}
export interface DesignInput { key: string; lane: number; downMs: number; upMs: number | null }
export interface DesignWindow { note: string; startMs: number; endMs: number; label: string; tone: DesignTone }
export interface DesignAnnotation {
  note?: string;
  atMs: number;
  /** 이미지 밖에 표시하는 설명 본문 */
  text: string;
  /** 이미지에 붙일 짧은 라벨. 생략하면 본문만 출력한다 */
  label?: string;
  tone: DesignTone;
}
export interface JudgmentCaseDesign {
  title: string;
  notes: DesignNote[];
  inputs: DesignInput[];
  windows: DesignWindow[];
  annotations: DesignAnnotation[];
  summary: string;
  memo: string;
}

export const DESIGN_BANNER = "설계 예시 · 엔진 미실행 · 판정과 설명은 직접 지정";
export const DESIGN_KIND_LABELS: Record<DesignNoteKind, string> = {
  body: "바디", tap: "탭 노트", release: "release", tick: "틱 노트", marker: "표식",
};
export const DESIGN_TONE_LABELS: Record<DesignTone, string> = {
  neutral: "설명", success: "성공 가정", failure: "실패 가정", proposal: "제안",
};

function record(value: unknown, location: string, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${location}: 객체여야 합니다`);
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw new Error(`${location}.${key}: 알 수 없는 필드`);
  }
  return value as Record<string, unknown>;
}
function string(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${location}: 비어 있지 않은 문자열이어야 합니다`);
  return value;
}
function number(value: unknown, location: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${location}: 유한한 숫자여야 합니다`);
  return value;
}
function positiveInteger(value: unknown, location: string): number {
  const result = number(value, location);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error(`${location}: 양의 정수여야 합니다`);
  return result;
}
function choice<T extends string>(value: unknown, values: readonly T[], location: string): T {
  if (!values.includes(value as T)) throw new Error(`${location}: ${values.join("·")} 중 하나여야 합니다`);
  return value as T;
}
function array(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${location}: 배열이어야 합니다`);
  return value;
}
function range(start: number, end: number, location: string) {
  if (end < start) throw new Error(`${location}: 끝 시각이 시작 시각보다 빠릅니다`);
}

/** 잘못 그릴 수 있는 구조만 검증한다. 같은 위치의 여러 의미·현재 엔진 밖의 시각/배치는 허용한다. */
export function parseJudgmentCaseDesign(source: string, fallbackTitle = ""): JudgmentCaseDesign {
  let parsed: unknown;
  try { parsed = JSON.parse(source); }
  catch { throw new Error("설계 JSON을 읽을 수 없습니다"); }
  // 에디터·v4 차트 JSON에는 version·meta 같은 필드가 있으므로 알 수 없는 필드 오류보다 형식 안내를 먼저 낸다.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as Record<string, unknown>).format !== "judgment-case-design") {
    throw new Error('format은 "judgment-case-design"이어야 합니다 (--design 전용 JSON)');
  }
  const root = record(parsed, "설계", ["format", "title", "notes", "inputs", "windows", "annotations", "summary", "memo"]);
  const ids = new Set<string>();
  const notes = array(root.notes, "notes").map((value, index): DesignNote => {
    const loc = `notes[${index}]`;
    const obj = record(value, loc, ["id", "name", "kind", "lane", "count", "atMs", "startMs", "endMs"]);
    const id = obj.id === undefined ? `N${index + 1}` : string(obj.id, `${loc}.id`);
    if (ids.has(id)) throw new Error(`${loc}.id: 중복 노트 이름 ${id}`);
    ids.add(id);
    const kind = choice(obj.kind, ["body", "tap", "release", "tick", "marker"] as const, `${loc}.kind`);
    if (kind === "body" ? obj.atMs !== undefined : obj.startMs !== undefined || obj.endMs !== undefined) {
      throw new Error(`${loc}: body에는 startMs·endMs, 나머지에는 atMs만 씁니다`);
    }
    const startMs = number(kind === "body" ? obj.startMs : obj.atMs, `${loc}.${kind === "body" ? "startMs" : "atMs"}`);
    const endMs = kind === "body" ? number(obj.endMs, `${loc}.endMs`) : startMs;
    range(startMs, endMs, loc);
    return { id, kind, startMs, endMs, name: obj.name === undefined ? "" : string(obj.name, `${loc}.name`),
      lane: positiveInteger(obj.lane ?? 1, `${loc}.lane`), count: positiveInteger(obj.count ?? 1, `${loc}.count`) };
  });
  if (!notes.length) throw new Error("notes: 노트가 하나 이상 필요합니다");
  const noteRef = (value: unknown, loc: string) => {
    const id = string(value, loc);
    if (!ids.has(id)) throw new Error(`${loc}: 없는 노트 ${id}`);
    return id;
  };
  const tone = (value: unknown, loc: string) => choice(value ?? "neutral", ["neutral", "success", "failure", "proposal"] as const, loc);
  const inputs = array(root.inputs === undefined ? [] : root.inputs, "inputs").map((value, index): DesignInput => {
    const loc = `inputs[${index}]`;
    const obj = record(value, loc, ["key", "lane", "downMs", "upMs"]);
    const downMs = number(obj.downMs, `${loc}.downMs`);
    const upMs = obj.upMs == null ? null : number(obj.upMs, `${loc}.upMs`);
    if (upMs !== null) range(downMs, upMs, loc);
    return { key: string(obj.key, `${loc}.key`), lane: positiveInteger(obj.lane ?? 1, `${loc}.lane`), downMs, upMs };
  });
  const windows = array(root.windows === undefined ? [] : root.windows, "windows").map((value, index): DesignWindow => {
    const loc = `windows[${index}]`;
    const obj = record(value, loc, ["note", "startMs", "endMs", "label", "tone"]);
    const startMs = number(obj.startMs, `${loc}.startMs`);
    const endMs = number(obj.endMs, `${loc}.endMs`);
    range(startMs, endMs, loc);
    return { note: noteRef(obj.note, `${loc}.note`), startMs, endMs,
      label: string(obj.label, `${loc}.label`), tone: tone(obj.tone, `${loc}.tone`) };
  });
  const annotations = array(root.annotations === undefined ? [] : root.annotations, "annotations").map((value, index): DesignAnnotation => {
    const loc = `annotations[${index}]`;
    const obj = record(value, loc, ["note", "atMs", "text", "label", "tone"]);
    return { ...(obj.note === undefined ? {} : { note: noteRef(obj.note, `${loc}.note`) }),
      ...(obj.label === undefined ? {} : { label: string(obj.label, `${loc}.label`) }),
      atMs: number(obj.atMs, `${loc}.atMs`), text: string(obj.text, `${loc}.text`), tone: tone(obj.tone, `${loc}.tone`) };
  });
  return { title: root.title === undefined ? fallbackTitle || "설계 예시" : string(root.title, "title"), notes, inputs, windows, annotations,
    summary: root.summary === undefined ? "" : string(root.summary, "summary"), memo: root.memo === undefined ? "" : string(root.memo, "memo") };
}

export function designNoteLabel(note: DesignNote): string {
  const time = note.kind === "body" ? `${formatMs(note.startMs)}～${formatMs(note.endMs)}` : formatMs(note.startMs);
  return `${note.id}${note.name ? ` [${note.name}]` : ""} · ${DESIGN_KIND_LABELS[note.kind]} ×${note.count} · L${note.lane} · ${time}ms`;
}

/** 엔진 집계 대신 사용자가 지정한 내용을 그대로 출력한다. 이미지 열람이 불가능할 때도 읽을 수 있다. */
export function summarizeJudgmentCaseDesign(design: JudgmentCaseDesign): string {
  return [
    `[${design.title}] ${DESIGN_BANNER}`,
    ...design.notes.map(designNoteLabel),
    ...design.inputs.map(input => `입력: L${input.lane} ${input.key}↓${formatMs(input.downMs)} · ${input.upMs === null ? "계속 누름" : `${input.key}↑${formatMs(input.upMs)}`}`),
    ...design.windows.map(window => `창: ${window.note} ${window.label} ${formatMs(window.startMs)}～${formatMs(window.endMs)}ms [${DESIGN_TONE_LABELS[window.tone]}]`),
    ...design.annotations.map(annotation => `[${DESIGN_TONE_LABELS[annotation.tone]}] ${annotation.note ?? "전체"} @${formatMs(annotation.atMs)}ms: ${annotation.text}`),
    ...(design.summary ? [`설계 패널 요약: ${design.summary}`] : []),
    ...(design.memo ? [`메모: ${design.memo}`] : []),
  ].join("\n");
}
