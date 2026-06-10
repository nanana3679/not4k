import { describe, expect, it } from "vitest";
import mainSource from "./main.tsx?raw";

describe("main entry Pixi import", () => {
  it("lab 진입점은 pixi.js/unsafe-eval을 전역 import하지 않아 Pixi environment handler를 중복 등록하지 않음", () => {
    expect(mainSource).not.toContain("pixi.js/unsafe-eval");
  });
});
