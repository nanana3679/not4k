import { describe, it, expect } from "vitest";
import { ScoreItem, ScoreManager } from "./ScoreManager";
import { JudgmentGrade, JUDGMENT_WINDOWS_EASY, Rank } from "../../shared";

describe("ScoreManager", () => {
  const item = (id: string, kind: ScoreItem["kind"] = "head", weight3 = 3): ScoreItem => ({
    id, noteIndex: 0, unitIndex: 0, kind, timeMs: 1000, weight3,
  });

  it("NJ-S01: 점수 항목 3개가 Perfect이고 무점수 유지 Miss가 있으면 100%와 Full Combo 아님을 함께 기록", () => {
    const sm = new ScoreManager([item("h0"), item("h1"), item("r1", "release")]);
    sm.settleScoreItem("h0", JudgmentGrade.PERFECT);
    sm.recordUnscoredMiss();
    sm.settleScoreItem("h1", JudgmentGrade.PERFECT);
    sm.settleScoreItem("r1", JudgmentGrade.PERFECT);
    expect(sm.getState()).toMatchObject({ achievementRate: 100, earnedScore: 9, finalDenominatorWeight: 9,
      liveDenominatorWeight: 9, processedNotes: 3, isFullCombo: false });
    expect(sm.getState().judgmentCounts[JudgmentGrade.MISS]).toBe(1);
  });

  it("NJ-S02: head Miss와 종속 끝점 0점은 가중치 2개만 분모에 더하고 Miss 통계는 1회만 증가", () => {
    const sm = new ScoreManager([item("head"), item("dependent", "release")]);
    sm.settleScoreItem("head", JudgmentGrade.MISS);
    sm.settleDependentZero("dependent");
    const state = sm.getState();
    expect(state).toMatchObject({ earnedScore: 0, liveDenominatorWeight: 6, finalDenominatorWeight: 6,
      processedNotes: 2 });
    expect(state.judgmentCounts[JudgmentGrade.MISS]).toBe(1);
  });

  it("release에 raw FAST/SLOW deltaMs를 전달하면 H/Grace 전용 timing 없이 통계를 분리 집계", () => {
    const sm = new ScoreManager([item("fast", "release"), item("slow", "release")]);
    sm.settleScoreItem("fast", JudgmentGrade.GREAT, -30);
    sm.settleScoreItem("slow", JudgmentGrade.GREAT, 30);
    expect(sm.getState()).toMatchObject({ fastCount: 1, slowCount: 1, earnedScore: 4 });
  });

  it("같은 score item을 두 번 정산하면 점수·분모·통계가 한 번만 증가", () => {
    const sm = new ScoreManager([item("once")]);
    expect(sm.settleScoreItem("once", JudgmentGrade.PERFECT)).toBe(true);
    expect(sm.settleScoreItem("once", JudgmentGrade.MISS)).toBe(false);
    expect(sm.getState()).toMatchObject({ earnedScore: 3, liveDenominatorWeight: 3, processedNotes: 1 });
  });

  it("일부 score item만 정산해도 live 분모와 최종 고정 분모를 분리", () => {
    const sm = new ScoreManager([item("a"), item("b"), item("c")]);
    sm.settleScoreItem("a", JudgmentGrade.PERFECT);
    expect(sm.getState()).toMatchObject({ achievementRate: 100, liveDenominatorWeight: 3, finalDenominatorWeight: 9 });
  });

  it("미정산 항목이 있어도 finalize 후에는 전체 이론 가중치를 분모로 사용하고 반복 호출이 동일", () => {
    const sm = new ScoreManager([item("a"), item("b")]);
    sm.settleScoreItem("a", JudgmentGrade.PERFECT);
    expect(sm.getState().achievementRate).toBe(100);
    const first = sm.finalize();
    const second = sm.getFinalState();
    expect(first).toMatchObject({ achievementRate: 50, finalDenominatorWeight: 6, liveDenominatorWeight: 3 });
    expect(second).toEqual(first);
  });

  it("정적 score item 모드에서 recordJudgment가 항목 수를 초과하면 임의 분모를 만들지 않고 오류", () => {
    const sm = new ScoreManager([item("only")]);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    expect(() => sm.recordJudgment(JudgmentGrade.PERFECT)).toThrow(RangeError);
    expect(sm.getState().finalDenominatorWeight).toBe(3);
  });

  it("holdOnly/H 항목은 deltaMs를 전달해도 FAST/SLOW를 집계하지 않음", () => {
    const sm = new ScoreManager([item("h", "holdOnly")]);
    sm.settleScoreItem("h", JudgmentGrade.PERFECT, -100);
    expect(sm.getState()).toMatchObject({ fastCount: 0, slowCount: 0 });
  });

  it("Easy window에서 Perfect 반폭 25ms 안쪽은 FAST/SLOW 없이, 26ms는 FAST로 집계", () => {
    const inside = new ScoreManager([item("inside", "release")], JUDGMENT_WINDOWS_EASY);
    inside.settleScoreItem("inside", JudgmentGrade.PERFECT, -24);
    expect(inside.getState().fastCount).toBe(0);
    const outside = new ScoreManager([item("outside", "release")], JUDGMENT_WINDOWS_EASY);
    outside.settleScoreItem("outside", JudgmentGrade.GREAT, -26);
    expect(outside.getState().fastCount).toBe(1);
  });
  // ---------------------------------------------------------------------------
  // 기본 판정 기록
  // ---------------------------------------------------------------------------

  it("Perfect 판정 시 3점 획득", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    const s = sm.getState();
    expect(s.earnedScore).toBe(3);
    expect(s.processedNotes).toBe(1);
  });

  it("Great 판정 시 2점 획득", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.GREAT);
    expect(sm.getState().earnedScore).toBe(2);
  });

  it("Good/Good_Trill 판정 시 1점 획득", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.GOOD);
    sm.recordJudgment(JudgmentGrade.GOOD_TRILL);
    expect(sm.getState().earnedScore).toBe(2);
  });

  it("Bad/Miss 판정 시 0점", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.BAD);
    sm.recordJudgment(JudgmentGrade.MISS);
    expect(sm.getState().earnedScore).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // isFullCombo (콤보 추적은 JudgmentEngine이 담당)
  // ---------------------------------------------------------------------------

  it("Bad/Miss 없으면 풀콤보", () => {
    const sm = new ScoreManager(3);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.GREAT);
    sm.recordJudgment(JudgmentGrade.GOOD);
    expect(sm.getState().isFullCombo).toBe(true);
  });

  it("Bad 있으면 풀콤보 아님", () => {
    const sm = new ScoreManager(2);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.BAD);
    expect(sm.getState().isFullCombo).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 달성률 & 랭크
  // ---------------------------------------------------------------------------

  it("올 퍼펙트 달성률 100%", () => {
    const sm = new ScoreManager(2);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    const s = sm.getState();
    expect(s.achievementRate).toBe(100);
    expect(s.rank).toBe(Rank.SSS);
  });

  it("올 Miss 달성률 0%", () => {
    const sm = new ScoreManager(2);
    sm.recordJudgment(JudgmentGrade.MISS);
    sm.recordJudgment(JudgmentGrade.MISS);
    const s = sm.getState();
    expect(s.achievementRate).toBe(0);
    expect(s.rank).toBe(Rank.F);
  });

  it("혼합 판정 달성률 계산", () => {
    const sm = new ScoreManager(3);
    sm.recordJudgment(JudgmentGrade.PERFECT); // 3
    sm.recordJudgment(JudgmentGrade.GREAT);   // 2
    sm.recordJudgment(JudgmentGrade.GOOD);    // 1
    // 획득: 6, 최대: 9, 달성률: 6/9 * 100 ≈ 66.67%
    const s = sm.getState();
    expect(s.achievementRate).toBeCloseTo(66.67, 1);
    expect(s.rank).toBe(Rank.D);
  });

  it("노트 0개일 때 달성률 0%", () => {
    const sm = new ScoreManager(0);
    expect(sm.getState().achievementRate).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // FAST / SLOW
  // ---------------------------------------------------------------------------

  it("Perfect 절반 범위 밖 음수 deltaMs → FAST 카운트", () => {
    const sm = new ScoreManager(10);
    // PERFECT window = 41ms, threshold = 20.5ms
    // deltaMs = -30ms → |30| > 20.5 → FAST
    sm.recordJudgment(JudgmentGrade.GREAT, -30);
    expect(sm.getState().fastCount).toBe(1);
    expect(sm.getState().slowCount).toBe(0);
  });

  it("Perfect 절반 범위 밖 양수 deltaMs → SLOW 카운트", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.GREAT, 30);
    expect(sm.getState().fastCount).toBe(0);
    expect(sm.getState().slowCount).toBe(1);
  });

  it("Perfect 절반 범위 내 deltaMs → FAST/SLOW 카운트 안 함", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.PERFECT, 10); // |10| < 20.5
    expect(sm.getState().fastCount).toBe(0);
    expect(sm.getState().slowCount).toBe(0);
  });

  it("MISS 판정은 FAST/SLOW 카운트 안 함", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.MISS, -100);
    expect(sm.getState().fastCount).toBe(0);
    expect(sm.getState().slowCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // judgmentCounts
  // ---------------------------------------------------------------------------

  it("판정별 카운트 정확히 집계", () => {
    const sm = new ScoreManager(6);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.GREAT);
    sm.recordJudgment(JudgmentGrade.GOOD_TRILL);
    sm.recordJudgment(JudgmentGrade.BAD);
    sm.recordJudgment(JudgmentGrade.MISS);

    const s = sm.getState();
    expect(s.judgmentCounts[JudgmentGrade.PERFECT]).toBe(2);
    expect(s.judgmentCounts[JudgmentGrade.GREAT]).toBe(1);
    expect(s.judgmentCounts[JudgmentGrade.GOOD]).toBe(0);
    expect(s.judgmentCounts[JudgmentGrade.GOOD_TRILL]).toBe(1);
    expect(s.judgmentCounts[JudgmentGrade.BAD]).toBe(1);
    expect(s.judgmentCounts[JudgmentGrade.MISS]).toBe(1);
    expect(s.goodTrillCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------

  it("reset 시 모든 상태 초기화", () => {
    const sm = new ScoreManager(5);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.MISS);

    sm.reset(10);
    const s = sm.getState();
    expect(s.totalNotes).toBe(10);
    expect(s.processedNotes).toBe(0);
    expect(s.earnedScore).toBe(0);
    expect(s.isFullCombo).toBe(true);
    expect(s.fastCount).toBe(0);
    expect(s.slowCount).toBe(0);
  });
});
