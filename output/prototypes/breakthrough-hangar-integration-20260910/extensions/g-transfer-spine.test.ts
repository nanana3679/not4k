import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/g-transfer-spine.mjs';
import {createExtensionBlueprint} from './g-transfer-spine.mjs';

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

it('G의 양 root는 원래 keel·small-terminal과 겹치며 모든 환승층·대합실은 원본까지 연결된다', () => {
  expect(overlaps(find('main-terminal-root'), bounds(original.boxes.find(p => p.id === 'terminal-keel')))).toBe(true);
  expect(overlaps(find('small-terminal-root'), original.solids.find(p => p.id === 'small-terminal').bounds)).toBe(true);
  assertConnected();
});
it('G의 큰 terminal과 작은 terminal의 승강벽은 각각 끊김 없이 y=-640까지 이어진다', () => {
  for (const tower of ['main', 'small']) for (const wall of ['outer', 'inner', 'rear']) {
    const core = parts.filter(p => p.id.startsWith(`${tower}-lift-${wall}-`));
    expect(core[0].max[1]).toBe(-10);
    expect(core.at(-1)!.min[1]).toBe(-640);
    for (let i = 1; i < core.length; i++) expect(core[i].max[1]).toBeCloseTo(core[i - 1].min[1]);
  }
});
it('G의 양끝 승강로는 바닥·방이 관통하지 않아 y=-640~-13 전체에서 수직으로 비어 있다', () => {
  clear({min: [-37.7, -640, -7], max: [-35.1, -13, 7.5]});
  clear({min: [35.7, -640, -4.8], max: [37.5, -13, 5.5]});
});
it('G의 각 terminal은 4개 2층 환승 묶음과 6단위 층고의 실제 플랫폼을 갖춘다', () => {
  for (const tower of ['main', 'small']) {
    const levels = extension.operatingLevels.filter(l => l.tower === tower && l.use === 'passenger-transfer');
    expect(levels.map(l => l.floor)).toEqual([-18, -24, -54, -60, -94, -100, -134, -140]);
    for (const level of levels) {
      expect(find(`${level.id}-platform`).max[1]).toBeCloseTo(level.floor + .4);
      expect(parts.some(p => p.id.startsWith(tower) && p.id.endsWith('-platform') && Math.abs(p.min[1] - (level.floor + 5.6)) < 1e-7)).toBe(true);
    }
  }
  expect(find('main-transfer-0-0-platform').max[0] - find('main-transfer-0-0-platform').min[0]).toBeGreaterThan(3 * (find('small-transfer-0-0-platform').max[0] - find('small-transfer-0-0-platform').min[0]));
});
it('G의 모든 환승층 앞은 벽·대합실 대신 사람이 서 있을 수 있는 빈 부피로 남는다', () => {
  for (const {floor, tower} of extension.operatingLevels) {
    if (tower === 'main') clear({min: [-32.8, floor + .5, -5.8], max: [-21, floor + 5.5, 10]});
    else clear({min: [31.6, floor + .5, -4.8], max: [33.7, floor + 5.5, 8]});
  }
});
it('G의 원래 openSpan과 그 아래 x=-19.5~30.5에는 새 벽·층·기둥을 세우지 않는다', () => {
  clear(original.openSpan);
  clear({min: [-19.5, -640, -100], max: [30.5, 9.1, 100]});
});
it('G의 대합실 문·작은 terminal 문 위 창은 승강벽에 묻히지 않고 출입문 앞에 실제 플랫폼이 있다', () => {
  assertVisiblePanels(); assertDoorLandings();
  for (const panel of original.panels) for (const p of panel.points) expect(parts.some(b => contains(b, p))).toBe(false);
});
it('G의 -300·-508만 드문 하부 정비층이며 깊이 -110~40을 지키고 창은 4개만 점등한다', () => {
  for (const tower of ['main', 'small']) expect(extension.operatingLevels.filter(l => l.tower === tower && l.use === 'lift-service').map(l => l.floor)).toEqual([-300, -508]);
  for (const y of [-210, -410, -590]) expect(parts.filter(p => p.min[1] < y && p.max[1] > y).every(p => p.id.includes('-lift-'))).toBe(true);
  expect(Math.min(...parts.map(p => p.min[2]))).toBeGreaterThanOrEqual(-110);
  expect(Math.max(...parts.map(p => p.max[2]))).toBeLessThanOrEqual(40);
  expect(extension.panels.filter(p => p.texture === 'window')).toHaveLength(4);
});
