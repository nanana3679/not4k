/**
 * 구형 차트 1차 기계 변환 — RFD 0037 §8-1.
 *
 * 구형 Point·롱노트(`single`·`double`·`trill`·`long`·`doubleLong`·`trillLong`)를 탭·바디·릴리즈·틱 노트로 옮긴다.
 * 사용자가 정한 규칙(2026-10-27～2026-10-28)만 적용하고, 그 규칙이나 기존 명시 검증 규칙 때문에 옮기지 못한
 * 구형 점수 항목의 위치는 보고(`report.items`)로 돌려 사람이 고치게 한다.
 *
 * - "롱노트"는 같은 레인에서 이어진 구형 범위 전체(사슬)다. 릴리즈는 사슬의 마지막 끝에만 두고,
 *   head가 있는 같은 hold 수 연결은 탭 노트만 남긴다.
 * - 사슬 중간의 holdOnly 끝(head 없는 같은 hold 수 연결)은 두 바디를 하나로 합치고 옛 경계에 틱 노트를 둔다.
 * - 사슬 끝의 holdOnly는 릴리즈 없는 바디다(잃는 항목은 보고 대신 `counts.terminalHoldOnlyItemsDropped`로 센다).
 *   그 밖의 사슬 끝에는 hold 수만큼의 일반 릴리즈를 둔다.
 *   트릴 바디의 사슬 끝에는 메인·보조 레인 모두 릴리즈를 두지 않는다(보조 레인은 사용자 결정, 2026-10-28).
 * - 증가·감소(1→2·2→1) 연결은 두 바디만 옮기고 경계에 아무것도 두지 않으며 모두 보고한다.
 * - 길이 0 일반 롱노트는 단독 릴리즈, 길이 0 holdOnly는 길이 0 바디 + 틱 노트다.
 *   보조 레인의 길이 0 trillLong은 길이 0 트릴 바디만 두고 보고한다.
 * - 기존 명시 노트는 같은 참조로 그대로 둔다. 명시 노트가 놓인 구형 범위의 시작·끝에는 릴리즈·틱 노트를 더하거나
 *   바디를 합치지 않고, 그 위치의 길이 0 구형 범위는 아무 노트도 만들지 않으며 모두 보고한다.
 * - 구형에서도 위반이던 배치는 고치지 않고 1:1로 옮기며, 변환 전 입력의 위반을 보고한다.
 *   일부 위반(구형 바디 안의 Point 등)은 명시 모델에서 합법 배치가 되어 변환 뒤 검증으로는 보이지 않기 때문이다.
 *   끝이 시작보다 앞선 구형 범위는 사슬·합침에서 빼고 구형 노트 그대로 남긴다.
 *
 * 파일 버전이나 불러오기만으로 실행하지 않는다. 에디터가 사용자 승인을 받은 뒤 호출한다.
 */

import type { Beat } from "../types/beat";
import { beat as reducedBeat, beatCompare, beatEq, beatGte, beatLt, beatLte } from "../types/beat";
import type { BodyNote, ChartDocument, DocumentNoteEntity, PointNote, RangeNote, TapNote } from "../types/chart";
import { isExplicitNote } from "../types/chart";
import type { ValidationErrorRule } from "../validation";
import { validateChartDocument } from "../validation/documentValidation";
import { isAuxLane } from "./laneAxis";

