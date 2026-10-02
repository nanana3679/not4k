/**
 * 판정 사례 텍스트 → 에디터 차트 모델.
 *
 * 대화에서 쓰는 짧은 ms 기반 문법을 `Chart`(노트 = NoteEntity, 키 입력 = tutorialInput)로 바꾼다.
 * 1ms = 1박이 되도록 BPM 60000 차트를 만들어 `beatToMs`가 적은 ms를 그대로 돌려준다.
 * 문법 오류만 예외로 막고, 겹침·역전 같은 의미 오류는 차트에 남겨 validateChart가 보고하게 한다.
 * 노트 토큰 끝의 `[이름]`은 차트에 넣지 않고 noteNames로 따로 돌려준다(차트 모델에 이름 필드가 없다).
 * 문법 요약은 docs/agents/judgment-case-images.md를 따른다.
 */

import type { Chart, ChartEvent, NoteEntity, PointNote, RangeNote, TrillZone, TutorialInputEvent } from "../../shared/types";
import type { Lane } from "../../shared/constants";
import { beat, type Beat } from "../../shared/types/beat";

/** 사례 차트의 BPM — 1박 = 60000 / BPM = 1ms */
export const JUDGMENT_CASE_BPM = 60000;
/** 사례 차트의 마디 길이(박) — 1마디 = 1000ms라 에디터 격자가 초 단위로 보인다 */
export const JUDGMENT_CASE_BEATS_PER_MEASURE = 1000;
/** 떼지 않은 입력(`A 1000-`)의 endBeat를 사례 마지막 시각 뒤로 미는 거리(ms) */
const UNRELEASED_TAIL_MS = 1000;

export interface ParsedJudgmentCase {
  title: string;
  memo: string;
  chart: Chart;
  /** chart.notes와 같은 순서의 직접 붙인 이름(`long 1500-1560 [가운데]`). 없으면 undefined */
  noteNames: (string | undefined)[];
  /** 떼지 않은 입력(`A 1000-`)의 chart.events 인덱스. 러너는 이 입력의 up을 보내지 않는다. */
  unreleasedInputEventIndices: number[];
}

export class JudgmentCaseSyntaxError extends Error {
  constructor(readonly line: number, detail: string) {
    super(`${line}행: ${detail}`);
    this.name = "JudgmentCaseSyntaxError";
  }
}

type Section = "title" | "notes" | "inputs" | "memo";

const SECTION_NAMES: Record<string, Section> = {
  "제목": "title",
  title: "title",
  "노트": "notes",
  notes: "notes",
  "입력": "inputs",
  inputs: "inputs",
  "메모": "memo",
  memo: "memo",
};

const POINT_KINDS: Record<string, PointNote["type"]> = {
  head: "single",
  single: "single",
  dhead: "double",
  double: "double",
  trill: "trill",
};

const RANGE_KINDS: Record<string, { type: RangeNote["type"]; holdOnly?: true }> = {
  long: { type: "long" },
  dlong: { type: "doubleLong" },
  doublelong: { type: "doubleLong" },
  tlong: { type: "trillLong" },
  trilllong: { type: "trillLong" },
  holdonly: { type: "long", holdOnly: true },
  dholdonly: { type: "doubleLong", holdOnly: true },
};

const ZONE_KINDS = new Set(["zone", "trillzone"]);

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const TIME_SPEC = new RegExp(`^(${NUMBER})(?:-(${NUMBER})?)?$`);
const LANE_PREFIX = /^L(\d+)\s*:\s*/i;
/** 노트 토큰 끝의 `[이름]` */
const NAME_SUFFIX = /\s*\[([^[\]]*)\]$/;
/** 자동 이름(N1, N2, …)과 헷갈리지 않도록 직접 붙일 수 없는 이름 */
const RESERVED_NAME = /^N\d+$/i;

interface Token { text: string; line: number }
interface TimeSpec { start: string; end?: string; open: boolean; range: boolean }

/** "1000.5" 같은 ms 문자열을 BPM 60000 차트의 Beat로 바꾼다(부동소수점 없이). */
function msToBeat(ms: string): Beat {
  const [whole, fraction = ""] = ms.split(".");
  const denominator = 10 ** fraction.length;
  return beat(Number(whole) * denominator + Number(fraction || "0"), denominator);
}

function beatMs(value: Beat): number {
  return value.n / value.d;
}

function splitTokens(lines: readonly { text: string; line: number }[]): Token[] {
  return lines.flatMap(({ text, line }) => text.split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, line })));
}

/** 시간 구간의 `1000 - 1200`을 `1000-1200`으로 붙인다. 노트 이름은 떼어 낸 뒤에 부른다. */
function joinTimeRanges(text: string): string {
  return text.replace(/\s*-\s*/g, "-");
}

