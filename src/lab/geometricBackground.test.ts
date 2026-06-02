import { describe, expect, it } from "vitest";
import {
  CENTRAL_LANE_OPACITY,
  clampAltitude,
  DEFAULT_FUNNEL_GRID_PARAMS,
  getGeometricBackgroundParams,
  getFunnelGridParams,
  getPerspectiveSurfaceDepths,
  getRadiatingFlowPhasePx,
  updateRangeBoundary,
} from "./geometricBackground";

describe("geometricBackground", () => {
  it("altitude=1이면 고고도 타일 48px, 패럴랙스 8px/s", () => {
    expect(getGeometricBackgroundParams(1)).toMatchObject({
      altitude: 1,
      tileSizePx: 48,
      tileSizeMinPx: 48,
      tileSizeMaxPx: 180,
      parallaxSpeedPxPerSec: 8,
      parallaxSpeedMinPxPerSec: 8,
      parallaxSpeedMaxPxPerSec: 88,
      horizonOpacity: 1,
      horizonTopPercent: 30,
      groundTopPercent: 33,
    });
  });

  it("altitude=0이면 저고도 타일 180px, 패럴랙스 88px/s, 지평선은 화면 위로 사라짐", () => {
    expect(getGeometricBackgroundParams(0)).toMatchObject({
      altitude: 0,
      tileSizePx: 180,
      tileSizeMinPx: 48,
      tileSizeMaxPx: 180,
      parallaxSpeedPxPerSec: 88,
      parallaxSpeedMinPxPerSec: 8,
      parallaxSpeedMaxPxPerSec: 88,
      horizonOpacity: 0.35,
      horizonTopPercent: -18,
      groundTopPercent: -15,
    });
  });

  it("altitude=0.5이면 타일 크기와 패럴랙스 속도는 중간값, 지평선은 화면 상단 6%", () => {
    expect(getGeometricBackgroundParams(0.5)).toMatchObject({
      altitude: 0.5,
      tileSizePx: 114,
      tileSizeMinPx: 48,
      tileSizeMaxPx: 180,
      parallaxSpeedPxPerSec: 48,
      parallaxSpeedMinPxPerSec: 8,
      parallaxSpeedMaxPxPerSec: 88,
      horizonOpacity: 0.675,
      horizonTopPercent: 6,
      groundTopPercent: 9,
    });
  });

  it("커스텀 tile/speed min/max에서 altitude=1이면 min 값을 사용", () => {
    expect(getGeometricBackgroundParams(1, {
      tileSizeMinPx: 64,
      tileSizeMaxPx: 240,
      parallaxSpeedMinPxPerSec: 12,
      parallaxSpeedMaxPxPerSec: 132,
    })).toMatchObject({
      tileSizePx: 64,
      parallaxSpeedPxPerSec: 12,
    });
  });

  it("커스텀 tile/speed min/max에서 altitude=0이면 max 값을 사용", () => {
    expect(getGeometricBackgroundParams(0, {
      tileSizeMinPx: 64,
      tileSizeMaxPx: 240,
      parallaxSpeedMinPxPerSec: 12,
      parallaxSpeedMaxPxPerSec: 132,
    })).toMatchObject({
      tileSizePx: 240,
      parallaxSpeedPxPerSec: 132,
    });
  });

  it("커스텀 tile/speed min/max에서 altitude=0.5이면 중간값을 사용", () => {
    expect(getGeometricBackgroundParams(0.5, {
      tileSizeMinPx: 64,
      tileSizeMaxPx: 240,
      parallaxSpeedMinPxPerSec: 12,
      parallaxSpeedMaxPxPerSec: 132,
    })).toMatchObject({
      tileSizePx: 152,
      parallaxSpeedPxPerSec: 72,
    });
  });

  it("altitude=-0.25이면 0으로 보정", () => {
    expect(clampAltitude(-0.25)).toBe(0);
  });

  it("altitude=1.25이면 1로 보정", () => {
    expect(clampAltitude(1.25)).toBe(1);
  });

  it("중앙 레인 오버레이는 opacity=1로 완전 불투명", () => {
    expect(CENTRAL_LANE_OPACITY).toBe(1);
  });

  it("funnel grid 기본값은 altitude=1에서 소실점 50%/18%, 곡률 0.65, 반지름 92%", () => {
    expect(getFunnelGridParams()).toEqual(DEFAULT_FUNNEL_GRID_PARAMS);
  });

  it("vanishingY min=-60, max=40에서 altitude=0이면 소실점 Y는 -60%", () => {
    expect(getFunnelGridParams({
      vanishingPointYMinPercent: -60,
      vanishingPointYMaxPercent: 40,
    }, 0).vanishingPointYPercent).toBe(-60);
  });

  it("vanishingY min=-60, max=40에서 altitude=1이면 소실점 Y는 40%", () => {
    expect(getFunnelGridParams({
      vanishingPointYMinPercent: -60,
      vanishingPointYMaxPercent: 40,
    }, 1).vanishingPointYPercent).toBe(40);
  });

  it("vanishingY min=-60, max=40에서 altitude=0.5이면 소실점 Y는 -10%", () => {
    expect(getFunnelGridParams({
      vanishingPointYMinPercent: -60,
      vanishingPointYMaxPercent: 40,
    }, 0.5).vanishingPointYPercent).toBe(-10);
  });

  it("소실점 x=120%, y min=-100%, y max=160%, 곡률=1.4, 반지름=240%이면 허용 범위로 보정", () => {
    expect(getFunnelGridParams({
      vanishingPointXPercent: 120,
      vanishingPointYMinPercent: -100,
      vanishingPointYMaxPercent: 160,
      curvature: 1.4,
      radiusPercent: 240,
    })).toEqual({
      vanishingPointXPercent: 100,
      vanishingPointYPercent: 120,
      vanishingPointYMinPercent: -80,
      vanishingPointYMaxPercent: 120,
      curvature: 1,
      radiusPercent: 180,
    });
  });

  it("소실점 x=-20%, y min=160%, y max=-100%, 곡률=-0.2, 반지름=10%이면 허용 범위로 보정", () => {
    expect(getFunnelGridParams({
      vanishingPointXPercent: -20,
      vanishingPointYMinPercent: 160,
      vanishingPointYMaxPercent: -100,
      curvature: -0.2,
      radiusPercent: 10,
    })).toEqual({
      vanishingPointXPercent: 0,
      vanishingPointYPercent: 120,
      vanishingPointYMinPercent: -80,
      vanishingPointYMaxPercent: 120,
      curvature: 0,
      radiusPercent: 28,
    });
  });

  it("min 핸들이 max=80보다 커지면 min은 80으로 고정", () => {
    expect(updateRangeBoundary({ min: 20, max: 80 }, "min", 100)).toEqual({
      min: 80,
      max: 80,
    });
  });

  it("max 핸들이 min=20보다 작아지면 max는 20으로 고정", () => {
    expect(updateRangeBoundary({ min: 20, max: 80 }, "max", 10)).toEqual({
      min: 20,
      max: 20,
    });
  });

  it("min/max 핸들이 교차하지 않으면 선택한 핸들의 값만 변경", () => {
    expect(updateRangeBoundary({ min: 20, max: 80 }, "min", 40)).toEqual({
      min: 40,
      max: 80,
    });
    expect(updateRangeBoundary({ min: 20, max: 80 }, "max", 60)).toEqual({
      min: 20,
      max: 60,
    });
  });

  it("phase=46px, ringGap=20px이면 방사형 위상은 6px", () => {
    expect(getRadiatingFlowPhasePx(46, 20)).toBe(6);
  });

  it("phase=-3px, ringGap=20px이면 방사형 위상은 17px", () => {
    expect(getRadiatingFlowPhasePx(-3, 20)).toBe(17);
  });

  it("ringGap이 0px이면 방사형 위상은 0px", () => {
    expect(getRadiatingFlowPhasePx(46, 0)).toBe(0);
  });

  it("lineCount=5, exponent=2이면 지평선 근처 간격은 아래쪽으로 갈수록 커짐", () => {
    const depths = getPerspectiveSurfaceDepths(5, 2);

    expect(depths).toEqual([0, 0.0625, 0.25, 0.5625, 1]);
    expect(depths[1] - depths[0]).toBeLessThan(depths[2] - depths[1]);
    expect(depths[2] - depths[1]).toBeLessThan(depths[3] - depths[2]);
    expect(depths[3] - depths[2]).toBeLessThan(depths[4] - depths[3]);
  });

  it("phase=0.5인 depth 샘플도 0..1 사이에서 오름차순으로 유지", () => {
    const depths = getPerspectiveSurfaceDepths(5, 2, 0.5);

    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(depths[0]).toBeGreaterThanOrEqual(0);
    expect(depths[depths.length - 1]).toBeLessThanOrEqual(1);
  });
});
