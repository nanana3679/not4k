import {beforeAll, expect, it} from 'vitest';
import * as THREE from './vendor/three.module.js';
import {createSurroundings} from './surroundings.mjs';
import {createModelLibrary} from './model-library.mjs';
import {MODEL_IDS, TEXTURES, readSettings, scenePyramid, buildingPose, travelAt, progressForDepth} from './integration.mjs';

let space, models;
beforeAll(() => {
  const textures = Object.fromEntries(TEXTURES.map(id => [id, new THREE.Texture()]));
  space = createSurroundings(textures);
  models = createModelLibrary(textures);
});

function place(id, altitude = 0, buildingSize = 100, depth = 160, extra = '') {
  const params = new URLSearchParams(`module=${id}&extensions=1&altitude=${altitude}&buildingSize=${buildingSize}`);
  for (const [key, value] of new URLSearchParams(extra)) params.set(key, value);
  const state = readSettings(params.toString());
  const pyramid = scenePyramid(state), travel = travelAt(progressForDepth(depth), pyramid);
  const model = models.get(id), pose = buildingPose(state, pyramid, travel, model.dimensions);
  model.group.position.set(pose.center[0] - model.center.x * pose.scale, pose.center[1] - model.center.y * pose.scale, -pose.center[2] - model.center.z * pose.scale);
  model.group.scale.setScalar(pose.scale);
  space.update(state, pyramid, travel, model);
  return model;
}

it('A→H→A 전환 시 해당 연결부 하나만 표시하고 8개 연결부를 다시 생성하지 않는다', () => {
  const ids = space.snapshot().extensionIds;
  expect(Object.keys(ids)).toEqual(MODEL_IDS);
  for (const id of [...MODEL_IDS, 'A']) {
    place(id);
    expect(space.snapshot()).toMatchObject({visibleExtensions: [id], extensionModule: id, extensionId: ids[id], extensionIds: ids});
  }
});

it('8종×고도0·50·100%×크기50·100·180%×깊이1100·160·44에서 연결부가 본체와 같은 변환을 유지한다', () => {
  const extensionIds = space.snapshot().extensionIds;
  for (const id of MODEL_IDS) {
    const originalGeometry = models.get(id).group.children.map(o => o.geometry.uuid);
    const extensionGeometry = space.extensions.get(id).group.children.map(o => o.geometry.uuid);
    for (const altitude of [0, .5, 1]) for (const size of [50, 100, 180]) for (const depth of [1100, 160, 44]) {
      const model = place(id, altitude, size, depth), extension = space.extension;
      model.group.updateMatrix();extension.group.updateMatrix();
      expect(extension.group.matrix.elements).toEqual(model.group.matrix.elements);
      expect(model.group.children.map(o => o.geometry.uuid)).toEqual(originalGeometry);
      expect(extension.group.children.map(o => o.geometry.uuid)).toEqual(extensionGeometry);
    }
  }
  expect(space.snapshot().extensionIds).toEqual(extensionIds);
});

it('8종의 연결부는 크기180%에서도 출발깊이1600에서 안개1400 너머이며 회수깊이-400에서는 시점 뒤다', () => {
  for (const id of MODEL_IDS) {
    const bounds = space.extensions.get(id).bounds, center = models.get(id).center;
    expect(1600 - (bounds.max.z - center.z) * 1.8 + 8, id).toBeGreaterThan(1400);
    expect(-400 - (bounds.min.z - center.z) * 1.8, id).toBeLessThan(-8);
  }
});

it('A·B·C·D·F·G·H의 추가 몸통은 아래로640 이상 이어지고 원래 모델 높이는 바뀌지 않는다', () => {
  const heights = {A: 11.6, B: 10.26, C: 20.9, D: 8.66, F: 38.51, G: 24.56, H: 48.94};
  for (const [id, height] of Object.entries(heights)) {
    expect(space.extensions.get(id).bounds.min.y, id).toBeLessThanOrEqual(-640 + 1e-8);
    expect(models.get(id).dimensions[1], id).toBeCloseTo(height, 2);
  }
});

it('8종 모두 건물 숨김과 extensions=0은 연결부를 숨기며 E 주변 건축 설정을 지우지 않는다', () => {
  for (const id of MODEL_IDS) for (const extra of ['building=0', 'extensions=0']) {
    place(id, 0, 100, 160, `surroundings=1&${extra}`);
    expect(space.snapshot().visibleExtensions, id).toEqual([]);
    expect(space.snapshot().farVisible, id).toBe(id === 'E');
  }
});

it('숨겨진 모델까지 표면 그림을 끄고 다시 켜면 같은 텍스처와 geometry를 복원한다', () => {
  place('A');
  const materials = [];
  for (const model of space.extensions.values()) model.group.traverse(o => {
    if (o.isMesh) for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      if (material.map && !materials.some(r => r.material === material)) materials.push({material, map: material.map});
    }
  });
  expect(materials.length).toBeGreaterThan(8);
  const ids = space.snapshot().extensionIds;
  space.setArt(false);place('H');
  expect(materials.every(r => r.material.map === null)).toBe(true);
  space.setArt(true);
  expect(materials.every(r => r.material.map === r.map)).toBe(true);
  expect(space.snapshot().extensionIds).toEqual(ids);
});
