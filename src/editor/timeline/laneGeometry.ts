/** 기존 숫자 레인 API의 어댑터. 가로 배치의 단일 소유자는 TimelineLayout이다. */
import type { TimelineLayout } from "./TimelineLayout";

export function laneToX(lane: number, layout: TimelineLayout): number {
  return layout.noteLaneRange(lane).x;
}

export function laneWidth(lane: number, layout: TimelineLayout): number {
  return layout.noteLaneRange(lane).width;
}
