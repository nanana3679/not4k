import { describe, it, expect } from "vitest";
import {
  getJudgmentWindows,
  JudgmentMode,
  JUDGMENT_WINDOWS,
  JUDGMENT_WINDOWS_EASY,
} from "./judgment";

describe("getJudgmentWindows", () => {
  it("normal 모드 → 기본 판정 윈도우 반환", () => {
    expect(getJudgmentWindows(JudgmentMode.NORMAL)).toBe(JUDGMENT_WINDOWS);
  });

  it("easy 모드 → Easy 판정 윈도우 반환", () => {
    expect(getJudgmentWindows(JudgmentMode.EASY)).toBe(JUDGMENT_WINDOWS_EASY);
  });

  it("Easy 윈도우는 Normal보다 모든 등급에서 넓다", () => {
    const normal = getJudgmentWindows("normal");
    const easy = getJudgmentWindows("easy");

    expect(easy.PERFECT).toBeGreaterThan(normal.PERFECT);
    expect(easy.GREAT).toBeGreaterThan(normal.GREAT);
    expect(easy.GOOD).toBeGreaterThan(normal.GOOD);
    expect(easy.BAD).toBeGreaterThan(normal.BAD);
  });

  it("Easy PERFECT = 50ms, Normal PERFECT = 41ms", () => {
    expect(JUDGMENT_WINDOWS.PERFECT).toBe(41);
    expect(JUDGMENT_WINDOWS_EASY.PERFECT).toBe(50);
  });
});
