/**
 * DebugLogger -- 노트 판정 디버그 로깅 시스템
 *
 * 디버그 모드가 켜져 있을 때 각 노트 판정 시점의 위치/타이밍/속도 정보를 기록하여
 * 게임 로직이 정상 동작하는지 검증할 수 있게 한다.
 */

import type { JudgmentGrade } from '../../shared/constants/judgment';

export interface DebugNoteEntry {
  /** 노트 인덱스 */
  noteIndex: number;
  /** 판정 시점의 노트 중앙 Y 위치 */
  noteCenterY: number;
  /** 판정선 Y 위치 */
  judgmentLineY: number;
  /** noteCenterY - judgmentLineY (0에 가까울수록 이상적) */
  yDifference: number;
  /** 판정 타이밍 차이 (ms, 양수 = 늦음) */
  deltaMs: number;
  /** 판정 등급 */
  grade: JudgmentGrade;
  /** 현재 스크롤 속도 (px/s) */
  scrollSpeed: number;
  /** 프레임당 예상 노트 이동 거리 (scrollSpeed / targetFps) */
  expectedDeltaPxPerFrame: number;
  /** 실제 프레임간 노트 이동 거리 (이전 프레임의 Y와 비교) */
  actualDeltaPx: number | null;
}

export interface DebugSummary {
  totalNotes: number;
  avgYDifference: number;
  avgAbsYDifference: number;
  avgDeltaMs: number;
  avgAbsDeltaMs: number;
  speedConsistency: number | null;
  gradeDistribution: Record<string, number>;
}

export class DebugLogger {
  private entries: DebugNoteEntry[] = [];
  private previousNoteY: Map<number, number> = new Map();
  private readonly scrollSpeed: number;
  private readonly targetFps: number;
  private readonly judgmentLineY: number;

  constructor(scrollSpeed: number, targetFps: number, judgmentLineY: number) {
    this.scrollSpeed = scrollSpeed;
    this.targetFps = targetFps;
    this.judgmentLineY = judgmentLineY;
  }

  /**
   * 프레임마다 호출 -- 노트의 현재 Y 위치를 기록하여 다음 판정 시 actualDeltaPx 계산에 사용
   */
  trackNotePosition(noteIndex: number, currentY: number): void {
    this.previousNoteY.set(noteIndex, currentY);
  }

  /**
   * 판정 발생 시 호출 -- 디버그 로그 엔트리를 생성
   */
  recordJudgment(
    noteIndex: number,
    noteCenterY: number,
    grade: JudgmentGrade,
    deltaMs: number,
  ): void {
    const prevY = this.previousNoteY.get(noteIndex) ?? null;
    const actualDeltaPx = prevY !== null ? Math.abs(noteCenterY - prevY) : null;
    const effectiveFps = this.targetFps > 0 ? this.targetFps : 60;
    const expectedDeltaPxPerFrame = this.scrollSpeed / effectiveFps;

    const entry: DebugNoteEntry = {
      noteIndex,
      noteCenterY,
      judgmentLineY: this.judgmentLineY,
      yDifference: noteCenterY - this.judgmentLineY,
      deltaMs,
      grade,
      scrollSpeed: this.scrollSpeed,
      expectedDeltaPxPerFrame,
      actualDeltaPx,
    };

    this.entries.push(entry);
  }

  getLog(): readonly DebugNoteEntry[] {
    return this.entries;
  }

  getSummary(): DebugSummary {
    const total = this.entries.length;
    if (total === 0) {
      return {
        totalNotes: 0,
        avgYDifference: 0,
        avgAbsYDifference: 0,
        avgDeltaMs: 0,
        avgAbsDeltaMs: 0,
        speedConsistency: null,
        gradeDistribution: {},
      };
    }

    let sumY = 0;
    let sumAbsY = 0;
    let sumDelta = 0;
    let sumAbsDelta = 0;
    const gradeDistribution: Record<string, number> = {};

    const actualDeltas: number[] = [];

    for (const e of this.entries) {
      sumY += e.yDifference;
      sumAbsY += Math.abs(e.yDifference);
      sumDelta += e.deltaMs;
      sumAbsDelta += Math.abs(e.deltaMs);
      gradeDistribution[e.grade] = (gradeDistribution[e.grade] ?? 0) + 1;
      if (e.actualDeltaPx !== null) {
        actualDeltas.push(e.actualDeltaPx);
      }
    }

    // 속도 일관성: actualDeltaPx들의 표준편차 (낮을수록 일관적)
    let speedConsistency: number | null = null;
    if (actualDeltas.length >= 2) {
      const mean = actualDeltas.reduce((a, b) => a + b, 0) / actualDeltas.length;
      const variance = actualDeltas.reduce((acc, v) => acc + (v - mean) ** 2, 0) / actualDeltas.length;
      speedConsistency = Math.sqrt(variance);
    }

    return {
      totalNotes: total,
      avgYDifference: sumY / total,
      avgAbsYDifference: sumAbsY / total,
      avgDeltaMs: sumDelta / total,
      avgAbsDeltaMs: sumAbsDelta / total,
      speedConsistency,
      gradeDistribution,
    };
  }

  exportAsText(): string {
    const lines: string[] = [];
    lines.push('=== Debug Note Log ===');
    lines.push('');

    for (const e of this.entries) {
      lines.push(
        `[Note #${e.noteIndex}] grade=${e.grade} deltaMs=${e.deltaMs.toFixed(1)} ` +
        `yDiff=${e.yDifference.toFixed(1)}px ` +
        `noteCenterY=${e.noteCenterY.toFixed(1)} judgmentLineY=${e.judgmentLineY.toFixed(1)} ` +
        `expectedPx/f=${e.expectedDeltaPxPerFrame.toFixed(2)} ` +
        `actualPx/f=${e.actualDeltaPx !== null ? e.actualDeltaPx.toFixed(2) : 'N/A'}`
      );
    }

    lines.push('');
    lines.push('=== Summary ===');
    const s = this.getSummary();
    lines.push(`Total notes: ${s.totalNotes}`);
    lines.push(`Avg Y difference: ${s.avgYDifference.toFixed(2)}px`);
    lines.push(`Avg |Y difference|: ${s.avgAbsYDifference.toFixed(2)}px`);
    lines.push(`Avg deltaMs: ${s.avgDeltaMs.toFixed(2)}ms`);
    lines.push(`Avg |deltaMs|: ${s.avgAbsDeltaMs.toFixed(2)}ms`);
    lines.push(`Speed consistency (stddev): ${s.speedConsistency !== null ? s.speedConsistency.toFixed(2) + 'px' : 'N/A'}`);
    lines.push(`Grade distribution: ${JSON.stringify(s.gradeDistribution)}`);

    return lines.join('\n');
  }
}
