import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/h-logistics-hub.mjs';
import {createExtensionBlueprint} from './h-logistics-hub.mjs';

type Bounds = {min: number[]; max: number[]};
const bounds = (part: {position: number[]; size: number[]}): Bounds => ({
  min: part.position.map((v, i) => v - part.size[i] / 2),
  max: part.position.map((v, i) => v + part.size[i] / 2),
});
const overlaps = (a: Bounds, b: Bounds) => a.min.every((v, i) => v < b.max[i] - 1e-7 && a.max[i] > b.min[i] + 1e-7);
const touches = (a: Bounds, b: Bounds) => a.min.every((v, i) => v <= b.max[i] + 1e-7 && a.max[i] >= b.min[i] - 1e-7);
const contains = (b: Bounds, p: number[]) => p.every((v, i) => v > b.min[i] + 1e-7 && v < b.max[i] - 1e-7);
const original = createBlueprint(), extension = createExtensionBlueprint();
const parts = extension.boxes.map(p => ({id: p.id, ...bounds(p)}));
const find = (id: string) => parts.find(p => p.id === id)!;
const originalParts = [...original.boxes.map(bounds), ...original.solids.map(p => p.bounds)];
const clear = (volume: Bounds) => expect(parts.filter(p => overlaps(p, volume)).map(p => p.id)).toEqual([]);
function assertConnected() {
  const reached = [...originalParts], remaining = new Set(parts);
  for (let round = 0; round <= parts.length && remaining.size; round++) {
    for (const part of remaining) if (reached.some(r => touches(r, part))) {
      reached.push(part); remaining.delete(part);
    }
  }
  expect([...remaining].map(p => p.id)).toEqual([]);
}
function normal(panel) {
  const a = panel.points[1].map((v, i) => v - panel.points[0][i]);
  const b = panel.points[2].map((v, i) => v - panel.points[0][i]);
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const size = Math.hypot(...n); return n.map(v => v / size);
}
function assertVisiblePanels() {
  for (const panel of extension.panels) {
    const center = [0, 1, 2].map(i => panel.points.reduce((sum, p) => sum + p[i], 0) / 4);
    const n = normal(panel), axis = n.findIndex(v => Math.abs(v) > .5);
    for (const p of [center, ...panel.points]) {
      expect([...parts, ...originalParts].some(b => contains(b, p)), panel.id).toBe(false);
      const blockers = [...parts, ...originalParts].filter(b =>
        [0, 1, 2].filter(i => i !== axis).every(i => p[i] > b.min[i] + 1e-7 && p[i] < b.max[i] - 1e-7)
        && (n[axis] > 0 ? b.max[axis] > p[axis] : b.min[axis] < p[axis]));
      expect(blockers, panel.id).toEqual([]);
    }
  }
}
function assertDoorLandings() {
  const decks = extension.boxes.filter(p => p.size[1] <= 1.1).map(bounds);
  for (const door of extension.panels.filter(p => p.texture === 'door')) {
    const bottom = door.points[0].map((v, i) => (v + door.points[1][i]) / 2), n = normal(door);
    for (const distance of [.3, .9]) {
      const foot = bottom.map((v, i) => v + n[i] * distance); foot[1] -= .05;
      expect(decks.some(deck => contains(deck, foot)), door.id).toBe(true);
      const head = [...foot]; head[1] += 1.5;
      expect(parts.some(part => contains(part, head)), door.id).toBe(false);
    }
  }
}

