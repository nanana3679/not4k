import { describe, expect, it } from "vitest";
import type { ExplicitNoteEntity } from "../../shared/types/chart";
import { compileExplicitJudgmentChart } from "./explicitCompiledChart";
import { selectExplicitRangePlaybackChart } from "./explicitPlaybackChart";
import { explicitFixtureBody as b, explicitFixtureTap as p, explicitFixtureRelease as r,
  explicitFixtureTick as s, makeExplicitReplayFixture } from "./explicitJudgmentTestHarness";
import { ExplicitJudgmentSession } from "./ExplicitJudgmentSession";
import type { ExplicitConfirmedFact, ExplicitJudgmentInput } from "./ExplicitJudgmentState";

const options = { windows: { PERFECT: 41, GREAT: 82, GOOD: 120, BAD: 160 }, maintenanceGraceMs: 20 };
const down = (key = "A", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "down" });
const up = (key = "A", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "up" });
const compile = (notes: ExplicitNoteEntity[]) => compileExplicitJudgmentChart(makeExplicitReplayFixture("ENJ-range", "옵저버 선택 구간",
  notes, [], { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: "whole" }).chart);
/** 옵저버처럼 선택 구간으로 자른 재생 범위를 앞 준비 구간 시작 0ms부터 판정한다. */
const rangeSession = (notes: ExplicitNoteEntity[], startTimeMs: number, endTimeMs: number) =>
  new ExplicitJudgmentSession(selectExplicitRangePlaybackChart(compile(notes), startTimeMs, endTimeMs), { ...options, startTimeMs: 0 });
type Settlement = Extract<ExplicitConfirmedFact, { kind: "settlement" }>;
const settlements = (session: ExplicitJudgmentSession) => session.facts.filter((fact): fact is Settlement => fact.kind === "settlement");
const consumedByInputs = (session: ExplicitJudgmentSession) => session.facts.flatMap(fact => fact.kind === "input"
  ? [[fact.action, fact.atMs, fact.consumedItemId] as const] : []);

