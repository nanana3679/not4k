import {
  DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE,
  PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGE_KEYS,
  PERSPECTIVE_SURFACE_GRID_OBJECT_RENDER_MODES,
  PERSPECTIVE_SURFACE_GRID_OBJECT_SHAPES,
  normalizePerspectiveSurfaceGridObjectConnections,
  type PerspectiveSurfaceGridSurfacePattern,
  type PerspectiveSurfaceGridAltitudeRanges,
  type PerspectiveSurfaceGridNumberRange,
  type PerspectiveSurfaceGridObjectAppearance,
  type PerspectiveSurfaceGridObjectConnection,
  type PerspectiveSurfaceGridObjectLightTrailSettings,
  type PerspectiveSurfaceGridObjectPlacement,
  type PerspectiveSurfaceGridParams,
  type PerspectiveSurfaceGridPreset,
  type PerspectiveSurfaceGridSpanGridSize,
} from "./perspectiveSurfaceGrid";

export const PERSPECTIVE_SURFACE_GRID_PRESET_SAVE_ENDPOINT = "/__lab/perspective-surface-grid-preset";
export const PERSPECTIVE_SURFACE_GRID_PRESET_OUTPUT_PATH = "src/game/renderer/perspectiveSurfaceGridPreset.ts";
export const PERSPECTIVE_SURFACE_GRID_PRESET_EXPORT_NAME = "DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET";

export function createPerspectiveSurfaceGridPreset(input: PerspectiveSurfaceGridPreset): PerspectiveSurfaceGridPreset {
  return {
    altitude: finiteNumber(input.altitude),
    surfacePattern: normalizeSurfacePattern(input.surfacePattern),
    surfaceRanges: copySurfaceRanges(input.surfaceRanges),
    params: {
      ...copyParams(input.params),
      scrollOffsetZ: 0,
    },
    spanGridSize: copySpanGridSize(input.spanGridSize),
    objectPlacements: input.objectPlacements.map(copyObjectPlacement),
    objectConnections: normalizePerspectiveSurfaceGridObjectConnections(
      input.objectConnections ?? [],
      input.objectPlacements.map(copyObjectPlacement),
    ).map(copyObjectConnection),
    objectLightTrail: copyObjectLightTrail(input.objectLightTrail),
  };
}

export function formatPerspectiveSurfaceGridPresetModule(input: PerspectiveSurfaceGridPreset): string {
  const preset = createPerspectiveSurfaceGridPreset(input);
  const presetJson = JSON.stringify(preset, null, 2);

  return [
    'import type { PerspectiveSurfaceGridPreset } from "../../lab/perspectiveSurfaceGrid";',
    "",
    `export const ${PERSPECTIVE_SURFACE_GRID_PRESET_EXPORT_NAME}: PerspectiveSurfaceGridPreset = ${presetJson};`,
    "",
  ].join("\n");
}

function copySurfaceRanges(ranges: PerspectiveSurfaceGridAltitudeRanges): PerspectiveSurfaceGridAltitudeRanges {
  return PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGE_KEYS.reduce((copy, key) => ({
    ...copy,
    [key]: copyNumberRange(ranges[key]),
  }), {} as PerspectiveSurfaceGridAltitudeRanges);
}

function copyNumberRange(range: PerspectiveSurfaceGridNumberRange): PerspectiveSurfaceGridNumberRange {
  return {
    altitude0: finiteNumber(range.altitude0),
    altitude1: finiteNumber(range.altitude1),
  };
}

function copyParams(params: PerspectiveSurfaceGridParams): PerspectiveSurfaceGridParams {
  return {
    horizonYPercent: finiteNumber(params.horizonYPercent),
    cameraHeight: finiteNumber(params.cameraHeight),
    fieldOfView: finiteNumber(params.fieldOfView),
    surfaceAngleDeg: finiteNumber(params.surfaceAngleDeg),
    radialVanishingYPercent: finiteNumber(params.radialVanishingYPercent),
    radialVanishingZ: finiteNumber(params.radialVanishingZ),
    radialStrength: finiteNumber(params.radialStrength),
    gridSpacing: finiteNumber(params.gridSpacing),
    gridCount: finiteNumber(params.gridCount),
    scrollSpeed: finiteNumber(params.scrollSpeed),
    scrollOffsetZ: finiteNumber(params.scrollOffsetZ),
    forwardLightOpacity: finiteNumber(params.forwardLightOpacity),
    forwardLightHeightPercent: finiteNumber(params.forwardLightHeightPercent),
    xMin: finiteNumber(params.xMin),
    xMax: finiteNumber(params.xMax),
    zNear: finiteNumber(params.zNear),
    zFar: finiteNumber(params.zFar),
  };
}

function copySpanGridSize(spanGridSize: PerspectiveSurfaceGridSpanGridSize): PerspectiveSurfaceGridSpanGridSize {
  return {
    columns: finiteNumber(spanGridSize.columns),
    rows: finiteNumber(spanGridSize.rows),
  };
}

function copyObjectPlacement(placement: PerspectiveSurfaceGridObjectPlacement): PerspectiveSurfaceGridObjectPlacement {
  return {
    x: finiteNumber(placement.x),
    z: finiteNumber(placement.z),
    heightY: Math.max(0, finiteNumber(placement.heightY ?? 0)),
    appearance: copyObjectAppearance(placement.appearance ?? DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE),
  };
}

function copyObjectConnection(connection: PerspectiveSurfaceGridObjectConnection): PerspectiveSurfaceGridObjectConnection {
  return {
    fromIndex: finiteNumber(connection.fromIndex),
    toIndex: finiteNumber(connection.toIndex),
  };
}

function copyObjectAppearance(appearance: PerspectiveSurfaceGridObjectAppearance): PerspectiveSurfaceGridObjectAppearance {
  const shape = PERSPECTIVE_SURFACE_GRID_OBJECT_SHAPES.includes(appearance.shape)
    ? appearance.shape
    : DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.shape;
  const renderMode = PERSPECTIVE_SURFACE_GRID_OBJECT_RENDER_MODES.includes(
    appearance.renderMode ?? DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.renderMode ?? "outline",
  )
    ? appearance.renderMode ?? DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.renderMode
    : DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.renderMode;

  return {
    shape,
    diameter: Math.max(0.1, finiteNumber(appearance.diameter)),
    outlineWidth: clampNumber(
      finiteNumber(appearance.outlineWidth ?? DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.outlineWidth ?? 0.18),
      0.04,
      0.8,
    ),
    rotationDeg: clampNumber(finiteNumber(appearance.rotationDeg), 0, 360),
    color: normalizeHexColor(appearance.color, DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.color),
    renderMode,
  };
}

function copyObjectLightTrail(
  objectLightTrail: PerspectiveSurfaceGridObjectLightTrailSettings,
): PerspectiveSurfaceGridObjectLightTrailSettings {
  return {
    timeSeconds: finiteNumber(objectLightTrail.timeSeconds),
    opacity: finiteNumber(objectLightTrail.opacity),
  };
}

function finiteNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Number(value.toFixed(6));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSurfacePattern(pattern: PerspectiveSurfaceGridSurfacePattern | undefined): PerspectiveSurfaceGridSurfacePattern {
  if (pattern === "grid" || pattern === "triangles") return pattern;

  return "triangles";
}

function normalizeHexColor(value: string, fallback: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();

  return fallback;
}
