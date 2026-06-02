import { describe, expect, it } from "vitest";
import {
  buildPerspectiveSurfaceGrid,
  getPerspectiveGridObjectMarker,
  projectGroundPoint,
} from "./perspectiveSurfaceGrid";

describe("perspectiveSurfaceGrid", () => {
  it("x=4, z=8 교차점은 row와 column과 object가 같은 screen 좌표를 공유", () => {
    const grid = buildPerspectiveSurfaceGrid({
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
    const nearPoint = projectGroundPoint({ x: 6, z: 4 });
    const farPoint = projectGroundPoint({ x: 6, z: 12 });

    expect(Math.abs(farPoint.screenXPercent - 50)).toBeLessThan(Math.abs(nearPoint.screenXPercent - 50));
  });

  it("surfaceAngleDeg=0이면 모든 z가 수평선 y=28 위의 한 줄로 보임", () => {
    const z4 = projectGroundPoint({ x: 0, z: 4 }, { horizonYPercent: 28, surfaceAngleDeg: 0 });
    const z8 = projectGroundPoint({ x: 0, z: 8 }, { horizonYPercent: 28, surfaceAngleDeg: 0 });
    const z12 = projectGroundPoint({ x: 0, z: 12 }, { horizonYPercent: 28, surfaceAngleDeg: 0 });

    expect(z4.screenYPercent).toBeCloseTo(28, 6);
    expect(z8.screenYPercent).toBeCloseTo(28, 6);
    expect(z12.screenYPercent).toBeCloseTo(28, 6);
  });

  it("surfaceAngleDeg=90이면 같은 x는 z와 무관하게 같은 screenX를 유지하는 정면 평면이 됨", () => {
    const nearPoint = projectGroundPoint({ x: 6, z: 4 }, { surfaceAngleDeg: 90 });
    const farPoint = projectGroundPoint({ x: 6, z: 12 }, { surfaceAngleDeg: 90 });
    const z4 = projectGroundPoint({ x: 0, z: 4 }, { horizonYPercent: 28, surfaceAngleDeg: 90 });
    const z8 = projectGroundPoint({ x: 0, z: 8 }, { horizonYPercent: 28, surfaceAngleDeg: 90 });
    const z12 = projectGroundPoint({ x: 0, z: 12 }, { horizonYPercent: 28, surfaceAngleDeg: 90 });

    expect(nearPoint.screenXPercent).toBeCloseTo(farPoint.screenXPercent, 6);
    expect(z8.screenYPercent - z4.screenYPercent).toBeCloseTo(z12.screenYPercent - z8.screenYPercent, 6);
  });

  it("surfaceAngleDeg=45이면 가까운 z=4가 먼 z=12보다 화면 아래에 보임", () => {
    const z4 = projectGroundPoint({ x: 0, z: 4 }, { horizonYPercent: 28, surfaceAngleDeg: 45 });
    const z8 = projectGroundPoint({ x: 0, z: 8 }, { horizonYPercent: 28, surfaceAngleDeg: 45 });
    const z12 = projectGroundPoint({ x: 0, z: 12 }, { horizonYPercent: 28, surfaceAngleDeg: 45 });

    expect(z4.screenYPercent).toBeGreaterThan(z8.screenYPercent);
    expect(z8.screenYPercent).toBeGreaterThan(z12.screenYPercent);
  });

  it("surfaceAngleDeg=45에서 세로선은 중간 z=8이 직선보다 소실점 x=50 쪽으로 휨", () => {
    const rightZ4 = projectGroundPoint({ x: 8, z: 4 }, { surfaceAngleDeg: 45 });
    const rightZ8 = projectGroundPoint({ x: 8, z: 8 }, { surfaceAngleDeg: 45 });
    const rightZ12 = projectGroundPoint({ x: 8, z: 12 }, { surfaceAngleDeg: 45 });
    const rightStraightMidX = (rightZ4.screenXPercent + rightZ12.screenXPercent) / 2;
    const leftZ4 = projectGroundPoint({ x: -8, z: 4 }, { surfaceAngleDeg: 45 });
    const leftZ8 = projectGroundPoint({ x: -8, z: 8 }, { surfaceAngleDeg: 45 });
    const leftZ12 = projectGroundPoint({ x: -8, z: 12 }, { surfaceAngleDeg: 45 });
    const leftStraightMidX = (leftZ4.screenXPercent + leftZ12.screenXPercent) / 2;

    expect(rightZ8.screenXPercent).toBeLessThan(rightStraightMidX);
    expect(leftZ8.screenXPercent).toBeGreaterThan(leftStraightMidX);
  });

  it("surfaceAngleDeg=45에서 z가 소실점에 가까울수록 row y 간격이 작아져 수평선에서 평평해짐", () => {
    const z4 = projectGroundPoint({ x: 0, z: 4 }, { horizonYPercent: 28, surfaceAngleDeg: 45, zFar: 16 });
    const z8 = projectGroundPoint({ x: 0, z: 8 }, { horizonYPercent: 28, surfaceAngleDeg: 45, zFar: 16 });
    const z12 = projectGroundPoint({ x: 0, z: 12 }, { horizonYPercent: 28, surfaceAngleDeg: 45, zFar: 16 });
    const z16 = projectGroundPoint({ x: 0, z: 16 }, { horizonYPercent: 28, surfaceAngleDeg: 45, zFar: 16 });

    expect(z4.screenYPercent - z8.screenYPercent).toBeGreaterThan(z8.screenYPercent - z12.screenYPercent);
    expect(z8.screenYPercent - z12.screenYPercent).toBeGreaterThan(z12.screenYPercent - z16.screenYPercent);
    expect(z16.screenYPercent).toBeCloseTo(28, 6);
  });

  it("surfaceAngleDeg=45에서 소실점에서 먼 세로선 segment가 가장 가파르고 소실점으로 갈수록 완만해짐", () => {
    const points = [4, 8, 12, 16, 20, 24, 28].map((z) => (
      projectGroundPoint({ x: 8, z }, { surfaceAngleDeg: 45, zFar: 28 })
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

  it("gridSpacing=4이면 row z와 column x는 논리 좌표에서 4 간격으로 생성", () => {
    const grid = buildPerspectiveSurfaceGrid({
      gridSpacing: 4,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 16,
    });

    expect(grid.rows.map((row) => row.z)).toEqual([4, 8, 12, 16]);
    expect(grid.columns.map((column) => column.x)).toEqual([-8, -4, 0, 4, 8]);
  });
});
