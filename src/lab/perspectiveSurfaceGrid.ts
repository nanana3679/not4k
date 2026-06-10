export interface GroundPoint {
  x: number;
  z: number;
}

export interface WorldPoint extends GroundPoint {
  heightY?: number;
}

export interface PerspectiveSurfaceGridSpanPosition {
  x: number;
  z: number;
}

export type PerspectiveSurfaceGridSpanTriangle = "upper" | "lower";

export interface PerspectiveSurfaceGridSpanCell {
  column: number;
  row: number;
  triangle?: PerspectiveSurfaceGridSpanTriangle;
}

export interface PerspectiveSurfaceGridSpanGridSize {
  columns: number;
  rows: number;
}

export type PerspectiveSurfaceGridSurfacePattern = "grid" | "triangles";
export type PerspectiveSurfaceGridObjectShape = "circle" | "triangle" | "square" | "point";
export type PerspectiveSurfaceGridObjectRenderMode = "filled" | "outline";

export interface PerspectiveSurfaceGridObjectAppearance {
  shape: PerspectiveSurfaceGridObjectShape;
  diameter: number;
  outlineWidth?: number;
  rotationDeg: number;
  color: string;
  renderMode?: PerspectiveSurfaceGridObjectRenderMode;
}

export interface PerspectiveSurfaceGridObjectPlacement extends WorldPoint {
  appearance: PerspectiveSurfaceGridObjectAppearance;
}

export interface PerspectiveSurfaceGridObjectConnection {
  fromIndex: number;
  toIndex: number;
}

export interface PerspectiveSurfaceGridObjectConnectionSegment {
  connection: PerspectiveSurfaceGridObjectConnection;
  from: ProjectedGroundPoint;
  to: ProjectedGroundPoint;
  path: string;
  color: string;
}

export interface PerspectiveSurfaceGridObjectLightTrailSettings {
  timeSeconds: number;
  opacity: number;
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
  heightY?: number;
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
  triangles: PerspectiveSurfaceGridTriangleTile[];
}

export interface PerspectiveSurfaceGridTriangleTile {
  id: string;
  points: ProjectedGroundPoint[];
  pointsValue: string;
  averageZ: number;
}

export interface PerspectiveSurfaceGridPreset {
  altitude: number;
  surfacePattern?: PerspectiveSurfaceGridSurfacePattern;
  surfaceRanges: PerspectiveSurfaceGridAltitudeRanges;
  params: PerspectiveSurfaceGridParams;
  spanGridSize: PerspectiveSurfaceGridSpanGridSize;
  objectPlacements: PerspectiveSurfaceGridObjectPlacement[];
  objectConnections?: PerspectiveSurfaceGridObjectConnection[];
  objectLightTrail: PerspectiveSurfaceGridObjectLightTrailSettings;
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

export interface PerspectiveSurfaceGridObjectSurfaceShape {
  center: ProjectedGroundPoint;
  vertices: ProjectedGroundPoint[];
  points: string;
}

export const PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT = 50;
export const DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE = 1;
export const PERSPECTIVE_SURFACE_GRID_OBJECT_SHAPES: PerspectiveSurfaceGridObjectShape[] = [
  "circle",
  "triangle",
  "square",
  "point",
];
export const PERSPECTIVE_SURFACE_GRID_OBJECT_RENDER_MODES: PerspectiveSurfaceGridObjectRenderMode[] = [
  "filled",
  "outline",
];
export const PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_MAX_COUNT = 160;
const PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_MIN_DIAMETER = 0.4;
const PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_MAX_DIAMETER = 4.8;
export const PERSPECTIVE_SURFACE_GRID_OBJECT_MIN_OUTLINE_WIDTH = 0.04;
export const PERSPECTIVE_SURFACE_GRID_OBJECT_MAX_OUTLINE_WIDTH = 0.8;
export const PERSPECTIVE_SURFACE_GRID_OBJECT_DEFAULT_OUTLINE_WIDTH = 0.18;
const PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_COLLISION_PADDING = 0.08;
const PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_CELL_ATTEMPTS = 8;
export const DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE: PerspectiveSurfaceGridObjectAppearance = {
  shape: "triangle",
  diameter: 0.96,
  outlineWidth: PERSPECTIVE_SURFACE_GRID_OBJECT_DEFAULT_OUTLINE_WIDTH,
  rotationDeg: 0,
  color: "#ebfffb",
  renderMode: "outline",
};
export const DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_PLACEMENTS: PerspectiveSurfaceGridObjectPlacement[] = [{
  x: 4,
  z: 8,
  appearance: DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE,
}];
export const DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_CONNECTIONS: PerspectiveSurfaceGridObjectConnection[] = [];
export const DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_POINTS: GroundPoint[] = (
  DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_PLACEMENTS.map(({ x, z }) => ({ x, z }))
);
export const DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_LIGHT_TRAIL: PerspectiveSurfaceGridObjectLightTrailSettings = {
  timeSeconds: 0.18,
  opacity: 0.72,
};
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
  return projectWorldPoint(point, input);
}

