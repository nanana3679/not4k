/**
 * 판정 사례 → SVG 문자열 (순수 함수).
 *
 * 시간은 게임처럼 아래에서 위로 흐른다. 왼쪽부터 ms 축, 노트 레인(에디터 NoteRenderer 그리기 규칙),
 * 노트 이름표(N1… · 종류 · 구간), 키별 입력 막대, 확정 시각에 놓인 판정 라벨 열이 있고
 * 아래에 점수·미정산 항목·검증 오류·엔진 표시가 붙는다. 판정 라벨은 노트 이름으로 시작하고,
 * 시작·유지 실패에는 사례 데이터와 엔진 이벤트로 확인되는 이유만 둘째 줄에 단다.
 * 여러 패널(사례 × 엔진)을 넘기면 같은 시간 축으로 나란히 그린다.
 *
 * 시간 축은 구간별 선형이다: 기본은 pxPerMs 비율이지만 인접한 주요 시각(노트·입력·확정 시각) 사이는
 * 최소 MIN_GAP_PX를 보장해 20ms 바디나 10ms 차이 입력도 읽히게 한다. 축 눈금은 실제 ms를 표시한다.
 */

import { COLORS, LANE_WIDTH, NOTE_HEIGHT, NOTE_Z_ORDER } from "../../editor/timeline/constants";
import { editorBodyGradientStops, lightenEditorColor, toHexColor } from "../../editor/timeline/editorNoteColors";
import { JUDGMENT_WINDOWS } from "../../shared/constants";
import type { NoteEntity, PointNote, RangeNote } from "../../shared/types";
import { beatEq } from "../../shared/types/beat";
import { violationLabel, type ValidationErrorRule } from "../../shared/validation";
import type { JudgmentCase, JudgmentCaseAction, JudgmentCaseInput, JudgmentCaseNote } from "./chartCase";
import type { JudgmentCaseRun, JudgmentCaseRunEvent, JudgmentCaseScoreItem } from "./runJudgmentCase";

export interface JudgmentCasePanel {
  judgmentCase: JudgmentCase;
  run: JudgmentCaseRun;
  /** 엔진 출처 표시(워크트리 이름·브랜치·커밋 등) */
  engineLabel: string;
  /** 엔진을 불러온 저장소 경로 — 바닥글에만 표시 */
  enginePath?: string;
}

export interface RenderJudgmentCaseOptions {
  /**
   * 선형 구간의 px/ms. 주면 빈 구간을 줄이지 않는다(최소 간격만 보장).
   * 생략하면 긴 빈 구간을 줄이고 플롯 높이가 TARGET_PLOT_PX 안에 들도록 배율을 고른다.
   */
  pxPerMs?: number;
}

export interface RenderedJudgmentCase {
  svg: string;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// 치수·색
// ---------------------------------------------------------------------------

const FONT_FAMILY = "'Noto Sans CJK KR','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
const BACKGROUND = "#11121b";
const TEXT = "#e6e8f2";
const MUTED = "#9a9fb5";
const GUIDE = "rgba(255,255,255,0.38)";
/** 선 위에 놓인 글자를 읽히게 하는 배경색 테두리 */
const HALO = `paint-order="stroke" stroke="${BACKGROUND}" stroke-width="4" stroke-linejoin="round"`;

export const MIN_GAP_PX = 22;
const TARGET_PLOT_PX = 720;
const MIN_AUTO_PX_PER_MS = 0.02;
const MAX_AUTO_PX_PER_MS = 1.2;
/** 자동 축에서 빈 구간 하나가 차지하는 최대 높이(px) */
const MAX_GAP_PX = 220;
const PLOT_PAD_PX = 30;
const PANEL_PAD_X = 20;
const PANEL_GUTTER = 28;
const AXIS_W = 62;
const LANE_W = 80;
const LANE_SCALE = LANE_W / LANE_WIDTH;
const NOTE_W = LANE_W;
const NOTE_H = Math.round(NOTE_HEIGHT * LANE_SCALE);
const COLUMN_GAP = 14;
const KEY_BAR_W = 12;
const KEY_LABEL_FONT = 13;
const LABEL_FONT = 14;
const LABEL_H = 19;
/** 판정 라벨 둘째 줄(실패 이유) */
const REASON_FONT = 13;
const REASON_INDENT = 14;
const TICK_FONT = 12;
const JUDGE_LEADER_W = 22;
const MIN_JUDGE_W = 220;
/** 노트 이름표 열: 레인 오른쪽 가장자리 → 구간 괄호 → 리더선 → 이름표 */
const NOTE_SPAN_GAP = 7;
/** 레인이 여럿이면 레인마다 괄호 x를 이만큼 어긋나게 해 시간이 겹치는 바디의 괄호가 한 선으로 합쳐지지 않게 한다 */
const NOTE_SPAN_STAGGER = 7;
const NOTE_LEADER_W = 18;
const NOTE_LABEL_FONT = 13;
const NOTE_LABEL_H = 18;

const GRADE_TEXT: Record<string, string> = {
  perfect: "Perfect",
  great: "Great",
  good: "Good",
  goodTrill: "Good◇",
  bad: "Bad",
  miss: "Miss",
};

/** 게임 판정 색(game/renderer/constants JUDGMENT_*) — Good은 어두운 배경에서 읽히게 밝힘 */
const GRADE_COLOR: Record<string, string> = {
  perfect: "#ffdd00",
  great: "#44ff44",
  good: "#6ea8ff",
  goodTrill: "#6ea8ff",
  bad: "#888888",
  miss: "#ff5555",
};
const DEPENDENT_ZERO_COLOR = "#a3a8bd";

/** 키 열 색 — 노트 색(파랑·노랑·흰색)과 겹치지 않게 고른다 */
const KEY_COLORS = ["#ff9f43", "#36d1dc", "#c56cf0", "#ff6b9a", "#7bed9f", "#f6e58d"];

// ---------------------------------------------------------------------------
// 시간 축
// ---------------------------------------------------------------------------

export interface CaseTimeAxis {
  /** 시각 t의 축 위치(px, 첫 주요 시각 = 0, 시간이 늦을수록 큼) */
  offsetOf(t: number): number;
  /** 첫 주요 시각 ~ 마지막 주요 시각의 높이(px) */
  height: number;
  keyTimes: number[];
  /** maxGapPx로 줄인 빈 구간(축에 물결 표시) */
  compressed: { startMs: number; endMs: number }[];
}

export interface CaseTimeAxisOptions {
  /** 인접 주요 시각 사이 최소 높이(px) */
  minGapPx?: number;
  /** 인접 주요 시각 사이 최대 높이(px). 넘는 빈 구간은 이 높이로 줄인다 */
  maxGapPx?: number;
}

/** 주요 시각 사이를 pxPerMs로 늘리되 인접 간격을 [minGapPx, maxGapPx]로 제한하는 구간별 선형 축 */
export function createCaseTimeAxis(times: readonly number[], pxPerMs: number, options: CaseTimeAxisOptions = {}): CaseTimeAxis {
  const minGapPx = options.minGapPx ?? MIN_GAP_PX;
  const maxGapPx = options.maxGapPx ?? Infinity;
  const keyTimes = [...new Set(times.filter((time) => Number.isFinite(time)))].sort((a, b) => a - b);
  const offsets = [0];
  const compressed: CaseTimeAxis["compressed"] = [];
  for (let i = 1; i < keyTimes.length; i++) {
    const linear = (keyTimes[i] - keyTimes[i - 1]) * pxPerMs;
    if (linear > maxGapPx) compressed.push({ startMs: keyTimes[i - 1], endMs: keyTimes[i] });
    offsets.push(offsets[i - 1] + Math.min(Math.max(linear, minGapPx), Math.max(maxGapPx, minGapPx)));
  }
  const offsetOf = (t: number): number => {
    if (keyTimes.length === 0) return t * pxPerMs;
    const last = keyTimes.length - 1;
    if (t <= keyTimes[0]) return (t - keyTimes[0]) * pxPerMs;
    if (t >= keyTimes[last]) return offsets[last] + (t - keyTimes[last]) * pxPerMs;
    let i = 0;
    while (keyTimes[i + 1] < t) i++;
    const ratio = (t - keyTimes[i]) / (keyTimes[i + 1] - keyTimes[i]);
    return offsets[i] + ratio * (offsets[i + 1] - offsets[i]);
  };
  return { offsetOf, height: offsets[offsets.length - 1] ?? 0, keyTimes, compressed };
}

/**
 * 자동 축: 빈 구간을 MAX_GAP_PX로 줄이고, 전체 높이가 TARGET_PLOT_PX를 넘지 않는 가장 큰 px/ms(최대 1.2)를 고른다.
 * 노트가 많아 최소 간격만으로 목표를 넘으면 가장 작은 배율을 쓴다.
 */
export function createAutoCaseTimeAxis(times: readonly number[]): CaseTimeAxis {
  const build = (pxPerMs: number) => createCaseTimeAxis(times, pxPerMs, { maxGapPx: MAX_GAP_PX });
  if (build(MAX_AUTO_PX_PER_MS).height <= TARGET_PLOT_PX) return build(MAX_AUTO_PX_PER_MS);
  let low = MIN_AUTO_PX_PER_MS;
  let high = MAX_AUTO_PX_PER_MS;
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    if (build(middle).height <= TARGET_PLOT_PX) low = middle;
    else high = middle;
  }
  return build(low);
}

