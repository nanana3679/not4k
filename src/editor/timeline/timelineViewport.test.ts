import { describe, expect, it } from "vitest";
import {
  clampHorizontalPan,
  clampVerticalScroll,
  getFixedTimelineOverlayOffsetX,
  getMeasureLabelLayerOffsetX,
  getPlaybackCursorLineEndX,
  getTimelineContentViewportRect,
  getTimelineContentOffsetX,
  isFixedRailX,
  isPlaybackCursorSeekArea,
  isRightRailX,
  screenXToTimelineX,
  shouldRenderPlaybackCursorHandle,
} from "./timelineViewport";

describe("timeline viewport geometry", () => {
  it("keeps the timeline content anchored after the fixed left rail", () => {
    expect(getTimelineContentOffsetX({ leftRailWidth: 32, horizontalPanX: 0 })).toBe(32);
    expect(getTimelineContentOffsetX({ leftRailWidth: 32, horizontalPanX: 120 })).toBe(-88);
  });

  it("keeps cursor and measure-number screen layers independent from horizontal pan", () => {
    expect(getFixedTimelineOverlayOffsetX({ horizontalPanX: 0 })).toBe(0);
    expect(getFixedTimelineOverlayOffsetX({ horizontalPanX: 120 })).toBe(0);

    expect(getMeasureLabelLayerOffsetX({ leftRailWidth: 32, horizontalPanX: 0 })).toBe(32);
    expect(getMeasureLabelLayerOffsetX({ leftRailWidth: 32, horizontalPanX: 120 })).toBe(32);

    expect(getPlaybackCursorLineEndX({ viewportWidth: 360, horizontalPanX: 0 })).toBe(360);
    expect(getPlaybackCursorLineEndX({ viewportWidth: 360, horizontalPanX: 120 })).toBe(360);
  });

  it("omits the triangular playback cursor handle", () => {
    expect(shouldRenderPlaybackCursorHandle()).toBe(false);
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

  it("reserves the fixed right rail for the minimap", () => {
    expect(getTimelineContentViewportRect({
      viewportWidth: 360,
      viewportHeight: 640,
      leftRailWidth: 32,
      rightRailWidth: 32,
    })).toEqual({ x: 32, y: 0, width: 296, height: 640 });

    expect(clampHorizontalPan({
      requestedPanX: 999,
      timelineWidth: 360,
      viewportWidth: 360,
      leftRailWidth: 32,
      rightRailWidth: 32,
    })).toBe(64);
  });

  it("keeps fixed-rail pointer capture out of lane 1", () => {
    expect(isFixedRailX({ screenX: 31, leftRailWidth: 32 })).toBe(true);
    expect(isFixedRailX({ screenX: 33, leftRailWidth: 32 })).toBe(false);
  });

  it("detects the fixed right rail for minimap interaction", () => {
    expect(isRightRailX({ screenX: 327, viewportWidth: 360, railWidth: 32 })).toBe(false);
    expect(isRightRailX({ screenX: 328, viewportWidth: 360, railWidth: 32 })).toBe(true);
    expect(isRightRailX({ screenX: 359, viewportWidth: 360, railWidth: 32 })).toBe(true);
    expect(isRightRailX({ screenX: 360, viewportWidth: 360, railWidth: 32 })).toBe(false);
  });

  it("treats the fixed left rail as a playback cursor seek area", () => {
    expect(isPlaybackCursorSeekArea({
      screenX: 24,
      timelineX: -8,
      timelineWidth: 240,
      leftRailWidth: 32,
    })).toBe(true);

    expect(isPlaybackCursorSeekArea({
      screenX: 120,
      timelineX: 88,
      timelineWidth: 240,
      leftRailWidth: 32,
    })).toBe(false);

    expect(isPlaybackCursorSeekArea({
      screenX: 300,
      timelineX: 268,
      timelineWidth: 240,
      leftRailWidth: 32,
    })).toBe(true);
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
