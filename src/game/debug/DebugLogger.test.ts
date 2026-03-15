import { describe, it, expect } from 'vitest';
import { DebugLogger } from './DebugLogger';
import { JudgmentGrade } from '../../shared/constants/judgment';

describe('DebugLogger', () => {
  // ---------------------------------------------------------------------------
  // 기본 기록
  // ---------------------------------------------------------------------------

  it('판정 기록 시 노트 인덱스, 등급, deltaMs가 정확히 저장됨', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 5);

    const log = logger.getLog();
    expect(log).toHaveLength(1);
    expect(log[0].noteIndex).toBe(0);
    expect(log[0].grade).toBe('perfect');
    expect(log[0].deltaMs).toBe(5);
  });

  it('noteCenterY=500, judgmentLineY=500이면 yDifference=0', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].yDifference).toBe(0);
  });

  it('noteCenterY=520, judgmentLineY=500이면 yDifference=20', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 520, JudgmentGrade.GREAT, 10);

    expect(logger.getLog()[0].yDifference).toBe(20);
  });

  // ---------------------------------------------------------------------------
  // subIndex (더블 노트 구분)
  // ---------------------------------------------------------------------------

  it('subIndex 전달 시 엔트리에 저장됨', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(5, 510, JudgmentGrade.PERFECT, 10, 0);
    logger.recordJudgment(5, 515, JudgmentGrade.GREAT, 15, 1);

    const log = logger.getLog();
    expect(log[0].subIndex).toBe(0);
    expect(log[1].subIndex).toBe(1);
  });

  it('subIndex 미전달 시 undefined', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].subIndex).toBeUndefined();
  });

  it('exportAsText에서 더블 노트는 [0], [1] 서브인덱스 표시', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordFrameTiming(16.67);
    logger.recordJudgment(3, 510, JudgmentGrade.PERFECT, 10, 0);
    logger.recordJudgment(3, 515, JudgmentGrade.GREAT, 15, 1);

    const text = logger.exportAsText();
    expect(text).toContain('Note #3[0]');
    expect(text).toContain('Note #3[1]');
  });

  // ---------------------------------------------------------------------------
  // expectedDeltaPxPerFrame 계산
  // ---------------------------------------------------------------------------

  it('scrollSpeed=800이면 expectedDeltaPxPerFrame=13.33 (60fps 기준)', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].expectedDeltaPxPerFrame).toBeCloseTo(800 / 60, 2);
  });

  // ---------------------------------------------------------------------------
  // actualDeltaPx (프레임 시간 기반)
  // ---------------------------------------------------------------------------

  it('recordFrameTiming 호출 전이면 actualDeltaPx=null', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].actualDeltaPx).toBeNull();
  });

  it('프레임 16.67ms, scrollSpeed=800이면 actualDeltaPx=13.33', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordFrameTiming(16.67);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    expect(logger.getLog()[0].actualDeltaPx).toBeCloseTo(16.67 * 800 / 1000, 2);
  });

  it('프레임 33.33ms(30fps)이면 actualDeltaPx는 expected의 약 2배', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordFrameTiming(33.33);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    const entry = logger.getLog()[0];
    expect(entry.actualDeltaPx).toBeCloseTo(33.33 * 800 / 1000, 2);
    expect(entry.actualDeltaPx! / entry.expectedDeltaPxPerFrame).toBeCloseTo(2, 0);
  });

  // ---------------------------------------------------------------------------
  // getSummary
  // ---------------------------------------------------------------------------

  it('노트 0개일 때 getSummary 기본값 반환', () => {
    const logger = new DebugLogger(800, 500);
    const summary = logger.getSummary();

    expect(summary.totalNotes).toBe(0);
    expect(summary.avgYDifference).toBe(0);
    expect(summary.avgDeltaMs).toBe(0);
    expect(summary.speedConsistency).toBeNull();
    expect(summary.gradeDistribution).toEqual({});
  });

  it('Perfect 2개, Great 1개 기록 시 gradeDistribution 정확', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);
    logger.recordJudgment(1, 500, JudgmentGrade.PERFECT, 5);
    logger.recordJudgment(2, 510, JudgmentGrade.GREAT, 50);

    const summary = logger.getSummary();
    expect(summary.totalNotes).toBe(3);
    expect(summary.gradeDistribution).toEqual({ perfect: 2, great: 1 });
  });

  it('yDifference +10과 -10의 평균은 0, 절대값 평균은 10', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 510, JudgmentGrade.PERFECT, 0); // yDiff = +10
    logger.recordJudgment(1, 490, JudgmentGrade.PERFECT, 0); // yDiff = -10

    const summary = logger.getSummary();
    expect(summary.avgYDifference).toBeCloseTo(0, 5);
    expect(summary.avgAbsYDifference).toBeCloseTo(10, 5);
  });

  it('actualDeltaPx 값이 1개뿐이면 speedConsistency=null', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordFrameTiming(16.67);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);

    const summary = logger.getSummary();
    expect(summary.speedConsistency).toBeNull();
  });

  it('동일 프레임 시간이면 speedConsistency=0', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordFrameTiming(16.67);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);
    logger.recordFrameTiming(16.67);
    logger.recordJudgment(1, 500, JudgmentGrade.PERFECT, 0);

    const summary = logger.getSummary();
    expect(summary.speedConsistency).toBeCloseTo(0, 5);
  });

  it('프레임 시간 편차가 있으면 speedConsistency > 0', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordFrameTiming(16.67);
    logger.recordJudgment(0, 500, JudgmentGrade.PERFECT, 0);
    logger.recordFrameTiming(33.33);
    logger.recordJudgment(1, 500, JudgmentGrade.PERFECT, 0);

    const summary = logger.getSummary();
    expect(summary.speedConsistency).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // exportAsText
  // ---------------------------------------------------------------------------

  it('exportAsText는 Summary 섹션을 포함한 문자열 반환', () => {
    const logger = new DebugLogger(800, 500);
    logger.recordJudgment(0, 505, JudgmentGrade.PERFECT, 3);

    const text = logger.exportAsText();
    expect(text).toContain('=== Debug Note Log ===');
    expect(text).toContain('=== Summary ===');
    expect(text).toContain('Note #0');
    expect(text).toContain('grade=perfect');
    expect(text).toContain('Total notes: 1');
  });

  it('빈 로그에서 exportAsText는 Total notes: 0 포함', () => {
    const logger = new DebugLogger(800, 500);
    const text = logger.exportAsText();
    expect(text).toContain('Total notes: 0');
  });
});
