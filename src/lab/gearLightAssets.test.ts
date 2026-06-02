import { describe, expect, it } from 'vitest';
import { GEAR_LIGHT_SAMPLES, getGearLightSample } from './gearLightAssets';

describe('gearLightAssets', () => {
  it('원본 1개와 생성 샘플 20개를 합쳐 총 21개 선택지를 제공함', () => {
    expect(GEAR_LIGHT_SAMPLES).toHaveLength(21);
    expect(GEAR_LIGHT_SAMPLES[0].id).toBe('original');
    expect(GEAR_LIGHT_SAMPLES.at(-1)?.id).toBe('option-20');
  });

  it('option-20은 저장된 source/base/glow/metadata 경로를 모두 가짐', () => {
    expect(getGearLightSample('option-20')).toEqual({
      id: 'option-20',
      label: '20 Holographic',
      sourceSrc: '/lab/gear-samples/option-20/gear-source.png',
      baseSrc: '/lab/gear-samples/option-20/gear-base.png',
      glowSrc: '/lab/gear-samples/option-20/gear-glow.png',
      metadataSrc: '/lab/gear-samples/option-20/gear-metadata.json',
    });
  });

  it('없는 id를 요청하면 original 샘플을 반환함', () => {
    expect(getGearLightSample('missing').id).toBe('original');
  });
});
