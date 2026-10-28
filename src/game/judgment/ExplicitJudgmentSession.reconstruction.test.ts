import { describe, expect, it } from "vitest";
import { beat } from "../../shared/types/beat";
import type { ExplicitNoteEntity } from "../../shared/types/chart";
import { compileExplicitJudgmentChart } from "./explicitCompiledChart";
import { explicitEnjFixtures } from "./explicitEnjFixtures";
import { explicitHcFixtures } from "./explicitHcFixtures";
import { explicitFixtureBody as b, explicitFixturePoint as p, explicitFixtureRelease as r,
  explicitFixtureSustain as s, makeExplicitReplayFixture } from "./explicitJudgmentTestHarness";
import { ExplicitJudgmentSession } from "./ExplicitJudgmentSession";
import type { ExplicitJudgmentCoreOptions } from "./ExplicitJudgmentCore";
import type { ExplicitConfirmedFact, ExplicitJudgmentInput } from "./ExplicitJudgmentState";

const options = { windows: { PERFECT: 41, GREAT: 82, GOOD: 120, BAD: 160 }, maintenanceGraceMs: 20 };
const down = (key = "A", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "down" });
const up = (key = "A", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "up" });
const fixture = (notes: ExplicitNoteEntity[]) => makeExplicitReplayFixture("ENJ-rewind", "되감기 회귀", notes, [],
  { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: "whole" });
const makeSession = (notes: ExplicitNoteEntity[], extra: ExplicitJudgmentCoreOptions = {}) =>
  new ExplicitJudgmentSession(compileExplicitJudgmentChart(fixture(notes).chart), { ...options, ...extra });
const settlements = (session: ExplicitJudgmentSession) => session.facts.filter(
  (fact): fact is Extract<ExplicitConfirmedFact, { kind: "settlement" }> => fact.kind === "settlement");

