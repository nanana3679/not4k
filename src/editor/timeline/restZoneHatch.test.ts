import { describe, expect, it } from 'vitest';
import { diagonalStripeBands } from './restZoneHatch';

const area = (points: number[]) => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    sum += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return Math.abs(sum) / 2;
};

describe('restZone 빗금 띠 (에디터 타임라인)', () => {
  // 띠 폭 10/√2이면 y − x 방향으로 잰 띠 두께가 10, 주기가 20이다.
  const stripe = 10 / Math.SQRT2;

  it('원점 (0,0)·20×20 사각형이면 검정 띠 두 개의 넓이가 50·150으로 합이 사각형의 절반인 200이다', () => {
    const bands = diagonalStripeBands({ x: 0, y: 0, width: 20, height: 20 }, stripe, 0, 0);
    expect(bands.map(area).map(value => Math.round(value * 1e6) / 1e6).sort((a, b) => a - b)).toEqual([50, 150]);
  });

  it('띠의 모든 꼭짓점은 x 30~90·y 100~400 사각형 안에 있다', () => {
    const bands = diagonalStripeBands({ x: 30, y: 100, width: 60, height: 300 }, 6, 30, 100);
    expect(bands.length).toBeGreaterThan(10);
    for (const points of bands) {
      for (let i = 0; i < points.length; i += 2) {
        expect(points[i]).toBeGreaterThanOrEqual(30 - 1e-9);
        expect(points[i]).toBeLessThanOrEqual(90 + 1e-9);
        expect(points[i + 1]).toBeGreaterThanOrEqual(100 - 1e-9);
        expect(points[i + 1]).toBeLessThanOrEqual(400 + 1e-9);
      }
    }
  });

  it('원점을 띠 주기(20)만큼 아래로 옮기면 같은 띠가 나온다', () => {
    const rect = { x: 0, y: 0, width: 20, height: 50 };
    expect(diagonalStripeBands(rect, stripe, 0, 20).map(area)).toEqual(diagonalStripeBands(rect, stripe, 0, 0).map(area));
  });

  it('높이 0 사각형이면 띠가 없다', () => {
    expect(diagonalStripeBands({ x: 0, y: 0, width: 60, height: 0 }, 6, 0, 0)).toEqual([]);
  });
});
