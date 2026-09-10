import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/g-transfer-spine.mjs';
import {createExtensionBlueprint} from './g-transfer-spine.mjs';

type Bounds = {min: number[]; max: number[]};
const bounds = (part: {position: number[]; size: number[]}): Bounds => ({
  min: part.position.map((v, i) => v - part.size[i] / 2),
  max: part.position.map((v, i) => v + part.size[i] / 2),
});
const overlaps = (a: Bounds, b: Bounds) => a.min.every((v, i) => v < b.max[i] && a.max[i] > b.min[i]);
const original = createBlueprint(), extension = createExtensionBlueprint();
const find = (id: string) => extension.boxes.find(part => part.id === id);

it('G의 main root는 terminal-keel에 겹치고 small root는 small-terminal에 겹친다', () => {
  expect(overlaps(bounds(find('main-terminal-root')), bounds(original.boxes.find(part => part.id === 'terminal-keel')))).toBe(true);
  expect(overlaps(bounds(find('small-terminal-root')), original.solids.find(part => part.id === 'small-terminal').bounds)).toBe(true);
});

it('G의 양쪽 terminal 몸통은 root부터 6개 연속 구간으로 각각 y=-640까지 이어진다', () => {
  for (const end of ['main', 'small']) {
    const body = extension.boxes.filter(part => part.id.startsWith(`${end}-body-`)).map(bounds);
    expect(body).toHaveLength(6);
    expect(overlaps(bounds(find(`${end}-terminal-root`)), body[0])).toBe(true);
    for (let i = 1; i < body.length; i++) {
      expect(body[i].max[1]).toBe(body[i - 1].min[1]);
      for (const axis of [0, 2]) {
        expect(body[i].min[axis]).toBe(body[0].min[axis]);
        expect(body[i].max[axis]).toBe(body[0].max[axis]);
      }
    }
    expect(body.at(-1)!.min[1]).toBe(-640);
  }
});

it('G의 openSpan과 그 아래 x=-19.5~30.5의 공간에는 새 기둥이나 벽이 없다', () => {
  const underSpan = {...original.openSpan, min: [-19.5, -640, -100] , max: [30.5, 9.1, 100]};
  for (const part of extension.boxes) {
    expect(overlaps(bounds(part), original.openSpan)).toBe(false);
    expect(overlaps(bounds(part), underSpan)).toBe(false);
  }
});

it('G의 main 몸통 폭18·깊이18과 small 폭7·깊이12는 원래 서로 다른 terminal 크기를 유지한다', () => {
  const main = find('main-body-0'), small = find('small-body-0');
  expect([main.size[0], main.size[2]]).toEqual([18, 18]);
  expect([small.size[0], small.size[2]]).toEqual([7, 12]);
  expect(main.position[0]).toBeLessThan(original.span.from);
  expect(small.position[0]).toBeGreaterThan(original.span.to);
});

it('G의 새 root는 낮은 small-terminal 출입문을 포함해 원래 앞면 그림을 가리지 않는다', () => {
  for (const panel of original.panels) {
    const panelBounds = {min: [0, 1, 2].map(i => Math.min(...panel.points.map(p => p[i]))), max: [0, 1, 2].map(i => Math.max(...panel.points.map(p => p[i])))};
    for (const part of extension.boxes) {
      const b = bounds(part);
      const crossesPainting = [0, 1].every(i => b.min[i] < panelBounds.max[i] && b.max[i] > panelBounds.min[i]);
      if (crossesPainting) expect(b.max[2]).toBeLessThan(panelBounds.min[2]);
    }
  }
});

it('G의 연결부는 깊이 -10~10 안의 20개 상자이며 경간에 새 트러스·조명을 추가하지 않는다', () => {
  expect(extension.boxes).toHaveLength(20);
  expect(extension.panels).toHaveLength(0);
  expect(extension.beams).toHaveLength(0);
  for (const part of extension.boxes) {
    const b = bounds(part);
    expect(b.min[2]).toBeGreaterThanOrEqual(-10);
    expect(b.max[2]).toBeLessThanOrEqual(10);
    expect(['hull', 'under']).toContain(part.tone);
  }
});
