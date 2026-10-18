import { describe, expect, it } from 'vitest';
import { scenarios, scenarioKey, cameraAt, makeLights, visibleLights, advanceTrails, trailOpacity } from './motion.mjs';
import { project, depthAtRow, flowAtRow, laneAt } from './projection.mjs';

describe('난이도별 비행 시점', () => {
  it('이륙 고도를 90%에서 8%로 낮추면 시선은 12도로 유지되고 지면과의 거리가 줄어든다', () => {
    const high = cameraAt('liftoff', .9, 1200, 600), low = cameraAt('liftoff', .08, 1200, 600);
    expect(high.pitchDegrees).toBe(12); expect(low.pitchDegrees).toBe(12);
    expect(low.horizon).toBe(high.horizon); expect(low.cameraHeight).toBeLessThan(high.cameraHeight);
    expect(flowAtRow(500, low)).toBeGreaterThan(flowAtRow(500, high));
  });
  it('침투 고도를 90%에서 8%로 낮추면 시선이 12도에서 88도로 기울고 지평선이 화면 위로 사라진다', () => {
    const high = cameraAt('infiltration', .9, 1200, 600), low = cameraAt('infiltration', .08, 1200, 600);
    expect(high.pitchDegrees).toBe(12); expect(low.pitchDegrees).toBe(88);
    expect(high.horizon).toBeGreaterThan(0); expect(low.horizon).toBeLessThan(0);
  });
  it('돌파 고도 3%와 95% 모두 시선은 12도이고 화면 맨 위 지면도 초당 15px 이상 움직인다', () => {
    for (const altitude of [.03, .95]) {
      const view = cameraAt('breakthrough', altitude, 1200, 600);
      expect(view.pitchDegrees).toBe(12); expect(view.horizon).toBeLessThan(0);
      expect(depthAtRow(0, view)).not.toBeNull(); expect(flowAtRow(0, view)).toBeGreaterThan(15);
    }
  });
  it('침투의 88도 하향 시점에서 화면 아래 지면을 역투영하면 원래 화면 위치로 돌아온다', () => {
    const view = cameraAt('infiltration', .08, 1200, 600);
    for (const y of [0, 300, 599]) { const z = depthAtRow(y, view); expect(project(0, z, 0, view)?.y).toBeCloseTo(y, 8); }
  });
  it('비행 속도를 0%로 낮추면 배경 흐름은 0이고 레인 폭과 노트 속도는 유지된다', () => {
    const lane = laneAt(1200, 600);
    expect(flowAtRow(500, cameraAt('breakthrough', .12, 1200, 600, 0))).toBe(0);
    expect(lane.width).toBe(252); expect(lane.noteSpeed).toBe(288);
  });
  it('알 수 없는 variant와 null은 돌파 시연으로 열린다', () => { expect(scenarioKey('unknown')).toBe('breakthrough'); expect(scenarioKey(null)).toBe('breakthrough'); });
});

