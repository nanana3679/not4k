import { describe, expect, it } from "vitest";
import { derivePlaceholderPerspectiveSurfaceAltitude } from "./perspectiveSurfaceAltitude";

describe("derivePlaceholderPerspectiveSurfaceAltitude", () => {
  it("곡 시작 songTimeMs=0, duration=100000이면 placeholder altitude는 1", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 0,
      chartDurationMs: 100_000,
    })).toBe(1);
  });

  it("곡 중간 songTimeMs=25000, duration=100000이면 placeholder altitude는 0.75", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 25_000,
      chartDurationMs: 100_000,
    })).toBe(0.75);
  });

  it("곡 종료 songTimeMs=100000, duration=100000이면 placeholder altitude는 0", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 100_000,
      chartDurationMs: 100_000,
    })).toBe(0);
  });

  it("songTimeMs가 duration을 넘으면 placeholder altitude는 0으로 clamp", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 120_000,
      chartDurationMs: 100_000,
    })).toBe(0);
  });

  it("duration이 0이면 곡 길이를 모르는 상태로 보고 placeholder altitude는 1", () => {
    expect(derivePlaceholderPerspectiveSurfaceAltitude({
      songTimeMs: 50_000,
      chartDurationMs: 0,
    })).toBe(1);
  });
});
