import { describe, expect, it } from "vitest";
import { JUDGMENT_WINDOWS } from "../../shared/constants/judgment";
import type { ExplicitNoteEntity } from "../../shared/types/chart";
import { explicitEnjFixtures } from "./explicitEnjFixtures";
import { explicitHcFixtures } from "./explicitHcFixtures";
import { explicitFixtureBody as b, explicitFixturePoint as p, explicitFixtureRelease as r,
  explicitFixtureSustain as s, makeExplicitReplayFixture, replayExplicitFixture } from "./explicitJudgmentTestHarness";
import type { ExplicitReplayFixture } from "./explicitJudgmentTestHarness";
import { compileExplicitJudgmentChart } from "./explicitCompiledChart";
import { ExplicitJudgmentSession } from "./ExplicitJudgmentSession";
import type { ExplicitConfirmedFact, ExplicitJudgmentInput } from "./ExplicitJudgmentState";

const down = (key = "A", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "down" });
const up = (key = "A", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "up" });
const factory = (chart: ReturnType<typeof compileExplicitJudgmentChart>, fixture: ExplicitReplayFixture) =>
  new ExplicitJudgmentSession(chart, { maintenanceGraceMs: fixture.maintenanceGraceMs,
    windows: { ...JUDGMENT_WINDOWS, PERFECT: fixture.windows.perfect, GREAT: fixture.windows.great, GOOD: fixture.windows.good } });
const makeSession = (notes: ExplicitNoteEntity[]) => {
  const fixture = makeExplicitReplayFixture("ENJ-test", "M2 회귀", notes, [], { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: "whole" });
  return factory(compileExplicitJudgmentChart(fixture.chart), fixture);
};
const settlements = (session: ExplicitJudgmentSession) => session.facts.filter((fact): fact is Extract<ExplicitConfirmedFact, { kind: "settlement" }> => fact.kind === "settlement");

function assertFixture(fixture: ExplicitReplayFixture): void {
  const { compiled, result } = replayExplicitFixture(fixture, factory);
  const indices = fixture.expected.assertionNoteIndices;
  const items = compiled.scoreItems.filter(item => !indices || indices.includes(item.source.noteIndex));
  const facts = result.facts.filter(fact => fact.kind === "settlement" && items.some(item => item.id === fact.itemId));
  const earnedScore = facts.reduce((sum, fact) => sum + (fact.kind !== "settlement" || fact.grade === null || fact.grade === "miss" ? 0
    : fact.grade === "perfect" ? 3 : fact.grade === "great" ? 2 : 1), 0);
  expect(earnedScore).toBe(fixture.expected.earnedScore);
  if (fixture.expected.scope === "whole") expect(result.score.earnedScore).toBe(fixture.expected.earnedScore);
  expect(result.score.totalNotes).toBe(fixture.expected.scoreItemCount);
  expect(result.score.finalDenominatorWeight).toBe(fixture.expected.theoreticalWeight);
  expect(result.snapshot.items.every(item => item.settlementFactId !== null)).toBe(true);
  expect(new Set(result.facts.filter(fact => fact.kind === "settlement").map(fact => fact.itemId)).size).toBe(fixture.expected.scoreItemCount);
  // 종속 0점과 등급 있는 Miss는 둘 다 0점이라 점수만으로 구별되지 않는다. 승인 fixture는 판정 종류별 수를 반드시 적는다.
  expect(fixture.expected.events).toBeDefined();
  const events = { perfect: 0, great: 0, good: 0, pointMiss: 0, releaseMiss: 0, maintenanceMiss: 0, dependentZero: 0 };
  for (const fact of facts) if (fact.kind === "settlement") {
    if (fact.outcome === "dependentZero") events.dependentZero++;
    else if (fact.grade === "perfect" || fact.grade === "great" || fact.grade === "good") events[fact.grade]++;
    else if (fact.grade === "miss") { if (fact.itemKind === "point") events.pointMiss++; else events.releaseMiss++; }
  }
  for (const fact of result.facts) if (fact.kind === "bodyFailed" && fact.unscoredMiss
    && (!indices || compiled.bodyUnits.some(unit => unit.id === fact.bodyUnitId && indices.includes(unit.source.noteIndex)))) events.maintenanceMiss++;
  expect(events).toEqual(fixture.expected.events);
}

describe("승인 fixture의 실제 compiler→core→session→ScoreManager", () => {
  it.each(explicitEnjFixtures)("$id 승인 입력을 실행하면 $expected.earnedScore/$expected.theoreticalWeight점·등급별 성공·Point/릴리즈/바디 Miss·종속 0점 수가 기대값과 같고 전 항목을 1회 정산", assertFixture);
  it.each(explicitHcFixtures)("$id 승인 입력을 실행하면 $expected.earnedScore점·등급별 성공·Point/릴리즈/바디 Miss·종속 0점 수가 이관 기대값과 같음", assertFixture);
});

describe("지연 입력의 잠정 진행과 확정 사실", () => {
  it("ENJ-04에서 preheld up을 raw 950·관측 1001에 받으면 잠정 시작 1000을 취소하고 미시작 상태로 1120에 실패하며 완료를 만들지 않음", () => {
    const session = makeSession([b(1000, 1060), s(1030)]);
    session.processBatch(500, [down()]); session.advance(1001);
    session.processObservedBatch(950, [up()], 1001);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "waiting", actualStartMs: null, completedAtMs: null });
    expect(session.facts.some(fact => fact.kind === "bodyProgressInvalidated")).toBe(true);
    expect(session.finalize().snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1120, actualStartMs: null, completedAtMs: null });
  });
});

