import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/b-maintenance.mjs';
import {createExtensionBlueprint} from './b-maintenance.mjs';
import * as THREE from '../vendor/three.module.js';
import {buildModel} from '../render-model.mjs';

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

it('B의 공용 승강로는 고정부 아래 -6부터 y=-640까지 끊김 없이 이어진다', () => {
  const parts = extension.boxes.filter(b => b.id.startsWith('lift-shaft-')).map(bounds).sort((a, b) => b.max[1] - a.max[1]);
  expect(parts[0].max[1]).toBe(-6);
  expect(parts.at(-1)!.min[1]).toBe(-640);
  for (let i = 1; i < parts.length; i++) expect(parts[i].max[1]).toBeCloseTo(parts[i - 1].min[1]);
});

it('B는 상단 -150 안에 4개 정비층 묶음을 두고 아래 두 서비스층 사이에는 150 이상 간격이 있다', () => {
  const upper = extension.levels.filter(l => l.floorY >= -150);
  expect(new Set(upper.map(l => l.group)).size).toBe(4);
  const lower = extension.levels.filter(l => l.floorY < -150);
  expect(lower).toHaveLength(2);
  expect(Math.abs(lower[0].floorY - lower[1].floorY)).toBeGreaterThan(150);
  for (const y of [-36, -73, -116, -200, -380, -550]) {
    const atHeight = extension.boxes.filter(b => bounds(b).min[1] < y && bounds(b).max[1] > y);
    expect(atHeight.every(b => b.id.startsWith('lift-'))).toBe(true);
    expect(atHeight).not.toHaveLength(0);
  }
});

it('B의 층은 6단위 간격이며 각 작업 데크에는 원래와 같은 높이 2.8의 승강로 출입문이 있다', () => {
  for (const group of new Set(extension.levels.map(l => l.group))) {
    const floors = extension.levels.filter(l => l.group === group).map(l => l.floorY).sort((a, b) => b - a);
    for (let i = 1; i < floors.length; i++) expect(floors[i - 1] - floors[i]).toBe(6);
  }
  for (const level of extension.levels) {
    const door = extension.panels.find(p => p.id === `${level.id}-lift-door`);
    expect(door).toBeDefined();
    expect(Math.max(...door.points.map(p => p[1])) - Math.min(...door.points.map(p => p[1]))).toBeCloseTo(2.8);
    expect(Math.min(...door.points.map(p => p[1]))).toBeCloseTo(bounds(extension.boxes.find(b => b.id === `${level.id}-deck`)).max[1]);
  }
});

it('B의 새 문·창은 첫 층부터 전체 면적이 원본과 추가 실체 밖에 있어 소켓에 일부라도 묻히지 않는다', () => {
  const blockers: {id: string; min: number[]; max: number[]}[] = [];
  for (const [name, blueprint] of [['original', original], ['extension', extension]] as const) {
    const group = buildModel(blueprint, {}).group;
    const panels = new Set(blueprint.panels.map(p => p.id));
    group.updateMatrixWorld(true);
    group.traverse(object => {
      if (!object.isMesh || panels.has(object.name)) return;
      // Actual mesh transforms include the original rotated support beams.
      const b = new THREE.Box3().setFromObject(object);
      blockers.push({id: `${name}/${object.name}`, min: b.min.toArray(), max: b.max.toArray()});
    });
    // A closed prism is a solid, even though the renderer splits its faces into meshes.
    for (const solid of blueprint.solids ?? []) blockers.push({id: `${name}/${solid.id}`, ...solid.bounds});
  }
  const buried: {panel: string; solid: string}[] = [];
  for (const panel of extension.panels) {
    const min = [0, 1, 2].map(i => Math.min(...panel.points.map(p => p[i])));
    const max = [0, 1, 2].map(i => Math.max(...panel.points.map(p => p[i])));
    expect(max[2] - min[2]).toBe(0);
    for (const solid of blockers) {
      const insideDepth = min[2] > solid.min[2] + 1e-6 && min[2] < solid.max[2] - 1e-6;
      const overlapsArea = [0, 1].every(i => Math.min(max[i], solid.max[i]) - Math.max(min[i], solid.min[i]) > 1e-6);
      if (insideDepth && overlapsArea) buried.push({panel: panel.id, solid: solid.id});
    }
  }
  expect(buried).toEqual([]);
});

it('B의 모든 층에는 뒤로 물러난 정비실 앞에 깊이 9 이상 실제 비어 있는 작업 공간이 있다', () => {
  for (const level of extension.levels) {
    expect(level.workArea.max[2] - level.workArea.min[2]).toBeGreaterThan(9);
    expect(extension.boxes.some(part => {
      const b = bounds(part);
      return b.min.every((v, i) => Math.min(b.max[i], level.workArea.max[i]) - Math.max(v, level.workArea.min[i]) > 1e-7);
    }), level.id).toBe(false);
    const deck = bounds(extension.boxes.find(b => b.id === `${level.id}-deck`));
    expect(deck.min[0]).toBeLessThan(level.workArea.min[0]);
    expect(deck.max[0]).toBeGreaterThan(level.workArea.max[0]);
    expect(deck.max[1]).toBeCloseTo(level.workArea.min[1]);
  }
});

it('B의 열린 정비실 내부는 실제 비어 있으며 닫힌 정비실과 함께 배치된다', () => {
  expect(extension.levels.some(l => !l.open)).toBe(true);
  const open = extension.levels.filter(l => l.open);
  expect(open.length).toBeGreaterThan(2);
  for (const level of open) {
    expect(extension.boxes.some(part => {
      const b = bounds(part);
      return b.min.every((v, i) => Math.min(b.max[i], level.interior.max[i]) - Math.max(v, level.interior.min[i]) > 1e-7);
    }), level.id).toBe(false);
    expect(extension.panels.some(p => p.id === `${level.id}-rear-door`)).toBe(true);
  }
});

it('B의 사용층 폭은 서로 다르고 창 조명은 전체 층의 절반보다 적다', () => {
  const decks = extension.boxes.filter(b => b.id.endsWith('-deck'));
  expect(new Set(decks.map(b => b.size[0])).size).toBeGreaterThan(3);
  const windows = extension.panels.filter(p => p.texture === 'window');
  expect(windows.length).toBeGreaterThan(0);
  expect(windows.length).toBeLessThan(extension.levels.length / 2);
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