describe("RFD0040 실제 곡 관측 이력으로 새 세션 복원", () => {
  it("1500ms로 되감으면 1000ms 성공·콤보1은 남고 2000ms 성공은 다시 Miss로 바뀜", () => {
    const original = makeSession([p(1000), p(2000, "single", 2)]);
    original.processBatch(1000, [down()]);
    original.advance(1500);
    const prefix = original.result();
    original.processBatch(2000, [down("B", 2)]);
    const oldResult = original.result();
    const { session, prefixEffects, heldKeys } = original.reconstructAt(1500);
    expect(session.instanceId).not.toBe(original.instanceId);
    expect(session.facts).toEqual(prefix.facts);
    expect(session.score).toEqual(prefix.score);
    expect(session.combo).toBe(1);
    expect(heldKeys).toEqual([{ key: "A", lane: 1 }]);
    expect(prefixEffects.map(effect => effect.itemId)).toEqual(["n0:point:0"]);
    expect(session.drainEffects()).toEqual([]);
    expect(session.display).toBeNull();
    session.advance(2121);
    expect(session.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 1 });
    expect(session.combo).toBe(0);
    expect(session.drainEffects()).toMatchObject([{ itemId: "n1:point:0", grade: "miss" }]);
    expect(session.drainEffects()).toEqual([]);
    expect(original.result()).toEqual(oldResult);
    expect(oldResult.score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
    expect(Object.isFrozen(oldResult.snapshot.items)).toBe(true);
  });

  it("1500ms 이전 Point Miss는 남고 이후 2000ms Miss는 실제 down2000으로 Perfect가 됨", () => {
    const original = makeSession([p(1000), p(2000)]);
    original.advance(1500);
    original.advance(2200);
    const { session } = original.reconstructAt(1500);
    expect(session.score.judgmentCounts.miss).toBe(1);
    session.processBatch(2000, [down()]);
    expect(session.finalize().score.judgmentCounts).toMatchObject({ perfect: 1, miss: 1 });
    expect(session.score.finalDenominatorWeight).toBe(6);
  });

  it("1570ms 바디 실패·종속0을 1500ms로 되돌리면 새 B hold로 유지와 릴리즈를 성공시킬 수 있음", () => {
    const original = makeSession([p(1000), b(1000, 2500), s(1600), r(2500)]);
    original.processBatch(1000, [down()]);
    original.advance(1500);
    original.processBatch(1550, [up()]);
    original.advance(1571);
    expect(original.snapshot.bodyUnits[0].state).toBe("failed");
    expect(original.snapshot.items.filter(item => item.state === "dependentZero")).toHaveLength(2);
    const { session } = original.reconstructAt(1500);
    expect(session.snapshot.bodyUnits[0].state).toBe("active");
    session.resumeAt(1500, [{ key: "B", lane: 1 }]);
    session.advance(1600);
    session.processBatch(2500, [up("B")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 9, processedNotes: 3,
      judgmentCounts: { perfect: 3, miss: 0 } });
    expect(settlements(session).some(fact => fact.outcome === "dependentZero")).toBe(false);
  });

  it("1120ms에 이미 실패한 Point 바디는 1500ms 복원·preheld에도 실패와 종속0을 유지", () => {
    const original = makeSession([p(1000), b(1000, 2000), s(1500), r(2000)]);
    original.advance(1500);
    original.advance(2200);
    const { session } = original.reconstructAt(1500);
    const facts = session.facts;
    session.resumeAt(1500, [{ key: "B", lane: 1 }]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1120, pointStatus: "missed" });
    expect(session.facts).toEqual(facts);
    expect(session.score.judgmentCounts.miss).toBe(1);
    expect(session.snapshot.items.filter(item => item.state === "dependentZero")).toHaveLength(2);
  });

  it("1050ms 복원에 남은 미처리 Point는 preheld로 자동 성공하지 않고 1120ms 뒤 바디도 실패", () => {
    const original = makeSession([p(1000), b(1000, 2000), r(2000)]);
    original.advance(1050);
    original.processBatch(1100, [down()]);
    const { session } = original.reconstructAt(1050);
    session.resumeAt(1050, [{ key: "B", lane: 1 }]);
    expect(session.snapshot.items[0].state).toBe("pending");
    expect(session.snapshot.bodyUnits[0].pointStatus).toBe("waiting");
    session.advance(1121);
    expect(session.snapshot.bodyUnits[0].state).toBe("failed");
    expect(session.score.judgmentCounts).toMatchObject({ perfect: 0, miss: 1 });
  });

  it("Point 1000·바디 1000～2000을 T 1050에 복원·재개한 뒤 raw 900·관측 1060 down은 Point Good과 바디 시작 1050을 함께 인정해 9점 중 7점", () => {
    const original = makeSession([p(1000), b(1000, 2000), s(1500), r(2000)]);
    original.advance(1050);
    original.advance(1200);
    const { session } = original.reconstructAt(1050);
    session.resumeAt(1050, []);
    session.processObservedBatch(900, [down()], 1060);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1050, pointStatus: "satisfied" });
    session.processBatch(2000, [up()]);
    const result = session.finalize();
    expect(result.score).toMatchObject({ earnedScore: 7, judgmentCounts: { perfect: 2, good: 1, miss: 0 } });
    expect(result.facts.filter(fact => fact.kind === "bodyFailed")).toEqual([]);
  });

  it("Point 없는 바디 1000～2000을 T 1050에 재개한 뒤 차트 시작 창 안 raw 900·관측 1060 down은 바디를 T 1050에 시작해 유지·릴리즈 6점", () => {
    const original = makeSession([b(1000, 2000), s(1500), r(2000)]);
    original.advance(1050);
    original.advance(1200);
    const { session } = original.reconstructAt(1050);
    session.resumeAt(1050, []);
    session.processObservedBatch(900, [down()], 1060);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1050 });
    session.processBatch(2000, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, judgmentCounts: { perfect: 2, miss: 0 } });
  });

  it("2000ms에 일찍 친 2100ms Point는 2050ms 복원에 남고 항목 시각으로 제거되지 않음", () => {
    const original = makeSession([p(2100)]);
    original.processBatch(2000, [down()]);
    original.advance(2200);
    const { session } = original.reconstructAt(2050);
    expect(session.snapshot.atMs).toBe(2000);
    expect(session.snapshot.items[0]).toMatchObject({ state: "success", grade: "good" });
    expect(session.score.earnedScore).toBe(1);
    expect(session.score.totalNotes).toBe(1);
  });

  it("2000ms에 관측한 raw1950은 포함하고 2001ms에 관측한 raw1950은 정확히 T2000 복원에서 제외", () => {
    const original = makeSession([p(1950), p(1950, "single", 2)]);
    original.advance(1900, 1950);
    original.processBatch(1950, [down()], 2000);
    original.processObservedBatch(1950, [down("B", 2)], 1950, 2001);
    const { session, heldKeys } = original.reconstructAt(2000);
    expect(session.score.processedNotes).toBe(1);
    expect(session.snapshot.items.map(item => item.state)).toEqual(["success", "pending"]);
    expect(heldKeys).toEqual([{ key: "A", lane: 1 }]);
    expect(session.facts.filter(fact => fact.kind === "input")).toHaveLength(1);
  });

  it("같은 곡 T2000에 처리한 down·up·advance는 호출 순서대로 모두 복원", () => {
    const original = makeSession([p(1900)]);
    original.processBatch(1900, [down()], 2000);
    original.processBatch(1901, [up()], 2000);
    original.advance(1902, 2000);
    const expected = original.result();
    original.advance(2100, 2200);
    const { session, heldKeys } = original.reconstructAt(2000);
    expect(session.snapshot).toEqual(expected.snapshot);
    expect(session.facts).toEqual(expected.facts);
    expect(session.score).toEqual(expected.score);
    expect(heldKeys).toEqual([]);
  });

  it("곡2000·core1800 복원은 Point1850을 Miss로 만들지 않고 화면 바디만2000부터 표시", () => {
    const original = makeSession([p(1850), b(1850, 2600), r(2600)], { startTimeMs: 0 });
    original.resumeAt(0, []);
    original.advance(1800, 2000);
    original.processBatch(1850, [down()], 2050);
    const { session } = original.reconstructAt(2000);
    session.resumeAt(session.snapshot.atMs, [], 2000, 2000);
    expect(session.snapshot.atMs).toBe(1800);
    expect(session.snapshot.items[0].state).toBe("pending");
    expect(session.playbackChart.bodies[0].startMs).toBe(2000);
    session.processBatch(1850, [down()], 2050);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1850 });
    expect(session.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 0 });
  });

  it("곡2000보다 앞선 core2100의 성공은 복원하고 재개 시 core2100·표시2000을 구별", () => {
    const original = makeSession([p(2100), b(2100, 3000), r(3000)], { startTimeMs: 0 });
    original.processBatch(2100, [down()], 2000);
    original.processBatch(3000, [up()], 2900);
    const { session } = original.reconstructAt(2000);
    session.resumeAt(2100, [{ key: "B", lane: 1 }], 2000, 2000);
    expect(session.snapshot.atMs).toBe(2100);
    expect(session.snapshot.items[0].state).toBe("success");
    expect(session.playbackChart.bodies[0].startMs).toBe(2100);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 2100 });
  });

  it("곡2200·core2000에서 finalize는 마지막 곡 관측을 유지하며 과거 관측 오류를 내지 않음", () => {
    const session = makeSession([p(1000)]);
    session.advance(2000, 2200);
    expect(() => session.finalize()).not.toThrow();
    expect(session.reconstructAt(2200).session.score.judgmentCounts.miss).toBe(1);
  });

  it("1890ms 이른 up으로 완료한 2000ms 바디·릴리즈·미래 유지는 1900ms 복원에서 모두 보존", () => {
    const original = makeSession([b(1000, 2000), s(1950), r(2000)]);
    original.processBatch(1000, [down()]);
    original.processBatch(1890, [up()]);
    original.advance(1900);
    const expected = original.result();
    original.advance(2200);
    const { session } = original.reconstructAt(1900);
    expect(session.snapshot).toEqual(expected.snapshot);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", completedAtMs: 1890 });
    session.resumeAt(1900, [{ key: "B", lane: 1 }]);
    expect(session.facts).toEqual(expected.facts);
    expect(session.score).toEqual(expected.score);
  });

  it("double 한 몫만 1520ms 실패한 T1550을 복원하면 다른 몫과 릴리즈 한 기회만 살아 있음", () => {
    const original = makeSession([b(1000, 2000, 2), r(2000, 2)]);
    original.processBatch(1000, [down("A"), down("B")]);
    original.processBatch(1500, [up("B")]);
    original.advance(1550);
    original.processBatch(1600, [up("A")]);
    original.advance(1650);
    const { session } = original.reconstructAt(1550);
    expect(session.snapshot.bodyUnits.map(unit => unit.state)).toEqual(["active", "failed"]);
    session.resumeAt(1550, [{ key: "C", lane: 1 }, { key: "D", lane: 1 }]);
    session.processBatch(2000, [up("C"), up("D")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 3, totalNotes: 2,
      judgmentCounts: { perfect: 1, miss: 1 } });
    expect(settlements(session).map(fact => fact.outcome).sort()).toEqual(["dependentZero", "graded"]);
  });

  it("A로 첫 doubleRelease를 쓴 T1950 복원 뒤 같은 A의 임의 재누름은 두 번째 릴리즈를 소비하지 못함", () => {
    const original = makeSession([b(1000, 2000), r(2000, 2)]);
    original.processBatch(1000, [down()]);
    original.processBatch(1900, [up()]);
    original.advance(1950);
    original.processBatch(1980, [down("B")]);
    original.processBatch(2000, [up("B")]);
    const { session } = original.reconstructAt(1950);
    session.processBatch(1980, [down()]);
    session.processBatch(2000, [up()]);
    expect(session.finalize().score.judgmentCounts).toMatchObject({ good: 1, miss: 1 });
    expect(settlements(session).map(fact => fact.grade)).toEqual(["good", "miss"]);
  });

  it("트릴 A1000 이후 T1200 복원은 폐기한 B1300 대신 A1300을 goodTrill로 판정", () => {
    const data = fixture([p(1000, "trill"), p(1300, "trill"), p(1600, "trill")]);
    data.chart.trillZones = [{ lane: 1, beat: beat(0), endBeat: beat(4) }];
    const original = new ExplicitJudgmentSession(compileExplicitJudgmentChart(data.chart), options);
    original.processBatch(1000, [down()]);
    original.processBatch(1100, [up()]);
    original.advance(1200);
    original.processBatch(1300, [down("B")]);
    const { session } = original.reconstructAt(1200);
    session.processBatch(1300, [down()]);
    expect(settlements(session).map(fact => fact.grade)).toEqual(["perfect", "goodTrill"]);
  });

  it("잠정 시작1000·완료1060을 복원한 뒤 늦은 raw950 up은 원래와 같이 두 진행을 무효화", () => {
    const original = makeSession([b(1000, 1060)]);
    original.processBatch(500, [down()]);
    original.advance(1060);
    const beforeLate = original.result();
    original.processObservedBatch(950, [up()], 1061);
    const { session } = original.reconstructAt(1060);
    expect(session.snapshot).toEqual(beforeLate.snapshot);
    session.processObservedBatch(950, [up()], 1061);
    expect(session.snapshot).toEqual(original.snapshot);
    expect(session.facts).toEqual(original.facts);
    expect(session.facts.some(fact => fact.kind === "bodyProgressInvalidated")).toBe(true);
  });

  it("관측1530의 raw1500 up·1507 down 묶음을 복원하면 중간 유지 Miss 없이 두 입력 인과를 보존", () => {
    const original = makeSession([b(1000, 2000), r(2000)]);
    original.processBatch(1000, [down()]);
    original.advance(1510);
    original.processObservedBatches([{ rawAtMs: 1500, inputs: [up()] }, { rawAtMs: 1507, inputs: [down()] }], 1530);
    const prefix = original.result();
    original.processBatch(2000, [up()]);
    const { session } = original.reconstructAt(1530);
    expect(session.snapshot).toEqual(prefix.snapshot);
    expect(session.facts).toEqual(prefix.facts);
    session.processBatch(2000, [up()]);
    expect(session.finalize().score.judgmentCounts).toMatchObject({ perfect: 1, miss: 0 });
  });

  it("double Point의 A 한 몫 성공을 T1050에 복원하면 같은 A 재누름은 남은 몫을 치지 못하고 B만 성공", () => {
    const original = makeSession([p(1000, "double")]);
    original.processBatch(1000, [down()]);
    original.advance(1050);
    original.processBatch(1060, [down("B")]);
    const { session } = original.reconstructAt(1050);
    session.processBatch(1060, [up(), down()]);
    expect(session.score.processedNotes).toBe(1);
    session.processBatch(1070, [down("B")]);
    expect(session.score.judgmentCounts).toMatchObject({ perfect: 1, great: 1, miss: 0 });
  });

  it("관측2000 뒤1999 입력·advance·resume는 상태와 복원 기록을 바꾸기 전에 거부", () => {
    const original = makeSession([p(1900)]);
    original.advance(1800, 2000);
    const before = original.result();
    expect(() => original.processBatch(1900, [down()], 1999)).toThrow(RangeError);
    expect(() => original.advance(1900, 1999)).toThrow(RangeError);
    expect(() => original.resumeAt(1800, [], 1999)).toThrow(RangeError);
    expect(original.result()).toEqual(before);
    expect(original.reconstructAt(2000).session.snapshot).toEqual(before.snapshot);
  });

  it("원래 성공 분기와 새 Miss 분기를 두 번 되감으면 새 분기의 이력만 남고 이전 성공이 부활하지 않음", () => {
    const original = makeSession([p(1000), p(2000), p(3000)]);
    original.processBatch(1000, [down()]);
    original.processBatch(1010, [up()]);
    original.advance(1500);
    original.processBatch(2000, [down()]);
    original.advance(2500);
    const first = original.reconstructAt(1500).session;
    first.advance(2200);
    first.advance(2500);
    first.processBatch(3000, [down()]);
    const second = first.reconstructAt(2500).session;
    expect(second.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 1 });
    expect(second.snapshot.items.map(item => item.state)).toEqual(["success", "miss", "pending"]);
    const third = second.reconstructAt(1500).session;
    expect(third.score.judgmentCounts).toMatchObject({ perfect: 1, miss: 0 });
    third.processBatch(2000, [down()]);
    expect(third.score.judgmentCounts.perfect).toBe(2);
  });

  it("1500ms resume의 B hold와 새 시작 유예는 이후2000ms 복원에 포함되고 실제 down으로 재생되지 않음", () => {
    const original = makeSession([b(1000, 3000), s(1800), r(3000)]);
    original.processBatch(1000, [down()]);
    original.advance(1500);
    original.resumeAt(1500, [{ key: "B", lane: 1 }]);
    original.advance(2000);
    const expected = original.result();
    original.processBatch(2200, [up("B")]);
    original.advance(2300);
    const { session, heldKeys } = original.reconstructAt(2000);
    expect(session.snapshot).toEqual(expected.snapshot);
    expect(session.facts).toEqual(expected.facts);
    expect(heldKeys).toEqual([{ key: "B", lane: 1 }]);
    expect(session.facts.filter(fact => fact.kind === "input")).toHaveLength(1);
    expect(session.playbackChart.bodies[0].startMs).toBe(1500);
  });

  it("재개 목표2000의 B hold가 실제2050에 반영되면 T2000 복원에는 이전 A hold만 남음", () => {
    const original = makeSession([b(1000, 3000), r(3000)]);
    original.processBatch(1000, [down()]);
    original.advance(1800, 2000);
    const prefix = original.result();
    original.resumeAt(1800, [{ key: "B", lane: 1 }], 2050, 2000);
    original.advance(2000, 2200);
    const beforeResume = original.reconstructAt(2000);
    expect(beforeResume.heldKeys).toEqual([{ key: "A", lane: 1 }]);
    expect(beforeResume.session.facts).toEqual(prefix.facts);
    const afterResume = original.reconstructAt(2050);
    expect(afterResume.heldKeys).toEqual([{ key: "B", lane: 1 }]);
    expect(afterResume.session.snapshot.bodyUnits[0].actualStartMs).toBe(1800);
    expect(afterResume.session.playbackChart.bodies[0].startMs).toBe(2000);
  });

  it.each([0, 1500])("시작 S=%sms를 하한으로 복원해도 원본·source·시작 범위 분모는 다시 자르지 않음", startTimeMs => {
    const data = fixture([p(1000), b(1000, 3000), s(1500), r(3000)]);
    const chart = compileExplicitJudgmentChart(data.chart);
    const original = new ExplicitJudgmentSession(chart, { ...options, startTimeMs });
    original.resumeAt(startTimeMs, [{ key: "A", lane: 1 }]);
    original.advance(2000);
    const originalTotal = original.score.totalNotes;
    original.advance(3500);
    const restored = original.reconstructAt(startTimeMs).session;
    expect(restored.score.totalNotes).toBe(originalTotal);
    expect(restored.score.finalDenominatorWeight).toBe(originalTotal * 3);
    expect(restored.playbackChart.relations).toBe(chart.relations);
    expect(restored.playbackChart.timing).toBe(chart.timing);
    expect(restored.playbackChart.scoreItems.map(item => item.source)).toEqual(original.playbackChart.scoreItems.map(item => item.source));
    expect(chart.bodies[0].startMs).toBe(1000);
    expect(chart.scoreItems).toHaveLength(3);
    expect(() => original.reconstructAt(startTimeMs - 1)).toThrow(RangeError);
  });

  it("호출 뒤 수정한 inputs·preheld·options는 복원한 A키와 41ms Perfect 창을 바꾸지 않음", () => {
    const mutableOptions = { ...options, windows: { ...options.windows }, startTimeMs: 0,
      preheldKeys: [{ key: "C", lane: 2 }] };
    const original = makeSession([p(1000)], mutableOptions);
    const inputs = [{ key: "A", lane: 1, type: "down" as const }];
    original.processBatch(1040, inputs);
    inputs[0].key = "B";
    mutableOptions.preheldKeys[0].key = "D";
    mutableOptions.windows.PERFECT = 0;
    original.advance(1200);
    const { session, heldKeys } = original.reconstructAt(1040);
    expect(session.score.judgmentCounts.perfect).toBe(1);
    expect(heldKeys).toEqual([{ key: "C", lane: 2 }, { key: "A", lane: 1 }]);
  });
});

