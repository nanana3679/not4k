export interface GroundPoint {
  x: number;
  z: number;
}

export interface PerspectiveSurfaceGridSpanPosition {
  x: number;
  z: number;
}

export interface PerspectiveSurfaceGridSpanCell {
  column: number;
  row: number;
}

export interface PerspectiveSurfaceGridSpanGridSize {
  columns: number;
  rows: number;
}

export interface PerspectiveSurfaceGridParams {
  horizonYPercent: number;
  cameraHeight: number;
  fieldOfView: number;
  surfaceAngleDeg: number;
  radialVanishingYPercent: number;
  radialVanishingZ: number;
  radialStrength: number;
  gridSpacing: number;
  gridCount: number;
  scrollSpeed: number;
  scrollOffsetZ: number;
  forwardLightOpacity: number;
  forwardLightHeightPercent: number;
  xMin: number;
  xMax: number;
  zNear: number;
  zFar: number;
}

export type PerspectiveSurfaceGridInput = Partial<PerspectiveSurfaceGridParams>;
export type PerspectiveSurfaceGridAltitudeRangeKey =
  | "horizonYPercent"
  | "cameraHeight"
  | "fieldOfView"
  | "surfaceAngleDeg"
  | "radialVanishingYPercent"
  | "radialVanishingZ"
  | "radialStrength"
  | "gridSpacing"
  | "gridCount"
  | "scrollSpeed"
  | "forwardLightOpacity"
  | "forwardLightHeightPercent"
  | "zFar";

export interface PerspectiveSurfaceGridNumberRange {
  altitude0: number;
  altitude1: number;
}

export type PerspectiveSurfaceGridAltitudeRanges = Record<
  PerspectiveSurfaceGridAltitudeRangeKey,
  PerspectiveSurfaceGridNumberRange
>;

export interface ProjectedGroundPoint extends GroundPoint {
  screenXPercent: number;
  screenYPercent: number;
  scale: number;
  alpha: number;
}

export interface PerspectiveSurfaceGridLine {
  id: string;
  x?: number;
  z?: number;
  points: ProjectedGroundPoint[];
  path: string;
}

export interface PerspectiveSurfaceGrid {
  params: PerspectiveSurfaceGridParams;
  rows: PerspectiveSurfaceGridLine[];
  columns: PerspectiveSurfaceGridLine[];
}

export interface PerspectiveSurfaceGridObjectTrailSegment {
  start: ProjectedGroundPoint;
  end: ProjectedGroundPoint;
  path: string;
  alpha: number;
}

export interface PerspectiveSurfaceGridObjectTrail {
  head: ProjectedGroundPoint;
  tail: ProjectedGroundPoint;
  points: ProjectedGroundPoint[];
  segments: PerspectiveSurfaceGridObjectTrailSegment[];
  path: string;
  durationSeconds: number;
}

export const PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT = 50;
export const DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE = 1;
export const PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGE_KEYS: PerspectiveSurfaceGridAltitudeRangeKey[] = [
  "horizonYPercent",
  "cameraHeight",
  "fieldOfView",
  "surfaceAngleDeg",
  "radialVanishingYPercent",
  "radialVanishingZ",
  "radialStrength",
  "gridSpacing",
  "gridCount",
  "scrollSpeed",
  "forwardLightOpacity",
  "forwardLightHeightPercent",
  "zFar",
];

export const DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS: PerspectiveSurfaceGridParams = {
  horizonYPercent: 30,
  cameraHeight: 5,
  fieldOfView: 13,
  surfaceAngleDeg: 45,
  radialVanishingYPercent: 8,
  radialVanishingZ: 8,
  radialStrength: 0.28,
  gridSpacing: 4,
  gridCount: 6,
  scrollSpeed: 5,
  scrollOffsetZ: 0,
  forwardLightOpacity: 0.16,
  forwardLightHeightPercent: 30,
  xMin: -24,
  xMax: 24,
  zNear: 4,
  zFar: 28,
};

