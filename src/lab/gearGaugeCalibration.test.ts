import { describe, expect, it } from 'vitest';
import {
  createGaugeCalibration,
  exportGaugeCalibration,
  moveCalibrationRect,
  resizeCalibrationRect,
  updateCalibrationRect,
  type GaugeCalibrationState,
} from './gearGaugeCalibration';
import type { RuntimeGaugeConfig } from './runtimeGauge';

const runtimeConfig: RuntimeGaugeConfig = {
  canvas: { width: 200, height: 300 },
  layers: { back: 'gear-back.png', front: 'gear-front.png' },
  gauges: [
    {
      id: 'leftAltitude',
      label: 'Left altitude',
      window: { x: 50, y: 40, width: 30, height: 120, radius: 8 },
      direction: 'bottom-to-top',
      gradient: [
        { at: 0, color: '#18d7ff' },
        { at: 1, color: '#e9fbff' },
      ],
      innerGlow: { color: '#24e6ff', blur: 18, alpha: 0.46 },
    },
  ],
};

describe('gearGaugeCalibration', () => {
  it('runtime config에서 gaugeWindow는 원본 window이고 eraseMask는 padding 10만큼 확장됨', () => {
    expect(createGaugeCalibration(runtimeConfig, 10)).toEqual({
      activeGaugeId: 'leftAltitude',
      eraseMasks: {
        leftAltitude: { x: 40, y: 30, width: 50, height: 140, radius: 18 },
      },
      gaugeWindows: {
        leftAltitude: { x: 50, y: 40, width: 30, height: 120, radius: 8 },
      },
    });
  });

  it('runtime config에 eraseMasks가 있으면 padding 확장 대신 sourceGaugeId가 같은 eraseMask를 사용함', () => {
    expect(createGaugeCalibration({
      ...runtimeConfig,
      eraseMasks: [
        {
          id: 'leftAltitudeErase',
          sourceGaugeId: 'leftAltitude',
          x: 45,
          y: 35,
          width: 24,
          height: 132,
          radius: 12,
        },
      ],
    }, 10).eraseMasks.leftAltitude).toEqual({
      x: 45,
      y: 35,
      width: 24,
      height: 132,
      radius: 12,
    });
  });

  it('좌표를 -80, -70 이동하면 eraseMask가 canvas 밖으로 나가지 않고 0,0에 고정됨', () => {
    const rect = moveCalibrationRect(
      { x: 40, y: 30, width: 50, height: 140, radius: 18 },
      { dx: -80, dy: -70 },
      runtimeConfig.canvas,
    );

    expect(rect).toEqual({ x: 0, y: 0, width: 50, height: 140, radius: 18 });
  });

  it('right 핸들을 30px 늘리면 x는 유지되고 width만 30px 증가함', () => {
    const rect = resizeCalibrationRect(
      { x: 50, y: 40, width: 30, height: 120, radius: 8 },
      'right',
      { dx: 30, dy: 0 },
      runtimeConfig.canvas,
    );

    expect(rect).toEqual({ x: 50, y: 40, width: 60, height: 120, radius: 8 });
  });

  it('left 핸들을 -20px 이동하면 x가 줄고 width가 20px 증가함', () => {
    const rect = resizeCalibrationRect(
      { x: 50, y: 40, width: 30, height: 120, radius: 8 },
      'left',
      { dx: -20, dy: 0 },
      runtimeConfig.canvas,
    );

    expect(rect).toEqual({ x: 30, y: 40, width: 50, height: 120, radius: 8 });
  });

  it('eraseMask의 x를 300으로 직접 입력하면 canvas 오른쪽 경계에 맞게 clamp됨', () => {
    const calibration: GaugeCalibrationState = createGaugeCalibration(runtimeConfig, 10);

    expect(updateCalibrationRect(
      calibration,
      'eraseMask',
      'leftAltitude',
      { x: 300 },
      runtimeConfig.canvas,
    ).eraseMasks.leftAltitude).toEqual({
      x: 150,
      y: 30,
      width: 50,
      height: 140,
      radius: 18,
    });
  });

  it('export는 보정된 eraseMasks와 gauge window를 함께 포함함', () => {
    const calibration = createGaugeCalibration(runtimeConfig, 10);

    expect(exportGaugeCalibration(runtimeConfig, calibration)).toMatchObject({
      canvas: { width: 200, height: 300 },
      layers: { back: 'gear-back.png', front: 'gear-front.png' },
      eraseMasks: [
        {
          id: 'leftAltitudeErase',
          sourceGaugeId: 'leftAltitude',
          x: 40,
          y: 30,
          width: 50,
          height: 140,
          radius: 18,
        },
      ],
      gauges: [
        {
          id: 'leftAltitude',
          window: { x: 50, y: 40, width: 30, height: 120, radius: 8 },
        },
      ],
    });
  });
});
