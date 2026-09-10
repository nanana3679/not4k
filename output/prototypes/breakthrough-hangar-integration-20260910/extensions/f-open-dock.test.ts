import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/f-open-dock.mjs';
import {createExtensionBlueprint} from './f-open-dock.mjs';

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

it('F의 세 dock root가 원래 dock·lip과 겹치고 모든 층·정비실이 원본까지 연결된다', () => {
  for (const side of ['rear', 'left', 'right']) {
    const root = find(`${side}-dock-root`);
    expect(overlaps(root, original.solids.find(p => p.id === `${side}-dock`).bounds)).toBe(true);
    expect(overlaps(root, bounds(original.boxes.find(p => p.id === `${side}-dock-lip`)))).toBe(true);
  }
  assertConnected();
});
it('F의 외곽 서비스 벽 세 개가 빈 정박층 사이를 끊김 없이 y=-640까지 잇는다', () => {
  for (const side of ['rear', 'left', 'right']) {
    const core = parts.filter(p => p.id.startsWith(`${side}-service-core-`));
    expect(core[0].max[1]).toBe(-7);
    expect(core.at(-1)!.min[1]).toBe(-640);
    for (let i = 1; i < core.length; i++) expect(core[i].max[1]).toBeCloseTo(core[i - 1].min[1]);
  }
});
it('F의 상단 정박층은 4개 2층 묶음이며 층고6과 실제 바닥·천장을 갖춘다', () => {
  const levels = extension.operatingLevels.filter(level => level.use === 'berthing-and-repair');
  expect(levels).toHaveLength(8);
  expect(levels.map(level => level.floor)).toEqual([-18, -24, -54, -60, -94, -100, -134, -140]);
  for (const level of levels) for (const side of ['left', 'right', 'rear']) {
    const deck = find(`${level.id}-${side}-deck`);
    expect(deck.max[1]).toBeCloseTo(level.floor + .4);
    expect(parts.some(p => Math.abs(p.min[1] - (level.floor + 5.6)) < 1e-7 && p.id.endsWith(`${side}-deck`))).toBe(true);
  }
});
it('F의 정박층마다 좌우 정박 공간과 후퇴한 정비실 앞 통로가 실제로 비어 있다', () => {
  for (const {floor} of extension.operatingLevels) {
    clear({min: [-25.8, floor + .5, -3], max: [-16.5, floor + 5.5, 14.5]});
    clear({min: [16.5, floor + .5, -3], max: [25, floor + 5.5, 14.5]});
    clear({min: [-18, floor + .5, -14], max: [-8, floor + 5.5, -4.8]});
  }
});
it('F의 원래 중정 x=-15.8~15.8·z>-3.9는 깊이 -640까지 바닥판 없이 열린다', () => {
  clear(original.opening);
  clear({min: [-15.8, -640, -3.9], max: [15.8, 36, 18]});
});
it('F의 측면 서비스동은 6단위 층고의 방3개와 연결 데크4개로 실제 층을 만든다', () => {
  const rooms = parts.filter(p => p.id.startsWith('service-wing-room-'));
  expect(rooms).toHaveLength(3);
  for (const [i, room] of rooms.entries()) {
    expect(room.min[1]).toBeCloseTo(find(`service-wing-deck-${i}`).max[1]);
    expect(room.max[1]).toBeCloseTo(find(`service-wing-deck-${i + 1}`).min[1]);
    expect(touches(find(`service-wing-deck-${i}`), find('left-service-core-0'))).toBe(true);
  }
});
it('F의 새 창·문은 벽 뒤에 묻히지 않고 모든 출입문 앞 0.3·0.9 지점에 실제 발판과 머리 공간이 있다', () => {
  assertVisiblePanels(); assertDoorLandings();
});
it('F의 아래층은 -278·-470 두 정비층만 두고 -200·-380·-570에는 수직 벽만 남는다', () => {
  expect(extension.operatingLevels.filter(l => l.use === 'deep-maintenance').map(l => l.floor)).toEqual([-278, -470]);
  for (const y of [-200, -380, -570]) expect(parts.filter(p => p.min[1] < y && p.max[1] > y).every(p => p.id.includes('service-core'))).toBe(true);
  expect(Math.min(...parts.map(p => p.min[2]))).toBeGreaterThanOrEqual(-110);
  expect(Math.max(...parts.map(p => p.max[2]))).toBeLessThanOrEqual(40);
  expect(extension.panels.filter(p => p.texture === 'window').length).toBeLessThanOrEqual(8);
});