/** 사람이 확인할 위치의 종류. 값마다 변환이 그 위치에 점수 노트를 두지 않은 이유가 다르다. */
export type LegacyConversionItemKind =
  /** 1→2·2→1 연결. 두 바디만 옮기고 경계는 사람이 고친다(사용자 결정 B1). */
  | "holdCountChangeConnection"
  /**
   * 트릴 바디의 사슬 끝. 메인 레인은 같은 레인 trillZone 안이라 릴리즈를 둘 수 없고(RFD 0038),
   * 보조 레인도 메인 레인처럼 릴리즈를 두지 않는다(사용자 결정, 2026-10-28).
   */
  | "releaseOmittedTrillBodyEnd"
  /** 같은 레인 trillZone 안(양 끝 포함)에서 끝나는 일반 바디의 사슬 끝(RFD 0038). */
  | "releaseOmittedInTrillZone"
  /** 사슬 끝에 탭 노트가 놓인 `o-o` 끝. 같은 위치의 탭+릴리즈는 scoreOverlap이라 탭만 남긴다. */
  | "releaseOmittedTapAtEnd"
  /** 틱 노트를 둘 수 없는 holdOnly 연결(트릴 바디가 낀 연결). */
  | "holdOnlyConnectionNotTickable"
  /**
   * 보조 레인의 길이 0 trillLong(구형에서 합법). 길이 0 트릴 바디만 두고 릴리즈·틱 노트는 두지 않는다
   * (트릴 바디 위 틱 노트는 tickPlacement, 사용자 결정, 2026-10-28). 일반·holdOnly 모두 1개를 잃는다.
   */
  | "auxZeroLengthTrillBody"
  /**
   * head도 holdOnly도 없는 같은 hold 수 연결(구형 NJ-C02 위반). 두 바디로 옮긴다. 명시 검증은 트릴 여부가 같은
   * 연결(일반 → 일반·트릴 → 트릴)만 막으므로, 일반 바디와 트릴 바디가 맞닿는 보조 레인 연결은 변환 뒤 합법이 된다.
   */
  | "sameHoldCountConnectionWithoutHeadOrHoldOnly"
  /**
   * 구형 범위의 시작·끝이나 길이 0 구형 범위의 위치에 명시 바디(시작·끝)·릴리즈·틱 노트가 이미 있다
   * (길이 0 구형 범위는 명시 탭 노트도 포함). 그 위치에는 릴리즈·틱 노트를 더하거나 바디를 합치지 않고,
   * 길이 0 구형 범위는 아무 노트도 만들지 않는다. 명시 바디가 끝나는 위치에서 시작하는 구형 범위는 그대로 바디로 옮기며,
   * 같은 hold 수·같은 트릴 여부면 명시 검증이 그 경계를 막는다.
   */
  | "explicitNoteAtLegacyPosition"
  /** 변환 전 입력에서 구형 노트가 연루된 구조·의미 위반. 변환은 그 배치를 고치지 않는다. */
  | "violationBeforeConversion";

interface LegacyConversionItemFields {
  /** 통합 레인 번호다. 메인은 1～4, 보조는 4 + 보조 레인 번호(`extraLane`)이므로 화면에 보일 때 바꿔야 한다. */
  readonly lane: number;
  /** 화면 이동에 쓰는 위치. 편집하면 index는 바뀌지만 레인·박은 남는다. */
  readonly beat: Beat;
  /**
   * 이 위치에서 구형 모델이 내던 점수 항목 중 변환 결과의 명시 노트가 맡지 않은 수. head 탭은 항상 옮기므로 세지 않는다.
   * `explicitNoteAtLegacyPosition`은 끝에서 시작하는 명시 바디를 구형 연결의 뒤 범위로 보고 세며, 같은 위치의 명시 릴리즈는
   * 릴리즈 항목을, 명시 틱 노트는 holdOnly 항목을 그 몫만큼 맡는다. `violationBeforeConversion`은 손실을 세지 않아 0이다.
   */
  readonly legacyItemCount: number;
  /** 이 위치에서 만나는 구형 노트의 입력 notes index. 연결은 앞 범위·뒤 범위 순이고 변환 전 위반은 오름차순이다. */
  readonly legacyNoteIndices: readonly number[];
}

export type LegacyConversionItem =
  | (LegacyConversionItemFields & {
    readonly kind: "holdCountChangeConnection";
    readonly predecessorHoldCount: 1 | 2;
    readonly successorHoldCount: 1 | 2;
    readonly hasHead: boolean;
    readonly predecessorHoldOnly: boolean;
  })
  | (LegacyConversionItemFields & {
    readonly kind: "violationBeforeConversion";
    /** 입력 검증(`validateChartDocument`)의 rule. */
    readonly rule: ValidationErrorRule;
  })
  | (LegacyConversionItemFields & {
    readonly kind: Exclude<LegacyConversionItemKind, "holdCountChangeConnection" | "violationBeforeConversion">;
  });

/** 변환이 새로 만든 노트 수(기존 명시 노트는 세지 않음)와 보고에 싣지 않는 손실 수. */
export interface LegacyConversionCounts {
  readonly taps: number;
  readonly bodies: number;
  readonly releases: number;
  readonly ticks: number;
  /** holdOnly 끝에서 하나로 합친 연결 수. */
  readonly mergedConnections: number;
  /**
   * 사슬 끝 holdOnly를 릴리즈 없는 바디로 옮겨(사용자 규칙 “롱노트 끝 holdonly는 릴리즈 없는 롱노트”) 잃은 구형 holdOnly 항목 수.
   * 규칙이 정한 손실이라 검토 목록에는 싣지 않고 수만 센다. 끝에 명시 노트가 있으면 이 수 대신 그 보고 항목에 센다.
   */
  readonly terminalHoldOnlyItemsDropped: number;
}

