import { describe, expect, it } from "vitest";
import gameRendererSource from "./GameRenderer.ts?raw";

describe("GameRenderer perspective surface", () => {
  it("surfaceLayer는 backgroundLayer 앞에 추가되어 중앙 레인 배경은 불투명하게 유지됨", () => {
    const backgroundLayerIndex = gameRendererSource.indexOf("this.app.stage.addChild(this.backgroundLayer)");
    const surfaceLayerIndex = gameRendererSource.indexOf("this.app.stage.addChild(this.surfaceLayer)");

    expect(backgroundLayerIndex).toBeGreaterThanOrEqual(0);
    expect(surfaceLayerIndex).toBeGreaterThanOrEqual(0);
    expect(surfaceLayerIndex).toBeLessThan(backgroundLayerIndex);
  });

  it("판정 결과를 받을 recordPerspectiveSurfaceJudgment 메서드가 있음", () => {
    expect(gameRendererSource).toContain("recordPerspectiveSurfaceJudgment(grade: JudgmentGrade): void");
  });
});