// ---------------------------------------------------------------------------
// 라벨 겹침 회피
// ---------------------------------------------------------------------------

/**
 * 1차원 라벨 위치를 겹치지 않게 벌린다. 겹치는 라벨 묶음은 원래 위치들의 평균을 중심으로
 * spacing 간격으로 쌓는다. 원래 순서(위치 오름차순, 같으면 입력 순서)는 유지하고 결과는 입력 순서로 돌려준다.
 *
 * sizes[i]는 라벨 i의 줄 수(기본 1)다. 위치는 첫 줄 기준이고 나머지 줄은 아래(작은 값 쪽)로 처지므로,
 * 바로 아래 라벨과는 sizes[i] × spacing만큼 떨어뜨린다.
 */
export function resolveLabelPositions(desired: readonly number[], spacing: number, sizes: readonly number[] = []): number[] {
  const size = (index: number) => sizes[index] ?? 1;
  const order = desired.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  /** rel[k] = 묶음 첫 라벨에서 k번째 라벨까지의 거리 */
  interface Cluster { members: number[]; rel: number[]; start: number }
  const clusters: Cluster[] = [];
  for (const { value, index } of order) {
    clusters.push({ members: [index], rel: [0], start: value });
    while (clusters.length >= 2) {
      const last = clusters[clusters.length - 1];
      const previous = clusters[clusters.length - 2];
      const previousTop = previous.start + previous.rel[previous.rel.length - 1];
      if (last.start >= previousTop + size(last.members[0]) * spacing) break;
      const members = [...previous.members, ...last.members];
      const rel = [0];
      for (let k = 1; k < members.length; k++) rel.push(rel[k - 1] + size(members[k]) * spacing);
      const start = members.reduce((sum, member, k) => sum + desired[member] - rel[k], 0) / members.length;
      clusters.splice(clusters.length - 2, 2, { members, rel, start });
    }
  }
  const result: number[] = new Array(desired.length);
  for (const cluster of clusters) cluster.members.forEach((member, k) => { result[member] = cluster.start + cluster.rel[k]; });
  return result;
}

// ---------------------------------------------------------------------------
// 텍스트
// ---------------------------------------------------------------------------