/** `text`(토큰에서 이름을 뗀 나머지)의 레인 접두사를 읽는다. 오류 문구에는 원래 토큰을 쓴다. */
function takeLane(token: Token, text: string = joinTimeRanges(token.text)): { lane: number; rest: string } {
  const match = text.match(LANE_PREFIX);
  if (!match) return { lane: 1, rest: text };
  const lane = Number(match[1]);
  if (lane < 1) throw new JudgmentCaseSyntaxError(token.line, `"${token.text}": 레인은 1 이상이어야 합니다`);
  return { lane, rest: text.slice(match[0].length) };
}

/** 노트 토큰 끝의 `[이름]`을 떼어 낸다. 이름 안의 공백·하이픈은 그대로 둔다. */
function takeName(token: Token): { text: string; name?: string } {
  const match = token.text.match(NAME_SUFFIX);
  const text = match ? token.text.slice(0, match.index).trim() : token.text;
  if (/[[\]]/.test(text)) {
    throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": 이름은 토큰 끝에 [이름]으로 붙입니다 (예: long 1500-1560 [가운데])`);
  }
  if (!match) return { text };
  const name = match[1].trim();
  if (name === "") throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": 이름이 비어 있습니다`);
  if (RESERVED_NAME.test(name)) {
    throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": [${name}]는 자동 이름(N1, N2, …) 형식이라 쓸 수 없습니다`);
  }
  return { text, name };
}

function parseTime(token: Token, raw: string): TimeSpec {
  const match = raw.match(TIME_SPEC);
  if (!match) throw new JudgmentCaseSyntaxError(token.line, `"${token.text}": 시간 "${raw}"을 읽을 수 없습니다 (예: 1000, 1000-1500, 1000-)`);
  const range = raw.includes("-");
  return { start: match[1], end: match[2], open: range && match[2] === undefined, range };
}

interface NoteParseState { notes: NoteEntity[]; zones: TrillZone[]; names: (string | undefined)[] }

function parseNoteToken(token: Token, state: NoteParseState): void {
  const { text, name } = takeName(token);
  if (name !== undefined && state.names.includes(name)) {
    throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": 같은 이름 [${name}]를 두 노트에 쓸 수 없습니다`);
  }
  const { lane, rest } = takeLane(token, joinTimeRanges(text));
  const words = rest.split(/\s+/);
  const timeWord = words.pop();
  const kindWord = words.pop()?.toLowerCase();
  const modifiers = words.map((word) => word.toLowerCase());
  if (!timeWord || !kindWord) throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": "종류 시간" 형식이어야 합니다 (예: head 1000, long 1000-1500)`);
  const time = parseTime(token, timeWord);

  if (ZONE_KINDS.has(kindWord)) {
    if (name !== undefined) throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": zone에는 이름을 붙일 수 없습니다`);
    if (modifiers.length > 0 || !time.range || time.end === undefined) {
      throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": zone은 "zone 시작-끝" 형식입니다`);
    }
    state.zones.push({ lane: lane as Lane, beat: msToBeat(time.start), endBeat: msToBeat(time.end) });
    return;
  }

  const pointType = POINT_KINDS[kindWord];
  if (pointType) {
    if (time.range) throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": ${kindWord}는 한 시각만 받습니다 (예: ${kindWord} 1000)`);
    const unknown = modifiers.find((modifier) => modifier !== "grace");
    if (unknown) throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": 포인트 노트에 쓸 수 없는 수식어 "${unknown}" (grace만 가능)`);
    const note: PointNote = { type: pointType, lane, beat: msToBeat(time.start) };
    if (modifiers.includes("grace")) note.grace = true;
    state.notes.push(note);
    state.names.push(name);
    return;
  }

  const range = RANGE_KINDS[kindWord];
  if (range) {
    if (!time.range || time.end === undefined) {
      throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": ${kindWord}는 "시작-끝" 구간을 받습니다 (예: ${kindWord} 1000-1500)`);
    }
    const unknown = modifiers.find((modifier) => modifier !== "holdonly");
    if (unknown) throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": 구간 노트에 쓸 수 없는 수식어 "${unknown}" (holdOnly만 가능)`);
    const note: RangeNote = { type: range.type, lane, beat: msToBeat(time.start), endBeat: msToBeat(time.end) };
    if (range.holdOnly || modifiers.includes("holdonly")) note.holdOnly = true;
    state.notes.push(note);
    state.names.push(name);
    return;
  }

  throw new JudgmentCaseSyntaxError(token.line, `노트 "${token.text}": 알 수 없는 노트 종류 "${kindWord}" (head·dhead·trill·long·dlong·tlong·holdOnly·dholdOnly·zone)`);
}

interface ParsedInput { event: TutorialInputEvent; open: boolean }

