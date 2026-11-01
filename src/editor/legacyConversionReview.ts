/**
 * 구형 차트 변환 모달과 변환 검토 목록의 문구 — RFD 0037 §8-1.
 *
 * `convertLegacyChart`의 보고를 모달 개수 줄·검토 행·복사 텍스트로 바꾸고, 검토 행이 가리키는 노트를 찾는다.
 * 노트 index는 편집하면 바뀌므로 행은 보고의 위치(통합 레인·박)만 쓴다.
 */

import type { Beat } from "../shared/types/beat";
import { BEAT_ZERO, beatEq, beatGt, beatLt, beatSub, beatToString } from "../shared/types/beat";
import type { ChartDocument, ChartEvent, DocumentNoteEntity } from "../shared/types/chart";
import type { LegacyConversionItem, LegacyConversionReport } from "../shared/chart";
import { convertLegacyChart, hasLegacyNotes } from "../shared/chart/legacyConversion";
import { isAuxLane, isVisibleLane, toAuxIndex } from "../shared/chart/laneAxis";
import { beatToMs, extractTimeSignatureChanges, measureStartBeat } from "../shared/timing";
import type { BpmChange } from "../shared";
import { clampToCursorRange, type CursorRangeMs } from "./timeline/timelineRange";
import { validateChartDocumentStructural, violationLabel } from "../shared/validation";

/** 변환 모달이 보이는 화면. 변환 전(`offer`)과 변환 뒤 결과(`result`)가 같은 모달을 쓴다. */
export type LegacyConversionDialog =
  /** 변환 전. `structuralErrorCount`가 있으면 변환 결과를 setChart가 거부하므로 변환을 막는다. */
  | { phase: "offer"; report: LegacyConversionReport; structuralErrorCount: number }
  | { phase: "result"; report: LegacyConversionReport };

/**
 * 차트를 새로 열 때 보일 변환 전 화면. 개수는 같은 순수 함수의 dry-run이다.
 * 지금 차트에 구형 노트가 없으면(이미 변환했거나 처음부터 신형) 개수가 모두 0인 화면 대신 null이다.
 */
export function legacyConversionOfferFor(chart: ChartDocument): LegacyConversionDialog | null {
  if (!hasLegacyNotes(chart.notes)) return null;
  const dryRun = convertLegacyChart(chart);
  return { phase: "offer", report: dryRun.report, structuralErrorCount: validateChartDocumentStructural(dryRun.chart).length };
}

/** 변환 전 모달과 결과 화면의 개수 줄. 합친 연결·사슬 끝 holdOnly 손실은 넣지 않는다. */
export function formatLegacyConversionCounts(report: LegacyConversionReport): string {
  const { taps, bodies, releases, ticks } = report.counts;
  return `탭 ${taps} · 바디 ${bodies} · 릴리즈 ${releases} · 틱 ${ticks} · 검토할 항목 ${report.items.length}`;
}

/** 통합 레인을 에디터가 부르는 레인 이름으로 적는다. 보조는 4 + 보조 레인 번호다. */
export function formatReviewLane(lane: number): string {
  return isAuxLane(lane) ? `보조 레인 ${toAuxIndex(lane)}` : `레인 ${lane}`;
}

/** 박이 든 마디(0부터)와 그 마디의 시작 박. 박자표가 없거나 음수 박이면 null. */
function measureContaining(at: Beat, events: readonly ChartEvent[]): { measure: number; start: Beat } | null {
  const signatures = extractTimeSignatureChanges(events);
  if (signatures.length === 0 || beatLt(at, BEAT_ZERO)) return null;
  let measure = 0;
  let start = measureStartBeat(0, signatures);
  for (;;) {
    const next = measureStartBeat(measure + 1, signatures);
    // 분자 0 박자표(구조 위반)는 마디를 전진시키지 않는다. 무한 반복 대신 지금 마디 안 위치로 적는다.
    if (!beatGt(next, start) || beatLt(at, next)) return { measure, start };
    measure++;
    start = next;
  }
}

/**
 * 박을 에디터 타임라인의 마디 번호(1부터)와 그 마디 안 박(1부터)으로 적는다. 분수 박은 `2마디 1+1/2박`이다.
 * 박자표가 없으면 곡 시작부터의 박(`박 9/2`)으로 적는다.
 */
export function formatMeasureBeat(at: Beat, events: readonly ChartEvent[]): string {
  const found = measureContaining(at, events);
  if (!found) return `박 ${beatToString(at)}`;
  const offset = beatSub(at, found.start);
  const whole = Math.floor(offset.n / offset.d);
  const remainder = offset.n - whole * offset.d;
  const beatInMeasure = remainder === 0 ? `${whole + 1}박` : `${whole + 1}+${remainder}/${offset.d}박`;
  return `${found.measure + 1}마디 ${beatInMeasure}`;
}

