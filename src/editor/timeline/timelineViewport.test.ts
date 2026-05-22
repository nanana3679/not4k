import { describe, expect, it } from "vitest";
import {
  clampHorizontalPan,
  clampVerticalScroll,
  getTimelineContentOffsetX,
  isFixedRailX,
  screenXToTimelineX,
} from "./timelineViewport";

describe("timeline viewport geometry", () => {
  it("keeps the timeline content anchored after the fixed left rail", () => {
    expect(getTimelineContentOffsetX({ leftRailWidth: 32, horizontalPanX: 0 })).toBe(32);
    expect(getTimelineContentOffsetX({ leftRailWidth: 32, horizontalPanX: 120 })).toBe(-88);
  });

  it("converts screen x to timeline-local x using the content offset", () => {
    expect(screenXToTimelineX({ screenX: 92, contentOffsetX: 32 })).toBe(60);
    expect(screenXToTimelineX({ screenX: 92, contentOffsetX: -88 })).toBe(180);
  });

  it("clamps horizontal pan to the content that exceeds the body viewport", () => {
    expect(clampHorizontalPan({
      requestedPanX: -10,
      timelineWidth: 600,
      viewportWidth: 360,
      leftRailWidth: 32,
    })).toBe(0);

    expect(clampHorizontalPan({
      requestedPanX: 500,
      timelineWidth: 600,
      viewportWidth: 360,
      leftRailWidth: 32,
    })).toBe(272);
  });

  it("keeps fixed-rail pointer capture out of lane 1", () => {
    expect(isFixedRailX({ screenX: 31, leftRailWidth: 32 })).toBe(true);
    expect(isFixedRailX({ screenX: 33, leftRailWidth: 32 })).toBe(false);
  });

  it("clamps vertical pan to the scrollable timeline range", () => {
    expect(clampVerticalScroll({
      requestedScrollY: -20,
      timelineHeight: 1000,
      viewportHeight: 360,
    })).toBe(0);

    expect(clampVerticalScroll({
      requestedScrollY: 700,
      timelineHeight: 1000,
      viewportHeight: 360,
    })).toBe(640);
  });
});
