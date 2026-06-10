export interface PlaceholderPerspectiveSurfaceAltitudeInput {
  songTimeMs: number;
  chartDurationMs: number;
}

// Placeholder until altitude reacts to judgments: misses drop, hits recover slowly.
export function derivePlaceholderPerspectiveSurfaceAltitude({
  songTimeMs,
  chartDurationMs,
}: PlaceholderPerspectiveSurfaceAltitudeInput): number {
  if (!Number.isFinite(chartDurationMs) || chartDurationMs <= 0) return 1;

  return clamp01(1 - songTimeMs / chartDurationMs);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.min(1, Math.max(0, value));
}
