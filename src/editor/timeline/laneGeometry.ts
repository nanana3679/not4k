/**
 * laneGeometry — lane(메인 1..4·보조 5+) → 타임라인 픽셀 x 투영 (RFD 0018 좌표 투영)
 *
 * laneAxis(경계 지식)의 직접 소비자. 보조 레인은 메인 영역(TIMELINE_WIDTH) 오른쪽의
 * 별도 영역에 그려진다 — 레인 연속성은 논리적(lane±1)이고 기하학적으로는 불연속이다.
 */

import { isMainLane, toAuxIndex } from "../../shared";
import { LANE_WIDTH, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from "./constants";

/** lane → 칸 왼쪽 x. 메인 (lane-1)*LANE_WIDTH, 보조 TIMELINE_WIDTH + (auxIndex-1)*EXTRA_LANE_WIDTH */
export function laneToX(lane: number): number {
  return isMainLane(lane)
    ? (lane - 1) * LANE_WIDTH
    : TIMELINE_WIDTH + (toAuxIndex(lane) - 1) * EXTRA_LANE_WIDTH;
}

/** lane의 칸 폭 */
export function laneWidth(lane: number): number {
  return isMainLane(lane) ? LANE_WIDTH : EXTRA_LANE_WIDTH;
}