export const DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGES: PerspectiveSurfaceGridAltitudeRanges = {
  horizonYPercent: { altitude0: 12, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.horizonYPercent },
  cameraHeight: { altitude0: 3, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.cameraHeight },
  fieldOfView: { altitude0: 8, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.fieldOfView },
  surfaceAngleDeg: { altitude0: 24, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.surfaceAngleDeg },
  radialVanishingYPercent: { altitude0: -14, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.radialVanishingYPercent },
  radialVanishingZ: { altitude0: 4, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.radialVanishingZ },
  radialStrength: { altitude0: 0.08, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.radialStrength },
  gridSpacing: { altitude0: 2, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.gridSpacing },
  gridCount: { altitude0: 8, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.gridCount },
  scrollSpeed: { altitude0: 20, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.scrollSpeed },
  forwardLightOpacity: { altitude0: 0.72, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.forwardLightOpacity },
  forwardLightHeightPercent: {
    altitude0: 70,
    altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.forwardLightHeightPercent,
  },
  zFar: { altitude0: 16, altitude1: DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.zFar },
};

export function normalizePerspectiveSurfaceGridParams(
  input: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridParams {
  const gridSpacing = clampNumber(input.gridSpacing, 1, 12, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.gridSpacing);
  const gridCount = Math.round(clampNumber(input.gridCount, 2, 40, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.gridCount));
  const useGridCountExtent = input.gridCount !== undefined || (input.xMin === undefined && input.xMax === undefined);
  const xMin = useGridCountExtent
    ? -gridSpacing * gridCount
    : clampNumber(input.xMin, -80, 0, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.xMin);
  const xMax = useGridCountExtent
    ? gridSpacing * gridCount
    : clampNumber(input.xMax, 0, 80, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.xMax);
  const zNear = clampNumber(input.zNear, 1, 40, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.zNear);
  const requestedZFar = clampNumber(input.zFar, zNear + gridSpacing, 120, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.zFar);
  const gridCountZFar = zNear + gridSpacing * gridCount;
  const zFar = input.gridCount === undefined ? requestedZFar : Math.max(requestedZFar, gridCountZFar);
  const scrollOffsetZ = typeof input.scrollOffsetZ === "number" && Number.isFinite(input.scrollOffsetZ)
    ? input.scrollOffsetZ
    : 0;
  const radialVanishingZFallback = Math.min(
    zFar,
    Math.max(zNear, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.radialVanishingZ),
  );

  return {
    horizonYPercent: clampNumber(
      input.horizonYPercent,
      -20,
      80,
      DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.horizonYPercent,
    ),
    cameraHeight: clampNumber(input.cameraHeight, 1, 18, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.cameraHeight),
    fieldOfView: clampNumber(input.fieldOfView, 4, 28, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.fieldOfView),
    surfaceAngleDeg: clampNumber(input.surfaceAngleDeg, 0, 90, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.surfaceAngleDeg),
    radialVanishingYPercent: clampNumber(
      input.radialVanishingYPercent,
      -60,
      140,
      DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.radialVanishingYPercent,
    ),
    radialVanishingZ: clampNumber(
      input.radialVanishingZ,
      zNear,
      zFar,
      radialVanishingZFallback,
    ),
    radialStrength: clampNumber(
      input.radialStrength,
      0,
      1,
      DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.radialStrength,
    ),
    gridSpacing,
    gridCount,
    scrollSpeed: clampNumber(input.scrollSpeed, 0, 80, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.scrollSpeed),
    scrollOffsetZ,
    forwardLightOpacity: clampNumber(
      input.forwardLightOpacity,
      0,
      1,
      DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.forwardLightOpacity,
    ),
    forwardLightHeightPercent: clampNumber(
      input.forwardLightHeightPercent,
      0,
      100,
      DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.forwardLightHeightPercent,
    ),
    xMin,
    xMax,
    zNear,
    zFar,
  };
}

export function resolvePerspectiveSurfaceGridParamsFromAltitude(
  altitude: number,
  ranges: PerspectiveSurfaceGridAltitudeRanges = DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGES,
  baseInput: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridParams {
  const normalizedAltitude = clamp01(altitude);
  const resolvedInput: PerspectiveSurfaceGridInput = { ...baseInput };

  PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGE_KEYS.forEach((key) => {
    const range = ranges[key];
    resolvedInput[key] = lerp(range.altitude0, range.altitude1, normalizedAltitude);
  });

  return normalizePerspectiveSurfaceGridParams(resolvedInput);
}

export function projectGroundPoint(
  point: GroundPoint,
  input: PerspectiveSurfaceGridInput = {},
): ProjectedGroundPoint {
  const params = normalizePerspectiveSurfaceGridParams(input);
  const x = Number.isFinite(point.x) ? point.x : 0;
  const z = Math.max(0.001, Number.isFinite(point.z) ? point.z : params.zNear);
  const angleFactor = Math.sin(params.surfaceAngleDeg * Math.PI / 180);
  const normalizedDepth = clamp01((z - params.zNear) / Math.max(1, params.zFar - params.zNear));
  const nearPerspective = params.cameraHeight * params.fieldOfView / params.zNear;
  const farPerspective = params.cameraHeight * params.fieldOfView / params.zFar;
  const perspective = lerp(nearPerspective, farPerspective, normalizedDepth ** 0.75);
  const wallScale = params.fieldOfView / params.cameraHeight;
  const yCurveExponent = 1 + angleFactor * (1 - angleFactor) * 10;
  const distanceFromHorizon = ((1 - normalizedDepth) ** yCurveExponent) * (params.zFar - params.zNear) * wallScale;
  const baseYPercent = params.horizonYPercent + distanceFromHorizon * angleFactor;
  const taperWidthScale = getTaperWidthScale(normalizedDepth);
  const screenXPercent = PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT
    + x * wallScale * lerp(1, taperWidthScale, params.radialStrength);

  return {
    x,
    z,
    screenXPercent,
    screenYPercent: baseYPercent,
    scale: perspective / nearPerspective,
    alpha: 1 - normalizedDepth * 0.72,
  };
}

function getTaperWidthScale(normalizedDepth: number): number {
  return lerp(1.45, 0.45, clamp01(normalizedDepth));
}

export function buildPerspectiveSurfaceGrid(input: PerspectiveSurfaceGridInput = {}): PerspectiveSurfaceGrid {
  const params = normalizePerspectiveSurfaceGridParams(input);
  const rowZValues = createScrolledSteppedValues(params.zNear, params.zFar, params.gridSpacing, params.scrollOffsetZ);
  const columnXValues = createSteppedValues(params.xMin, params.xMax, params.gridSpacing);

  return {
    params,
    rows: rowZValues.map((z) => {
      const points = columnXValues
        .map((x) => projectGroundPoint({ x, z }, params));

      return {
        id: `row-${z}`,
        z,
        points,
        path: formatPolylinePath(points),
      };
    }),
    columns: columnXValues.map((x) => {
      const points = rowZValues
        .map((z) => projectGroundPoint({ x, z }, params));

      return {
        id: `column-${x}`,
        x,
        points,
        path: formatPolylinePath(points),
      };
    }),
  };
}

export function getPerspectiveGridObjectMarker(
  point: GroundPoint,
  input: PerspectiveSurfaceGridInput = {},
): ProjectedGroundPoint {
  const params = normalizePerspectiveSurfaceGridParams(input);

  return projectGroundPoint(
    {
      x: point.x,
      z: getScrolledGroundZ(point.z, params),
    },
    params,
  );
}

export function getPerspectiveGridObjectTrail(
  point: GroundPoint,
  input: PerspectiveSurfaceGridInput = {},
  durationSeconds = 0,
): PerspectiveSurfaceGridObjectTrail {
  const params = normalizePerspectiveSurfaceGridParams(input);
  const normalizedDurationSeconds = clampNumber(durationSeconds, 0, 2, 0);
  const scrollSpan = getScrollSpan(params);
  const trailDistance = params.scrollSpeed * normalizedDurationSeconds;
  const sampleCount = Math.max(8, Math.ceil(trailDistance / Math.max(0.5, params.gridSpacing / 2)) + 1);
  const points = Array.from({ length: sampleCount }, (_, index) => {
    const ageFactor = 1 - index / (sampleCount - 1);
    const sampleParams = {
      ...params,
      scrollOffsetZ: params.scrollOffsetZ - params.scrollSpeed * normalizedDurationSeconds * ageFactor,
    };

    return projectGroundPoint({ x: point.x, z: getScrolledGroundZ(point.z, sampleParams) }, sampleParams);
  });
  const segments = points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1];
    if (Math.abs(end.z - start.z) > scrollSpan / 2) return [];

    const brightnessFactor = (index + 1) / (points.length - 1);

    return [{
      start,
      end,
      path: formatPolylinePath([start, end]),
      alpha: roundToPrecision(0.1 + (brightnessFactor ** 1.35) * 0.9),
    }];
  });
  const head = points[points.length - 1];
  const tail = points[0];

  return {
    head,
    tail,
    points,
    segments,
    path: formatPolylinePath(points),
    durationSeconds: normalizedDurationSeconds,
  };
}

