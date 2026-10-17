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

/** 볼록 다각형(평탄한 좌표 배열) 안에 점이 있는지. 띠는 볼록이라 모든 변에 대해 같은 쪽이면 안이다. */
const insidePolygon = (points: number[], px: number, py: number) => {
  let sign = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    const cross = (points[j] - points[i]) * (py - points[i + 1]) - (points[j + 1] - points[i + 1]) * (px - points[i]);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
};
const covered = (bands: number[][], px: number, py: number) => bands.some(points => insidePolygon(points, px, py));
const vertexSet = (points: number[]) => {
  const keys = new Set<string>();
  for (let i = 0; i < points.length; i += 2) keys.add(`${Math.round(points[i] * 1e6) / 1e6},${Math.round(points[i + 1] * 1e6) / 1e6}`);
  return [...keys].sort();
};

describe('restZone 빗금 띠 (에디터 타임라인)', () => {
  // 띠 폭 10/√2이면 y − x 방향으로 잰 띠 두께가 10, 주기가 20이다.
  const stripe = 10 / Math.SQRT2;

  it('원점 (0,0)·20×20 사각형이면 검정 띠 두 개의 넓이가 50·150으로 합이 사각형의 절반인 200이다', () => {
    const bands = diagonalStripeBands({ x: 0, y: 0, width: 20, height: 20 }, stripe, 0, 0);
    expect(bands.map(area).map(value => Math.round(value * 1e6) / 1e6).sort((a, b) => a - b)).toEqual([50, 150]);
  });

  it('원점 (0,0)·20×20 사각형에서 넓이 50인 띠는 꼭짓점 (10,0)·(20,0)·(20,10)의 오른쪽 위 삼각형이라 빗금이 왼쪽 위 → 오른쪽 아래(\\) 방향이다', () => {
    const bands = diagonalStripeBands({ x: 0, y: 0, width: 20, height: 20 }, stripe, 0, 0);
    const small = bands.find(points => Math.abs(area(points) - 50) < 1e-6);
    expect(small && vertexSet(small)).toEqual(['10,0', '20,0', '20,10']);
  });

  it('같은 20×20 사각형이라도 원점을 (0,0) → (0,10)으로 옮기면 점 (19,1)이 검정 띠 안에서 밖으로 바뀐다', () => {
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    expect(covered(diagonalStripeBands(rect, stripe, 0, 0), 19, 1)).toBe(true);
    expect(covered(diagonalStripeBands(rect, stripe, 0, 10), 19, 1)).toBe(false);
  });

  it('원점 (30,400)이 같은 긴 구간을 위끝 y 137·y 220에서 각각 잘라 그려도 겹치는 y 220~300의 빗금이 같다', () => {
    // 스크롤로 보이는 범위가 바뀌어 다시 그려도 빗금이 튀지 않는다.
    const a = diagonalStripeBands({ x: 30, y: 137, width: 60, height: 163 }, 6, 30, 400);
    const b = diagonalStripeBands({ x: 30, y: 220, width: 60, height: 180 }, 6, 30, 400);
    let samples = 0;
    let black = 0;
    for (let px = 30.37; px < 90; px += 1.13) {
      for (let py = 220.29; py < 300; py += 1.07) {
        const inA = covered(a, px, py);
        expect(covered(b, px, py)).toBe(inA);
        samples++;
        if (inA) black++;
      }
    }
    // 띠와 띠 사이 간격이 같은 폭이라 검정은 대략 절반이다.
    expect(black / samples).toBeGreaterThan(0.4);
    expect(black / samples).toBeLessThan(0.6);
  });

  it('띠 폭 6·원점이 사각형 왼쪽 위인 x 30~90·y 100~400 사각형을 자르면 띠 꼭짓점이 모두 그 사각형 안에 있다', () => {
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

  it('높이 0 사각형이면 띠가 없다', () => {
    expect(diagonalStripeBands({ x: 0, y: 0, width: 60, height: 0 }, 6, 0, 0)).toEqual([]);
  });
});
