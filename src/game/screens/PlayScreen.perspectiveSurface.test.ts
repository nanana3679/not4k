import { describe, expect, it } from "vitest";
import playScreenSource from "./PlayScreen.tsx?raw";

describe("PlayScreen perspective surface altitude", () => {
  it("판정 콜백은 result.grade를 renderer의 perspective surface altitude로 전달함", () => {
    const altitudeJudgmentIndex = playScreenSource.indexOf("renderer.recordPerspectiveSurfaceJudgment(result.grade);");
    const scoreJudgmentIndex = playScreenSource.indexOf("scoreManager.recordJudgment(result.grade");

    expect(altitudeJudgmentIndex).toBeGreaterThanOrEqual(0);
    expect(altitudeJudgmentIndex).toBeGreaterThan(scoreJudgmentIndex);
  });
});
