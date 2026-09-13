import { describe, expect, it } from 'vitest';
import { skyAsset } from './sky-background.mjs';

describe('난이도별 하늘 배경 선택', () => {
  it('침투는 먹구름 봉쇄 공역 전용 sky-infiltration.png를 사용한다', () => {
    expect(skyAsset('infiltration')).toBe('./sky-infiltration.png');
  });

  it('이륙과 알 수 없는 난이도는 기존 sky.png를 유지한다', () => {
    expect(skyAsset('liftoff')).toBe('./sky.png');
    expect(skyAsset('unknown')).toBe('./sky.png');
  });
});
