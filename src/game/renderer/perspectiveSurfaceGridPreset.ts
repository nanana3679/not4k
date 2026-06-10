import type { PerspectiveSurfaceGridPreset } from "../../lab/perspectiveSurfaceGrid";

export const DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET: PerspectiveSurfaceGridPreset = {
  "altitude": 0,
  "surfacePattern": "triangles",
  "surfaceRanges": {
    "horizonYPercent": {
      "altitude0": 12,
      "altitude1": 30
    },
    "cameraHeight": {
      "altitude0": 3,
      "altitude1": 5
    },
    "fieldOfView": {
      "altitude0": 8,
      "altitude1": 13
    },
    "surfaceAngleDeg": {
      "altitude0": 24,
      "altitude1": 45
    },
    "radialVanishingYPercent": {
      "altitude0": -14,
      "altitude1": 8
    },
    "radialVanishingZ": {
      "altitude0": 4,
      "altitude1": 8
    },
    "radialStrength": {
      "altitude0": 0.08,
      "altitude1": 0.28
    },
    "gridSpacing": {
      "altitude0": 2,
      "altitude1": 4
    },
    "gridCount": {
      "altitude0": 28,
      "altitude1": 6
    },
    "scrollSpeed": {
      "altitude0": 20,
      "altitude1": 5
    },
    "forwardLightOpacity": {
      "altitude0": 0.72,
      "altitude1": 0.16
    },
    "forwardLightHeightPercent": {
      "altitude0": 70,
      "altitude1": 30
    },
    "zFar": {
      "altitude0": 16,
      "altitude1": 28
    }
  },
  "params": {
    "horizonYPercent": 12,
    "cameraHeight": 3,
    "fieldOfView": 8,
    "surfaceAngleDeg": 24,
    "radialVanishingYPercent": -14,
    "radialVanishingZ": 4,
    "radialStrength": 0.08,
    "gridSpacing": 2,
    "gridCount": 28,
    "scrollSpeed": 20,
    "scrollOffsetZ": 0,
    "forwardLightOpacity": 0.72,
    "forwardLightHeightPercent": 70,
    "xMin": -56,
    "xMax": 56,
    "zNear": 4,
    "zFar": 60
  },
  "spanGridSize": {
    "columns": 9,
    "rows": 21
  },
  "objectPlacements": [
    {
      "x": 4,
      "z": 8,
      "heightY": 0,
      "appearance": {
        "shape": "triangle",
        "diameter": 0.96,
        "outlineWidth": 0.18,
        "rotationDeg": 0,
        "color": "#ebfffb",
        "renderMode": "outline"
      }
    }
  ],
  "objectConnections": [],
  "objectLightTrail": {
    "timeSeconds": 0.18,
    "opacity": 0.72
  }
};
