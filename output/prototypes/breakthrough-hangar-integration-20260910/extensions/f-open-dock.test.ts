import {expect, it} from 'vitest';
import {createBlueprint} from '../modules/f-open-dock.mjs';
import {createExtensionBlueprint} from './f-open-dock.mjs';

type Bounds = {min: number[]; max: number[]};
const bounds = (part: {position: number[]; size: number[]}): Bounds => ({
  min: part.position.map((v, i) => v - part.size[i] / 2),
  max: part.position.map((v, i) => v + part.size[i] / 2),
});
const overlaps = (a: Bounds, b: Bounds) => a.min.every((v, i) => v < b.max[i] && a.max[i] > b.min[i]);
const original = createBlueprint(), extension = createExtensionBlueprint();
const find = (id: string) => extension.boxes.find(part => part.id === id);

it('F의 세 root는 원래 rear·left·right dock과 각 docking lip에 모두 실제로 겹친다', () => {
  for (const side of ['rear', 'left', 'right']) {
    const root = bounds(find(`${side}-dock-root`));
    expect(overlaps(root, original.solids.find(part => part.id === `${side}-dock`).bounds)).toBe(true);
    expect(overlaps(root, bounds(original.boxes.find(part => part.id === `${side}-dock-lip`)))).toBe(true);
  }
});

it('F의 세 벽은 root에서 끊김 없이 6개 표면 구간을 거쳐 y=-640까지 내려간다', () => {
  for (const side of ['rear', 'left', 'right']) {
    const body = extension.boxes.filter(part => part.id.startsWith(`${side}-body-`)).map(bounds);
    expect(body).toHaveLength(6);
    expect(overlaps(bounds(find(`${side}-dock-root`)), body[0])).toBe(true);
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

it('F의 원래 중정 [-15.8,15.8]과 z>-3.9의 입구를 연결부가 막지 않는다', () => {
  for (const part of extension.boxes) expect(overlaps(bounds(part), original.opening)).toBe(false);
});

it('F의 중정은 아래 y=-640까지도 비어 있어 거대한 바닥판이 새로 생기지 않는다', () => {
  const throughOpening = {...original.opening, min: [-15.8, -640, -3.9]};
  for (const part of extension.boxes) expect(overlaps(bounds(part), throughOpening)).toBe(false);
});

it('F의 아래 세 벽은 모든 구간에서 양 모서리가 겹쳐 서로 떨어진 탑 세 개로 분리되지 않는다', () => {
  for (let i = 0; i < 6; i++) {
    const rear = bounds(find(`rear-body-${i}`));
    for (const side of ['left', 'right']) expect(overlaps(rear, bounds(find(`${side}-body-${i}`)))).toBe(true);
  }
});

it('F의 연결부는 깊이 -16.4~16.4 안의 30개 상자이며 추가 조명·난간·그림판이 없다', () => {
  expect(extension.boxes).toHaveLength(30);
  expect(extension.panels).toHaveLength(0);
  expect(extension.beams).toHaveLength(0);
  for (const part of extension.boxes) {
    const b = bounds(part);
    expect(b.min[2]).toBeGreaterThanOrEqual(-16.4);
    expect(b.max[2]).toBeLessThanOrEqual(16.4);
    expect(['hull', 'under']).toContain(part.tone);
  }
});
