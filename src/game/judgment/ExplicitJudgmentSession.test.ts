import { describe, expect, it } from "vitest";
import { compileExplicitJudgmentChart } from "./explicitCompiledChart";
import { explicitEnjFixtures } from "./explicitEnjFixtures";
import { explicitFixtureBody as b, explicitFixturePoint as p, explicitFixtureRelease as r,
  explicitFixtureSustain as s, makeExplicitReplayFixture, replayExplicitFixture } from "./explicitJudgmentTestHarness";
import type { ExplicitReplayFixture } from "./explicitJudgmentTestHarness";
import { ExplicitJudgmentSession } from "./ExplicitJudgmentSession";
import { ExplicitJudgmentCore } from "./ExplicitJudgmentCore";
import type { ExplicitConfirmedFact, ExplicitJudgmentInput } from "./ExplicitJudgmentState";

const options = { windows: { PERFECT: 41, GREAT: 82, GOOD: 120, BAD: 160 }, maintenanceGraceMs: 20 };
const down = (key = "A", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "down" });
const up = (key = "A", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "up" });
type Settlement = Extract<ExplicitConfirmedFact, { kind: "settlement" }>;
const settlements = (session: ExplicitJudgmentSession): readonly Settlement[] =>
  session.facts.filter((fact): fact is Settlement => fact.kind === "settlement");
const fixture = (notes: Parameters<typeof makeExplicitReplayFixture>[2]) => makeExplicitReplayFixture("ENJ-test", "세션 합성 회귀", notes, [],
  { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: "whole" });
const makeSession = (notes: Parameters<typeof fixture>[0]) => new ExplicitJudgmentSession(compileExplicitJudgmentChart(fixture(notes).chart), options);
const fromFixture = (test: ExplicitReplayFixture) => new ExplicitJudgmentSession(compileExplicitJudgmentChart(test.chart), options);
const m1 = explicitEnjFixtures.filter(test => /ENJ-0[1-9]$|ENJ-18$/.test(test.id));