it('H의 root는 central-hub·hub-keel과 겹치고 모든 적재층·저장실이 중앙 승강부를 통해 원본에 연결된다', () => {
  expect(overlaps(find('hub-root'), original.solids.find(p => p.id === 'central-hub').bounds)).toBe(true);
  expect(overlaps(find('hub-root'), bounds(original.boxes.find(p => p.id === 'hub-keel')))).toBe(true);
  assertConnected();
});
it('H의 승강로 뒤벽과 양 가이드는 y=-20부터 -640까지 끊김 없이 이어진다', () => {
  for (const side of ['back', 'left-guide', 'right-guide']) {
    const core = parts.filter(p => p.id.startsWith(`${side}-freight-core-`));
    expect(core[0].max[1]).toBeCloseTo(-20);
    expect(core.at(-1)!.min[1]).toBe(-640);
    for (let i = 1; i < core.length; i++) expect(core[i].max[1]).toBeCloseTo(core[i - 1].min[1]);
  }
});
it('H의 중앙 화물 승강 공간 x=-6.5~6.5·z=-6.5~5는 -640~-24 전체에서 관통한다', () => {
  clear({min: [-6.5, -640, -6.5], max: [6.5, -24, 5]});
});
it('H의 상단 4개 적재층 묶음은 서·동·앞·뒤로 엇갈리며 각각 6단위 층고의 2층이다', () => {
  const levels = extension.operatingLevels.filter(l => l.use === 'loading-and-storage');
  expect(levels.map(l => l.direction)).toEqual(['west', 'west', 'east', 'east', 'front', 'front', 'rear', 'rear']);
  expect(levels.map(l => l.floor)).toEqual([-28, -34, -64, -70, -104, -110, -140, -146]);
  for (const level of levels) {
    expect(find(`${level.id}-loading-deck`).max[1]).toBeCloseTo(level.floor + .4);
    const room = find(`${level.id}-storage-room`);
    expect(room.min[1]).toBeCloseTo(level.floor + .4);
    expect(room.max[1]).toBeCloseTo(level.floor + 5.6);
    expect(parts.some(p => p.id.endsWith('-loading-deck') && Math.abs(p.min[1] - room.max[1]) < 1e-7)).toBe(true);
  }
});
it('H의 각 적재층에는 저장실을 피해 서 있는 공간이 있으며 후면층은 승강로 옆으로 돌아 연결된다', () => {
  for (const {floor, direction} of extension.operatingLevels) {
    const area = {
      west: [[-13.5, -6], [-7.2, 4.5]], east: [[7.2, -6], [12.5, 4.5]],
      front: [[-1.5, 10], [6.5, 18.5]], rear: [[9.5, -20], [10.8, 9.5]],
    }[direction];
    clear({min: [area[0][0], floor + .5, area[0][1]], max: [area[1][0], floor + 5.5, area[1][1]]});
    if (direction === 'rear') {
      expect(parts.some(p => p.id.endsWith('-return-walk') && Math.abs(p.max[1] - floor - .4) < 1e-7)).toBe(true);
      expect(parts.some(p => p.id.endsWith('-lift-landing') && Math.abs(p.max[1] - floor - .4) < 1e-7)).toBe(true);
    }
  }
});
it('H의 원래 loadingOpening과 양팔 끝 x=-26·24 아래에는 새로운 기둥이나 벽이 없다', () => {
  clear(original.loadingOpening);
  for (const x of [-26, 24]) clear({min: [x - .5, -640, -.5], max: [x + .5, -5.5, .5]});
  for (const y of [-200, -400, -570]) expect(parts.filter(p => p.min[1] < y && p.max[1] > y).every(p => p.id.includes('freight-core'))).toBe(true);
});
it('H의 앞 저장실 문은 오른쪽 열린 데크로 나가며 모든 새 문·창 앞이 벽에 가리지 않는다', () => {
  const frontDoors = extension.panels.filter(p => p.id.startsWith('freight-2-') && p.texture === 'door');
  expect(frontDoors).toHaveLength(2);
  for (const door of frontDoors) expect(normal(door)).toEqual([1, 0, 0]);
  assertVisiblePanels(); assertDoorLandings();
});
it('H의 깊은 적재 정류장은 -286·-492뿐이며 깊이 -110~40 안에서 창 2개만 점등한다', () => {
  expect(extension.operatingLevels.filter(l => l.use === 'deep-cargo-transfer').map(l => l.floor)).toEqual([-286, -492]);
  expect(Math.min(...parts.map(p => p.min[2]))).toBeGreaterThanOrEqual(-110);
  expect(Math.max(...parts.map(p => p.max[2]))).toBeLessThanOrEqual(40);
  expect(extension.panels.filter(p => p.texture === 'window')).toHaveLength(2);
});
