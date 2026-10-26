import { describe, expect, it, vi } from "vitest";
import { beat } from "../../shared/types/beat";
import { compileExplicitJudgmentChart } from "./explicitCompiledChart";
import { explicitEnjFixtures } from "./explicitEnjFixtures";
import { explicitFixtureBody as b, explicitFixturePoint as p, explicitFixtureRelease as r,
  explicitFixtureSustain as s, makeExplicitReplayFixture } from "./explicitJudgmentTestHarness";
import { ExplicitJudgmentEffectSink } from "./ExplicitJudgmentEffectSink";
import { ExplicitJudgmentCore } from "./ExplicitJudgmentCore";
import { ExplicitJudgmentSession } from "./ExplicitJudgmentSession";
import type { ExplicitJudgmentInput } from "./ExplicitJudgmentState";
import { ExplicitSessionRendererAdapter } from "./ExplicitSessionRendererAdapter";

const options = { windows: { PERFECT: 41, GREAT: 82, GOOD: 120, BAD: 160 }, maintenanceGraceMs: 20 };
const down = (key: string, lane: number): ExplicitJudgmentInput => ({ key, lane, type: "down" });
const up = (key: string, lane: number): ExplicitJudgmentInput => ({ key, lane, type: "up" });
const chartFor = (notes: Parameters<typeof makeExplicitReplayFixture>[2]) => makeExplicitReplayFixture("ENJ-M3", "M3 실제 실행", notes, [],
  { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: "whole" }).chart;
const sessionFor = (notes: Parameters<typeof chartFor>[0]) => new ExplicitJudgmentSession(compileExplicitJudgmentChart(chartFor(notes)), options);
const effectPort = () => ({ showJudgmentGroup: vi.fn(), recordFlightJudgment: vi.fn(), showBombEffect: vi.fn() });
function permutations<T>(values: readonly T[]): T[][] {
  return values.length ? values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest])) : [[]];
}

