/**
 * 콘텐츠 블록(마디 레일 + 레인 영역)을 가로 중앙 정렬하기 위한 추가 오프셋(px).
 *
 * 미니맵(우측 레일)을 제외한 가용 폭이 콘텐츠 블록보다 넓으면 남는 공간의 절반을
 * 오프셋으로 돌려준다. 콘텐츠가 가용 폭보다 넓으면(추가 레인이 많은 경우) 0을
 * 돌려주어 중앙 정렬 없이 가로 팬에 맡긴다.
 */
export function getContentCenterShiftX(input: {
  viewportWidth: number;
  leftRailWidth: number;
  timelineWidth: number;
  rightRailWidth: number;
}): number {
  const blockWidth = input.leftRailWidth + input.timelineWidth;
  const availableWidth = input.viewportWidth - input.rightRailWidth;
  return Math.max(0, Math.floor((availableWidth - blockWidth) / 2));
}

export function getTimelineContentOffsetX(input: {
  leftRailWidth: number;
  horizontalPanX: number;
  centerShiftX?: number;
}): number {
  return input.leftRailWidth + (input.centerShiftX ?? 0) - input.horizontalPanX;
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
  centerShiftX?: number;
}): number {
  void input.horizontalPanX;
  return input.leftRailWidth + (input.centerShiftX ?? 0);
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
  railStartX?: number;
}): boolean {
  const start = input.railStartX ?? 0;
  return input.screenX >= start && input.screenX < start + input.leftRailWidth;
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
  railStartX?: number;
}): boolean {
  // 레인 영역(0 ≤ timelineX < timelineWidth) 밖이면 seek 영역.
  // - 왼쪽: 레인 왼쪽 전체(중앙 정렬로 생긴 좌측 여백 + 마디 레일)
  // - 오른쪽: 레인 오른쪽 전체
  // 가로 팬 중에는 화면 고정 레일도 seek 영역으로 인정한다.
  return isFixedRailX({
    screenX: input.screenX,
    leftRailWidth: input.leftRailWidth,
    railStartX: input.railStartX,
  }) || input.timelineX < 0 || input.timelineX >= input.timelineWidth;
}

export function clampVerticalScroll(input: {
  requestedScrollY: number;
  timelineHeight: number;
  viewportHeight: number;
}): number {
  const maxScrollY = Math.max(0, input.timelineHeight - input.viewportHeight);
  return Math.max(0, Math.min(maxScrollY, input.requestedScrollY));
}
