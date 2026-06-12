import { describe, expect, it } from "vitest";
import {
  GEAR_GAUGE_METADATA,
  getGaugeSpritePlacement,
  getGaugeTextureFrame,
} from "./gearGauge";

describe("getGaugeTextureFrame", () => {
  it("텍스처 528x1536에서 게이지 1.0이면 프레임은 전체 (0, 0, 528, 1536)", () => {
    const frame = getGaugeTextureFrame({ width: 528, height: 1536 }, 1);
    expect(frame).toEqual({ x: 0, y: 0, width: 528, height: 1536, visible: true });
  });

  it("텍스처 528x1536에서 게이지 0.5이면 y=768, height=768 하단 절반", () => {
    const frame = getGaugeTextureFrame({ width: 528, height: 1536 }, 0.5);
    expect(frame).toEqual({ x: 0, y: 768, width: 528, height: 768, visible: true });
  });

  it("게이지 0이면 visible false", () => {
    const frame = getGaugeTextureFrame({ width: 528, height: 1536 }, 0);
    expect(frame.visible).toBe(false);
  });

  it("게이지 1.2는 1.0으로 클램프되어 전체 높이", () => {
    const frame = getGaugeTextureFrame({ width: 528, height: 1536 }, 1.2);
    expect(frame.y).toBe(0);
    expect(frame.height).toBe(1536);
    expect(frame.visible).toBe(true);
  });

  it("게이지 -0.5는 0으로 클램프되어 visible false", () => {
    const frame = getGaugeTextureFrame({ width: 528, height: 1536 }, -0.5);
    expect(frame.visible).toBe(false);
  });

  it("보이는 높이가 1px 미만이면 height는 1로 클램프되고 visible false", () => {
    const frame = getGaugeTextureFrame({ width: 528, height: 1536 }, 0.0002);
    expect(frame.height).toBe(1);
    expect(frame.visible).toBe(false);
    expect(frame.y + frame.height).toBeLessThanOrEqual(1536);
  });

  it("y와 height는 정수 (uv 시머 방지)", () => {
    const frame = getGaugeTextureFrame({ width: 528, height: 1537 }, 0.333);
    expect(Number.isInteger(frame.y)).toBe(true);
    expect(Number.isInteger(frame.height)).toBe(true);
  });
});

describe("getGaugeSpritePlacement", () => {
  it("outputScale 0.5이면 sprite scale은 srcScale의 2배", () => {
    const placement = getGaugeSpritePlacement(
      { x: 0, y: 0, width: 100, height: 100 },
      0.2,
      0,
      0,
      0.5,
    );
    expect(placement.scale).toBeCloseTo(0.4);
  });

  it("box(435,559,1056,3073), srcScale 0.25, frame(100,50)일 때 좌하단 기준 x=208.75, y=958", () => {
    const placement = getGaugeSpritePlacement(
      { x: 435, y: 559, width: 1056, height: 3073 },
      0.25,
      100,
      50,
      0.5,
    );
    // x = 100 + 435 * 0.25, y = 50 + (559 + 3073) * 0.25
    expect(placement.x).toBeCloseTo(208.75);
    expect(placement.y).toBeCloseTo(958);
  });
});

describe("GEAR_GAUGE_METADATA", () => {
  it("좌/우 columnBox가 원본 3404x4704 내부이고 치수가 양수", () => {
    const { sourceWidth, sourceHeight, columnBoxes } = GEAR_GAUGE_METADATA;
    expect(sourceWidth).toBe(3404);
    expect(sourceHeight).toBe(4704);
    for (const box of [columnBoxes.left, columnBoxes.right]) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(sourceWidth);
      expect(box.y + box.height).toBeLessThanOrEqual(sourceHeight);
    }
  });

  it("outputScale은 0 초과 1 이하", () => {
    expect(GEAR_GAUGE_METADATA.outputScale).toBeGreaterThan(0);
    expect(GEAR_GAUGE_METADATA.outputScale).toBeLessThanOrEqual(1);
  });
});
