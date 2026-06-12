import type { GearLightBox, GearLightSide } from './gearLight';

/**
 * 마디 펄스: 레인 안의 마디선 대신, 마디선 y좌표를 따라 기어 프레임 글로우가
 * 위에서 아래로 동행하는 하이라이트(1안). 게임과 동일한 선형 스크롤 공식
 * (y = judgmentLineY - Δt * scrollSpeed / 1000)을 progress 0~1로 정규화해 다룬다.
 */

export interface MeasurePulse {
  /** 0부터 시작하는 마디 번호 */
  measureIndex: number;
  /** 0 = 레인 상단 진입, 1 = 판정선 도달 */
  progress: number;
}

export interface PulseTravelRange {
  top: number;
  bottom: number;
}

export function measureIntervalMs(bpm: number, beatsPerMeasure: number): number {
  if (bpm <= 0 || beatsPerMeasure <= 0) return 0;
  return (60000 / bpm) * beatsPerMeasure;
}

export function getVisibleMeasurePulses(args: {
  timeMs: number;
  measureIntervalMs: number;
  laneHeightPx: number;
  scrollSpeedPxPerSec: number;
}): MeasurePulse[] {
  const { timeMs, measureIntervalMs: interval, laneHeightPx, scrollSpeedPxPerSec } = args;
  if (interval <= 0 || laneHeightPx <= 0 || scrollSpeedPxPerSec <= 0) return [];

  // progress ∈ [0, 1] ⇔ 마디 시각 ∈ [timeMs, timeMs + 레인 통과 시간]
  const travelMs = (laneHeightPx / scrollSpeedPxPerSec) * 1000;
  const firstIndex = Math.max(0, Math.ceil(timeMs / interval));
  const lastIndex = Math.floor((timeMs + travelMs) / interval);

  const pulses: MeasurePulse[] = [];
  for (let k = firstIndex; k <= lastIndex; k++) {
    const progress = 1 - (k * interval - timeMs) / travelMs;
    if (progress < 0 || progress > 1) continue;
    pulses.push({ measureIndex: k, progress });
  }
  return pulses;
}

/** 좌우 기둥 라이트 박스의 합집합 세로 범위. 펄스는 이 범위를 progress 0→1로 이동한다. */
export function getPulseTravelRange(
  columnBoxes: Record<GearLightSide, GearLightBox>,
): PulseTravelRange {
  const boxes = [columnBoxes.left, columnBoxes.right];
  return {
    top: Math.min(...boxes.map((box) => box.y)),
    bottom: Math.max(...boxes.map((box) => box.y + box.height)),
  };
}

export function progressToImageY(progress: number, range: PulseTravelRange): number {
  return range.top + progress * (range.bottom - range.top);
}

const roundPercent = (value: number) => Math.round(value * 1000) / 1000;

const toClampedPercent = (px: number, total: number) =>
  roundPercent(Math.min(100, Math.max(0, (px / total) * 100)));

/**
 * 글로우 레이어를 펄스 밴드만 남기고 잘라내는 세로 그라데이션 마스크.
 * centerY를 중심으로 bandHeightPx 구간은 완전 표시, 위아래 featherPx 만큼 부드럽게 사라진다.
 */
export function getPulseMaskGradient(
  imageHeightPx: number,
  centerY: number,
  bandHeightPx: number,
  featherPx: number,
): string {
  const halfBand = bandHeightPx / 2;
  const fadeTop = toClampedPercent(centerY - halfBand - featherPx, imageHeightPx);
  const bandTop = toClampedPercent(centerY - halfBand, imageHeightPx);
  const bandBottom = toClampedPercent(centerY + halfBand, imageHeightPx);
  const fadeBottom = toClampedPercent(centerY + halfBand + featherPx, imageHeightPx);

  return (
    `linear-gradient(180deg, rgba(0, 0, 0, 0) ${fadeTop}%, rgba(0, 0, 0, 1) ${bandTop}%, ` +
    `rgba(0, 0, 0, 1) ${bandBottom}%, rgba(0, 0, 0, 0) ${fadeBottom}%)`
  );
}