describe("남은 바디의 재개와 기존 세션 보존", () => {
  it("0ms에서 준비용 세션을 만들면 바디·유지는 대기하고 resumeAt의 preheld가 들어온 순간 한 번 시작·정산", () => {
    const chart = compileExplicitJudgmentChart(fixture([b(0, 1000), s(0)]).chart);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 0 });
    expect(session.snapshot.atMs).toBe(0);
    expect(session.facts).toEqual([]);
    expect(session.score.earnedScore).toBe(0);
    session.resumeAt(0, [{ key: "A", lane: 1 }]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 0 });
    expect(session.score.earnedScore).toBe(3);
    expect(session.facts.filter(fact => fact.kind === "input")).toEqual([]);
    expect(session.drainEffects()).toHaveLength(1);
    session.advance(1);
    expect(session.drainEffects()).toEqual([]);
  });

  it("0ms preheld를 준비한 뒤 활성화하면 바디의 유지 1개만 정산하고 같은 시각 다른 레인의 Point에는 down을 만들지 않음", () => {
    const chart = compileExplicitJudgmentChart(fixture([b(0, 1000), s(0), p(0, "single", 2)]).chart);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 0,
      preheldKeys: [{ key: "A", lane: 1 }, { key: "B", lane: 2 }] });
    expect(session.facts).toEqual([]);
    expect(session.effects).toEqual([]);
    expect(session.score.processedNotes).toBe(0);
    session.resumeAt(0);
    expect(session.score).toMatchObject({ earnedScore: 3, processedNotes: 1, totalNotes: 2 });
    expect(session.snapshot.items.find(item => item.kind === "point")?.state).toBe("pending");
    expect(session.facts.filter(fact => fact.kind === "input")).toEqual([]);
    expect(session.drainEffects()).toHaveLength(1);
  });

  it("1500ms 커서의 preheld는 시작 전 점수·Miss 없이 대기하고 활성화 때 남은 바디·정확히 같은 시각 유지만 처리", () => {
    const chart = compileExplicitJudgmentChart(fixture([p(1000), b(1000, 2000), s(1490), s(1500), r(2000)]).chart);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 1500, preheldKeys: [{ key: "A", lane: 1 }] });
    expect(session.facts).toEqual([]);
    expect(session.score).toMatchObject({ processedNotes: 0, totalNotes: 2, finalDenominatorWeight: 6 });
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "waiting", actualStartMs: null, pointStatus: "none" });
    session.resumeAt(1500);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1500 });
    expect(settlements(session)).toMatchObject([{ itemId: "n3:sustain:0", grade: "perfect", atMs: 1500 }]);
    session.processBatch(2000, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, totalNotes: 2, processedNotes: 2,
      judgmentCounts: { perfect: 2, miss: 0 } });
    expect(chart.scoreItems).toHaveLength(4);
    expect(chart.bodies[0].startMs).toBe(1000);
  });

  it.each([1620, 1621])("1500ms 커서에서 새 down %sms는 원래 1000ms 시작이 아닌 1500ms 시작 창으로 판단", at => {
    const chart = compileExplicitJudgmentChart(fixture([p(1000), b(1000, 2000), s(1500), r(2000)]).chart);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 1500 });
    session.resumeAt(1500, []);
    session.processBatch(at, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject(at === 1620
      ? { state: "active", actualStartMs: 1620 } : { state: "failed", actualStartMs: null, failedAtMs: 1620 });
    expect(session.score.judgmentCounts.miss).toBe(at === 1620 ? 0 : 1);
    expect(session.score.totalNotes).toBe(2);
  });

  it("커서가 정확히 1000ms Point 시작이면 preheld가 Point를 치거나 바디 의무를 없애지 않고 실제 down1010이 처리", () => {
    const chart = compileExplicitJudgmentChart(fixture([p(1000), b(1000, 2000)]).chart);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 1000 });
    session.resumeAt(1000, [{ key: "A", lane: 1 }]);
    expect(session.snapshot.bodyUnits[0].state).toBe("waiting");
    expect(session.score.processedNotes).toBe(0);
    session.processBatch(1010, [up(), down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1010 });
    expect(settlements(session)).toMatchObject([{ itemKind: "point", grade: "perfect", rawDeltaMs: 10 }]);
  });

  it("커서가 바디 끝 2000ms와 같아도 릴리즈 원본 항목은 남고 preheld로 길이0 잔여를 시작한 뒤 실제 up만 점수화", () => {
    const chart = compileExplicitJudgmentChart(fixture([p(1000), b(1000, 2000), r(2000)]).chart);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 2000 });
    session.resumeAt(2000, [{ key: "A", lane: 1 }]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ ref: { bodyIndex: 1, ordinal: 0 }, state: "complete",
      actualStartMs: 2000, completedAtMs: 2000 });
    expect(session.score.processedNotes).toBe(0);
    session.processBatch(2000, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 3, processedNotes: 1, totalNotes: 1 });
  });

  it("offset−200ms 차트를 0ms부터 준비하면 앞 Point의 Miss·종속0·효과를 만들지 않고 남은 바디만 활성화", () => {
    const document = fixture([p(0), b(0, 1000), r(1000)]).chart;
    document.meta.offsetMs = -200;
    const chart = compileExplicitJudgmentChart(document);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 0, preheldKeys: [{ key: "A", lane: 1 }] });
    expect(session.facts).toEqual([]);
    expect(session.effects).toEqual([]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "waiting", actualStartMs: null });
    expect(session.score).toMatchObject({ totalNotes: 1, processedNotes: 0, judgmentCounts: { miss: 0 } });
    session.resumeAt(0);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 0 });
    session.processBatch(800, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 3, processedNotes: 1, judgmentCounts: { perfect: 1, miss: 0 } });
  });

  it("모든 항목 뒤 100000ms에서 시작하면 빈 범위·분모0이며 finalize에도 과거 Miss를 만들지 않음", () => {
    const chart = compileExplicitJudgmentChart(fixture([p(1000), b(1000, 2000), r(2000)]).chart);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 100000 });
    expect(session.snapshot).toEqual({ atMs: 100000, bodyUnits: [], items: [] });
    session.resumeAt(100000, []);
    expect(session.finalize().score).toMatchObject({ totalNotes: 0, processedNotes: 0, finalDenominatorWeight: 0,
      judgmentCounts: { miss: 0 } });
    expect(session.facts).toEqual([]);
  });

  it("원본 전체 차트를 커서1500 생성자에 직접 넘겨도 제외된 앞 연결 바디를 참조하지 않고 뒤 Point·릴리즈를 정상 처리", () => {
    const chart = compileExplicitJudgmentChart(fixture([
      b(500, 1000), p(1000), b(1000, 2000), p(2000), b(2000, 3000), r(3000),
    ]).chart);
    const core = new ExplicitJudgmentCore(chart, { ...options, startTimeMs: 1500 });
    expect(core.chart).toBe(chart);
    expect(core.playbackChart.bodies.map(body => body.source.noteIndex)).toEqual([2, 4]);
    expect(chart.connections).toHaveLength(2);
    expect(core.playbackChart.connections).toHaveLength(1);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 1500 });
    session.resumeAt(1500, [{ key: "A", lane: 1 }]);
    session.advance(2000);
    session.processBatch(2000, [down("B")]);
    session.processBatch(3000, [up("A")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, processedNotes: 2, judgmentCounts: { miss: 0 } });
  });

  it("앞 1→2 연결 바디가 제외된 커서 1500 세션에서 double 두 몫의 시작 실패 1620은 뒤 2→1 연결의 single로 번지지 않고 single은 2120 자기 시작 시간 초과로 실패해 Miss 3회", () => {
    const chart = compileExplicitJudgmentChart(fixture([b(500, 1000), b(1000, 2000, 2), b(2000, 3000)]).chart);
    const session = new ExplicitJudgmentSession(chart, { ...options, startTimeMs: 1500 });
    expect(session.playbackChart.connections).toHaveLength(1);
    session.resumeAt(1500, []);
    session.advance(1621);
    expect(session.snapshot.bodyUnits.map(unit => [unit.id, unit.state])).toEqual([
      ["b1:hold:0", "failed"], ["b1:hold:1", "failed"], ["b2:hold:0", "waiting"],
    ]);
    const result = session.finalize();
    expect(result.snapshot.bodyUnits[2]).toMatchObject({ state: "failed", failedAtMs: 2120 });
    expect(result.score.judgmentCounts.miss).toBe(3);
  });

  it("1000～2000ms 바디를 1500ms에 B preheld로 재개하면 새 down 없이 1500ms에 시작하고 기존 사실·점수·효과를 보존", () => {
    const session = makeSession([p(1000), b(1000, 2000), s(1400), s(1700), r(2000)]);
    session.processBatch(1000, [down()]);
    session.advance(1500);
    const facts = session.facts;
    const score = session.score;
    const effects = session.drainEffects();
    session.resumeAt(1500, [{ key: "B", lane: 1 }]);
    expect(session.playbackChart.bodies[0]).toMatchObject({ startMs: 1500, endMs: 2000, source: { noteIndex: 1 } });
    expect(session.playbackChart.scoreItems).toHaveLength(4);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1500, maintenanceDeadlineMs: null });
    expect(session.facts.slice(0, facts.length)).toEqual(facts);
    expect(session.facts.filter(f => f.kind === "input")).toHaveLength(1);
    expect(session.score).toEqual(score);
    expect(session.effects).toEqual(effects);
    expect(session.drainEffects()).toEqual([]);
    session.processBatch(2000, [up("B")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 12, processedNotes: 4, totalNotes: 4 });
    expect(new Set(settlements(session).map(fact => fact.itemId)).size).toBe(4);
  });

  it("1490ms up 뒤 1500ms 재개는 기존 1510ms 유예를 버리고 늦은 down 1620ms까지 시작을 허용", () => {
    const session = makeSession([b(1000, 2000), s(1500), r(2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1490, [up()]);
    session.advance(1500);
    expect(session.snapshot.bodyUnits[0].maintenanceDeadlineMs).toBe(1510);
    session.resumeAt(1500, []);
    session.advance(1620);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "waiting", actualStartMs: null, maintenanceDeadlineMs: null });
    session.processBatch(1620, [down("B")]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1620 });
    expect(settlements(session)).toMatchObject([{ itemKind: "sustain", atMs: 1620, grade: "perfect" }]);
    session.processBatch(2000, [up("B")]);
    expect(session.finalize().score.judgmentCounts).toMatchObject({ perfect: 2, miss: 0 });
  });

  it.each([950, 1000])("900ms에 일찍 시작한 1000ms Point 바디를 %sms에 재개하면 원래 시작 전 조기 preheld 없이 새 창을 적용", pauseAt => {
    const session = makeSession([p(1000), b(1000, 2000), r(2000)]);
    session.processBatch(900, [down()]);
    session.advance(pauseAt);
    const point = settlements(session)[0];
    session.resumeAt(pauseAt, []);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "waiting", actualStartMs: null });
    session.advance(1100);
    session.processBatch(1100, [down("B")]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1100 });
    expect(settlements(session)[0]).toEqual(point);
    session.processBatch(2000, [up("B")]);
    expect(session.finalize().score.judgmentCounts.miss).toBe(0);
  });

  it("1500ms 재개 뒤 down 1621ms는 새 시작 기한 1620ms 실패를 복구하지 않고 Miss 1회와 종속0을 유지", () => {
    const session = makeSession([b(1000, 2000), s(1700), r(2000)]);
    session.processBatch(1000, [down()]);
    session.advance(1500);
    session.resumeAt(1500, []);
    session.processBatch(1621, [down("B")]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", actualStartMs: null, failedAtMs: 1620 });
    expect(session.effects.map(effect => effect.scoreAction)).toEqual(["unscoredMiss", "dependentZero", "dependentZero"]);
    session.resumeAt(1621, [{ key: "C", lane: 1 }]);
    session.advance(2000);
    expect(session.score.judgmentCounts.miss).toBe(1);
    expect(session.effects).toHaveLength(3);
  });

  it("1500ms Point가 있는 레인의 준비 hold는 Point를 치지 않으며 실제 up·down만 Point를 정산", () => {
    const session = makeSession([b(1000, 2000), p(1500, "single", 2)]);
    session.processBatch(1000, [down()]);
    session.advance(1500);
    session.resumeAt(1500, [{ key: "B", lane: 1 }, { key: "C", lane: 2 }]);
    expect(settlements(session)).toEqual([]);
    session.processBatch(1500, [down("C", 2)]);
    expect(settlements(session)).toEqual([]);
    session.processBatch(1500, [up("C", 2), down("C", 2)]);
    expect(settlements(session)).toMatchObject([{ itemKind: "point", grade: "perfect" }]);
  });

  it("1495ms 회복 대기 유지와 1490ms 미처리 Point는 1500ms 재개 후에도 원래 항목·분모·입력 기회를 보존", () => {
    const session = makeSession([b(1000, 2000), s(1495), p(1490, "single", 2), r(2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1490, [up()]);
    session.advance(1500);
    const items = session.snapshot.items.map(item => item.id);
    session.resumeAt(1500, []);
    expect(session.snapshot.items.map(item => item.id)).toEqual(items);
    session.processBatch(1550, [down("B"), down("C", 2)]);
    expect(settlements(session)).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemKind: "sustain", grade: "perfect", atMs: 1550 }),
      expect.objectContaining({ itemKind: "point", grade: "great", rawDeltaMs: 60 }),
    ]));
    expect(session.score.totalNotes).toBe(3);
  });

  it("더블의 ordinal1이 1120ms에 실패하면 1500ms 재개는 ordinal0만 새로 시작하고 실패 ID·종속0·Miss를 보존", () => {
    const session = makeSession([b(1000, 2000, 2), s(1400, 2), s(1700, 2), r(2000, 2)]);
    session.processBatch(1000, [down()]);
    session.advance(1500);
    const failed = session.snapshot.bodyUnits[1];
    const settled = settlements(session);
    const effectCount = session.effects.length;
    session.resumeAt(1500, [{ key: "B", lane: 1 }, { key: "C", lane: 1 }]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ ref: { bodyIndex: 0, ordinal: 0 }, state: "active", actualStartMs: 1500 });
    expect(session.snapshot.bodyUnits[1]).toEqual(failed);
    expect(settlements(session)).toEqual(settled);
    expect(session.effects).toHaveLength(effectCount);
    session.processBatch(2000, [up("B"), up("C")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 9, totalNotes: 6, processedNotes: 6 });
    expect(session.score.judgmentCounts).toMatchObject({ perfect: 3, miss: 1 });
  });

  it("1890ms에 이미 완료한 바디를 1900ms 재개해도 새 시작·점수·효과가 생기지 않음", () => {
    const session = makeSession([b(1000, 2000), s(1950), r(2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1890, [up()]);
    session.advance(1900);
    const before = session.result();
    session.resumeAt(1900, [{ key: "B", lane: 1 }]);
    expect(session.result()).toEqual(before);
  });

  it("첫 더블 릴리즈를 A로 처리한 뒤 준비에서 A를 다시 누른 상태로 재개해도 같은 키 예외는 새로 생기지 않음", () => {
    const session = makeSession([b(1000, 2000), r(2000, 2)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1980, [up()]);
    session.advance(1990);
    session.resumeAt(1990, [{ key: "A", lane: 1 }, { key: "B", lane: 1 }]);
    session.processBatch(2000, [up()]);
    expect(session.score.processedNotes).toBe(1);
    session.processBatch(2000, [up("B")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, processedNotes: 2, judgmentCounts: { perfect: 2, miss: 0 } });
  });

  it("ENJ-15 실제 Point down1020의 같은 키 릴리즈 권한은 resume1030의 hold 교체 뒤에도 보존되어 11/12점", () => {
    const test = explicitEnjFixtures.find(test => test.id === "ENJ-15")!;
    const session = fromFixture(test);
    for (const batch of test.batches.filter(batch => batch.rawAtMs <= 1020)) session.processBatch(batch.rawAtMs, batch.inputs);
    session.advance(1030);
    const completed = session.snapshot.bodyUnits;
    session.resumeAt(1030, [{ key: "A", lane: 1 }]);
    expect(session.snapshot.bodyUnits).toEqual(completed);
    session.processBatch(1060, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 11, processedNotes: 4,
      judgmentCounts: { perfect: 3, great: 1, miss: 0 } });
    expect(session.facts.filter(fact => fact.kind === "input")).toHaveLength(4);
  });

  it("바디 끝2000 뒤 resume2050은 표시 바디만 제외하고 원본 bodyIndex0 릴리즈를 up2060 Great로 처리", () => {
    const session = makeSession([b(1000, 2000), r(2000)]);
    session.processBatch(1000, [down()]);
    session.advance(2050);
    session.resumeAt(2050, [{ key: "B", lane: 1 }]);
    expect(session.playbackChart.bodies).toEqual([]);
    expect(session.playbackChart.scoreItems[0]).toMatchObject({ bodyIndex: 0, id: "n1:release:0" });
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ ref: { bodyIndex: 0, ordinal: 0 }, state: "complete" });
    session.processBatch(2060, [up("B")]);
    expect(settlements(session)).toMatchObject([{ itemId: "n1:release:0", grade: "great", rawDeltaMs: 60 }]);
  });

  it.each([["A", "B"], ["B", "A"]])("1500ms 재개 뒤 같은 시각 더블 up 순서 %s·%s는 같은 두 릴리즈를 각각 한 번 정산", (first, second) => {
    const session = makeSession([b(1000, 2000, 2), r(2000, 2)]);
    session.processBatch(1000, [down(), down("B")]);
    session.advance(1500);
    session.resumeAt(1500, [{ key: first, lane: 1 }, { key: second, lane: 1 }]);
    session.processObservedBatches([{ rawAtMs: 2000, inputs: [up(first)] }, { rawAtMs: 2000, inputs: [up(second)] }], 2000);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, processedNotes: 2, judgmentCounts: { perfect: 2, miss: 0 } });
    expect(settlements(session).map(fact => fact.itemId)).toEqual(["n1:release:0", "n1:release:1"]);
  });

  it("더블 한 몫이 1890ms에 완료되어도 1900ms의 남은 몫은 완료 몫의 옛 키로 새 시작 가능", () => {
    const session = makeSession([b(1000, 2000, 2), s(1950, 2)]);
    session.processBatch(1000, [down("A"), down("B")]);
    session.processBatch(1890, [up("B")]);
    session.advance(1900);
    const complete = session.snapshot.bodyUnits[1];
    session.resumeAt(1900, [{ key: "B", lane: 1 }]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1900 });
    expect(session.snapshot.bodyUnits[1]).toEqual(complete);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, processedNotes: 2 });
  });

  it("1500ms·1600ms 반복 재개와 늦은 raw1490 입력은 옛 시작·유예를 되살리지 않고 효과를 중복하지 않음", () => {
    const session = makeSession([b(1000, 2000), s(1400), s(1700), r(2000)]);
    session.processBatch(1000, [down()]);
    session.advance(1500);
    session.resumeAt(1500, [{ key: "B", lane: 1 }]);
    session.advance(1600);
    session.resumeAt(1600, [{ key: "C", lane: 1 }]);
    expect(session.playbackChart.bodies[0].startMs).toBe(1600);
    const facts = session.facts;
    session.processObservedBatch(1490, [up("C")], 1610);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "recovering", actualStartMs: 1600,
      maintenanceSinceMs: 1600, maintenanceDeadlineMs: 1720 });
    expect(session.facts.slice(0, facts.length)).toEqual(facts);
    expect(session.facts.filter(f => f.kind === "bodyProgressInvalidated")).toEqual([]);
    expect(session.facts.filter(f => f.kind === "input").at(-1)).toMatchObject({ atMs: 1490, heldAtMs: 1600 });
    session.processBatch(1620, [down("D")]);
    session.processBatch(2000, [up("D")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 9, processedNotes: 3 });
    expect(session.effects).toHaveLength(3);
  });

  it("재개 시각이 멈춘 1500ms와 다르거나 preheld 키가 중복이면 기존 사실·상태를 바꾸지 않고 거부", () => {
    const session = makeSession([b(1000, 2000)]);
    session.processBatch(1000, [down()]);
    session.advance(1500);
    const before = session.result();
    expect(() => session.resumeAt(1499, [])).toThrow(RangeError);
    expect(() => session.resumeAt(1501, [])).toThrow(RangeError);
    expect(() => session.resumeAt(1500, [{ key: "B", lane: 1 }, { key: "B", lane: 2 }])).toThrow(RangeError);
    expect(session.result()).toEqual(before);
  });
});

