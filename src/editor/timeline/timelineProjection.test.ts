import { describe, expect, it } from "vitest";
import {
  beatFloatToRawBeat,
  beatFloatToSnapBeat,
  getTimelineContentHeight,
  getTimelineTotalHeight,
  getVisibleTimelineTimeRange,
  screenYToTimelineTime,
  timeToTimelineY,
  timelineXToExtraLane,
  timelineXToLane,
} from "./timelineProjection";

describe("timeline projection geometry", () => {
  it("projects timeline-local x into main lanes with boundary-safe nulls", () => {
    expect(timelineXToLane({ timelineX: -1, laneWidth: 60, laneCount: 4 })).toBeNull();
    expect(timelineXToLane({ timelineX: 0, laneWidth: 60, laneCount: 4 })).toBe(1);
    expect(timelineXToLane({ timelineX: 59.9, laneWidth: 60, laneCount: 4 })).toBe(1);
    expect(timelineXToLane({ timelineX: 60, laneWidth: 60, laneCount: 4 })).toBe(2);
    expect(timelineXToLane({ timelineX: 239.9, laneWidth: 60, laneCount: 4 })).toBe(4);
    expect(timelineXToLane({ timelineX: 240, laneWidth: 60, laneCount: 4 })).toBeNull();
  });

  it("projects timeline-local x into extra lanes after the main timeline", () => {
    expect(timelineXToExtraLane({
      timelineX: 240,
      timelineWidth: 240,
      extraLaneWidth: 60,
      extraLaneCount: 0,
    })).toBeNull();

    expect(timelineXToExtraLane({
      timelineX: 239.9,
      timelineWidth: 240,
      extraLaneWidth: 60,
      extraLaneCount: 2,
    })).toBeNull();
    expect(timelineXToExtraLane({
      timelineX: 240,
      timelineWidth: 240,
      extraLaneWidth: 60,
      extraLaneCount: 2,
    })).toBe(1);
    expect(timelineXToExtraLane({
      timelineX: 299.9,
      timelineWidth: 240,
      extraLaneWidth: 60,
      extraLaneCount: 2,
    })).toBe(1);
    expect(timelineXToExtraLane({
      timelineX: 300,
      timelineWidth: 240,
      extraLaneWidth: 60,
      extraLaneCount: 2,
    })).toBe(2);
    expect(timelineXToExtraLane({
      timelineX: 360,
      timelineWidth: 240,
      extraLaneWidth: 60,
      extraLaneCount: 2,
    })).toBeNull();
  });

  it("keeps time/y projection invertible while accounting for scroll", () => {
    const totalHeight = getTimelineTotalHeight({
      totalTimelineMs: 4000,
      minTimeMs: 0,
      zoom: 200,
      padding: 50,
    });
    expect(totalHeight).toBe(900);
    expect(getTimelineContentHeight({ totalTimelineHeight: totalHeight, viewportHeight: 640 })).toBe(900);

    const y = timeToTimelineY({
      timeMs: 1000,
      contentHeight: 900,
      padding: 50,
      zoom: 200,
      minTimeMs: 0,
    });
    expect(y).toBe(650);

    expect(screenYToTimelineTime({
      screenY: 550,
      scrollY: 100,
      contentHeight: 900,
      padding: 50,
      zoom: 200,
      minTimeMs: 0,
    })).toBe(1000);
  });

  it("preserves negative audio offsets in the vertical projection", () => {
    const totalHeight = getTimelineTotalHeight({
      totalTimelineMs: 4000,
      minTimeMs: -500,
      zoom: 100,
      padding: 50,
    });
    expect(totalHeight).toBe(550);

    expect(timeToTimelineY({
      timeMs: -500,
      contentHeight: 600,
      padding: 50,
      zoom: 100,
      minTimeMs: -500,
    })).toBe(550);
    expect(timeToTimelineY({
      timeMs: 0,
      contentHeight: 600,
      padding: 50,
      zoom: 100,
      minTimeMs: -500,
    })).toBe(500);
  });

  it("derives the visible time range from scroll and viewport geometry", () => {
    expect(getVisibleTimelineTimeRange({
      scrollY: 200,
      viewportHeight: 400,
      contentHeight: 1000,
      padding: 50,
      zoom: 100,
      minTimeMs: 0,
      marginRatio: 0.5,
    })).toEqual({
      minTimeMs: 1500,
      maxTimeMs: 9500,
    });
  });

  it("converts beat floats into snapped and raw beat values", () => {
    expect(beatFloatToSnapBeat({ beatFloat: 1.24, snapDivision: 16 })).toEqual({ n: 20, d: 16 });
    expect(beatFloatToSnapBeat({ beatFloat: 1.26, snapDivision: 16 })).toEqual({ n: 20, d: 16 });
    expect(beatFloatToSnapBeat({ beatFloat: 1.38, snapDivision: 16 })).toEqual({ n: 24, d: 16 });
    expect(beatFloatToRawBeat({ beatFloat: 1.2344, resolution: 960 })).toEqual({ n: 1185, d: 960 });
  });

  // 구 SnapZoomController.snapBeat 테이블 이식 (컨트롤러 폐기 — 스냅 수학의 단일 소유자는 이 함수)
  it("snap=4에서 1박 단위, 중간값(0.5)은 올림 방향 박으로 스냅", () => {
    expect(beatFloatToSnapBeat({ beatFloat: 0.9, snapDivision: 4 })).toEqual({ n: 4, d: 4 });
    expect(beatFloatToSnapBeat({ beatFloat: 0.5, snapDivision: 4 })).toEqual({ n: 4, d: 4 });
  });

  it("snap=8에서 반박(0.5박) 단위로 스냅", () => {
    expect(beatFloatToSnapBeat({ beatFloat: 0.7, snapDivision: 8 })).toEqual({ n: 4, d: 8 });
  });

  it("snap=1(온음표)에서 4박 단위로 스냅", () => {
    expect(beatFloatToSnapBeat({ beatFloat: 5, snapDivision: 1 })).toEqual({ n: 4, d: 1 });
  });
});
