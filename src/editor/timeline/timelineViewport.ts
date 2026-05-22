export function getTimelineContentOffsetX(input: {
  leftRailWidth: number;
  horizontalPanX: number;
}): number {
  return input.leftRailWidth - input.horizontalPanX;
}

export function screenXToTimelineX(input: {
  screenX: number;
  contentOffsetX: number;
}): number {
  return input.screenX - input.contentOffsetX;
}

export function clampHorizontalPan(input: {
  requestedPanX: number;
  timelineWidth: number;
  viewportWidth: number;
  leftRailWidth: number;
}): number {
  const bodyViewportWidth = Math.max(0, input.viewportWidth - input.leftRailWidth);
  const maxPanX = Math.max(0, input.timelineWidth - bodyViewportWidth);
  return Math.max(0, Math.min(maxPanX, input.requestedPanX));
}
