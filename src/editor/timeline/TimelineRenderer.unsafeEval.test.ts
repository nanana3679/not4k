import { describe, expect, it } from "vitest";
import timelineRendererSource from "./TimelineRenderer.ts?raw";

describe("TimelineRenderer unsafe-eval loading", () => {
  it("에디터 Pixi renderer는 app.init 전에 pixi.js/unsafe-eval을 지연 로드", () => {
    const unsafeEvalIndex = timelineRendererSource.indexOf('await import("pixi.js/unsafe-eval")');
    const appInitIndex = timelineRendererSource.indexOf("await this.app.init");

    expect(unsafeEvalIndex).toBeGreaterThanOrEqual(0);
    expect(appInitIndex).toBeGreaterThan(unsafeEvalIndex);
  });
});
