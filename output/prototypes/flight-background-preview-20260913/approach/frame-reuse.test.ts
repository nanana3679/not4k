import { describe, expect, it } from 'vitest';
import { cameraAt, makeLights, scenarios, visibleLights } from './motion.mjs';
import { liftoffObjectLights, makeRunwayLights, visibleRunwayLights, writeLiftoffLights } from './runway.mjs';
import { projectSurface, projectSurfaceInto, ScreenPolygon, surfaceBounds, trailWidth } from './surface.mjs';
import { proceduralTrailGlowAlpha, proceduralTrailSegments, TrailSegmentFrame } from './procedural-trails.mjs';
import { hexRgb, LightVertexBatch, writeLightFrame } from './gpu-light-batch.mjs';
import { createApproachLightFrames } from './game-light-frame.mjs';
import { VisibleLightFrame } from './visible-light-frame.mjs';
import { heightMode } from './height.mjs';
import { layoutMode } from './flow.mjs';
import { approachSpeed } from '../flight-presets.mjs';

// 버퍼 재사용 전 구현(fcc4086)으로 같은 입력을 계산해 기록한 값과 비교한다.
// 그림을 일부러 바꾸는 변경이라면 실패 메시지의 새 값으로 기준값을 갱신한다.
class Hash {
  h1 = 0x811c9dc5;
  h2 = (0x01000193 ^ 0x5bd1e995) >>> 0;
  f32(values: Float32Array, count: number) {
    const bytes = new Uint8Array(values.buffer, values.byteOffset, count * 4);
    for (const b of bytes) {
      this.h1 = Math.imul(this.h1 ^ b, 16777619) >>> 0;
      this.h2 = Math.imul(this.h2 ^ b, 0x5bd1e995) >>> 0;
      this.h2 = (this.h2 ^ (this.h2 >>> 13)) >>> 0;
    }
  }
  hex() { return this.h1.toString(16).padStart(8, '0') + this.h2.toString(16).padStart(8, '0'); }
}

// 고도·프레임 간격을 바꿔 가며 57프레임: 정지 1, 60fps 고고도 12, 144fps 중고도 20, 20fps 저고도 6, 지면 10, 120fps 이륙 고도 8.
const sequence: [number, number][] = [];
for (const [altitude, dt, count] of [[1, 0, 1], [.9, 1 / 60, 12], [.5, 1 / 144, 20], [.2, .05, 6], [0, 1 / 60, 10], [.68, 1 / 120, 8]] as const) {
  for (let i = 0; i < count; i++) sequence.push([altitude, dt]);
}

type Light = Record<string, unknown> & { surface?: { x: number; y: number }[] };
// 광원 값을 비교용 일반 객체로 옮긴다. undefined 필드와 없는 필드는 같게 본다.
const plain = (light: Light) => JSON.parse(JSON.stringify(light));

