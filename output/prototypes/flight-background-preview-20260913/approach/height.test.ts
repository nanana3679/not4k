import { describe, expect, it } from 'vitest';
import { cameraAt, makeLights, visibleLights, advanceTrails } from './motion.mjs';
import { project } from './projection.mjs';
import { heightMode, makeLightGroups, elevatedLights, positionInLoop } from './height.mjs';
const view = () => cameraAt('breakthrough', .12, 1200, 600, 1, 'mixed');
describe('돌파의 광원 높이와 흐름', () => {
  it('높이 혼합은 시선 12도와 고도 67.6을 유지하고 눈높이 광원이 화면 안에 보이며 하늘은 그리지 않는다', () => {
    const v = view(); expect(v.pitchDegrees).toBe(12); expect(v.cameraHeight).toBeCloseTo(67.6);
    const p = project(12, 160, v.cameraHeight, v)!; expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(600); expect(v.showSky).toBe(false);
  });
  it('눈높이 광원이 전방 거리 160에서 80으로 가까워지면 세로 위치는 같고 화면 오른쪽으로 벌어진다', () => {
    const v = view(), far = project(12, 160, v.cameraHeight, v)!, near = project(12, 80, v.cameraHeight, v)!;
    expect(near.y).toBeCloseTo(far.y, 8); expect(near.x).toBeGreaterThan(far.x);
  });
  it('높이 130의 광원이 전방 거리 350에서 250으로 가까워지면 화면 위로 이동한다', () => {
    const v = view(), far = project(12, 350, 130, v)!, near = project(12, 250, 130, v)!;
    expect(far.y).toBeGreaterThan(0); expect(near.y).toBeLessThan(far.y); expect(near.x).toBeGreaterThan(far.x);
  });
  it('지면 광원이 전방 거리 350에서 250으로 가까워지면 화면 아래로 이동한다', () => {
    const v = view(); expect(project(12, 250, .25, v)!.y).toBeGreaterThan(project(12, 350, .25, v)!.y);
  });
  it('높이 혼합에는 지면·시선 아래·눈높이·머리 위 광원이 함께 있고 높은 광원의 높이도 서로 다르다', () => {
    const lights = makeLights('breakthrough', 'mixed'); expect(new Set(lights.map(p=>p.layer??'ground'))).toEqual(new Set(['ground','raised','eye','overhead']));
    expect(new Set(lights.filter(p=>p.layer==='overhead').map(p=>p.elevation)).size).toBeGreaterThan(10);
    expect(lights.filter(p=>p.layer==='overhead').every(p=>p.elevation>view().cameraHeight)).toBe(true);
  });
  it('지면만 배치에는 높은 광원이 없고 이륙·침투에는 높이 혼합 설정을 적용해도 배치가 바뀌지 않는다', () => {
    expect(makeLights('breakthrough','ground').every(p=>p.elevation===undefined)).toBe(true);
    for(const key of ['liftoff','infiltration']) expect(makeLights(key,'mixed')).toEqual(makeLights(key,'ground'));
  });
  it('지면의 발치가 화면 아래에 있어도 거리 40의 눈높이 광원은 화면 안에 표시한다', () => {
    const v = view(); expect(project(0,40,0,v)!.y).toBeGreaterThan(600);
    const lights = [{id:'fixture',x:0,z:40,elevation:v.cameraHeight,layer:'eye',kind:'point',extent:1,bright:1}];
    const current=visibleLights(lights,0,v); expect(current).toHaveLength(1); expect(current[0].y).toBeCloseTo(v.horizon);
  });
  it('머리 위 광원이 y=100에서 90으로 이동하면 잔광도 위로 지나온 실제 경로를 기록한다', () => {
    const sample=(y:number)=>({id:'lamp',x:60,y,alpha:1,size:1,kind:'point'});
    const frames=advanceTrails([],[sample(100)],[sample(90)],1,.14);
    expect(frames[0].segments[0]).toMatchObject({y1:100,y2:90});
  });
  it('휴대폰 너비 360px에서 10초간 전진하면 눈높이·머리 위 광원이 계속 보이고 상단에도 높은 광원이 지나간다', () => {
    const v=cameraAt('breakthrough',.12,360,490,1,'mixed'), lights=makeLights('breakthrough','mixed');
    let topSamples=0;
    for(let t=0;t<=10;t+=.5){
      const current=visibleLights(lights,130+54*t,v);
      expect(current.some(p=>p.layer==='eye')).toBe(true); expect(current.some(p=>p.layer==='overhead')).toBe(true);
      if(current.some(p=>p.layer==='overhead'&&p.y>0&&p.y<490*.18&&p.x>0&&p.x<360))topSamples++;
    }
    expect(topSamples).toBeGreaterThan(10);
  });
  it('알 수 없는 height와 null은 높이 혼합으로 열리고 ground는 지면만으로 열린다', () => {
    expect(heightMode(null)).toBe('mixed');expect(heightMode('unknown')).toBe('mixed');expect(heightMode('ground')).toBe('ground');
  });
});
describe('구조물 없는 광원의 연속 표시',()=>{
  it('x=60, 전방 거리 70의 눈높이 광원은 보이지 않는 기둥에 가려지지 않고 표시된다',()=>{
    const v=view();const source={id:'unobstructed',x:60,z:200,elevation:v.cameraHeight,layer:'eye',kind:'point',extent:1,bright:1};
    const current=visibleLights([source],130,v);expect(current).toHaveLength(1);expect(current[0].y).toBeCloseTo(v.horizon);
  });
  it('전방 거리 130에서 2448만큼 더 비행하면 같은 배치로 반복되되 회차 ID는 달라진다',()=>{
    const a=positionInLoop(250,130),b=positionInLoop(250,130+2448);expect(a.z).toBe(b.z);expect(a.cycle).not.toBe(b.cycle);
    expect(elevatedLights(makeLightGroups())).toEqual(elevatedLights(makeLightGroups()));
  });
});
