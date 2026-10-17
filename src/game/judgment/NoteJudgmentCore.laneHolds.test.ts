import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { NoteJudgmentCore } from "./NoteJudgmentCore";

/** 레인 1·2에 1000–3000 single 바디를 하나씩 둔 차트. laneHolds는 판정과 무관하게 입력만 센다. */
function twoLaneCore(): NoteJudgmentCore {
  const notes: NoteEntity[] = [
    { type: "long", lane: 1, beat: { n: 1, d: 1 }, endBeat: { n: 3, d: 1 } },
    { type: "long", lane: 2, beat: { n: 1, d: 1 }, endBeat: { n: 3, d: 1 } },
  ];
  return new NoteJudgmentCore({ notes, noteTimesMs: [1000, 1000], noteEndTimesMs: [3000, 3000] });
}

describe("NoteJudgmentCore laneHolds 관측 (RFD 0032 이행 전, 판정에 쓰지 않음)", () => {
  it("processBatch 1000에 레인 1의 A·B와 레인 2의 C를 누르면 count(1)=2·count(2)=1, A up 1800 뒤 count(1)=1", () => {
    const core = twoLaneCore();
    core.processBatch(1000, [
      { key: "A", lane: 1, type: "down" },
      { key: "B", lane: 1, type: "down" },
      { key: "C", lane: 2, type: "down" },
    ]);
    expect(core.laneHolds.count(1)).toBe(2);
    expect(core.laneHolds.count(2)).toBe(1);
    core.processBatch(1800, [{ key: "A", lane: 1, type: "up" }]);
    expect(core.laneHolds.count(1)).toBe(1);
    expect(core.laneHolds.shortSince(1, 2)).toBe(1800);
    expect(core.laneHolds.count(2)).toBe(1);
  });

  it("같은 timestamp 1800 batch에 B down·A up 순으로 와도 core가 up을 먼저 알려 count(1)=1, need 1은 충족이고 need 2의 부족 시작은 X up 1500 그대로", () => {
    const core = twoLaneCore();
    core.processBatch(1000, [{ key: "X", lane: 1, type: "down" }, { key: "A", lane: 1, type: "down" }]);
    core.processBatch(1500, [{ key: "X", lane: 1, type: "up" }]);
    core.processBatch(1800, [{ key: "B", lane: 1, type: "down" }, { key: "A", lane: 1, type: "up" }]);
    expect(core.laneHolds.count(1)).toBe(1);
    expect(core.laneHolds.shortSince(1, 1)).toBeUndefined();
    expect(core.laneHolds.shortSince(1, 2)).toBe(1500);
  });

  it("processObservedBatch(rawAt=1800, [A up], observedAt=1815)의 up은 raw 1800에 기록되어 shortSince(1, 1)=1800", () => {
    const core = twoLaneCore();
    core.processBatch(1000, [{ key: "A", lane: 1, type: "down" }]);
    core.processObservedBatch(1800, [{ key: "A", lane: 1, type: "up" }], 1815);
    expect(core.laneHolds.count(1)).toBe(0);
    expect(core.laneHolds.shortSince(1, 1)).toBe(1800);
  });

  it("lane 없는 handlePress A 1000은 레인 1로 세고 handleRelease A 1500 뒤 shortSince(1, 1)=1500", () => {
    const core = twoLaneCore();
    core.handlePress("A", 1000);
    expect(core.laneHolds.count(1)).toBe(1);
    expect(core.laneHolds.count(2)).toBe(0);
    core.handleRelease("A", 1500);
    expect(core.laneHolds.count(1)).toBe(0);
    expect(core.laneHolds.shortSince(1, 1)).toBe(1500);
  });
});