describe('게임 비행 배경의 광원 버퍼 재사용', () => {
  for (const [scenario, width, height, vertexHash, vertices, lightCount, trailCount] of [
    ['liftoff', 960, 540, '285bb423b902179d', 460224, 23904, 8340],
    ['infiltration', 960, 540, '375a3f99e998cfda', 423084, 28437, 6820],
    ['liftoff', 1280, 720, '9a10a356f5fe7e78', 458760, 23806, 8338],
    ['infiltration', 390, 844, '12c11ab63a2f3fb4', 352056, 22656, 6682],
  ] as const) {
    it(`${scenario} ${width}×${height}에서 57프레임 동안 같은 버퍼로 만든 GPU 정점은 재사용 전 구현의 해시 ${vertexHash}와 같다`, () => {
      const scene = scenarios[scenario], heights = heightMode(null);
      const frames = createApproachLightFrames(scenario, makeLights(scenario, heights, layoutMode(null)));
      const batch = new LightVertexBatch(32768), hash = new Hash();
      const options = { lights: [], trails: [], rgb: scene.rgb.split(',').map(Number), core: hexRgb(scene.core), trailStrength: scene.strength, trailGlowAlpha: proceduralTrailGlowAlpha('gpu') };
      let travel = 130, totalVertices = 0, totalLights = 0, totalTrails = 0;
      for (const [altitude, dt] of sequence) {
        travel += dt * scene.speed * approachSpeed[scenario];
        const view = cameraAt(scenario, altitude, width, height, approachSpeed[scenario], heights);
        const frame = frames.build(travel, view, altitude);
        const metrics = writeLightFrame(batch, { ...options, lights: frame.lights, trails: frame.trails });
        hash.f32(batch.data, metrics.vertexCount * 6);
        totalVertices += metrics.vertexCount; totalLights += frame.lights.length; totalTrails += frame.trails.length;
      }
      expect({ hash: hash.hex(), totalVertices, totalLights, totalTrails }).toEqual({ hash: vertexHash, totalVertices: vertices, totalLights: lightCount, totalTrails: trailCount });
    });
  }

  it('이륙 고도 10%→45%→90% 세 프레임을 같은 버퍼로 계산해도 매 프레임 새 버퍼 계산과 광원·잔광 값이 같다', () => {
    const heights = heightMode(null), lights = makeLights('liftoff', heights, layoutMode(null));
    const frames = createApproachLightFrames('liftoff', lights);
    const objectOptions = { palette:'liftoff', scenario:'liftoff', seed:42, scale:1, secondary:.15, quality:'gpu' };
    for (const [altitude, travel] of [[.1, 130], [.45, 700.25], [.9, 2300.5]]) {
      const view = cameraAt('liftoff', altitude, 960, 540, approachSpeed.liftoff, heights);
      const fresh = [...liftoffObjectLights(visibleLights(lights, travel, view, 'surface', objectOptions), altitude), ...visibleRunwayLights(travel, view, undefined, 'gpu')];
      const freshTrails = proceduralTrailSegments(fresh, view, { altitude, maxSegments: 160 });
      const reused = frames.build(travel, view, altitude);
      expect(reused.lights.map(plain)).toEqual(fresh.map(plain));
      expect(reused.trails.map(plain)).toEqual(freshTrails.map(plain));
    }
  });

  it('VisibleLightFrame을 넘기면 다음 프레임에도 같은 배열과 광원 객체를 다시 쓰고 줄어든 개수만큼 배열을 자른다', () => {
    const lights = makeLights('infiltration', heightMode(null), layoutMode(null)), frame = new VisibleLightFrame();
    const options = { palette:'infiltration', scenario:'infiltration', seed:42, scale:1, secondary:.15, quality:'gpu' };
    const high = visibleLights(lights, 130, cameraAt('infiltration', .9, 960, 540, 6), 'surface', options, undefined, frame);
    const first = high[0], firstSurface = high[0].surface, highCount = high.length;
    const low = visibleLights(lights, 140, cameraAt('infiltration', .05, 960, 540, 6), 'surface', options, undefined, frame);
    expect(low).toBe(high);
    expect(low[0]).toBe(first);
    expect(low[0].surface).toBe(firstSurface);
    expect(low.length).toBeLessThan(highCount);
    expect(low.map(plain)).toEqual(visibleLights(lights, 140, cameraAt('infiltration', .05, 960, 540, 6), 'surface', options).map(plain));
  });

  it('TrailSegmentFrame을 넘기면 잔광 선분 배열과 선분 객체를 다음 호출에서 다시 쓴다', () => {
    const view = { center:200, horizon:120, worldSpeed:180 }, frame = new TrailSegmentFrame();
    const light = (id: string, depth: number) => ({ id, x:depth, y:depth / 2, size:1, alpha:1, kind:'point', lod:'detail', base:{ depth } });
    const first = proceduralTrailSegments([light('a', 40), light('b', 80)], view, { altitude:.5 }, frame);
    const segment = first[0];
    const second = proceduralTrailSegments([light('c', 60)], view, { altitude:.5 }, frame);
    expect(second).toBe(first);
    expect(second).toHaveLength(1);
    expect(second[0]).toBe(segment);
    expect(second[0].id).toBe('c');
  });

  it('버퍼 없이 visibleLights·visibleRunwayLights·proceduralTrailSegments를 두 번 부르면 Lab 잔광이 보관한 첫 결과의 배열·객체·값이 그대로다', () => {
    const lights = makeLights('liftoff', heightMode(null), layoutMode(null));
    const options = { palette:'liftoff', scenario:'liftoff', seed:42, scale:1, secondary:.15, quality:'high' };
    const firstView = cameraAt('liftoff', .9, 960, 540, 3), secondView = cameraAt('liftoff', .4, 960, 540, 3);
    const objects = visibleLights(lights, 130, firstView, 'surface', options), guides = visibleRunwayLights(130, firstView, undefined, 'high');
    const trails = proceduralTrailSegments([...objects, ...guides], firstView, { altitude:.9 });
    const saved = structuredClone({ objects, guides, trails });
    const nextObjects = visibleLights(lights, 160, secondView, 'surface', options), nextGuides = visibleRunwayLights(160, secondView, undefined, 'high');
    const nextTrails = proceduralTrailSegments([...nextObjects, ...nextGuides], secondView, { altitude:.4 });
    expect(objects.length && guides.length && trails.length).toBeGreaterThan(0);
    expect(nextObjects).not.toBe(objects); expect(nextObjects[0]).not.toBe(objects[0]); expect(nextObjects[0].surface).not.toBe(objects[0].surface);
    expect(nextGuides).not.toBe(guides); expect(nextGuides[0]).not.toBe(guides[0]);
    expect(nextTrails).not.toBe(trails); expect(nextTrails[0]).not.toBe(trails[0]);
    expect({ objects, guides, trails }).toEqual(saved);
  });

  it('이륙 고도 45%의 게임 합성은 밝기 NaN 광원을 liftoffObjectLights처럼 버린다', () => {
    const objects = [{ id:'a', alpha:.8 }, { id:'nan', alpha:NaN }, { id:'dim', alpha:.04 }];
    const expected = liftoffObjectLights(objects, .45).map(light => light.id);
    expect(writeLiftoffLights([], objects.map(light => ({ ...light })), [], .45).map(light => light.id)).toEqual(expected);
    expect(expected).toEqual(['a']);
  });

  it('depth가 같은 detail 4개는 입력 순서 그대로 잔광 예산 3개를 채운다', () => {
    const view = { center:200, horizon:120, worldSpeed:180 };
    const lights = ['w', 'x', 'y', 'z'].map((id, index) => ({ id, x:index * 10, y:index * 5, size:1, alpha:1, kind:'point', lod:'detail', base:{ depth:100 } }));
    expect(proceduralTrailSegments(lights, view, { altitude:.5, maxSegments:3 }).map(segment => segment.id)).toEqual(['w', 'x', 'y']);
  });
});

