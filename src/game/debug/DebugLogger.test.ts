import { describe, it, expect } from 'vitest';
import { DebugLogger } from './DebugLogger';
import { JudgmentGrade } from '../../shared/constants/judgment';

describe('DebugLogger', () => {
  // ---------------------------------------------------------------------------
  // 기본 기록
  // ---------------------------------------------------------------------------

  it('판정 기록 시 노트 인덱스, 등급, deltaMs가 정확히 저장됨', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 5);

    const log = logger.getLog();
    expect(log).toHaveLength(1);
    expect(log[0].noteIndex).toBe(0);
    expect(log[0].grade).toBe('perfect');
    expect(log[0].deltaMs).toBe(5);
  });

  it('noteCenterY=500, judgmentLineY=500이면 yDifference=0', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].yDifference).toBe(0);
  });

  it('noteCenterY=520, judgmentLineY=500이면 yDifference=20', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.recordJudgment(0, 520, JudgmentGrade.GREAT, 10);

    expect(logger.getLog()[0].yDifference).toBe(20);
  });

  // ---------------------------------------------------------------------------
  // expectedDeltaPxPerFrame 계산
  // ---------------------------------------------------------------------------

  it('scrollSpeed=800, targetFps=60이면 expectedDeltaPxPerFrame=13.33', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].expectedDeltaPxPerFrame).toBeCloseTo(800 / 60, 2);
  });

  it('targetFps=0(Unlimited)이면 60fps로 대체하여 계산', () => {
    const logger = new DebugLogger(800, 0, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].expectedDeltaPxPerFrame).toBeCloseTo(800 / 60, 2);
  });

  // ---------------------------------------------------------------------------
  // actualDeltaPx 계산
  // ---------------------------------------------------------------------------

  it('이전 프레임 위치가 없으면 actualDeltaPx=null', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].actualDeltaPx).toBeNull();
  });

  it('이전 프레임 Y=487에서 판정 시 Y=500이면 actualDeltaPx=13', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.trackNotePosition(0, 487);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].actualDeltaPx).toBe(13);
  });

  // ---------------------------------------------------------------------------
  // getSummary
  // ---------------------------------------------------------------------------

  it('노트 0개일 때 getSummary 기본값 반환', () => {
    const logger = new DebugLogger(800, 60, 500);
    const summary = logger.getSummary();

    expect(summary.totalNotes).toBe(0);
    expect(summary.avgYDifference).toBe(0);
    expect(summary.avgDeltaMs).toBe(0);
    expect(summary.speedConsistency).toBeNull();
    expect(summary.gradeDistribution).toEqual({});
  });

  it('Perfect 2개, Great 1개 기록 시 gradeDistribution 정확', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);
    logger.recordJudgment(1, 500, JudgmentGrade.PERFECT, 5);
    logger.recordJudgment(2, 510, JudgmentGrade.GREAT, 50);

    const summary = logger.getSummary();
    expect(summary.totalNotes).toBe(3);
    expect(summary.gradeDistribution).toEqual({ perfect: 2, great: 1 });
  });

  it('yDifference +10과 -10의 평균은 0, 절대값 평균은 10', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.recordJudgment(0, 510, JudgmentGrade.PERFECT, 0); // yDiff = +10
    logger.recordJudgment(1, 490, JudgmentGrade.PERFECT, 0); // yDiff = -10

    const summary = logger.getSummary();
    expect(summary.avgYDifference).toBeCloseTo(0, 5);
    expect(summary.avgAbsYDifference).toBeCloseTo(10, 5);
  });

  it('actualDeltaPx 값이 1개뿐이면 speedConsistency=null', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.trackNotePosition(0, 487);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    const summary = logger.getSummary();
    expect(summary.speedConsistency).toBeNull();
  });

  it('actualDeltaPx가 모두 동일하면 speedConsistency=0', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.trackNotePosition(0, 487);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);
    logger.trackNotePosition(1, 487);
    logger.recordJudgment(1, 500, JudgmentGrade.PERFECT, 0);

    const summary = logger.getSummary();
    expect(summary.speedConsistency).toBeCloseTo(0, 5);
  });

  it('actualDeltaPx 편차가 있으면 speedConsistency > 0', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.trackNotePosition(0, 490);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0); // delta = 10
    logger.trackNotePosition(1, 480);
    logger.recordJudgment(1, 500, JudgmentGrade.PERFECT, 0); // delta = 20

    const summary = logger.getSummary();
    expect(summary.speedConsistency).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // exportAsText
  // ---------------------------------------------------------------------------

  it('exportAsText는 Summary 섹션을 포함한 문자열 반환', () => {
    const logger = new DebugLogger(800, 60, 500);
    logger.recordJudgment(0, 505, JudgmentGrade.PERFECT, 3);

    const text = logger.exportAsText();
    expect(text).toContain('=== Debug Note Log ===');
    expect(text).toContain('=== Summary ===');
    expect(text).toContain('Note #0');
    expect(text).toContain('grade=perfect');
    expect(text).toContain('Total notes: 1');
  });

  it('빈 로그에서 exportAsText는 Total notes: 0 포함', () => {
    const logger = new DebugLogger(800, 60, 500);
    const text = logger.exportAsText();
    expect(text).toContain('Total notes: 0');
  });
});
