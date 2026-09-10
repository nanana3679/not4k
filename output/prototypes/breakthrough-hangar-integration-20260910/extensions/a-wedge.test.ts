import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/a-wedge.mjs';
import {createExtensionBlueprint} from './a-wedge.mjs';

type Bounds = {min: number[]; max: number[]};
const bounds = (box: {position: number[]; size: number[]}): Bounds => ({
  min: box.position.map((v, i) => v - box.size[i] / 2),
  max: box.position.map((v, i) => v + box.size[i] / 2),
});
const intersects = (a: Bounds, b: Bounds, epsilon = 0) =>
  a.min.every((v, i) => v <= b.max[i] + epsilon && a.max[i] >= b.min[i] - epsilon);
const extension = createExtensionBlueprint();
const original = createBlueprint();
const socket = bounds(extension.boxes.find(b => b.id === 'rear-mount-socket'));

it('A의 rear-mount와 두 brace-foot에 연결 몸통이 겹쳐 대각 지지대 아래가 끊기지 않는다', () => {
  const mounts = original.boxes.filter(b => b.id === 'rear-mount' || b.id.startsWith('brace-foot-'));
  expect(mounts).toHaveLength(3);
  for (const mount of mounts) {
    const b = bounds(mount);
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.min(socket.max[axis], b.max[axis]) - Math.max(socket.min[axis], b.min[axis])).toBeGreaterThan(0);
    }
  }
});

it('A의 연결부 모든 몸통은 원래 고정부부터 맞닿아 떠 있는 별도 덩어리가 없다', () => {
  const parts = extension.boxes.map(bounds);
  const connected = new Set([0]);
  for (let pass = 0; pass < parts.length; pass++) {
    parts.forEach((part, index) => {
      if ([...connected].some(other => intersects(part, parts[other], 1e-7))) connected.add(index);
    });
  }
  expect(connected.size).toBe(parts.length);
});

it('A의 서비스 몸통과 뒤쪽 설비 몸통은 각각 y=-640까지 끊김 없이 이어진다', () => {
  for (const prefix of ['service-tower-', 'rear-equipment-bank-']) {
    const parts = extension.boxes.filter(b => b.id.startsWith(prefix)).map(bounds).sort((a, b) => b.max[1] - a.max[1]);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.at(-1)!.min[1]).toBe(-640);
    for (let i = 1; i < parts.length; i++) expect(parts[i].max[1]).toBeCloseTo(parts[i - 1].min[1]);
  }
});

it('A의 관제 창과 문은 원본 위치 그대로이며 새 몸통이 어느 패널도 덮지 않는다', () => {
  expect(original.panels).toHaveLength(4);
  for (const panel of original.panels) {
    const panelBounds = {
      min: [0, 1, 2].map(i => Math.min(...panel.points.map(p => p[i]))),
      max: [0, 1, 2].map(i => Math.max(...panel.points.map(p => p[i]))),
    };
    expect(extension.boxes.some(b => intersects(bounds(b), panelBounds))).toBe(false);
  }
  expect(extension.boxes.every(b => bounds(b).max[0] <= -1)).toBe(true);
});

it('A의 길게 연장된 몸통도 z=-55~20 안에 있어 원래 안개와 재사용 깊이를 침범하지 않는다', () => {
  for (const part of extension.boxes) {
    expect(bounds(part).min[2]).toBeGreaterThanOrEqual(-55);
    expect(bounds(part).max[2]).toBeLessThanOrEqual(20);
  }
});
