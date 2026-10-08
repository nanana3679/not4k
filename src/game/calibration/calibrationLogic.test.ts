import { describe, it, expect } from 'vitest';
import {
  calculateMedian,
  calculateStdDev,
  removeOutliers,
  calculateCalibrationResult,
  calibrationNoteProgress,
  calibrationNoteTopY,
  calibrationNoteLeftX,
  CALIBRATION_NOTE_HEIGHT,
  CALIBRATION_NOTE_WIDTH,
  offsetToApply,
} from './calibrationLogic';
import { GameClock } from '../time/GameClock';

describe('calculateMedian', () => {
  it('홀수 개 [1, 2, 3] → 중앙값 2', () => {
    expect(calculateMedian([1, 2, 3])).toBe(2);
  });

  it('짝수 개 [1, 2, 3, 4] → 중앙값 2.5', () => {
    expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
  });

  it('정렬되지 않은 [5, 1, 3] → 중앙값 3', () => {
    expect(calculateMedian([5, 1, 3])).toBe(3);
  });

  it('단일 원소 [42] → 중앙값 42', () => {
    expect(calculateMedian([42])).toBe(42);
  });

  it('빈 배열이면 에러', () => {
    expect(() => calculateMedian([])).toThrow('빈 배열');
  });

  it('음수 포함 [-10, -5, 0, 5, 10] → 중앙값 0', () => {
    expect(calculateMedian([-10, -5, 0, 5, 10])).toBe(0);
  });
});

describe('calculateStdDev', () => {
  it('동일한 값 [5, 5, 5] → 표준편차 0', () => {
    expect(calculateStdDev([5, 5, 5])).toBe(0);
  });

  it('원소 1개 [10] → 표준편차 0', () => {
    expect(calculateStdDev([10])).toBe(0);
  });

  it('[2, 4, 4, 4, 5, 5, 7, 9] → 표준편차 약 2', () => {
    const result = calculateStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result).toBeCloseTo(2, 0);
  });
});

describe('removeOutliers', () => {
  it('이상치 포함 데이터에서 극단값 제거', () => {
    const data = [10, 12, 11, 13, 12, 11, 100, 10, 11, 12];
    const result = removeOutliers(data);
    expect(result).not.toContain(100);
    expect(result.length).toBeGreaterThan(0);
  });

  it('4개 미만이면 제거하지 않음', () => {
    const data = [1, 100, 2];
    expect(removeOutliers(data)).toEqual([1, 100, 2]);
  });

  it('이상치가 없으면 전부 유지', () => {
    const data = [10, 11, 12, 13, 14];
    const result = removeOutliers(data);
    expect(result).toHaveLength(5);
  });

  it('threshold=0이면 IQR 범위 밖의 모든 값 제거', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100];
    const result = removeOutliers(data, 0);
    expect(result).not.toContain(100);
  });

  it('원본 배열을 변경하지 않음', () => {
    const data = [5, 3, 1, 4, 2];
    const copy = [...data];
    removeOutliers(data);
    expect(data).toEqual(copy);
  });
});

describe('calculateCalibrationResult', () => {
  it('균일한 diff [10, 10, 10, 10, 10] → offset 10, stdDev 0', () => {
    const result = calculateCalibrationResult([10, 10, 10, 10, 10]);
    expect(result.offset).toBe(10);
    expect(result.stdDev).toBe(0);
    expect(result.sampleCount).toBe(5);
  });

  it('이상치 포함 시 이상치 제거 후 중앙값 반환', () => {
    const diffs = [20, 22, 21, 23, 20, 21, 22, 200, 20, 21];
    const result = calculateCalibrationResult(diffs);
    expect(result.offset).toBeGreaterThanOrEqual(20);
    expect(result.offset).toBeLessThanOrEqual(23);
    expect(result.sampleCount).toBeLessThan(diffs.length);
  });

  it('음수 diff → 음수 offset', () => {
    const diffs = [-15, -14, -16, -15, -14];
    const result = calculateCalibrationResult(diffs);
    expect(result.offset).toBe(-15);
  });

  it('빈 배열이면 에러', () => {
    expect(() => calculateCalibrationResult([])).toThrow('측정 데이터가 없습니다');
  });

  it('offset은 정수로 반올림됨', () => {
    const diffs = [10, 11, 10, 11, 10, 11, 10, 11];
    const result = calculateCalibrationResult(diffs);
    expect(Number.isInteger(result.offset)).toBe(true);
  });
});