describe("raw·hold·observed·기한의 독립 계약", () => {
  it("Point 1000 + double 바디에서 A up을 raw 990·관측 1001에 받으면 preheld 시작을 취소하고 B·C down 1050으로 Great 1·Perfect 2·Miss 0", () => {
    const session = makeSession([p(1000), b(1000, 3000, 2), r(3000, 2)]);
    session.processBatch(800, [down()]); session.advance(1001);
    session.processObservedBatch(990, [up()], 1001);
    expect(session.snapshot.bodyUnits.every(unit => unit.actualStartMs === null)).toBe(true);
    session.processBatch(1050, [down("B"), down("C")]);
    session.processBatch(3000, [up("B"), up("C")]);
    expect(session.finalize().score.judgmentCounts).toMatchObject({ perfect: 2, great: 1, miss: 0 });
  });

  it("up 1500 뒤 raw 1515·관측 1530의 회복 down은 이미 지난 1520 유지 Miss와 종속 0점을 번복하지 않음", () => {
    const session = makeSession([b(1000, 2000), s(1600), r(2000)]);
    session.processBatch(1000, [down()]); session.processBatch(1500, [up()]);
    session.processObservedBatch(1515, [down("B")], 1530);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1520 });
    const before = settlements(session);
    session.processBatch(2000, [up("B")]);
    expect(settlements(session)).toEqual(before);
    expect(session.finalize().score.judgmentCounts.miss).toBe(1);
  });

  it("lane 1의 raw 1490·관측 1501 up과 down 1512는 lane 2 down 1500 유무와 관계없이 1510 유지 Miss", () => {
    for (const extraLane of [false, true]) {
      const session = makeSession([b(1000, 2000), r(2000), ...(extraLane ? [b(1400, 2000, 1, 2)] : [])]);
      session.processBatch(1000, [down()]);
      if (extraLane) session.processBatch(1500, [down("B", 2)]);
      session.advance(1501); session.processObservedBatch(1490, [up()], 1501);
      session.processBatch(1512, [down()]);
      expect(session.snapshot.bodyUnits.find(unit => unit.lane === 1)).toMatchObject({ failedAtMs: 1510, state: "failed" });
      expect(session.facts.filter(fact => fact.kind === "input" && fact.action === "up")).toMatchObject([{ heldAtMs: 1490, atMs: 1490 }]);
    }
  });

  it("같은 lane의 raw 1490 up은 이미 반영한 1500 down까지 hold 시각만 clamp하고 raw 오차와 관측 시각은 그대로 보존", () => {
    const session = makeSession([b(1000, 2000), r(2000)]);
    session.processBatch(1000, [down()]); session.processBatch(1500, [down("B")]); session.advance(1501);
    session.processObservedBatch(1490, [up()], 1501);
    expect(session.facts.filter(fact => fact.kind === "input").at(-1)).toMatchObject({ atMs: 1490, heldAtMs: 1500, observedAt: 1501, confirmedAt: 1501 });
    expect(session.snapshot.bodyUnits[0].state).toBe("active");
  });

  it("한 drain에 raw 1500 up·1507 down을 관측 1530으로 함께 넣으면 1520 실패 없이 릴리즈 Perfect", () => {
    const session = makeSession([b(1000, 2000), r(2000)]);
    session.processBatch(1000, [down()]); session.advance(1490); session.advance(1530);
    session.processObservedBatches([{ rawAtMs: 1500, inputs: [up()] }, { rawAtMs: 1507, inputs: [down("B")] }], 1530);
    expect(session.snapshot.bodyUnits[0].state).toBe("active");
    session.processBatch(2000, [up("B")]);
    expect(session.finalize().score.judgmentCounts).toMatchObject({ perfect: 1, miss: 0 });
  });

  it("raw 1490 회복 down을 관측 1500에 받으면 열린 기한 1500에 회복하고 관측 1501이면 1500 유지 Miss", () => {
    for (const observedAt of [1500, 1501]) {
      const session = makeSession([p(1000), b(1000, 2000), r(2000)]);
      session.processBatch(1000, [down()]); session.processBatch(1480, [up()]); session.advance(1500);
      session.processObservedBatch(1490, [down("B")], observedAt);
      expect(session.snapshot.bodyUnits[0].state).toBe(observedAt === 1500 ? "active" : "failed");
    }
  });

  it("2120 Point Miss 확정 뒤 raw 2115·관측 2121 up은 채움 판단만 취소하고 Point Miss 1개·끝 종속 0점", () => {
    const session = makeSession([b(1000, 2000), p(2000), b(2000, 3000), r(3000)]);
    session.processBatch(1000, [down()]); session.advance(2121);
    const pointMiss = settlements(session)[0];
    expect(pointMiss).toMatchObject({ itemKind: "point", grade: "miss", atMs: 2120 });
    session.processObservedBatch(2115, [up()], 2121);
    expect(settlements(session)[0]).toEqual(pointMiss);
    expect(session.snapshot.bodyUnits[1]).toMatchObject({ state: "failed", failedAtMs: 2120 });
    session.processObservedBatch(2116, [down("B")], 2121);
    expect(session.finalize().score.judgmentCounts.miss).toBe(1);
    expect(settlements(session).at(-1)).toMatchObject({ outcome: "dependentZero", confirmedAt: 2121 });
  });

  it("raw 950·관측 1100 up이 이미 정산한 1030 유지 Perfect를 만나도 정산·효과는 남고 잠정 시작·완료만 다시 계산", () => {
    const session = makeSession([b(1000, 1060), s(1030)]);
    session.processBatch(500, [down()]); session.advance(1100);
    const settled = settlements(session)[0];
    session.processObservedBatch(950, [up()], 1100);
    expect(settlements(session)[0]).toEqual(settled);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ actualStartMs: null, completedAtMs: null });
    expect(session.effects.filter(effect => effect.scoreAction === "settleItem")).toHaveLength(1);
  });

  it("여러 raw group 중 하나에 lane이 없으면 앞의 유효 group도 적용하지 않고 clock·facts·items를 보존", () => {
    const session = makeSession([p(1000)]);
    expect(() => session.processObservedBatches([{ rawAtMs: 1000, inputs: [down()] },
      { rawAtMs: 1001, inputs: [{ type: "up", key: "A" }] }], 1010)).toThrow(RangeError);
    expect(session.facts).toHaveLength(0); expect(session.snapshot.atMs).toBe(-Infinity);
  });
});

