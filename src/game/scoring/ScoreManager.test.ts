import { describe, it, expect } from "vitest";
import { ScoreManager } from "./ScoreManager";
import { JudgmentGrade, Rank } from "../../shared";

describe("ScoreManager", () => {
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
  // 콤보
  // ---------------------------------------------------------------------------

  it("Perfect/Great/Good/Good_Trill은 콤보 증가", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.GREAT);
    sm.recordJudgment(JudgmentGrade.GOOD);
    sm.recordJudgment(JudgmentGrade.GOOD_TRILL);
    expect(sm.getState().combo).toBe(4);
    expect(sm.getState().maxCombo).toBe(4);
  });

  it("Bad는 콤보 리셋", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.BAD);
    expect(sm.getState().combo).toBe(0);
    expect(sm.getState().maxCombo).toBe(2);
  });

  it("Miss는 콤보 리셋", () => {
    const sm = new ScoreManager(10);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.MISS);
    expect(sm.getState().combo).toBe(0);
    expect(sm.getState().maxCombo).toBe(1);
  });

  it("maxCombo는 최대값 유지", () => {
    const sm = new ScoreManager(10);
    // 3콤보 → 끊김 → 2콤보
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.MISS);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    sm.recordJudgment(JudgmentGrade.PERFECT);
    expect(sm.getState().maxCombo).toBe(3);
    expect(sm.getState().combo).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // isFullCombo
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
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(0);
    expect(s.isFullCombo).toBe(true);
    expect(s.fastCount).toBe(0);
    expect(s.slowCount).toBe(0);
  });
});
