import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/h-logistics-hub.mjs';
import {createExtensionBlueprint} from './h-logistics-hub.mjs';

type Bounds = {min: number[]; max: number[]};
const bounds = (part: {position: number[]; size: number[]}): Bounds => ({
  min: part.position.map((v, i) => v - part.size[i] / 2),
  max: part.position.map((v, i) => v + part.size[i] / 2),
});
const overlaps = (a: Bounds, b: Bounds) => a.min.every((v, i) => v < b.max[i] && a.max[i] > b.min[i]);
const original = createBlueprint(), extension = createExtensionBlueprint();
const find = (id: string) => extension.boxes.find(part => part.id === id);

it('H의 root는 central-hub의 하단 -7과 hub-keel에 모두 겹친다', () => {
  const root = bounds(find('hub-root'));
  expect(root.max[1]).toBe(-5.5);
  expect(overlaps(root, original.solids.find(part => part.id === 'central-hub').bounds)).toBe(true);
  expect(overlaps(root, bounds(original.boxes.find(part => part.id === 'hub-keel')))).toBe(true);
});

it('H의 중앙 몸통은 root와 shoulder에 닿고 6개 연속 구간으로 y=-640까지 이어진다', () => {
  const shoulder = bounds(find('hub-lower-shoulder'));
  expect(overlaps(bounds(find('hub-root')), shoulder)).toBe(true);
  const body = extension.boxes.filter(part => part.id.startsWith('hub-body-')).map(bounds);
  expect(body).toHaveLength(6);
  expect(overlaps(shoulder, body[0])).toBe(true);
  expect(overlaps(bounds(find('hub-root')), body[0])).toBe(true);
  for (let i = 1; i < body.length; i++) {
    expect(body[i].max[1]).toBe(body[i - 1].min[1]);
    for (const axis of [0, 2]) {
      expect(body[i].min[axis]).toBe(body[0].min[axis]);
      expect(body[i].max[axis]).toBe(body[0].max[axis]);
    }
  }
  expect(body.at(-1)!.min[1]).toBe(-640);
});

it('H의 네 cantilever 아래 x=-26·24와 z=-17·21의 빈 공간에 기둥을 세우지 않는다', () => {
  for (const [x, z] of [[-26, 0], [24, 1.5], [6, 21], [0, -17]]) {
    const clearance = {min: [x - .5, -640, z - .5], max: [x + .5, -5.5, z + .5]};
    for (const part of extension.boxes) expect(overlaps(bounds(part), clearance)).toBe(false);
  }
});

it('H의 연결부는 원래 loadingOpening과 모든 창문·출입문보다 아래에 머문다', () => {
  const lowestPanel = Math.min(...original.panels.flatMap(panel => panel.points.map(p => p[1])));
  for (const part of extension.boxes) {
    const b = bounds(part);
    expect(overlaps(b, original.loadingOpening)).toBe(false);
    expect(b.max[1]).toBeLessThan(lowestPanel);
  }
});

it('H의 연결부는 중앙 x=-10~10·z=-11~11 안에만 있어 팔 방향별 개별 지지체가 생기지 않는다', () => {
  for (const part of extension.boxes) {
    const b = bounds(part);
    expect(b.min[0]).toBeGreaterThanOrEqual(-10);
    expect(b.max[0]).toBeLessThanOrEqual(10);
    expect(b.min[2]).toBeGreaterThanOrEqual(-11);
    expect(b.max[2]).toBeLessThanOrEqual(11);
  }
});

it('H의 중앙 연결부는 11개 상자와 기존 hull·under 표면만 쓰고 추가 장식·조명이 없다', () => {
  expect(extension.boxes).toHaveLength(11);
  expect(extension.panels).toHaveLength(0);
  expect(extension.beams).toHaveLength(0);
  expect(extension.boxes.every(part => ['hull', 'under'].includes(part.tone))).toBe(true);
});
