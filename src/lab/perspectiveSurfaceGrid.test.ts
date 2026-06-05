import { describe, expect, it } from "vitest";
import {
  buildPerspectiveSurfaceGrid,
  getPerspectiveGridObjectMarker,
  projectGroundPoint,
  resolveGroundPointFromSpanCell,
  resolveGroundPointFromSpanPosition,
  resolvePerspectiveSurfaceGridParamsFromAltitude,
  resolveSpanCellFromGroundPoint,
  resolveSpanGridSize,
  resolveSpanPositionFromGroundPoint,
  toggleGroundPointAtSpanCell,
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

  it("radialStrength=0이면 x=6은 z=4와 z=12에서 같은 screenX를 유지", () => {
    const nearPoint = projectGroundPoint({ x: 6, z: 4 }, NO_RADIAL_WARP);
    const farPoint = projectGroundPoint({ x: 6, z: 12 }, NO_RADIAL_WARP);

    expect(farPoint.screenXPercent).toBeCloseTo(nearPoint.screenXPercent, 6);
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

  it("radialStrength=0이면 surfaceAngleDeg=45에서도 같은 x의 column은 수직선으로 유지", () => {
    const rightZ4 = projectGroundPoint({ x: 8, z: 4 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const rightZ8 = projectGroundPoint({ x: 8, z: 8 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const rightZ12 = projectGroundPoint({ x: 8, z: 12 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const leftZ4 = projectGroundPoint({ x: -8, z: 4 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const leftZ8 = projectGroundPoint({ x: -8, z: 8 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const leftZ12 = projectGroundPoint({ x: -8, z: 12 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });

    expect(rightZ4.screenXPercent).toBeCloseTo(rightZ8.screenXPercent, 6);
    expect(rightZ8.screenXPercent).toBeCloseTo(rightZ12.screenXPercent, 6);
    expect(leftZ4.screenXPercent).toBeCloseTo(leftZ8.screenXPercent, 6);
    expect(leftZ8.screenXPercent).toBeCloseTo(leftZ12.screenXPercent, 6);
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

  it("radialStrength=0이면 z=4와 z=16 row의 좌우 폭이 같아 직교 격자에 가까움", () => {
    const nearLeft = projectGroundPoint({ x: -8, z: 4 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const nearRight = projectGroundPoint({ x: 8, z: 4 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const farLeft = projectGroundPoint({ x: -8, z: 16 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });
    const farRight = projectGroundPoint({ x: 8, z: 16 }, { ...NO_RADIAL_WARP, surfaceAngleDeg: 45 });

    expect(nearRight.screenXPercent - nearLeft.screenXPercent)
      .toBeCloseTo(farRight.screenXPercent - farLeft.screenXPercent, 6);
  });

  it("radialStrength=1이면 horizon에 가까운 z=16 row 폭이 가까운 z=4 row 폭보다 좁아짐", () => {
    const nearLeft = projectGroundPoint({ x: -8, z: 4 }, { radialStrength: 1, surfaceAngleDeg: 45, zFar: 16 });
    const nearRight = projectGroundPoint({ x: 8, z: 4 }, { radialStrength: 1, surfaceAngleDeg: 45, zFar: 16 });
    const farLeft = projectGroundPoint({ x: -8, z: 16 }, { radialStrength: 1, surfaceAngleDeg: 45, zFar: 16 });
    const farRight = projectGroundPoint({ x: 8, z: 16 }, { radialStrength: 1, surfaceAngleDeg: 45, zFar: 16 });

    expect(farRight.screenXPercent - farLeft.screenXPercent)
      .toBeLessThan(nearRight.screenXPercent - nearLeft.screenXPercent);
  });

  it("radialStrength=1이어도 같은 z=12 row의 x=-8,0,8은 screenY가 같아 같은 지표면 row에 남음", () => {
    const leftPoint = projectGroundPoint({ x: -8, z: 12 }, { radialStrength: 1, surfaceAngleDeg: 45 });
    const centerPoint = projectGroundPoint({ x: 0, z: 12 }, { radialStrength: 1, surfaceAngleDeg: 45 });
    const rightPoint = projectGroundPoint({ x: 8, z: 12 }, { radialStrength: 1, surfaceAngleDeg: 45 });

    expect(leftPoint.screenYPercent).toBeCloseTo(centerPoint.screenYPercent, 6);
    expect(rightPoint.screenYPercent).toBeCloseTo(centerPoint.screenYPercent, 6);
  });

  it("radialStrength=1에서도 x=4, z=12 object는 row와 column의 taper 교차점을 공유", () => {
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

  it("scrollOffsetZ=1이면 x=4, z=8 object는 스크롤된 row z=7 교차점으로 이동", () => {
    const grid = buildPerspectiveSurfaceGrid({
      ...NO_RADIAL_WARP,
      gridSpacing: 4,
      scrollOffsetZ: 1,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 16,
    });
    const rowPoint = grid.rows
      .find((row) => row.z === 7)
      ?.points.find((point) => point.x === 4);
    const objectMarker = getPerspectiveGridObjectMarker({ x: 4, z: 8 }, grid.params);

    expect(rowPoint).toBeDefined();
    expect(objectMarker.z).toBe(7);
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

  it("gridCount=6, gridSpacing=4이면 x는 좌우 6칸까지, z는 앞쪽 6칸까지 생성", () => {
    const grid = buildPerspectiveSurfaceGrid({
      ...NO_RADIAL_WARP,
      gridCount: 6,
      gridSpacing: 4,
      zNear: 4,
      zFar: 16,
    });

    expect(grid.params.xMin).toBe(-24);
    expect(grid.params.xMax).toBe(24);
    expect(grid.params.zFar).toBe(28);
    expect(grid.rows.map((row) => row.z)).toEqual([4, 8, 12, 16, 20, 24, 28]);
    expect(grid.columns.map((column) => column.x)).toEqual([
      -24,
      -20,
      -16,
      -12,
      -8,
      -4,
      0,
      4,
      8,
      12,
      16,
      20,
      24,
    ]);
  });

  it("scrollOffsetZ=1, gridSpacing=4이면 row z가 1만큼 가까워진 위치로 순환", () => {
    const grid = buildPerspectiveSurfaceGrid({
      ...NO_RADIAL_WARP,
      gridSpacing: 4,
      scrollOffsetZ: 1,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 16,
    });

    expect(grid.rows.map((row) => row.z)).toEqual([7, 11, 15]);
  });

  it("scrollOffsetZ=5, gridSpacing=4이면 row line phase는 1로 반복되어 빈틈 없이 이어짐", () => {
    const grid = buildPerspectiveSurfaceGrid({
      ...NO_RADIAL_WARP,
      gridSpacing: 4,
      scrollOffsetZ: 5,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 16,
    });

    expect(grid.rows.map((row) => row.z)).toEqual([7, 11, 15]);
  });

  it("scrollOffsetZ=5이면 x=4, z=8 object는 1칸이 아니라 scroll span 기준 z=27로 순환", () => {
    const grid = buildPerspectiveSurfaceGrid({
      ...NO_RADIAL_WARP,
      gridSpacing: 4,
      scrollOffsetZ: 5,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 28,
    });
    const rowPoint = grid.rows
      .find((row) => row.z === 27)
      ?.points.find((point) => point.x === 4);
    const objectMarker = getPerspectiveGridObjectMarker({ x: 4, z: 8 }, grid.params);

    expect(rowPoint).toBeDefined();
    expect(objectMarker.z).toBe(27);
    expect(objectMarker.screenXPercent).toBeCloseTo(rowPoint?.screenXPercent ?? 0, 6);
    expect(objectMarker.screenYPercent).toBeCloseTo(rowPoint?.screenYPercent ?? 0, 6);
  });

  it("scrollOffsetZ=29이면 scroll span 24를 넘은 나머지 5로 object z=27이 됨", () => {
    const marker = getPerspectiveGridObjectMarker(
      { x: 4, z: 8 },
      {
        ...NO_RADIAL_WARP,
        gridSpacing: 4,
        scrollOffsetZ: 29,
        xMin: -8,
        xMax: 8,
        zNear: 4,
        zFar: 28,
      },
    );

    expect(marker.z).toBe(27);
  });

  it("span x=0.75, z=0.5이면 x=-8~8, z=4~28 범위에서 object는 x=4, z=16에 배치", () => {
    const point = resolveGroundPointFromSpanPosition(
      { x: 0.75, z: 0.5 },
      {
        ...NO_RADIAL_WARP,
        xMin: -8,
        xMax: 8,
        zNear: 4,
        zFar: 28,
      },
    );

    expect(point.x).toBeCloseTo(4, 6);
    expect(point.z).toBeCloseTo(16, 6);
  });

  it("object x=4, z=16이면 x=-8~8, z=4~28 범위에서 span x=0.75, z=0.5로 표시", () => {
    const span = resolveSpanPositionFromGroundPoint(
      { x: 4, z: 16 },
      {
        ...NO_RADIAL_WARP,
        xMin: -8,
        xMax: 8,
        zNear: 4,
        zFar: 28,
      },
    );

    expect(span.x).toBeCloseTo(0.75, 6);
    expect(span.z).toBeCloseTo(0.5, 6);
  });

  it("gridSpacing=4, x=-8~8, z=4~28이면 span grid는 가로 4칸, 세로 6칸", () => {
    const size = resolveSpanGridSize({
      ...NO_RADIAL_WARP,
      gridSpacing: 4,
      xMin: -8,
      xMax: 8,
      zNear: 4,
      zFar: 28,
    });

    expect(size).toEqual({ columns: 4, rows: 6 });
  });

  it("span grid의 위쪽 첫 칸 column=0,row=0은 지평선 쪽 셀 중심 x=-6,z=26으로 배치", () => {
    const point = resolveGroundPointFromSpanCell(
      { column: 0, row: 0 },
      { columns: 4, rows: 6 },
      {
        ...NO_RADIAL_WARP,
        xMin: -8,
        xMax: 8,
        zNear: 4,
        zFar: 28,
      },
    );

    expect(point.x).toBeCloseTo(-6, 6);
    expect(point.z).toBeCloseTo(26, 6);
  });

  it("span grid의 아래쪽 마지막 칸 column=3,row=5는 가까운 셀 중심 x=6,z=6으로 배치", () => {
    const point = resolveGroundPointFromSpanCell(
      { column: 3, row: 5 },
      { columns: 4, rows: 6 },
      {
        ...NO_RADIAL_WARP,
        xMin: -8,
        xMax: 8,
        zNear: 4,
        zFar: 28,
      },
    );

    expect(point.x).toBeCloseTo(6, 6);
    expect(point.z).toBeCloseTo(6, 6);
  });

  it("object x=6,z=6이면 span grid 4x6에서 아래쪽 마지막 칸 column=3,row=5가 선택됨", () => {
    const cell = resolveSpanCellFromGroundPoint(
      { x: 6, z: 6 },
      { columns: 4, rows: 6 },
      {
        ...NO_RADIAL_WARP,
        xMin: -8,
        xMax: 8,
        zNear: 4,
        zFar: 28,
      },
    );

    expect(cell).toEqual({ column: 3, row: 5 });
  });

  it("빈 object 목록에서 span cell column=0,row=0을 토글하면 x=-6,z=26 object가 추가됨", () => {
    const objects = toggleGroundPointAtSpanCell(
      [],
      { column: 0, row: 0 },
      { columns: 4, rows: 6 },
      {
        ...NO_RADIAL_WARP,
        xMin: -8,
        xMax: 8,
        zNear: 4,
        zFar: 28,
      },
    );

    expect(objects).toEqual([{ x: -6, z: 26 }]);
  });

  it("이미 object가 있는 span cell column=0,row=0을 다시 토글하면 해당 object가 제거됨", () => {
    const objects = toggleGroundPointAtSpanCell(
      [{ x: -6, z: 26 }, { x: 6, z: 6 }],
      { column: 0, row: 0 },
      { columns: 4, rows: 6 },
      {
        ...NO_RADIAL_WARP,
        xMin: -8,
        xMax: 8,
        zNear: 4,
        zFar: 28,
      },
    );

    expect(objects).toEqual([{ x: 6, z: 6 }]);
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
      gridCount: { altitude0: 10, altitude1: 18 },
      scrollSpeed: { altitude0: 20, altitude1: 4 },
      forwardLightOpacity: { altitude0: 0.8, altitude1: 0.2 },
      forwardLightHeightPercent: { altitude0: 80, altitude1: 40 },
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
    expect(params.gridCount).toBe(12);
    expect(params.scrollSpeed).toBeCloseTo(16, 6);
    expect(params.forwardLightOpacity).toBeCloseTo(0.65, 6);
    expect(params.forwardLightHeightPercent).toBeCloseTo(70, 6);
    expect(params.zFar).toBeCloseTo(52, 6);
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
      gridCount: { altitude0: 18, altitude1: 10 },
      scrollSpeed: { altitude0: 20, altitude1: 4 },
      forwardLightOpacity: { altitude0: 0.8, altitude1: 0.2 },
      forwardLightHeightPercent: { altitude0: 80, altitude1: 40 },
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
      gridCount: { altitude0: 10, altitude1: 18 },
      scrollSpeed: { altitude0: 20, altitude1: 4 },
      forwardLightOpacity: { altitude0: 0.8, altitude1: 0.2 },
      forwardLightHeightPercent: { altitude0: 80, altitude1: 40 },
      zFar: { altitude0: 16, altitude1: 48 },
    };

    expect(resolvePerspectiveSurfaceGridParamsFromAltitude(-1, ranges).horizonYPercent).toBe(10);
    expect(resolvePerspectiveSurfaceGridParamsFromAltitude(2, ranges).horizonYPercent).toBe(50);
  });
});
