import { describe, expect, it } from 'vitest';
import {
  MAX_LIGHT_INTENSITY,
  clampLightHeight,
  clampLightIntensity,
  formatClipInset,
  getClipInsetPercent,
  getGlowPresentation,
  getVisibleLightBox,
} from './gearLight';

describe('gearLight', () => {
  const asset = { width: 1000, height: 2000 };
  const box = { x: 100, y: 200, width: 300, height: 800 };

  it('높이 50%이면 보이는 영역이 기둥 하단 절반으로 줄어듦', () => {
    expect(getVisibleLightBox(box, 0.5)).toEqual({
      x: 100,
      y: 600,
      width: 300,
      height: 400,
    });
  });

  it('높이 0%이면 보이는 영역 높이는 0이고 y는 기둥 하단', () => {
    expect(getVisibleLightBox(box, 0)).toEqual({
      x: 100,
      y: 1000,
      width: 300,
      height: 0,
    });
  });

  it('높이 -20%는 0%, 높이 120%는 100%로 제한됨', () => {
    expect(clampLightHeight(-0.2)).toBe(0);
    expect(clampLightHeight(1.2)).toBe(1);
  });

  it('1000x2000 이미지에서 높이 50%이면 clip inset은 top 30%, right 60%, bottom 50%, left 10%', () => {
    expect(getClipInsetPercent(asset, box, 0.5)).toEqual({
      top: 30,
      right: 60,
      bottom: 50,
      left: 10,
    });
  });

  it('clip inset 객체는 CSS inset 문자열로 변환됨', () => {
    expect(formatClipInset({ top: 1, right: 2, bottom: 3, left: 4 })).toBe('inset(1% 2% 3% 4%)');
  });

  it(`세기 ${MAX_LIGHT_INTENSITY + 1}은 최대 세기 ${MAX_LIGHT_INTENSITY}로 제한됨`, () => {
    expect(clampLightIntensity(MAX_LIGHT_INTENSITY + 1)).toBe(MAX_LIGHT_INTENSITY);
  });

  it('세기 0이면 glow opacity는 0이고 shadowPx도 0', () => {
    expect(getGlowPresentation(0)).toEqual({
      opacity: 0,
      brightness: 0.7,
      saturation: 0.9,
      shadowPx: 0,
    });
  });

  it('세기 1이면 glow opacity 0.56, brightness 1.28, shadowPx 24', () => {
    expect(getGlowPresentation(1)).toEqual({
      opacity: 0.56,
      brightness: 1.28,
      saturation: 1.04,
      shadowPx: 24,
    });
  });
});
