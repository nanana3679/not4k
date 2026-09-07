import { describe, it, expect } from "vitest";
import {
  MAIN_LANE_COUNT,
  isMainLane,
  isAuxLane,
  mainNotes,
  auxNotes,
  toAuxIndex,
  fromAuxIndex,
  maxAuxLane,
  isVisibleLane,
} from "./laneAxis";

describe("laneAxis", () => {
  describe("isMainLane / isAuxLane", () => {
    it("lane 1~4는 메인 레인", () => {
      expect(isMainLane(1)).toBe(true);
      expect(isMainLane(4)).toBe(true);
    });

    it("lane 5는 메인이 아니라 보조 레인", () => {
      expect(isMainLane(5)).toBe(false);
      expect(isAuxLane(5)).toBe(true);
    });

    it("lane 0·음수는 메인도 보조도 아님", () => {
      expect(isMainLane(0)).toBe(false);
      expect(isAuxLane(0)).toBe(false);
      expect(isMainLane(-1)).toBe(false);
      expect(isAuxLane(-1)).toBe(false);
    });

    it("비정수 lane(2.5, 5.5)은 메인도 보조도 아님", () => {
      expect(isMainLane(2.5)).toBe(false);
      expect(isAuxLane(5.5)).toBe(false);
    });
  });

  describe("mainNotes / auxNotes", () => {
    const notes = [
      { lane: 1, id: "a" },
      { lane: 5, id: "b" },
      { lane: 4, id: "c" },
      { lane: 7, id: "d" },
    ];

    it("mainNotes는 lane 1~4만 남긴다 — lane [1,5,4,7] → [1,4]", () => {
      expect(mainNotes(notes).map((n) => n.id)).toEqual(["a", "c"]);
    });

    it("auxNotes는 lane 5+만 남긴다 — lane [1,5,4,7] → [5,7]", () => {
      expect(auxNotes(notes).map((n) => n.id)).toEqual(["b", "d"]);
    });

    it("mainNotes·auxNotes 모두 원본 상대 순서를 보존한다", () => {
      const shuffled = [{ lane: 6 }, { lane: 2 }, { lane: 5 }, { lane: 1 }];
      expect(mainNotes(shuffled).map((n) => n.lane)).toEqual([2, 1]);
      expect(auxNotes(shuffled).map((n) => n.lane)).toEqual([6, 5]);
    });

    it("lane 0·비정수 노트는 mainNotes에서도 auxNotes에서도 제외 — 게임으로 넘어가지 않음", () => {
      const malformed = [{ lane: 0 }, { lane: 2.5 }, { lane: 3 }];
      expect(mainNotes(malformed).map((n) => n.lane)).toEqual([3]);
      expect(auxNotes(malformed)).toEqual([]);
    });

    it("빈 배열이면 둘 다 빈 배열", () => {
      expect(mainNotes([])).toEqual([]);
      expect(auxNotes([])).toEqual([]);
    });
  });

  describe("toAuxIndex / fromAuxIndex", () => {
    it("lane 5 → 보조 인덱스 1, lane 6 → 2 (보조 파일 extraLane 1-기반)", () => {
      expect(toAuxIndex(5)).toBe(1);
      expect(toAuxIndex(6)).toBe(2);
    });

    it("보조 인덱스 1 → lane 5, 3 → lane 7", () => {
      expect(fromAuxIndex(1)).toBe(5);
      expect(fromAuxIndex(3)).toBe(7);
    });

    it("왕복 항등: fromAuxIndex(toAuxIndex(7)) = 7", () => {
      expect(fromAuxIndex(toAuxIndex(7))).toBe(7);
    });
  });

  describe("maxAuxLane", () => {
    it("보조 노트가 없으면 MAIN_LANE_COUNT(4)", () => {
      expect(maxAuxLane([{ lane: 1 }, { lane: 4 }])).toBe(MAIN_LANE_COUNT);
    });

    it("빈 배열이면 4", () => {
      expect(maxAuxLane([])).toBe(4);
    });

    it("lane 5·7 노트가 있으면 7", () => {
      expect(maxAuxLane([{ lane: 2 }, { lane: 7 }, { lane: 5 }])).toBe(7);
    });

    it("필요한 보조 레인 수 유도: lane 7 점유 시 toAuxIndex(maxAuxLane) = 3", () => {
      expect(toAuxIndex(maxAuxLane([{ lane: 7 }]))).toBe(3);
    });

    it("보조 노트가 없으면 유도되는 보조 레인 수는 0", () => {
      expect(toAuxIndex(maxAuxLane([{ lane: 3 }]))).toBe(0);
    });
  });

  describe("isVisibleLane", () => {
    it("메인 레인은 extraLaneCount 0에서도 항상 보임", () => {
      expect(isVisibleLane(1, 0)).toBe(true);
      expect(isVisibleLane(4, 0)).toBe(true);
    });

    it("extraLaneCount 2에서 lane 6(보조 2)은 보임", () => {
      expect(isVisibleLane(6, 2)).toBe(true);
    });

    it("extraLaneCount 2에서 lane 7(보조 3)은 숨김", () => {
      expect(isVisibleLane(7, 2)).toBe(false);
    });

    it("extraLaneCount 0에서 lane 5는 숨김", () => {
      expect(isVisibleLane(5, 0)).toBe(false);
    });
  });
});