const permutations = <T,>(values: readonly T[]): T[][] => values.length ? values.flatMap((value, i) =>
  permutations(values.filter((_, index) => index !== i)).map(rest => [value, ...rest])) : [[]];

describe("같은 raw up의 가능한 배정 전체 비교", () => {
  const permutationsBySize = [2, 3, 4, 5].flatMap(count => permutations(["A", "B", "C", "D", "E"].slice(0, count)));
  it.each(permutationsBySize.map(keys => ({ keys, name: keys.join("→") })))("같은 raw 2060 up 순서 $name 은 먼저 쓴 A·B 제약을 함께 배정하여 남은 릴리즈 2개 모두 성공", ({ keys }) => {
    // B는 앞 바디의 실제 시작 전에 뒤 standalone doubleRelease를 쓴다.
    const session = makeSession([p(1900), b(1900, 2000), r(2000, 2), r(2060, 2)]);
    session.processBatch(500, [down("B")]); session.processBatch(1950, [up("B")]);
    session.processBatch(1960, [down()]); session.processBatch(1980, [up()]);
    session.processBatch(1990, [down()]); session.processBatch(1995, [down("B")]);
    for (const key of keys.filter(key => key !== "A" && key !== "B")) session.processBatch(2000, [down(key)]);
    session.processBatch(2060, keys.map(key => up(key)));
    const result = session.finalize();
    expect(result.score.processedNotes).toBe(5);
    expect(result.score.judgmentCounts).toMatchObject({ perfect: 2, great: 2, good: 1, miss: 0 });
    expect(settlements(session).filter(fact => fact.inputId !== null)).toHaveLength(5);
  });
});

