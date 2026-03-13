import { describe, it, expect } from "vitest";
import { formatTimingDiff } from "./formatTimingDiff";

describe("formatTimingDiff", () => {
  it("양수 deltaMs → '+12.34ms' 형식으로 표시", () => {
    expect(formatTimingDiff(12.34, false)).toBe("+12.34ms");
  });

  it("음수 deltaMs → '-5.67ms' 형식으로 표시", () => {
    expect(formatTimingDiff(-5.67, false)).toBe("-5.67ms");
  });

  it("deltaMs가 0이면 '+0.00ms'로 표시", () => {
    expect(formatTimingDiff(0, false)).toBe("+0.00ms");
  });

  it("소수점 2자리까지만 표시 — 12.345 → '+12.35ms'", () => {
    expect(formatTimingDiff(12.345, false)).toBe("+12.35ms");
  });

  it("miss일 때는 null 반환 (표시하지 않음)", () => {
    expect(formatTimingDiff(10, true)).toBeNull();
  });

  it("deltaMs가 undefined이면 null 반환", () => {
    expect(formatTimingDiff(undefined, false)).toBeNull();
  });

  it("miss이고 deltaMs도 undefined이면 null 반환", () => {
    expect(formatTimingDiff(undefined, true)).toBeNull();
  });

  it("매우 작은 음수 -0.01 → '-0.01ms'", () => {
    expect(formatTimingDiff(-0.01, false)).toBe("-0.01ms");
  });

  it("큰 양수 deltaMs 999.99 → '+999.99ms'", () => {
    expect(formatTimingDiff(999.99, false)).toBe("+999.99ms");
  });
});
