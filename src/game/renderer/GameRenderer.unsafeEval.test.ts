import { describe, expect, it } from "vitest";
import gameRendererSource from "./GameRenderer.ts?raw";

describe("GameRenderer unsafe-eval loading", () => {
  it("플레이 화면 Pixi renderer는 app.init 전에 pixi.js/unsafe-eval을 지연 로드", () => {
    const unsafeEvalIndex = gameRendererSource.indexOf('await import("pixi.js/unsafe-eval")');
    const appInitIndex = gameRendererSource.indexOf("await this.app.init");

    expect(unsafeEvalIndex).toBeGreaterThanOrEqual(0);
    expect(appInitIndex).toBeGreaterThan(unsafeEvalIndex);
  });
});
