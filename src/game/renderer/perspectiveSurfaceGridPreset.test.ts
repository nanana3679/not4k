import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET } from "./perspectiveSurfaceGridPreset";

describe("DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET", () => {
  it("인게임 perspective surface grid 기본 preset은 surface, span, object, light trail 설정을 포함", () => {
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.params.scrollOffsetZ).toBe(0);
    expect(["grid", "triangles"]).toContain(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.surfacePattern);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.surfaceRanges.scrollSpeed.altitude0).toBeGreaterThan(0);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.spanGridSize.columns).toBeGreaterThan(0);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.spanGridSize.rows).toBeGreaterThan(0);
    expect(Array.isArray(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements)).toBe(true);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements.length).toBeGreaterThan(0);
    expect(["circle", "triangle", "square", "point"]).toContain(
      DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements[0].appearance.shape,
    );
    expect(Array.isArray(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectConnections ?? [])).toBe(true);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements[0].heightY).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements[0].appearance.diameter).toBeGreaterThan(0);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements[0].appearance.outlineWidth).toBeGreaterThan(0);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements[0].appearance.rotationDeg).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements[0].appearance.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(["filled", "outline"]).toContain(
      DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectPlacements[0].appearance.renderMode,
    );
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectLightTrail.timeSeconds).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.objectLightTrail.opacity).toBeGreaterThanOrEqual(0);
  });
});
