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

  it('원본 runtime config는 사람이 보정한 eraseMask와 gauge window 좌표를 유지함', () => {
    expect(config.eraseMasks).toEqual([
      {
        id: 'leftAltitudeErase',
        sourceGaugeId: 'leftAltitude',
        x: 425,
        y: 273,
        width: 23,
        height: 1226,
        radius: 11,
      },
      {
        id: 'rightAltitudeErase',
        sourceGaugeId: 'rightAltitude',
        x: 1378,
        y: 271,
        width: 20,
        height: 1219,
        radius: 10,
      },
    ]);
    expect(config.gauges.map((gauge) => ({ id: gauge.id, window: gauge.window }))).toEqual([
      {
        id: 'leftAltitude',
        window: { x: 412, y: 267, width: 58, height: 1230, radius: 14 },
      },
      {
        id: 'rightAltitude',
        window: { x: 1358, y: 271, width: 62, height: 1224, radius: 14 },
      },
    ]);
  });
});