export function projectWorldPoint(
  point: WorldPoint,
  input: PerspectiveSurfaceGridInput = {},
): ProjectedGroundPoint {
  const params = normalizePerspectiveSurfaceGridParams(input);
  const x = Number.isFinite(point.x) ? point.x : 0;
  const z = Math.max(0.001, Number.isFinite(point.z) ? point.z : params.zNear);
  const heightY = Number.isFinite(point.heightY) ? Math.max(0, point.heightY ?? 0) : 0;
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
  const screenYPercent = baseYPercent - heightY * wallScale * perspective / nearPerspective;

  return {
    x,
    z,
    heightY,
    screenXPercent,
    screenYPercent,
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
    triangles: buildPerspectiveSurfaceGridTriangles(params),
  };
}

function buildPerspectiveSurfaceGridTriangles(params: PerspectiveSurfaceGridParams): PerspectiveSurfaceGridTriangleTile[] {
  const rowStep = params.gridSpacing * Math.sqrt(3) / 2;
  const zValues = createScrolledIndexedSteppedValues(
    params.zNear,
    params.zFar,
    rowStep,
    params.scrollOffsetZ,
    rowStep * 2,
  );
  const xValues = createSteppedValues(params.xMin - params.gridSpacing * 2, params.xMax + params.gridSpacing * 2, params.gridSpacing);
  const tiles: PerspectiveSurfaceGridTriangleTile[] = [];

  zValues.slice(0, -1).forEach((row, rowIndex) => {
    const z = row.value;
    const nextZ = zValues[rowIndex + 1].value;
    const rowOffset = row.index % 2 === 0 ? 0 : params.gridSpacing / 2;

    xValues.forEach((baseX, columnIndex) => {
      const x = baseX + rowOffset;
      const upper = [
        projectGroundPoint({ x, z }, params),
        projectGroundPoint({ x: x + params.gridSpacing, z }, params),
        projectGroundPoint({ x: x + params.gridSpacing / 2, z: nextZ }, params),
      ];
      const lower = [
        projectGroundPoint({ x: x + params.gridSpacing / 2, z: nextZ }, params),
        projectGroundPoint({ x: x + params.gridSpacing * 1.5, z: nextZ }, params),
        projectGroundPoint({ x: x + params.gridSpacing, z }, params),
      ];

      if (isTileInSurfaceRange(upper, params)) {
        tiles.push(createTriangleTile(`triangle-${rowIndex}-${columnIndex}-a`, upper));
      }
      if (isTileInSurfaceRange(lower, params)) {
        tiles.push(createTriangleTile(`triangle-${rowIndex}-${columnIndex}-b`, lower));
      }
    });
  });

  return tiles;
}

function createTriangleTile(id: string, points: ProjectedGroundPoint[]): PerspectiveSurfaceGridTriangleTile {
  return {
    id,
    points,
    pointsValue: formatSvgPoints(points),
    averageZ: roundToPrecision(points.reduce((sum, point) => sum + point.z, 0) / points.length),
  };
}

