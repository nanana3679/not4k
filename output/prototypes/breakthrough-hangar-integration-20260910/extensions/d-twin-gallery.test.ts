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

it('D 후방 두 지지대는 원본 rear-hub의 z=-8 깊이에서 내부로 겹쳐 통로와 연결된다', () => {
  const original = createBlueprint(), extension = createExtensionBlueprint();
  const hub = original.solids.find(p => p.id === original.hub).bounds;
  for (const [side, x] of [['left', -5.5], ['right', 5.5]] as const) {
    const shaft = boundsOfBox(extension.boxes.find(p => p.id === `d-${side}-rear-shaft-0`));
    const witness = [x, 4, -8];
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

it('D 두 후방 지지대는 y=6.8에서 -640까지 이어지고 모든 중간 이음부 양쪽을 칼라가 감싼다', () => {
  const extension = createExtensionBlueprint();
  for (const side of ['left', 'right']) {
    const shaft = extension.boxes.filter(p => p.id.startsWith(`d-${side}-rear-shaft-`));
    expect(shaft).toHaveLength(8);
    expect(boundsOfBox(shaft[0]).max[1]).toBeCloseTo(6.8);
    expect(boundsOfBox(shaft.at(-1)!).min[1]).toBeCloseTo(-640);
    expect(shaft.every(part => part.size[1] <= 81)).toBe(true);
    for (let i = 1; i < shaft.length; i++) {
      expect(boundsOfBox(shaft[i - 1]).min[1]).toBeCloseTo(boundsOfBox(shaft[i]).max[1]);
      const collar = boundsOfBox(extension.boxes.find(p => p.id === `d-${side}-shaft-collar-${i}`));
      expect(overlap(collar, boundsOfBox(shaft[i - 1]))).toBe(true);
      expect(overlap(collar, boundsOfBox(shaft[i]))).toBe(true);
    }
  }
});

it('D 원본 통로 사이 fork의 x=-3.8~3.8·z=-0.8~12 공간에는 연결부의 실제 메시가 들어오지 않는다', () => {
  const {opening} = createBlueprint();
  const empty = new THREE.Box3(new THREE.Vector3(...opening.min), new THREE.Vector3(...opening.max));
  const model = buildModel(createExtensionBlueprint(), {});
  for (const mesh of model.group.children) expect(new THREE.Box3().setFromObject(mesh).intersectsBox(empty)).toBe(false);
});

it('D 네 후방 가로보는 양쪽 지지대와 겹치며 새로운 조명·창문·난간은 추가하지 않는다', () => {
  const extension = createExtensionBlueprint();
  const ties = extension.boxes.filter(p => p.id.startsWith('d-rear-tie-'));
  expect(ties).toHaveLength(4);
  for (const tie of ties) {
    for (const side of ['left', 'right']) {
      const shafts = extension.boxes.filter(p => p.id.startsWith(`d-${side}-rear-shaft-`));
      expect(shafts.some(shaft => overlap(boundsOfBox(tie), boundsOfBox(shaft)))).toBe(true);
    }
  }
  expect(extension.panels).toHaveLength(0);
  expect(extension.boxes.every(part => !['red', 'warm', 'rail'].includes(part.tone))).toBe(true);
});

it('D 연결부의 회전된 귀환 보까지 실제 깊이 -110~40 안에 있어 기존 재사용 경계를 넘지 않는다', () => {
  const bounds = new THREE.Box3().setFromObject(buildModel(createExtensionBlueprint(), {}).group);
  expect(bounds.min.z).toBeGreaterThanOrEqual(-110);
  expect(bounds.max.z).toBeLessThanOrEqual(40);
});
