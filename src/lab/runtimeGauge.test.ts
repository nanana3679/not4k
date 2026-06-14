import { describe, expect, it } from 'vitest';
import { formatRuntimeGaugeGradient, getRuntimeGaugeFillBox, type RuntimeGaugeDefinition } from './runtimeGauge';

const baseGauge: RuntimeGaugeDefinition = {
  id: 'leftAltitude',
  label: 'Left altitude',
  window: { x: 100, y: 20, width: 40, height: 200, radius: 8 },
  direction: 'bottom-to-top',
  gradient: [
    { at: 1, color: '#ffd166' },
    { at: 0, color: '#18d7ff' },
  ],
  innerGlow: { color: '#24e6ff', blur: 18, alpha: 0.46 },
};

describe('runtimeGauge', () => {
  it('bottom-to-top에서 25%면 아래쪽 50px만 채우고 y는 170이 됨', () => {
    expect(getRuntimeGaugeFillBox(baseGauge, 0.25)).toEqual({
      x: 100,
      y: 170,
      width: 40,
      height: 50,
    });
  });

  it('top-to-bottom에서 25%면 위쪽 50px만 채우고 y는 20으로 유지됨', () => {
    expect(getRuntimeGaugeFillBox({ ...baseGauge, direction: 'top-to-bottom' }, 0.25)).toEqual({
      x: 100,
      y: 20,
      width: 40,
      height: 50,
    });
  });

  it('-10%는 0%로 clamp되어 높이가 0이 됨', () => {
    expect(getRuntimeGaugeFillBox(baseGauge, -0.1).height).toBe(0);
  });

  it('120%는 100%로 clamp되어 전체 200px을 채움', () => {
    expect(getRuntimeGaugeFillBox(baseGauge, 1.2)).toEqual({
      x: 100,
      y: 20,
      width: 40,
      height: 200,
    });
  });

  it('gradient stop 순서가 뒤섞여도 0%에서 100% 순서로 CSS를 만듦', () => {
    expect(formatRuntimeGaugeGradient(baseGauge)).toBe('linear-gradient(to top, #18d7ff 0%, #ffd166 100%)');
  });
});
