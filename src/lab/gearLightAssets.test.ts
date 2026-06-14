import { describe, expect, it } from 'vitest';
import { GEAR_LIGHT_SAMPLES, getGearLightSample } from './gearLightAssets';

describe('gearLightAssets', () => {
  it('원본 런타임 게이지 1개, 보조 런타임 데모 1개, 생성 샘플 27개를 합쳐 총 29개 선택지를 제공함', () => {
    expect(GEAR_LIGHT_SAMPLES).toHaveLength(29);
    expect(GEAR_LIGHT_SAMPLES[0].id).toBe('original');
    expect(GEAR_LIGHT_SAMPLES[1].id).toBe('compact-runtime-03');
    expect(GEAR_LIGHT_SAMPLES.at(-1)?.id).toBe('ai-option-03');
  });

  it('original은 기존 원본 이미지와 원본 runtime back/front/config 경로를 모두 가짐', () => {
    expect(getGearLightSample('original')).toEqual({
      id: 'original',
      label: 'Original Runtime',
      sourceSrc: '/lab/gear-light/gear-source.png',
      baseSrc: '/lab/gear-light/gear-base.png',
      glowSrc: '/lab/gear-light/gear-glow.png',
      metadataSrc: '/lab/gear-light/gear-metadata.json',
      runtimeBackSrc: '/lab/gear-light/gear-back.png',
      runtimeFrontSrc: '/lab/gear-light/gear-front.png',
      runtimeConfigSrc: '/lab/gear-light/skin-runtime-config.json',
    });
  });

  it('compact-runtime-03은 gear-back/front와 runtime config 경로를 모두 가짐', () => {
    expect(getGearLightSample('compact-runtime-03')).toEqual({
      id: 'compact-runtime-03',
      label: 'Runtime Gauge Demo',
      sourceSrc: '/lab/gear-samples/compact-set-03/gear-source.png',
      baseSrc: '/lab/gear-samples/compact-set-03/gear-back.png',
      glowSrc: '/lab/gear-samples/compact-set-03/gear-front.png',
      metadataSrc: '/lab/gear-samples/compact-set-03/skin-runtime-config.json',
      runtimeBackSrc: '/lab/gear-samples/compact-set-03/gear-back.png',
      runtimeFrontSrc: '/lab/gear-samples/compact-set-03/gear-front.png',
      runtimeConfigSrc: '/lab/gear-samples/compact-set-03/skin-runtime-config.json',
    });
  });

  it('option-20은 기존 source/base/glow/metadata 경로만 가지고 gauge 경로는 없음', () => {
    expect(getGearLightSample('option-20')).toEqual({
      id: 'option-20',
      label: '20 Holographic',
      sourceSrc: '/lab/gear-samples/option-20/gear-source.png',
      baseSrc: '/lab/gear-samples/option-20/gear-base.png',
      glowSrc: '/lab/gear-samples/option-20/gear-glow.png',
      metadataSrc: '/lab/gear-samples/option-20/gear-metadata.json',
    });
  });

  it('option-24는 새로 분리한 source/base/glow/gauge/metadata 경로를 모두 가짐', () => {
    expect(getGearLightSample('option-24')).toEqual({
      id: 'option-24',
      label: '24 Altitude Matrix',
      sourceSrc: '/lab/gear-samples/option-24/gear-source.png',
      baseSrc: '/lab/gear-samples/option-24/gear-base.png',
      glowSrc: '/lab/gear-samples/option-24/gear-glow.png',
      gaugeSrc: '/lab/gear-samples/option-24/gear-gauge.png',
      metadataSrc: '/lab/gear-samples/option-24/gear-metadata.json',
    });
  });

  it('ai-option-03은 AI 원본에서 분리한 source/base/glow/gauge/metadata 경로를 모두 가짐', () => {
    expect(getGearLightSample('ai-option-03')).toEqual({
      id: 'ai-option-03',
      label: 'AI 03 Split Reactor',
      sourceSrc: '/lab/gear-samples/ai-option-03/gear-source.png',
      baseSrc: '/lab/gear-samples/ai-option-03/gear-base.png',
      glowSrc: '/lab/gear-samples/ai-option-03/gear-glow.png',
      gaugeSrc: '/lab/gear-samples/ai-option-03/gear-gauge.png',
      metadataSrc: '/lab/gear-samples/ai-option-03/gear-metadata.json',
    });
  });

  it('없는 id를 요청하면 original 샘플을 반환함', () => {
    expect(getGearLightSample('missing').id).toBe('original');
  });
});