function isTileInSurfaceRange(points: ProjectedGroundPoint[], params: PerspectiveSurfaceGridParams): boolean {
  return points.some((point) => point.x >= params.xMin && point.x <= params.xMax && point.z >= params.zNear && point.z <= params.zFar);
}

export function getPerspectiveGridObjectMarker(
  point: WorldPoint,
  input: PerspectiveSurfaceGridInput = {},
): ProjectedGroundPoint {
  const params = normalizePerspectiveSurfaceGridParams(input);

  return projectWorldPoint(
    {
      x: point.x,
      z: getScrolledGroundZ(point.z, params),
      heightY: point.heightY,
    },
    params,
  );
}

export function togglePerspectiveSurfaceGridObjectConnection(
  connections: readonly PerspectiveSurfaceGridObjectConnection[],
  fromIndex: number,
  toIndex: number,
  placements: readonly PerspectiveSurfaceGridObjectPlacement[],
): PerspectiveSurfaceGridObjectConnection[] {
  const normalizedConnection = normalizePerspectiveSurfaceGridObjectConnection({ fromIndex, toIndex }, placements);
  const normalizedConnections = normalizePerspectiveSurfaceGridObjectConnections(connections, placements);
  if (normalizedConnection === null) return normalizedConnections;

  const existingIndex = normalizedConnections.findIndex((connection) => (
    areObjectConnectionsEqual(connection, normalizedConnection)
  ));
  if (existingIndex >= 0) {
    return normalizedConnections.filter((_, index) => index !== existingIndex);
  }

  return [...normalizedConnections, normalizedConnection];
}

export function normalizePerspectiveSurfaceGridObjectConnections(
  connections: readonly PerspectiveSurfaceGridObjectConnection[] | undefined,
  placements: readonly PerspectiveSurfaceGridObjectPlacement[],
): PerspectiveSurfaceGridObjectConnection[] {
  const seenConnectionKeys = new Set<string>();
  const normalizedConnections: PerspectiveSurfaceGridObjectConnection[] = [];

  (connections ?? []).forEach((connection) => {
    const normalizedConnection = normalizePerspectiveSurfaceGridObjectConnection(connection, placements);
    if (normalizedConnection === null) return;

    const key = getObjectConnectionKey(normalizedConnection);
    if (seenConnectionKeys.has(key)) return;

    seenConnectionKeys.add(key);
    normalizedConnections.push(normalizedConnection);
  });

  return normalizedConnections;
}

export function removePerspectiveSurfaceGridObjectConnectionsForObject(
  connections: readonly PerspectiveSurfaceGridObjectConnection[],
  removedIndex: number,
): PerspectiveSurfaceGridObjectConnection[] {
  return connections.flatMap((connection) => {
    if (connection.fromIndex === removedIndex || connection.toIndex === removedIndex) return [];

    return [{
      fromIndex: connection.fromIndex > removedIndex ? connection.fromIndex - 1 : connection.fromIndex,
      toIndex: connection.toIndex > removedIndex ? connection.toIndex - 1 : connection.toIndex,
    }];
  });
}

export function getPerspectiveGridObjectConnectionSegment(
  connection: PerspectiveSurfaceGridObjectConnection,
  placements: readonly PerspectiveSurfaceGridObjectPlacement[],
  input: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridObjectConnectionSegment | null {
  const params = normalizePerspectiveSurfaceGridParams(input);
  const normalizedConnection = normalizePerspectiveSurfaceGridObjectConnection(connection, placements);
  if (normalizedConnection === null) return null;

  const fromPlacement = placements[normalizedConnection.fromIndex];
  const toPlacement = placements[normalizedConnection.toIndex];
  if (!fromPlacement || !toPlacement) return null;

  const from = getPerspectiveGridObjectMarker(fromPlacement, params);
  const to = getPerspectiveGridObjectMarker(toPlacement, params);
  if (Math.abs(to.z - from.z) > getScrollSpan(params) / 2) return null;

  return {
    connection: normalizedConnection,
    from,
    to,
    path: formatPolylinePath([from, to]),
    color: fromPlacement.appearance.color,
  };
}

export function getPerspectiveGridObjectTrail(
  point: WorldPoint,
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

    return projectWorldPoint({
      x: point.x,
      z: getScrolledGroundZ(point.z, sampleParams),
      heightY: point.heightY,
    }, sampleParams);
  });
  const segments = points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1];
    if (index === points.length - 2) return [];
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