/**
 * Noto Sans CJK KR 실측 폭(em)에 맞춘 어림값. 겹침 방지가 목적이라 굵은 글꼴을 감안해 5% 넉넉히 잡는다.
 * 숫자 0.555, 공백 0.224, 한글 0.92, 화살표·±·◇ 1.0 (Chromium canvas measureText 기준).
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char >= "0" && char <= "9") em += 0.56;
    else if (char === " ") em += 0.23;
    else if ("il.,:;'|!()[]".includes(char)) em += 0.34;
    else if (char >= "a" && char <= "z") em += char === "m" || char === "w" ? 0.93 : 0.58;
    else if (char >= "A" && char <= "Z") em += char === "M" || char === "W" ? 0.88 : 0.7;
    else if (code < 0x80) em += 0.6;
    else if (code >= 0xac00 && code <= 0xd7a3) em += 0.93;
    else if ("·−–".includes(char)) em += 0.57;
    else em += 1;
  }
  return em * fontSize * 1.05;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** maxWidth를 넘지 않게 줄을 나눈다. 공백에서 먼저 끊고, 한 단어가 넘치면 글자 단위로 끊는다. */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (word === "") continue;
      const candidate = line + word;
      if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.trim() !== "") lines.push(line.trimEnd());
      line = word.trimStart();
      while (estimateTextWidth(line, fontSize) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && estimateTextWidth(line.slice(0, cut), fontSize) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function formatMs(ms: number): string {
  return Number.isInteger(ms) ? `${ms}` : `${Math.round(ms * 100) / 100}`;
}

function formatDelta(deltaMs: number): string {
  const value = formatMs(Math.abs(deltaMs));
  if (deltaMs > 0) return `+${value}`;
  if (deltaMs < 0) return `−${value}`;
  return "±0";
}

// ---------------------------------------------------------------------------
// 판정 라벨
// ---------------------------------------------------------------------------

export type LabelTone = "grade" | "key" | "note" | "muted" | "plain";

export interface LabelSegment {
  text: string;
  tone: LabelTone;
  /** tone=grade의 색 결정용(perfect·miss·dependentZero 등) */
  grade?: string;
  /** tone=key의 키 식별자 */
  key?: string;
  /** tone=note의 노트(chart.notes 인덱스) — 노트 색으로 칠한다 */
  noteIndex?: number;
}

export function labelText(segments: readonly LabelSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function isRange(note: NoteEntity): note is RangeNote {
  return "endBeat" in note;
}

function isDoubleNote(note: NoteEntity | undefined): boolean {
  return note?.type === "double" || note?.type === "doubleLong";
}

/** 판정 라벨에 쓰는 노트 이름: 직접 붙인 이름 또는 N1…, double은 유닛을 붙여 N2u1 */
export function noteDisplayName(judgmentCase: JudgmentCase, noteIndex: number, unitIndex?: number): string {
  const entry = judgmentCase.notes[noteIndex];
  if (!entry) return `#${noteIndex}`;
  const base = entry.name ?? entry.id;
  return isDoubleNote(entry.note) && unitIndex !== undefined ? `${base}u${unitIndex + 1}` : base;
}

function noteName(judgmentCase: JudgmentCase, noteIndex: number, unitIndex?: number): LabelSegment {
  return { text: noteDisplayName(judgmentCase, noteIndex, unitIndex), tone: "note", noteIndex };
}

/** 이름표의 종류어: head·double head·trill(포인트), 바디·double 바디·trill 바디, holdOnly 바디는 holdOnly·double holdOnly */
function noteTypeWord(note: NoteEntity): string {
  if (!isRange(note)) {
    const base = note.type === "single" ? "head" : note.type === "double" ? "double head" : "trill";
    return note.grace ? `grace ${base}` : base;
  }
  const prefix = note.type === "doubleLong" ? "double " : note.type === "trillLong" ? "trill " : "";
  return `${prefix}${note.holdOnly ? "holdOnly" : "바디"}`;
}

/** 레인 옆 이름표 `N2 바디 1500–1560`. 직접 붙인 이름은 자동 이름 뒤에(`N2 가운데 바디 …`), 레인이 여럿이면 레인도 넣는다. */
export function describeNote(entry: JudgmentCaseNote, options: { showLane?: boolean } = {}): LabelSegment[] {
  const range = entry.endMs === undefined ? formatMs(entry.startMs) : `${formatMs(entry.startMs)}–${formatMs(entry.endMs)}`;
  return [
    { text: entry.id, tone: "note", noteIndex: entry.index },
    ...(entry.name === undefined ? [] : [{ text: ` ${entry.name}`, tone: "note" as const, noteIndex: entry.index }]),
    ...(options.showLane ? [{ text: ` L${entry.note.lane}`, tone: "muted" as const }] : []),
    { text: ` ${noteTypeWord(entry.note)}`, tone: "plain" },
    { text: ` ${range}`, tone: "muted" },
  ];
}

function actionSegment(judgmentCase: JudgmentCase, action: JudgmentCaseAction): LabelSegment {
  const input = judgmentCase.inputs[action.inputIndex];
  return { text: `${input.label}${action.type === "down" ? "↓" : "↑"}${formatMs(action.atMs)}`, tone: "key", key: input.key };
}

function inputRefs(
  judgmentCase: JudgmentCase,
  at: number,
  key: string | undefined,
  prefer: "down" | "up" | undefined,
): LabelSegment[] {
  const sameTime = judgmentCase.actions.filter((action) => action.atMs === at);
  let picked: JudgmentCaseAction[] = key === undefined ? sameTime : sameTime.filter((action) => action.key === key);
  if (prefer && picked.some((action) => action.type === prefer)) picked = picked.filter((action) => action.type === prefer);
  if (picked.length === 0) return [{ text: `@${formatMs(at)}`, tone: "plain" }];
  return joinSegments(picked.map((action) => [actionSegment(judgmentCase, action)]), "·");
}

function joinSegments(groups: readonly LabelSegment[][], separator: string): LabelSegment[] {
  return groups.flatMap((group, index) => (index === 0 ? group : [{ text: separator, tone: "muted" as const }, ...group]));
}

function laneActionsAt(judgmentCase: JudgmentCase, lane: number, at: number): JudgmentCaseAction[] {
  return judgmentCase.actions.filter((action) => action.lane === lane && action.atMs === at);
}

/** 바디 시작 기한(S + Good)에 같은 레인 입력 없이 확정된 maintenanceMiss = 시작하지 못한 유닛 */
function isStartFailure(event: JudgmentCaseRunEvent, judgmentCase: JudgmentCase, goodWindowMs: number): boolean {
  const entry = judgmentCase.notes[event.noteIndex];
  return event.kind === "maintenanceMiss" && entry !== undefined && entry.endMs !== undefined &&
    event.confirmedAt === entry.startMs + goodWindowMs && laneActionsAt(judgmentCase, entry.note.lane, event.confirmedAt).length === 0;
}

/** 엔진 이벤트 하나를 `N3 head Great −70 ← D↓1490` 같은 라벨 조각으로 바꾼다. 실패 이유는 describeFailureReason. */
export function describeJudgmentEvent(
  event: JudgmentCaseRunEvent,
  judgmentCase: JudgmentCase,
  scoreItems: readonly JudgmentCaseScoreItem[] = [],
  goodWindowMs: number = JUDGMENT_WINDOWS.GOOD,
): LabelSegment[] {
  const at = formatMs(event.confirmedAt);
  const name: LabelSegment[] = [noteName(judgmentCase, event.noteIndex, event.unitIndex), { text: " ", tone: "plain" }];
  if (event.kind === "maintenanceMiss") {
    const what = isStartFailure(event, judgmentCase, goodWindowMs) ? "시작 실패" : "유지 실패";
    return [...name, { text: what, tone: "grade", grade: "miss" }, { text: ` ${at}`, tone: "plain" }];
  }
  if (event.kind === "dependentZero") {
    const item = scoreItems.find((candidate) => candidate.id === event.itemId);
    return [...name, { text: `${item?.kind ?? "item"} 0점 처리`, tone: "grade", grade: "dependentZero" }, { text: ` ${at}`, tone: "plain" }];
  }

  const segments: LabelSegment[] = [
    ...name,
    { text: `${event.kind} `, tone: "plain" },
    { text: GRADE_TEXT[event.grade] ?? event.grade, tone: "grade", grade: event.grade },
  ];
  if (event.inputAt === null) {
    segments.push({ text: ` ${at}`, tone: "plain" });
    if (event.grade === "miss") segments.push({ text: " (입력 없음)", tone: "muted" });
    else if (event.kind === "holdOnly") segments.push({ text: " (유지 완료)", tone: "muted" });
    return segments;
  }
  if (event.kind !== "holdOnly") segments.push({ text: ` ${formatDelta(event.deltaMs)}`, tone: "plain" });
  const prefer = event.kind === "head" ? "down" : event.kind === "release" ? "up" : undefined;
  segments.push({ text: " ← ", tone: "muted" }, ...inputRefs(judgmentCase, event.inputAt, event.key ?? undefined, prefer));
  if (event.confirmedAt !== event.inputAt) segments.push({ text: ` · 확정 ${at}`, tone: "muted" });
  return segments;
}

/**
 * 시작·유지 실패(maintenanceMiss)의 이유를 사례 데이터와 엔진 이벤트에서 확인되는 사실로만 만든다.
 * 확인할 수 없는 조각은 추측하지 않고 뺀다(전부 빠지면 빈 배열).
 *
 * - 시작 실패: 맞닿은 앞 바디를 쥐고 있던 키가 모두 이 바디의 끝−Good 전에 떼졌으면 `A↑1430 < 끝−Good 1440`,
 *   시작 창(S±Good)의 같은 레인 누름은 그 누름을 쓴 head 판정과 함께 `D↓1490 → N3 head`, 누름이 없으면 `새 입력 없음`.
 * - 바디 중간 유지 실패: 확정 시각의 같은 레인 뗌 `A↑1234`, 끝−Good 전이면 `(끝−Good 1380 전)`.
 */
export function describeFailureReason(
  event: JudgmentCaseRunEvent,
  judgmentCase: JudgmentCase,
  events: readonly JudgmentCaseRunEvent[],
  goodWindowMs: number = JUDGMENT_WINDOWS.GOOD,
): LabelSegment[] {
  if (event.kind !== "maintenanceMiss") return [];
  const entry = judgmentCase.notes[event.noteIndex];
  if (!entry || entry.endMs === undefined || entry.endMs <= entry.startMs) return [];
  const lane = entry.note.lane;
  const earlyEnd = entry.endMs - goodWindowMs;
  const earlyEndText = formatMs(earlyEnd);

  if (isStartFailure(event, judgmentCase, goodWindowMs)) {
    const clauses: LabelSegment[][] = [];
    const before = judgmentCase.notes.find((candidate) => candidate.index !== entry.index && candidate.note.lane === lane && candidate.endMs === entry.startMs);
    if (before) {
      // 앞 바디 시작(늦은 시작 포함 S + Good)까지 누르고 있던 키 = 앞 바디를 이어받아 쥐었을 수 있는 키
      const holders = judgmentCase.inputs.filter((input) => input.lane === lane &&
        input.downMs <= Math.min(before.endMs!, before.startMs + goodWindowMs) && (input.upMs === null || input.upMs >= before.startMs));
      if (holders.length > 0 && holders.every((input) => input.upMs !== null && input.upMs < earlyEnd)) {
        const ups = holders.slice().sort((a, b) => a.upMs! - b.upMs!).map((input): LabelSegment[] => [
          { text: `${input.label}↑${formatMs(input.upMs!)}`, tone: "key", key: input.key },
        ]);
        clauses.push([...joinSegments(ups, "·"), { text: ` < 끝−Good ${earlyEndText}`, tone: "muted" }]);
      }
    }
    const downs = judgmentCase.actions.filter((action) => action.type === "down" && action.lane === lane &&
      action.atMs >= entry.startMs - goodWindowMs && action.atMs <= entry.startMs + goodWindowMs);
    if (downs.length === 0) {
      clauses.push([{ text: "새 입력 없음", tone: "muted" }]);
    } else {
      const users = downs.map((down) => events.find((candidate) => candidate.kind === "head" && candidate.inputAt === down.atMs && candidate.key === down.key));
      if (users.every((user) => user !== undefined)) {
        clauses.push(joinSegments(downs.map((down, index) => [
          actionSegment(judgmentCase, down),
          { text: " → ", tone: "muted" },
          noteName(judgmentCase, users[index]!.noteIndex, users[index]!.unitIndex),
          { text: " head", tone: "plain" },
        ]), " · "));
      }
    }
    return joinSegments(clauses, " · ");
  }

  if (event.confirmedAt >= entry.endMs) return [];
  const ups = laneActionsAt(judgmentCase, lane, event.confirmedAt).filter((action) => action.type === "up");
  if (ups.length === 0) return [];
  return [
    ...joinSegments(ups.map((up) => [actionSegment(judgmentCase, up)]), "·"),
    ...(event.confirmedAt < earlyEnd ? [{ text: ` (끝−Good ${earlyEndText} 전)`, tone: "muted" as const }] : []),
  ];
}

// ---------------------------------------------------------------------------
// 패널 준비(측정)
// ---------------------------------------------------------------------------

interface KeyColumn {
  key: string;
  lane: number;
  label: string;
  color: string;
  inputs: { input: JudgmentCaseInput; index: number }[];
  labels: { text: string; offset: number; anchorOffset: number; anchorAtTop: boolean }[];
  width: number;
}

interface JudgeLabel {
  event: JudgmentCaseRunEvent;
  segments: LabelSegment[];
  /** 실패 이유 — 비어 있지 않으면 라벨 아래 둘째 줄에 그린다 */
  reason: LabelSegment[];
  anchorOffset: number;
  offset: number;
}

interface NoteLabel {
  entry: JudgmentCaseNote;
  segments: LabelSegment[];
  /** 포인트는 시각, 바디는 구간 가운데 */
  anchorOffset: number;
  offset: number;
}

interface PreparedPanel {
  panel: JudgmentCasePanel;
  lanes: number[];
  noteLabels: NoteLabel[];
  /** 레인 오른쪽 이름표 열 폭(뒤 여백 포함) */
  noteColumnWidth: number;
  noteColor: Map<number, string>;
  keyColumns: KeyColumn[];
  keyColor: Map<string, string>;
  judgeLabels: JudgeLabel[];
  judgeWidth: number;
  width: number;
  /** 라벨이 축 범위 밖으로 나간 정도(px) */
  overflowBelow: number;
  overflowAbove: number;
}

function caseTimes(panel: JudgmentCasePanel): number[] {
  const { judgmentCase, run } = panel;
  return [
    ...judgmentCase.notes.flatMap((note) => (note.endMs === undefined ? [note.startMs] : [note.startMs, note.endMs])),
    ...judgmentCase.trillZones.flatMap((zone) => [zone.startMs, zone.endMs]),
    ...judgmentCase.inputs.flatMap((input) => (input.upMs === null ? [input.downMs] : [input.downMs, input.upMs])),
    ...run.events.flatMap((event) => (event.inputAt === null ? [event.confirmedAt] : [event.confirmedAt, event.inputAt])),
  ];
}

function preparePanel(panel: JudgmentCasePanel, axis: CaseTimeAxis): PreparedPanel {
  const { judgmentCase, run } = panel;
  const lanes = [...new Set([
    ...judgmentCase.notes.map((note) => note.note.lane),
    ...judgmentCase.inputs.map((input) => input.lane),
    ...judgmentCase.trillZones.map((zone) => zone.lane),
  ])].sort((a, b) => a - b);
  if (lanes.length === 0) lanes.push(1);
  const multiLane = lanes.length > 1;

  const columns: KeyColumn[] = [];
  judgmentCase.inputs.forEach((input, index) => {
    let column = columns.find((candidate) => candidate.key === input.key && candidate.lane === input.lane);
    if (!column) {
      column = {
        key: input.key,
        lane: input.lane,
        label: multiLane ? `L${input.lane}·${input.label}` : input.label,
        color: KEY_COLORS[columns.length % KEY_COLORS.length],
        inputs: [],
        labels: [],
        width: 0,
      };
      columns.push(column);
    }
    column.inputs.push({ input, index });
  });
  const keyColor = new Map<string, string>();
  for (const column of columns) if (!keyColor.has(column.key)) keyColor.set(column.key, column.color);

  for (const column of columns) {
    const raw = column.inputs.flatMap(({ input }) => {
      const down = { text: `${input.label}↓${formatMs(input.downMs)}${input.upMs === null ? " (계속)" : ""}`, anchorOffset: axis.offsetOf(input.downMs), anchorAtTop: false };
      return input.upMs === null ? [down] : [down, { text: `${input.label}↑${formatMs(input.upMs)}`, anchorOffset: axis.offsetOf(input.upMs), anchorAtTop: true }];
    });
    const offsets = resolveLabelPositions(raw.map((label) => label.anchorOffset), LABEL_H - 2);
    column.labels = raw.map((label, index) => ({ ...label, offset: offsets[index] }));
    const textWidth = Math.max(estimateTextWidth(column.label, KEY_LABEL_FONT + 2), ...column.labels.map((label) => estimateTextWidth(label.text, KEY_LABEL_FONT)));
    column.width = 6 + KEY_BAR_W + 8 + textWidth + 8;
  }

  const noteEntries = judgmentCase.notes.filter((entry) => lanes.includes(entry.note.lane));
  const noteAnchors = noteEntries.map((entry) => (axis.offsetOf(entry.startMs) + axis.offsetOf(entry.endMs ?? entry.startMs)) / 2);
  const noteOffsets = resolveLabelPositions(noteAnchors, NOTE_LABEL_H);
  const noteLabels = noteEntries.map((entry, index): NoteLabel => ({
    entry,
    segments: describeNote(entry, { showLane: multiLane }),
    anchorOffset: noteAnchors[index],
    offset: noteOffsets[index],
  }));
  const noteColor = new Map(judgmentCase.notes.map((entry) => [entry.index, noteTextColor(entry.note)] as const));
  const noteColumnWidth = noteLabels.length === 0
    ? COLUMN_GAP
    : NOTE_SPAN_GAP + (lanes.length - 1) * NOTE_SPAN_STAGGER + NOTE_LEADER_W + Math.max(...noteLabels.map((label) => estimateTextWidth(labelText(label.segments), NOTE_LABEL_FONT))) + COLUMN_GAP;

  const events = run.events
    .map((event, order) => ({ event, order }))
    .sort((a, b) => a.event.confirmedAt - b.event.confirmedAt || a.order - b.order)
    .map(({ event }) => event);
  const anchors = events.map((event) => axis.offsetOf(event.confirmedAt));
  const reasons = events.map((event) => describeFailureReason(event, judgmentCase, run.events));
  const offsets = resolveLabelPositions(anchors, LABEL_H, reasons.map((reason) => (reason.length > 0 ? 2 : 1)));
  const judgeLabels = events.map((event, index): JudgeLabel => ({
    event,
    segments: describeJudgmentEvent(event, judgmentCase, run.scoreItems),
    reason: reasons[index],
    anchorOffset: anchors[index],
    offset: offsets[index],
  }));
  const judgeTextWidth = Math.max(0, ...judgeLabels.map((label) => Math.max(
    estimateTextWidth(labelText(label.segments), LABEL_FONT),
    label.reason.length > 0 ? REASON_INDENT + estimateTextWidth(labelText(label.reason), REASON_FONT) : 0,
  )));
  const judgeWidth = Math.max(MIN_JUDGE_W, JUDGE_LEADER_W + 6 + judgeTextWidth + 6);

  const keyWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const width = PANEL_PAD_X + AXIS_W + 10 + lanes.length * LANE_W + noteColumnWidth + keyWidth + (columns.length > 0 ? COLUMN_GAP : 0) + judgeWidth + PANEL_PAD_X;

  const allOffsets = [
    ...judgeLabels.map((label) => label.offset - (label.reason.length > 0 ? LABEL_H : 0)),
    ...judgeLabels.map((label) => label.offset),
    ...noteLabels.map((label) => label.offset),
    ...columns.flatMap((column) => column.labels.map((label) => label.offset)),
  ];
  const lowest = Math.min(0, ...allOffsets);
  const highest = Math.max(axis.height, ...allOffsets);
  return {
    panel, lanes, noteLabels, noteColumnWidth, noteColor, keyColumns: columns, keyColor, judgeLabels, judgeWidth, width,
    overflowBelow: -lowest + LABEL_H / 2,
    overflowAbove: highest - axis.height + LABEL_H / 2,
  };
}

// ---------------------------------------------------------------------------
// 머리글·바닥글 줄
// ---------------------------------------------------------------------------

interface TextLine {
  segments: { text: string; fill: string; weight?: number }[];
  size: number;
  height: number;
  attrs?: string;
  box?: string;
}

function plainLines(text: string, maxWidth: number, size: number, fill: string, height: number, weight?: number, attrs?: string, box?: string): TextLine[] {
  return wrapText(text, maxWidth, size).map((line) => ({ segments: [{ text: line, fill, weight }], size, height, attrs, box }));
}

function headerLines(prepared: PreparedPanel, innerWidth: number, compare: boolean): TextLine[] {
  const { judgmentCase, engineLabel } = prepared.panel;
  const lines = plainLines(judgmentCase.title || "(제목 없음)", innerWidth, 20, TEXT, 28, 700, 'data-case-title="true"');
  if (compare) lines.push(...plainLines(`엔진: ${engineLabel}`, innerWidth, 13, "#7fd8ff", 20, 600, 'data-engine-header="true"'));
  if (judgmentCase.memo) lines.push(...plainLines(judgmentCase.memo, innerWidth, 14, "#c9cce0", 21, undefined, 'data-case-memo="true"'));
  return lines;
}

function itemDescription(judgmentCase: JudgmentCase, item: JudgmentCaseScoreItem): string {
  return `${noteDisplayName(judgmentCase, item.noteIndex, item.unitIndex)} ${item.kind} @${formatMs(item.timeMs)} (${item.id})`;
}

function footerLines(prepared: PreparedPanel, innerWidth: number): TextLine[] {
  const { run, engineLabel, enginePath, judgmentCase } = prepared.panel;
  const lines: TextLine[] = [];
  const counts: TextLine["segments"] = [];
  const grades: [keyof JudgmentCaseRun["counts"], string][] = [["perfect", "Perfect"], ["great", "Great"], ["good", "Good"], ["goodTrill", "Good◇"], ["miss", "Miss"]];
  for (const [grade, name] of grades) {
    if (grade === "goodTrill" && run.counts.goodTrill === 0) continue;
    if (counts.length > 0) counts.push({ text: "  ", fill: MUTED });
    counts.push({ text: `${name} ${run.counts[grade]}`, fill: GRADE_COLOR[grade], weight: 700 });
  }
  lines.push({ segments: counts, size: 15, height: 22, attrs: 'data-footer="counts"' });
  lines.push({
    segments: [
      { text: `달성률 ${run.achievementRate.toFixed(2)}%`, fill: TEXT, weight: 700 },
      { text: "  ·  ", fill: MUTED },
      { text: run.isFullCombo ? "Full Combo" : "Full Combo 아님", fill: run.isFullCombo ? "#7bed9f" : "#ff8a8a", weight: 700 },
      { text: "  ·  ", fill: MUTED },
      { text: `정산 ${run.processedNotes}/${run.totalNotes} 항목${run.finalized ? "" : " (finalize 전)"}`, fill: MUTED },
    ],
    size: 14,
    height: 22,
    attrs: 'data-footer="score"',
  });
  if (run.unsettledItems.length > 0) {
    lines.push(...plainLines(`미정산 score item ${run.unsettledItems.length}개`, innerWidth - 16, 14, "#ffd0d0", 22, 700, 'data-unsettled-count="true"', "#5a1d24"));
    for (const item of run.unsettledItems) {
      lines.push(...plainLines(`· ${itemDescription(judgmentCase, item)}`, innerWidth - 16, 13, "#ffd0d0", 19, undefined, `data-unsettled-item="${escapeXml(item.id)}"`, "#5a1d24"));
    }
  }
  if (run.error) {
    const where = run.error.atMs === null ? "" : ` @${formatMs(run.error.atMs)}ms`;
    lines.push(...plainLines(`엔진 예외${where}: ${run.error.message}`, innerWidth - 16, 13, "#ffd0d0", 19, 700, 'data-engine-error="true"', "#5a1d24"));
  }
  if (run.validationErrors.length > 0) {
    lines.push(...plainLines(`검증 오류 ${run.validationErrors.length}개`, innerWidth, 14, "#ffc069", 22, 700, 'data-validation-count="true"'));
    for (const error of run.validationErrors) {
      const label = violationLabel(error.rule as ValidationErrorRule) ?? error.rule;
      lines.push(...plainLines(`· ${label} (${error.rule}): ${error.message}`, innerWidth, 12, "#ffc069", 17, undefined, `data-validation-rule="${escapeXml(error.rule)}"`));
    }
  }
  lines.push(...plainLines("N1… = 노트 이름(적은 순서, head와 바디를 따로 셈) · 레인 옆 괄호 = 노트 하나의 구간 · 레인 가로선 = 노트 시작·끝 · 점선 = 입력 시각 · 판정 라벨 = 확정 시각(둘째 줄 = 실패 이유) · 축 물결 = 줄인 빈 구간", innerWidth, 11, MUTED, 17));
  lines.push(...plainLines(`엔진: ${engineLabel}${enginePath ? ` — ${enginePath}` : ""}`, innerWidth, 12, MUTED, 18, undefined, 'data-engine-footer="true"'));
  return lines;
}

function linesHeight(lines: readonly TextLine[]): number {
  return lines.reduce((sum, line) => sum + line.height, 0);
}

function drawLines(lines: readonly TextLine[], x: number, top: number, width: number): string {
  let y = top;
  const out: string[] = [];
  for (const line of lines) {
    if (line.box) out.push(`<rect x="${x - 8}" y="${y}" width="${width + 16}" height="${line.height}" fill="${line.box}"/>`);
    const spans = line.segments.map((segment) => `<tspan fill="${segment.fill}"${segment.weight ? ` font-weight="${segment.weight}"` : ""}>${escapeXml(segment.text)}</tspan>`).join("");
    out.push(`<text x="${x}" y="${y + line.height / 2}" font-size="${line.size}" dominant-baseline="central" xml:space="preserve"${line.attrs ? ` ${line.attrs}` : ""}>${spans}</text>`);
    y += line.height;
  }
  return out.join("");
}

// ---------------------------------------------------------------------------
// 노트 그리기 (에디터 NoteRenderer 규칙)
// ---------------------------------------------------------------------------

const POINT_COLOR: Record<PointNote["type"], number> = {
  single: COLORS.SINGLE_NOTE,
  double: COLORS.DOUBLE_NOTE,
  trill: COLORS.TRILL_NOTE,
};

const BODY_COLOR: Record<RangeNote["type"], number> = {
  long: COLORS.SINGLE_LONG,
  doubleLong: COLORS.DOUBLE_LONG,
  trillLong: COLORS.TRILL_LONG,
};

/** 이름표·판정 라벨의 노트 이름 색 — 에디터 노트 색을 어두운 배경에서 읽히게 조금 밝힌다 */
function noteTextColor(note: NoteEntity): string {
  return toHexColor(lightenEditorColor(isRange(note) ? BODY_COLOR[note.type] : POINT_COLOR[note.type], 0.25));
}

function gradientDefs(): string {
  const stops = (color: number, id: string) => {
    const { light, base } = editorBodyGradientStops(color);
    return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${light}"/><stop offset="0.5" stop-color="${base}"/><stop offset="1" stop-color="${light}"/></linearGradient>`;
  };
  return [
    stops(COLORS.SINGLE_LONG, "jc-long"),
    stops(COLORS.DOUBLE_LONG, "jc-doubleLong"),
    stops(COLORS.TRILL_LONG, "jc-trillLong"),
  ].join("");
}

function diamond(cx: number, cy: number, w: number, h: number): string {
  return `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;
}

function graceGlow(x: number, cy: number, w: number, h: number): string {
  const pad = COLORS.GRACE_GLOW_PAD * LANE_SCALE;
  const steps = 4;
  const out: string[] = [];
  for (let i = 0; i < steps; i++) {
    const stepPad = (pad * (i + 1)) / steps;
    out.push(`<rect x="${x - stepPad}" y="${cy - h / 2 - stepPad}" width="${w + stepPad * 2}" height="${h + stepPad * 2}" rx="${3 + stepPad * 0.3}" fill="#ffffff" fill-opacity="${COLORS.GRACE_GLOW_ALPHA / steps}"/>`);
  }
  return out.join("");
}

interface NoteLayers { bodies: string[]; ends: string[]; heads: string[]; points: string[] }

function hasMatchingHead(notes: readonly NoteEntity[], range: RangeNote): boolean {
  return notes.some((note) => !isRange(note) && note.lane === range.lane && beatEq(note.beat, range.beat));
}

/**
 * 노트 그림. 판정 결과와 무관하게 에디터에 보이는 모양 그대로 그린다(실패는 판정 라벨로만 보인다).
 * points(포인트 노트)는 노트 경계선 위에 그리도록 따로 돌려준다.
 */
function drawNotes(prepared: PreparedPanel, laneX: (lane: number) => number, yOf: (t: number) => number): { below: string; points: string } {
  const { judgmentCase } = prepared.panel;
  const notes = judgmentCase.chart.notes;
  const layers: NoteLayers = { bodies: [], ends: [], heads: [], points: [] };
  const h = NOTE_H;
  const order = judgmentCase.notes.slice().sort((a, b) => (NOTE_Z_ORDER[a.note.type] ?? 0) - (NOTE_Z_ORDER[b.note.type] ?? 0));

  for (const entry of order) {
    const { note } = entry;
    if (!prepared.lanes.includes(note.lane)) continue;
    const x = laneX(note.lane) + (LANE_W - NOTE_W) / 2;
    const cx = laneX(note.lane) + LANE_W / 2;
    const attrs = `data-note-index="${entry.index}" data-note-type="${note.type}"`;
    if (!isRange(note)) {
      const y = yOf(entry.startMs);
      const fill = toHexColor(POINT_COLOR[note.type]);
      const grace = note.grace === true;
      if (grace) layers.points.push(graceGlow(x, y, NOTE_W, h));
      const stroke = grace ? ` stroke="${toHexColor(COLORS.GRACE_OUTLINE)}" stroke-width="${COLORS.GRACE_OUTLINE_WIDTH}"` : "";
      layers.points.push(note.type === "trill"
        ? `<polygon ${attrs} points="${diamond(cx, y, NOTE_W, h)}" fill="${fill}"${stroke}/>`
        : `<rect ${attrs} x="${x}" y="${y - h / 2}" width="${NOTE_W}" height="${h}" fill="${fill}"${stroke}/>`);
      continue;
    }

    const startY = yOf(entry.startMs);
    const endY = yOf(entry.endMs ?? entry.startMs);
    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);
    const hasHead = hasMatchingHead(notes, note);
    const bodyTopY = topY + h / 2;
    const bodyBottomY = hasHead ? bottomY - h / 2 : bottomY;
    const bodyHeight = bodyBottomY - bodyTopY;
    const gradient = `url(#jc-${note.type})`;

    if (bodyHeight > 0) {
      const bodyRect = note.type === "trillLong"
        ? { y: bodyTopY - h / 2, height: bodyHeight + h / 2 + (hasHead ? h / 2 : 0) }
        : { y: bodyTopY, height: bodyHeight };
      layers.bodies.push(`<rect ${attrs} data-note-part="body" x="${x}" y="${bodyRect.y}" width="${NOTE_W}" height="${bodyRect.height}" fill="${gradient}"/>`);
    }

    const holdOnlyGlow = note.holdOnly === true && (note.type === "long" || note.type === "doubleLong");
    if (holdOnlyGlow) layers.ends.push(graceGlow(x, endY, NOTE_W, h));
    if (note.type === "trillLong") {
      layers.ends.push(`<polygon ${attrs} data-note-part="end" points="${diamond(cx, endY, NOTE_W, h)}" fill="${toHexColor(COLORS.TRILL_LONG_END)}"/>`);
    } else {
      const stroke = holdOnlyGlow ? ` stroke="${toHexColor(COLORS.GRACE_OUTLINE)}" stroke-width="${COLORS.GRACE_OUTLINE_WIDTH}"` : "";
      layers.ends.push(`<rect ${attrs} data-note-part="end" x="${x}" y="${endY - h / 2}" width="${NOTE_W}" height="${h}" fill="${gradient}" fill-opacity="0.5"${stroke}/>`);
    }

    if (!hasHead) {
      layers.heads.push(note.type === "trillLong"
        ? `<polygon ${attrs} data-note-part="start" points="${diamond(cx, startY, NOTE_W, h)}" fill="${gradient}"/>`
        : `<rect ${attrs} data-note-part="start" x="${x}" y="${startY - h / 2}" width="${NOTE_W}" height="${h}" fill="${gradient}"/>`);
    }
  }
  return { below: [...layers.bodies, ...layers.ends, ...layers.heads].join(""), points: layers.points.join("") };
}

/** 노트 시작·끝마다 레인을 가로지르는 경계선 — 맞닿은 바디도 서로 다른 노트로 보이게 한다 */
function drawNoteBoundaries(prepared: PreparedPanel, laneX: (lane: number) => number, yOf: (t: number) => number): string {
  const out: string[] = [];
  for (const lane of prepared.lanes) {
    const times = new Set(prepared.panel.judgmentCase.notes
      .filter((entry) => entry.note.lane === lane)
      .flatMap((entry) => (entry.endMs === undefined ? [entry.startMs] : [entry.startMs, entry.endMs])));
    for (const t of [...times].sort((a, b) => a - b)) {
      const y = yOf(t);
      out.push(`<line data-note-boundary-ms="${formatMs(t)}" x1="${laneX(lane)}" y1="${y}" x2="${laneX(lane) + LANE_W}" y2="${y}" stroke="${BACKGROUND}" stroke-width="2"/>`);
    }
  }
  return out.join("");
}

/**
 * 레인 오른쪽 이름표: 바디는 구간 괄호, 포인트는 짧은 눈금에서 리더선으로 이름표를 잇는다.
 * 레인이 여럿이면 오른쪽 레인일수록 괄호를 레인 가까이에 둔다.
 */
function drawNoteLabels(prepared: PreparedPanel, laneX1: number, yOf: (t: number) => number, yOfOffset: (offset: number) => number): string {
  const out: string[] = [];
  const { lanes } = prepared;
  const textX = laneX1 + NOTE_SPAN_GAP + (lanes.length - 1) * NOTE_SPAN_STAGGER + NOTE_LEADER_W;
  for (const label of prepared.noteLabels) {
    const { entry } = label;
    const spanX = laneX1 + NOTE_SPAN_GAP + (lanes.length - 1 - lanes.indexOf(entry.note.lane)) * NOTE_SPAN_STAGGER;
    const color = prepared.noteColor.get(entry.index) ?? TEXT;
    const anchorY = yOfOffset(label.anchorOffset);
    const y = yOfOffset(label.offset);
    if (entry.endMs !== undefined && entry.endMs !== entry.startMs) {
      // 맞닿은 바디의 괄호가 이어 보이지 않도록 양 끝을 2px씩 안으로 들인다.
      const bottom = Math.max(yOf(entry.startMs), yOf(entry.endMs)) - 2;
      const top = Math.min(yOf(entry.startMs), yOf(entry.endMs)) + 2;
      out.push(`<path data-note-span="${escapeXml(entry.id)}" d="M${spanX - 5} ${bottom} H${spanX} V${top} H${spanX - 5}" fill="none" stroke="${color}" stroke-width="1.5"/>`);
    } else {
      out.push(`<path data-note-tick="${escapeXml(entry.id)}" d="M${laneX1 + 1} ${anchorY} H${spanX}" fill="none" stroke="${color}" stroke-width="1.5"/>`);
    }
    out.push(`<polyline points="${spanX},${anchorY} ${spanX + 5},${anchorY} ${textX - 3},${y}" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.7"/>`);
    const spans = label.segments.map((segment) => `<tspan fill="${toneColor(segment, prepared)}"${segment.tone === "note" ? ' font-weight="700"' : ""}>${escapeXml(segment.text)}</tspan>`).join("");
    out.push(`<text x="${textX}" y="${y}" font-size="${NOTE_LABEL_FONT}" dominant-baseline="central" xml:space="preserve" ${HALO} data-note-label="${escapeXml(entry.id)}">${spans}</text>`);
  }
  return out.join("");
}

// ---------------------------------------------------------------------------
// 패널 그리기
// ---------------------------------------------------------------------------

interface SheetLayout {
  headerHeight: number;
  plotTop: number;
  plotBottom: number;
  /** 첫 주요 시각의 y */
  baseY: number;
  footerTop: number;
}

function toneColor(segment: LabelSegment, prepared: Pick<PreparedPanel, "keyColor" | "noteColor">): string {
  switch (segment.tone) {
    case "grade":
      return segment.grade === "dependentZero" ? DEPENDENT_ZERO_COLOR : GRADE_COLOR[segment.grade ?? ""] ?? TEXT;
    case "key":
      return prepared.keyColor.get(segment.key ?? "") ?? TEXT;
    case "note":
      return prepared.noteColor.get(segment.noteIndex ?? -1) ?? TEXT;
    case "muted":
      return MUTED;
    default:
      return TEXT;
  }
}

function drawPanel(prepared: PreparedPanel, index: number, axis: CaseTimeAxis, layout: SheetLayout, header: TextLine[], footer: TextLine[]): string {
  const { judgmentCase } = prepared.panel;
  const yOf = (t: number) => layout.baseY - axis.offsetOf(t);
  const yOfOffset = (offset: number) => layout.baseY - offset;
  const inner = prepared.width - PANEL_PAD_X * 2;
  const axisX = PANEL_PAD_X + AXIS_W;
  const laneX0 = axisX + 10;
  const laneX = (lane: number) => laneX0 + prepared.lanes.indexOf(lane) * LANE_W;
  const laneX1 = laneX0 + prepared.lanes.length * LANE_W;
  const keyX0 = laneX1 + prepared.noteColumnWidth;
  const keyX: number[] = [];
  let cursor = keyX0;
  for (const column of prepared.keyColumns) { keyX.push(cursor); cursor += column.width; }
  const keyX1 = cursor;
  const judgeX0 = prepared.keyColumns.length > 0 ? keyX1 + COLUMN_GAP : keyX0;
  const { plotTop, plotBottom } = layout;
  const out: string[] = [];

  out.push(drawLines(header, PANEL_PAD_X, 16, inner));

  // 열 머리글
  const headY = plotTop - 12;
  out.push(`<text x="${axisX - 6}" y="${headY}" font-size="12" fill="${MUTED}" text-anchor="end">ms</text>`);
  for (const lane of prepared.lanes) out.push(`<text x="${laneX(lane) + LANE_W / 2}" y="${headY}" font-size="13" fill="${MUTED}" text-anchor="middle" font-weight="700">L${lane}</text>`);
  if (prepared.noteLabels.length > 0) out.push(`<text x="${laneX1 + NOTE_SPAN_GAP}" y="${headY}" font-size="13" fill="${MUTED}" font-weight="700">노트</text>`);
  prepared.keyColumns.forEach((column, i) => {
    out.push(`<text x="${keyX[i] + 6}" y="${headY}" font-size="${KEY_LABEL_FONT + 2}" fill="${column.color}" font-weight="700" data-key-column="${escapeXml(column.label)}">${escapeXml(column.label)}</text>`);
  });
  out.push(`<text x="${judgeX0}" y="${headY}" font-size="13" fill="${MUTED}" font-weight="700">판정 (확정 시각)</text>`);

  // 배경: 레인·키 열
  prepared.lanes.forEach((lane, i) => {
    out.push(`<rect x="${laneX(lane)}" y="${plotTop}" width="${LANE_W}" height="${plotBottom - plotTop}" fill="${toHexColor(i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD)}"/>`);
  });
  prepared.keyColumns.forEach((column, i) => {
    out.push(`<rect x="${keyX[i]}" y="${plotTop}" width="${column.width - 4}" height="${plotBottom - plotTop}" fill="rgba(255,255,255,0.03)"/>`);
  });
  for (const zone of judgmentCase.trillZones) {
    if (!prepared.lanes.includes(zone.lane)) continue;
    const top = yOf(Math.max(zone.startMs, zone.endMs));
    const bottom = yOf(Math.min(zone.startMs, zone.endMs));
    out.push(`<rect data-trill-zone="${zone.lane}" x="${laneX(zone.lane)}" y="${top}" width="${LANE_W}" height="${bottom - top}" fill="${toHexColor(COLORS.TRILL_ZONE)}" fill-opacity="${COLORS.TRILL_ZONE_ALPHA}"/>`);
  }

  // ms 축: 노트 시작·끝과 입력 시각에 눈금
  out.push(`<line x1="${axisX}" y1="${plotTop}" x2="${axisX}" y2="${plotBottom}" stroke="${MUTED}" stroke-width="1"/>`);
  const noteTimes = new Set(judgmentCase.notes.flatMap((note) => (note.endMs === undefined ? [note.startMs] : [note.startMs, note.endMs])));
  const inputTimes = new Set(judgmentCase.inputs.flatMap((input) => (input.upMs === null ? [input.downMs] : [input.downMs, input.upMs])));
  for (const t of [...new Set([...noteTimes, ...inputTimes])].sort((a, b) => a - b)) {
    const y = yOf(t);
    const isNote = noteTimes.has(t);
    const fill = isNote && inputTimes.has(t) ? "#ffffff" : isNote ? "#cfd3e6" : "#ffc58a";
    out.push(`<line x1="${axisX - 5}" y1="${y}" x2="${axisX}" y2="${y}" stroke="${fill}" stroke-width="1"/>`);
    out.push(`<text data-tick-ms="${formatMs(t)}" x="${axisX - 8}" y="${y}" font-size="${TICK_FONT}" fill="${fill}" text-anchor="end" dominant-baseline="central" ${HALO}${isNote ? ' font-weight="700"' : ""}>${formatMs(t)}</text>`);
  }

  // 줄인 빈 구간: 축 위에 물결 표시
  for (const gap of axis.compressed) {
    const y = (yOf(gap.startMs) + yOf(gap.endMs)) / 2;
    out.push(`<rect x="${axisX - 7}" y="${y - 5}" width="14" height="10" fill="${BACKGROUND}"/>`);
    for (const dy of [-3, 3]) out.push(`<path data-axis-break="${formatMs(gap.startMs)}-${formatMs(gap.endMs)}" d="M${axisX - 8} ${y + dy + 2} q4 -5 8 0 t8 0" fill="none" stroke="${MUTED}" stroke-width="1.2"/>`);
  }

  // 입력 시각 점선 가이드(노트 레인~키 열)
  const guideRight = prepared.keyColumns.length > 0 ? keyX1 - 4 : laneX1;
  for (const t of [...inputTimes].sort((a, b) => a - b)) {
    const y = yOf(t);
    out.push(`<line data-input-guide-ms="${formatMs(t)}" x1="${axisX}" y1="${y}" x2="${guideRight}" y2="${y}" stroke="${GUIDE}" stroke-width="1" stroke-dasharray="4 3"/>`);
  }

  const notes = drawNotes(prepared, laneX, yOf);
  out.push(notes.below, drawNoteBoundaries(prepared, laneX, yOf), notes.points);
  out.push(drawNoteLabels(prepared, laneX1, yOf, yOfOffset));

  // 키 입력 막대와 ↓/↑ 라벨
  prepared.keyColumns.forEach((column, i) => {
    const barX = keyX[i] + 6;
    for (const { input } of column.inputs) {
      const bottom = yOf(input.downMs);
      const top = input.upMs === null ? plotTop + 6 : yOf(input.upMs);
      const attrs = `data-key="${escapeXml(input.key)}" data-input-down="${formatMs(input.downMs)}" data-input-up="${input.upMs === null ? "held" : formatMs(input.upMs)}"`;
      out.push(`<rect ${attrs} x="${barX}" y="${Math.min(top, bottom)}" width="${KEY_BAR_W}" height="${Math.max(2, Math.abs(bottom - top))}" rx="3" fill="${column.color}" fill-opacity="0.85"/>`);
      if (input.upMs === null) out.push(`<polygon points="${barX - 3},${top + 6} ${barX + KEY_BAR_W / 2},${top - 4} ${barX + KEY_BAR_W + 3},${top + 6}" fill="${column.color}"/>`);
    }
    const textX = barX + KEY_BAR_W + 8;
    for (const label of column.labels) {
      const anchorY = yOfOffset(label.anchorOffset);
      const y = yOfOffset(label.offset);
      if (Math.abs(anchorY - y) > 1) out.push(`<line x1="${barX + KEY_BAR_W}" y1="${anchorY}" x2="${textX - 2}" y2="${y}" stroke="${column.color}" stroke-width="1" stroke-opacity="0.7"/>`);
      out.push(`<text x="${textX}" y="${y}" font-size="${KEY_LABEL_FONT}" fill="${column.color}" dominant-baseline="central" ${HALO} data-key-label="${escapeXml(label.text)}">${escapeXml(label.text)}</text>`);
    }
  });

  // 판정 라벨: 확정 시각 앵커 + 겹침 회피 리더선
  for (const label of prepared.judgeLabels) {
    const anchorY = yOfOffset(label.anchorOffset);
    const y = yOfOffset(label.offset);
    const color = toneColor(label.segments.find((segment) => segment.tone === "grade") ?? { text: "", tone: "plain" }, prepared);
    out.push(`<circle cx="${judgeX0 + 3}" cy="${anchorY}" r="3.5" fill="${color}"/>`);
    out.push(`<polyline points="${judgeX0 + 3},${anchorY} ${judgeX0 + 10},${anchorY} ${judgeX0 + JUDGE_LEADER_W - 2},${y}" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.7"/>`);
    const tspans = (segments: readonly LabelSegment[]) => segments.map((segment) => `<tspan fill="${toneColor(segment, prepared)}"${segment.tone === "grade" || segment.tone === "note" ? ' font-weight="700"' : ""}>${escapeXml(segment.text)}</tspan>`).join("");
    out.push(`<text x="${judgeX0 + JUDGE_LEADER_W + 2}" y="${y}" font-size="${LABEL_FONT}" dominant-baseline="central" xml:space="preserve" data-judgment-kind="${escapeXml(label.event.kind)}" data-judgment-grade="${escapeXml(label.event.grade)}">${tspans(label.segments)}</text>`);
    if (label.reason.length > 0) {
      out.push(`<text x="${judgeX0 + JUDGE_LEADER_W + 2 + REASON_INDENT}" y="${y + LABEL_H}" font-size="${REASON_FONT}" dominant-baseline="central" xml:space="preserve" data-judgment-reason="true">${tspans(label.reason)}</text>`);
    }
  }

  out.push(drawLines(footer, PANEL_PAD_X, layout.footerTop, inner));
  return `<g data-panel="${index}">${out.join("")}</g>`;
}

// ---------------------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------------------

export function renderJudgmentCaseSvg(panels: readonly JudgmentCasePanel[], options: RenderJudgmentCaseOptions = {}): RenderedJudgmentCase {
  if (panels.length === 0) throw new Error("renderJudgmentCaseSvg: 패널이 없습니다");
  // 같은 사례(엔진 비교)는 한 시간 축을 공유하고, 다른 사례는 각자 축을 쓴다.
  const cases = [...new Set(panels.map((panel) => panel.judgmentCase))];
  const axes = new Map(cases.map((judgmentCase) => {
    const times = panels.filter((panel) => panel.judgmentCase === judgmentCase).flatMap(caseTimes);
    return [judgmentCase, options.pxPerMs === undefined ? createAutoCaseTimeAxis(times) : createCaseTimeAxis(times, options.pxPerMs)] as const;
  }));
  const prepared = panels.map((panel) => preparePanel(panel, axes.get(panel.judgmentCase)!));
  const compare = panels.length > 1;

  const headers = prepared.map((panel) => headerLines(panel, panel.width - PANEL_PAD_X * 2, compare));
  const footers = prepared.map((panel) => footerLines(panel, panel.width - PANEL_PAD_X * 2));
  const headerHeight = 16 + Math.max(...headers.map(linesHeight)) + 12;
  const plotTop = headerHeight + 26;
  const pads = new Map(cases.map((judgmentCase) => {
    const group = prepared.filter((panel) => panel.panel.judgmentCase === judgmentCase);
    return [judgmentCase, {
      above: Math.max(PLOT_PAD_PX, ...group.map((panel) => panel.overflowAbove + 6)),
      below: Math.max(PLOT_PAD_PX, ...group.map((panel) => panel.overflowBelow + 6)),
    }] as const;
  }));
  // 축 높이가 다른 사례끼리는 바닥(가장 이른 시각)을 맞추고 위쪽을 비운다.
  const plotHeight = Math.max(...cases.map((judgmentCase) => pads.get(judgmentCase)!.above + axes.get(judgmentCase)!.height + pads.get(judgmentCase)!.below));
  const plotBottom = plotTop + plotHeight;
  const footerTop = plotBottom + 16;
  const height = Math.ceil(footerTop + Math.max(...footers.map(linesHeight)) + 16);
  const layoutFor = (judgmentCase: JudgmentCase): SheetLayout => ({
    headerHeight, plotTop, plotBottom, footerTop, baseY: plotBottom - pads.get(judgmentCase)!.below,
  });

  const groups: string[] = [];
  let x = 0;
  prepared.forEach((panel, index) => {
    if (index > 0) {
      groups.push(`<line x1="${x - PANEL_GUTTER / 2}" y1="12" x2="${x - PANEL_GUTTER / 2}" y2="${height - 12}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`);
    }
    const { judgmentCase } = panel.panel;
    groups.push(`<g transform="translate(${x},0)">${drawPanel(panel, index, axes.get(judgmentCase)!, layoutFor(judgmentCase), headers[index], footers[index])}</g>`);
    x += panel.width + PANEL_GUTTER;
  });
  const width = Math.ceil(x - PANEL_GUTTER);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT_FAMILY}" data-judgment-case-sheet="${panels.length}">`,
    `<defs>${gradientDefs()}</defs>`,
    `<rect width="${width}" height="${height}" fill="${BACKGROUND}"/>`,
    ...groups,
    "</svg>",
  ].join("");
  return { svg, width, height };
}
