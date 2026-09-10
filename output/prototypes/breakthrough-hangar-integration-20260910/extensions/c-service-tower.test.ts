import {expect, it} from 'vitest';
import * as THREE from '../vendor/three.module.js';
import {createBlueprint} from '../modules/c-service-tower.mjs';
import {buildModel} from '../render-model.mjs';
import {createExtensionBlueprint} from './c-service-tower.mjs';

type Bounds = {min: number[]; max: number[]};
const boundsOfBox = (part: {position: number[]; size: number[]}): Bounds => ({
  min: part.position.map((v, i) => v - part.size[i] / 2),
  max: part.position.map((v, i) => v + part.size[i] / 2),
});
const overlap = (a: Bounds, b: Bounds) => a.min.every((v, i) => v < b.max[i] && a.max[i] > b.min[i]);
const contains = (b: Bounds, p: number[]) => p.every((v, i) => v > b.min[i] && v < b.max[i]);

it('C 하부 casing과 backbone의 내부 접점은 새 목 부분 내부에도 있어 본체 아래가 끊기지 않는다', () => {
  const original = createBlueprint(), extension = createExtensionBlueprint();
  const neck = extension.solids.find(p => p.id === 'c-service-neck').bounds;
  const casing = original.solids.find(p => p.id === 'lower-casing').bounds;
  const backbone = boundsOfBox(original.boxes.find(p => p.id === 'backbone'));
  // Both witnesses sit away from the chamfered corners of the original and neck.
  for (const [part, point] of [[casing, [2, .4, 0]], [backbone, [.85, .8, -1.9]]] as const) {
    expect(contains(part, [...point])).toBe(true);
    expect(contains(neck, [...point])).toBe(true);
  }
});

it('C 목 부분과 첫 몸통은 y=-20~-14에서 겹치고 마지막 몸통은 y=-640까지 이어진다', () => {
  const extension = createExtensionBlueprint();
  const shaft = extension.boxes.filter(p => p.id.startsWith('c-service-shaft-'));
  expect(overlap(extension.solids[0].bounds, boundsOfBox(shaft[0]))).toBe(true);
  expect(boundsOfBox(shaft[0]).max[1]).toBe(-14);
  expect(boundsOfBox(shaft.at(-1)!).min[1]).toBe(-640);
  for (let i = 1; i < shaft.length; i++) {
    expect(boundsOfBox(shaft[i - 1]).min[1]).toBeCloseTo(boundsOfBox(shaft[i]).max[1]);
  }
});

it('C의 y=7~11.6 열린 골조 공간은 연결부를 추가해도 실제 메시가 침범하지 않는다', () => {
  const {openShaft} = createBlueprint();
  const opening = new THREE.Box3(
    new THREE.Vector3(openShaft.x[0], openShaft.y[0], openShaft.z[0]),
    new THREE.Vector3(openShaft.x[1], openShaft.y[1], openShaft.z[1]),
  );
  const model = buildModel(createExtensionBlueprint(), {});
  for (const mesh of model.group.children) expect(new THREE.Box3().setFromObject(mesh).intersectsBox(opening)).toBe(false);
});

it('C 연장 몸통의 626 길이는 8개 표면 구간으로 나뉘어 한 구간 높이가 80을 넘지 않는다', () => {
  const shaft = createExtensionBlueprint().boxes.filter(p => p.id.startsWith('c-service-shaft-'));
  expect(shaft).toHaveLength(8);
  expect(shaft.reduce((sum, part) => sum + part.size[1], 0)).toBe(626);
  expect(shaft.every(part => part.size[1] <= 80)).toBe(true);
});

it('C 연결부 전체의 메시 좌표는 유한하고 깊이 -110~40 안에 머문다', () => {
  const extension = createExtensionBlueprint();
  const model = buildModel(extension, {});
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.z).toBeGreaterThanOrEqual(-110);
  expect(bounds.max.z).toBeLessThanOrEqual(40);
  model.group.traverse(mesh => {
    if (mesh.geometry) expect(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
    expect(mesh.position.toArray().every(Number.isFinite)).toBe(true);
    expect(mesh.scale.toArray().every(Number.isFinite)).toBe(true);
  });
});