describe("실제 몫·Point·릴리즈·유지의 경계", () => {
  it("single Point + double 바디의 비담당 몫은 preheld로 1000에 시작하고 up 1005 뒤 Point 기한 1120까지 늘리지 않고 1025에 실패", () => {
    const session = makeSession([p(1000), b(1000, 2000, 2), s(1100, 2), r(2000, 2)]);
    session.processBatch(500, [down()]); session.advance(1000); session.processBatch(1005, [up()]); session.advance(1026);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", actualStartMs: 1000, failedAtMs: 1025 });
    expect(session.snapshot.bodyUnits[1]).toMatchObject({ state: "waiting", pointStatus: "waiting" });
    session.processBatch(1100, [down("B")]); session.processBatch(2000, [up("B")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 7, judgmentCounts: { good: 1, perfect: 2, miss: 1 } });
  });

  it("double Point 1000 + single 바디 1000～2000에서 A down 1000 hold·up 2000은 ordinal 0 Perfect로 바디를 시작해 Perfect·Miss·릴리즈 Perfect 6/9점", () => {
    const session = makeSession([p(1000, "double"), b(1000, 2000), r(2000)]);
    session.processBatch(1000, [down()]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1000 });
    session.advance(1121);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", pointStatus: "satisfied" });
    session.processBatch(2000, [up()]);
    const result = session.finalize();
    expect(result.score).toMatchObject({ earnedScore: 6, judgmentCounts: { perfect: 2, miss: 1 } });
    expect(result.snapshot.bodyUnits[0].state).toBe("complete");
    expect(result.facts.filter(fact => fact.kind === "bodyFailed")).toEqual([]);
  });

  it("double Point 1000 + single 바디에서 A down 1000 뒤 B down 1100은 바디를 A의 1000에 시작하고 유지 1050을 1050에 Perfect로 정산", () => {
    const session = makeSession([p(1000, "double"), b(1000, 2000), s(1050), r(2000)]);
    session.processBatch(1000, [down()]);
    session.advance(1050);
    session.processBatch(1100, [down("B")]);
    const aDown = session.facts.find(fact => fact.kind === "input" && fact.key === "A");
    expect(session.facts.filter(fact => fact.kind === "bodyStarted")).toMatchObject([{ actualStartMs: 1000, inputId: aDown?.kind === "input" ? aDown.inputId : "" }]);
    expect(settlements(session).find(fact => fact.itemKind === "sustain")).toMatchObject({ atMs: 1050, grade: "perfect" });
    session.processBatch(2000, [up(), up("B")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 10, judgmentCounts: { perfect: 3, good: 1, miss: 0 } });
  });

  it("double Point 1000 + single 바디의 A down 1000 성공 뒤 T 1050 재개는 남은 ordinal 1의 1120 Miss로 바디를 실패시키지 않아 6/9점", () => {
    const session = makeSession([p(1000, "double"), b(1000, 2000), r(2000)]);
    session.processBatch(1000, [down()]);
    session.advance(1050);
    session.resumeAt(1050, [{ key: "A", lane: 1 }]);
    session.advance(1121);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1050, pointStatus: "satisfied" });
    session.processBatch(2000, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, judgmentCounts: { perfect: 2, miss: 1 } });
  });

  it("double Point 1000 + single 바디에 입력이 없으면 1120에 Point 두 개만 Miss이고 바디는 pointMiss 실패로 릴리즈만 종속 0점", () => {
    const session = makeSession([p(1000, "double"), b(1000, 2000), r(2000)]);
    session.advance(1121);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1120, pointStatus: "missed" });
    expect(session.facts.filter(fact => fact.kind === "bodyFailed")).toMatchObject([{ reason: "pointMiss", unscoredMiss: false }]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 0, judgmentCounts: { miss: 2 } });
    expect(settlements(session).map(fact => fact.outcome)).toEqual(["graded", "graded", "dependentZero"]);
  });

  it("double 바디에서 down 1070·up 1080·같은 키 down 1090은 겹친 창에서도 한 몫만 완료하고 다른 몫은 1120에 실패", () => {
    const session = makeSession([b(1000, 1060, 2), s(1030, 2), r(1060, 2)]);
    session.processBatch(1070, [down()]); session.processBatch(1080, [up()]); session.processBatch(1090, [down()]); session.processBatch(1100, [up()]);
    expect(session.snapshot.bodyUnits.filter(unit => unit.state === "complete")).toHaveLength(1);
    const result = session.finalize();
    expect(result.snapshot.bodyUnits.filter(unit => unit.state === "failed")).toHaveLength(1);
    expect(result.score).toMatchObject({ earnedScore: 6, judgmentCounts: { perfect: 2, miss: 1 } });
  });

  it("길이 0 double 바디는 preheld 두 키로 1000에 시작·완료하며 유지 두 개 6점 외 자동 점수 없음", () => {
    const session = makeSession([b(1000, 1000, 2), s(1000, 2)]);
    session.processBatch(500, [down(), down("B")]); session.advance(1000);
    expect(session.snapshot.bodyUnits.every(unit => unit.state === "complete" && unit.actualStartMs === 1000 && unit.completedAtMs === 1000)).toBe(true);
    expect(session.finalize().score).toMatchObject({ earnedScore: 6, totalNotes: 2, processedNotes: 2 });
  });

  it("릴리즈만 있는 2→2 연결은 앞 두 몫 실패로 앞 끝 single 릴리즈가 종속 0점이 된 뒤 두 몫을 1990·1995에 새로 시작", () => {
    const session = makeSession([b(1000, 2000, 2), r(2000), b(2000, 3000, 2), s(2500, 2), r(3000, 2)]);
    session.processBatch(1000, [down(), down("B")]); session.processBatch(1500, [up(), up("B")]);
    session.processBatch(1990, [down("C")]); session.processBatch(1995, [down("D")]);
    session.processBatch(3000, [up("C"), up("D")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 12, judgmentCounts: { perfect: 4, miss: 2 } });
    expect(session.snapshot.bodyUnits.slice(2).every(unit => unit.state === "complete")).toBe(true);
  });

  it("single Point가 있는 2→2 연결은 앞 두 몫 실패 뒤 Point down 1990과 다른 down 1995로 두 몫을 각각 새로 시작", () => {
    const session = makeSession([b(1000, 2000, 2), p(2000), b(2000, 3000, 2), s(2500, 2), r(3000, 2)]);
    session.processBatch(1000, [down(), down("B")]); session.processBatch(1500, [up(), up("B")]);
    session.processBatch(1990, [down("C")]); session.processBatch(1995, [down("D")]);
    expect(session.snapshot.bodyUnits.slice(2).map(unit => unit.actualStartMs)).toEqual([1995, 1990]);
    session.processBatch(3000, [up("C"), up("D")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 15, judgmentCounts: { perfect: 5, miss: 2 } });
  });

  it("double 바디 끝 single 릴리즈는 한 몫이 실패해도 건강한 몫으로 Perfect를 살리고 double 릴리즈면 하나만 종속 0점", () => {
    for (const releaseCount of [1, 2] as const) {
      const session = makeSession([b(1000, 2000, 2), r(2000, releaseCount)]);
      session.processBatch(1000, [down(), down("B")]); session.processBatch(1500, [up()]); session.processBatch(2000, [up("B")]);
      expect(session.finalize().score).toMatchObject({ earnedScore: 3, judgmentCounts: { perfect: 1, miss: 1 } });
      expect(settlements(session).filter(fact => fact.outcome === "dependentZero")).toHaveLength(releaseCount - 1);
    }
  });

  it("독립 single 바디의 double 릴리즈도 서로 다른 두 키 up을 받아 6점이며 바디 완료 뒤 같은 키 임의 재누름은 두 번째 기회 0점", () => {
    const session = makeSession([b(1000, 2000), r(2000, 2)]);
    session.processBatch(1000, [down()]); session.processBatch(1980, [down("B"), up()]); session.processBatch(2000, [up("B")]);
    expect(session.finalize().score.earnedScore).toBe(6);
    const reused = makeSession([b(1000, 2000), r(2000, 2)]);
    reused.processBatch(1000, [down()]); reused.processBatch(1980, [up()]); reused.processBatch(1990, [down()]); reused.processBatch(2000, [up()]);
    expect(reused.finalize().score).toMatchObject({ earnedScore: 3, judgmentCounts: { perfect: 1, miss: 1 } });
  });

  it("다른 바디의 Point를 친 재누름은 앞 double 릴리즈의 같은 키 권한을 갱신하지 않고 뒤 릴리즈만 소비", () => {
    const session = makeSession([b(1000, 2000), r(2000, 2), p(2010), b(2010, 2060), r(2060)]);
    session.processBatch(1000, [down()]); session.processBatch(1990, [up()]); session.processBatch(2010, [down()]); session.processBatch(2060, [up()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 9, judgmentCounts: { perfect: 3, miss: 1 } });
    expect(settlements(session).filter(fact => fact.itemKind === "release" && fact.grade !== "miss").map(fact => fact.itemId)).toEqual(["n1:release:0", "n4:release:0"]);
  });

  it("double 바디 한 몫의 이른 up 1890은 자기 몫의 유지 1950만 일괄 Perfect로 만들고 남은 몫은 표식 시각까지 대기", () => {
    const session = makeSession([b(1000, 2000, 2), s(1950, 2), r(2000, 2)]);
    session.processBatch(1000, [down(), down("B")]); session.processBatch(1890, [up()]);
    expect(session.snapshot.items.filter(item => item.kind === "sustain").map(item => item.state).sort()).toEqual(["pending", "success"]);
    session.advance(1950);
    expect(session.snapshot.items.filter(item => item.kind === "sustain").every(item => item.state === "success")).toBe(true);
    session.processBatch(2000, [up("B")]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 10, judgmentCounts: { perfect: 3, good: 1, miss: 0 } });
  });

  it("1→2 연결의 앞 바디 이른 up 1890은 뒤 2000 경계의 유지 두 개를 가져오지 않고 뒤 down 2010·2020에 각각 확정", () => {
    const session = makeSession([b(1000, 2000), b(2000, 3000, 2), s(2000, 2)]);
    session.processBatch(1000, [down()]); session.processBatch(1890, [up()]);
    expect(settlements(session)).toHaveLength(0);
    session.processBatch(2010, [down("B")]); expect(settlements(session)).toHaveLength(1);
    session.processBatch(2020, [down("C")]); expect(settlements(session)).toHaveLength(2);
    expect(session.finalize().score.earnedScore).toBe(6);
  });

  it("같은 키의 raw 900 down·up·down·up은 인과를 보존하며 시작 Point를 실제로 친 재누름만 double 릴리즈 예외를 줌", () => {
    const session = makeSession([p(1000), b(1000, 1060), r(1060, 2)]);
    session.processBatch(900, [down(), up(), down(), up()]);
    expect(session.facts.filter(fact => fact.kind === "input").map(fact => [fact.action, fact.accepted])).toEqual([
      ["down", true], ["up", true], ["down", true], ["up", true],
    ]);
    expect(session.snapshot.bodyUnits[0].state).toBe("recovering");
    expect(session.finalize().score.judgmentCounts.miss).toBe(1);
  });
});

