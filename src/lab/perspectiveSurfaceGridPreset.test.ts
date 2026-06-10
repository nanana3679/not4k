import { describe, expect, it } from "vitest";
import {
  createPerspectiveSurfaceGridPreset,
  formatPerspectiveSurfaceGridPresetModule,
} from "./perspectiveSurfaceGridPreset";

describe("perspectiveSurfaceGridPreset", () => {
  it("현재 lab 설정은 인게임에서 import 가능한 DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET 모듈로 직렬화", () => {
    const preset = createPerspectiveSurfaceGridPreset({
      altitude: 0.35,
      surfacePattern: "triangles",
      surfaceRanges: {
        horizonYPercent: { altitude0: 12, altitude1: 30 },
        cameraHeight: { altitude0: 3, altitude1: 5 },
        fieldOfView: { altitude0: 8, altitude1: 13 },
        surfaceAngleDeg: { altitude0: 24, altitude1: 45 },
        radialVanishingYPercent: { altitude0: -14, altitude1: 8 },
        radialVanishingZ: { altitude0: 4, altitude1: 8 },
        radialStrength: { altitude0: 0.08, altitude1: 0.28 },
        gridSpacing: { altitude0: 2, altitude1: 4 },
        gridCount: { altitude0: 8, altitude1: 6 },
        scrollSpeed: { altitude0: 20, altitude1: 5 },
        forwardLightOpacity: { altitude0: 0.72, altitude1: 0.16 },
        forwardLightHeightPercent: { altitude0: 70, altitude1: 30 },
        zFar: { altitude0: 16, altitude1: 28 },
      },
      params: {
        horizonYPercent: 18.3,
        cameraHeight: 3.7,
        fieldOfView: 9.75,
        surfaceAngleDeg: 31.35,
        radialVanishingYPercent: -6.3,
        radialVanishingZ: 5.4,
        radialStrength: 0.15,
        gridSpacing: 3,
        gridCount: 7,
        scrollSpeed: 14.75,
        scrollOffsetZ: 9.25,
        forwardLightOpacity: 0.5,
        forwardLightHeightPercent: 58,
        xMin: -21,
        xMax: 21,
        zNear: 4,
        zFar: 25,
      },
      spanGridSize: { columns: 14, rows: 7 },
      objectPlacements: [
        {
          x: -3.25,
          z: 18.5,
          heightY: 3.5,
          appearance: {
            shape: "point",
            diameter: 1.4,
            outlineWidth: 0.32,
            rotationDeg: 180,
            color: "#ffcc66",
            renderMode: "outline",
          },
        },
        {
          x: 9,
          z: 7,
          heightY: 0,
          appearance: {
            shape: "point",
            diameter: 0.7,
            outlineWidth: 0.12,
            rotationDeg: 45,
            color: "#66e7ff",
            renderMode: "filled",
          },
        },
      ],
      objectConnections: [{ fromIndex: 0, toIndex: 1 }],
      objectLightTrail: { timeSeconds: 0.24, opacity: 0.68 },
    });

    const moduleSource = formatPerspectiveSurfaceGridPresetModule(preset);

    expect(moduleSource).toContain("import type { PerspectiveSurfaceGridPreset }");
    expect(moduleSource).toContain("DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET");
    expect(moduleSource).toContain('"altitude": 0.35');
    expect(moduleSource).toContain('"surfacePattern": "triangles"');
    expect(moduleSource).toContain('"objectPlacements"');
    expect(moduleSource).toContain('"objectConnections"');
    expect(moduleSource).toContain('"fromIndex": 0');
    expect(moduleSource).toContain('"toIndex": 1');
    expect(moduleSource).toContain('"x": -3.25');
    expect(moduleSource).toContain('"z": 18.5');
    expect(moduleSource).toContain('"heightY": 3.5');
    expect(moduleSource).toContain('"shape": "point"');
    expect(moduleSource).toContain('"diameter": 1.4');
    expect(moduleSource).toContain('"outlineWidth": 0.32');
    expect(moduleSource).toContain('"rotationDeg": 180');
    expect(moduleSource).toContain('"color": "#ffcc66"');
    expect(moduleSource).toContain('"renderMode": "outline"');
    expect(moduleSource).toContain('"shape": "point"');
    expect(moduleSource).toContain('"outlineWidth": 0.12');
    expect(moduleSource).toContain('"rotationDeg": 45');
    expect(moduleSource).toContain('"color": "#66e7ff"');
    expect(moduleSource).toContain('"renderMode": "filled"');
    expect(moduleSource).toContain('"timeSeconds": 0.24');
    expect(moduleSource).toContain('"scrollOffsetZ": 0');
  });
});
