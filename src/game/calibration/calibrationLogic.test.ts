import { describe, it, expect } from 'vitest';
import {
  calculateMedian,
  calculateStdDev,
  removeOutliers,
  calculateCalibrationResult,
} from './calibrationLogic';

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
