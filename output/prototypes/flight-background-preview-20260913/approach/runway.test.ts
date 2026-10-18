import {describe, expect, it} from 'vitest';
import {makeRunwayLights, liftoffLighting, visibleRunwayLights, runwayGround, liftoffObjectLights, runwayHalfWidth, runwaySpacing} from './runway.mjs';
import {cameraAt, wrapLength, makeLights, visibleLights} from './motion.mjs';
import {surfaceVertices} from './surface.mjs';
import {laneAt} from './projection.mjs';

describe('이륙 저고도의 지상 유도등', () => {
  it('고도 3·49·95%와 전진 130·1000·2578에서 모든 가이드는 노란색 RGB(255,220,64)다', () => {
    for(const altitude of [.03,.49,.95])for(const travel of [130,1000,2578]){
      const current=visibleRunwayLights(travel,cameraAt('liftoff',altitude,1200,675));
      expect(current.length).toBeGreaterThan(0);
      expect(new Set(current.map(light=>light.rgb.join(',')))).toEqual(new Set(['255,220,64']));
    }
  });
  it('2448 길이에 간격 36으로 좌우 68쌍의 유도등을 높이 0에 배치한다', () => {
    const lamps = makeRunwayLights();
    expect(lamps).toHaveLength(136);
    expect(new Set(lamps.map(l => l.x))).toEqual(new Set([-runwayHalfWidth, runwayHalfWidth]));
    for (const lamp of lamps) {
      expect(lamp.elevation).toBe(0);
      expect(lamp.layer).toBe('ground');
      expect(surfaceVertices(lamp, lamp.z).every(p => p[1] === 0)).toBe(true);
    }
    expect(lamps[2].z - lamps[0].z).toBe(runwaySpacing);
    expect(wrapLength - lamps.at(-1)!.z).toBe(runwaySpacing);
  });
  it('고도 3·10·25%에서는 일반 오브젝트 밝기 0, 유도등 밝기 100%다', () => {
    for (const altitude of [.03,.1,.25]) {
      expect(liftoffLighting(altitude)).toMatchObject({objects:0,guides:1});
      expect(liftoffObjectLights([{id:'tower',alpha:1}], altitude)).toEqual([]);
    }
  });
  it('고도 45%에서는 일반 오브젝트 50%이고 65% 이상에서는 원래 밝기로 복원한다', () => {
    expect(liftoffLighting(.45).objects).toBeCloseTo(.5,12);
    const lights = [{id:'a',alpha:.8}];
    expect(liftoffObjectLights(lights,.45)[0].alpha).toBeCloseTo(.4,12);
    expect(liftoffObjectLights(lights,.65)).toBe(lights);
    expect(liftoffObjectLights(lights,.95)).toBe(lights);
    expect(liftoffLighting(.65).guides).toBeCloseTo(.35,12);
  });
  it('고도 25%와 65%의 경계에서 밝기는 튀지 않고 연속적으로 변한다', () => {
    for (const boundary of [.25,.65]) {
      const before=liftoffLighting(boundary-.0001), after=liftoffLighting(boundary+.0001);
      expect(Math.abs(after.objects-before.objects)).toBeLessThan(.000001);
      expect(Math.abs(after.guides-before.guides)).toBeLessThan(.000001);
    }
  });
  it('잘못된 고도 NaN은 저고도 조명으로 처리하고 범위 밖 -1·2도 0~1 밝기에 머문다', () => {
    expect(liftoffLighting(NaN).objects).toBe(0);
    for (const a of [-1,2]) for (const value of Object.values(liftoffLighting(a))) {
      expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
    }
  });
  it('고도 3·10·25%에서 실제 최소 캔버스 294px부터 데스크톱까지 양쪽 레인 밖에 유도등이 보인다', () => {
    for (const width of [294,320,390,844,1440]) for(const altitude of [.03,.1,.25]) {
      const height=width*9/16, view=cameraAt('liftoff',altitude,width,height), lane=laneAt(width,height);
      const current=visibleRunwayLights(130,view,42);
      const onscreen=current.filter(p=>p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height);
      expect(onscreen.some(p=>p.x<lane.left)).toBe(true);
      expect(onscreen.some(p=>p.x>lane.left+lane.width)).toBe(true);
      expect(current.every(p=>p.guide&&p.elevation===0&&p.surface.every(q=>q.y>view.horizon))).toBe(true);
    }
  });
  it('저고도 10%의 10초 전진 중 양쪽 유도등이 계속 보이고 가이드 면은 항상 지평선 아래다', () => {
    const view=cameraAt('liftoff',.1,844,844*9/16);
    for (let seconds=0;seconds<=10;seconds+=.5) {
      const current=visibleRunwayLights(130+seconds*64,view,42);
      expect(current.some(p=>p.x>0&&p.x<view.center&&p.y<view.height)).toBe(true);
      expect(current.some(p=>p.x>view.center&&p.x<view.width&&p.y<view.height)).toBe(true);
      expect(current.every(p=>p.surface.every(q=>q.y>view.horizon))).toBe(true);
    }
  });
  it('같은 행의 좌우 유도등 색은 같고 2448 전진 후에도 좌표·색·밝기가 같다', () => {
    const view=cameraAt('liftoff',.1,1200,675);
    const first=visibleRunwayLights(130,view,42), next=visibleRunwayLights(130+wrapLength,view,42);
    expect(next).toHaveLength(first.length);
    for(let i=0;i<first.length;i++) {
      expect(next[i].x).toBeCloseTo(first[i].x,9);
      expect(next[i].y).toBeCloseTo(first[i].y,9);
      expect(next[i].rgb).toEqual(first[i].rgb);
      expect(next[i].alpha).toBe(first[i].alpha);
      const opposite=first.find(p=>p.id.split('/')[1]===first[i].id.split('/')[1]&&p.id!==first[i].id);
      if(opposite)expect(opposite.rgb).toEqual(first[i].rgb);
    }
  });
  it('고도 10→80%로 바꿔도 같은 유도등 ID와 배색은 유지되고 시선은 12도다', () => {
    const low=cameraAt('liftoff',.1,1200,675), high=cameraAt('liftoff',.8,1200,675);
    const lowLights=visibleRunwayLights(130,low,42), highLights=visibleRunwayLights(130,high,42);
    expect(highLights.some(p=>lowLights.some(q=>q.id===p.id))).toBe(true);
    for(const p of highLights) {
      const old=lowLights.find(q=>q.id===p.id);
      if(old)expect(p.rgb).toEqual(old.rgb);
    }
    expect(low.pitchDegrees).toBe(12); expect(high.pitchDegrees).toBe(12);
  });
  it('고도 95%에서 high 품질을 적용하면 먼 유도등은 노란색 point로 바꾸고 가까운 유도등은 면으로 유지한다', () => {
    const current=visibleRunwayLights(130,cameraAt('liftoff',.95,364,204),42,'high');
    expect(current.some(light=>light.lod==='point'&&!light.surface)).toBe(true);
    expect(current.some(light=>light.surface?.length===6)).toBe(true);
    expect(current.every(light=>light.rgb.join(',')==='255,220,64')).toBe(true);
  });
  it('고도 55%에서 minimal 품질은 high보다 유도등 수를 줄이되 양쪽 노란색 경로를 남긴다', () => {
    const view=cameraAt('liftoff',.55,390,219);
    const high=visibleRunwayLights(130,view,42,'high');
    const minimal=visibleRunwayLights(130,view,42,'minimal');
    expect(minimal.length).toBeLessThan(high.length);
    expect(minimal.some(light=>light.x<view.center)).toBe(true);
    expect(minimal.some(light=>light.x>view.center)).toBe(true);
    expect(minimal.every(light=>light.rgb.join(',')==='255,220,64')).toBe(true);
  });
  it('고도별 오브젝트 감쇠는 원본 배치·ID·밝기를 수정하지 않는다', () => {
    const lights=makeLights('liftoff'), saved=structuredClone(lights);
    const current=visibleLights(lights,130,cameraAt('liftoff',.45,1200,675),'surface');
    const before=structuredClone(current);
    for(const altitude of [.1,.45,.8])liftoffObjectLights(current,altitude);
    expect(lights).toEqual(saved); expect(current).toEqual(before);
  });
  it('고도 3·25·95%의 활주로 바닥은 유한한 꼭짓점만 가지며 지평선 위로 올라가지 않는다', () => {
    for(const altitude of [.03,.25,.95]) {
      const view=cameraAt('liftoff',altitude,1200,675), points=runwayGround(view);
      expect(points).toHaveLength(4);
      expect(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.y>view.horizon)).toBe(true);
    }
  });
});
