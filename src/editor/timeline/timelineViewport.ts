export function getTimelineContentOffsetX(input: {
  leftRailWidth: number;
  horizontalPanX: number;
}): number {
  return input.leftRailWidth - input.horizontalPanX;
}

export function getFixedTimelineOverlayOffsetX(input: {
  horizontalPanX: number;
}): number {
  void input.horizontalPanX;
  return 0;
}

export function getMeasureLabelLayerOffsetX(input: {
  leftRailWidth: number;
  horizontalPanX: number;
}): number {
  void input.horizontalPanX;
  return input.leftRailWidth;
}

export function shouldRenderPlaybackCursorHandle(): boolean {
  return false;
}

export function getPlaybackCursorLineEndX(input: {
  viewportWidth: number;
  horizontalPanX: number;
}): number {
  void input.horizontalPanX;
  return input.viewportWidth;
}

export function getTimelineContentViewportRect(input: {
  viewportWidth: number;
  viewportHeight: number;
  leftRailWidth: number;
  rightRailWidth: number;
}): { x: number; y: number; width: number; height: number } {
  return {
    x: input.leftRailWidth,
    y: 0,
    width: Math.max(0, input.viewportWidth - input.leftRailWidth - input.rightRailWidth),
    height: input.viewportHeight,
  };
}

export function screenXToTimelineX(input: {
  screenX: number;
  contentOffsetX: number;
}): number {
  return input.screenX - input.contentOffsetX;
}

export function isFixedRailX(input: {
  screenX: number;
  leftRailWidth: number;
}): boolean {
  return input.screenX >= 0 && input.screenX < input.leftRailWidth;
}

export function isRightRailX(input: {
  screenX: number;
  viewportWidth: number;
  railWidth: number;
}): boolean {
  return input.screenX >= input.viewportWidth - input.railWidth && input.screenX < input.viewportWidth;
}

export function clampHorizontalPan(input: {
  requestedPanX: number;
  timelineWidth: number;
  viewportWidth: number;
  leftRailWidth: number;
  rightRailWidth?: number;
}): number {
  const bodyViewportWidth = Math.max(
    0,
    input.viewportWidth - input.leftRailWidth - (input.rightRailWidth ?? 0),
  );
  const maxPanX = Math.max(0, input.timelineWidth - bodyViewportWidth);
  return Math.max(0, Math.min(maxPanX, input.requestedPanX));
}

export function isPlaybackCursorSeekArea(input: {
  screenX: number;
  timelineX: number;
  timelineWidth: number;
  leftRailWidth: number;
}): boolean {
  return isFixedRailX({
    screenX: input.screenX,
    leftRailWidth: input.leftRailWidth,
  }) || input.timelineX >= input.timelineWidth;
}

export function clampVerticalScroll(input: {
  requestedScrollY: number;
  timelineHeight: number;
  viewportHeight: number;
}): number {
  const maxScrollY = Math.max(0, input.timelineHeight - input.viewportHeight);
  return Math.max(0, Math.min(maxScrollY, input.requestedScrollY));
}