const semanticFacts = (facts: readonly ExplicitConfirmedFact[]) => facts.filter(fact => fact.kind !== "settlement" || fact.itemKind !== "sustain")
  .map(({ id: _id, ...fact }) => "causeFactId" in fact ? { ...fact, causeFactId: fact.causeFactId === null ? null : "cause" } : fact);

describe("제때 입력의 프레임 분할과 유지 표식 불변", () => {
  it.each(explicitHcFixtures)("$id 를 16ms 프레임·같은 시각 advance·입력 순서 반전으로 재생해도 점수·실패 몫·확정 시각을 보존", fixture => {
    const compiled = compileExplicitJudgmentChart(fixture.chart);
    const direct = factory(compiled, fixture);
    const framed = factory(compiled, fixture);
    let frame = 0;
    for (const batch of fixture.batches) {
      direct.processBatch(batch.rawAtMs, batch.inputs);
      while (frame <= batch.rawAtMs) { framed.advance(frame); frame += 16; }
      framed.advance(batch.rawAtMs);
      framed.processBatch(batch.rawAtMs, [...batch.inputs].reverse());
    }
    direct.advance(fixture.finishAtMs); framed.advance(fixture.finishAtMs);
    expect(framed.result().score).toEqual(direct.result().score);
    expect(framed.snapshot).toEqual(direct.snapshot);
    const outcomes = (session: ExplicitJudgmentSession) => session.facts.filter(fact => fact.kind === "settlement" || fact.kind === "bodyFailed")
      .map(({ id: _id, ...fact }) => "inputId" in fact ? { ...fact, inputId: fact.inputId ? "input" : null } :
        { ...fact, causeFactId: fact.causeFactId ? "cause" : null });
    expect(outcomes(framed)).toEqual(outcomes(direct));
  });

  it.each(explicitHcFixtures)("$id 에 바디 중간 유지 표식을 추가해도 body·input·기존 정산·실패 facts는 같고 추가한 표식만 새로 정산", fixture => {
    const originalCount = fixture.chart.notes.length;
    const notes = [...fixture.chart.notes];
    const compiled = compileExplicitJudgmentChart(fixture.chart);
    for (const body of compiled.bodies) {
      const at = (body.startMs + body.endMs) / 2;
      if (notes.some(note => note.type !== "body" && Math.abs(note.beat.n / note.beat.d * 500 - at) < 0.001)) continue;
      notes.push(s(at, body.holdCount, body.lane));
    }
    const original = factory(compiled, fixture);
    const added = factory(compileExplicitJudgmentChart({ ...fixture.chart, notes }), fixture);
    for (const batch of fixture.batches) for (const session of [original, added]) session.processBatch(batch.rawAtMs, batch.inputs);
    original.advance(fixture.finishAtMs); added.advance(fixture.finishAtMs);
    expect(semanticFacts(added.facts)).toEqual(semanticFacts(original.facts));
    const bodyStates = (session: ExplicitJudgmentSession) => session.snapshot.bodyUnits.map(({ failureFactId: _failureFactId, ...unit }) => unit);
    expect(bodyStates(added)).toEqual(bodyStates(original));
    const itemStates = (session: ExplicitJudgmentSession) => session.snapshot.items.filter(item => item.sourceNoteIndex < originalCount)
      .map(({ settlementFactId: _settlementFactId, ...item }) => item);
    expect(itemStates(added)).toEqual(itemStates(original));
    expect(added.snapshot.items.every(item => item.settlementFactId !== null)).toBe(true);
  });
});

