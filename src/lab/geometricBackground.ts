export const MIN_ALTITUDE = 0;
export const MAX_ALTITUDE = 1;
export const CENTRAL_LANE_OPACITY = 1;

export interface GeometricBackgroundRangeParams {
  tileSizeMinPx: number;
  tileSizeMaxPx: number;
  parallaxSpeedMinPxPerSec: number;
  parallaxSpeedMaxPxPerSec: number;
  forwardLightIntensityMin: number;
  forwardLightIntensityMax: number;
  forwardLightHeightMinPercent: number;
  forwardLightHeightMaxPercent: number;
}

export type GeometricBackgroundRangeInput = Partial<GeometricBackgroundRangeParams>;

export const DEFAULT_GEOMETRIC_BACKGROUND_RANGES: GeometricBackgroundRangeParams = {
  tileSizeMinPx: 48,
  tileSizeMaxPx: 180,
  parallaxSpeedMinPxPerSec: 8,
  parallaxSpeedMaxPxPerSec: 88,
  forwardLightIntensityMin: 0,
  forwardLightIntensityMax: 0.62,
  forwardLightHeightMinPercent: 26,
  forwardLightHeightMaxPercent: 62,
};

export interface GeometricBackgroundParams extends GeometricBackgroundRangeParams {
  altitude: number;
  tileSizePx: number;
  parallaxSpeedPxPerSec: number;
  forwardLightOpacity: number;
  forwardLightHeightPercent: number;
  surfaceCometOpacity: number;
  surfaceCometHeadRadiusPx: number;
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

export interface SurfaceCoordinate {
  u: number;
  v: number;
}

export interface SurfaceProjectionParams {
  horizonYPercent: number;
}

export interface SurfaceProjectedPoint extends SurfaceCoordinate {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  tangentX: number;
  tangentY: number;
  normalX: number;
  normalY: number;
}

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
    2000,
  );
  const [forwardLightIntensityMin, forwardLightIntensityMax] = normalizeClampedRange(
    input.forwardLightIntensityMin,
    input.forwardLightIntensityMax,
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES.forwardLightIntensityMin,
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES.forwardLightIntensityMax,
    0,
    1,
  );
  const [forwardLightHeightMinPercent, forwardLightHeightMaxPercent] = normalizeClampedRange(
    input.forwardLightHeightMinPercent,
    input.forwardLightHeightMaxPercent,
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES.forwardLightHeightMinPercent,
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES.forwardLightHeightMaxPercent,
    0,
    100,
  );

  return {
    altitude: clampedAltitude,
    tileSizePx: lerp(tileSizeMinPx, tileSizeMaxPx, lowAltitudeFactor),
    tileSizeMinPx,
    tileSizeMaxPx,
    parallaxSpeedPxPerSec: lerp(parallaxSpeedMinPxPerSec, parallaxSpeedMaxPxPerSec, lowAltitudeFactor),
    parallaxSpeedMinPxPerSec,
    parallaxSpeedMaxPxPerSec,
    forwardLightIntensityMin,
    forwardLightIntensityMax,
    forwardLightOpacity: lerp(forwardLightIntensityMin, forwardLightIntensityMax, lowAltitudeFactor),
    forwardLightHeightMinPercent,
    forwardLightHeightMaxPercent,
    forwardLightHeightPercent: lerp(forwardLightHeightMinPercent, forwardLightHeightMaxPercent, lowAltitudeFactor),
    surfaceCometOpacity: lerp(0.52, 0.88, lowAltitudeFactor),
    surfaceCometHeadRadiusPx: lerp(0.3, 0.72, lowAltitudeFactor),
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

export function projectSurfaceCoordinate(
  coordinate: SurfaceCoordinate,
  params: SurfaceProjectionParams,
): SurfaceProjectedPoint {
  const u = Number.isFinite(coordinate.u) ? coordinate.u : 50;
  const v = clampNumber(coordinate.v, 0.01, 0.99, 0.01);
  const horizonYPercent = clampNumber(params.horizonYPercent, -120, 140, 18);
  const point = projectSurfacePosition(u, v, horizonYPercent);
  const before = projectSurfacePosition(u - 1, v, horizonYPercent);
  const after = projectSurfacePosition(u + 1, v, horizonYPercent);
  const tangent = normalizeVector(after.x - before.x, after.y - before.y);

  return {
    u,
    v,
    x: point.x,
    y: point.y,
    scale: point.scale,
    alpha: Math.min(1, Math.max(0, 0.12 + v * 0.88)),
    tangentX: tangent.x,
    tangentY: tangent.y,
    normalX: -tangent.y,
    normalY: tangent.x,
  };
}

export function getSurfaceRowPoints(
  v: number,
  uSamples: number[],
  params: SurfaceProjectionParams,
): SurfaceProjectedPoint[] {
  return uSamples.map((u) => projectSurfaceCoordinate({ u, v }, params));
}

export function getSurfaceColumnPoints(
  u: number,
  vSamples: number[],
  params: SurfaceProjectionParams,
): SurfaceProjectedPoint[] {
  return vSamples.map((v) => projectSurfaceCoordinate({ u, v }, params));
}

function lerp(from: number, to: number, factor: number): number {
  return from + (to - from) * factor;
}

function projectSurfacePosition(u: number, v: number, horizonYPercent: number) {
  const scale = 0.04 + v ** 0.86 * 0.96;
  const x = 50 + (u - 50) * scale;
  const baseY = horizonYPercent + (100 - horizonYPercent) * v;
  const edgeDrop = 7.5 * (1 - v);
  const bendLift = 18 * v * (1 - v);
  const edgeY = baseY + edgeDrop;
  const centerY = baseY - bendLift;
  const t = Math.min(1, Math.max(0, (x + 8) / 116));

  return {
    x,
    y: cubicBezier(edgeY, centerY, centerY, edgeY, t),
    scale,
  };
}

function normalizeVector(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length === 0) return { x: 1, y: 0 };

  return { x: x / length, y: y / length };
}

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const inverse = 1 - t;
  return inverse ** 3 * p0
    + 3 * inverse ** 2 * t * p1
    + 3 * inverse * t ** 2 * p2
    + t ** 3 * p3;
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
