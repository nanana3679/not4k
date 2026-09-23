import { describe, expect, it } from "vitest";
import { AutoPlayer, type AutoSectionMs } from "./AutoPlayer";
import { compileJudgmentChart } from "../judgment/compiledJudgmentChart";
import { body, point } from "../judgment/noteJudgmentTestHarness";
import type { NoteEntity } from "../../shared/types";

function player(notes: readonly NoteEntity[], sections: readonly AutoSectionMs[]) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d]));
  const ends = new Map(notes.flatMap((note, index) => "endBeat" in note
    ? [[index, note.endBeat.n / note.endBeat.d] as const] : []));
  return new AutoPlayer(notes, starts, ends, sections, compileJudgmentChart(notes, starts, ends));
}

describe("compiled AutoPlayer의 실제 누름과 뗌 대응", () => {
  it("AutoEvent가 없으면 Point·헤드가 있는 long·독립 doubleLong에서 press와 release를 모두 생성하지 않는다", () => {
    const auto = player([point(1000), point(2000), body(2000, 2500), body(3000, 4000, "doubleLong")], []);
    expect(auto.eventsThrough(5000)).toEqual([]);
    expect(auto.eventsThrough(6000)).toEqual([]);
  });

  it("1000ms에 자동으로 누른 long은 AutoEvent가 1500ms에 끝나도 2000ms에 한 번 뗀다", () => {
    const auto = player([point(1000), body(1000, 2000)], [{ startMs: 1000, endMs: 1500 }]);
    const presses = auto.eventsThrough(1000);
    expect(presses).toEqual([{ lane: 1, timeMs: 1000, key: "auto_1_0_a", type: "press" }]);
    expect(auto.eventsThrough(1500)).toEqual([]);
    expect(auto.eventsThrough(2000)).toEqual([{ ...presses[0], timeMs: 2000, type: "release" }]);
    expect(auto.eventsThrough(2500)).toEqual([]);
  });

  it("자동 구간의 1000ms long에서 수동 구간의 2000ms long으로 이어지면 자동 키만 2000ms에 떼고 3000ms의 가짜 뗌은 생성하지 않는다", () => {
    const auto = player([point(1000), body(1000, 2000), point(2000), body(2000, 3000)], [{ startMs: 1000, endMs: 1500 }]);
    expect(auto.eventsThrough(4000)).toEqual([
      { lane: 1, timeMs: 1000, key: "auto_1_0_a", type: "press" },
      { lane: 1, timeMs: 2000, key: "auto_1_0_a", type: "release" },
    ]);
  });
});
