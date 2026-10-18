import { describe, expect, it } from "vitest";
import type { NoteEntity } from "../../shared/types";
import { NoteJudgmentCore } from "./NoteJudgmentCore";

const notes = (...value: NoteEntity[]) => ({
  notes: value,
  noteTimesMs: value.map((_, i) => i === 0 ? 0 : i === 1 ? 1000 : 2000),
  noteEndTimesMs: value.map((note, i) => "endBeat" in note ? (i === 0 ? 1000 : 2000) : undefined),
});

describe("NoteJudgmentCore", () => {
  it("NJ-A02: 500ms부터 잡은 키는 1000ms holdOnly의 시작을 대신하지 못해 기한에 Miss", () => {
    const core = new NoteJudgmentCore(notes({ type: "long", lane: 1, beat: { n: 1, d: 1 }, endBeat: { n: 2, d: 1 }, holdOnly: true }));
    core.press("A", 500); core.advance(1121);
    expect(core.confirmed.some(e => e.kind === "maintenanceMiss" && e.grade === "miss")).toBe(true);
  });

  it("NJ-R01: headless single은 시작 down과 끝 up으로 Perfect 두 판정을 확정", () => {
    const core = new NoteJudgmentCore(notes({ type: "long", lane: 1, beat: { n: 1, d: 1 }, endBeat: { n: 2, d: 1 } }));
    core.press("A", 0); core.release("A", 1000);
    expect(core.confirmed).toHaveLength(1);
    expect(core.confirmed.filter(e => e.kind === "release")[0]).toMatchObject({ noteIndex: 0, grade: "perfect", key: "A", consumed: true });
  });

  it("NJ-H01: double holdOnly는 두 등록 unit을 유지하면 두 Perfect를 확정", () => {
    const core = new NoteJudgmentCore(notes({ type: "doubleLong", lane: 1, beat: { n: 1, d: 1 }, endBeat: { n: 2, d: 1 }, holdOnly: true }));
    core.press("A", 0); core.press("B", 0); core.advance(1000);
    expect(core.confirmed.filter(e => e.kind === "holdOnly")).toHaveLength(2);
  });

  it("NJ-A06: E 이후 S+Good 안의 늦은 down도 holdOnly를 활성화하고 Perfect", () => {
    const core = new NoteJudgmentCore({ notes: [{ type: "long", lane: 1, beat: { n: 1, d: 1 }, endBeat: { n: 2, d: 1 }, holdOnly: true }], noteTimesMs: [1000], noteEndTimesMs: [1060] });
    core.press("A", 1100); core.advance(1121);
    expect(core.confirmed.some(e => e.kind === "holdOnly" && e.grade === "perfect")).toBe(true);
  });

  it("NJ-F02: 같은 timestamp의 다른 lane 입력은 lane 매칭을 보존하고 유지 Miss를 만들지 않음", () => {
    const chart = {
      notes: [
        { type: "long", lane: 1 as const, beat: { n: 0, d: 1 }, endBeat: { n: 1, d: 1 } },
        { type: "long", lane: 2 as const, beat: { n: 0, d: 1 }, endBeat: { n: 1, d: 1 } },
      ], noteTimesMs: [0, 0], noteEndTimesMs: [1000, 1000],
    } as const;
    const core = new NoteJudgmentCore(chart);
    core.processBatch(0, [{ key: "A", lane: 1, type: "down" }, { key: "B", lane: 2, type: "down" }]);
    core.processBatch(1000, [{ key: "A", lane: 1, type: "up" }, { key: "B", lane: 2, type: "up" }]);
    expect(core.confirmed.filter(e => e.kind === "maintenanceMiss")).toHaveLength(0);
  });
});
