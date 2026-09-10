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

it('A의 공용 승강·설비축은 고정부 아래 -6부터 y=-640까지 끊김 없이 이어진다', () => {
  const parts = extension.boxes.filter(b => b.id.startsWith('service-spine-')).map(bounds).sort((a, b) => b.max[1] - a.max[1]);
  expect(parts[0].max[1]).toBe(-6);
  expect(parts.at(-1)!.min[1]).toBe(-640);
  for (let i = 1; i < parts.length; i++) expect(parts[i].max[1]).toBeCloseTo(parts[i - 1].min[1]);
});

it('A는 상단 -10~-150에 4개 관제층 묶음을 두고 아래 두 서비스층 사이에는 150 이상 쉼 구간을 둔다', () => {
  const upper = extension.levels.filter(l => l.floorY >= -150);
  expect(new Set(upper.map(l => l.group)).size).toBe(4);
  expect(extension.levels.some(l => l.open)).toBe(true);
  expect(extension.levels.some(l => !l.open)).toBe(true);
  const lower = extension.levels.filter(l => l.floorY < -150);
  expect(lower).toHaveLength(2);
  expect(Math.abs(lower[0].floorY - lower[1].floorY)).toBeGreaterThan(150);
  // The long intervals expose a narrow working spine, not a solid wall.
  for (const y of [-40, -75, -120, -200, -380, -550]) {
    const atHeight = extension.boxes.filter(b => bounds(b).min[1] < y && bounds(b).max[1] > y);
    expect(atHeight.every(b => b.id.startsWith('service-spine-'))).toBe(true);
    expect(atHeight).not.toHaveLength(0);
  }
});

it('A의 층 묶음은 층간 6단위와 높이 2.8 문을 사용해 원래 관제실과 사람 크기를 공유한다', () => {
  for (const group of new Set(extension.levels.map(l => l.group))) {
    const floors = extension.levels.filter(l => l.group === group).map(l => l.floorY).sort((a, b) => b - a);
    for (let i = 1; i < floors.length; i++) expect(floors[i - 1] - floors[i]).toBe(6);
  }
  const doors = extension.panels.filter(p => p.texture === 'door');
  expect(doors.length).toBeGreaterThan(3);
  for (const door of doors) expect(Math.max(...door.points.map(p => p[1])) - Math.min(...door.points.map(p => p[1]))).toBeCloseTo(2.8);
});

it('A의 열린 관제층은 안쪽 공간이 실제 비어 있고 정면에서 후벽과 문을 볼 수 있다', () => {
  for (const level of extension.levels.filter(l => l.open)) {
    expect(extension.boxes.some(part => {
      const b = bounds(part);
      return b.min.every((v, i) => Math.min(b.max[i], level.interior.max[i]) - Math.max(v, level.interior.min[i]) > 1e-7);
    }), level.id).toBe(false);
    const x = (level.interior.min[0] + level.interior.max[0]) / 2, y = level.floorY + 2;
    const sightline = extension.boxes.filter(part => {
      const b = bounds(part);
      return x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1];
    }).sort((a, b) => bounds(b).max[2] - bounds(a).max[2]);
    expect(sightline[0].id, level.id).toBe(`${level.id}-rear`);
    const door = extension.panels.find(p => p.id === `${level.id}-rear-door`);
    expect(door).toBeDefined();
    expect(door.points[0][2]).toBeCloseTo(bounds(sightline[0]).max[2] + .01);
  }
});

it('A의 비대칭 사용층은 공용 축보다 넓고 켜진 창은 전체 층보다 적다', () => {
  const floors = extension.boxes.filter(b => b.id.endsWith('-floor'));
  expect(new Set(floors.map(b => b.size[0])).size).toBeGreaterThan(3);
  expect(floors.every(b => b.size[0] > 4)).toBe(true);
  const windows = extension.panels.filter(p => p.texture === 'window');
  expect(windows.length).toBeGreaterThan(0);
  expect(windows.length).toBeLessThan(extension.levels.length / 2);
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
