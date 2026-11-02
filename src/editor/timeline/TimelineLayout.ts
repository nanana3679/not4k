import { fromAuxIndex, isMainLane, toAuxIndex } from "../../shared";
import type { ChartEvent } from "../../shared";
import { EXTRA_LANE_WIDTH, LANE_COUNT, LANE_WIDTH, MEASURE_LABEL_WIDTH } from "./constants";

export interface TimelineXRange {
  readonly x: number;
  readonly width: number;
}

export type TimelineColumn =
  | { kind: "main"; lane: number }
  | { kind: "auxiliary"; lane: number }
  | { kind: "common"; column: string };

type EventPlacementInput = Pick<ChartEvent, "type" | "editorLane">;

/** 현재는 타이밍 이벤트도 저장된 보조 레인 배치를 그대로 따른다. */
export function eventPlacement(event: EventPlacementInput): { kind: "auxiliary"; lane: number } {
  return { kind: "auxiliary", lane: event.editorLane ?? 1 };
}

/** 기존 projection 어댑터도 이 등간격 레인 투영을 사용한다. */
export function xToLaneInRange(x: number, startX: number, width: number, count: number): number | null {
  if (x < startX || width <= 0 || count <= 0) return null;
  const lane = Math.floor((x - startX) / width) + 1;
  return lane >= 1 && lane <= count ? lane : null;
}

/** 콘텐츠 원점을 기준으로 한 가로 배치. 저장 레인 번호는 바꾸지 않는다. */
export function createTimelineLayout(input: {
  auxiliaryLaneCount: number;
  songCommonColumns?: readonly { id: string; width: number }[];
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
    noteLaneToAuxiliaryLane: (lane: number) => lane > LANE_COUNT ? toAuxIndex(lane) : null,
    eventPlacement,
    eventRange,
    eventBoxColumn: (event: EventPlacementInput) => fromAuxIndex(eventPlacement(event).lane),
    isEventAtX: (event: EventPlacementInput, x: number): boolean => {
      const column = classifyX(x);
      const placement = eventPlacement(event);
      return column.kind === placement.kind && column.lane === placement.lane;
    },
  };
}

export type TimelineLayout = ReturnType<typeof createTimelineLayout>;

/** 레이아웃을 주입하지 않는 순수 어댑터의 기본값. 곡 공통 영역은 비어 있다. */
export const DEFAULT_TIMELINE_LAYOUT = createTimelineLayout({ auxiliaryLaneCount: 0 });