describe("트릴은 Point 소비 키만 교대 세트에 반영", () => {
  const trillSession = (grace = false) => {
    const body = b(1000, 1800);
    if (body.type !== "body") throw new Error("바디 fixture 필요");
    const fixture = makeExplicitReplayFixture("ENJ-trill", "M2 트릴 회귀", [p(1000, "trill", 1, grace),
      { ...body, holdCount: 1, trill: true }, p(1300, "trill", 1, grace), p(1600, "trill", 1, grace)], [],
    { scoreItemCount: 3, theoreticalWeight: 9, earnedScore: 0, scope: "whole" });
    fixture.chart.trillZones = [{ lane: 1, beat: { n: 1, d: 1 }, endBeat: { n: 4, d: 1 } }];
    return factory(compileExplicitJudgmentChart(fixture.chart), fixture);
  };

  it("트릴 A 1000·일반 hold B 1150·A 1300·B 1600은 Perfect 2·goodTrill 1이고 바디 끝 자동 점수 없음", () => {
    const session = trillSession();
    session.processBatch(1000, [down()]); session.processBatch(1150, [down("B")]);
    session.processBatch(1220, [up()]); session.processBatch(1300, [down()]); session.processBatch(1400, [up("B")]);
    session.processBatch(1600, [down("B")]); session.processBatch(1800, [up(), up("B")]);
    expect(session.finalize().score).toMatchObject({ totalNotes: 3, earnedScore: 7, goodTrillCount: 1,
      judgmentCounts: { perfect: 2, goodTrill: 1, miss: 0 } });
    expect(settlements(session).map(fact => fact.grade)).toEqual(["perfect", "goodTrill", "perfect"]);
    expect(session.snapshot.bodyUnits[0].state).toBe("complete");
  });

  it("Grace 트릴을 같은 키로 1000·1300에 치면 Perfect 뒤 goodTrill 1점이며 두 입력 모두 타이밍 집계 없음", () => {
    const session = trillSession(true);
    session.processBatch(1000, [down()]); session.processBatch(1150, [down("B")]);
    session.processBatch(1290, [up()]); session.processBatch(1300, [down()]);
    expect(settlements(session).slice(0, 2)).toMatchObject([{ grade: "perfect", timingDeltaMs: null }, { grade: "goodTrill", timingDeltaMs: null }]);
    expect(session.result().score).toMatchObject({ earnedScore: 4, fastCount: 0, slowCount: 0, goodTrillCount: 1 });
  });

  it.each(permutations(["A", "B"]).map(keys => ({ keys, name: keys.join("→") })))("같은 raw1050 트릴 두 Point의 키 순서 $name 은 가장 높은 Perfect 하나와 goodTrill 하나", ({ keys }) => {
    const fixture = makeExplicitReplayFixture("ENJ-trill", "M2 트릴 동시 입력", [p(1000, "trill"), p(1060, "trill")], [],
      { scoreItemCount: 2, theoreticalWeight: 6, earnedScore: 4, scope: "whole" });
    fixture.chart.trillZones = [{ lane: 1, beat: { n: 1, d: 1 }, endBeat: { n: 4, d: 1 } }];
    const session = factory(compileExplicitJudgmentChart(fixture.chart), fixture);
    session.processBatch(1050, keys.map(key => down(key)));
    expect(session.finalize().score).toMatchObject({ earnedScore: 4, goodTrillCount: 1, judgmentCounts: { perfect: 1, great: 0, goodTrill: 1 } });
  });
});

describe("clean 지연의 프레임·관측 분할 행렬", () => {
  const cases = [8, 16, 33].flatMap(frame => [5, 15, 40].flatMap(delay => [1, 2].map(count => ({ frame, delay, count: count as 1 | 2 }))));
  it.each(cases)("Point 없는 $count몫 바디에서 frame $frame ms·지연 $delay ms로 받은 raw 1500 up·1507 down 교대는 즉시 전달과 같은 정산", ({ frame, delay, count }) => {
    const notes = [b(1000, 2000, count), r(2000, count)];
    const direct = makeSession(notes); const delayed = makeSession(notes);
    const batches = [{ rawAtMs: 1000, inputs: count === 1 ? [down()] : [down(), down("C")] },
      { rawAtMs: 1500, inputs: [up()] }, { rawAtMs: 1507, inputs: [down("B")] },
      { rawAtMs: 2000, inputs: count === 1 ? [up("B")] : [up("B"), up("C")] }];
    for (const batch of batches) direct.processBatch(batch.rawAtMs, batch.inputs);
    let next = 0;
    for (let at = 0; at <= 2100; at += frame) {
      const packets = [[batches[0]], [batches[1], batches[2]], [batches[3]]];
      const availablePackets = packets.slice(next).filter(packet => packet.at(-1)!.rawAtMs + delay <= at);
      const available = availablePackets.flat();
      if (available.length) {
        delayed.processObservedBatches(available, Math.max(delayed.snapshot.atMs, ...available.map(batch => batch.rawAtMs))); next += availablePackets.length;
      }
      delayed.advance(at);
    }
    const a = direct.finalize(); const z = delayed.finalize();
    expect(z.score).toEqual(a.score);
    expect(z.snapshot.bodyUnits.map(unit => [unit.state, unit.failedAtMs])).toEqual(a.snapshot.bodyUnits.map(unit => [unit.state, unit.failedAtMs]));
  });
});

describe("리뷰 반례의 실패 몫과 물리 키 분리", () => {
  it.each(["A", "B"])("Point 몫이 A 900～910 hold로 930에 실패한 뒤 %s down 1000은 비담당 몫을 새로 시작하여 끝 Perfect 1", key => {
    const session = makeSession([p(1000), b(1000, 3000, 2), r(3000, 2)]);
    session.processBatch(900, [down()]); session.processBatch(910, [up()]); session.advance(931);
    session.processBatch(1000, [down(key)]);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1000 });
    session.processBatch(3000, [up(key)]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 4, judgmentCounts: { good: 1, perfect: 1, miss: 1 } });
  });

  it.each([null, 1020])("비담당 preheld가 1005에 끊기고 Point down 1010으로 hold 1이면 실제 Point 기준 1030에 실패하며 두 번째 down %s는 회복", recoveredAt => {
    const session = makeSession([p(1000), b(1000, 2000, 2), r(2000, 2)]);
    session.processBatch(500, [down()]); session.processBatch(1005, [up()]); session.processBatch(1010, [down("B")]);
    if (recoveredAt !== null) session.processBatch(recoveredAt, [down()]);
    session.advance(1031);
    expect(session.snapshot.bodyUnits[1]).toMatchObject(recoveredAt === null
      ? { state: "failed", failedAtMs: 1030, actualStartMs: null }
      : { state: "active", failedAtMs: null, actualStartMs: 1020 });
  });
});