describe('광원의 방향과 밀도', () => {
  it('이륙은 점 광원 사이에 수직 광원이 있고 침투는 점 광원과 가로 광원이 섞인다', () => {
    expect(new Set(makeLights('liftoff').map(p => p.kind))).toEqual(new Set(['point', 'vertical']));
    expect(new Set(makeLights('infiltration').map(p => p.kind))).toEqual(new Set(['point', 'horizontal']));
  });
  it('같은 지면 길이에 배치한 광원 수는 이륙보다 침투가 많고 침투보다 돌파가 많다', () => {
    expect(makeLights('infiltration').length).toBeGreaterThan(makeLights('liftoff').length);
    expect(makeLights('breakthrough').length).toBeGreaterThan(makeLights('infiltration').length);
  });
  it('돌파는 휴대폰 너비 360px에서 10초간 전진해도 매 0.5초마다 화면 상단 18%에 광원이 보인다', () => {
    const view = cameraAt('breakthrough', .12, 360, 490), lights = makeLights('breakthrough');
    for (let t = 0; t <= 10; t += .5) {
      const current = visibleLights(lights, 130 + t * scenarios.breakthrough.speed, view);
      expect(current.filter(p => p.y >= 0 && p.y < 490 * .18 && p.x > 0 && p.x < 360).length).toBeGreaterThan(0);
    }
  });
  it('같은 난이도를 다시 생성하면 광원 좌표와 방향이 동일하다', () => { expect(makeLights('infiltration')).toEqual(makeLights('infiltration')); });
  it('침투 고도 95%·휴대폰 화면에서 high LOD는 근거리 면을 남기고 원거리 점을 포함한 전체를 360개 이하로 제한한다', () => {
    const view=cameraAt('infiltration',.95,364,204,6);
    const current=visibleLights(makeLights('infiltration'),130,view,'surface',{
      scenario:'infiltration',palette:'infiltration',seed:42,scale:1,secondary:.15,quality:'high',
    });
    expect(current.some(light=>light.lod==='detail'&&light.surface?.length===6)).toBe(true);
    expect(current.some(light=>light.lod==='point'&&!light.surface)).toBe(true);
    expect(current.length).toBeLessThanOrEqual(360);
  });
});
const light = (id: string, x: number, y: number) => ({ id, x, y, size: 1, alpha: 1, kind: 'point', a: { x, y }, b: { x, y } });
describe('시간에 따라 사라지는 실제 경로 잔광', () => {
  it('잔광 수명이 120ms이면 밝기는 생성 순간 1, 60ms 후 0.25, 120ms 후 0이다', () => {
    expect(trailOpacity(0, .12)).toBe(1); expect(trailOpacity(.06, .12)).toBe(.25); expect(trailOpacity(.12, .12)).toBe(0);
  });
  it('30fps와 60fps 모두 60ms가 지난 잔광의 밝기는 0.25다', () => {
    for (const fps of [30, 60]) {
      const born = 3 / fps; expect(trailOpacity((born + .06) - born, .12)).toBeCloseTo(.25, 8);
    }
  });
  it('광원이 (10,20)에서 (15,30)으로 이동하면 추정 위치가 아닌 두 실제 좌표를 잔광에 기록한다', () => {
    const frames = advanceTrails([], [light('A', 10, 20)], [light('A', 15, 30)], 1, .12);
    expect(frames[0].segments[0]).toMatchObject({ x1: 10, y1: 20, x2: 15, y2: 30 });
  });
  it('광원을 끄면 기존 잔광은 60ms 후 남아 있고 121ms 후 모두 사라진다', () => {
    const frames = advanceTrails([], [light('A', 10, 20)], [light('A', 15, 30)], 1, .12);
    const waiting = advanceTrails(frames, [], [], 1.06, .12); expect(waiting).toHaveLength(1);
    expect(advanceTrails(waiting, [], [], 1.121, .12)).toHaveLength(0);
  });
  it('광원이 정지하면 새 잔광을 만들지 않고 기존 잔광은 121ms 후 사라진다', () => {
    const stopped = light('A', 15, 30);
    const frames = advanceTrails([], [light('A', 10, 20)], [stopped], 1, .12);
    expect(advanceTrails(frames, [stopped], [stopped], 1.121, .12)).toHaveLength(0);
  });
  it('지면이 반복되어 광원 ID의 회차가 바뀌면 화면을 가로지르는 잔광을 만들지 않는다', () => {
    expect(advanceTrails([], [light('A/0', 10, 20)], [light('A/-1', 15, 30)], 1, .12)).toHaveLength(0);
  });
  it('한 프레임에 180px를 넘게 이동한 광원은 화면 전체를 긋는 잔광에서 제외한다', () => {
    expect(advanceTrails([], [light('A', 10, 20)], [light('A', 10, 201)], 1, .12)).toHaveLength(0);
  });
});
