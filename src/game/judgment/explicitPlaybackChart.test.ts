import { describe, expect, it } from "vitest";
import { compileExplicitJudgmentChart } from "./explicitCompiledChart";
import { createExplicitPlaybackChartView, selectExplicitPlaybackChart, selectExplicitRangePlaybackChart } from "./explicitPlaybackChart";
import { explicitFixtureBody as b, explicitFixtureTap as p, explicitFixtureRelease as r,
  explicitFixtureTick as s, makeExplicitReplayFixture } from "./explicitJudgmentTestHarness";

const compile = (notes: Parameters<typeof makeExplicitReplayFixture>[2]) => compileExplicitJudgmentChart(
  makeExplicitReplayFixture("ENJ-playback", "I2 재생 범위", notes, [],
    { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: "whole" }).chart);

describe("원본 출처를 보존하는 명시 재생 범위", () => {
  it("커서 1500ms 앞 탭·틱을 제외하고 정확히 1500ms 틱과 2000ms 릴리즈만 2항목·6점으로 포함", () => {
    const source = compile([p(1000), b(1000, 2000), s(1490), s(1500), r(2000)]);
    const view = selectExplicitPlaybackChart(source, 1500);
    expect(view.scoreItems.map(item => [item.id, item.timeMs])).toEqual([["n3:tick:0", 1500], ["n4:release:0", 2000]]);
    expect(view).toMatchObject({ totalJudgments: 2, theoreticalWeight: 6 });
    expect(view.bodies[0]).toMatchObject({ source: { noteIndex: 1 }, startMs: 1500, endMs: 2000,
      startTapIndices: [], tickIndices: [3], releaseIndices: [4] });
    expect(source).toMatchObject({ totalJudgments: 4, theoreticalWeight: 12 });
    expect(source.bodies[0].startTapIndices).toEqual([0]);
  });

  it.each(["tap", "release", "tick"] as const)("%s의 명시 시각 1500ms는 cut1500에 포함하고 cut1500.001에는 제외", kind => {
    const source = compile(kind === "tap" ? [p(1500)] : kind === "release" ? [r(1500)] : [b(1000, 2000), s(1500)]);
    expect(selectExplicitPlaybackChart(source, 1500).scoreItems).toHaveLength(1);
    expect(selectExplicitPlaybackChart(source, 1500.001).scoreItems).toHaveLength(0);
  });

  it("같은 1500ms 커서를 중복 선택해도 원본 source·바디 범위·포함 항목·분모가 동일", () => {
    const source = compile([p(1000), b(1000, 2000, 2), s(1500, 2), r(2000, 2)]);
    const once = selectExplicitPlaybackChart(source, 1500);
    expect(selectExplicitPlaybackChart(once, 1500)).toEqual(once);
  });

  it("모든 바디·점수 뒤 3000ms 커서는 원본을 보존한 빈 재생 범위와 분모0", () => {
    const source = compile([p(1000), b(1000, 2000), r(2000)]);
    expect(selectExplicitPlaybackChart(source, 3000)).toMatchObject({ bodies: [], bodyUnits: [], scoreItems: [],
      connections: [], totalJudgments: 0, theoreticalWeight: 0 });
    expect(source.bodies).toHaveLength(1);
    expect(source.scoreItems).toHaveLength(2);
  });

  it("1000～2000ms 더블을 1500ms에서 자르면 두 원본 ordinal의 범위만 1500～2000ms로 바뀜", () => {
    const source = compile([p(1000, "double"), b(1000, 2000, 2), s(1700, 2), r(2000, 2)]);
    const view = createExplicitPlaybackChartView(source, 1500, source.scoreItems);
    expect(view.bodies[0]).toMatchObject({ source: { noteIndex: 1 }, startMs: 1500, endMs: 2000, holdCount: 2 });
    expect(view.bodyUnits.map(unit => [unit.id, unit.ref, unit.startMs, unit.endMs])).toEqual([
      ["b1:hold:0", { bodyIndex: 1, ordinal: 0 }, 1500, 2000],
      ["b1:hold:1", { bodyIndex: 1, ordinal: 1 }, 1500, 2000],
    ]);
    expect(view.timing).toBe(source.timing);
    expect(view.relations).toBe(source.relations);
    expect(view.bodies[0].beat).toEqual(source.bodies[0].beat);
    expect(source.bodies[0].startMs).toBe(1000);
    expect(source.bodyUnits.map(unit => unit.startMs)).toEqual([1000, 1000]);
  });

  it("재개 범위에 기존 점수 항목을 넘기면 1500ms 앞 탭·틱과 전체 분모를 제외하거나 새 항목을 만들지 않음", () => {
    const source = compile([p(1000), b(1000, 2000), s(1400), s(1500), r(2000)]);
    const view = createExplicitPlaybackChartView(source, 1500, source.scoreItems);
    expect(view.scoreItems).toEqual(source.scoreItems);
    expect(view.totalJudgments).toBe(4);
    expect(view.theoreticalWeight).toBe(12);
    expect(view.bodies[0].startTapIndices).toEqual([0]);
  });

  it("1500ms 이전에 끝난 바디는 표시에서 제외하고 정확히 1500ms 끝·길이0·시작은 원본 index로 보존", () => {
    const source = compile([b(500, 1400, 1, 1), b(1000, 1500, 1, 2), b(1500, 1500, 1, 3), b(1500, 2000, 1, 4)]);
    const view = createExplicitPlaybackChartView(source, 1500, []);
    expect(view.bodies.map(body => [body.source.noteIndex, body.startMs, body.endMs])).toEqual([
      [1, 1500, 1500], [2, 1500, 1500], [3, 1500, 2000],
    ]);
    expect(source.bodies).toHaveLength(4);
  });

  it("같은 1500ms 범위를 두 번 선택해도 source index·연결·점수 항목이 바뀌지 않음", () => {
    const source = compile([b(500, 1000), b(1000, 2000, 2), b(2000, 2500)]);
    const once = createExplicitPlaybackChartView(source, 1500, source.scoreItems);
    const twice = createExplicitPlaybackChartView(once, 1500, once.scoreItems);
    expect(twice).toEqual(once);
    expect(twice.connections).toHaveLength(1);
    expect(twice.connections[0]).toMatchObject({ predecessorIndex: 1, successorIndex: 2, boundaryMs: 2000 });
  });

  it("재생 범위의 바디·몫·점수·source·배열은 불변이고 원본 compiler 결과는 동결하거나 변경하지 않음", () => {
    const source = compile([p(1000), b(1000, 2000), s(1500), r(2000)]);
    const view = createExplicitPlaybackChartView(source, 1500, source.scoreItems);
    for (const value of [view, view.bodies, view.bodies[0], view.bodies[0].source, view.bodies[0].units,
      view.bodyUnits, view.bodyUnits[0], view.bodyUnits[0].ref, view.scoreItems, view.scoreItems[0], view.scoreItems[0].source,
      view.bodies[0].startTapIndices, view.bodies[0].releaseIndices, view.bodies[0].tickIndices]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.bodies[0])).toBe(false);
    expect(Object.isFrozen(source.scoreItems[0].source)).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])("유한하지 않은 시작 %s는 원본을 변경하지 않고 거부", start => {
    const source = compile([b(1000, 2000)]);
    expect(() => createExplicitPlaybackChartView(source, start, [])).toThrow(RangeError);
    expect(source.bodies[0].startMs).toBe(1000);
  });
});