export interface LegacyConversionReport {
  readonly counts: LegacyConversionCounts;
  /** 레인 → 박 순. */
  readonly items: readonly LegacyConversionItem[];
}

export interface LegacyConversionResult {
  /** meta·trillZones·restZones·events는 입력과 같은 참조이고 notes만 새 배열이다. */
  readonly chart: ChartDocument;
  readonly report: LegacyConversionReport;
}

/** 메인·보조 레인 어디든 구형 노트가 하나라도 있으면 true. */
export function hasLegacyNotes(notes: readonly DocumentNoteEntity[]): boolean {
  return notes.some(note => !isExplicitNote(note));
}

const isLegacyPoint = (note: DocumentNoteEntity): note is PointNote =>
  note.type === "single" || note.type === "double" || note.type === "trill";
const isLegacyRange = (note: DocumentNoteEntity): note is RangeNote =>
  note.type === "long" || note.type === "doubleLong" || note.type === "trillLong";
const holdCountOf = (range: RangeNote): 1 | 2 => range.type === "doubleLong" ? 2 : 1;
const isTrillRange = (range: RangeNote) => range.type === "trillLong";
const isZeroLength = (range: RangeNote) => beatEq(range.beat, range.endBeat);
const isInvertedLegacyRange = (note: DocumentNoteEntity) => isLegacyRange(note) && beatLt(note.endBeat, note.beat);

/** 약분하지 않은 Beat도 같은 위치면 같은 키가 되게 약분해서 만든다. */
const positionKey = (lane: number, at: Beat) => {
  const reduced = reducedBeat(at.n, at.d);
  return `${lane}:${reduced.n}/${reduced.d}`;
};

function addIndex(indicesByPosition: Map<string, number[]>, key: string, index: number) {
  const indices = indicesByPosition.get(key);
  if (indices) indices.push(index);
  else indicesByPosition.set(key, [index]);
}

function toTap(point: PointNote): TapNote {
  return { type: "tap", kind: point.type, lane: point.lane, beat: point.beat, ...(point.grace ? { grace: true } : {}) };
}

function toBody(range: RangeNote, start: Beat, end: Beat): BodyNote {
  if (range.type === "doubleLong") return { type: "body", lane: range.lane, beat: start, endBeat: end, holdCount: 2 };
  return { type: "body", lane: range.lane, beat: start, endBeat: end, holdCount: 1,
    ...(isTrillRange(range) ? { trill: true as const } : {}) };
}

/**
 * 구형 범위 끝 하나에서 구형 모델이 내던 점수 항목 수(head 제외). 항목은 holdOnly면 holdOnly 항목, 아니면 릴리즈 항목이다.
 * 사슬 끝은 hold 수만큼, 같은 hold 수 연결은 holdOnly일 때만 hold 수만큼,
 * 증가·감소 연결은 holdOnly면 앞 hold 수만큼, 아니면 2→1의 감소 릴리즈 1개다.
 */
function legacyItemCountAtEnd(range: RangeNote, successorHoldCount: 1 | 2 | undefined): number {
  const holdCount = holdCountOf(range);
  if (successorHoldCount === undefined || range.holdOnly) return holdCount;
  if (holdCount === successorHoldCount) return 0;
  return holdCount > successorHoldCount ? 1 : 0;
}

const EMPTY_COUNTS: LegacyConversionCounts = Object.freeze({ taps: 0, bodies: 0, releases: 0, ticks: 0, mergedConnections: 0,
  terminalHoldOnlyItemsDropped: 0 });

/**
 * 변환 전 입력의 구조·의미 위반 중 구형 노트가 연루된 것을 보고 항목으로 만든다. 위치는 연루된 노트 중 시작이 가장 늦은 노트다.
 * 끝이 시작보다 앞선 구형 범위는 빼고 검사한 뒤 rangeInverted로 따로 싣는다. 다른 구조 위반이 남으면
 * `validateChartDocument`처럼 의미 위반은 검사하지 않는다.
 */