function parseInputToken(token: Token): ParsedInput {
  const { lane, rest } = takeLane(token);
  const words = rest.split(/\s+/);
  if (words.length !== 2) throw new JudgmentCaseSyntaxError(token.line, `입력 "${token.text}": "키 누름-뗌" 형식이어야 합니다 (예: A 1000-1430, A 1000-)`);
  const [key, timeWord] = words;
  const time = parseTime(token, timeWord);
  if (!time.range) throw new JudgmentCaseSyntaxError(token.line, `입력 "${token.text}": 누름과 뗌을 "-"로 잇습니다 (예: ${key} ${time.start}-1500, 떼지 않으면 ${key} ${time.start}-)`);
  if (lane > 4) throw new JudgmentCaseSyntaxError(token.line, `입력 "${token.text}": tutorialInput 레인은 1~4입니다`);
  const start = msToBeat(time.start);
  return {
    event: { type: "tutorialInput", lane: lane as Lane, keyCode: key, keyLabel: key, beat: start, endBeat: time.end === undefined ? start : msToBeat(time.end) },
    open: time.open,
  };
}

/** trill 노트가 있는데 zone이 없는 레인에 trill 노트 범위를 덮는 trillZone을 만든다. */
function autoTrillZones(notes: readonly NoteEntity[], explicit: readonly TrillZone[]): TrillZone[] {
  const lanesWithZone = new Set(explicit.map((zone) => zone.lane));
  const extents = new Map<number, { start: Beat; end: Beat }>();
  for (const note of notes) {
    if (note.type !== "trill" && note.type !== "trillLong") continue;
    if (lanesWithZone.has(note.lane as Lane)) continue;
    const end = "endBeat" in note ? note.endBeat : note.beat;
    const current = extents.get(note.lane);
    extents.set(note.lane, {
      start: current && beatMs(current.start) <= beatMs(note.beat) ? current.start : note.beat,
      end: current && beatMs(current.end) >= beatMs(end) ? current.end : end,
    });
  }
  return [...extents].sort((a, b) => a[0] - b[0]).map(([lane, { start, end }]) => ({ lane: lane as Lane, beat: start, endBeat: end }));
}

function caseChart(title: string, notes: NoteEntity[], trillZones: TrillZone[], inputEvents: TutorialInputEvent[]): Chart {
  const timingEvents: ChartEvent[] = [
    { type: "bpm", beat: beat(0), bpm: JUDGMENT_CASE_BPM },
    { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(JUDGMENT_CASE_BEATS_PER_MEASURE) },
  ];
  return {
    meta: {
      title,
      artist: "judgment-case",
      difficultyLabel: "CASE",
      difficultyLevel: 0,
      imageFile: "",
      audioFile: "",
      previewAudioFile: "",
      offsetMs: 0,
    },
    notes,
    trillZones,
    restZones: [],
    events: [...timingEvents, ...inputEvents],
  };
}

export function parseJudgmentCase(text: string): ParsedJudgmentCase {
  let title: string | undefined;
  const memoLines: string[] = [];
  const noteLines: { text: string; line: number }[] = [];
  const inputLines: { text: string; line: number }[] = [];
  let section: Section | undefined;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    const header = trimmed.match(/^([^\s:：]+)\s*[:：]\s*(.*)$/);
    const named = header ? SECTION_NAMES[header[1].toLowerCase()] : undefined;
    if (header && named) {
      section = named;
      const value = header[2].trim();
      if (named === "title") {
        if (title !== undefined) throw new JudgmentCaseSyntaxError(line, "제목: 줄이 두 번 나왔습니다");
        title = value;
      } else if (named === "memo") {
        memoLines.push(value);
      } else {
        (named === "notes" ? noteLines : inputLines).push({ text: value, line });
      }
      return;
    }
    if (section === "memo" && !trimmed.startsWith("#")) {
      memoLines.push(raw.trimEnd());
      return;
    }
    if (trimmed === "" || trimmed.startsWith("#")) return;
    throw new JudgmentCaseSyntaxError(line, `알 수 없는 줄 "${trimmed}" (제목:/노트:/입력:/메모: 로 시작해야 합니다)`);
  });

  const state: NoteParseState = { notes: [], zones: [], names: [] };
  for (const token of splitTokens(noteLines)) parseNoteToken(token, state);
  const inputs = splitTokens(inputLines).map(parseInputToken);

  const lastMs = Math.max(
    0,
    ...state.notes.flatMap((note) => ["endBeat" in note ? beatMs(note.endBeat) : beatMs(note.beat), beatMs(note.beat)]),
    ...inputs.flatMap(({ event }) => [beatMs(event.beat), beatMs(event.endBeat)]),
  );
  const unreleasedEnd = beat(Math.ceil(lastMs) + UNRELEASED_TAIL_MS);
  const inputEvents = inputs.map(({ event, open }) => (open ? { ...event, endBeat: unreleasedEnd } : event));

  const trillZones = [...state.zones, ...autoTrillZones(state.notes, state.zones)];
  const chart = caseChart(title ?? "", state.notes, trillZones, inputEvents);
  const firstInputIndex = chart.events.length - inputEvents.length;
  return {
    title: title ?? "",
    memo: trimBlankEdges(memoLines).join("\n"),
    chart,
    noteNames: state.names,
    unreleasedInputEventIndices: inputs.flatMap(({ open }, index) => (open ? [firstInputIndex + index] : [])),
  };
}

function trimBlankEdges(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}
