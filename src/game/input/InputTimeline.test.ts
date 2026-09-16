import { describe, expect, it } from "vitest";
import { InputTimeline } from "./InputTimeline";

describe("InputTimeline", () => {
  it("서로 다른 raw timestamp를 한 frame flush에서 각각 processBatch로 전달한다", () => {
    const timeline = new InputTimeline();
    timeline.enqueueMany([
      { inputAt: 110, key: "B", lane: 1, type: "down" },
      { inputAt: 90, key: "A", lane: 1, type: "up" },
      { inputAt: 110, key: "A", lane: 1, type: "down" },
    ]);
    const batches: Array<[number, readonly unknown[]]> = [];
    expect(timeline.flushThrough(110, (at, inputs) => batches.push([at, inputs]))).toBe(2);
    expect(batches.map(([at]) => at)).toEqual([90, 110]);
    expect((batches[1][1] as Array<{ key: string }>).map(input => input.key)).toEqual(["B", "A"]);
    expect(timeline.size).toBe(0);
  });

  it("frame 경계 뒤 입력은 다음 flush까지 보존한다", () => {
    const timeline = new InputTimeline();
    timeline.enqueue({ inputAt: 101, key: "A", lane: 2, type: "down" });
    expect(timeline.flushThrough(100, () => undefined)).toBe(0);
    expect(timeline.size).toBe(1);
    expect(timeline.flushThrough(101, () => undefined)).toBe(1);
  });
});