describe("실제 compiler → core → session의 대표 글자와 개별 정산", () => {
  it.each([
    { id: "ENJ-16", grade: "good", count: 2, score: 4, perfect: 1, good: 1, noteIndex: 2 },
    { id: "ENJ-17", grade: "perfect", count: 4, score: 12, perfect: 4, good: 0, noteIndex: 2 },
  ])("$id 실제 재생은 대표 $grade·원래 FAST와 $count개 항목의 개별 점수·통계를 보존한다", test => {
    const fixture = explicitEnjFixtures.find(fixture => fixture.id === test.id)!;
    const session = new ExplicitJudgmentSession(compileExplicitJudgmentChart(fixture.chart), options);
    const port = effectPort();
    const adapter = new ExplicitSessionRendererAdapter(session, new ExplicitJudgmentEffectSink(port));
    for (const batch of fixture.batches) session.processObservedBatch(batch.rawAtMs, batch.inputs, batch.observedAtMs);
    const result = session.finalize();
    adapter.sync();
    expect(result.display).toMatchObject({ confirmedAt: 1500, grade: test.grade,
      timingDeltaMs: test.id === "ENJ-16" ? -100 : -30, source: { noteIndex: test.noteIndex, ordinal: 0 } });
    expect(result.score).toMatchObject({ earnedScore: test.score, processedNotes: test.count, totalNotes: test.count,
      liveDenominatorWeight: test.count * 3, finalDenominatorWeight: test.count * 3,
      fastCount: 1, slowCount: 0, judgmentCounts: { perfect: test.perfect, good: test.good } });
    expect(result.combo).toBe(test.count);
    expect(port.recordFlightJudgment).toHaveBeenCalledTimes(test.count);
    expect(port.showBombEffect).toHaveBeenCalledTimes(test.count);
    expect(port.showJudgmentGroup).toHaveBeenCalledExactlyOnceWith(result.display);
    session.finalize(); session.result();
    expect(session.snapshot).toEqual(result.snapshot);
    expect(session.effects).toEqual(result.effects);
    adapter.attach({ render: vi.fn() }); adapter.sync(); adapter.dispose();
    new ExplicitSessionRendererAdapter(session, new ExplicitJudgmentEffectSink(port)).sync();
    expect(port.showBombEffect).toHaveBeenCalledTimes(test.count);
    expect(session.drainEffects()).toEqual([]);
  });

  it.each([-30, 0, 30])("Grace raw +100ms와 일반 Perfect raw %ims가 같이 확정되면 일반 입력만 대표 타이밍이다", delta => {
    const session = sessionFor([p(1400, "single", 1, true), p(1500 - delta, "single", 2)]);
    session.processBatch(1500, [down("A", 1), down("B", 2)]);
    expect(session.display).toMatchObject({ grade: "perfect", timingDeltaMs: delta, source: { noteIndex: 1 } });
    expect(session.result().score).toMatchObject({ earnedScore: 6, fastCount: delta < -20.5 ? 1 : 0, slowCount: delta > 20.5 ? 1 : 0 });
  });

  it("Grace·유지 Perfect만 1500ms에 확정되면 대표 타이밍은 null이고 FAST/SLOW는 0회다", () => {
    const session = sessionFor([b(1000, 2000), s(1500), p(1400, "single", 2, true)]);
    session.processBatch(1000, [down("A", 1)]);
    session.processBatch(1500, [down("B", 2)]);
    expect(session.display).toMatchObject({ grade: "perfect", timingDeltaMs: null });
    expect(session.result().score).toMatchObject({ earnedScore: 6, fastCount: 0, slowCount: 0 });
  });

  it("Grace goodTrill과 일반 Good -100ms·Perfect -30ms가 동시에 확정되면 GOOD◇에 다른 등급 타이밍을 빌리지 않는다", () => {
    const chart = chartFor([p(1000, "trill", 1), p(1500, "trill", 1, true), p(1530, "single", 2), p(1600, "single", 3)]);
    chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    const session = new ExplicitJudgmentSession(compileExplicitJudgmentChart(chart), options);
    session.processBatch(1000, [down("A", 1)]);
    session.processBatch(1100, [up("A", 1)]);
    session.processBatch(1500, [down("A", 1), down("B", 2), down("C", 3)]);
    expect(session.display).toMatchObject({ grade: "goodTrill", timingDeltaMs: null, source: { noteIndex: 1 } });
    expect(session.result().score).toMatchObject({ earnedScore: 8, goodTrillCount: 1, fastCount: 2, slowCount: 0 });
    expect(session.combo).toBe(4);
  });

  it("1430ms·1490ms 입력을 1500ms에 함께 관측하면 대표는 확정 지연이 아닌 raw +30ms이며 FAST 0·SLOW 1이다", () => {
    const session = sessionFor([p(1400, "single", 1), p(1500, "single", 2)]);
    session.processObservedBatches([{ rawAtMs: 1430, inputs: [down("A", 1)] }, { rawAtMs: 1490, inputs: [down("B", 2)] }], 1500);
    expect(session.display).toMatchObject({ confirmedAt: 1500, grade: "perfect", timingDeltaMs: 30, source: { noteIndex: 0 } });
    expect(session.effects.map(effect => effect.timingDeltaMs)).toEqual([30, -10]);
    expect(session.result().score).toMatchObject({ earnedScore: 6, fastCount: 0, slowCount: 1 });
  });

  it("1500ms 유지 Perfect와 deadline Miss를 따로 drain해도 대표는 Miss·타이밍 null이고 콤보는 0이다", () => {
    const session = sessionFor([b(1000, 2000), s(1500), p(1380, "single", 2)]);
    const port = effectPort();
    const adapter = new ExplicitSessionRendererAdapter(session, new ExplicitJudgmentEffectSink(port));
    session.processBatch(1000, [down("A", 1)]);
    session.advance(1500); adapter.sync();
    expect(port.showJudgmentGroup).toHaveBeenLastCalledWith(expect.objectContaining({ grade: "perfect", confirmedAt: 1500 }));
    session.advance(1501); adapter.sync();
    expect(session.effects.map(effect => effect.phase)).toEqual(["timeline", "deadline"]);
    expect(port.showJudgmentGroup).toHaveBeenLastCalledWith(expect.objectContaining({ grade: "miss", timingDeltaMs: null, confirmedAt: 1500 }));
    expect(port.showJudgmentGroup.mock.calls[0][0].groupId).toBe(port.showJudgmentGroup.mock.calls[1][0].groupId);
    expect(port.showBombEffect).toHaveBeenCalledTimes(1);
    expect(port.recordFlightJudgment.mock.calls.map(([grade]) => grade)).toEqual(["perfect", "miss"]);
    expect(session.result().score).toMatchObject({ earnedScore: 3, processedNotes: 2, fastCount: 0, slowCount: 0 });
    expect(session.combo).toBe(0);
  });

  it("1500ms 유지 Perfect와 종속 0점은 원인 Miss만 표시하고 0점 항목은 후보·타격에서 제외한다", () => {
    const session = sessionFor([b(1000, 2000, 1, 1), s(1500, 1, 1), b(1380, 2000, 1, 2), s(1700, 1, 2)]);
    const port = effectPort();
    session.processBatch(1000, [down("A", 1)]);
    session.advance(1501);
    new ExplicitSessionRendererAdapter(session, new ExplicitJudgmentEffectSink(port)).sync();
    expect(session.effects.map(effect => effect.scoreAction)).toEqual(["settleItem", "unscoredMiss", "dependentZero"]);
    expect(session.effects[2]).toMatchObject({ displayUpdate: null, displayGrade: null, hitGrade: null, altitudeAction: "none", comboAction: "none" });
    expect(session.display).toMatchObject({ confirmedAt: 1500, grade: "miss", timingDeltaMs: null, source: { noteIndex: 2 } });
    expect(port.showJudgmentGroup).toHaveBeenCalledTimes(1);
    expect(port.recordFlightJudgment).toHaveBeenCalledTimes(2);
    expect(port.showBombEffect).toHaveBeenCalledTimes(1);
  });

  it("서로 다른 1010ms·1040ms 판정을 한 프레임에 drain해도 두 group을 각각 전달한다", () => {
    const session = sessionFor([p(1000, "single", 1), p(1040, "single", 2)]);
    const port = effectPort();
    session.processBatch(1010, [down("A", 1)]);
    session.processBatch(1040, [down("B", 2)]);
    new ExplicitSessionRendererAdapter(session, new ExplicitJudgmentEffectSink(port)).sync();
    const displays = port.showJudgmentGroup.mock.calls.map(([display]) => display);
    expect(displays.map(display => display.confirmedAt)).toEqual([1010, 1040]);
    expect(new Set(displays.map(display => display.groupId)).size).toBe(2);
    expect(displays.map(display => display.timingDeltaMs)).toEqual([10, 0]);
  });

  it.each([false, true])("같은 |30ms|의 ±오차 입력 순서를 바꿔도 원본 noteIndex 0의 +30ms를 선택한다: 역순=%s", reverse => {
    const session = sessionFor([p(1470, "single", 2), p(1530, "single", 3)]);
    const inputs = [down("A", 2), down("B", 3)];
    for (const input of reverse ? inputs.reverse() : inputs) session.processBatch(1500, [input]);
    expect(session.display).toMatchObject({ grade: "perfect", timingDeltaMs: 30, source: { noteIndex: 0, ordinal: 0 } });
    expect(session.result().score).toMatchObject({ earnedScore: 6, fastCount: 1, slowCount: 1 });
  });

  it("graded 3개·dependentZero 2개·unscoredMiss 1개는 원래 5항목/15분모로 한 번 정산한다", () => {
    const session = sessionFor([p(1000), p(2000, "single", 2), b(1000, 2500, 1, 3), s(1500, 1, 3), s(2200, 1, 3), r(2500, 1, 3)]);
    session.processBatch(1000, [down("A", 1), down("B", 3)]);
    session.advance(1500);
    session.processBatch(1600, [up("B", 3)]);
    const result = session.finalize();
    expect(result.effects.filter(effect => effect.scoreAction === "settleItem")).toHaveLength(3);
    expect(result.effects.filter(effect => effect.scoreAction === "dependentZero")).toHaveLength(2);
    expect(result.effects.filter(effect => effect.scoreAction === "unscoredMiss")).toHaveLength(1);
    expect(result.score).toMatchObject({ earnedScore: 6, totalNotes: 5, processedNotes: 5,
      liveDenominatorWeight: 15, finalDenominatorWeight: 15, judgmentCounts: { perfect: 2, miss: 2 }, isFullCombo: false });
    expect(result.snapshot.items.every(item => item.settlementFactId !== null)).toBe(true);
    expect(new Set(result.effects.filter(effect => effect.itemId).map(effect => effect.itemId)).size).toBe(5);
    expect(session.finalize()).toEqual(result);
  });

  it("같은 noteIndex와 1500ms를 다음 새 세션에서 재생해도 instanceId와 groupId는 충돌하지 않는다", () => {
    const first = sessionFor([p(1500)]), next = sessionFor([p(1500)]);
    const port = effectPort(), sink = new ExplicitJudgmentEffectSink(port);
    first.processBatch(1500, [down("A", 1)]);
    new ExplicitSessionRendererAdapter(first, sink).sync();
    next.processBatch(1500, [down("A", 1)]);
    new ExplicitSessionRendererAdapter(next, sink).sync();
    expect(first.instanceId).not.toBe(next.instanceId);
    expect(first.display!.groupId).not.toBe(next.display!.groupId);
    expect(port.showBombEffect).toHaveBeenCalledTimes(2);
    expect(port.showJudgmentGroup).toHaveBeenCalledTimes(2);
  });
});