describe('offsetToApply — 측정값의 반대 부호를 오프셋으로 저장', () => {
  it('탭이 박보다 중앙값 +15ms 늦음(측정 offset 15) → 적용 오프셋 −15', () => {
    expect(offsetToApply({ offset: 15, stdDev: 1, sampleCount: 20 })).toBe(-15);
  });

  it('탭이 박보다 중앙값 −20ms 빠름(측정 offset −20) → 적용 오프셋 +20', () => {
    expect(offsetToApply({ offset: -20, stdDev: 1, sampleCount: 20 })).toBe(20);
  });

  it('측정 offset 0 → 적용 오프셋 0(−0이 아님)', () => {
    expect(Object.is(offsetToApply({ offset: 0, stdDev: 0, sampleCount: 20 }), 0)).toBe(true);
  });

  it('오디오 시각 1000ms 박에 15ms 늦게 누르는 사람: 측정 +15를 적용하면 GameClock 입력 시간이 박 시각 1000ms와 같다', () => {
    const measured = calculateCalibrationResult([15, 15, 15, 15, 15]);
    // 박 1000ms보다 15ms 늦은 순간(오디오 1015ms)에 키 이벤트가 핸들러 지연 없이 들어온다.
    const clock = new GameClock(
      { currentTimeMs: 1015, getOutputLatencyMs: () => 0 },
      { audioOffsetMs: 0, judgmentOffsetMs: offsetToApply(measured) },
      () => 5000,
    );
    expect(clock.toInputTimeMs(5000)).toBe(1000);
  });

  it('같은 사람에게 측정값을 부호 그대로 넣으면(이전 동작) 입력 시간이 1030ms로 30ms 늦게 판정된다', () => {
    const clock = new GameClock(
      { currentTimeMs: 1015, getOutputLatencyMs: () => 0 },
      { audioOffsetMs: 0, judgmentOffsetMs: 15 },
      () => 5000,
    );
    expect(clock.toInputTimeMs(5000)).toBe(1030);
  });
});

describe('Visual 보정 노트 위치 — 게임과 같은 노트 가운데 기준 (#224)', () => {
  it('박 시각(now = beat = 5000)에는 진행도 1이고 두께 12 노트 박스 가운데가 판정선 y 340에 와 위끝 334', () => {
    const progress = calibrationNoteProgress(5000, 5000);
    expect(progress).toBe(1);
    expect(calibrationNoteTopY(progress, 340)).toBe(334);
    expect(calibrationNoteTopY(progress, 340) + CALIBRATION_NOTE_HEIGHT / 2).toBe(340);
  });

  it('박 시각보다 한 간격(600ms) 전에는 진행도 0이고 노트 가운데가 캔버스 위끝 y 0(박스 위끝 −6)', () => {
    const progress = calibrationNoteProgress(4400, 5000);
    expect(progress).toBe(0);
    expect(calibrationNoteTopY(progress, 340)).toBe(-6);
  });

  it('박 시각보다 300ms 전(한 간격 600ms의 절반)에는 진행도 0.5이고 노트 가운데가 판정선 y 340의 절반 y 170', () => {
    const progress = calibrationNoteProgress(4700, 5000);
    expect(progress).toBe(0.5);
    expect(calibrationNoteTopY(progress, 340) + CALIBRATION_NOTE_HEIGHT / 2).toBe(170);
  });

  it('Visual 보정 노트는 폭 120이고 캔버스 폭 400의 가운데(x 140~260)에 그린다', () => {
    expect(CALIBRATION_NOTE_WIDTH).toBe(120);
    expect(calibrationNoteLeftX(400)).toBe(140);
    expect(calibrationNoteLeftX(400) + CALIBRATION_NOTE_WIDTH / 2).toBe(200);
  });
});