describe("ENJ17·HC81의 되감기 후 동일 입력은 같은 확정 결과", () => {
  it.each([...explicitEnjFixtures, ...explicitHcFixtures])("$id 중간 관측까지 복원하고 나머지를 재생하면 점수·콤보·바디·확정 사실이 일치", data => {
    const original = new ExplicitJudgmentSession(compileExplicitJudgmentChart(data.chart), {
      maintenanceGraceMs: data.maintenanceGraceMs,
      windows: { ...options.windows, PERFECT: data.windows.perfect, GREAT: data.windows.great, GOOD: data.windows.good },
    });
    for (const batch of data.batches) original.processObservedBatch(batch.rawAtMs, batch.inputs, batch.observedAtMs);
    original.advance(data.finishAtMs);
    const expected = original.finalize();
    const cutoff = data.batches[Math.floor(data.batches.length / 2)]?.observedAtMs ?? 0;
    const { session } = original.reconstructAt(cutoff);
    for (const batch of data.batches.filter(batch => batch.observedAtMs > cutoff)) {
      session.processObservedBatch(batch.rawAtMs, batch.inputs, batch.observedAtMs);
    }
    session.advance(data.finishAtMs);
    const actual = session.finalize();
    expect(actual.snapshot).toEqual(expected.snapshot);
    expect(actual.facts).toEqual(expected.facts);
    expect(actual.score).toEqual(expected.score);
    expect(actual.combo).toBe(expected.combo);
    expect(actual.effects.map(({ displayUpdate: _display, ...effect }) => effect))
      .toEqual(expected.effects.map(({ displayUpdate: _display, ...effect }) => effect));
  });
});
