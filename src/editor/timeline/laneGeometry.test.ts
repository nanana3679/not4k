import { getContentCenterShiftX, getTimelineContentOffsetX } from "./timelineViewport";
import { createTimelineLayout, getEditorTimelineLayoutConfig } from "./TimelineLayout";
import { describe, it, expect } from "vitest";
import { laneToX, laneWidth } from "./laneGeometry";
import { LANE_WIDTH, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from "./constants";

const layout = createTimelineLayout(getEditorTimelineLayoutConfig(3));

describe("laneGeometry", () => {
  it("메인 lane 1 → x 0, lane 4 → x 3*LANE_WIDTH", () => {
    expect(laneToX(1, layout)).toBe(0);
    expect(laneToX(4, layout)).toBe(3 * LANE_WIDTH);
  });

  it("보조 lane 5(보조 1) → x TIMELINE_WIDTH — 메인 영역 오른쪽 첫 칸", () => {
    expect(laneToX(5, layout)).toBe(TIMELINE_WIDTH);
  });

  it("보조 lane 7(보조 3) → x TIMELINE_WIDTH + 2*EXTRA_LANE_WIDTH", () => {
    expect(laneToX(7, layout)).toBe(TIMELINE_WIDTH + 2 * EXTRA_LANE_WIDTH);
  });

  it("칸 폭: 메인 lane 2 = LANE_WIDTH, 보조 lane 6 = EXTRA_LANE_WIDTH", () => {
    expect(laneWidth(2, layout)).toBe(LANE_WIDTH);
    expect(laneWidth(6, layout)).toBe(EXTRA_LANE_WIDTH);
  });

  it("이벤트 editorLane 1 → x TIMELINE_WIDTH — 첫 엑스트라 칸", () => {
    expect(layout.auxiliaryLaneRange(1).x).toBe(TIMELINE_WIDTH);
  });

  it("이벤트 editorLane 3 → x TIMELINE_WIDTH + 2*EXTRA_LANE_WIDTH", () => {
    expect(layout.auxiliaryLaneRange(3).x).toBe(TIMELINE_WIDTH + 2 * EXTRA_LANE_WIDTH);
  });

  it("이벤트 editorLane 2와 보조 lane 6은 같은 두 번째 엑스트라 칸 x를 가리킨다 — 축은 달라도 기하는 일치", () => {
    expect(layout.auxiliaryLaneRange(2).x).toBe(laneToX(6, layout));
  });
});

it.each([[0, 350], [120, 410]])(
  '1000px 캔버스·32px 미니맵·song-common 폭 %ipx에서 메인 1번 중심은 x=%ipx이다',
  (commonWidth, expectedX) => {
    const config = getEditorTimelineLayoutConfig(2);
    const layout = createTimelineLayout({ ...config,
      ...(commonWidth ? { songCommonColumns: [{ id: 'timing', width: commonWidth }] } : {}),
    });
    const centerShiftX = getContentCenterShiftX({ viewportWidth: 1000, leftRailWidth: layout.measureRail.width,
      timelineWidth: layout.contentWidth, rightRailWidth: 32 });
    const offset = getTimelineContentOffsetX({ leftRailWidth: layout.measureRail.width, horizontalPanX: 0, centerShiftX });
    expect(offset + laneToX(1, layout) + laneWidth(1, layout) / 2).toBe(expectedX);
  },
);