it('C 점검·장비 베이 6묶음에는 층고 6의 두 사용층과 높이 2.8인 출입문이 있다', () => {
  const extension = createExtensionBlueprint();
  for (let i = 0; i < 6; i++) {
    const floors = extension.boxes.filter(p => p.id.startsWith(`c-bay-${i}-floor-`));
    expect(floors).toHaveLength(3);
    expect(floors[1].position[1] - floors[0].position[1]).toBe(6);
    expect(floors[2].position[1] - floors[1].position[1]).toBe(6);
    const door = extension.panels.find(p => p.id === `c-bay-${i}-service-door`);
    expect(door.points[2][1] - door.points[0][1]).toBeCloseTo(2.8);
    expect(door.points[1][0] - door.points[0][0]).toBeCloseTo(1.6);
    expect(extension.boxes.some(p => p.id === `c-bay-${i}-equipment`)).toBe(true);
  }
});

it('C 각 베이의 바닥·뒤벽·외벽은 실제로 겹쳐 붙고 설비 축 또는 본체 접속부까지 연결된다', () => {
  const extension = createExtensionBlueprint();
  const shafts = extension.boxes.filter(p => p.id.startsWith('c-service-shaft-')).map(boundsOfBox);
  const carriers = [...shafts, extension.solids.find(p => p.id === 'c-service-neck').bounds];
  for (let i = 0; i < 6; i++) {
    const floors = extension.boxes.filter(p => p.id.startsWith(`c-bay-${i}-floor-`)).map(boundsOfBox);
    const walls = ['rear-wall', 'outer-wall'].map(suffix => boundsOfBox(extension.boxes.find(p => p.id === `c-bay-${i}-${suffix}`)));
    for (const floor of floors) {
      expect(carriers.some(carrier => overlap(carrier, floor))).toBe(true);
      expect(walls.every(wall => overlap(wall, floor))).toBe(true);
    }
    const brace = extension.beams.find(p => p.id === `c-bay-${i}-cantilever-brace`);
    expect(shafts.some(shaft => contains(shaft, brace.end))).toBe(true);
    const floor = floors[0];
    expect(brace.start[1]).toBeGreaterThan(floor.min[1]);
    expect(brace.start[1]).toBeLessThan(floor.max[1]);
  }
});

it('C 베이의 앞쪽 두 층 내부는 비어 있어 장비와 뒷벽이 열린 공간 너머로 보인다', () => {
  const extension = createExtensionBlueprint();
  const model = buildModel(extension, {});
  const meshes = model.group.children.map(mesh => new THREE.Box3().setFromObject(mesh));
  for (let i = 0; i < 6; i++) {
    const base = extension.boxes.find(p => p.id === `c-bay-${i}-floor-0`).position[1];
    for (const height of [3, 9]) {
      const interior = new THREE.Vector3(i % 2 === 0 ? -5 : 8, base + height, -.5);
      expect(meshes.some(bounds => bounds.containsPoint(interior))).toBe(false);
    }
  }
});

it('C 네 상단 층 묶음은 -150~-10에 집중되고 하부에는 140 이상 빈 높이와 창 3개만 남긴다', () => {
  const extension = createExtensionBlueprint();
  const bases = extension.boxes.filter(p => /c-bay-\d+-floor-0$/.test(p.id)).map(p => p.position[1]);
  expect(bases.filter(y => y >= -150 && y + 12 <= -10)).toHaveLength(4);
  expect(bases[3] - (bases[4] + 12)).toBeGreaterThanOrEqual(140);
  expect(bases[4] - (bases[5] + 12)).toBeGreaterThanOrEqual(140);
  expect(extension.panels.filter(p => p.texture === 'window')).toHaveLength(3);
  expect(extension.boxes.some(p => ['red', 'warm'].includes(p.tone))).toBe(false);
});
