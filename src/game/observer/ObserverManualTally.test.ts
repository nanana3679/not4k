import { describe, expect, it } from "vitest";
import type { ExplicitNoteEntity } from "../../shared/types/chart";
import { compileExplicitJudgmentChart } from "../judgment/explicitCompiledChart";
import { selectExplicitRangePlaybackChart } from "../judgment/explicitPlaybackChart";
import { explicitFixtureBody as b, explicitFixtureTap as p, explicitFixtureRelease as r,
  explicitFixtureTick as s, makeExplicitReplayFixture } from "../judgment/explicitJudgmentTestHarness";
import { ExplicitJudgmentSession } from "../judgment/ExplicitJudgmentSession";
import type { ExplicitJudgmentInput } from "../judgment/ExplicitJudgmentState";
import { ObserverManualTally } from "./ObserverManualTally";

const windows = { PERFECT: 41, GREAT: 82, GOOD: 120, BAD: 160 };
const down = (key = "KeyW", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "down" });
const up = (key = "KeyW", lane = 1): ExplicitJudgmentInput => ({ key, lane, type: "up" });
const compile = (notes: ExplicitNoteEntity[]) => compileExplicitJudgmentChart(makeExplicitReplayFixture("ENJ-observer-tally",
  "옵저버 수동 집계", notes, [], { scoreItemCount: 0, theoreticalWeight: 0, earnedScore: 0, scope: "whole" }).chart);
/** 선택 구간으로 자른 재생 범위를 앞 준비 시작 0ms부터 판정하는 세션과 같은 범위의 수동 집계. */
const rangeSetup = (notes: ExplicitNoteEntity[], startMs: number, endMs: number) => {
  const chart = selectExplicitRangePlaybackChart(compile(notes), startMs, endMs);
  return { session: new ExplicitJudgmentSession(chart, { windows, maintenanceGraceMs: 20, startTimeMs: 0 }),
    tally: new ObserverManualTally(chart, windows) };
};

describe("옵저버 수동 집계", () => {
  const threeTaps = [p(1000), p(1500), p(2000)];

  it("시작하지 않은 수동 집계는 stats가 null이고 1000ms 탭 Perfect 효과를 넣어도 세지 않음", () => {
    const { session, tally } = rangeSetup(threeTaps, 1000, 2000);
    session.processBatch(1000, [down()]);
    tally.applyConfirmedEffects(session.drainEffects());
    expect(tally.isRunning).toBe(false);
    expect(tally.stats).toBeNull();
  });

  it("1200ms에 시작하면 confirmedAt 1000ms 탭 Perfect는 빼고 1500·2000ms 탭 Perfect 2개만 세어 콤보 2·달성률 100%", () => {
    const { session, tally } = rangeSetup(threeTaps, 1000, 2000);
    tally.start(1200);
    session.processBatch(1000, [down()]);
    session.processBatch(1050, [up()]);
    session.processBatch(1500, [down()]);
    session.processBatch(1550, [up()]);
    session.processBatch(2000, [down()]);
    tally.applyConfirmedEffects(session.drainEffects());
    expect(session.combo).toBe(3);
    expect(tally.stats).toEqual({ combo: 2, achievementRate: 100 });
  });

  it("콤보 2에서 stop하면 stats가 null이고 2120ms Miss 효과를 무시하며, 2100ms에 다시 start하면 이전 콤보 2·100%를 버리고 콤보 0·0%부터", () => {
    const { session, tally } = rangeSetup(threeTaps, 1000, 2000);
    tally.start(0);
    session.processBatch(1000, [down()]);
    session.processBatch(1050, [up()]);
    session.processBatch(1500, [down()]);
    tally.applyConfirmedEffects(session.drainEffects());
    expect(tally.stats).toEqual({ combo: 2, achievementRate: 100 });
    tally.stop();
    expect(tally.stats).toBeNull();
    session.advance(2200);
    const missAt2120 = session.drainEffects();
    expect(missAt2120).toMatchObject([{ grade: "miss", confirmedAt: 2120 }]);
    tally.applyConfirmedEffects(missAt2120);
    expect(tally.stats).toBeNull();
    tally.start(2100);
    expect(tally.stats).toEqual({ combo: 0, achievementRate: 0 });
  });

  it("전 구간을 0ms부터 세면 Great·탭 Miss·유지 실패의 무점수 Miss·종속 0점까지 매 단계 콤보·달성률이 세션 combo·score와 같고 끝에 콤보 0·14/21점", () => {
    // 탭 1000ms 두 레인 Perfect → 탭 1560ms를 1620ms에 Great → 레인 2 탭 2000ms Miss → 바디 2500～3500ms를 3200ms에 떼어 3220ms 유지 실패.
    const notes = [p(1000), p(1000, "single", 2), p(1560), p(2000, "single", 2), p(2500), b(2500, 3500), s(3000), r(3500)];
    const { session, tally } = rangeSetup(notes, 1000, 3500);
    tally.start(0);
    const expectParity = () => {
      tally.applyConfirmedEffects(session.drainEffects());
      const score = session.score;
      expect(tally.stats).toEqual({ combo: session.combo,
        achievementRate: score.finalDenominatorWeight > 0 ? score.achievementRate : null });
    };
    session.processBatch(1000, [down("KeyW", 1), down("KeyE", 2)]);
    expectParity();
    session.processBatch(1050, [up("KeyW", 1), up("KeyE", 2)]);
    session.processBatch(1620, [down()]);
    expectParity();
    session.processBatch(1700, [up()]);
    session.advance(2200);
    expectParity();
    session.processBatch(2500, [down()]);
    session.advance(3100);
    expectParity();
    session.processBatch(3200, [up()]);
    session.advance(3700);
    expectParity();
    expect(session.facts.filter(fact => fact.kind === "bodyFailed")).toMatchObject([{ reason: "maintenance", atMs: 3220 }]);
    expect(tally.stats).toEqual({ combo: 0, achievementRate: (14 / 21) * 100 });
  });

  it("점수 항목이 없는 구간(탭 500ms가 잘린 바디만 800～1400ms)이면 시작해도 콤보 0·달성률 null", () => {
    const { tally } = rangeSetup([p(500), b(500, 1500), r(1500)], 800, 1400);
    tally.start(0);
    expect(tally.stats).toEqual({ combo: 0, achievementRate: null });
  });

  it("탭 3개 9점짜리 구간에서 시작 직후 정산이 없으면 일반 플레이 HUD처럼 콤보 0·달성률 0%", () => {
    const { tally } = rangeSetup(threeTaps, 1000, 2000);
    tally.start(1200);
    expect(tally.stats).toEqual({ combo: 0, achievementRate: 0 });
  });

  it("같은 탭 1000ms Perfect 효과를 두 번 넣으면 중복 정산 Error", () => {
    const { session, tally } = rangeSetup(threeTaps, 1000, 2000);
    tally.start(0);
    session.processBatch(1000, [down()]);
    const effects = session.drainEffects();
    tally.applyConfirmedEffects(effects);
    expect(() => tally.applyConfirmedEffects(effects)).toThrow(/n0:tap:0/);
  });

  it.each([Number.NaN, Infinity])("시작 시각 %s이면 RangeError", atMs => {
    const { tally } = rangeSetup(threeTaps, 1000, 2000);
    expect(() => tally.start(atMs)).toThrow(RangeError);
  });
});