describe("실제 explicit compiler → core → session → ScoreManager", () => {
  it.each(m1)("$id 승인 입력을 실제 세션으로 재생하면 $expected.earnedScore/$expected.theoreticalWeight점과 정확한 항목 수", test => {
    const { compiled, result } = replayExplicitFixture(test, (chart, config) => new ExplicitJudgmentSession(chart,
      { windows: { PERFECT: config.windows.perfect, GREAT: config.windows.great, GOOD: config.windows.good, BAD: 160 },
        maintenanceGraceMs: config.maintenanceGraceMs }));
    expect(result.score).toMatchObject({ earnedScore: test.expected.earnedScore,
      finalDenominatorWeight: test.expected.theoreticalWeight, liveDenominatorWeight: test.expected.theoreticalWeight,
      processedNotes: test.expected.scoreItemCount, totalNotes: test.expected.scoreItemCount });
    const settled = result.facts.filter(fact => fact.kind === "settlement");
    expect(settled).toHaveLength(compiled.totalJudgments);
    expect(new Set(settled.map(fact => fact.itemId)).size).toBe(compiled.totalJudgments);
    expect(result.snapshot.items.every(item => item.settlementFactId !== null)).toBe(true);
    expect(result.snapshot.bodyUnits.every(unit => unit.state === "complete" || unit.state === "failed")).toBe(true);
  });

  it("ENJ-01 preheld 500ms는 880ms에 미시작이고 1000ms 시작·1500ms 표식 성공·2000ms 무점수 완료", () => {
    const session = fromFixture(m1[0]);
    session.processBatch(500, [down()]);
    session.advance(880);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "waiting", actualStartMs: null });
    session.advance(1000);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1000 });
    expect(settlements(session)).toHaveLength(0);
    session.advance(1500);
    expect(settlements(session)).toMatchObject([{ itemKind: "sustain", grade: "perfect", atMs: 1500, inputId: null, timingDeltaMs: null }]);
    session.advance(2000);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", completedAtMs: 2000 });
    expect(session.result().score.earnedScore).toBe(3);
    expect(session.facts.filter(f => f.kind === "input")).toMatchObject([{ consumedItemId: null }]);
  });

  it("ENJ-02 fresh down 900ms는 즉시 시작하지만 미래 유지 1500ms는 미리 정산하지 않음", () => {
    const session = fromFixture(m1[1]);
    session.processBatch(900, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 900 });
    expect(session.snapshot.items[0].state).toBe("pending");
    expect(settlements(session)).toHaveLength(0);
    session.advance(1500);
    expect(settlements(session)).toMatchObject([{ atMs: 1500, grade: "perfect" }]);
  });

  it("ENJ-03 down 900ms 뒤 up 950ms는 바디를 이르게 완료하고 1030ms 유지도 950ms에 Perfect", () => {
    const session = fromFixture(m1[2]);
    session.processBatch(900, [down()]);
    session.processBatch(950, [up()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", actualStartMs: 900, completedAtMs: 950 });
    expect(settlements(session)).toMatchObject([{ itemKind: "sustain", atMs: 950, grade: "perfect", inputId: null }]);
    expect(session.facts.filter(f => f.kind === "input").every(f => f.consumedItemId === null)).toBe(true);
  });

  it("ENJ-04 preheld up 950ms 뒤 1030ms 유지는 시작을 기다리고 1120ms 포함 기한 뒤 무점수 Miss 1회와 종속 0점", () => {
    const session = fromFixture(m1[3]);
    session.processBatch(500, [down()]);
    session.processBatch(950, [up()]);
    session.advance(1030);
    expect(session.snapshot.items[0]).toMatchObject({ state: "waiting", waitingReason: "bodyStart" });
    session.advance(1120);
    expect(session.snapshot.bodyUnits[0].state).toBe("waiting");
    session.advance(1121);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", actualStartMs: null, failedAtMs: 1120 });
    expect(session.result().score.judgmentCounts.miss).toBe(1);
    expect(session.effects.map(effect => effect.scoreAction)).toEqual(["unscoredMiss", "dependentZero"]);
  });

  it("ENJ-05 up 1490ms 뒤 1500ms 표식은 회복 대기하고 down 1505ms에 타이밍 없이 Perfect 확정", () => {
    const session = fromFixture(m1[4]);
    session.processBatch(1000, [down()]);
    session.processBatch(1490, [up()]);
    session.advance(1500);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "recovering", maintenanceSinceMs: 1490, maintenanceDeadlineMs: 1510 });
    expect(session.snapshot.items[0]).toMatchObject({ state: "waiting", waitingReason: "bodyRecovery" });
    expect(session.effects).toHaveLength(0);
    session.processBatch(1505, [down("B")]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", maintenanceSinceMs: null });
    expect(settlements(session)).toMatchObject([{ atMs: 1505, confirmedAt: 1505, grade: "perfect", inputId: null, timingDeltaMs: null }]);
    expect(session.effects[0]).toMatchObject({ altitudeAction: "success", displayGrade: "perfect", hitGrade: "perfect", comboAction: "increment" });
    expect(session.combo).toBe(1);
  });

  it("ENJ-06 1510ms 유지 실패 뒤 1525ms 재누름은 성공 1400ms 표식·실패·종속 세 항목을 바꾸지 않음", () => {
    const session = fromFixture(m1[5]);
    session.processBatch(1000, [down()]);
    session.processBatch(1490, [up()]);
    session.advance(1511);
    const before = settlements(session);
    expect(before.map(fact => fact.outcome)).toEqual(["graded", "dependentZero", "dependentZero", "dependentZero"]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1510 });
    session.processBatch(1525, [down("B")]);
    session.processBatch(2000, [up("B")]);
    expect(settlements(session)).toEqual(before);
    expect(session.result().score).toMatchObject({ earnedScore: 3, processedNotes: 4, isFullCombo: false });
    expect(session.result().score.judgmentCounts).toMatchObject({ perfect: 1, miss: 1 });
    expect(session.effects.filter(effect => effect.altitudeAction === "failure")).toHaveLength(1);
    expect(session.effects.filter(effect => effect.scoreAction === "dependentZero").every(effect =>
      effect.displayGrade === null && effect.hitGrade === null && effect.altitudeAction === "none" && effect.comboAction === "none")).toBe(true);
  });

  it("ENJ-07 up 1890ms는 release Good -110ms 한 항목만 소비하고 유지 두 개는 Perfect·콤보 3·FAST 1회", () => {
    const session = fromFixture(m1[6]);
    session.processBatch(1000, [down()]);
    session.processBatch(1890, [up()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", completedAtMs: 1890 });
    expect(settlements(session).map(fact => [fact.itemKind, fact.grade, fact.timingDeltaMs])).toEqual([
      ["release", "good", -110], ["sustain", "perfect", null], ["sustain", "perfect", null],
    ]);
    expect(session.facts.filter(fact => fact.kind === "input" && fact.consumedItemId !== null)).toHaveLength(1);
    expect(session.result().score).toMatchObject({ earnedScore: 7, fastCount: 1, slowCount: 0 });
    expect(session.combo).toBe(3);
  });

  it("ENJ-08 Grace up 1890ms는 raw -110ms를 보존하지만 릴리즈·유지 모두 타이밍 효과 없이 Perfect", () => {
    const session = fromFixture(m1[7]);
    session.processBatch(1000, [down()]);
    session.processBatch(1890, [up()]);
    expect(settlements(session)).toMatchObject([{ itemKind: "release", grade: "perfect", rawDeltaMs: -110, timingDeltaMs: null },
      { itemKind: "sustain", grade: "perfect", timingDeltaMs: null }]);
    expect(session.result().score).toMatchObject({ earnedScore: 6, fastCount: 0, slowCount: 0 });
  });

  it("ENJ-09 up 없이 2000ms 완료한 바디는 숨김 상태를 유지하고 2120ms 창 뒤 Grace release만 Miss", () => {
    const session = fromFixture(m1[8]);
    session.processBatch(1000, [down()]);
    session.advance(2000);
    expect(session.snapshot.bodyUnits[0].state).toBe("complete");
    expect(session.snapshot.items[0].state).toBe("pending");
    session.advance(2120);
    expect(session.snapshot.items[0].state).toBe("pending");
    session.advance(2121);
    expect(session.snapshot.items[0].state).toBe("miss");
    expect(session.facts.filter(fact => fact.kind === "bodyFailed")).toHaveLength(0);
    expect(session.result().score.judgmentCounts.miss).toBe(1);
  });

  it("ENJ-18 1060ms 끝에서도 시작을 기다리고 down 1070ms에 실제 시작·즉시 완료·유지 성공 후 up 1080ms만 release 소비", () => {
    const session = fromFixture(m1[9]);
    session.advance(1060);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "waiting", actualStartMs: null });
    expect(session.snapshot.items[0]).toMatchObject({ state: "waiting", waitingReason: "bodyStart" });
    session.processBatch(1070, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", actualStartMs: 1070, completedAtMs: 1070 });
    expect(session.snapshot.items[1].state).toBe("pending");
    session.processBatch(1080, [up()]);
    expect(settlements(session)).toMatchObject([{ itemKind: "sustain", atMs: 1070, timingDeltaMs: null },
      { itemKind: "release", atMs: 1080, rawDeltaMs: 20, timingDeltaMs: 20 }]);
    expect(session.facts.filter(fact => fact.kind === "bodyStarted" || fact.kind === "bodyCompleted").map(fact => fact.kind))
      .toEqual(["bodyStarted", "bodyCompleted"]);
  });
});

