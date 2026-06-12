import { describe, expect, it } from 'vitest';
import {
  getPulseMaskGradient,
  getPulseTravelRange,
  getVisibleMeasurePulses,
  measureIntervalMs,
  progressToImageY,
} from './gearMeasurePulse';

describe('measureIntervalMs', () => {
  it('120 BPM 4박이면 마디 간격 2000ms', () => {
    expect(measureIntervalMs(120, 4)).toBe(2000);
  });

  it('180 BPM 3.5박(7/2)이면 마디 간격 약 1166.67ms', () => {
    expect(measureIntervalMs(180, 3.5)).toBeCloseTo(1166.667, 2);
  });

  it('BPM이 0 이하면 0 반환', () => {
    expect(measureIntervalMs(0, 4)).toBe(0);
    expect(measureIntervalMs(-120, 4)).toBe(0);
  });
});

describe('getVisibleMeasurePulses', () => {
  it('레인 통과 1000ms, 마디 간격 500ms, t=0이면 progress 1, 0.5, 0인 펄스 3개', () => {
    const pulses = getVisibleMeasurePulses({
      timeMs: 0,
      measureIntervalMs: 500,
      laneHeightPx: 800,
      scrollSpeedPxPerSec: 800,
    });
    expect(pulses).toEqual([
      { measureIndex: 0, progress: 1 },
      { measureIndex: 1, progress: 0.5 },
      { measureIndex: 2, progress: 0 },
    ]);
  });

  it('현재 시각과 같은 마디는 progress 1 (판정선 도달)', () => {
    const pulses = getVisibleMeasurePulses({
      timeMs: 2000,
      measureIntervalMs: 2000,
      laneHeightPx: 900,
      scrollSpeedPxPerSec: 800,
    });
    expect(pulses[0]).toEqual({ measureIndex: 1, progress: 1 });
  });

  it('판정선을 지난 마디는 포함하지 않음', () => {
    const pulses = getVisibleMeasurePulses({
      timeMs: 2100,
      measureIntervalMs: 2000,
      laneHeightPx: 800,
      scrollSpeedPxPerSec: 800,
    });
    expect(pulses.map((p) => p.measureIndex)).not.toContain(1);
  });

  it('곡 시작 전(음수 시간)이라 화면에 마디가 없으면 빈 배열', () => {
    const pulses = getVisibleMeasurePulses({
      timeMs: -2000,
      measureIntervalMs: 500,
      laneHeightPx: 800,
      scrollSpeedPxPerSec: 800,
    });
    expect(pulses).toEqual([]);
  });

  it('마디 0은 음수 시간에도 progress 0~1 범위면 보임', () => {
    const pulses = getVisibleMeasurePulses({
      timeMs: -500,
      measureIntervalMs: 2000,
      laneHeightPx: 800,
      scrollSpeedPxPerSec: 800,
    });
    expect(pulses).toEqual([{ measureIndex: 0, progress: 0.5 }]);
  });

  it('scrollSpeed가 0 이하면 빈 배열', () => {
    const pulses = getVisibleMeasurePulses({
      timeMs: 0,
      measureIntervalMs: 500,
      laneHeightPx: 800,
      scrollSpeedPxPerSec: 0,
    });
    expect(pulses).toEqual([]);
  });

  it('마디 간격이 0 이하면 빈 배열', () => {
    const pulses = getVisibleMeasurePulses({
      timeMs: 0,
      measureIntervalMs: 0,
      laneHeightPx: 800,
      scrollSpeedPxPerSec: 800,
    });
    expect(pulses).toEqual([]);
  });
});

describe('getPulseTravelRange', () => {
  it('좌우 기둥 박스의 합집합 상단~하단을 반환', () => {
    const range = getPulseTravelRange({
      left: { x: 435, y: 559, width: 1056, height: 3073 },
      right: { x: 1914, y: 590, width: 1273, height: 3042 },
    });
    expect(range).toEqual({ top: 559, bottom: 3632 });
  });
});

describe('progressToImageY', () => {
  it('progress 0이면 범위 상단, 1이면 범위 하단', () => {
    const range = { top: 500, bottom: 3500 };
    expect(progressToImageY(0, range)).toBe(500);
    expect(progressToImageY(1, range)).toBe(3500);
  });

  it('progress 0.5면 범위 중앙', () => {
    expect(progressToImageY(0.5, { top: 1000, bottom: 3000 })).toBe(2000);
  });
});

describe('getPulseMaskGradient', () => {
  it('이미지 높이 1000, 중앙 500, 밴드 200, 페더 100이면 30%/40%/60%/70% 지점', () => {
    expect(getPulseMaskGradient(1000, 500, 200, 100)).toBe(
      'linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 1) 40%, rgba(0, 0, 0, 1) 60%, rgba(0, 0, 0, 0) 70%)',
    );
  });

  it('밴드가 이미지 상단을 벗어나면 0%로 클램프', () => {
    const gradient = getPulseMaskGradient(1000, 50, 200, 100);
    expect(gradient).toContain('rgba(0, 0, 0, 0) 0%');
    expect(gradient).not.toMatch(/-\d/);
  });

  it('밴드가 이미지 하단을 벗어나면 100%로 클램프', () => {
    const gradient = getPulseMaskGradient(1000, 980, 200, 100);
    expect(gradient).toContain('rgba(0, 0, 0, 0) 100%)');
  });
});