describe("같은 confirmedAt의 호출·phase·drain 분할 독립", () => {
  it.each(permutations(["timeline", "normalFast", "normalSlow", "grace"] as const))(
    "1500ms 호출 순서 %s→%s→%s→%s를 매번 drain해도 Perfect -30ms와 타격 4회다", (...order) => {
      const session = sessionFor([b(1000, 2000), s(1500), p(1530, "single", 2), p(1480, "single", 3), p(1400, "single", 4, true)]);
      const port = effectPort();
      const adapter = new ExplicitSessionRendererAdapter(session, new ExplicitJudgmentEffectSink(port));
      session.processBatch(1000, [down("A", 1)]);
      const actions = { timeline: () => session.advance(1500), normalFast: () => session.processBatch(1500, [down("B", 2)]),
        normalSlow: () => session.processBatch(1500, [down("C", 3)]), grace: () => session.processBatch(1500, [down("D", 4)]) };
      for (const name of order) { actions[name](); adapter.sync(); }
      expect(session.display).toMatchObject({ grade: "perfect", confirmedAt: 1500, timingDeltaMs: -30, source: { noteIndex: 2 } });
      expect(port.showJudgmentGroup).toHaveBeenLastCalledWith(session.display);
      expect(new Set(port.showJudgmentGroup.mock.calls.map(([display]) => display.groupId)).size).toBe(1);
      expect(port.recordFlightJudgment).toHaveBeenCalledTimes(4);
      expect(port.showBombEffect.mock.calls.map(([lane]) => lane).sort()).toEqual([1, 2, 3, 4]);
      expect(session.result().score).toMatchObject({ earnedScore: 12, fastCount: 1, slowCount: 0 });
      expect(session.combo).toBe(4);
      adapter.attach(null); adapter.attach({ render: vi.fn() }); adapter.sync();
      expect(port.showBombEffect).toHaveBeenCalledTimes(4);
    });
});