describe("합성 차트의 lifecycle·실패·입력·효과 소유권", () => {
  it("Point+바디+유지+release는 down 1000ms를 Point 하나만 소비하고 유지·완료·up 정산 뒤 9/9점", () => {
    const session = makeSession([p(1000), b(1000, 2000), s(1500), r(2000)]);
    session.processBatch(1000, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1000, pointStatus: "satisfied" });
    expect(session.snapshot.items.map(item => item.state)).toEqual(["success", "pending", "pending"]);
    session.advance(1500);
    expect(session.combo).toBe(2);
    session.advance(2000);
    expect(session.snapshot.bodyUnits[0].state).toBe("complete");
    expect(session.snapshot.items[2].state).toBe("pending");
    session.processBatch(2000, [up()]);
    const result = session.finalize();
    expect(result.score).toMatchObject({ earnedScore: 9, maxPossibleScore: 9, achievementRate: 100, processedNotes: 3, isFullCombo: true });
    expect(session.combo).toBe(3);
    expect(result.facts.filter(f => f.kind === "input")).toMatchObject([
      { action: "down", consumedItemId: "n0:point:0" }, { action: "up", consumedItemId: "n3:release:0" },
    ]);
    expect(result.facts.filter(f => f.kind === "bodyStarted" || f.kind === "bodyCompleted")).toHaveLength(2);
  });

  it("첫 Point 1000ms에 preheld 500ms만 있으면 1120ms 기한 뒤 Point Miss 하나와 바디·유지·release 종속 실패", () => {
    const session = makeSession([p(1000), b(1000, 2000), s(1500), r(2000)]);
    session.processBatch(500, [down()]);
    session.advance(1000);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "waiting", pointStatus: "waiting", actualStartMs: null });
    session.advance(1121);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", pointStatus: "missed", actualStartMs: null });
    expect(session.facts.filter(f => f.kind === "bodyFailed")).toMatchObject([{ reason: "pointMiss", unscoredMiss: false }]);
    expect(settlements(session).map(f => [f.itemKind, f.outcome, f.grade])).toEqual([
      ["point", "graded", "miss"], ["sustain", "dependentZero", null], ["release", "dependentZero", null],
    ]);
    session.processBatch(2000, [up()]);
    expect(session.finalize().score.judgmentCounts.miss).toBe(1);
    expect(session.effects.filter(effect => effect.altitudeAction === "failure")).toHaveLength(1);
  });

  it("Point 실제 down 1100ms 전에는 유지 실패를 세지 않고 1100ms 시작 뒤 up 1150ms부터 1170ms 유지 실패", () => {
    const session = makeSession([p(1000), b(1000, 2000), s(1050), r(2000)]);
    session.advance(1099);
    expect(session.snapshot.items[1]).toMatchObject({ state: "waiting", waitingReason: "bodyStart" });
    expect(session.effects).toHaveLength(0);
    session.processBatch(1100, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ actualStartMs: 1100, state: "active" });
    expect(settlements(session).map(f => [f.itemKind, f.grade, f.atMs])).toEqual([["point", "good", 1100], ["sustain", "perfect", 1100]]);
    session.processBatch(1150, [up()]);
    session.advance(1171);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1170 });
    expect(session.result().score.judgmentCounts).toMatchObject({ good: 1, perfect: 1, miss: 1 });
  });

  it("Point를 일찍 친 down 900ms 뒤 up 910ms는 headless 재충전 없이 930ms 유지 실패", () => {
    const session = makeSession([p(1000), b(1000, 2000), r(2000)]);
    session.processBatch(900, [down()]);
    session.processBatch(910, [up()]);
    expect(session.snapshot.bodyUnits[0].maintenanceDeadlineMs).toBe(930);
    session.advance(931);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 930 });
  });

  it("headless 시작 1000ms 뒤 up 1005ms와 down 1080ms는 1120ms 재충전 안에서 회복", () => {
    const session = makeSession([b(1000, 2000), s(1050), r(2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1005, [up()]);
    session.advance(1050);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "recovering", maintenanceDeadlineMs: 1120 });
    session.processBatch(1080, [down()]);
    session.processBatch(2000, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, isFullCombo: true });
  });

  it.each([41, 82, 120])("일반 Point/release의 ±%ims 경계는 포함하고 동일 raw 오차 등급으로 각각 한 항목 소비", delta => {
    const expected = delta === 41 ? "perfect" : delta === 82 ? "great" : "good";
    for (const sign of [-1, 1]) {
      const session = makeSession([p(1000), r(2000)]);
      session.processBatch(1000 + sign * delta, [down()]);
      session.processBatch(2000 + sign * delta, [up()]);
      expect(settlements(session).map(f => [f.grade, f.rawDeltaMs])).toEqual([[expected, sign * delta], [expected, sign * delta]]);
    }
  });

  it("Point와 standalone release의 121ms 바깥 입력은 소비하지 않고 각각 Miss", () => {
    const session = makeSession([p(1000), r(2000)]);
    session.processBatch(879, [down()]);
    session.processBatch(879.5, [up()]);
    session.processBatch(1800, [down()]);
    session.processBatch(2121, [up()]);
    expect(session.finalize().score.judgmentCounts.miss).toBe(2);
    expect(session.facts.filter(f => f.kind === "input").every(f => f.consumedItemId === null)).toBe(true);
  });

  it("standalone Grace release는 body 없이 실제 up 1890ms를 Perfect로 소비하고 down·hold만으로는 성공하지 않음", () => {
    const hit = makeSession([r(2000, 1, 1, true)]);
    hit.processBatch(500, [down()]);
    hit.processBatch(1890, [up()]);
    expect(hit.finalize().score).toMatchObject({ earnedScore: 3, fastCount: 0, slowCount: 0 });
    expect(settlements(hit)).toMatchObject([{ grade: "perfect", rawDeltaMs: -110, timingDeltaMs: null }]);
    const held = makeSession([r(2000, 1, 1, true)]);
    held.processBatch(500, [down()]);
    expect(held.finalize().score.judgmentCounts.miss).toBe(1);
  });

  it("한 down/up은 겹친 창에서 가장 이른 Point/release 하나만 소비하며 hold는 바디를 함께 시작", () => {
    const session = makeSession([p(1000), p(1100), b(1050, 2000), r(2000), r(2100)]);
    session.processBatch(1050, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ actualStartMs: 1050, state: "active" });
    expect(settlements(session)).toMatchObject([{ itemId: "n0:point:0" }]);
    session.processBatch(2050, [up()]);
    expect(settlements(session).filter(f => f.itemKind === "release")).toMatchObject([{ itemId: "n3:release:0" }]);
    const result = session.finalize();
    expect(result.score.judgmentCounts).toMatchObject({ great: 2, miss: 2 });
  });

  it("attached release의 이른 up 950ms는 미시작 바디를 완료하거나 소비하지 않으며 시작 기한 뒤 종속 0점", () => {
    const session = makeSession([b(1000, 1060), r(1060)]);
    session.processBatch(500, [down()]);
    session.processBatch(950, [up()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ actualStartMs: null, state: "waiting" });
    expect(session.facts.filter(f => f.kind === "input")).toMatchObject([{ consumedItemId: null }, { consumedItemId: null }]);
    expect(session.finalize().score.judgmentCounts.miss).toBe(1);
    expect(settlements(session)).toMatchObject([{ outcome: "dependentZero" }]);
  });

  it.each([1510, 1511])("up 1490ms 뒤 down %ims는 20ms 포함 경계에 따라 회복 또는 실패", recoveredAt => {
    const session = makeSession([b(1000, 2000), s(1500), r(2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1490, [up()]);
    session.processBatch(recoveredAt, [down("B")]);
    expect(session.snapshot.bodyUnits[0].state).toBe(recoveredAt === 1510 ? "active" : "failed");
    expect(session.snapshot.items[0].state).toBe(recoveredAt === 1510 ? "success" : "dependentZero");
  });

  it("raw Point 970ms/observed 990ms와 raw release 1970ms/observed 1990ms는 raw -30ms 등급·FAST와 관측 확정 시각을 분리", () => {
    const session = makeSession([p(1000), b(1000, 2000), s(1500), r(2000)]);
    session.processObservedBatch(970, [down()], 990);
    session.processObservedBatch(1970, [up()], 1990);
    expect(settlements(session).filter(f => f.inputId !== null)).toMatchObject([
      { atMs: 970, confirmedAt: 990, grade: "perfect", rawDeltaMs: -30, timingDeltaMs: -30 },
      { atMs: 1970, confirmedAt: 1990, grade: "perfect", rawDeltaMs: -30, timingDeltaMs: -30 },
    ]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 9, fastCount: 2, slowCount: 0 });
  });

  it("1510ms 유지 실패를 이미 확정하면 raw 회복 1505ms가 observed 1520ms로 와도 실패·종속 0점을 번복하지 않음", () => {
    const session = makeSession([b(1000, 2000), s(1500), r(2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1490, [up()]);
    session.advance(1511);
    const before = settlements(session);
    session.processObservedBatch(1505, [down("B")], 1520);
    expect(settlements(session)).toEqual(before);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1510 });
    expect(session.facts.filter(f => f.kind === "input")).toMatchObject([
      { atMs: 1000 }, { atMs: 1490 }, { atMs: 1505, observedAt: 1520, consumedItemId: null },
    ]);
  });

  it("입력 없는 advance 1120ms 뒤 같은 시각 Point down은 Good이고 1121ms 관측 뒤 raw 1120ms down은 이미 확정한 Miss", () => {
    const exact = makeSession([p(1000)]);
    exact.advance(1120);
    exact.processBatch(1120, [down()]);
    expect(settlements(exact)).toMatchObject([{ grade: "good", atMs: 1120 }]);
    const late = makeSession([p(1000)]);
    late.processObservedBatch(1120, [down()], 1121);
    expect(settlements(late)).toMatchObject([{ grade: "miss", atMs: 1120, inputId: null }]);
  });

  it("시작 Point 기한과 짧은 바디 끝이 모두 1120ms여도 advance 1120ms 뒤 down 1120ms로 Good·즉시 완료", () => {
    const session = makeSession([p(1000), b(1000, 1120), s(1100), r(1120)]);
    session.advance(1120);
    expect(session.snapshot.items[0].state).toBe("pending");
    expect(session.snapshot.bodyUnits[0].state).toBe("waiting");
    session.processBatch(1120, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ actualStartMs: 1120, completedAtMs: 1120, state: "complete" });
    session.processBatch(1121, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 7, isFullCombo: true });
  });

  it("headless 시작 창의 ±120ms down은 실제 시작하지만 121ms 늦은 down은 시작 실패를 복구하지 않음", () => {
    for (const at of [880, 1120, 1121]) {
      const session = makeSession([b(1000, 2000), r(2000)]);
      session.processBatch(at, [down()]);
      expect(session.snapshot.bodyUnits[0]).toMatchObject(at === 1121
        ? { state: "failed", actualStartMs: null, failedAtMs: 1120 }
        : { state: "active", actualStartMs: at });
    }
  });

  it("body 1000～2000ms의 up 1880ms는 Good 이른 경계에서 완료하지만 up 1879ms는 회복 대기 후 1899ms 실패", () => {
    for (const at of [1879, 1880]) {
      const session = makeSession([b(1000, 2000), s(1950), r(2000)]);
      session.processBatch(1000, [down()]);
      session.processBatch(at, [up()]);
      expect(session.snapshot.bodyUnits[0].state).toBe(at === 1880 ? "complete" : "recovering");
      session.advance(1900);
      expect(session.snapshot.bodyUnits[0]).toMatchObject(at === 1880
        ? { state: "complete", completedAtMs: 1880 }
        : { state: "failed", failedAtMs: 1899 });
    }
  });

  it("lane 없는 입력이 섞인 batch는 시각·hold·Point 정산 모두 변경 없이 거부", () => {
    const session = makeSession([p(1000), b(1000, 2000)]);
    expect(() => session.processBatch(1000, [down(), { key: "B", type: "down" }])).toThrow(RangeError);
    expect(session.snapshot.atMs).toBe(-Infinity);
    expect(session.facts).toHaveLength(0);
    session.processBatch(1000, [down()]);
    expect(session.result().score.earnedScore).toBe(3);
  });

  it("중복 down과 hold 없는 up은 새 입력 소비·바디 시작·정산을 만들지 않음", () => {
    const session = makeSession([p(1000), p(1100)]);
    session.processBatch(1000, [down(), down()]);
    session.processBatch(1100, [down()]);
    session.processBatch(1101, [up("B")]);
    expect(session.facts.filter(f => f.kind === "input").map(f => f.accepted)).toEqual([true, false, false, false]);
    expect(settlements(session)).toHaveLength(1);
    expect(session.finalize().score.judgmentCounts.miss).toBe(1);
  });

  it("유지 표식만 추가·제거하면 바디·Point·release·입력 사실과 원인 실패는 그대로이며 정산만 늘어남", () => {
    const base = makeSession([p(1000), b(1000, 2000), r(2000)]);
    const added = makeSession([p(1000), b(1000, 2000), r(2000), s(1400), s(1500), s(1700)]);
    for (const session of [base, added]) {
      session.processBatch(1000, [down()]); session.processBatch(1490, [up()]); session.advance(1511);
    }
    const nonSustain = (session: ExplicitJudgmentSession) => session.facts.filter(f => f.kind !== "settlement" || f.itemKind !== "sustain")
      .map(({ id: _id, ...fact }) => "causeFactId" in fact ? { ...fact, causeFactId: fact.causeFactId === null ? null : "cause" } : fact);
    expect(nonSustain(added)).toEqual(nonSustain(base));
    expect(added.result().score.earnedScore - base.result().score.earnedScore).toBe(3);
    expect(added.result().score.judgmentCounts.miss).toBe(base.result().score.judgmentCounts.miss);
  });

  it("Point1000·릴리즈2000 세션의 snapshot·result·finalize를 다시 읽고 drainEffects를 다시 불러도 확정 사실·점수를 다시 만들지 않고 효과는 한 번씩만 전달", () => {
    const session = makeSession([p(1000), b(1000, 2000), s(1500), r(2000)]);
    session.processBatch(1000, [down()]);
    const saved = session.snapshot;
    const firstFacts = session.facts;
    expect(Object.isFrozen(saved)).toBe(true);
    expect(Object.isFrozen(saved.bodyUnits[0].ref)).toBe(true);
    expect(firstFacts.every(Object.isFrozen)).toBe(true);
    expect(session.drainEffects()).toHaveLength(1);
    expect(session.drainEffects()).toHaveLength(0);
    session.processBatch(2000, [up()]);
    expect(saved.bodyUnits[0].state).toBe("active");
    expect(firstFacts).toHaveLength(3);
    const result = session.finalize();
    const remaining = session.drainEffects();
    expect(remaining).toHaveLength(2);
    expect(session.finalize()).toEqual(result);
    expect(session.result()).toEqual(result);
    expect(session.drainEffects()).toHaveLength(0);
    expect(new Set(session.effects.map(effect => effect.factId)).size).toBe(3);
    expect(() => session.advance(3000)).toThrow("finalize");
  });

  it("바디만 있는 차트는 점수 항목·분모 0을 유지하고 실패해도 무점수 Miss만 1회 기록", () => {
    const session = makeSession([b(1000, 2000)]);
    const result = session.finalize();
    expect(result.score).toMatchObject({ totalNotes: 0, processedNotes: 0, earnedScore: 0,
      finalDenominatorWeight: 0, liveDenominatorWeight: 0, achievementRate: 0, isFullCombo: false });
    expect(result.score.judgmentCounts.miss).toBe(1);
    expect(result.facts.filter(f => f.kind === "settlement")).toHaveLength(0);
  });

  it("Point1000·2000ms 중 첫 Perfect 뒤 score 조회는 3점 snapshot을 보존하고 다음 Perfect 뒤에는 6점", () => {
    const session = makeSession([p(1000), p(2000)]);
    session.processBatch(1000, [down()]);
    const first = session.score;
    expect(first).toMatchObject({ earnedScore: 3, processedNotes: 1, finalDenominatorWeight: 6 });
    expect(first.judgmentCounts.perfect).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.judgmentCounts)).toBe(true);
    session.processBatch(1500, [up()]);
    session.processBatch(2000, [down()]);
    expect(session.score).toMatchObject({ earnedScore: 6, processedNotes: 2 });
    expect(session.score.judgmentCounts.perfect).toBe(2);
    expect(first.earnedScore).toBe(3);
    expect(first.judgmentCounts.perfect).toBe(1);
    expect(session.score).toEqual(session.result().score);
  });

  it("Point1000ms Perfect 뒤 score·combo를 반복 조회해도 효과 1개는 첫 drain에서만 전달", () => {
    const session = makeSession([p(1000)]);
    session.processBatch(1000, [down()]);
    for (let frame = 0; frame < 10; frame++) {
      expect(session.score.earnedScore).toBe(3);
      expect(session.combo).toBe(1);
    }
    expect(session.drainEffects()).toHaveLength(1);
    expect(session.score.earnedScore).toBe(3);
    expect(session.drainEffects()).toHaveLength(0);
  });

  it("길이 0 바디+유지는 preheld 500ms로 1000ms에 시작·완료·Perfect 3점만 확정", () => {
    const session = makeSession([b(1000, 1000), s(1000)]);
    session.processBatch(500, [down()]);
    session.advance(1000);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", actualStartMs: 1000, completedAtMs: 1000 });
    expect(session.finalize().score).toMatchObject({ earnedScore: 3, processedNotes: 1, isFullCombo: true });
  });

  it("double·connection·더블 릴리즈를 컴파일하면 요구한 몫과 명시 점수 항목을 보존", () => {
    expect(makeSession([b(1000, 2000, 2)]).snapshot.bodyUnits).toHaveLength(2);
    expect(makeSession([b(1000, 2000), r(2000), b(2000, 3000)]).snapshot.bodyUnits).toHaveLength(2);
    expect(makeSession([p(1000, "double")]).snapshot.items).toHaveLength(2);
    expect(makeSession([b(1000, 2000), r(2000, 2)]).snapshot.items).toHaveLength(2);
  });
});

