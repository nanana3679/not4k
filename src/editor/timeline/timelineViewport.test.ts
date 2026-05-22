import { describe, expect, it } from "vitest";
import {
  clampHorizontalPan,
  getTimelineContentOffsetX,
  isFixedRailX,
  screenXToTimelineX,
  shouldRevealMinimapFromEdgeSwipe,
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

  it("reveals the minimap only for a rightward swipe from the screen edge", () => {
    expect(shouldRevealMinimapFromEdgeSwipe({
      startX: 8,
      startY: 120,
      currentX: 36,
      currentY: 124,
      edgeWidth: 16,
      revealDistance: 24,
    })).toBe(true);

    expect(shouldRevealMinimapFromEdgeSwipe({
      startX: 24,
      startY: 120,
      currentX: 60,
      currentY: 121,
      edgeWidth: 16,
      revealDistance: 24,
    })).toBe(false);

    expect(shouldRevealMinimapFromEdgeSwipe({
      startX: 8,
      startY: 120,
      currentX: 18,
      currentY: 122,
      edgeWidth: 16,
      revealDistance: 24,
    })).toBe(false);

    expect(shouldRevealMinimapFromEdgeSwipe({
      startX: 8,
      startY: 120,
      currentX: 40,
      currentY: 170,
      edgeWidth: 16,
      revealDistance: 24,
    })).toBe(false);
  });
});