export function projectPerspectiveGridObjectSurfaceShape(
  center: WorldPoint,
  appearance: PerspectiveSurfaceGridObjectAppearance,
  input: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridObjectSurfaceShape {
  const params = normalizePerspectiveSurfaceGridParams(input);
  const normalizedCenter = {
    x: Number.isFinite(center.x) ? center.x : 0,
    z: Number.isFinite(center.z) ? center.z : params.zNear,
    heightY: Number.isFinite(center.heightY) ? Math.max(0, center.heightY ?? 0) : 0,
  };
  const vertices = getObjectSurfaceLocalVertices(appearance)
    .map((offset) => projectWorldPoint({
      x: normalizedCenter.x + offset.x,
      z: normalizedCenter.z + offset.z,
      heightY: normalizedCenter.heightY,
    }, params));

  return {
    center: projectWorldPoint(normalizedCenter, params),
    vertices,
    points: formatSvgPoints(vertices),
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
  const spanPosition = cell.triangle === undefined
    ? resolveSpanPositionFromSpanCell(cell, size)
    : resolveSpanPositionFromSpanTriangleCell(cell, size);

  return resolveGroundPointFromSpanPosition(spanPosition, input);
}

export function resolveSpanCellFromGroundPoint(
  point: GroundPoint,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridSpanCell {
  return resolveSpanCellFromSpanPosition(resolveSpanPositionFromGroundPoint(point, input), size);
}

export function resolveSpanTriangleCellFromGroundPoint(
  point: GroundPoint,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput = {},
): PerspectiveSurfaceGridSpanCell {
  return resolveSpanTriangleCellFromSpanPosition(resolveSpanPositionFromGroundPoint(point, input), size);
}

export function toggleGroundPointAtSpanCell(
  points: GroundPoint[],
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput = {},
): GroundPoint[] {
  const matchingCellIndex = points.findIndex((point) => (
    areSpanCellsEqual(resolveComparableSpanCellFromGroundPoint(point, cell, size, input), cell)
  ));

  if (matchingCellIndex >= 0) {
    return points.filter((_, index) => index !== matchingCellIndex);
  }

  return [
    ...points,
    resolveGroundPointFromSpanCell(cell, size, input),
  ];
}

export function resolvePerspectiveSurfaceGridRandomObjectCount(
  size: PerspectiveSurfaceGridSpanGridSize,
  density: number,
): number {
  const normalizedSize = normalizeSpanGridSize(size);
  const normalizedDensity = clampNumber(density, 0, 1, 0);

  return Math.min(
    PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_MAX_COUNT,
    Math.round(normalizedSize.columns * normalizedSize.rows * normalizedDensity),
  );
}

export function createRandomPerspectiveSurfaceGridObjectPlacements({
  size,
  input = {},
  density,
  surfacePattern = "grid",
  random = Math.random,
}: {
  size: PerspectiveSurfaceGridSpanGridSize;
  input?: PerspectiveSurfaceGridInput;
  density: number;
  surfacePattern?: PerspectiveSurfaceGridSurfacePattern;
  random?: () => number;
}): PerspectiveSurfaceGridObjectPlacement[] {
  const normalizedSize = normalizeSpanGridSize(size);
  const count = resolvePerspectiveSurfaceGridRandomObjectCount(normalizedSize, density);
  if (count <= 0) return [];

  const shuffledCells = shuffleSpanCells(normalizedSize, surfacePattern, random);
  const placements: PerspectiveSurfaceGridObjectPlacement[] = [];

  for (const cell of shuffledCells) {
    if (placements.length >= count) break;

    const placement = createNonOverlappingRandomObjectPlacement(cell, normalizedSize, input, placements, random);
    if (placement !== null) placements.push(placement);
  }

  return placements;
}

function resolveComparableSpanCellFromGroundPoint(
  point: GroundPoint,
  referenceCell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput,
): PerspectiveSurfaceGridSpanCell {
  if (referenceCell.triangle !== undefined) {
    return resolveSpanTriangleCellFromGroundPoint(point, size, input);
  }

  return resolveSpanCellFromGroundPoint(point, size, input);
}

function areSpanCellsEqual(left: PerspectiveSurfaceGridSpanCell, right: PerspectiveSurfaceGridSpanCell): boolean {
  return left.column === right.column && left.row === right.row && left.triangle === right.triangle;
}

function normalizePerspectiveSurfaceGridObjectConnection(
  connection: PerspectiveSurfaceGridObjectConnection,
  placements: readonly PerspectiveSurfaceGridObjectPlacement[],
): PerspectiveSurfaceGridObjectConnection | null {
  const fromIndex = normalizeObjectConnectionIndex(connection.fromIndex);
  const toIndex = normalizeObjectConnectionIndex(connection.toIndex);
  if (fromIndex === null || toIndex === null || fromIndex === toIndex) return null;
  if (!isConnectablePointPlacement(placements[fromIndex]) || !isConnectablePointPlacement(placements[toIndex])) return null;

  return {
    fromIndex: Math.min(fromIndex, toIndex),
    toIndex: Math.max(fromIndex, toIndex),
  };
}

function normalizeObjectConnectionIndex(index: number): number | null {
  if (!Number.isInteger(index) || index < 0) return null;

  return index;
}

function isConnectablePointPlacement(
  placement: PerspectiveSurfaceGridObjectPlacement | undefined,
): placement is PerspectiveSurfaceGridObjectPlacement {
  return placement?.appearance.shape === "point";
}

function areObjectConnectionsEqual(
  left: PerspectiveSurfaceGridObjectConnection,
  right: PerspectiveSurfaceGridObjectConnection,
): boolean {
  return left.fromIndex === right.fromIndex && left.toIndex === right.toIndex;
}

function getObjectConnectionKey(connection: PerspectiveSurfaceGridObjectConnection): string {
  return `${connection.fromIndex}:${connection.toIndex}`;
}

function shuffleSpanCells(
  size: PerspectiveSurfaceGridSpanGridSize,
  surfacePattern: PerspectiveSurfaceGridSurfacePattern,
  random: () => number,
): PerspectiveSurfaceGridSpanCell[] {
  const cells = Array.from({ length: size.rows }, (_, row) => (
    Array.from({ length: size.columns }, (_unused, column) => {
      if (surfacePattern !== "triangles") return [{ column, row }];

      return [
        { column, row, triangle: "upper" as const },
        { column, row, triangle: "lower" as const },
      ];
    }).flat()
  )).flat();

  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom(random) * (index + 1));
    [cells[index], cells[swapIndex]] = [cells[swapIndex], cells[index]];
  }

  return cells;
}

function createNonOverlappingRandomObjectPlacement(
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput,
  placements: PerspectiveSurfaceGridObjectPlacement[],
  random: () => number,
): PerspectiveSurfaceGridObjectPlacement | null {
  for (let attempt = 0; attempt < PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_CELL_ATTEMPTS; attempt += 1) {
    const candidate = createRandomObjectPlacementInSpanCell(cell, size, input, random);
    const adjusted = adjustObjectPlacementDiameterForNonOverlap(candidate, placements);
    if (adjusted !== null) return adjusted;
  }

  return null;
}

function createRandomObjectPlacementInSpanCell(
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
  input: PerspectiveSurfaceGridInput,
  random: () => number,
): PerspectiveSurfaceGridObjectPlacement {
  const point = resolveGroundPointFromSpanPosition(
    resolveRandomSpanPositionFromSpanCell(cell, size, random),
    input,
  );

  return {
    ...point,
    heightY: roundToPrecision((nextRandom(random) ** 2.4) * 5),
    appearance: createRandomPerspectiveSurfaceGridObjectAppearance(random),
  };
}

function resolveRandomSpanPositionFromSpanCell(
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
  random: () => number,
): PerspectiveSurfaceGridSpanPosition {
  if (cell.triangle === undefined) {
    return {
      x: (cell.column + nextRandom(random)) / size.columns,
      z: (size.rows - cell.row - nextRandom(random)) / size.rows,
    };
  }

  const vertices = getSpanTriangleVertices(cell, size);
  let firstWeight = nextRandom(random);
  let secondWeight = nextRandom(random);
  if (firstWeight + secondWeight > 1) {
    firstWeight = 1 - firstWeight;
    secondWeight = 1 - secondWeight;
  }
  const thirdWeight = 1 - firstWeight - secondWeight;

  return {
    x: vertices[0].x * firstWeight + vertices[1].x * secondWeight + vertices[2].x * thirdWeight,
    z: vertices[0].z * firstWeight + vertices[1].z * secondWeight + vertices[2].z * thirdWeight,
  };
}

function adjustObjectPlacementDiameterForNonOverlap(
  candidate: PerspectiveSurfaceGridObjectPlacement,
  placements: PerspectiveSurfaceGridObjectPlacement[],
): PerspectiveSurfaceGridObjectPlacement | null {
  const candidateMultiplier = getObjectCollisionRadiusMultiplier(candidate.appearance.shape);
  const maxDiameter = placements.reduce((currentMaxDiameter, placement) => {
    const distance = getGroundDistance(candidate, placement);
    const existingRadius = getObjectCollisionRadius(placement.appearance);
    const availableCandidateRadius = distance - existingRadius - PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_COLLISION_PADDING;

    return Math.min(currentMaxDiameter, availableCandidateRadius / candidateMultiplier);
  }, candidate.appearance.diameter);

  if (maxDiameter < PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_MIN_DIAMETER) return null;

  return {
    ...candidate,
    appearance: {
      ...candidate.appearance,
      diameter: roundToPrecision(Math.min(candidate.appearance.diameter, maxDiameter)),
    },
  };
}

function getGroundDistance(left: GroundPoint, right: GroundPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function getObjectCollisionRadius(appearance: PerspectiveSurfaceGridObjectAppearance): number {
  return appearance.diameter * getObjectCollisionRadiusMultiplier(appearance.shape);
}

function getObjectCollisionRadiusMultiplier(shape: PerspectiveSurfaceGridObjectShape): number {
  if (shape === "point") return 0.22;
  return shape === "square" ? Math.SQRT2 / 2 : 0.5;
}

function createRandomPerspectiveSurfaceGridObjectAppearance(
  random: () => number,
): PerspectiveSurfaceGridObjectAppearance {
  const shapeIndex = Math.floor(nextRandom(random) * PERSPECTIVE_SURFACE_GRID_OBJECT_SHAPES.length);

  return {
    shape: PERSPECTIVE_SURFACE_GRID_OBJECT_SHAPES[shapeIndex] ?? "circle",
    diameter: roundToPrecision(lerp(
      PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_MIN_DIAMETER,
      PERSPECTIVE_SURFACE_GRID_RANDOM_OBJECT_MAX_DIAMETER,
      nextRandom(random),
    )),
    outlineWidth: roundToPrecision(lerp(
      PERSPECTIVE_SURFACE_GRID_OBJECT_MIN_OUTLINE_WIDTH,
      PERSPECTIVE_SURFACE_GRID_OBJECT_MAX_OUTLINE_WIDTH,
      nextRandom(random),
    )),
    rotationDeg: Math.round(lerp(0, 360, nextRandom(random))),
    color: createRandomVisibleHexColor(random),
    renderMode: nextRandom(random) > 0.18 ? "outline" : "filled",
  };
}

function createRandomVisibleHexColor(random: () => number): string {
  const hue = lerp(0, 360, nextRandom(random));
  const saturation = lerp(68, 96, nextRandom(random));
  const lightness = lerp(56, 78, nextRandom(random));
  const chroma = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs(huePrime % 2 - 1));
  const [r1, g1, b1] = getHuePrimeRgb(huePrime, chroma, x);
  const m = lightness / 100 - chroma / 2;

  return `#${toHexByte((r1 + m) * 255)}${toHexByte((g1 + m) * 255)}${toHexByte((b1 + m) * 255)}`;
}

function getHuePrimeRgb(huePrime: number, chroma: number, x: number): [number, number, number] {
  if (huePrime < 1) return [chroma, x, 0];
  if (huePrime < 2) return [x, chroma, 0];
  if (huePrime < 3) return [0, chroma, x];
  if (huePrime < 4) return [0, x, chroma];
  if (huePrime < 5) return [x, 0, chroma];

  return [chroma, 0, x];
}

function toHexByte(value: number): string {
  return Math.round(clampNumber(value, 0, 255, 0)).toString(16).padStart(2, "0");
}

function getObjectSurfaceLocalVertices(appearance: PerspectiveSurfaceGridObjectAppearance): GroundPoint[] {
  const radius = Math.max(0.05, Number.isFinite(appearance.diameter) ? appearance.diameter / 2 : 0.48);
  const rotationDeg = Number.isFinite(appearance.rotationDeg) ? appearance.rotationDeg : 0;
  const localVertices = getUnrotatedObjectSurfaceLocalVertices(appearance.shape, radius);

  return localVertices.map((point) => rotateGroundOffset(point, rotationDeg));
}

function getUnrotatedObjectSurfaceLocalVertices(
  shape: PerspectiveSurfaceGridObjectShape,
  radius: number,
): GroundPoint[] {
  if (shape === "triangle") {
    const halfWidth = radius * 0.866025;
    return [
      { x: 0, z: radius },
      { x: halfWidth, z: -radius * 0.5 },
      { x: -halfWidth, z: -radius * 0.5 },
    ];
  }

  if (shape === "square") {
    return [
      { x: -radius, z: radius },
      { x: radius, z: radius },
      { x: radius, z: -radius },
      { x: -radius, z: -radius },
    ];
  }

  const segmentCount = shape === "point" ? 12 : 18;
  return Array.from({ length: segmentCount }, (_, index) => {
    const angle = (index / segmentCount) * Math.PI * 2;
    return {
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius,
    };
  });
}

function rotateGroundOffset(point: GroundPoint, rotationDeg: number): GroundPoint {
  const angle = rotationDeg * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: roundToPrecision(point.x * cos - point.z * sin),
    z: roundToPrecision(point.x * sin + point.z * cos),
  };
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

function resolveSpanPositionFromSpanTriangleCell(
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
): PerspectiveSurfaceGridSpanPosition {
  const vertices = getSpanTriangleVertices(cell, size);

  return {
    x: vertices.reduce((sum, vertex) => sum + vertex.x, 0) / vertices.length,
    z: vertices.reduce((sum, vertex) => sum + vertex.z, 0) / vertices.length,
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

function resolveSpanTriangleCellFromSpanPosition(
  position: PerspectiveSurfaceGridSpanPosition,
  size: PerspectiveSurfaceGridSpanGridSize,
): PerspectiveSurfaceGridSpanCell {
  const normalizedSize = normalizeSpanGridSize(size);
  const point = {
    x: clamp01(position.x),
    z: clamp01(position.z),
  };
  const zIndexFromNear = Math.min(normalizedSize.rows - 1, Math.floor(point.z * normalizedSize.rows));
  const row = normalizedSize.rows - 1 - zIndexFromNear;
  const candidates = Array.from({ length: normalizedSize.columns }, (_, column) => ([
    { column, row, triangle: "upper" as const },
    { column, row, triangle: "lower" as const },
  ])).flat();
  const containingCell = candidates.find((cell) => (
    isPointInSpanTriangle(point, getSpanTriangleVertices(cell, normalizedSize))
  ));
  if (containingCell !== undefined) return containingCell;

  return candidates.reduce((closest, candidate) => {
    const closestCenter = resolveSpanPositionFromSpanTriangleCell(closest, normalizedSize);
    const candidateCenter = resolveSpanPositionFromSpanTriangleCell(candidate, normalizedSize);

    return getSpanPositionDistance(point, candidateCenter) < getSpanPositionDistance(point, closestCenter)
      ? candidate
      : closest;
  }, candidates[0]);
}

function getSpanTriangleVertices(
  cell: PerspectiveSurfaceGridSpanCell,
  size: PerspectiveSurfaceGridSpanGridSize,
): PerspectiveSurfaceGridSpanPosition[] {
  const normalizedSize = normalizeSpanGridSize(size);
  const column = clampInteger(cell.column, 0, normalizedSize.columns - 1);
  const row = clampInteger(cell.row, 0, normalizedSize.rows - 1);
  const normalizedWidth = normalizedSize.columns + 0.5;
  const topZ = (normalizedSize.rows - row) / normalizedSize.rows;
  const bottomZ = (normalizedSize.rows - row - 1) / normalizedSize.rows;
  const topLeft = { x: (column + 0.5) / normalizedWidth, z: topZ };
  const topRight = { x: (column + 1.5) / normalizedWidth, z: topZ };
  const bottomRight = { x: (column + 1) / normalizedWidth, z: bottomZ };
  const bottomLeft = { x: column / normalizedWidth, z: bottomZ };

  if ((cell.triangle ?? "upper") === "upper") {
    return [topLeft, topRight, bottomRight];
  }

  return [topLeft, bottomRight, bottomLeft];
}

function isPointInSpanTriangle(
  point: PerspectiveSurfaceGridSpanPosition,
  vertices: PerspectiveSurfaceGridSpanPosition[],
): boolean {
  const [first, second, third] = vertices;
  const denominator = ((second.z - third.z) * (first.x - third.x)) + ((third.x - second.x) * (first.z - third.z));
  if (Math.abs(denominator) < 1e-9) return false;

  const firstWeight = (((second.z - third.z) * (point.x - third.x)) + ((third.x - second.x) * (point.z - third.z))) / denominator;
  const secondWeight = (((third.z - first.z) * (point.x - third.x)) + ((first.x - third.x) * (point.z - third.z))) / denominator;
  const thirdWeight = 1 - firstWeight - secondWeight;
  const epsilon = -1e-9;

  return firstWeight >= epsilon && secondWeight >= epsilon && thirdWeight >= epsilon;
}

function getSpanPositionDistance(
  left: PerspectiveSurfaceGridSpanPosition,
  right: PerspectiveSurfaceGridSpanPosition,
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
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

function createScrolledIndexedSteppedValues(
  min: number,
  max: number,
  step: number,
  offset: number,
  repeatSpan: number,
): Array<{ value: number; index: number }> {
  const phase = getWrappedStepOffset(offset, repeatSpan);
  const firstIndex = phase === 0 ? 0 : Math.max(0, Math.ceil(phase / step));
  const values: Array<{ value: number; index: number }> = [];

  for (let index = firstIndex; ; index += 1) {
    const value = roundToPrecision(min + step * index - phase);
    if (value > max) break;
    if (value >= min) values.push({ value, index });
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

function nextRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;

  return Math.min(0.999999, Math.max(0, value));
}

function formatPolylinePath(points: ProjectedGroundPoint[]): string {
  return `M ${points.map((point) => (
    `${point.screenXPercent.toFixed(3)} ${point.screenYPercent.toFixed(3)}`
  )).join(" L ")}`;
}

function formatSvgPoints(points: ProjectedGroundPoint[]): string {
  return points.map((point) => (
    `${point.screenXPercent.toFixed(3)},${point.screenYPercent.toFixed(3)}`
  )).join(" ");
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
