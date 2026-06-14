import { describe, expect, it } from 'vitest';
import type { RuntimeGaugeConfig } from './runtimeGauge';
import configJson from '../../public/lab/gear-light/skin-runtime-config.json';

const config = configJson as RuntimeGaugeConfig;

describe('original runtime gauge config', () => {
  it('원본 runtime config는 좌우 게이지 window를 1702x2352 canvas 안에 정의함', () => {
    expect(config.canvas).toEqual({ width: 1702, height: 2352 });
    expect(config.gauges.map((gauge) => gauge.id)).toEqual(['leftAltitude', 'rightAltitude']);

    for (const gauge of config.gauges) {
      expect(gauge.direction).toBe('bottom-to-top');
      expect(gauge.window.x).toBeGreaterThanOrEqual(0);
      expect(gauge.window.y).toBeGreaterThanOrEqual(0);
      expect(gauge.window.x + gauge.window.width).toBeLessThanOrEqual(config.canvas.width);
      expect(gauge.window.y + gauge.window.height).toBeLessThanOrEqual(config.canvas.height);
    }
  });

  it('원본 runtime config는 같은 디렉터리의 gear-back/front 레이어를 참조함', () => {
    expect(config.layers).toEqual({
      back: 'gear-back.png',
      front: 'gear-front.png',
    });
  });
});
