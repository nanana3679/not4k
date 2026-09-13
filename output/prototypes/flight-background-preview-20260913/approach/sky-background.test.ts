import { describe, expect, it } from 'vitest';
import { skyAsset, skyAssetPaths } from './sky-background.mjs';

describe('난이도별 하늘 배경 선택', () => {
  it('침투는 먹구름 봉쇄 공역 전용 sky-infiltration.png를 사용한다', () => {
    expect(skyAsset('infiltration')).toBe('./sky-infiltration.png');
  });

  it('이륙과 알 수 없는 난이도는 기존 sky.png를 유지한다', () => {
    expect(skyAsset('liftoff')).toBe('./sky.png');
    expect(skyAsset('unknown')).toBe('./sky.png');
  });

  it('미리 불러올 하늘 에셋 목록에는 기존 하늘과 침투 전용 하늘이 한 번씩 들어간다', () => {
    expect(skyAssetPaths).toEqual(['./sky.png', './sky-infiltration.png']);
  });
});
