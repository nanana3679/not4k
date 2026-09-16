import { describe, expect, it } from "vitest";
import { beat, type NoteEntity, type TrillZone } from "../../shared";
import { compileJudgmentChart } from "./compiledJudgmentChart";
import { ScoreManager } from "../scoring/ScoreManager";

describe("compileJudgmentChart", () => {
  it("NJ-C02: Beat가 정확히 맞닿은 같은 레인 바디만 connection으로 연결한다", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
      { type: "long", lane: 1, beat: beat(1, 1000), endBeat: beat(2) },
    ];
    const chart = compileJudgmentChart(notes, [0, 500, 500.001], [500, 1000, 1000]);
    expect(chart.connections.map((connection) => [connection.predecessorIndex, connection.successorIndex])).toEqual([[0, 1]]);
  });

  it("near-but-not-equal Beat: 1ms 시간 차이가 있어도 Beat가 다르면 독립 바디로 둔다", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "long", lane: 1, beat: beat(1, 1000), endBeat: beat(2) },
    ];
    const chart = compileJudgmentChart(notes, [0, 501], [500, 1000]);
    expect(chart.connections).toEqual([]);
  });

  it("double 감소와 terminal은 source unit 수에 따라 release 항목을 안정적으로 생성한다", () => {
    const notes: NoteEntity[] = [
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const chart = compileJudgmentChart(notes, [0, 500], [500, 1000]);
    expect(chart.items.filter((item) => item.kind === "release").map((item) => item.id)).toEqual(["n0:release:0", "n1:release:0"]);
    expect(chart.theoreticalWeight).toBe(6);
  });

  it("double Point head는 두 개의 독립 head 점수 항목으로 컴파일한다", () => {
    const notes: NoteEntity[] = [
      { type: "double", lane: 1, beat: beat(0) },
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1) },
    ];
    const chart = compileJudgmentChart(notes, [0, 0], [0, 500]);
    expect(chart.items.filter((item) => item.kind === "head").map((item) => item.id)).toEqual(["n0:head:0", "n0:head:1"]);
  });

  it("holdOnly double은 unit마다 weight 3인 holdOnly 항목을 만들고 일반 connection은 점수 항목을 만들지 않는다", () => {
    const notes: NoteEntity[] = [
      { type: "doubleLong", lane: 1, beat: beat(0), endBeat: beat(1), holdOnly: true },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const chart = compileJudgmentChart(notes, [0, 500], [500, 1000]);
    expect(chart.items.filter((item) => item.kind === "holdOnly")).toHaveLength(2);
    expect(chart.items.some((item) => item.kind === "release" && item.noteIndex === 0)).toBe(false);
  });

  it("이론 분모는 입력 시간 배열의 값과 무관하게 같은 차트에서 동일하다", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0), endBeat: beat(1) },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const a = compileJudgmentChart(notes, [0, 500], [500, 1000]);
    const b = compileJudgmentChart(notes, [999, 1999], [1499, 2499]);
    expect(b.items.map((item) => item.id)).toEqual(a.items.map((item) => item.id));
    expect(b.theoreticalWeight).toBe(a.theoreticalWeight);
  });

  it("컴파일된 scoreItems는 ScoreManager가 별도 어댑터 없이 등록하고 정산한다", () => {
    const chart = compileJudgmentChart([
      { type: "single", lane: 1, beat: beat(0) },
    ], [100], []);
    const manager = new ScoreManager(chart.scoreItems);
    expect(manager.settleScoreItem(chart.scoreItems[0].id, "perfect")).toBe(true);
    expect(manager.getState().processedNotes).toBe(1);
  });

  it("trillZone 두 개의 경계에 있는 trill note를 Beat와 lane으로 고정 귀속한다", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(0) },
      { type: "trillLong", lane: 2, beat: beat(4), endBeat: beat(6) },
      { type: "trill", lane: 1, beat: beat(8) },
    ];
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(2) },
      { lane: 2, beat: beat(4), endBeat: beat(8) },
      { lane: 1, beat: beat(8), endBeat: beat(10) },
    ];
    const chart = compileJudgmentChart(notes, [1000, 2000, 3000], [1000, 2500, 3000], zones);
    expect(chart.trillZoneByNote).toEqual(new Map([[0, 0], [1, 1], [2, 2]]));
  });

  it("NJ-C03: 같은 Beat/lane의 trillZone 귀속은 early/late 시간 입력이 바뀌어도 동일하다", () => {
    const notes: NoteEntity[] = [
      { type: "trill", lane: 1, beat: beat(2) },
      { type: "trillLong", lane: 1, beat: beat(4), endBeat: beat(6) },
    ];
    const zones: TrillZone[] = [
      { lane: 1, beat: beat(0), endBeat: beat(3) },
      { lane: 1, beat: beat(4), endBeat: beat(6) },
    ];
    const early = compileJudgmentChart(notes, [0, 100], [0, 200], zones);
    const late = compileJudgmentChart(notes, [9000, 9100], [9000, 9300], zones);
    expect(early.trillZoneByNote).toEqual(new Map([[0, 0], [1, 1]]));
    expect(late.trillZoneByNote).toEqual(early.trillZoneByNote);
  });
});
