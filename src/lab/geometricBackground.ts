export const MIN_ALTITUDE = 0;
export const MAX_ALTITUDE = 1;
export const CENTRAL_LANE_OPACITY = 1;

export interface GeometricBackgroundRangeParams {
  tileSizeMinPx: number;
  tileSizeMaxPx: number;
  parallaxSpeedMinPxPerSec: number;
  parallaxSpeedMaxPxPerSec: number;
}

export type GeometricBackgroundRangeInput = Partial<GeometricBackgroundRangeParams>;

export const DEFAULT_GEOMETRIC_BACKGROUND_RANGES: GeometricBackgroundRangeParams = {
  tileSizeMinPx: 48,
  tileSizeMaxPx: 180,
  parallaxSpeedMinPxPerSec: 8,
  parallaxSpeedMaxPxPerSec: 88,
};

export interface GeometricBackgroundParams extends GeometricBackgroundRangeParams {
  altitude: number;
  tileSizePx: number;
  parallaxSpeedPxPerSec: number;
  horizonOpacity: number;
  horizonTopPercent: number;
  groundTopPercent: number;
}

export interface FunnelGridParams {
  vanishingPointXPercent: number;
  vanishingPointYPercent: number;
  vanishingPointYMinPercent: number;
  vanishingPointYMaxPercent: number;
  curvature: number;
  radiusPercent: number;
}

export type FunnelGridParamInput = Partial<FunnelGridParams>;

export interface NumericRange {
  min: number;
  max: number;
}

export type RangeBoundary = keyof NumericRange;

export const DEFAULT_FUNNEL_GRID_PARAMS: FunnelGridParams = {
  vanishingPointXPercent: 50,
  vanishingPointYPercent: 18,
  vanishingPointYMinPercent: -80,
  vanishingPointYMaxPercent: 18,
  curvature: 0.65,
  radiusPercent: 92,
};

export function clampAltitude(altitude: number): number {
  if (!Number.isFinite(altitude)) return MAX_ALTITUDE;
  return Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, altitude));
}

export function getGeometricBackgroundParams(
  altitude: number,
  input: GeometricBackgroundRangeInput = {},
): GeometricBackgroundParams {
  const clampedAltitude = clampAltitude(altitude);
  const lowAltitudeFactor = 1 - clampedAltitude;
  const [tileSizeMinPx, tileSizeMaxPx] = normalizeClampedRange(
    input.tileSizeMinPx,
    input.tileSizeMaxPx,
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES.tileSizeMinPx,
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES.tileSizeMaxPx,
    24,
    320,
  );
  const [parallaxSpeedMinPxPerSec, parallaxSpeedMaxPxPerSec] = normalizeClampedRange(
    input.parallaxSpeedMinPxPerSec,
    input.parallaxSpeedMaxPxPerSec,
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES.parallaxSpeedMinPxPerSec,
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES.parallaxSpeedMaxPxPerSec,
    0,
    180,
  );

  return {
    altitude: clampedAltitude,
    tileSizePx: lerp(tileSizeMinPx, tileSizeMaxPx, lowAltitudeFactor),
    tileSizeMinPx,
    tileSizeMaxPx,
    parallaxSpeedPxPerSec: lerp(parallaxSpeedMinPxPerSec, parallaxSpeedMaxPxPerSec, lowAltitudeFactor),
    parallaxSpeedMinPxPerSec,
    parallaxSpeedMaxPxPerSec,
    horizonOpacity: lerp(0.35, 1, clampedAltitude),
    horizonTopPercent: lerp(-18, 30, clampedAltitude),
    groundTopPercent: lerp(-15, 33, clampedAltitude),
  };
}

export function getFunnelGridParams(input: FunnelGridParamInput = {}, altitude = 1): FunnelGridParams {
  const [vanishingPointYMinPercent, vanishingPointYMaxPercent] = normalizeClampedRange(
    input.vanishingPointYMinPercent,
    input.vanishingPointYMaxPercent,
    DEFAULT_FUNNEL_GRID_PARAMS.vanishingPointYMinPercent,
    DEFAULT_FUNNEL_GRID_PARAMS.vanishingPointYMaxPercent,
    -80,
    120,
  );
  const clampedAltitude = clampAltitude(altitude);

  return {
    vanishingPointXPercent: clampNumber(
      input.vanishingPointXPercent,
      0,
      100,
      DEFAULT_FUNNEL_GRID_PARAMS.vanishingPointXPercent,
    ),
    vanishingPointYPercent: lerp(vanishingPointYMinPercent, vanishingPointYMaxPercent, clampedAltitude),
    vanishingPointYMinPercent,
    vanishingPointYMaxPercent,
    curvature: clampNumber(
      input.curvature,
      0,
      1,
      DEFAULT_FUNNEL_GRID_PARAMS.curvature,
    ),
    radiusPercent: clampNumber(
      input.radiusPercent,
      28,
      180,
      DEFAULT_FUNNEL_GRID_PARAMS.radiusPercent,
    ),
  };
}

export function updateRangeBoundary(range: NumericRange, boundary: RangeBoundary, value: number): NumericRange {
  if (boundary === "min") {
    return {
      min: Math.min(value, range.max),
      max: range.max,
    };
  }

  return {
    min: range.min,
    max: Math.max(value, range.min),
  };
}

export function getRadiatingFlowPhasePx(phasePx: number, ringGapPx: number): number {
  if (!Number.isFinite(phasePx) || !Number.isFinite(ringGapPx) || ringGapPx <= 0) return 0;
  return ((phasePx % ringGapPx) + ringGapPx) % ringGapPx;
}

export function getPerspectiveSurfaceDepths(lineCount: number, exponent = 2.55, phase = 0): number[] {
  const count = Math.min(80, Math.max(2, Math.floor(Number.isFinite(lineCount) ? lineCount : 2)));
  const power = clampNumber(exponent, 1.01, 6, 2.55);
  const normalizedPhase = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;

  return Array.from({ length: count }, (_, index) => {
    const linearDepth = Math.min(1, ((index + normalizedPhase) % count) / (count - 1));
    return Math.pow(linearDepth, power);
  }).sort((a, b) => a - b);
}

function lerp(from: number, to: number, factor: number): number {
  return from + (to - from) * factor;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeClampedRange(
  minValue: number | undefined,
  maxValue: number | undefined,
  defaultMin: number,
  defaultMax: number,
  lowerBound: number,
  upperBound: number,
): [number, number] {
  const min = clampNumber(minValue, lowerBound, upperBound, defaultMin);
  const max = clampNumber(maxValue, lowerBound, upperBound, defaultMax);
  return min <= max ? [min, max] : [max, min];
}
