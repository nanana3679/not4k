import { describe, expect, it } from "vitest";
import { beat, type NoteEntity } from "../../shared";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { ZeroHoldOnlyState, type ZeroHoldKey } from "./ZeroHoldOnlyState";

const key = (key: string, lane: number): ZeroHoldKey => ({ key, lane });
function compiled(notes: readonly NoteEntity[]) {
  const starts = new Map(notes.map((note, index) => [index, note.beat.n / note.beat.d] as [number, number]));
  const ends = new Map<number, number>();
  notes.forEach((note, index) => { if ("endBeat" in note) ends.set(index, note.endBeat.n / note.endBeat.d); });
  return compileJudgmentChart(notes, starts, ends);
}

describe("ZeroHoldOnlyState", () => {
  it("zeroH [1000,1000]을 500부터 held 관측하면 S=1000에 한 unit만 Perfect로 확정한다", () => {
    const state = new ZeroHoldOnlyState(compiled([{ type: "long", lane: 1, beat: beat(1000), endBeat: beat(1000), holdOnly: true }]));
    expect(state.observe(500, [key("A", 1)])).toEqual([]);
    expect(state.observe(1000, [key("A", 1)])).toMatchObject([{ itemId: "n0:holdOnly:0", key: "A", at: 1000 }]);
  });

  it("double zeroH에서 A만 held이면 unit 하나만 Perfect이고 남은 unit은 deadline에 Miss 후보가 된다", () => {
    const state = new ZeroHoldOnlyState(compiled([{ type: "doubleLong", lane: 1, beat: beat(1000), endBeat: beat(1000), holdOnly: true }]));
    expect(state.observe(1000, [key("A", 1)])).toHaveLength(1);
    expect(state.expireBefore(1121)).toMatchObject([{ itemId: "n0:holdOnly:1", unitIndex: 1 }]);
  });

  it("AB가 890/895와 900/905에 tap하면 zeroH 두 unit이 각각 실제 up 시각에 Perfect가 된다", () => {
    const state = new ZeroHoldOnlyState(compiled([{ type: "doubleLong", lane: 1, beat: beat(1000), endBeat: beat(1000), holdOnly: true }]));
    state.observe(890, [key("A", 1)]);
    expect(state.release("A", 1, 895, true)[0]).toMatchObject({ key: "A", at: 895 });
    state.observe(900, [key("B", 1)]);
    expect(state.release("B", 1, 905, true)[0]).toMatchObject({ key: "B", at: 905 });
    expect(state.expireBefore(1121)).toEqual([]);
  });

  it("L2 held는 L1 zeroH unit을 성공시키지 못하고 lane별 상태를 분리한다", () => {
    const state = new ZeroHoldOnlyState(compiled([{ type: "long", lane: 1, beat: beat(1000), endBeat: beat(1000), holdOnly: true }]));
    expect(state.observe(1000, [key("A", 2)])).toEqual([]);
    expect(state.expireBefore(1121)).toMatchObject([{ lane: 1, itemId: "n0:holdOnly:0" }]);
  });

  it("같은 note에서 같은 key를 두 번 release해도 하나의 holdOnly item만 성공한다", () => {
    const state = new ZeroHoldOnlyState(compiled([{ type: "doubleLong", lane: 1, beat: beat(1000), endBeat: beat(1000), holdOnly: true }]));
    expect(state.release("A", 1, 895, true)).toHaveLength(1);
    expect(state.release("A", 1, 900, true)).toEqual([]);
  });

  it("정확한 deadline 1120ms held 관측은 성공하지만 1121ms 관측은 expire 후 성공하지 않는다", () => {
    const state = new ZeroHoldOnlyState(compiled([{ type: "long", lane: 1, beat: beat(1000), endBeat: beat(1000), holdOnly: true }]));
    expect(state.observe(1120, [key("A", 1)])).toMatchObject([{ at: 1120, itemId: "n0:holdOnly:0" }]);
    const late = new ZeroHoldOnlyState(compiled([{ type: "long", lane: 1, beat: beat(1000), endBeat: beat(1000), holdOnly: true }]));
    expect(late.expireBefore(1121)).toHaveLength(1);
    expect(late.observe(1121, [key("A", 1)])).toEqual([]);
  });

  it("S 이후 1100ms down 관측은 즉시 Perfect가 되고 같은 시각 up은 추가 성공을 만들지 않는다", () => {
    const state = new ZeroHoldOnlyState(compiled([{ type: "long", lane: 1, beat: beat(1000), endBeat: beat(1000), holdOnly: true }]));
    expect(state.observe(1100, [key("A", 1)])).toMatchObject([{ at: 1100, key: "A" }]);
    expect(state.release("A", 1, 1100, true)).toEqual([]);
  });
});