const KIND_DESCRIPTIONS: Record<Exclude<LegacyConversionItem["kind"], "holdCountChangeConnection" | "violationBeforeConversion">, string> = {
  releaseOmittedTrillBodyEnd: "트릴 바디 끝 · 릴리즈 없음",
  releaseOmittedInTrillZone: "trillZone 안 바디 끝 · 릴리즈 없음",
  releaseOmittedTapAtEnd: "끝에 탭 노트(o-o) · 릴리즈 없음",
  holdOnlyConnectionNotTickable: "트릴 바디가 낀 holdOnly 연결 · 틱 노트 없음",
  auxZeroLengthTrillBody: "길이 0 트릴 바디 · 릴리즈·틱 노트 없음",
  sameHoldCountConnectionWithoutHeadOrHoldOnly: "head·holdOnly 없는 같은 hold 수 연결",
  explicitNoteAtLegacyPosition: "명시 노트가 이미 있는 위치 · 노트를 더하지 않음",
};

/** 보고 항목 하나가 왜 검토 대상인지 한국어로 적는다. 옮기지 못한 구형 점수 항목이 있으면 그 수를 덧붙인다. */
export function describeLegacyConversionItem(item: LegacyConversionItem): string {
  let text: string;
  if (item.kind === "holdCountChangeConnection") {
    const direction = item.predecessorHoldCount < item.successorHoldCount ? "증가" : "감소";
    // 경계에 head(탭 노트)가 있으면 변환 뒤에도 그 탭 노트가 남는다. 없으면 경계에 아무 노트도 더하지 않는다.
    const boundary = item.hasHead ? "경계에 탭 노트 유지" : "경계 비움";
    text = `${direction} 연결 ${item.predecessorHoldCount}→${item.successorHoldCount} · ${boundary}`;
    if (item.predecessorHoldOnly) text += " · 앞 끝 holdOnly";
  } else if (item.kind === "violationBeforeConversion") {
    text = `변환 전 위반: ${violationLabel(item.rule)} (${item.rule})`;
  } else {
    text = KIND_DESCRIPTIONS[item.kind];
  }
  return item.legacyItemCount > 0 ? `${text} · 옮기지 못한 구형 점수 항목 ${item.legacyItemCount}개` : text;
}

/** 변환 검토 목록의 한 행. `item`의 레인·박이 이동과 선택의 기준이다. */
export interface LegacyConversionReviewRow {
  readonly key: string;
  readonly item: LegacyConversionItem;
  readonly lane: string;
  readonly position: string;
  readonly description: string;
}

/** 보고 순서(레인 → 박)대로 행을 만든다. 마디 표시는 지금 차트의 박자표를 따른다. */
export function buildLegacyConversionReviewRows(
  items: readonly LegacyConversionItem[],
  events: readonly ChartEvent[],
): LegacyConversionReviewRow[] {
  return items.map((item, index) => ({
    key: `${index}:${item.kind}:${item.lane}:${beatToString(item.beat)}`,
    item,
    lane: formatReviewLane(item.lane),
    position: formatMeasureBeat(item.beat, events),
    description: describeLegacyConversionItem(item),
  }));
}

/** "텍스트로 복사"가 클립보드에 넣는 글. 세션이 끝나도 위치를 다시 찾을 수 있게 곡 시작부터의 박도 적는다. */
export function formatLegacyConversionReviewText(rows: readonly LegacyConversionReviewRow[], chartLabel: string): string {
  return [
    `변환 검토 ${rows.length}건 — ${chartLabel}`,
    ...rows.map((row, index) =>
      `${index + 1}. ${row.lane} · ${row.position} (박 ${beatToString(row.item.beat)}) · ${row.description}`),
  ].join("\n");
}

/** 같은 레인에서 그 박에 놓이거나 그 박에서 끝나는 노트의 index. 검토 행 클릭이 고를 노트다. */
export function noteIndicesAtPosition(notes: readonly DocumentNoteEntity[], lane: number, at: Beat): number[] {
  return notes.flatMap((note, index) => note.lane === lane
    && (beatEq(note.beat, at) || ("endBeat" in note && beatEq(note.endBeat, at))) ? [index] : []);
}

/** 검토 행으로 이동할 때 커서와 스크롤이 함께 사용할 시각. */
export function conversionReviewTimeMs(
  item: LegacyConversionItem,
  bpmChanges: readonly BpmChange[],
  cursorRange: CursorRangeMs,
): number {
  return clampToCursorRange(beatToMs(item.beat, bpmChanges, cursorRange.startTimeMs), cursorRange);
}

/**
 * 검토 행의 레인이 지금 보조 레인 수 밖이라 화면에 없으면 그 안내 문구, 보이면 null.
 * 숨은 노트는 선택하지 않는다(보이지 않는 노트를 삭제·이동하지 않게). 보조 레인 수는 차트 자료라 자동으로 늘리지 않는다.
 */
export function hiddenReviewLaneMessage(lane: number, extraLaneCount: number): string | null {
  if (isVisibleLane(lane, extraLaneCount)) return null;
  const auxLane = toAuxIndex(lane);
  return `숨은 보조 레인 ${auxLane}의 항목이라 노트를 선택하지 않았습니다. Extra lanes를 ${auxLane} 이상으로 늘리면 보입니다`;
}
