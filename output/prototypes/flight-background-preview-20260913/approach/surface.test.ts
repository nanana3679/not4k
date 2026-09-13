import { describe, expect, it } from 'vitest';
import { cameraAt, visibleLights, advanceTrails } from './motion.mjs';
import { surfaceVertices, projectSurface, projectedSurfaceAreaEstimate, surfaceBounds, trailWidth, shapeMode } from './surface.mjs';
const view=()=>cameraAt('breakthrough',.12,1200,600,1,'mixed');
const lamp={id:'panel',x:15,z:200,elevation:67.6,layer:'eye',kind:'horizontal',extent:3.2,bright:1};
const area=(points:any[])=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y},0))/2;
describe('넓이가 있는 발광 면',()=>{
  it('지면의 점 광원은 높이 0.25에 폭과 깊이를 가진 6개 꼭짓점의 면으로 바뀐다',()=>{
    const points=surfaceVertices({...lamp,elevation:undefined,layer:undefined,kind:'point'},200);
    expect(points).toHaveLength(6);expect(new Set(points.map(p=>p[1]))).toEqual(new Set([.25]));
    expect(new Set(points.map(p=>p[0])).size).toBeGreaterThan(1);expect(new Set(points.map(p=>p[2])).size).toBeGreaterThan(1);
  });
  it('수직 광원은 전방 거리 200을 유지하고 폭과 높이가 모두 있는 세워진 면으로 바뀐다',()=>{
    const points=surfaceVertices({...lamp,kind:'vertical',extent:3.5},200);
    expect(new Set(points.map(p=>p[2]))).toEqual(new Set([200]));
    expect(new Set(points.map(p=>p[0])).size).toBeGreaterThan(1);expect(new Set(points.map(p=>p[1])).size).toBeGreaterThan(1);
  });
  it('머리 위 광원은 높이 130을 유지하며 폭과 깊이가 있는 평면으로 투영된다',()=>{
    const points=surfaceVertices({...lamp,elevation:130,layer:'overhead'},300);
    expect(new Set(points.map(p=>p[1]))).toEqual(new Set([130]));expect(new Set(points.map(p=>p[2])).size).toBeGreaterThan(1);
  });
  it('눈높이의 발광 면이 거리 200에서 100으로 가까워지면 화면 면적이 약 4배 커진다',()=>{
    const v=view(),far=projectSurface(lamp,200,v),near=projectSurface(lamp,100,v);
    expect(area(far)).toBeGreaterThan(1);expect(area(near)/area(far)).toBeCloseTo(4,1);
  });
  it('동일 광원의 선·면 전환은 중심 위치를 유지하고 면 모드에만 넓이 있는 다각형을 붙인다',()=>{
    const v=view(),line=visibleLights([lamp],0,v,'line')[0],surface=visibleLights([lamp],0,v,'surface')[0];
    expect(line.surface).toBeUndefined();expect(area(surface.surface)).toBeGreaterThan(1);expect(surface.x).toBe(line.x);expect(surface.y).toBe(line.y);
  });
  it('발광 면이 가까운 투영 경계를 넘으면 깊이 2에서 잘라 유한한 좌표를 만든다',()=>{
    const v={...view(),sinPitch:0,cosPitch:1};
    const points=projectSurface({...lamp,elevation:.25,layer:'ground',kind:'point',extent:4},1,v);
    expect(points.length).toBeGreaterThanOrEqual(3);expect(points.every(p=>p.depth>=2-1e-8&&Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
  });
  it('고도 95%·거리 800의 지면 광원 면적 추정값은 실제 6꼭지점 투영 면적과 0.01% 이내로 같다',()=>{
    const high=cameraAt('infiltration',.95,364,204),source={...lamp,elevation:.25,layer:'ground',kind:'horizontal'};
    const actual=area(projectSurface(source,800,high));
    expect(projectedSurfaceAreaEstimate(source,800,high)).toBeCloseTo(actual,4);
  });
  it('고도 95%·거리 800의 회전 지면 유도등도 면적 추정값이 실제 투영과 0.01% 이내로 같다',()=>{
    const high=cameraAt('liftoff',.95,364,204),source={...lamp,elevation:0,layer:'ground',kind:'point',basisU:[1,0,0],basisV:[0,0,1],faceWidth:1.8,faceLength:2.8};
    const actual=area(projectSurface(source,800,high));
    expect(projectedSurfaceAreaEstimate(source,800,high)).toBeCloseTo(actual,4);
  });
});
describe('발광 면의 폭에 따른 잔광',()=>{
  const rect=[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:2}];
  it('4×2 면이 아래로 움직이면 잔광 폭은 4이고 오른쪽으로 움직이면 2다',()=>{
    expect(trailWidth(rect,0,10)).toBe(4);expect(trailWidth(rect,10,0)).toBe(2);
  });
  it('4×2 면이 y=1에서 11로 이동하면 실제 경로와 면의 폭 4를 잔광에 기록한다',()=>{
    const source={id:'panel',x:2,y:1,surface:rect,size:.5,alpha:1,kind:'horizontal'};
    const moved={...source,y:11,surface:rect.map(p=>({...p,y:p.y+10}))};
    const frames=advanceTrails([],[source],[moved],1,.14);
    expect(frames[0].segments[0]).toMatchObject({x1:2,y1:1,x2:2,y2:11,size:4});
  });
  it('정지한 면의 잔광 폭 계산은 유한하고 100px 폭의 면도 잔광 폭은 26px까지만 사용한다',()=>{
    expect(trailWidth(rect,0,0)).toBe(.7);expect(trailWidth(rect.map(p=>({x:p.x*25,y:p.y})),0,1)).toBe(26);
  });
  it('투영된 4×2 면의 경계는 좌우 0~4, 위아래 0~2다',()=>{expect(surfaceBounds(rect)).toEqual({left:0,right:4,top:0,bottom:2})});
  it('shape가 없거나 잘못되어도 면 광원으로 열리고 line이면 기존 선 광원으로 열린다',()=>{
    expect(shapeMode(null)).toBe('surface');expect(shapeMode('unknown')).toBe('surface');expect(shapeMode('line')).toBe('line');
  });
});
