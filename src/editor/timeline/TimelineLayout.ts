import { fromAuxIndex, isMainLane, toAuxIndex } from "../../shared";
import type { ChartEvent, TimingEvent } from "../../shared";
import {
  BPM_COLUMN_WIDTH,
  EXTRA_LANE_WIDTH,
  LANE_COUNT,
  LANE_WIDTH,
  MEASURE_LABEL_WIDTH,
  TIME_SIGNATURE_COLUMN_WIDTH,
} from "./constants";

export interface TimelineXRange {
  readonly x: number;
  readonly width: number;
}

/** 곡 공통 영역의 열은 그 열에 놓이는 이벤트 종류로 부른다. */
export type SongCommonColumnId = TimingEvent["type"];

export interface SongCommonColumn {
  readonly id: SongCommonColumnId;
  readonly width: number;
}

export interface TimelineLayoutConfig {
  readonly auxiliaryLaneCount: number;
  readonly songCommonColumns: readonly SongCommonColumn[];
  /** 접혀서 빠진 곡 공통 폭. 배치에는 쓰지 않고 중앙 정렬 폭에만 더해 마디 레일과 그 위 버튼을 제자리에 둔다. */
  readonly collapsedSongCommonWidth?: number;
}

/** 곡 공통 영역의 열. 배열 순서가 왼쪽부터의 배치이며, 이 목록만 바꿔도 입력·렌더링이 함께 따라간다. */
const SONG_COMMON_COLUMNS: readonly SongCommonColumn[] = [
  { id: "bpm", width: BPM_COLUMN_WIDTH },
  { id: "timeSignature", width: TIME_SIGNATURE_COLUMN_WIDTH },
];

/** 앱·입력·E2E가 공유하는 현재 표시 설정. 곡 공통 영역을 접으면 열이 없어 BPM·박자가 어느 입력·렌더에도 잡히지 않는다. */
export function getEditorTimelineLayoutConfig(display: {
  extraLaneCount: number;
  songCommonCollapsed: boolean;
}): TimelineLayoutConfig {
  return {
    auxiliaryLaneCount: display.extraLaneCount,
    songCommonColumns: display.songCommonCollapsed ? [] : SONG_COMMON_COLUMNS,
    collapsedSongCommonWidth: display.songCommonCollapsed ? songCommonWidthOf({ songCommonColumns: SONG_COMMON_COLUMNS }) : 0,
  };
}

export function songCommonWidthOf(config: Pick<TimelineLayoutConfig, "songCommonColumns">): number {
  return config.songCommonColumns.reduce((sum, column) => sum + column.width, 0);
}

export type TimelineColumn =
  | { kind: "main"; lane: number }
  | { kind: "auxiliary"; lane: number }
  | { kind: "common"; column: SongCommonColumnId };

/** 구형 값이 남은 객체나 고스트처럼 저장되지 않는 입력도 받으므로 `editorLane`을 종류와 무관한 선택 필드로 둔다. */
export interface EventPlacementInput {
  readonly type: ChartEvent["type"];
  readonly editorLane?: number;
}

/** BPM·박자는 종류가 정한 곡 공통 열에, 나머지 이벤트는 저장된 보조 레인에 놓인다(RFD 0082). */
export function eventPlacement(event: EventPlacementInput):
  { kind: "common"; column: SongCommonColumnId } | { kind: "auxiliary"; lane: number } {
  return event.type === "bpm" || event.type === "timeSignature"
    ? { kind: "common", column: event.type }
    : { kind: "auxiliary", lane: event.editorLane ?? 1 };
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
  collapsedSongCommonWidth?: number;
}) {
  const { auxiliaryLaneCount } = input;
  const songCommonColumns = input.songCommonColumns ?? [];
  const rangeByCommonColumn = new Map<SongCommonColumnId, TimelineXRange>();
  let songCommonWidth = 0;
  for (const column of songCommonColumns) {
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
  /** 드래그 앵커 번호. 레인은 통합 레인 번호, 곡 공통 열은 메인 1번 왼쪽으로 이어지는 0 이하 번호다. */
  const xToDragLane = (x: number): number | null => {
    const column = classifyX(x);
    if (column.kind !== "common") return xToNoteLane(x);
    return songCommonColumns.findIndex(({ id }) => id === column.column) - songCommonColumns.length + 1;
  };
  /** 놓일 열이 지금 배치에 없으면 null이다. */
  const eventRange = (event: EventPlacementInput): TimelineXRange | null => {
    const placement = eventPlacement(event);
    return placement.kind === "common"
      ? rangeByCommonColumn.get(placement.column) ?? null
      : auxiliaryLaneRange(placement.lane);
  };
  return {
    auxiliaryLaneCount,
    contentWidth,
    /** 콘텐츠 블록을 가운데에 놓을 때 쓰는 폭. 접혀도 펼친 폭이라 접기가 마디 레일을 옮기지 않는다. */
    centeringWidth: contentWidth + (input.collapsedSongCommonWidth ?? 0),
    measureRail: { x: -MEASURE_LABEL_WIDTH, width: MEASURE_LABEL_WIDTH },
    mainArea,
    songCommonWidth,
    songCommonColumns,
    commonColumnRange: (column: SongCommonColumnId) => rangeByCommonColumn.get(column),
    noteLaneRange,
    auxiliaryLaneRange,
    classifyX,
    xToNoteLane,
    xToDragLane,
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
      if (placement.kind === "common") return column.kind === "common" && column.column === placement.column;
      return column.kind === "auxiliary" && column.lane === placement.lane;
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