describe("재개 뒤 늦게 안 준비 hold의 syncHeldKeys 반영", () => {
  const makeResumable = (notes: Parameters<typeof fixture>[0], startTimeMs: number) =>
    new ExplicitJudgmentSession(compileExplicitJudgmentChart(fixture(notes).chart), { ...options, startTimeMs });

  it("1000 재개 preheld A로 시작한 바디1000～3000을 1170에 떼고 1180에 레인2 hold B만 맞추면 레인1 유지 기한1190은 그대로라 1220 재입력은 유지1500을 살리지 못함", () => {
    const session = makeResumable([b(1000, 3000), s(1500)], 1000);
    session.resumeAt(1000, [{ key: "A", lane: 1 }]);
    session.processBatch(1170, [up()]);
    session.advance(1180);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "recovering", maintenanceDeadlineMs: 1190 });
    session.syncHeldKeys(1180, [{ key: "B", lane: 2 }]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "recovering", actualStartMs: 1000, maintenanceDeadlineMs: 1190 });
    session.processBatch(1220, [down()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 0, processedNotes: 1 });
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1190 });
  });

  it("0 재개 preheld A로 시작한 바디0～1000에서 10에 hold를 비우면 10부터 부족이라 재충전 기한120까지 down이 없으면 입력 사실 없이 유지 실패", () => {
    const session = makeResumable([b(0, 1000), s(500)], 0);
    session.resumeAt(0, [{ key: "A", lane: 1 }]);
    session.advance(10);
    session.syncHeldKeys(10, []);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "recovering", maintenanceSinceMs: 10, maintenanceDeadlineMs: 120 });
    session.advance(121);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 120 });
    expect(session.finalize().score).toMatchObject({ earnedScore: 0, processedNotes: 1 });
    expect(session.facts.filter(fact => fact.kind === "input")).toEqual([]);
  });

  it("0 재개 hold 없이 대기한 바디0～1000은 10에 hold A를 맞추면 입력 사실 없이 10에 시작하고 유지500을 Perfect로 정산", () => {
    const session = makeResumable([b(0, 1000), s(500)], 0);
    session.resumeAt(0, []);
    session.advance(10);
    expect(session.snapshot.bodyUnits[0].state).toBe("waiting");
    session.syncHeldKeys(10, [{ key: "A", lane: 1 }]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 10 });
    expect(session.finalize().score).toMatchObject({ earnedScore: 3, judgmentCounts: { perfect: 1 } });
    expect(session.facts.filter(fact => fact.kind === "input")).toEqual([]);
  });

  it("core 시각과 같은 hold로 syncHeldKeys하면 사실·바디 상태가 그대로이고 core 시각이 아닌 20에서는 RangeError", () => {
    const session = makeResumable([b(0, 1000), s(500)], 0);
    session.resumeAt(0, [{ key: "A", lane: 1 }]);
    session.advance(10);
    const before = session.result();
    session.syncHeldKeys(10, [{ key: "A", lane: 1 }]);
    expect(session.result()).toEqual(before);
    expect(() => session.syncHeldKeys(20, [])).toThrow(RangeError);
  });
});
