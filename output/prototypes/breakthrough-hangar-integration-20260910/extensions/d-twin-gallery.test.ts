import {expect, it} from 'vitest';
import * as THREE from '../vendor/three.module.js';
import {createBlueprint} from '../modules/d-twin-gallery.mjs';
import {buildModel} from '../render-model.mjs';
import {createExtensionBlueprint} from './d-twin-gallery.mjs';

type Bounds = {min: number[]; max: number[]};
const boundsOfBox = (part: {position: number[]; size: number[]}): Bounds => ({
  min: part.position.map((v, i) => v - part.size[i] / 2),
  max: part.position.map((v, i) => v + part.size[i] / 2),
});
const overlap = (a: Bounds, b: Bounds) => a.min.every((v, i) => v < b.max[i] && a.max[i] > b.min[i]);
const contains = (b: Bounds, p: number[]) => p.every((v, i) => v > b.min[i] && v < b.max[i]);

it('D 후방 두 지지대는 원본 rear-hub의 z=-8.25 깊이에서 내부로 겹쳐 통로와 연결된다', () => {
  const original = createBlueprint(), extension = createExtensionBlueprint();
  const hub = original.solids.find(p => p.id === original.hub).bounds;
  for (const [side, x] of [['left', -5.5], ['right', 5.5]] as const) {
    const shaft = boundsOfBox(extension.boxes.find(p => p.id === `d-${side}-rear-shaft-0`));
    const witness = [x, 4, -8.25];
    expect(contains(hub, witness)).toBe(true);
    expect(contains(shaft, witness)).toBe(true);
  }
});

it('D 원본 두 hub-leg의 y=-0.6 끝점은 소켓과 겹치고 귀환 보는 그 소켓에서 후방 지지대로 이어진다', () => {
  const original = createBlueprint(), extension = createExtensionBlueprint();
  for (const [side, x] of [['left', -5.5], ['right', 5.5]] as const) {
    const leg = original.beams.find(p => p.id === `hub-leg-${x}`);
    const socket = boundsOfBox(extension.boxes.find(p => p.id === `d-${side}-leg-socket`));
    const returning = extension.beams.find(p => p.id === `d-${side}-leg-return`);
    const shaft = boundsOfBox(extension.boxes.find(p => p.id === `d-${side}-rear-shaft-0`));
    expect(contains(socket, leg.start)).toBe(true);
    expect(returning.start).toEqual(leg.start);
    expect(contains(shaft, returning.end)).toBe(true);
  }
});

it('D 두 후방 지지대는 y=6.8에서 -640까지 이어지고 중간 표면 구간에 틈이 없다', () => {
  const extension = createExtensionBlueprint();
  for (const side of ['left', 'right']) {
    const shaft = extension.boxes.filter(p => p.id.startsWith(`d-${side}-rear-shaft-`));
    expect(shaft).toHaveLength(8);
    expect(boundsOfBox(shaft[0]).max[1]).toBeCloseTo(6.8);
    expect(boundsOfBox(shaft.at(-1)!).min[1]).toBeCloseTo(-640);
    expect(shaft.every(part => part.size[1] <= 81)).toBe(true);
    for (let i = 1; i < shaft.length; i++) {
      expect(boundsOfBox(shaft[i - 1]).min[1]).toBeCloseTo(boundsOfBox(shaft[i]).max[1]);
    }
  }
});

it('D 원본 통로 사이 fork의 x=-3.8~3.8·z=-0.8~12 공간에는 연결부의 실제 메시가 들어오지 않는다', () => {
  const {opening} = createBlueprint();
  const empty = new THREE.Box3(new THREE.Vector3(...opening.min), new THREE.Vector3(...opening.max));
  const model = buildModel(createExtensionBlueprint(), {});
  for (const mesh of model.group.children) expect(new THREE.Box3().setFromObject(mesh).intersectsBox(empty)).toBe(false);
});

it('D 6묶음의 앞 통로는 양 축에 붙고 뒤 통로는 운용실과 반환 발판을 통해 양 축으로 이어진다', () => {
  const extension = createExtensionBlueprint();
  for (let i = 0; i < 6; i++) {
    const part = suffix => boundsOfBox(extension.boxes.find(p => p.id === `d-level-${i}-${suffix}`));
    const front = part('front-gallery'), rear = part('rear-gallery');
    for (const side of ['left', 'right']) {
      const shafts = extension.boxes.filter(p => p.id.startsWith(`d-${side}-rear-shaft-`)).map(boundsOfBox);
      expect(shafts.some(shaft => overlap(front, shaft))).toBe(true);
      const connection = part((i % 2 === 0) === (side === 'left') ? 'room-floor-1' : 'return-landing');
      expect(overlap(rear, connection)).toBe(true);
      expect(shafts.some(shaft => overlap(shaft, connection))).toBe(true);
    }
  }
});

