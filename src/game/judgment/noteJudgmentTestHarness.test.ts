import { describe, expect, it, vi } from "vitest";
import { JUDGMENT_WINDOWS } from "../../shared/constants";
import { NoteJudgmentCore } from "./NoteJudgmentCore";
import { body, playHolds } from "./noteJudgmentTestHarness";

describe("playHolds 누름 구간 재생", () => {
  it("[A, 1000, 1000]처럼 up이 down보다 늦지 않은 구간은 up이 먼저 들어가 계속 누른 것이 되므로 예외", () => {
    expect(() => playHolds([body(1000, 2000, "long", true)], [["A", 1000, 1000]])).toThrow("키 A의 up이 down보다 늦지 않음");
    expect(() => playHolds([body(1000, 2000)], [["A", 1500, 1400]])).toThrow("키 A의 up이 down보다 늦지 않음");
  });

  it("같은 키 A 1000–1500·1400–2000처럼 구간이 겹치면 예외", () => {
    expect(() => playHolds([body(1000, 2000)], [["A", 1000, 1500], ["A", 1400, 2000]])).toThrow("키 A의 누름 구간이 겹침");
  });

  it("같은 키 A 1000–1500·1500–2000을 뒤 구간부터 적어도 1500 batch에 up을 down보다 먼저 넣어 떼고 다시 누른 것으로 재생", () => {
    const batches = vi.spyOn(NoteJudgmentCore.prototype, "processBatch");
    try {
      playHolds([body(1000, 2000)], [["A", 1500, 2000], ["A", 1000, 1500]]);
      expect(batches.mock.calls.map(([at, inputs]) => [at, inputs.map(input => input.type)])).toEqual([
        [1000, ["down"]], [1500, ["up", "down"]], [2000, ["up"]], [2000 + JUDGMENT_WINDOWS.GOOD + 1, []],
      ]);
    } finally {
      batches.mockRestore();
    }
  });
});