function violationItemsBeforeConversion(chart: ChartDocument, invertedIndices: ReadonlySet<number>): LegacyConversionItem[] {
  const notes = chart.notes;
  const checkedIndices = notes.flatMap((_, index) => invertedIndices.has(index) ? [] : [index]);
  const validation = validateChartDocument({ ...chart, notes: checkedIndices.map(index => notes[index]) });
  const errors = [...validation.structural, ...validation.semantic].map(error => ({ rule: error.rule,
    noteIndices: (error.refs ?? []).flatMap(ref => ref.kind === "note" ? [checkedIndices[ref.index]] : []) }));
  for (const index of invertedIndices) errors.push({ rule: "rangeInverted", noteIndices: [index] });

  const items: LegacyConversionItem[] = [];
  const seen = new Set<string>();
  for (const { rule, noteIndices } of errors) {
    const legacyNoteIndices = [...new Set(noteIndices)].filter(index => !isExplicitNote(notes[index])).sort((a, b) => a - b);
    if (!legacyNoteIndices.length) continue;
    const at = noteIndices.map(index => notes[index]).reduce((latest, note) => beatCompare(note.beat, latest.beat) > 0 ? note : latest);
    const key = `${rule}|${positionKey(at.lane, at.beat)}|${legacyNoteIndices.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: "violationBeforeConversion", rule, lane: at.lane, beat: at.beat, legacyItemCount: 0, legacyNoteIndices });
  }
  return items;
}

/**
 * 구형 노트를 명시 노트로 바꾼 새 차트와 보고를 돌려준다. 입력은 바꾸지 않는다.
 * 구형 노트가 없으면 같은 차트 참조와 빈 보고를 돌려준다.
 */
export function convertLegacyChart(chart: ChartDocument): LegacyConversionResult {
  if (!hasLegacyNotes(chart.notes)) return { chart, report: { counts: EMPTY_COUNTS, items: [] } };
  const notes = chart.notes;

  // 끝이 시작보다 앞선 구형 범위는 사슬·합침·위치 색인에서 빼고 구형 노트 그대로 남긴다(변환 전 위반으로 보고).
  const invertedIndices = new Set(notes.flatMap((note, index) => isInvertedLegacyRange(note) ? [index] : []));

  // 위치별 색인. head는 구형 Point와 명시 탭 노트 모두 위치로 판단한다.
  const tapIndicesByPosition = new Map<string, number[]>();
  const otherExplicitIndicesByPosition = new Map<string, number[]>();
  const explicitBodyIndicesByStart = new Map<string, number[]>();
  const positiveRangeIndicesByStart = new Map<string, number[]>();
  const positiveRangeEndKeys = new Set<string>();
  notes.forEach((note, index) => {
    if (isLegacyPoint(note) || note.type === "tap") addIndex(tapIndicesByPosition, positionKey(note.lane, note.beat), index);
    else if (note.type === "release" || note.type === "tick") addIndex(otherExplicitIndicesByPosition, positionKey(note.lane, note.beat), index);
    else if (note.type === "body") {
      addIndex(otherExplicitIndicesByPosition, positionKey(note.lane, note.beat), index);
      addIndex(explicitBodyIndicesByStart, positionKey(note.lane, note.beat), index);
      if (!beatEq(note.beat, note.endBeat)) addIndex(otherExplicitIndicesByPosition, positionKey(note.lane, note.endBeat), index);
    } else if (isLegacyRange(note) && !isZeroLength(note) && !invertedIndices.has(index)) {
      addIndex(positiveRangeIndicesByStart, positionKey(note.lane, note.beat), index);
      positiveRangeEndKeys.add(positionKey(note.lane, note.endBeat));
    }
  });
  const hasTapAt = (lane: number, at: Beat) => tapIndicesByPosition.has(positionKey(lane, at));
  const hasOtherExplicitAt = (lane: number, at: Beat) => otherExplicitIndicesByPosition.has(positionKey(lane, at));
  const hasExplicitTapAt = (lane: number, at: Beat) =>
    tapIndicesByPosition.get(positionKey(lane, at))?.some(index => notes[index].type === "tap") ?? false;
  /** 같은 위치의 명시 릴리즈 또는 틱 노트 몫 합. 릴리즈는 구형 릴리즈 항목을, 틱 노트는 holdOnly 항목을 맡는다. */
  const explicitShareAt = (lane: number, at: Beat, type: "release" | "tick") =>
    (otherExplicitIndicesByPosition.get(positionKey(lane, at)) ?? []).reduce((sum, index) => {
      const note = notes[index];
      return note.type === type ? sum + note.count : sum;
    }, 0);
  /** holdOnly면 holdOnly 항목, 아니면 릴리즈 항목인 구형 점수 항목 중 같은 위치의 명시 노트가 맡지 않은 수. */
  const uncoveredItemCount = (range: RangeNote, at: Beat, legacyItemCount: number) =>
    Math.max(0, legacyItemCount - explicitShareAt(range.lane, at, range.holdOnly ? "tick" : "release"));
  const isInTrillZone = (lane: number, at: Beat) => chart.trillZones.some(zone =>
    zone.lane === lane && beatGte(at, zone.beat) && beatLte(at, zone.endBeat));
  const rangeAt = (index: number) => notes[index] as RangeNote;

  // 같은 레인에서 끝에 맞닿아 시작하는 양수 길이 구형 범위(구형 연결). 위반 입력에서 여럿이면 앞 index를 쓴다.
  const successorByRange = new Map<number, number>();
  for (const indices of positiveRangeIndicesByStart.values()) {
    for (const index of indices) {
      const range = rangeAt(index);
      const successors = positiveRangeIndicesByStart.get(positionKey(range.lane, range.endBeat));
      if (successors?.length) successorByRange.set(index, successors[0]);
    }
  }

  // head 없는 같은 hold 수·같은 트릴 여부의 holdOnly 연결은 두 범위를 한 바디로 합친다.
  const mergedSuccessorByRange = new Map<number, number>();
  const mergedRanges = new Set<number>();
  for (const [index, successorIndex] of [...successorByRange].sort(([a], [b]) => a - b)) {
    const range = rangeAt(index);
    const successor = rangeAt(successorIndex);
    if (!range.holdOnly || mergedRanges.has(successorIndex)) continue;
    if (holdCountOf(range) !== holdCountOf(successor) || isTrillRange(range) !== isTrillRange(successor)) continue;
    if (hasTapAt(range.lane, range.endBeat) || hasOtherExplicitAt(range.lane, range.endBeat)) continue;
    mergedSuccessorByRange.set(index, successorIndex);
    mergedRanges.add(successorIndex);
  }

  const output: DocumentNoteEntity[] = [];
  const items: LegacyConversionItem[] = [];
  const counts = { ...EMPTY_COUNTS };
  const report = (kind: Exclude<LegacyConversionItemKind, "holdCountChangeConnection" | "violationBeforeConversion">,
    range: RangeNote, legacyItemCount: number, legacyNoteIndices: number[], at: Beat = range.endBeat) =>
    items.push({ kind, lane: range.lane, beat: at, legacyItemCount, legacyNoteIndices });

  /** 합친 사슬 조각의 마지막 범위 끝을 사슬 끝·연결로 나눠 처리한다. */
  const convertEnd = (index: number) => {
    const range = rangeAt(index);
    const { lane, endBeat } = range;
    const holdCount = holdCountOf(range);
    const successorIndex = successorByRange.get(index);
    const successor = successorIndex === undefined ? undefined : rangeAt(successorIndex);
    const meetingIndices = successorIndex === undefined ? [index] : [index, successorIndex];
    if (hasOtherExplicitAt(lane, endBeat)) {
      // 끝에서 시작하는 명시 바디는 구형 연결의 뒤 범위처럼 보고 센다.
      const explicitSuccessor = explicitBodyIndicesByStart.get(positionKey(lane, endBeat))?.[0];
      const successorHoldCount = successor ? holdCountOf(successor)
        : explicitSuccessor === undefined ? undefined : (notes[explicitSuccessor] as BodyNote).holdCount;
      report("explicitNoteAtLegacyPosition", range,
        uncoveredItemCount(range, endBeat, legacyItemCountAtEnd(range, successorHoldCount)), meetingIndices);
      return;
    }
    if (!successor) {
      if (range.holdOnly) { // 사슬 끝 holdOnly는 릴리즈 없는 바디(사용자 규칙). 잃는 항목은 수만 센다.
        counts.terminalHoldOnlyItemsDropped += holdCount;
        return;
      }
      if (isTrillRange(range)) {
        report("releaseOmittedTrillBodyEnd", range, holdCount, meetingIndices);
      } else if (isInTrillZone(lane, endBeat)) {
        report("releaseOmittedInTrillZone", range, holdCount, meetingIndices);
      } else if (hasTapAt(lane, endBeat)) {
        report("releaseOmittedTapAtEnd", range, holdCount, meetingIndices);
      } else {
        output.push({ type: "release", lane, beat: endBeat, count: holdCount });
        counts.releases++;
      }
      return;
    }
    const hasHead = hasTapAt(lane, endBeat);
    const successorHoldCount = holdCountOf(successor);
    if (holdCount !== successorHoldCount) {
      items.push({ kind: "holdCountChangeConnection", lane, beat: endBeat, predecessorHoldCount: holdCount,
        successorHoldCount, hasHead, predecessorHoldOnly: range.holdOnly === true,
        legacyItemCount: legacyItemCountAtEnd(range, successorHoldCount), legacyNoteIndices: meetingIndices });
      return;
    }
    if (hasHead) return; // 같은 hold 수 연결의 경계는 탭 노트가 맡는다.
    if (range.holdOnly) report("holdOnlyConnectionNotTickable", range, holdCount, meetingIndices);
    else report("sameHoldCountConnectionWithoutHeadOrHoldOnly", range, 0, meetingIndices);
  };

  notes.forEach((note, index) => {
    if (isExplicitNote(note)) {
      output.push(note);
      return;
    }
    if (isLegacyPoint(note)) {
      output.push(toTap(note));
      counts.taps++;
      return;
    }
    if (mergedRanges.has(index)) return; // 앞 범위가 합친 바디로 함께 냈다.
    if (invertedIndices.has(index)) {
      output.push(note);
      return;
    }
    const holdCount = holdCountOf(note);
    if (isZeroLength(note)) {
      // 같은 위치에 명시 노트가 있으면 무엇을 더해도 겹치므로 아무것도 만들지 않는다.
      if (hasOtherExplicitAt(note.lane, note.beat) || hasExplicitTapAt(note.lane, note.beat)) {
        report("explicitNoteAtLegacyPosition", note, uncoveredItemCount(note, note.beat, holdCount), [index]);
        return;
      }
      if (isTrillRange(note)) {
        // 메인 레인의 길이 0 trillLong은 구형에서도 위반이라 고치지 않고 옮긴다. 보조 레인에서는 합법이지만
        // 트릴 바디에는 릴리즈·틱 노트를 두지 않으므로 바디만 옮기고 보고한다(사용자 결정, 2026-10-28).
        output.push(toBody(note, note.beat, note.endBeat));
        counts.bodies++;
        if (isAuxLane(note.lane)) report("auxZeroLengthTrillBody", note, holdCount, [index]);
      } else if (note.holdOnly) {
        output.push(toBody(note, note.beat, note.endBeat), { type: "tick", lane: note.lane, beat: note.beat, count: holdCount });
        counts.bodies++;
        counts.ticks++;
      } else {
        output.push({ type: "release", lane: note.lane, beat: note.beat, count: holdCount });
        counts.releases++;
      }
      return;
    }

    // 앞 구형 범위 없이 명시 노트 위치에서 시작하면(명시 바디 끝 등) 경계에 아무것도 더하지 않고 보고한다.
    // 앞 구형 범위가 끝나는 위치는 그 범위의 끝 처리가 보고한다.
    if (hasOtherExplicitAt(note.lane, note.beat) && !positiveRangeEndKeys.has(positionKey(note.lane, note.beat))) {
      report("explicitNoteAtLegacyPosition", note, 0, [index], note.beat);
    }
    const group = [index];
    for (let next = mergedSuccessorByRange.get(index); next !== undefined; next = mergedSuccessorByRange.get(next)) group.push(next);
    const lastIndex = group[group.length - 1];
    output.push(toBody(note, note.beat, rangeAt(lastIndex).endBeat));
    counts.bodies++;
    for (const mergedIndex of group.slice(0, -1)) {
      const merged = rangeAt(mergedIndex);
      counts.mergedConnections++;
      const successorIndex = mergedSuccessorByRange.get(mergedIndex) as number;
      if (isTrillRange(merged)) {
        report("holdOnlyConnectionNotTickable", merged, holdCount, [mergedIndex, successorIndex]);
        continue;
      }
      output.push({ type: "tick", lane: merged.lane, beat: merged.endBeat, count: holdCount });
      counts.ticks++;
    }
    convertEnd(lastIndex);
  });

  items.push(...violationItemsBeforeConversion(chart, invertedIndices));
  items.sort((a, b) => a.lane - b.lane || beatCompare(a.beat, b.beat) || a.legacyNoteIndices[0] - b.legacyNoteIndices[0]);
  return { chart: { ...chart, notes: output }, report: { counts, items } };
}
