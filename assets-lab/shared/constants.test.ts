import { describe, it, expect } from "vitest";
import { CW, CH, GF_W, GF_H, LANE_GAP, LANE_W, GEAR_PAD, FIELD_W, LANE_H, LANE_TOP, LANE_BOT, JUDGE_Y, noteX } from "./constants.js";

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

  describe("기어 레이아웃 상수", () => {
    it("LANE_W = CW + LANE_GAP = 104", () => {
      expect(LANE_W).toBe(CW + LANE_GAP);
      expect(LANE_W).toBe(104);
    });

    it("FIELD_W = LANE_W * 4 = 416", () => {
      expect(FIELD_W).toBe(LANE_W * 4);
      expect(FIELD_W).toBe(416);
    });

    it("LANE_BOT = LANE_TOP + LANE_H", () => {
      expect(LANE_BOT).toBe(LANE_TOP + LANE_H);
    });

    it("JUDGE_Y = LANE_BOT - CH * 2 (판정선은 하단에서 노트 2개 높이 위)", () => {
      expect(JUDGE_Y).toBe(LANE_BOT - CH * 2);
    });
  });

  describe("noteX 함수", () => {
    it("noteX(0) = GEAR_PAD + (LANE_W - CW) / 2 = 20", () => {
      expect(noteX(0)).toBe(GEAR_PAD + (LANE_W - CW) / 2);
      expect(noteX(0)).toBe(20);
    });

    it("noteX(1) - noteX(0) = LANE_W = 104 (레인 간격 일정)", () => {
      expect(noteX(1) - noteX(0)).toBe(LANE_W);
    });

    it("noteX(3) = GEAR_PAD + 3 * LANE_W + (LANE_W - CW) / 2 = 332", () => {
      expect(noteX(3)).toBe(332);
    });
  });
});