describe("옵저버 선택 구간 재생 범위를 앞 준비 시작부터 판정하는 세션", () => {
  const headCut = [p(1000), b(1000, 2000), s(1200), s(1700), r(2000)];

  it("탭 1000ms가 잘린 바디 1000～2000ms를 구간 1500～2500ms로 판정하면 앞 준비 800ms에 누른 A를 쥔 채 1500ms에 preheld 시작하고 1000ms 탭 Miss 없이 틱 1700·릴리즈 2000으로 6/6점", () => {
    const session = rangeSession(headCut, 1500, 2500);
    session.processBatch(800, [down()]);
    expect(consumedByInputs(session)).toEqual([["down", 800, null]]);
    session.advance(1500);
    expect(session.facts.filter(fact => fact.kind === "bodyStarted")).toMatchObject([
      { bodyUnitId: "b1:hold:0", via: "preheld", actualStartMs: 1500 }]);
    session.processBatch(2000, [up()]);
    const result = session.finalize();
    expect(settlements(session).map(fact => [fact.itemId, fact.grade])).toEqual([["n3:tick:0", "perfect"], ["n4:release:0", "perfect"]]);
    expect(result.score).toMatchObject({ earnedScore: 6, totalNotes: 2, finalDenominatorWeight: 6, judgmentCounts: { miss: 0 } });
  });

  it.each([1380, 1600, 1620])("탭이 잘린 바디의 구간 시작 1500ms에 쥔 키가 없어도 시작 창 안 새 down %sms로 그 시각에 시작하고 Miss 없이 6/6점", at => {
    const session = rangeSession(headCut, 1500, 2500);
    session.processBatch(at, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: at, tapStatus: "none" });
    session.processBatch(2000, [up()]);
    expect(consumedByInputs(session)).toEqual([["down", at, null], ["up", 2000, "n4:release:0"]]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, totalNotes: 2, judgmentCounts: { miss: 0 } });
  });

  it("탭이 잘린 바디의 구간 시작 1500ms에 쥔 키가 없고 첫 down이 시작 창 밖 1700ms면 1620ms 시작 시간 초과로 무점수 Miss 1개, 틱 1700·릴리즈 2000은 그 실패가 원인인 종속 0점으로 0/6점", () => {
    const session = rangeSession(headCut, 1500, 2500);
    session.processBatch(1700, [down()]);
    session.processBatch(2000, [up()]);
    const result = session.finalize();
    const failures = session.facts.filter(fact => fact.kind === "bodyFailed");
    expect(failures).toMatchObject([{ bodyUnitId: "b1:hold:0", reason: "startTimeout", atMs: 1620, unscoredMiss: true }]);
    expect(settlements(session).map(fact => [fact.itemId, fact.outcome, fact.atMs, fact.causeFactId])).toEqual([
      ["n3:tick:0", "dependentZero", 1620, failures[0].id], ["n4:release:0", "dependentZero", 1620, failures[0].id],
    ]);
    expect(consumedByInputs(session)).toEqual([["down", 1700, null], ["up", 2000, null]]);
    expect(result.score).toMatchObject({ earnedScore: 0, totalNotes: 2, processedNotes: 2, judgmentCounts: { perfect: 0, miss: 1 } });
  });

  it("구간 시작 1500ms의 탭을 앞 준비 중 1460ms에 누르면 무시하지 않고 −40ms Perfect로 판정하며 구간 밖 1300ms 탭은 Miss 없음", () => {
    const session = rangeSession([p(1300), p(1500)], 1500, 2500);
    session.processBatch(1460, [down()]);
    expect(settlements(session)).toMatchObject([{ itemId: "n1:tap:0", grade: "perfect", rawDeltaMs: -40 }]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 3, totalNotes: 1, judgmentCounts: { perfect: 1, miss: 0 } });
  });

  it.each([[2700, "end", 2500], [2400, "earlyUp", 2400]] as const)(
    "구간 끝 2500ms에서 잘린 바디 2000～3000ms는 up %sms면 %s로 %sms에 완료하고 릴리즈 3000ms 없이 탭 2000·틱 2200만 6/6점·Miss 0",
    (upAt, reason, completedAt) => {
      const session = rangeSession([p(2000), b(2000, 3000), s(2200), s(2800), r(3000)], 1500, 2500);
      expect(session.playbackChart.bodies[0]).toMatchObject({ startMs: 2000, endMs: 2500, releaseIndices: [] });
      session.processBatch(2000, [down()]);
      session.processBatch(upAt, [up()]);
      const result = session.finalize();
      expect(session.facts.filter(fact => fact.kind === "bodyCompleted")).toMatchObject([{ reason, atMs: completedAt }]);
      expect(consumedByInputs(session)).toEqual([["down", 2000, "n0:tap:0"], ["up", upAt, null]]);
      expect(settlements(session).map(fact => fact.itemId)).toEqual(["n0:tap:0", "n2:tick:0"]);
      expect(result.score).toMatchObject({ earnedScore: 6, totalNotes: 2, finalDenominatorWeight: 6, judgmentCounts: { miss: 0 } });
    });

  it("구간 1500～2500ms 밖 탭 1000·2600·3000ms와 릴리즈 3000ms는 입력 없이 finalize해도 Miss가 없고 Miss는 구간 안 탭 2000·2200ms 2개, 판정 마감은 잘린 바디 끝 2500+120=2620ms", () => {
    const notes = [p(1000), p(2000), p(2600), p(3000), p(2200, "single", 2), b(2200, 3000, 1, 2), r(3000, 1, 2)];
    const session = rangeSession(notes, 1500, 2500);
    expect(session.latestJudgmentDeadlineMs).toBe(2620);
    expect(new ExplicitJudgmentSession(compile(notes), { ...options, startTimeMs: 0 }).latestJudgmentDeadlineMs).toBe(3120);
    const result = session.finalize();
    expect(result.snapshot.atMs).toBe(2621);
    expect(settlements(session).map(fact => [fact.itemId, fact.grade, fact.atMs])).toEqual([
      ["n1:tap:0", "miss", 2120], ["n4:tap:0", "miss", 2320],
    ]);
    expect(session.facts.filter(fact => fact.kind === "bodyFailed")).toMatchObject([
      { bodyUnitId: "b5:hold:0", reason: "tapMiss", unscoredMiss: false }]);
    expect(result.score).toMatchObject({ totalNotes: 2, processedNotes: 2, finalDenominatorWeight: 6, judgmentCounts: { miss: 2 } });
  });

  it("구간 끝 2500ms로 자른 세션을 2300ms에 멈췄다 A를 쥔 채 재개해도 바디 끝 2500ms·점수 항목을 되돌리지 않고 2500ms에 완료", () => {
    const session = rangeSession([p(2000), b(2000, 3000), s(2800), r(3000)], 1500, 2500);
    session.processBatch(2000, [down()]);
    session.advance(2300);
    session.resumeAt(2300, [{ key: "A", lane: 1 }]);
    expect(session.playbackChart.bodies[0]).toMatchObject({ startMs: 2300, endMs: 2500 });
    expect(session.playbackChart.scoreItems.map(item => item.id)).toEqual(["n0:tap:0"]);
    session.advance(2500);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", completedAtMs: 2500 });
    expect(session.finalize().score).toMatchObject({ earnedScore: 3, totalNotes: 1, judgmentCounts: { miss: 0 } });
  });

  // 더블 탭 1000 + 더블 바디 1000～2000 → 탭 없는 single 2000～3000. 2000ms 릴리즈는 2→1 감소 릴리즈다.
  const decrease = [p(1000, "double"), b(1000, 2000, 2), r(2000), b(2000, 3000), r(3000)];

  it.each([[2050, "earlyUp"], [2000, "lateStart"]] as const)(
    "2→1 감소 경계 2000ms와 같거나 50ms 뒤인 구간 끝 %sms에서 B를 2000ms에 감소 릴리즈하고 A를 2100ms까지 쥐면 예외 없이 탭 2·감소 릴리즈 Perfect 9/9점·Miss 0, 뒤 single은 2000ms에 %s로 완료",
    (endTimeMs, singleReason) => {
      const session = rangeSession(decrease, 1000, endTimeMs);
      expect(session.playbackChart.scoreItems.map(item => item.kind === "release" ? [item.id, item.boundaryKind] : [item.id]))
        .toEqual([["n0:tap:0"], ["n0:tap:1"], ["n2:release:0", "decrease"]]);
      expect(session.playbackChart.bodies.map(body => [body.source.noteIndex, body.startMs, body.endMs])).toEqual([[1, 1000, 2000], [3, 2000, endTimeMs]]);
      expect(session.playbackChart.connections).toMatchObject([{ predecessorIndex: 1, successorIndex: 3 }]);
      session.processBatch(1000, [down("A"), down("B")]);
      session.processBatch(2000, [up("B")]);
      session.processBatch(2100, [up("A")]);
      const result = session.finalize();
      expect(settlements(session).map(fact => [fact.itemId, fact.grade])).toEqual([
        ["n0:tap:0", "perfect"], ["n0:tap:1", "perfect"], ["n2:release:0", "perfect"],
      ]);
      expect(result.snapshot.bodyUnits.map(unit => [unit.id, unit.state, unit.completedAtMs])).toEqual([
        ["b1:hold:0", "complete", 2000], ["b1:hold:1", "complete", 2000], ["b3:hold:0", "complete", 2000],
      ]);
      expect(session.facts.filter(fact => fact.kind === "bodyCompleted" && fact.bodyUnitId === "b3:hold:0"))
        .toMatchObject([{ reason: singleReason }]);
      expect(result.score).toMatchObject({ earnedScore: 9, finalDenominatorWeight: 9, judgmentCounts: { perfect: 3, miss: 0 } });
    });

  it("2→1 감소 경계 뒤 구간 끝 2050ms에서 A·B를 1500ms에 모두 떼면 두 몫 1520ms 유지 실패·감소 릴리즈 종속 0점, 잘린 single은 2120ms 자기 시작 시간 초과로 Miss 3·6/9점", () => {
    const session = rangeSession(decrease, 1000, 2050);
    session.processBatch(1000, [down("A"), down("B")]);
    session.processBatch(1500, [up("A"), up("B")]);
    const result = session.finalize();
    expect(session.facts.flatMap(fact => fact.kind === "bodyFailed" ? [[fact.bodyUnitId, fact.reason, fact.atMs]] : [])).toEqual([
      ["b1:hold:1", "maintenance", 1520], ["b1:hold:0", "maintenance", 1520], ["b3:hold:0", "startTimeout", 2120],
    ]);
    expect(settlements(session).filter(fact => fact.itemKind === "release")).toMatchObject([{ outcome: "dependentZero", atMs: 1520 }]);
    expect(result.score).toMatchObject({ earnedScore: 6, finalDenominatorWeight: 9, judgmentCounts: { perfect: 2, miss: 3 } });
  });
});