describe("키 이름 치환과 트릴 집계의 원본 채택 계약", () => {
  it.each(explicitHcFixtures)("$id 의 A·B·C·D 키 이름을 역순으로 바꿔도 승인 점수·판정 종류별 수·실패 몫이 같음", fixture => {
    const renamed = { ...fixture, batches: fixture.batches.map(batch => ({ ...batch,
      inputs: batch.inputs.map(input => ({ ...input, key: `key${100 - input.key.charCodeAt(0)}` })) })) };
    assertFixture(renamed);
    const a = replayExplicitFixture(fixture, factory).result;
    const z = replayExplicitFixture(renamed, factory).result;
    expect(z.snapshot.bodyUnits.map(unit => [unit.state, unit.actualStartMs, unit.failedAtMs, unit.completedAtMs]))
      .toEqual(a.snapshot.bodyUnits.map(unit => [unit.state, unit.actualStartMs, unit.failedAtMs, unit.completedAtMs]));
  });

  it.each(permutations(["A", "B"]).map(keys => ({ keys, name: keys.join("→") })))("트릴에서 이전 A Perfect·새 B Great 동시 입력 $name 은 원본처럼 전체 최고 Perfect를 택하고 소비한 두 키를 다음 세트에 기록", ({ keys }) => {
    const fixture = makeExplicitReplayFixture("ENJ-trill", "PointJudgmentState.finalizeBatch 교대 집계 계약", [p(1000, "trill"),
      p(1300, "trill"), p(1380, "trill"), p(1700, "trill"), p(2000, "trill"), p(2300, "trill")], [],
    { scoreItemCount: 6, theoreticalWeight: 18, earnedScore: 11, scope: "whole" });
    fixture.chart.trillZones = [{ lane: 1, beat: { n: 1, d: 1 }, endBeat: { n: 5, d: 1 } }];
    const session = factory(compileExplicitJudgmentChart(fixture.chart), fixture);
    session.processBatch(1000, [down()]); session.processBatch(1100, [up()]);
    session.processBatch(1300, keys.map(key => down(key))); session.processBatch(1400, keys.map(key => up(key)));
    expect(settlements(session).slice(1).map(fact => fact.grade)).toEqual(["perfect", "goodTrill"]);
    session.processBatch(1700, [down()]); session.processBatch(1800, [up()]);
    expect(settlements(session).at(-1)?.grade).toBe("goodTrill");
    session.advance(2121); session.processBatch(2300, [down()]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 11, goodTrillCount: 2, judgmentCounts: { perfect: 3, goodTrill: 2, miss: 1 } });
  });
});

describe("입력이 없는 묶음과 hold가 바뀌지 않는 입력", () => {
  it("빈 processBatch 500은 시각 500까지만 진행하고 Point 1000·바디 1000은 미정산·미시작", () => {
    const session = makeSession([p(1000), b(1000, 2000), r(2000)]);
    session.processBatch(500, []);
    expect(session.snapshot.atMs).toBe(500);
    expect(session.snapshot.bodyUnits[0].state).toBe("waiting");
    expect(session.snapshot.items.every(item => item.state === "pending")).toBe(true);
    expect(session.facts).toHaveLength(0);
    session.processObservedBatches([{ rawAtMs: 400, inputs: [] }, { rawAtMs: 600, inputs: [] }], 700);
    expect(session.snapshot.atMs).toBe(700); expect(session.facts).toHaveLength(0);
  });

  it("누르지 않은 X의 raw 950·관측 1001 up은 잠정 시작 1000을 취소하거나 새 bodyStarted를 만들지 않음", () => {
    const session = makeSession([b(1000, 2000)]);
    session.processBatch(500, [down()]); session.advance(1001);
    const before = session.facts.filter(fact => fact.kind !== "input");
    session.processObservedBatch(950, [up("X")], 1001);
    expect(session.facts.filter(fact => fact.kind !== "input")).toEqual(before);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "active", actualStartMs: 1000 });
  });

  it("거부한 X up 1500은 같은 drain의 A up 1490을 1500으로 clamp하지 않음", () => {
    const session = makeSession([b(1000, 2000)]);
    session.processBatch(1000, [down()]); session.processBatch(1500, [up("X")]);
    session.processObservedBatch(1490, [up()], 1501);
    expect(session.facts.filter(fact => fact.kind === "input").at(-1)).toMatchObject({ accepted: true, heldAtMs: 1490 });
    session.advance(1511);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1510 });
  });
});

describe("같은 키 Point 재누름 예외도 double의 실제 두 키 요구를 바꾸지 않음", () => {
  it.each(["A", "B"])("preheld A의 1010 첫 완료 뒤 시작 Point를 %s 1020으로 치면 A는 1040 hold 부족 실패·B는 두 번째 몫 정상 완료", key => {
    const session = makeSession([p(1000), b(1000, 1060, 2), s(1030, 2), r(1060, 2)]);
    session.processBatch(500, [down()]); session.processBatch(1010, [up()]);
    session.processBatch(1020, [down(key)]); session.processBatch(1030, [up(key)]);
    const result = session.finalize();
    expect(result.score.earnedScore).toBe(key === "A" ? 8 : 14);
    expect(result.score.judgmentCounts.miss).toBe(key === "A" ? 1 : 0);
    expect(result.snapshot.bodyUnits.filter(unit => unit.state === "complete")).toHaveLength(key === "A" ? 1 : 2);
    expect(result.snapshot.items.every(item => item.settlementFactId !== null)).toBe(true);
    if (key === "A") expect(result.snapshot.bodyUnits[1]).toMatchObject({ state: "failed", failedAtMs: 1040, actualStartMs: null });
  });
});

