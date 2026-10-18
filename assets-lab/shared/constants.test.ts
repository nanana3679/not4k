import { describe, it, expect } from "vitest";
import { CW, CH, GF_W, GF_H } from "./constants.js";

describe("shared/constants", () => {
  describe("노트 컨테이너 치수", () => {
    it("CW=100, CH=20 (가로:세로 5:1 비율)", () => {
      expect(CW).toBe(100);
      expect(CH).toBe(20);
      expect(CW / CH).toBe(5);
    });
  });

  describe("기어 프레임 export 치수", () => {
    it("GF_W=447, GF_H=1080 (reference.jsx 뷰포트 기준)", () => {
      expect(GF_W).toBe(447);
      expect(GF_H).toBe(1080);
    });

    it("GF_W, GF_H는 양의 정수", () => {
      expect(GF_W).toBeGreaterThan(0);
      expect(GF_H).toBeGreaterThan(0);
      expect(Number.isInteger(GF_W)).toBe(true);
      expect(Number.isInteger(GF_H)).toBe(true);
    });
  });
});
