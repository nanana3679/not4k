import { fromAuxIndex, isMainLane, toAuxIndex } from "../../shared";
import type { ChartEvent } from "../../shared";
import { EXTRA_LANE_WIDTH, LANE_COUNT, LANE_WIDTH, MEASURE_LABEL_WIDTH } from "./constants";

export interface TimelineXRange {
  readonly x: number;
  readonly width: number;
}

export interface TimelineLayoutConfig {
  readonly auxiliaryLaneCount: number;
  readonly songCommonColumns: readonly { readonly id: string; readonly width: number }[];
}

/** 앱·입력·E2E가 공유하는 현재 표시 설정. song-common area는 아직 비어 있다. */
export function getEditorTimelineLayoutConfig(auxiliaryLaneCount: number): TimelineLayoutConfig {
  return { auxiliaryLaneCount, songCommonColumns: [] };
}

export type TimelineColumn =
  | { kind: "main"; lane: number }
  | { kind: "auxiliary"; lane: number }
  | { kind: "common"; column: string };

export type EventPlacementInput = Pick<ChartEvent, "type" | "editorLane">;

/** 현재는 타이밍 이벤트도 저장된 보조 레인 배치를 그대로 따른다. */
export function eventPlacement(event: EventPlacementInput): { kind: "auxiliary"; lane: number } {
  return { kind: "auxiliary", lane: event.editorLane ?? 1 };
}

/** 등간격 레인 투영. 범위 밖이면 null이다. */
function xToLaneInRange(x: number, startX: number, width: number, count: number): number | null {
  if (x < startX || width <= 0 || count <= 0) return null;
  const lane = Math.floor((x - startX) / width) + 1;
  return lane >= 1 && lane <= count ? lane : null;
}

/** 콘텐츠 원점을 기준으로 한 가로 배치. 저장 레인 번호는 바꾸지 않는다. */
export function createTimelineLayout(input: {
  auxiliaryLaneCount: number;
  songCommonColumns?: TimelineLayoutConfig["songCommonColumns"];
}) {
  const { auxiliaryLaneCount } = input;
  const rangeByCommonColumn = new Map<string, TimelineXRange>();
  let songCommonWidth = 0;
  for (const column of input.songCommonColumns ?? []) {
    rangeByCommonColumn.set(column.id, { x: songCommonWidth, width: column.width });
    songCommonWidth += column.width;
  }
  const mainArea = { x: songCommonWidth, width: LANE_COUNT * LANE_WIDTH };
  const auxiliaryLaneRange = (lane: number): TimelineXRange => ({
    x: mainArea.x + mainArea.width + (lane - 1) * EXTRA_LANE_WIDTH,
    width: EXTRA_LANE_WIDTH,
  });
  const noteLaneRange = (lane: number): TimelineXRange => isMainLane(lane)
    ? { x: mainArea.x + (lane - 1) * LANE_WIDTH, width: LANE_WIDTH }
    : auxiliaryLaneRange(toAuxIndex(lane));
  const auxiliaryStartX = mainArea.x + mainArea.width;
  const contentWidth = auxiliaryStartX + auxiliaryLaneCount * EXTRA_LANE_WIDTH;
  const classifyX = (x: number): TimelineColumn | { kind: "outside" } => {
    if (x < 0 || x >= contentWidth || !Number.isFinite(x)) return { kind: "outside" };
    for (const [column, range] of rangeByCommonColumn) {
      if (x >= range.x && x < range.x + range.width) return { kind: "common", column };
    }
    const mainLane = xToLaneInRange(x, mainArea.x, LANE_WIDTH, LANE_COUNT);
    if (mainLane !== null) return { kind: "main", lane: mainLane };
    const auxiliaryLane = xToLaneInRange(x, auxiliaryStartX, EXTRA_LANE_WIDTH, auxiliaryLaneCount);
    return auxiliaryLane === null ? { kind: "outside" } : { kind: "auxiliary", lane: auxiliaryLane };
  };
  const xToNoteLane = (x: number): number | null => {
    const column = classifyX(x);
    if (column.kind === "main") return column.lane;
    return column.kind === "auxiliary" ? fromAuxIndex(column.lane) : null;
  };
  const eventRange = (event: EventPlacementInput) => auxiliaryLaneRange(eventPlacement(event).lane);
  return {
    auxiliaryLaneCount,
    contentWidth,
    measureRail: { x: -MEASURE_LABEL_WIDTH, width: MEASURE_LABEL_WIDTH },
    mainArea,
    songCommonWidth,
    commonColumnRange: (column: string) => rangeByCommonColumn.get(column),
    noteLaneRange,
    auxiliaryLaneRange,
    classifyX,
    xToNoteLane,
    eventPlacement,
    eventRange,
    columnRangeAtX: (x: number): TimelineXRange | null => {
      const column = classifyX(x);
      if (column.kind === "common") return rangeByCommonColumn.get(column.column)!;
      if (column.kind === "main") return noteLaneRange(column.lane);
      if (column.kind === "auxiliary") return auxiliaryLaneRange(column.lane);
      return null;
    },
    isEventAtX: (event: EventPlacementInput, x: number): boolean => {
      const column = classifyX(x);
      const placement = eventPlacement(event);
      return column.kind === placement.kind && column.lane === placement.lane;
    },
  };
}

export type TimelineLayout = ReturnType<typeof createTimelineLayout>;

/** 격리된 노트 렌더링 호스트의 기본값. 곡 공통 영역은 비어 있다. */
export const DEFAULT_TIMELINE_LAYOUT = createTimelineLayout({ auxiliaryLaneCount: 0 });

/** 양 끝 열 전체를 포함하는 가로 범위. */
export function enclosingXRange(start: TimelineXRange, end: TimelineXRange): TimelineXRange {
  const x = Math.min(start.x, end.x);
  return { x, width: Math.max(start.x + start.width, end.x + end.width) - x };
}

/** 맞닿은 열은 겹치지 않는 반열린 구간. */
export function xRangesOverlap(a: TimelineXRange, b: TimelineXRange): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width;
}