export function resolveGroundPointFromSpanPosition(
  position: PerspectiveSurfaceGridSpanPosition,
  input: PerspectiveSurfaceGridInput = {},
): GroundPoint {
  const params = normalizePerspectiveSurfaceGridParams(input);

  return {
    x: roundToPrecision(lerp(params.xMin, params.xMax, clamp01(position.x))),
    z: roundToPrecision(lerp(params.zNear, params.zFar, clamp01(position.z))),
  };
}

export function resolveSpanPositionFromGroundPoint(
  point: GroundPoint,
  input: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridSpanPosition {
  const params = normalizePerspectiveSurfaceGridParams(input);

  return {
    x: roundToPrecision(inverseLerp(params.xMin, params.xMax, point.x)),
    z: roundToPrecision(inverseLerp(params.zNear, params.zFar, point.z)),
  };
}

export function resolveSpanGridSize(input: PerspectiveSurfaceGridInput = {}): PerspectiveSurfaceGridSpanGridSize {
  const params = normalizePerspectiveSurfaceGridParams(input);

  return {
    columns: Math.max(1, Math.round((params.xMax - params.xMin) / params.gridSpacing)),
    rows: Math.max(1, Math.round((params.zFar - params.zNear) / params.gridSpacing)),
  };
}

export function resolveGroundPointFromSpanCell(
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput = {},
): GroundPoint {
  return resolveGroundPointFromSpanPosition(resolveSpanPositionFromSpanCell(cell, size), input);
}

export function resolveSpanCellFromGroundPoint(
  point: GroundPoint,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridSpanCell {
  return resolveSpanCellFromSpanPosition(resolveSpanPositionFromGroundPoint(point, input), size);
}

export function toggleGroundPointAtSpanCell(
  points: GroundPoint[],
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput = {},
): GroundPoint[] {
  const matchingCellIndex = points.findIndex((point) => (
    areSpanCellsEqual(resolveSpanCellFromGroundPoint(point, size, input), cell)
  ));

  if (matchingCellIndex >= 0) {
    return points.filter((_, index) => index !== matchingCellIndex);
  }

  return [
    ...points,
    resolveGroundPointFromSpanCell(cell, size, input),
  ];
}

function areSpanCellsEqual(left: PerspectiveSurfaceGridSpanCell, right: PerspectiveSurfaceGridSpanCell): boolean {
  return left.column === right.column && left.row === right.row;
}

function resolveSpanPositionFromSpanCell(
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
): PerspectiveSurfaceGridSpanPosition {
  const normalizedSize = normalizeSpanGridSize(size);
  const column = clampInteger(cell.column, 0, normalizedSize.columns - 1);
  const row = clampInteger(cell.row, 0, normalizedSize.rows - 1);

  return {
    x: (column + 0.5) / normalizedSize.columns,
    z: (normalizedSize.rows - row - 0.5) / normalizedSize.rows,
  };
}

function resolveSpanCellFromSpanPosition(
  position: PerspectiveSurfaceGridSpanPosition,
  size: PerspectiveSurfaceGridSpanGridSize,
): PerspectiveSurfaceGridSpanCell {
  const normalizedSize = normalizeSpanGridSize(size);
  const column = Math.min(normalizedSize.columns - 1, Math.floor(clamp01(position.x) * normalizedSize.columns));
  const zIndexFromNear = Math.min(normalizedSize.rows - 1, Math.floor(clamp01(position.z) * normalizedSize.rows));

  return {
    column,
    row: normalizedSize.rows - 1 - zIndexFromNear,
  };
}

function normalizeSpanGridSize(size: PerspectiveSurfaceGridSpanGridSize): PerspectiveSurfaceGridSpanGridSize {
  return {
    columns: Math.max(1, Math.round(Number.isFinite(size.columns) ? size.columns : 1)),
    rows: Math.max(1, Math.round(Number.isFinite(size.rows) ? size.rows : 1)),
  };
}

function getScrolledGroundZ(z: number, params: PerspectiveSurfaceGridParams): number {
  const rawZ = Number.isFinite(z) ? z : params.zNear;
  const phase = getWrappedScrollSpanOffset(params.scrollOffsetZ, getScrollSpan(params));
  if (phase === 0) return rawZ;

  const span = getScrollSpan(params);
  let scrolledZ = rawZ - phase;

  while (scrolledZ < params.zNear) scrolledZ += span;
  while (scrolledZ > params.zFar) scrolledZ -= span;

  return roundToPrecision(scrolledZ);
}

function getScrollSpan(params: PerspectiveSurfaceGridParams): number {
  return Math.max(params.gridSpacing, params.zFar - params.zNear);
}

function createScrolledSteppedValues(min: number, max: number, step: number, offset: number): number[] {
  const phase = getWrappedStepOffset(offset, step);
  if (phase === 0) return createSteppedValues(min, max, step);

  const values: number[] = [];
  const firstValue = min + step - phase;

  for (let value = firstValue; value <= max; value += step) {
    values.push(roundToPrecision(value));
  }

  return values;
}

function createSteppedValues(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  const count = Math.floor((max - min) / step);

  for (let index = 0; index <= count; index += 1) {
    values.push(roundToPrecision(min + step * index));
  }

  const roundedMax = roundToPrecision(max);
  if (values.at(-1) !== roundedMax) values.push(roundedMax);

  return values;
}

function getWrappedStepOffset(offset: number, step: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(step) || step <= 0) return 0;
  return roundToPrecision(((offset % step) + step) % step);
}

function getWrappedScrollSpanOffset(offset: number, span: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(span) || span <= 0) return 0;
  return roundToPrecision(((offset % span) + span) % span);
}

function formatPolylinePath(points: ProjectedGroundPoint[]): string {
  return `M ${points.map((point) => (
    `${point.screenXPercent.toFixed(3)} ${point.screenYPercent.toFixed(3)}`
  )).join(" L ")}`;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;

  return Math.min(max, Math.max(min, Math.round(value)));
}

function inverseLerp(min: number, max: number, value: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;

  return clamp01((value - min) / (max - min));
}

function roundToPrecision(value: number): number {
  return Number(value.toFixed(6));
}

function lerp(from: number, to: number, factor: number): number {
  return from + (to - from) * factor;
}
