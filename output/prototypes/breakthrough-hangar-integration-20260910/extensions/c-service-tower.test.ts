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
    const collar = boundsOfBox(extension.boxes.find(p => p.id === `c-service-collar-${i}`));
    expect(overlap(collar, boundsOfBox(shaft[i - 1]))).toBe(true);
    expect(overlap(collar, boundsOfBox(shaft[i]))).toBe(true);
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

it('C 연결부 전체는 깊이 -110~40 안에 있고 새 조명이나 난간을 만들지 않는다', () => {
  const extension = createExtensionBlueprint();
  const bounds = new THREE.Box3().setFromObject(buildModel(extension, {}).group);
  expect(bounds.min.z).toBeGreaterThanOrEqual(-110);
  expect(bounds.max.z).toBeLessThanOrEqual(40);
  expect(extension.panels).toHaveLength(0);
  expect(extension.beams).toHaveLength(0);
  expect(extension.boxes.every(part => !['red', 'warm', 'rail'].includes(part.tone))).toBe(true);
});
