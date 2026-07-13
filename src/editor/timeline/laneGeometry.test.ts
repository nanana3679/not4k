import { describe, it, expect } from "vitest";
import { laneToX, laneWidth, eventLaneToX } from "./laneGeometry";
import { LANE_WIDTH, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from "./constants";

describe("laneGeometry", () => {
  it("메인 lane 1 → x 0, lane 4 → x 3*LANE_WIDTH", () => {
    expect(laneToX(1)).toBe(0);
    expect(laneToX(4)).toBe(3 * LANE_WIDTH);
  });

  it("보조 lane 5(보조 1) → x TIMELINE_WIDTH — 메인 영역 오른쪽 첫 칸", () => {
    expect(laneToX(5)).toBe(TIMELINE_WIDTH);
  });

  it("보조 lane 7(보조 3) → x TIMELINE_WIDTH + 2*EXTRA_LANE_WIDTH", () => {
    expect(laneToX(7)).toBe(TIMELINE_WIDTH + 2 * EXTRA_LANE_WIDTH);
  });

  it("칸 폭: 메인 lane 2 = LANE_WIDTH, 보조 lane 6 = EXTRA_LANE_WIDTH", () => {
    expect(laneWidth(2)).toBe(LANE_WIDTH);
    expect(laneWidth(6)).toBe(EXTRA_LANE_WIDTH);
  });

  it("이벤트 editorLane 1 → x TIMELINE_WIDTH — 첫 엑스트라 칸", () => {
    expect(eventLaneToX(1)).toBe(TIMELINE_WIDTH);
  });

  it("이벤트 editorLane 3 → x TIMELINE_WIDTH + 2*EXTRA_LANE_WIDTH", () => {
    expect(eventLaneToX(3)).toBe(TIMELINE_WIDTH + 2 * EXTRA_LANE_WIDTH);
  });

  it("이벤트 editorLane 2와 보조 lane 6은 같은 두 번째 엑스트라 칸 x를 가리킨다 — 축은 달라도 기하는 일치", () => {
    expect(eventLaneToX(2)).toBe(laneToX(6));
  });
});