describe("연결 바디 실패 전파", () => {
  const factLine = (fact: ExplicitConfirmedFact) => fact.kind === "bodyFailed"
    ? `${fact.id} bodyFailed ${fact.bodyUnitId} cause=${fact.causeFactId} miss=${fact.unscoredMiss}`
    : fact.kind === "settlement" ? `${fact.id} ${fact.outcome} ${fact.itemId} cause=${fact.causeFactId}` : `${fact.id} ${fact.kind}`;

  it("Point·릴리즈 없는 single 바디 3개 연결에서 첫 시작 실패 1120은 앞 바디부터 실패·유지 종속 0점을 차례로 확정하고 끝 릴리즈만 종속 0점", () => {
    const session = makeSession([b(1000, 2000), s(1500), b(2000, 3000), s(2500), b(3000, 4000), s(3500), r(4000)]);
    session.advance(1121);
    expect(session.facts.map(factLine)).toEqual([
      "fact:0 bodyFailed b0:hold:0 cause=null miss=true",
      "fact:1 dependentZero n1:sustain:0 cause=fact:0",
      "fact:2 bodyFailed b2:hold:0 cause=fact:0 miss=false",
      "fact:3 dependentZero n3:sustain:0 cause=fact:2",
      "fact:4 bodyFailed b4:hold:0 cause=fact:2 miss=false",
      "fact:5 dependentZero n5:sustain:0 cause=fact:4",
      "fact:6 dependentZero n6:release:0 cause=fact:4",
    ]);
    expect(session.score.judgmentCounts.miss).toBe(1);
  });

  it("double 2→2→1 연결의 두 몫 시작 실패 1120은 몫별 연결을 먼저 따라간 뒤 두 몫이 모두 실패한 감소 연결의 single을 실패시킴", () => {
    const session = makeSession([b(1000, 2000, 2), b(2000, 3000, 2), b(3000, 4000), r(4000)]);
    session.advance(1121);
    expect(session.facts.map(factLine)).toEqual([
      "fact:0 bodyFailed b0:hold:1 cause=null miss=true",
      "fact:1 bodyFailed b1:hold:1 cause=fact:0 miss=false",
      "fact:2 bodyFailed b0:hold:0 cause=null miss=true",
      "fact:3 bodyFailed b1:hold:0 cause=fact:2 miss=false",
      "fact:4 bodyFailed b2:hold:0 cause=fact:3 miss=false",
      "fact:5 dependentZero n3:release:0 cause=fact:4",
    ]);
  });

  it("Point·릴리즈 없는 single 바디 3000개 연결의 첫 시작 실패 1120은 호출 스택 초과 없이 3000개를 모두 실패시키고 Miss 1개·끝 릴리즈 종속 0점", () => {
    const bodies = Array.from({ length: 3000 }, (_, index) => b(1000 + index * 100, 1100 + index * 100));
    const session = makeSession([...bodies, r(301000)]);
    session.advance(1121);
    expect(session.snapshot.bodyUnits.every(unit => unit.state === "failed" && unit.failedAtMs === 1120)).toBe(true);
    expect(session.facts.filter(fact => fact.kind === "bodyFailed" && fact.unscoredMiss)).toHaveLength(1);
    expect(settlements(session)).toMatchObject([{ itemKind: "release", outcome: "dependentZero" }]);
    expect(session.score.judgmentCounts.miss).toBe(1);
  }, 20000);
});

describe("이른 완료 창 E−Good 직전의 hold 부족과 유지 유예", () => {
  it("바디 1000～2000·릴리즈 2000에서 A down 1000·up 1875는 유예 끝 1895가 이른 완료 창(1880～) 안이어도 1895 유지 실패 Miss이고 릴리즈는 종속 0점", () => {
    const session = makeSession([b(1000, 2000), r(2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1875, [up()]);
    session.advance(1896);
    expect(session.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1895, completedAtMs: null });
    expect(session.facts.filter(fact => fact.kind === "bodyFailed")).toMatchObject([{ reason: "maintenance", unscoredMiss: true, atMs: 1895 }]);
    expect(settlements(session)).toMatchObject([{ itemKind: "release", outcome: "dependentZero", atMs: 1895 }]);
    expect(session.finalize().score).toMatchObject({ earnedScore: 0, totalNotes: 1, judgmentCounts: { miss: 1 } });
  });

  it("릴리즈 없는 바디 1000～2000에서 A down 1000·up 1875는 이른 완료가 아니라 1895 유지 실패 Miss 하나", () => {
    const session = makeSession([b(1000, 2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1875, [up()]);
    const result = session.finalize();
    expect(result.snapshot.bodyUnits[0]).toMatchObject({ state: "failed", failedAtMs: 1895, completedAtMs: null });
    expect(result.score).toMatchObject({ totalNotes: 0, judgmentCounts: { miss: 1 } });
  });

  it("바디 1000～2000·릴리즈 2000에서 A up 1880은 이른 완료 창 경계 안이라 1880에 정상 완료하고 릴리즈 Good", () => {
    const session = makeSession([b(1000, 2000), r(2000)]);
    session.processBatch(1000, [down()]);
    session.processBatch(1880, [up()]);
    const result = session.finalize();
    expect(result.snapshot.bodyUnits[0]).toMatchObject({ state: "complete", completedAtMs: 1880, failedAtMs: null });
    expect(result.score).toMatchObject({ earnedScore: 1, judgmentCounts: { good: 1, miss: 0 } });
  });
});