it('D 연결부의 메시 좌표는 유한하고 회전된 귀환 보까지 깊이 -110~40 안에 있다', () => {
  const model = buildModel(createExtensionBlueprint(), {});
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.z).toBeGreaterThanOrEqual(-110);
  expect(bounds.max.z).toBeLessThanOrEqual(40);
  model.group.traverse(mesh => {
    if (mesh.geometry) expect(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
    expect(mesh.position.toArray().every(Number.isFinite)).toBe(true);
    expect(mesh.scale.toArray().every(Number.isFinite)).toBe(true);
  });
});

it('D 운용실의 두 사용층은 층고 6이고 문 높이 2.8이며 바닥·뒷벽·측벽이 서로 연결된다', () => {
  const extension = createExtensionBlueprint();
  for (let i = 0; i < 6; i++) {
    const floors = extension.boxes.filter(p => p.id.startsWith(`d-level-${i}-room-floor-`));
    expect(floors).toHaveLength(3);
    expect(floors[1].position[1] - floors[0].position[1]).toBe(6);
    expect(floors[2].position[1] - floors[1].position[1]).toBe(6);
    const door = extension.panels.find(p => p.id === `d-level-${i}-operations-door`);
    expect(door.points[2][1] - door.points[0][1]).toBeCloseTo(2.8);
    for (const suffix of ['room-rear-wall', 'room-outer-wall']) {
      const wall = boundsOfBox(extension.boxes.find(p => p.id === `d-level-${i}-${suffix}`));
      expect(floors.every(floor => overlap(boundsOfBox(floor), wall))).toBe(true);
    }
  }
});

it('D 앞 통로와 뒤 통로는 층마다 z=-8.5/-20으로 엇갈리고 운용실은 좌우로 번갈아 물러난다', () => {
  const extension = createExtensionBlueprint();
  for (let i = 0; i < 6; i++) {
    const front = extension.boxes.find(p => p.id === `d-level-${i}-front-gallery`);
    const rear = extension.boxes.find(p => p.id === `d-level-${i}-rear-gallery`);
    const room = boundsOfBox(extension.boxes.find(p => p.id === `d-level-${i}-room-floor-0`));
    expect(front.position[2]).toBe(-8.5);
    expect(rear.position[2]).toBe(-20);
    expect(rear.position[1] - front.position[1]).toBe(6);
    expect(room.max[2]).toBeLessThan(front.position[2]);
    if (i % 2 === 0) expect(room.max[0]).toBeLessThanOrEqual(-4);
    else expect(room.min[0]).toBeGreaterThanOrEqual(4);
  }
});

it('D 두 축 사이의 앞쪽 수직 여백과 운용실 두 층의 열린 앞 공간은 실제 메시로 막히지 않는다', () => {
  const extension = createExtensionBlueprint();
  const model = buildModel(extension, {});
  const meshes = model.group.children.map(mesh => new THREE.Box3().setFromObject(mesh));
  for (let i = 0; i < 6; i++) {
    const base = extension.boxes.find(p => p.id === `d-level-${i}-front-gallery`).position[1];
    for (const height of [3, 9]) {
      for (const point of [[0, base + height, -12], [i % 2 === 0 ? -10 : 10, base + height, -16]]) {
        expect(meshes.some(bounds => bounds.containsPoint(new THREE.Vector3(...point)))).toBe(false);
      }
    }
  }
});

it('D 상단 4개 층 묶음과 하부 2개 층 묶음 사이에는 큰 쉼 구간을 남기고 창은 3개만 점등한다', () => {
  const extension = createExtensionBlueprint();
  const bases = extension.boxes.filter(p => /d-level-\d+-front-gallery$/.test(p.id)).map(p => p.position[1]);
  expect(bases.filter(y => y >= -150 && y + 12 <= -10)).toHaveLength(4);
  expect(bases[3] - (bases[4] + 12)).toBeGreaterThan(150);
  expect(bases[4] - (bases[5] + 12)).toBeGreaterThan(150);
  expect(extension.panels.filter(p => p.texture === 'window')).toHaveLength(3);
  expect(extension.boxes.some(p => ['red', 'warm'].includes(p.tone))).toBe(false);
});
