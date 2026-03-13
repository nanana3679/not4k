/**
 * 캘리브레이션 순수 함수 모듈
 *
 * 시각/오디오 캘리브레이션에서 측정된 차이값(diff)을 분석하여
 * 오프셋을 산출한다. 이상치 제거 후 중앙값을 사용한다.
 */

/**
 * 정렬된 배열의 중앙값을 구한다.
 * 짝수 개일 경우 중앙 두 값의 평균을 반환한다.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    throw new Error('빈 배열의 중앙값을 계산할 수 없습니다');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * 표준편차를 계산한다.
 */
export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * IQR(사분위 범위) 기반 이상치 제거.
 * threshold 배수만큼 IQR 바깥의 값을 제거한다. 기본값 1.5.
 */
export function removeOutliers(values: number[], threshold = 1.5): number[] {
  if (values.length < 4) return [...values];
  const sorted = [...values].sort((a, b) => a - b);

  const q1Idx = Math.floor(sorted.length / 4);
  const q3Idx = Math.floor((sorted.length * 3) / 4);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  const iqr = q3 - q1;

  const lower = q1 - threshold * iqr;
  const upper = q3 + threshold * iqr;

  return sorted.filter((v) => v >= lower && v <= upper);
}

export interface CalibrationResult {
  /** 산출된 오프셋 (ms). 이상치 제거 후 중앙값. */
  offset: number;
  /** 이상치 제거 후 표준편차 (ms). 신뢰도 지표. */
  stdDev: number;
  /** 이상치 제거 후 남은 샘플 수 */
  sampleCount: number;
}

/**
 * 측정된 diff 배열로 캘리브레이션 결과를 산출한다.
 * diff = 입력 시각 - 기대 시각 (양수 = 늦게 누름, 음수 = 빨리 누름)
 */
export function calculateCalibrationResult(diffs: number[]): CalibrationResult {
  if (diffs.length === 0) {
    throw new Error('측정 데이터가 없습니다');
  }
  const cleaned = removeOutliers(diffs);
  if (cleaned.length === 0) {
    throw new Error('이상치 제거 후 데이터가 없습니다');
  }
  const offset = Math.round(calculateMedian(cleaned));
  const stdDev = Math.round(calculateStdDev(cleaned) * 10) / 10;
  return { offset, stdDev, sampleCount: cleaned.length };
}

/** 캘리브레이션에서 사용하는 기본 간격 (ms) */
export const CALIBRATION_INTERVAL_MS = 600;

/** 측정 횟수 */
export const CALIBRATION_TOTAL_TAPS = 15;

/** 첫 몇 개의 탭은 워밍업으로 무시 */
export const CALIBRATION_WARMUP_TAPS = 3;
