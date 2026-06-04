import { describe, expect, it } from "vitest";
import {
  buildPerspectiveSurfaceGrid,
  getPerspectiveGridObjectMarker,
  projectGroundPoint,
  resolvePerspectiveSurfaceGridParamsFromAltitude,
} from "./perspectiveSurfaceGrid";

const NO_RADIAL_WARP = { radialStrength: 0 };

describe("perspectiveSurfaceGrid", () => {
  it("x=4, z=8 교차점은 row와 column과 object가 같은 screen 좌표를 공유", () => {
    const grid = buildPerspectiveSurfaceGrid({
      ...NO_RADIAL_WARP,
      gridSpacing: 4,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 16,
      horizonYPercent: 28,
      surfaceAngleDeg: 18,
    });
    const rowPoint = grid.rows
      .find((row) => row.z === 8)
      ?.points.find((point) => point.x === 4);
    const columnPoint = grid.columns
      .find((column) => column.x === 4)
      ?.points.find((point) => point.z === 8);
    const objectMarker = getPerspectiveGridObjectMarker({ x: 4, z: 8 }, grid.params);

    expect(rowPoint).toBeDefined();
    expect(columnPoint).toBeDefined();
    expect(rowPoint?.screenXPercent).toBeCloseTo(columnPoint?.screenXPercent ?? 0, 6);
    expect(rowPoint?.screenYPercent).toBeCloseTo(columnPoint?.screenYPercent ?? 0, 6);
    expect(objectMarker.screenXPercent).toBeCloseTo(rowPoint?.screenXPercent ?? 0, 6);
    expect(objectMarker.screenYPercent).toBeCloseTo(rowPoint?.screenYPercent ?? 0, 6);
  });

  it("x=6은 z=4보다 z=12에서 소실점 x=50에 더 가까워짐", () => {
    const nearPoint = projectGroundPoint({ x: 6, z: 4 }, NO_RADIAL_WARP);
    const farPoint = projectGroundPoint({ x: 6, z: 12 }, NO_RADIAL_WARP);

    expect(Math.abs(farPoint.screenXPercent - 50)).toBeLessThan(Math.abs(nearPoint.screenXPercent - 50));
  });

  it("surfaceAngleDeg=0이면 모든 z가 수평선 y=28 위의 한 줄로 보임", () => {
    const z4 = projectGroundPoint({ x: 0, z: 4 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 0 });
    const z8 = projectGroundPoint({ x: 0, z: 8 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 0 });
    const z12 = projectGroundPoint({ x: 0, z: 12 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 0 });

    expect(z4.screenYPercent).toBeCloseTo(28, 6);
    expect(z8.screenYPercent).toBeCloseTo(28, 6);
    expect(z12.screenYPercent).toBeCloseTo(28, 6);
  });

  it("surfaceAngleDeg=90이면 같은 x는 z와 무관하게 같은 screenX를 유지하는 정면 평면이 됨", () => {
    const nearPoint = projectGroundPoint({ x: 6, z: 4 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 90 });
    const farPoint = projectGroundPoint({ x: 6, z: 12 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 90 });
    const z4 = projectGroundPoint({ x: 0, z: 4 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 90 });
    const z8 = projectGroundPoint({ x: 0, z: 8 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 90 });
    const z12 = projectGroundPoint({ x: 0, z: 12 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 90 });

    expect(nearPoint.screenXPercent).toBeCloseTo(farPoint.screenXPercent, 6);
    expect(z8.screenYPercent - z4.screenYPercent).toBeCloseTo(z12.screenYPercent - z8.screenYPercent, 6);
  });

  it("surfaceAngleDeg=45이면 가까운 z=4가 먼 z=12보다 화면 아래에 보임", () => {
    const z4 = projectGroundPoint({ x: 0, z: 4 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 45 });
    const z8 = projectGroundPoint({ x: 0, z: 8 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 45 });
    const z12 = projectGroundPoint({ x: 0, z: 12 }, { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 45 });

    expect(z4.screenYPercent).toBeGreaterThan(z8.screenYPercent);
    expect(z8.screenYPercent).toBeGreaterThan(z12.screenYPercent);
  });

  it("surfaceAngleDeg=45에서 세로선은 중간 z=8이 직선보다 소실점 x=50 쪽으로 휨", () => {
    const rightZ4 = projectGroundPoint({ x: 8, z: 4 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const rightZ8 = projectGroundPoint({ x: 8, z: 8 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const rightZ12 = projectGroundPoint({ x: 8, z: 12 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const rightStraightMidX = (rightZ4.screenXPercent + rightZ12.screenXPercent) / 2;
    const leftZ4 = projectGroundPoint({ x: -8, z: 4 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const leftZ8 = projectGroundPoint({ x: -8, z: 8 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const leftZ12 = projectGroundPoint({ x: -8, z: 12 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const leftStraightMidX = (leftZ4.screenXPercent + leftZ12.screenXPercent) / 2;

    expect(rightZ8.screenXPercent).toBeLessThan(rightStraightMidX);
    expect(leftZ8.screenXPercent).toBeGreaterThan(leftStraightMidX);
  });

  it("surfaceAngleDeg=45에서 z가 소실점에 가까울수록 row y 간격이 작아져 수평선에서 평평해짐", () => {
    const z4 = projectGroundPoint(
      { x: 0, z: 4 },
      { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 45, zFar: 16 },
    );
    const z8 = projectGroundPoint(
      { x: 0, z: 8 },
      { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 45, zFar: 16 },
    );
    const z12 = projectGroundPoint(
      { x: 0, z: 12 },
      { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 45, zFar: 16 },
    );
    const z16 = projectGroundPoint(
      { x: 0, z: 16 },
      { ...NO_RADIAL_WARP, horizonYPercent: 28, surfaceAngleDeg: 45, zFar: 16 },
    );

    expect(z4.screenYPercent - z8.screenYPercent).toBeGreaterThan(z8.screenYPercent - z12.screenYPercent);
    expect(z8.screenYPercent - z12.screenYPercent).toBeGreaterThan(z12.screenYPercent - z16.screenYPercent);
    expect(z16.screenYPercent).toBeCloseTo(28, 6);
  });

  it("surfaceAngleDeg=45에서 소실점에서 먼 세로선 segment가 가장 가파르고 소실점으로 갈수록 완만해짐", () => {
    const points = [4, 8, 12, 16, 20, 24, 28].map((z) => (
      projectGroundPoint({ x: 8, z }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45, zFar: 28 })
    ));
    const slopes = points.slice(0, -1).map((point, index) => {
      const nextPoint = points[index + 1];

      return Math.abs((nextPoint.screenYPercent - point.screenYPercent) / (
        nextPoint.screenXPercent - point.screenXPercent
      ));
    });

    expect(slopes[0]).toBeGreaterThan(slopes[1]);
    expect(slopes[1]).toBeGreaterThan(slopes[2]);
    expect(slopes[2]).toBeGreaterThan(slopes[3]);
    expect(slopes[3]).toBeGreaterThan(slopes[4]);
    expect(slopes[4]).toBeGreaterThan(slopes[5]);
  });

  it("radialStrength=1이면 같은 z=12 row의 x=-8,0,8은 screenY가 같아 수평 직선에 가깝게 보임", () => {
    const leftPoint = projectGroundPoint(
      { x: -8, z: 12 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 24, surfaceAngleDeg: 45 },
    );
    const centerPoint = projectGroundPoint(
      { x: 0, z: 12 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 24, surfaceAngleDeg: 45 },
    );
    const rightPoint = projectGroundPoint(
      { x: 8, z: 12 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 24, surfaceAngleDeg: 45 },
    );

    expect(leftPoint.screenYPercent).toBeCloseTo(centerPoint.screenYPercent, 6);
    expect(rightPoint.screenYPercent).toBeCloseTo(centerPoint.screenYPercent, 6);
  });

  it("radialStrength=1이면 같은 x=8 column은 파란 중심점에서 같은 각도로 뻗는 ray가 됨", () => {
    const z8 = projectGroundPoint(
      { x: 8, z: 8 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 24, surfaceAngleDeg: 45 },
    );
    const z16 = projectGroundPoint(
      { x: 8, z: 16 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 24, surfaceAngleDeg: 45 },
    );
    const z24 = projectGroundPoint(
      { x: 8, z: 24 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 24, surfaceAngleDeg: 45 },
    );

    expect(getAngleFromRadialCenter(z16, 8)).toBeCloseTo(getAngleFromRadialCenter(z8, 8), 6);
    expect(getAngleFromRadialCenter(z24, 8)).toBeCloseTo(getAngleFromRadialCenter(z8, 8), 6);
  });

  it("radialVanishingZ=24이면 radialVanishingZ=8보다 같은 z=12 row의 x=8 가로 변화가 더 완만함", () => {
    const nearVanishingCenter = projectGroundPoint(
      { x: 0, z: 12 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 8, surfaceAngleDeg: 45 },
    );
    const nearVanishingSide = projectGroundPoint(
      { x: 8, z: 12 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 8, surfaceAngleDeg: 45 },
    );
    const farVanishingCenter = projectGroundPoint(
      { x: 0, z: 12 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 24, surfaceAngleDeg: 45 },
    );
    const farVanishingSide = projectGroundPoint(
      { x: 8, z: 12 },
      { radialStrength: 1, radialVanishingYPercent: 8, radialVanishingZ: 24, surfaceAngleDeg: 45 },
    );

    expect(Math.abs(farVanishingSide.screenXPercent - farVanishingCenter.screenXPercent))
      .toBeLessThan(Math.abs(nearVanishingSide.screenXPercent - nearVanishingCenter.screenXPercent));
  });

  it("radialStrength=1에서도 x=4, z=12 object는 row와 column의 polar 교차점을 공유", () => {
    const grid = buildPerspectiveSurfaceGrid({
      radialStrength: 1,
      radialVanishingYPercent: 8,
      radialVanishingZ: 24,
      gridSpacing: 4,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 16,
    });
    const rowPoint = grid.rows
      .find((row) => row.z === 12)
      ?.points.find((point) => point.x === 4);
    const columnPoint = grid.columns
      .find((column) => column.x === 4)
      ?.points.find((point) => point.z === 12);
    const objectMarker = getPerspectiveGridObjectMarker({ x: 4, z: 12 }, grid.params);

    expect(rowPoint).toBeDefined();
    expect(columnPoint).toBeDefined();
    expect(rowPoint?.screenXPercent).toBeCloseTo(columnPoint?.screenXPercent ?? 0, 6);
    expect(rowPoint?.screenYPercent).toBeCloseTo(columnPoint?.screenYPercent ?? 0, 6);
    expect(objectMarker.screenXPercent).toBeCloseTo(rowPoint?.screenXPercent ?? 0, 6);
    expect(objectMarker.screenYPercent).toBeCloseTo(rowPoint?.screenYPercent ?? 0, 6);
  });

  it("gridSpacing=4이면 row z와 column x는 논리 좌표에서 4 간격으로 생성", () => {
    const grid = buildPerspectiveSurfaceGrid({
      ...NO_RADIAL_WARP,
      gridSpacing: 4,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 16,
    });

    expect(grid.rows.map((row) => row.z)).toEqual([4, 8, 12, 16]);
    expect(grid.columns.map((column) => column.x)).toEqual([-8, -4, 0, 4, 8]);
  });

  it("altitude=0.25이면 horizonYPercent Alt 0=10, Alt 1=50에서 20으로 보간", () => {
    const params = resolvePerspectiveSurfaceGridParamsFromAltitude(0.25, {
      horizonYPercent: { altitude0: 10, altitude1: 50 },
      cameraHeight: { altitude0: 2, altitude1: 6 },
      fieldOfView: { altitude0: 8, altitude1: 20 },
      surfaceAngleDeg: { altitude0: 10, altitude1: 70 },
      radialVanishingYPercent: { altitude0: -20, altitude1: 40 },
      radialVanishingZ: { altitude0: 4, altitude1: 20 },
      radialStrength: { altitude0: 0.1, altitude1: 0.9 },
      gridSpacing: { altitude0: 2, altitude1: 10 },
      zFar: { altitude0: 16, altitude1: 48 },
    });

    expect(params.horizonYPercent).toBeCloseTo(20, 6);
    expect(params.cameraHeight).toBeCloseTo(3, 6);
    expect(params.fieldOfView).toBeCloseTo(11, 6);
    expect(params.surfaceAngleDeg).toBeCloseTo(25, 6);
    expect(params.radialVanishingYPercent).toBeCloseTo(-5, 6);
    expect(params.radialVanishingZ).toBeCloseTo(8, 6);
    expect(params.radialStrength).toBeCloseTo(0.3, 6);
    expect(params.gridSpacing).toBeCloseTo(4, 6);
    expect(params.zFar).toBeCloseTo(24, 6);
  });

  it("altitude=0.25이면 horizonYPercent Alt 0=50, Alt 1=10에서 1-altitude 가중치로 40이 됨", () => {
    const params = resolvePerspectiveSurfaceGridParamsFromAltitude(0.25, {
      horizonYPercent: { altitude0: 50, altitude1: 10 },
      cameraHeight: { altitude0: 6, altitude1: 2 },
      fieldOfView: { altitude0: 20, altitude1: 8 },
      surfaceAngleDeg: { altitude0: 70, altitude1: 10 },
      radialVanishingYPercent: { altitude0: 40, altitude1: -20 },
      radialVanishingZ: { altitude0: 20, altitude1: 4 },
      radialStrength: { altitude0: 0.9, altitude1: 0.1 },
      gridSpacing: { altitude0: 10, altitude1: 2 },
      zFar: { altitude0: 48, altitude1: 16 },
    });

    expect(params.horizonYPercent).toBeCloseTo(40, 6);
    expect(params.cameraHeight).toBeCloseTo(5, 6);
    expect(params.fieldOfView).toBeCloseTo(17, 6);
    expect(params.radialStrength).toBeCloseTo(0.7, 6);
  });

  it("altitude=-1과 altitude=2는 각각 0과 1로 clamp되어 Alt 0/Alt 1 끝값을 사용", () => {
    const ranges = {
      horizonYPercent: { altitude0: 10, altitude1: 50 },
      cameraHeight: { altitude0: 2, altitude1: 6 },
      fieldOfView: { altitude0: 8, altitude1: 20 },
      surfaceAngleDeg: { altitude0: 10, altitude1: 70 },
      radialVanishingYPercent: { altitude0: -20, altitude1: 40 },
      radialVanishingZ: { altitude0: 4, altitude1: 20 },
      radialStrength: { altitude0: 0.1, altitude1: 0.9 },
      gridSpacing: { altitude0: 2, altitude1: 10 },
      zFar: { altitude0: 16, altitude1: 48 },
    };

    expect(resolvePerspectiveSurfaceGridParamsFromAltitude(-1, ranges).horizonYPercent).toBe(10);
    expect(resolvePerspectiveSurfaceGridParamsFromAltitude(2, ranges).horizonYPercent).toBe(50);
  });
});

function getAngleFromRadialCenter(point: { screenXPercent: number; screenYPercent: number }, radialY: number): number {
  return Math.atan2(point.screenXPercent - 50, point.screenYPercent - radialY);
}
