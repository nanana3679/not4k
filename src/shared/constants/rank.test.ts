import { describe, it, expect } from "vitest";
import { getRank, Rank } from "./rank";

describe("getRank", () => {
  it("100% → SSS", () => {
    expect(getRank(100)).toBe(Rank.SSS);
  });

  it("99.5% → SSS", () => {
    expect(getRank(99.5)).toBe(Rank.SSS);
  });

  it("99.4% → SS", () => {
    expect(getRank(99.4)).toBe(Rank.SS);
  });

  it("99.0% → SS", () => {
    expect(getRank(99.0)).toBe(Rank.SS);
  });

  it("97.0% → S", () => {
    expect(getRank(97.0)).toBe(Rank.S);
  });

  it("95.0% → AAA", () => {
    expect(getRank(95.0)).toBe(Rank.AAA);
  });

  it("90.0% → AA", () => {
    expect(getRank(90.0)).toBe(Rank.AA);
  });

  it("85.0% → A", () => {
    expect(getRank(85.0)).toBe(Rank.A);
  });

  it("80.0% → B", () => {
    expect(getRank(80.0)).toBe(Rank.B);
  });

  it("70.0% → C", () => {
    expect(getRank(70.0)).toBe(Rank.C);
  });

  it("60.0% → D", () => {
    expect(getRank(60.0)).toBe(Rank.D);
  });

  it("59.9% → F", () => {
    expect(getRank(59.9)).toBe(Rank.F);
  });

  it("0% → F", () => {
    expect(getRank(0)).toBe(Rank.F);
  });

  it("경계값 — 각 임계값 바로 아래", () => {
    expect(getRank(98.9)).toBe(Rank.S);
    expect(getRank(96.9)).toBe(Rank.AAA);
    expect(getRank(94.9)).toBe(Rank.AA);
    expect(getRank(89.9)).toBe(Rank.A);
    expect(getRank(84.9)).toBe(Rank.B);
    expect(getRank(79.9)).toBe(Rank.C);
    expect(getRank(69.9)).toBe(Rank.D);
  });
});
