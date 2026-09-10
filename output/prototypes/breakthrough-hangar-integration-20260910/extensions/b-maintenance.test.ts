import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/b-maintenance.mjs';
import {createExtensionBlueprint} from './b-maintenance.mjs';

type Bounds = {min: number[]; max: number[]};
const bounds = (box: {position: number[]; size: number[]}): Bounds => ({
  min: box.position.map((v, i) => v - box.size[i] / 2),
  max: box.position.map((v, i) => v + box.size[i] / 2),
});
const intersects = (a: Bounds, b: Bounds, epsilon = 0) =>
  a.min.every((v, i) => v <= b.max[i] + epsilon && a.max[i] >= b.min[i] - epsilon);
const extension = createExtensionBlueprint();
const original = createBlueprint();
const socket = bounds(extension.boxes.find(b => b.id === 'mounting-root-socket'));

it('B의 mounting-root와 새 연결부가 세 축에서 겹치고 두 사선 지지대의 시작점도 연결부 안에 있다', () => {
  const root = bounds(original.boxes.find(b => b.id === 'mounting-root'));
  for (let axis = 0; axis < 3; axis++) {
    expect(Math.min(socket.max[axis], root.max[axis]) - Math.max(socket.min[axis], root.min[axis])).toBeGreaterThan(0);
  }
  const braces = original.beams.filter(b => b.id.startsWith('support-'));
  expect(braces).toHaveLength(2);
  for (const beam of braces) {
    expect(beam.start.every((v, i) => v > socket.min[i] && v < socket.max[i])).toBe(true);
  }
});

it('B의 비대칭 설비 몸통까지 mounting-root부터 맞닿아 독립적으로 떠 있는 부분이 없다', () => {
  const parts = extension.boxes.map(bounds);
  const connected = new Set([0]);
  for (let pass = 0; pass < parts.length; pass++) {
    parts.forEach((part, index) => {
      if ([...connected].some(other => intersects(part, parts[other], 1e-7))) connected.add(index);
    });
  }
  expect(connected.size).toBe(parts.length);
});

it('B의 앞 기둥과 뒤로 비켜난 설비 몸통은 각각 y=-640까지 끊김 없이 이어진다', () => {
  for (const prefix of ['deck-service-shaft-', 'offset-equipment-body-']) {
    const parts = extension.boxes.filter(b => b.id.startsWith(prefix)).map(bounds).sort((a, b) => b.max[1] - a.max[1]);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.at(-1)!.min[1]).toBe(-640);
    for (let i = 1; i < parts.length; i++) expect(parts[i].max[1]).toBeCloseTo(parts[i - 1].min[1]);
  }
});

it('B의 ㄱ자 열린 모서리 x=5.1~15.5·z=-1.4~5.5는 연결 몸통을 아래로 늘려도 비어 있다', () => {
  const corner = original.openCorner;
  for (const part of extension.boxes) {
    const b = bounds(part);
    const crossesX = b.min[0] < corner.x[1] && b.max[0] > corner.x[0];
    const crossesZ = b.min[2] < corner.z[1] && b.max[2] > corner.z[0];
    expect(crossesX && crossesZ).toBe(false);
  }
});

it('B의 연결부 최고점은 데크 바닥보다 낮아 정비실 문·창과 두 데크 날개를 가리지 않는다', () => {
  const maxY = Math.max(...extension.boxes.map(b => bounds(b).max[1]));
  const decks = original.boxes.filter(b => b.id.startsWith('deck-') && b.id.endsWith('-arm'));
  expect(decks).toHaveLength(2);
  expect(original.panels).toHaveLength(2);
  for (const deck of decks) expect(maxY).toBeLessThan(bounds(deck).min[1]);
  for (const panel of original.panels) expect(maxY).toBeLessThan(Math.min(...panel.points.map(p => p[1])));
});

it('B의 비대칭 몸통 전체는 z=-55~20 안에 있어 원래 안개와 재사용 깊이를 침범하지 않는다', () => {
  for (const part of extension.boxes) {
    expect(bounds(part).min[2]).toBeGreaterThanOrEqual(-55);
    expect(bounds(part).max[2]).toBeLessThanOrEqual(20);
  }
});
