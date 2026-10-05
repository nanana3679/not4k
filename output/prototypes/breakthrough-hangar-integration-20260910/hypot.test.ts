import { describe, expect, it } from 'vitest';
import { hypot2 } from './hypot.mjs';

describe('할당 없는 2차원 hypot', () => {
  it('±0·±1·1e-300·1e300·5e-324·±Infinity·NaN의 모든 쌍에서 Math.hypot과 같은 값(-0·NaN 구분 포함)이다', () => {
    const values = [0, -0, 1, -1, 1e-300, -1e-300, 1e300, 5e-324, Infinity, -Infinity, NaN, .1, 3, 4, 2 ** 52];
    for (const a of values) for (const b of values) expect(Object.is(hypot2(a, b), Math.hypot(a, b)), `${a}, ${b}`).toBe(true);
  });

  it('10^-20~10^20 크기의 무작위 20만 쌍에서 Math.hypot과 비트 단위로 같다', () => {
    let seed = 7;
    const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
    for (let i = 0; i < 200_000; i++) {
      const a = (random() * 2 - 1) * 10 ** (Math.floor(random() * 40) - 20), b = (random() * 2 - 1) * 10 ** (Math.floor(random() * 40) - 20);
      if (!Object.is(hypot2(a, b), Math.hypot(a, b))) expect([a, b, hypot2(a, b)]).toEqual([a, b, Math.hypot(a, b)]);
    }
  });
});