describe('발광 면 투영과 정점 기록의 재사용 전 값', () => {
  const point = (p: { x: number; y: number; scale: number; depth: number }) => [p.x, p.y, p.scale, p.depth];

  it('이륙 고도 10%·거리 40.5의 회전 유도등 면은 재사용 전 projectSurface와 같은 꼭짓점 6개다', () => {
    expect(projectSurface(makeRunwayLights()[5], 40.5, cameraAt('liftoff', .1, 960, 540, 3)).map(point)).toEqual([
      [1262.1393499594492, 651.1643907335232, 9.861053885211675, 48.18957542790057],
      [1277.7592593136246, 651.1643907335232, 9.861053885211675, 48.18957542790057],
      [1239.7605590390435, 628.1977108589507, 9.391354252645778, 50.599731116108664],
      [1232.8421332620187, 625.2343130544, 9.330748763844365, 50.92838870995522],
      [1218.0622272200894, 625.2343130544, 9.330748763844365, 50.92838870995522],
      [1254.7256579429004, 647.8982114197057, 9.794256105472824, 48.51823302174713],
    ]);
  });

  it('이륙 고도 68%·거리 120의 높이 12 수직 광원 면은 재사용 전 projectSurface와 같은 꼭짓점 6개다', () => {
    expect(projectSurface({ id:'v', x:-42, z:120, kind:'vertical', extent:12, bright:1 }, 120, cameraAt('liftoff', .68, 960, 540, 3)).map(point)).toEqual([
      [348.0406665786718, 730.781900098814, 3.0751149660078343, 154.53080787314843],
      [354.5353093868804, 730.781900098814, 3.0751149660078343, 154.53080787314843],
      [352.7270367557351, 705.2015736909314, 3.119435373633943, 152.33526041811288],
      [351.5762411175918, 701.6561048411648, 3.1255782438280817, 152.03586758333532],
      [344.9750198666269, 701.6561048411648, 3.1255782438280817, 152.03586758333532],
      [346.89715584277866, 727.3365587849582, 3.081084355491235, 154.23141503837084],
    ]);
  });

  it('깊이 2 앞에서 잘린 지면 광원은 재사용 전처럼 꼭짓점 5개이고 잘린 두 점의 깊이가 2다', () => {
    const view = { ...cameraAt('breakthrough', .12, 1200, 600, 1, 'mixed'), sinPitch:0, cosPitch:1 };
    expect(projectSurface({ id:'n', x:15, z:1, elevation:.25, layer:'ground', kind:'point', extent:4 }, 1, view).map(point)).toEqual([
      [4956, 18096.629864561768, 264, 2],
      [4820.930232558139, 17545.29963200363, 255.81395348837208, 2.064],
      [4150.8, 15133.22986456177, 220, 2.4],
      [3570, 15133.22986456177, 220, 2.4],
      [4164, 18096.629864561768, 264, 2],
    ]);
  });

  it('projectSurfaceInto는 같은 ScreenPolygon에 다시 쓰고 projectSurface와 같은 좌표를 기록한다', () => {
    const polygon = new ScreenPolygon(2), view = cameraAt('infiltration', .23, 960, 540, 6);
    const lamp = { id:'p', x:15, z:200, elevation:.25, layer:'ground', kind:'point', extent:2.4, bright:1 };
    expect(projectSurfaceInto(lamp, 200, view, polygon)).toBe(6);
    const data = polygon.data;
    expect(projectSurfaceInto({ ...lamp, x:-30 }, 260, view, polygon)).toBe(6);
    expect(polygon.data).toBe(data);
    expect(polygon.toPoints()).toEqual(projectSurface({ ...lamp, x:-30 }, 260, view));
  });

  it('4×2 면의 이동 (3,7)·(-1.5,0.25) 잔광 폭과 경계는 재사용 전 값 4.4644·2.6304와 같다', () => {
    const rect = [{ x:0, y:0 }, { x:4, y:0 }, { x:4, y:2 }, { x:0, y:2 }];
    expect([trailWidth(rect, 3, 7), trailWidth(rect, -1.5, .25)]).toEqual([4.464418717230567, 2.630383796885717]);
    expect(surfaceBounds([{ x:3, y:-1 }, { x:-2, y:4 }, { x:1, y:2 }])).toEqual({ left:-2, right:3, top:-1, bottom:4 });
  });

  it('잔광 3개·유도등 면·원거리 점·세로·가로·점 광원 장면은 재사용 전과 같은 정점 120개를 쓴다', () => {
    const rect = [{ x:300, y:400 }, { x:304, y:400 }, { x:304, y:402 }, { x:300, y:402 }];
    const view = { center:480, horizon:120, worldSpeed:348 };
    const lights = [
      { id:'a', lod:'detail', x:300, y:400, size:1.2, alpha:.8, kind:'point', base:{ depth:240 }, rgb:[10, 20, 30], surface:rect },
      { id:'b', lod:'detail', x:600, y:250, size:2.1, alpha:.5, kind:'horizontal', base:{ depth:90 }, a:{ x:590, y:250 }, b:{ x:610, y:251 } },
      { id:'c', lod:'point', x:470, y:130, size:.8, alpha:.3, kind:'point', base:{ depth:900 } },
      { id:'d', lod:'detail', x:100, y:500, size:.5, alpha:1, kind:'vertical', base:{ depth:90 } },
    ];
    const trails = proceduralTrailSegments(lights, view, { altitude:.6, maxSegments:3 });
    expect(trails.map(plain)).toEqual([
      { id:'b', x1:600, y1:250, x2:589.328, y2:238.43866666666668, size:6, alpha:.5 },
      { id:'d', x1:100, y1:500, x2:127.3226060250482, y2:472.6773939749518, size:.7, alpha:1 },
      { id:'a', x1:300, y1:400, x2:306.003, y2:390.662, size:4.446229084133165, alpha:.8, rgb:[10, 20, 30] },
    ]);
    const batch = new LightVertexBatch(3);
    const metrics = writeLightFrame(batch, {
      lights: [
        { ...lights[0], guide:true },
        { id:'pt', lod:'point', x:50, y:60, size:1.3, alpha:.55, rgb:[200, 100, 50] },
        { id:'v', kind:'vertical', x:80, y:90, size:1.1, alpha:.7, a:{ x:80, y:95 }, b:{ x:81, y:60 } },
        { id:'h', kind:'horizontal', x:120, y:140, size:.9, alpha:.4, a:{ x:115, y:140 }, b:{ x:126, y:141 } },
        { id:'p2', kind:'point', x:160, y:170, size:1.7, alpha:.9 },
      ],
      trails, rgb:[143, 125, 246], core:[233, 223, 255], trailStrength:.4, trailGlowAlpha:.13,
    });
    const hash = new Hash();
    hash.f32(batch.data, metrics.vertexCount * 6);
    expect(metrics).toEqual({ vertexCount:120, triangleCount:40, lightCount:5, trailCount:3 });
    expect(hash.hex()).toBe('4bde24e0114869c6');
    // 첫 삼각형: 가로 광원 잔광의 바깥 번짐(굵기 18, 밝기 0.6×0.4×0.13).
    expect(Array.from(batch.data.subarray(0, 6))).toEqual([606.6132202148438, 243.89547729492188, 0.5607843399047852, 0.4901960790157318, 0.9647058844566345, 0.031199999153614044]);
  });
});
