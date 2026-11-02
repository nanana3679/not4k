/** 기존 숫자 레인 API의 어댑터. 가로 배치의 단일 소유자는 TimelineLayout이다. */
import { DEFAULT_TIMELINE_LAYOUT, type TimelineLayout } from "./TimelineLayout";

export function laneToX(lane: number, layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT): number {
  return layout.noteLaneRange(lane).x;
}

export function laneWidth(lane: number, layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT): number {
  return layout.noteLaneRange(lane).width;
}

/** editorLane은 보조 레인의 1-기반 번호다. 노트 lane과 구별한다. */
export function eventLaneToX(editorLane: number, layout: TimelineLayout = DEFAULT_TIMELINE_LAYOUT): number {
  return layout.auxiliaryLaneRange(editorLane).x;
}
