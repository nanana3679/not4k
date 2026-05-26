import type { Beat, Lane } from "../../shared";

export function timelineXToLane(input: {
  timelineX: number;
  laneWidth: number;
  laneCount: number;
}): Lane | null {
  if (input.timelineX < 0 || input.laneWidth <= 0 || input.laneCount <= 0) return null;
  const lane = Math.floor(input.timelineX / input.laneWidth) + 1;
  if (lane < 1 || lane > input.laneCount) return null;
  return lane as Lane;
}

export function timelineXToExtraLane(input: {
  timelineX: number;
  timelineWidth: number;
  extraLaneWidth: number;
  extraLaneCount: number;
}): number | null {
  if (input.extraLaneCount <= 0 || input.extraLaneWidth <= 0) return null;
  if (input.timelineX < input.timelineWidth) return null;
  const lane = Math.floor((input.timelineX - input.timelineWidth) / input.extraLaneWidth) + 1;
  if (lane < 1 || lane > input.extraLaneCount) return null;
  return lane;
}

export function getTimelineTotalHeight(input: {
  totalTimelineMs: number;
  minTimeMs: number;
  zoom: number;
  padding: number;
}): number {
  return ((input.totalTimelineMs - input.minTimeMs) * input.zoom) / 1000 + input.padding * 2;
}

export function getTimelineContentHeight(input: {
  totalTimelineHeight: number;
  viewportHeight: number;
}): number {
  return Math.max(input.totalTimelineHeight, input.viewportHeight);
}

export function timeToTimelineY(input: {
  timeMs: number;
  contentHeight: number;
  padding: number;
  zoom: number;
  minTimeMs: number;
}): number {
  return input.contentHeight - input.padding - ((input.timeMs - input.minTimeMs) * input.zoom) / 1000;
}

export function screenYToTimelineTime(input: {
  screenY: number;
  scrollY: number;
  contentHeight: number;
  padding: number;
  zoom: number;
  minTimeMs: number;
}): number {
  const contentY = input.screenY + input.scrollY;
  return ((input.contentHeight - input.padding - contentY) * 1000) / input.zoom + input.minTimeMs;
}

export function getVisibleTimelineTimeRange(input: {
  scrollY: number;
  viewportHeight: number;
  contentHeight: number;
  padding: number;
  zoom: number;
  minTimeMs: number;
  marginRatio?: number;
}): { minTimeMs: number; maxTimeMs: number } {
  const margin = input.viewportHeight * (input.marginRatio ?? 0.5);
  const viewTopY = input.scrollY - margin;
  const viewBottomY = input.scrollY + input.viewportHeight + margin;

  const maxTimeMs = ((input.contentHeight - input.padding - viewTopY) * 1000) / input.zoom + input.minTimeMs;
  const rawMinTimeMs = ((input.contentHeight - input.padding - viewBottomY) * 1000) / input.zoom + input.minTimeMs;

  return {
    minTimeMs: Math.max(input.minTimeMs, rawMinTimeMs),
    maxTimeMs,
  };
}

export function beatFloatToSnapBeat(input: {
  beatFloat: number;
  snapDivision: number;
}): Beat {
  const grid = 4 / input.snapDivision;
  const k = Math.round(input.beatFloat / grid);
  return { n: k * 4, d: input.snapDivision };
}

export function beatFloatToRawBeat(input: {
  beatFloat: number;
  resolution?: number;
}): Beat {
  const d = input.resolution ?? 960;
  return { n: Math.round(input.beatFloat * d), d };
}
