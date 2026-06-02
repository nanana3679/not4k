export interface GroundPoint {
  x: number;
  z: number;
}

export interface PerspectiveSurfaceGridParams {
  horizonYPercent: number;
  cameraHeight: number;
  fieldOfView: number;
  surfaceAngleDeg: number;
  gridSpacing: number;
  xMin: number;
  xMax: number;
  zNear: number;
  zFar: number;
}

export type PerspectiveSurfaceGridInput = Partial<PerspectiveSurfaceGridParams>;

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

export const PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT = 50;

export const DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS: PerspectiveSurfaceGridParams = {
  horizonYPercent: 30,
  cameraHeight: 5,
  fieldOfView: 13,
  surfaceAngleDeg: 45,
  gridSpacing: 4,
  xMin: -16,
  xMax: 16,
  zNear: 4,
  zFar: 28,
};

export function normalizePerspectiveSurfaceGridParams(
  input: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridParams {
  const gridSpacing = clampNumber(input.gridSpacing, 1, 12, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.gridSpacing);
  const xMin = clampNumber(input.xMin, -80, 0, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.xMin);
  const xMax = clampNumber(input.xMax, 0, 80, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.xMax);
  const zNear = clampNumber(input.zNear, 1, 40, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.zNear);
  const zFar = clampNumber(input.zFar, zNear + gridSpacing, 120, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS.zFar);

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
    gridSpacing,
    xMin,
    xMax,
    zNear,
    zFar,
  };
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
  const edgeXPercent = PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT + x * perspective;
  const wallXPercent = PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT + x * wallScale;
  const yCurveExponent = 1 + angleFactor * (1 - angleFactor) * 10;
  const distanceFromHorizon = ((1 - normalizedDepth) ** yCurveExponent) * (params.zFar - params.zNear) * wallScale;
  const screenXPercent = lerp(edgeXPercent, wallXPercent, angleFactor);
  const screenYPercent = params.horizonYPercent + distanceFromHorizon * angleFactor;

  return {
    x,
    z,
    screenXPercent,
    screenYPercent,
    scale: perspective / nearPerspective,
    alpha: 1 - normalizedDepth * 0.72,
  };
}

export function buildPerspectiveSurfaceGrid(input: PerspectiveSurfaceGridInput = {}): PerspectiveSurfaceGrid {
  const params = normalizePerspectiveSurfaceGridParams(input);
  const rowZValues = createSteppedValues(params.zNear, params.zFar, params.gridSpacing);
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
  return projectGroundPoint(point, input);
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

function roundToPrecision(value: number): number {
  return Number(value.toFixed(6));
}

function lerp(from: number, to: number, factor: number): number {
  return from + (to - from) * factor;
}
