import { describe, expect, it } from "vitest";
import {
  clampHorizontalPan,
  clampVerticalScroll,
  getContentCenterShiftX,
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

describe("getContentCenterShiftX", () => {
  // 콘텐츠 블록 = 32(좌측 레일) + 240(레인 4개) = 272, 미니맵(우측 레일) 32 제외
  it("뷰포트(1000)가 콘텐츠 블록(272)보다 넓으면 미니맵 제외 남는 폭의 절반을 오프셋으로 준다", () => {
    // available = 1000 - 32 = 968, (968 - 272) / 2 = 348
    expect(getContentCenterShiftX({
      viewportWidth: 1000,
      leftRailWidth: 32,
      timelineWidth: 240,
      rightRailWidth: 32,
    })).toBe(348);
  });

  it("콘텐츠 블록이 가용 폭보다 넓으면 0을 반환해 중앙 정렬을 끈다", () => {
    // available = 300 - 32 = 268 < 블록 272 → 음수이므로 0
    expect(getContentCenterShiftX({
      viewportWidth: 300,
      leftRailWidth: 32,
      timelineWidth: 240,
      rightRailWidth: 32,
    })).toBe(0);
  });

  it("추가 레인으로 블록이 커지면 오프셋이 줄어든다", () => {
    // 레인영역 420 → 블록 452, available = 1000 - 32 = 968, (968 - 452) / 2 = 258
    expect(getContentCenterShiftX({
      viewportWidth: 1000,
      leftRailWidth: 32,
      timelineWidth: 420,
      rightRailWidth: 32,
    })).toBe(258);
  });

  it("가용 폭과 블록 폭이 같으면 오프셋은 0", () => {
    // available = 304 - 32 = 272 == 블록 272 → 0
    expect(getContentCenterShiftX({
      viewportWidth: 304,
      leftRailWidth: 32,
      timelineWidth: 240,
      rightRailWidth: 32,
    })).toBe(0);
  });

  it("홀수 남는 폭은 내림 처리한다", () => {
    // available = 1001 - 32 = 969, (969 - 272) / 2 = 348.5 → 348
    expect(getContentCenterShiftX({
      viewportWidth: 1001,
      leftRailWidth: 32,
      timelineWidth: 240,
      rightRailWidth: 32,
    })).toBe(348);
  });
});

describe("center-shift를 적용한 오프셋/레일 계산", () => {
  it("contentOffsetX에 center-shift가 더해진다", () => {
    expect(getTimelineContentOffsetX({ leftRailWidth: 32, horizontalPanX: 0, centerShiftX: 348 })).toBe(380);
    // center-shift 생략 시 기존 동작 유지
    expect(getTimelineContentOffsetX({ leftRailWidth: 32, horizontalPanX: 0 })).toBe(32);
  });

  it("마디 라벨 레이어가 center-shift만큼 우측으로 이동한다", () => {
    expect(getMeasureLabelLayerOffsetX({ leftRailWidth: 32, horizontalPanX: 0, centerShiftX: 348 })).toBe(380);
  });

  it("좌측 레일 히트 영역이 center-shift만큼 이동한다", () => {
    // 레일이 [348, 380) 범위로 이동
    expect(isFixedRailX({ screenX: 347, leftRailWidth: 32, railStartX: 348 })).toBe(false);
    expect(isFixedRailX({ screenX: 348, leftRailWidth: 32, railStartX: 348 })).toBe(true);
    expect(isFixedRailX({ screenX: 379, leftRailWidth: 32, railStartX: 348 })).toBe(true);
    expect(isFixedRailX({ screenX: 380, leftRailWidth: 32, railStartX: 348 })).toBe(false);
  });

  it("seek 영역: 이동한 좌측 레일과 좌측 여백 모두 인식한다", () => {
    // 이동한 레일
    expect(isPlaybackCursorSeekArea({
      screenX: 360, timelineX: -20, timelineWidth: 240, leftRailWidth: 32, railStartX: 348,
    })).toBe(true);
    // 중앙 정렬로 생긴 좌측 여백(레인 왼쪽 = timelineX < 0)도 seek 영역
    expect(isPlaybackCursorSeekArea({
      screenX: 10, timelineX: -370, timelineWidth: 240, leftRailWidth: 32, railStartX: 348,
    })).toBe(true);
    // 레인 영역 안(0 ≤ timelineX < timelineWidth)은 seek 영역 아님
    expect(isPlaybackCursorSeekArea({
      screenX: 500, timelineX: 100, timelineWidth: 240, leftRailWidth: 32, railStartX: 348,
    })).toBe(false);
  });
});
