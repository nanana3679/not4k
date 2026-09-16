import { describe, expect, it } from 'vitest';
import { advanceSurfaceTrails, surfaceTrailOpacity, surfaceTrailBatches } from './afterglow.mjs';
const triangle=[{x:0,y:0},{x:4,y:0},{x:2,y:Math.sqrt(12)}];
const light=(dx=0)=>({id:'triangle/1',surface:triangle.map(p=>({x:p.x+dx,y:p.y})),alpha:.8,rgb:[248,76,46]});
describe('삼각형 외곽을 보존하는 짧은 잔광',()=>{
  it('삼각형이 오른쪽 8px 이동하면 폭이 일정한 선 대신 중간 위치의 삼각형 두 개를 남긴다',()=>{
    const frames=advanceSurfaceTrails([], [light()], [light(8)], 1,.14,1/60),s=frames[0].segments;
    expect(s).toHaveLength(2);expect(s[0].surface).toEqual(triangle.map(p=>({x:p.x+2,y:p.y})));expect(s[1].surface).toEqual(triangle.map(p=>({x:p.x+6,y:p.y})));expect(s.every(p=>p.surface.length===3&&!('size' in p))).toBe(true);
  });
  it('16ms 동안 40px 이동한 면은 10개 중간 외곽으로 나누고 각 간격은 4px이다',()=>{
    const s=advanceSurfaceTrails([], [light()], [light(40)], 1,.14,.016)[0].segments;expect(s).toHaveLength(10);
    expect(s.reduce((sum,p)=>sum+p.interval,0)).toBeCloseTo(.016,10);for(let i=1;i<s.length;i++)expect(s[i].surface[0].x-s[i-1].surface[0].x).toBeCloseTo(4,10);
  });
  it('잔광은 이전 면의 색을 보존하며 원래 꼭짓점을 나중에 수정해도 기록된 외곽이 바뀌지 않는다',()=>{
    const old=light(),s=advanceSurfaceTrails([], [old], [light(8)], 1,.14,1/60)[0].segments;
    expect(s.every(p=>p.rgb.every((n,i)=>n===old.rgb[i]))).toBe(true);old.surface[0].x=999;expect(s[0].surface[0].x).toBe(2);
  });
  it('정지한 삼각형은 새 잔광을 만들지 않고 기존 잔광은 수명 140ms 뒤 사라진다',()=>{
    expect(advanceSurfaceTrails([], [light()], [light()], 1,.14,1/60)).toEqual([]);
    const frames=advanceSurfaceTrails([], [light()], [light(8)], 1,.14,1/60);expect(advanceSurfaceTrails(frames,[],[],1.141,.14,1/60)).toEqual([]);
  });
  it('가까운 경계에서 꼭짓점 3개가 4개가 되면 서로 잘못 연결하지 않고 이전 삼각형만 남긴다',()=>{
    const next={...light(8),surface:[{x:8,y:0},{x:12,y:0},{x:12,y:2},{x:8,y:2}]};
    const s=advanceSurfaceTrails([], [light()], [next], 1,.14,.02)[0].segments;expect(s).toHaveLength(1);expect(s[0].surface).toEqual(triangle);expect(s[0].time).toBe(.98);
  });
  it('시야를 빠져나간 면도 마지막 삼각형을 남기고 140ms가 지나면 사라진다',()=>{
    const frames=advanceSurfaceTrails([], [light()], [], 1,.14,.02);expect(frames[0].segments[0].surface).toEqual(triangle);expect(advanceSurfaceTrails(frames,[],[],1.121,.14,.02)).toEqual([]);
  });
  it('한 프레임에 200px 이동하면 화면을 가로지르는 연결 대신 이전 면만 기록한다',()=>{
    const s=advanceSurfaceTrails([], [light()], [light(200)], 1,.14,.02)[0].segments;expect(s).toHaveLength(1);expect(s[0].surface).toEqual(triangle);
  });
  it('50ms 프레임에서 잔광 수명이 40ms면 마지막 40ms 구간만 기록한다',()=>{
    const s=advanceSurfaceTrails([], [light()], [light(10)], 1,.04,.05)[0].segments;expect(s.every(p=>p.time>.96&&p.time<1)).toBe(true);expect(s.every(p=>p.surface[0].x>=2)).toBe(true);expect(s.reduce((n,p)=>n+p.interval,0)).toBeCloseTo(.04,10);
  });
  it('수명 0이면 기록을 모두 비우고 dt=0이면 새 잔광을 만들지 않는다',()=>{
    const frames=advanceSurfaceTrails([], [light()], [light(8)], 1,.14,.02);expect(advanceSurfaceTrails(frames,[],[],1,0,.02)).toEqual([]);expect(advanceSurfaceTrails([], [light()], [light(8)],1,.14,0)).toEqual([]);
  });
});
describe('시간으로 정규화한 잔광 밝기',()=>{
  it('동일 시점·색의 두 삼각형은 두 외곽을 보존한 한 묶음으로 그리고 다른 색은 분리한다',()=>{
    const red=advanceSurfaceTrails([], [light()], [light(8)],1,.14,1/60)[0].segments[0];
    const frame={time:1,segments:[red,{...red,id:'second',surface:red.surface.map(p=>({...p,y:p.y+20}))},{...red,id:'third',rgb:[40,176,215]}]};
    const batches=surfaceTrailBatches(frame);expect(batches).toHaveLength(2);expect(batches[0].surfaces).toHaveLength(2);expect(batches[0].surfaces[0]).toEqual(red.surface);expect(surfaceTrailBatches(frame)).toBe(batches);
  });
  it('면이 아직 만료되지 않으면 기록 객체를 재사용하고 140ms가 지나면 묶음도 남기지 않는다',()=>{
    const frames=advanceSurfaceTrails([], [light()], [light(8)],1,.14,1/60);
    expect(advanceSurfaceTrails(frames,[],[],1.01,.14,1/60)[0]).toBe(frames[0]);expect(advanceSurfaceTrails(frames,[],[],1.141,.14,1/60)).toEqual([]);
  });
  it('수명 120ms에서 120ms 이상 지난 면은 투명하고 60ms의 밝기는 생성 순간보다 낮다',()=>{
    expect(surfaceTrailOpacity(.12,.12,.01,.47)).toBe(0);expect(surfaceTrailOpacity(-.1,.12,.01,.47)).toBe(0);expect(surfaceTrailOpacity(.06,.12,.01,.47)).toBeLessThan(surfaceTrailOpacity(0,.12,.01,.47));
  });
  it('30·60·120fps로 120ms의 면 잔광을 합성해도 총 불투명도의 차이는 0.003 이하다',()=>{
    const totals=[30,60,120].map(fps=>{let transmission=1;for(let age=0;age<.12;age+=1/fps){const interval=Math.min(1/fps,.12-age);transmission*=1-surfaceTrailOpacity(age+interval/2,.12,interval,.47);}return 1-transmission;});
    expect(Math.max(...totals)-Math.min(...totals)).toBeLessThan(.003);
  });
});
