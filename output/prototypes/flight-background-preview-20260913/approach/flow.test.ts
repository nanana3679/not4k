import { describe, expect, it } from 'vitest';
import { makeFlowLights, layoutMode } from './flow.mjs';
import { cameraAt, makeLights, visibleLights } from './motion.mjs';
import { project } from './projection.mjs';
import { surfaceVertices } from './surface.mjs';
const view=()=>cameraAt('breakthrough',.12,1200,600,1,'mixed');
describe('돌파의 진행 방향을 따른 광원 배치',()=>{
  it('원근 흐름의 위치를 다시 생성하면 모든 좌표가 같아 재생할 때 배치가 흔들리지 않는다',()=>{
    expect(makeFlowLights('mixed')).toEqual(makeFlowLights('mixed'));
  });
  it('지면만에는 높이 0.25의 광원 1900개가 있고 높이 혼합에는 눈높이·상부·하부 광원이 추가된다',()=>{
    const ground=makeFlowLights('ground'), mixed=makeFlowLights('mixed');
    expect(ground).toHaveLength(1900);expect(ground.every(p=>p.elevation===.25)).toBe(true);
    expect(mixed.length).toBeGreaterThan(ground.length);expect(new Set(mixed.map(p=>p.layer))).toEqual(new Set(['ground','raised','eye','overhead']));
    expect(mixed.every(p=>p.elevation>=.25)).toBe(true);
  });
  it('돌파 광원의 전방 위치는 반복 길이 2448 안에서 서로 달라 같은 깊이의 줄을 만들지 않는다',()=>{
    const lights=makeFlowLights('mixed');expect(lights.every(p=>p.z>=0&&p.z<2448)).toBe(true);
    expect(new Set(lights.map(p=>p.z)).size).toBe(lights.length);
  });
  it('원근 흐름의 면은 긴 변에 깊이 방향 성분이 0.96 이상 있고 짧은 변은 그에 수직이다',()=>{
    for(const p of makeFlowLights('mixed')){
      expect(p.basisV[2]).toBeGreaterThan(.96);
      expect(p.basisU.reduce((sum,v,i)=>sum+v*p.basisV[i],0)).toBeCloseTo(0,8);
    }
  });
  it('공중의 발광 면도 전방 깊이 범위를 가지므로 정면을 향한 평면 카드로만 배치되지 않는다',()=>{
    const p=makeFlowLights('mixed').find(p=>p.layer==='eye')!;
    const vertices=surfaceVertices(p,200),depths=vertices.map(p=>p[2]);
    expect(Math.max(...depths)-Math.min(...depths)).toBeGreaterThan(3);
  });
  it('높이가 다른 광원이 거리 500에서 250으로 가까워지면 소실점에서 바깥쪽으로 이동한다',()=>{
    const v=view();
    for(const elevation of [.25,40,67.6,110,170]){
      const far=project(25,500,elevation,v)!,near=project(25,250,elevation,v)!;
      expect(Math.hypot(near.x-v.center,near.y-v.horizon)).toBeGreaterThan(Math.hypot(far.x-v.center,far.y-v.horizon));
      const cross=(far.x-v.center)*(near.y-v.horizon)-(far.y-v.horizon)*(near.x-v.center);expect(cross).toBeCloseTo(0,6);
    }
  });
  it('같은 거리 10을 전진해도 150→140 구간의 광원 이동량은 300→290 구간의 3.5배보다 크다',()=>{
    const v=view(),point=(z:number)=>project(30,z,90,v)!;
    const distance=(a:any,b:any)=>Math.hypot(a.x-b.x,a.y-b.y);
    expect(distance(point(150),point(140))).toBeGreaterThan(distance(point(300),point(290))*3.5);
  });
  it('이륙과 침투에서 배치 모드를 원근 흐름으로 바꾸어도 기존 광원 배치는 유지된다',()=>{
    for(const key of ['liftoff','infiltration'])expect(makeLights(key,'mixed','flow')).toEqual(makeLights(key,'mixed','aligned'));
    expect(makeLights('breakthrough','mixed','flow')).not.toEqual(makeLights('breakthrough','mixed','aligned'));
  });
  it('휴대폰 너비 360px에서 10초간 진행하면 상단 18%에도 광원이 계속 지나간다',()=>{
    const v=cameraAt('breakthrough',.12,360,490,1,'mixed'),lights=makeFlowLights('mixed');
    for(let t=0;t<=10;t+=.5){
      const current=visibleLights(lights,130+54*t,v,'surface');
      expect(current.some(p=>p.y>0&&p.y<490*.18&&p.x>0&&p.x<360)).toBe(true);
    }
  });
  it('layout이 없거나 잘못되면 원근 흐름이며 aligned이면 기존 배치다',()=>{
    expect(layoutMode(null)).toBe('flow');expect(layoutMode('unknown')).toBe('flow');expect(layoutMode('aligned')).toBe('aligned');
  });
});
