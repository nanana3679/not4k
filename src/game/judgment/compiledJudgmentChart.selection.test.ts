import { describe, expect, it } from "vitest";
import { compileJudgmentChart, selectCompiledJudgmentChart } from "./compiledJudgmentChart";
import { body, down, point } from "./noteJudgmentTestHarness";
import { NoteJudgmentSession } from "./NoteJudgmentSession";

describe("compiled chart test-play selection", () => {
  it("startTimeMs 이전 head/body를 제외하고 정확히 같은 시각의 head와 item ID는 유지한다", () => {
    const chart = compileJudgmentChart([point(0), body(0, 500), point(1000)], [0, 0, 1000], new Map([[1, 500]]));
    const selected = selectCompiledJudgmentChart(chart, 1000);
    expect(selected.excludedNoteIndices).toEqual(new Set([0, 1]));
    expect(selected.items.map(item => item.id)).toEqual(["n2:head"]);
    expect(selected.notes.map(note => note.noteIndex)).toEqual([2]);
    expect(selected.connections).toHaveLength(0);
    expect(selected.theoreticalWeight).toBe(3);
    const session = new NoteJudgmentSession(selected);
    session.processBatch(1000, [down("A")]);
    expect(session.finalize()).toMatchObject({ achievementRate: 100, isFullCombo: true, processedNotes: 1 });
    expect(session.events.map(event => event.noteIndex)).toEqual([2]);
  });

  it("제외된 predecessor의 connection을 제거해 미래 headless body가 유령 승계되지 않는다", () => {
    const chart = compileJudgmentChart([body(0, 1000, "long", true), body(1000, 2000)], [0, 1000], new Map([[0, 1000], [1, 2000]]));
    const selected = selectCompiledJudgmentChart(chart, 1000);
    expect(selected.notes[0]?.predecessorIndex).toBeUndefined();
    expect(selected.units[0]?.predecessorIndex).toBeUndefined();
    expect(selected.connections).toEqual([]);
    const session = new NoteJudgmentSession(selected);
    session.processBatch(500, [down("A")]);
    session.advance(1121);
    expect(session.bodyStates).toHaveLength(1);
    expect(session.bodyStates[0]).toMatchObject({ noteIndex: 1, active: false, failed: true });
    expect(session.finalize()).toMatchObject({ achievementRate: 0, processedNotes: 1 });
    expect(session.events.every(event => event.noteIndex === 1)).toBe(true);
  });

  it("모든 note가 cursor 이전이면 items와 이론 분모가 0이다", () => {
    const chart = compileJudgmentChart([point(0), body(100, 200)], [0, 100], new Map([[1, 200]]));
    const selected = selectCompiledJudgmentChart(chart, 1000);
    expect(selected.notes).toEqual([]);
    expect(selected.items).toEqual([]);
    expect(selected.units).toEqual([]);
    expect(selected.theoreticalWeight).toBe(0);
    const session = new NoteJudgmentSession(selected);
    expect(session.finalize()).toMatchObject({ achievementRate: 0, processedNotes: 0, finalDenominatorWeight: 0 });
    expect(session.events).toEqual([]);
  });
});