describe("공개 append 사실 읽기와 확정 효과의 불변성", () => {
  it("cursor 뒤 사실을 읽은 배열은 이후 1600ms 진행 무효화·재계산 뒤에도 바뀌지 않는다", () => {
    const core = new ExplicitJudgmentCore(compileExplicitJudgmentChart(chartFor([b(1000, 1600)])), options);
    core.processBatch(1000, [down("A", 1)]);
    core.advance(1600);
    const before = core.readConfirmedSince(0);
    const preserved = JSON.stringify(before);
    core.processObservedBatch(1490, [up("A", 1)], 1600);
    const appended = core.readConfirmedSince(before.length);
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(appended)).toBe(true);
    expect(JSON.stringify(before)).toBe(preserved);
    expect([...before, ...appended]).toEqual(core.confirmed);
    expect(appended.some(fact => fact.kind === "input")).toBe(true);
    expect(appended.some(fact => fact.kind === "bodyProgressInvalidated")).toBe(true);
    expect(core.readConfirmedSince(core.confirmed.length)).toEqual([]);
  });

  it.each([-1, 0.5, Infinity, NaN, 1])("기록 0개의 cursor %s는 유효한 append 위치가 아니므로 RangeError다", cursor => {
    const core = new ExplicitJudgmentCore(compileExplicitJudgmentChart(chartFor([p(1500)])), options);
    expect(() => core.readConfirmedSince(cursor)).toThrow(RangeError);
  });

  it("1500ms 유지 성공 뒤 1600ms 실제 up으로 실패해도 기존 Perfect 점수·콤보 성공·표시 기록은 소급 취소하지 않는다", () => {
    const session = sessionFor([b(1000, 2000), s(1500), s(1800)]);
    session.processBatch(1000, [down("A", 1)]);
    session.advance(1500);
    const successfulDisplay = session.display;
    const successfulEffects = session.drainEffects();
    const successfulSnapshot = session.snapshot;
    expect(session.combo).toBe(1);
    session.processBatch(1600, [up("A", 1)]);
    session.advance(1621);
    expect(session.combo).toBe(0);
    expect(session.result().score).toMatchObject({ earnedScore: 3, judgmentCounts: { perfect: 1, miss: 1 }, liveDenominatorWeight: 6 });
    expect(successfulDisplay).toMatchObject({ grade: "perfect", confirmedAt: 1500 });
    expect(Object.isFrozen(successfulDisplay)).toBe(true);
    expect(Object.isFrozen(successfulDisplay!.source)).toBe(true);
    expect(successfulEffects).toHaveLength(1);
    expect(successfulSnapshot.items.map(item => item.state)).toEqual(["success", "pending"]);
    const failureEffects = session.drainEffects();
    expect(failureEffects.map(effect => effect.scoreAction)).toEqual(["unscoredMiss", "dependentZero"]);
    expect(failureEffects.every(effect => effect.hitGrade === null)).toBe(true);
  });
});
