import { describe, expect, it } from "vitest";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { NoteJudgmentSession } from "./NoteJudgmentSession";
import type { JudgmentInput } from "./JudgmentCore";
import { body, down, point, up } from "./noteJudgmentTestHarness";

describe("판정 입력 관찰 — 실제 적용 순서와 판정 불변", () => {
  it("정상 1000ms·늦게 관측한 raw1010ms 배치에서 입력을 실제 적용 순서대로 관찰하고, 관찰 유무가 판정·점수·효과·바디 상태를 바꾸지 않는다", () => {
    const notes = [point(1000), body(1000, 2000), point(1010, "single", 2)];
    const compiled = compileJudgmentChart(notes, [1000, 1000, 1010], new Map([[1, 2000]]));
    const run = (observeInputs: boolean) => {
      const order: string[] = [];
      const session = new NoteJudgmentSession(compiled);
      const observer = observeInputs ? (input: JudgmentInput) => { order.push(`${input.type} ${input.key}`); } : undefined;
      session.processBatch(1000, [down("A")], observer);
      session.advance(1080);
      session.processObservedBatch(1010, [down("B", 2), up("A")], 1080, observer);
      const score = session.finalize();
      return { order, result: { events: session.events, effects: session.effects, bodies: session.bodyStates, score } };
    };
    const observed = run(true);
    expect(observed.order).toEqual(['down A', 'up A', 'down B']);
    expect(observed.result).toEqual(run(false).result);
  });
});
