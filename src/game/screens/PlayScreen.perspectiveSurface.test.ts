import { describe, expect, it } from "vitest";
import playScreenSource from "./PlayScreen.tsx?raw";

describe("PlayScreen perspective surface altitude", () => {
  it("판정 콜백은 판정 효과의 grade를 renderer의 perspective surface altitude로 전달함", () => {
    const altitudeJudgmentIndex = playScreenSource.indexOf("renderer.recordPerspectiveSurfaceJudgment(effects.judgmentText.grade);");
    const scoreJudgmentIndex = playScreenSource.indexOf("scoreManager.recordJudgment(effects.scoreRecord.grade");

    expect(altitudeJudgmentIndex).toBeGreaterThanOrEqual(0);
    expect(altitudeJudgmentIndex).toBeGreaterThan(scoreJudgmentIndex);
  });
});
