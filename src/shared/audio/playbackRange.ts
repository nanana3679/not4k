export interface PlaybackRange {
  startTime: number;
  endTime: number;
  fadeInTime: number;
  fadeOutTime: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizePlaybackRange(
  range: PlaybackRange | null | undefined,
  durationSeconds: number,
): PlaybackRange | null {
  if (!range || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const startTime = clamp(finiteOr(range.startTime, 0), 0, durationSeconds);
  const endTime = clamp(finiteOr(range.endTime, durationSeconds), 0, durationSeconds);
  if (endTime <= startTime) {
    return null;
  }

  const rangeDuration = endTime - startTime;
  const maxFade = rangeDuration / 2;

  return {
    startTime,
    endTime,
    fadeInTime: clamp(finiteOr(range.fadeInTime, 0), 0, maxFade),
    fadeOutTime: clamp(finiteOr(range.fadeOutTime, 0), 0, maxFade),
  };
}
