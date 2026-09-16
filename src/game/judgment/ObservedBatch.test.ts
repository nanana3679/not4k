import { describe, expect, it } from "vitest";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { NoteJudgmentSession, type NoteJudgmentSessionOptions, type NoteJudgmentSessionView } from "./NoteJudgmentSession";
import { point, body } from "./noteJudgmentTestHarness";
import type { NoteEntity } from "../../shared/types";

function session(notes: readonly NoteEntity[], options: NoteJudgmentSessionOptions = {}) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d]));
  const ends = new Map<number, number>();
  notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n / note.endBeat.d); });
  return new NoteJudgmentSession(compileJudgmentChart(notes, starts, ends), options);
}

describe("NoteJudgmentSession observed input", () => {
  it("같은 관측 batch의 head Perfect와 유지 Miss는 콤보 0인 한 묶음으로 표시된다", () => {
    const views: NoteJudgmentSessionView[] = [];
    const s = session([body(0, 2000), point(1000, "single", 2)], { onBatchConfirmed: view => views.push(view) });
    s.processBatch(0, [{ key: "A", lane: 1, type: "down" }]);
    s.advance(1080);
    views.length = 0;
    s.processObservedBatch(1000, [{ key: "A", lane: 1, type: "up" }, { key: "B", lane: 2, type: "down" }], 1080);
    expect(views).toHaveLength(1);
    expect(views[0].combo).toBe(0);
    expect(views[0].events.map(event => event.kind)).toEqual(["head", "maintenanceMiss", "dependentZero"]);
  });
  it("raw 1000ms 입력을 1080ms에 관측해도 Point delta는 0이고 확정 시각만 1080ms다", () => {
    const s = session([point(1000)]);
    s.processObservedBatch(1000, [{ key: "A", lane: 1, type: "down" }], 1080);
    expect(s.events).toContainEqual(expect.objectContaining({ kind: "head", grade: "perfect", deltaMs: 0, inputAt: 1000, confirmedAt: 1080 }));
  });

  it("raw 1050ms 늦은 hold 시작을 1070ms에 관측해도 raw delta와 관측 확정 시각을 분리한다", () => {
    const s = session([body(1000, 1060, "long", true)]);
    s.processObservedBatch(1050, [{ key: "A", lane: 1, type: "down" }], 1070);
    expect(s.events).toContainEqual(expect.objectContaining({ kind: "holdOnly", confirmedAt: 1070, inputAt: null }));
  });

  it("이미 1121ms에 확정된 Point Miss는 raw 입력을 1130ms에 관측해도 되살리지 않는다", () => {
    const s = session([point(1000)]);
    s.advance(1121);
    expect(s.events).toContainEqual(expect.objectContaining({ kind: "head", grade: "miss" }));
    s.processObservedBatch(1000, [{ key: "A", lane: 1, type: "down" }], 1130);
    expect(s.events.filter(event => event.kind === "head")).toHaveLength(1);
  });

  it("observed 입력의 type='release' 별칭도 up과 동일하게 terminal을 소비한다", () => {
    const s = session([body(1000, 1100)]);
    s.processObservedBatch(1000, [{ key: "A", lane: 1, type: "down" }], 1000);
    s.processObservedBatch(1100, [{ key: "A", lane: 1, type: "release" }], 1100);
    expect(s.events).toContainEqual(expect.objectContaining({ kind: "release", inputAt: 1100, grade: "perfect" }));
  });
});
