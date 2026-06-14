import { describe, expect, it } from 'vitest';
import {
  hasGearLightSideBoxes,
  resolveGearLightViewMode,
  type GearLightPreviewMode,
} from './gearLightPreviewMode';

describe('gearLightPreviewMode', () => {
  it('adjusted 모드에서 columnBoxes가 없고 gaugeBoxes만 있으면 gauge 모드로 대체됨', () => {
    expect(resolveGearLightViewMode({
      canShowAdjusted: false,
      canShowGauge: true,
      canShowRuntimeGauge: false,
      viewMode: 'adjusted',
    })).toBe('gauge');
  });

  it('adjusted 모드에서 columnBoxes와 gaugeBoxes가 모두 없으면 source 모드로 대체됨', () => {
    expect(resolveGearLightViewMode({
      canShowAdjusted: false,
      canShowGauge: false,
      canShowRuntimeGauge: false,
      viewMode: 'adjusted',
    })).toBe('source');
  });

  it('runtime 모드에서 runtime config가 없으면 source 모드로 대체됨', () => {
    expect(resolveGearLightViewMode({
      canShowAdjusted: false,
      canShowGauge: false,
      canShowRuntimeGauge: false,
      viewMode: 'runtime',
    })).toBe('source');
  });

  it('left와 right box가 모두 있으면 side box 묶음으로 인정함', () => {
    expect(hasGearLightSideBoxes({
      left: { x: 0, y: 0, width: 10, height: 20 },
      right: { x: 20, y: 0, width: 10, height: 20 },
    })).toBe(true);
  });

  it('left만 있으면 side box 묶음으로 인정하지 않음', () => {
    expect(hasGearLightSideBoxes({
      left: { x: 0, y: 0, width: 10, height: 20 },
    })).toBe(false);
  });

  it('source/glow/gauge처럼 렌더 가능한 모드는 그대로 유지함', () => {
    const modes: GearLightPreviewMode[] = ['source', 'glow', 'gauge'];

    expect(modes.map((viewMode) => resolveGearLightViewMode({
      canShowAdjusted: false,
      canShowGauge: true,
      canShowRuntimeGauge: false,
      viewMode,
    }))).toEqual(modes);
  });
});