describe("옵저버 선택 구간의 양 끝 자르기", () => {
  it("구간 1500～2500ms는 1400·2600ms 탭·릴리즈·틱을 제외하고 양 끝 1500·2500ms와 안쪽 2000ms 항목만 7항목·21점으로 포함", () => {
    const source = compile([p(1400), p(1500), p(2000), p(2500), p(2600),
      r(1400, 1, 2), r(1500, 1, 2), r(2500, 1, 2), r(2600, 1, 2),
      b(1000, 3000, 1, 3), s(1400, 1, 3), s(1500, 1, 3), s(2500, 1, 3), s(2600, 1, 3)]);
    const view = selectExplicitRangePlaybackChart(source, 1500, 2500);
    expect(view.scoreItems.map(item => [item.kind, item.timeMs])).toEqual([
      ["tap", 1500], ["release", 1500], ["tick", 1500], ["tap", 2000], ["tap", 2500], ["release", 2500], ["tick", 2500],
    ]);
    expect(view).toMatchObject({ totalJudgments: 7, theoreticalWeight: 21 });
    expect(view.bodies[0]).toMatchObject({ source: { noteIndex: 9 }, startMs: 1500, endMs: 2500, tickIndices: [11, 12] });
    expect(source).toMatchObject({ totalJudgments: 13, theoreticalWeight: 39 });
  });

  it("탭 1000·틱 1200·2000·2800·릴리즈 3000의 더블 바디 1000～3000ms를 1500～2500ms로 자르면 두 몫이 1500～2500ms, 탭·릴리즈 없이 틱 2000ms 두 항목만 남고 beat는 원본", () => {
    const source = compile([p(1000, "double"), b(1000, 3000, 2), s(1200, 2), s(2000, 2), s(2800, 2), r(3000, 2)]);
    const view = selectExplicitRangePlaybackChart(source, 1500, 2500);
    expect(view.bodies[0]).toMatchObject({ source: { noteIndex: 1 }, startMs: 1500, endMs: 2500, holdCount: 2,
      startTapIndices: [], releaseIndices: [], tickIndices: [3] });
    expect(view.bodyUnits.map(unit => [unit.id, unit.startMs, unit.endMs])).toEqual([
      ["b1:hold:0", 1500, 2500], ["b1:hold:1", 1500, 2500],
    ]);
    expect(view.scoreItems.map(item => item.id)).toEqual(["n3:tick:0", "n3:tick:1"]);
    expect(view).toMatchObject({ totalJudgments: 2, theoreticalWeight: 6 });
    expect(view.bodies[0].beat).toEqual(source.bodies[0].beat);
    expect(view.bodies[0].endBeat).toEqual(source.bodies[0].endBeat);
    expect(view.timing).toBe(source.timing);
    expect(view.relations).toBe(source.relations);
    expect([source.bodies[0].startMs, source.bodies[0].endMs]).toEqual([1000, 3000]);
    expect(source.bodies[0].releaseIndices).toEqual([5]);
  });

  it("구간 1500～2500ms에서 1400ms에 끝난 바디·2600ms에 시작하는 바디는 제외하고 정확히 1500ms 끝·2500ms 시작 바디는 길이0으로 보존", () => {
    const source = compile([b(500, 1400, 1, 1), b(1000, 1500, 1, 2), b(2500, 3000, 1, 3), b(2600, 3000, 1, 4)]);
    const view = selectExplicitRangePlaybackChart(source, 1500, 2500);
    expect(view.bodies.map(body => [body.source.noteIndex, body.startMs, body.endMs])).toEqual([
      [1, 1500, 1500], [2, 2500, 2500],
    ]);
    expect(view.bodyUnits.map(unit => [unit.id, unit.startMs, unit.endMs])).toEqual([
      ["b1:hold:0", 1500, 1500], ["b2:hold:0", 2500, 2500],
    ]);
    expect(source.bodies).toHaveLength(4);
  });

  it("single 1000～2000 → double 2000～2600 → single 2600～3000ms 연결을 1500～2500ms로 자르면 2600ms 뒤 바디와 그 연결은 제외하고 2000ms 연결만 유지", () => {
    const source = compile([b(1000, 2000), b(2000, 2600, 2), b(2600, 3000)]);
    const view = selectExplicitRangePlaybackChart(source, 1500, 2500);
    expect(view.bodies.map(body => [body.source.noteIndex, body.startMs, body.endMs])).toEqual([[0, 1500, 2000], [1, 2000, 2500]]);
    expect(view.connections).toEqual([expect.objectContaining({ predecessorIndex: 0, successorIndex: 1, boundaryMs: 2000 })]);
    expect(source.connections).toHaveLength(2);
  });

  it("끝 시각을 생략한 재생 범위는 1500ms 커서 뒤 3000ms 바디 끝·릴리즈를 자르지 않고 끝 Infinity와 같음", () => {
    const source = compile([p(1000), b(1000, 3000), s(2800), r(3000)]);
    const view = createExplicitPlaybackChartView(source, 1500, source.scoreItems);
    expect(view.bodies[0]).toMatchObject({ startMs: 1500, endMs: 3000, releaseIndices: [3] });
    expect(view.scoreItems).toEqual(source.scoreItems);
    expect(createExplicitPlaybackChartView(source, 1500, source.scoreItems, Infinity)).toEqual(view);
  });

  it("1500～2500ms 구간을 다시 선택하거나 앞 준비 0ms 커서로 선택해도 바디 끝 2500ms·항목·분모가 동일", () => {
    const source = compile([p(1000), b(1000, 3000), s(2000), s(2800), r(3000)]);
    const once = selectExplicitRangePlaybackChart(source, 1500, 2500);
    expect(selectExplicitRangePlaybackChart(once, 1500, 2500)).toEqual(once);
    expect(selectExplicitPlaybackChart(once, 0)).toEqual(once);
    expect(once.bodies[0]).toMatchObject({ startMs: 1500, endMs: 2500 });
  });

  it("시작=끝 1500ms 구간은 거부하지 않고 정확히 1500ms 탭만 포함", () => {
    const source = compile([p(1499), p(1500), p(1501)]);
    expect(selectExplicitRangePlaybackChart(source, 1500, 1500).scoreItems.map(item => item.timeMs)).toEqual([1500]);
  });

  it("구간 재생 범위의 바디·몫·점수·source·배열은 불변이고 원본 compiler 결과는 동결하거나 변경하지 않음", () => {
    const source = compile([p(1000), b(1000, 3000), s(2000), r(3000)]);
    const view = selectExplicitRangePlaybackChart(source, 1500, 2500);
    for (const value of [view, view.bodies, view.bodies[0], view.bodies[0].source, view.bodies[0].units,
      view.bodyUnits, view.bodyUnits[0], view.bodyUnits[0].ref, view.scoreItems, view.scoreItems[0], view.scoreItems[0].source,
      view.bodies[0].startTapIndices, view.bodies[0].releaseIndices, view.bodies[0].tickIndices, view.connections]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.bodies[0])).toBe(false);
    expect(Object.isFrozen(source.scoreItems[0].source)).toBe(false);
    expect([source.bodies[0].startMs, source.bodies[0].endMs]).toEqual([1000, 3000]);
    expect(source.bodyUnits[0]).toMatchObject({ startMs: 1000, endMs: 3000 });
    expect(source.scoreItems).toHaveLength(3);
  });

  it.each([[NaN, 2500], [1500, NaN], [-Infinity, 2500], [1500, Infinity], [2500, 1500]])(
    "구간 시작 %s·끝 %s는 원본을 변경하지 않고 거부", (start, end) => {
      const source = compile([b(1000, 3000)]);
      expect(() => selectExplicitRangePlaybackChart(source, start, end)).toThrow(RangeError);
      expect([source.bodies[0].startMs, source.bodies[0].endMs]).toEqual([1000, 3000]);
    });

  it.each([[NaN, "수 아님"], [1499, "시작보다 앞섬"]] as const)("시작 1500ms 재생 범위의 끝 %s(%s)는 거부", (end, _reason) => {
    const source = compile([b(1000, 3000)]);
    expect(() => createExplicitPlaybackChartView(source, 1500, [], end)).toThrow(RangeError);
  });
});
