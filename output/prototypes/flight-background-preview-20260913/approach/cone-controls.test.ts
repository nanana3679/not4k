import { describe, expect, it } from 'vitest';
import { coneDimension, convergenceOffset } from './convergence.mjs';
import { cameraAt, speedMultiplier, makeLights, visibleLights } from './motion.mjs';
const view=cameraAt('breakthrough',.12,1200,600,1,'mixed');
const factor=(depth:number,dimensions:any)=>{const p={x:view.center+200,y:view.horizon+100,depth},d=convergenceOffset(p,view,.85,dimensions);return (p.x+d.x-view.center)/200;};
describe('원뿔의 앞뒤 길이와 펼쳐지는 지름',()=>{
  it('높이·지름이 없거나 잘못되면 100%, 0%는 25%, 400%는 300%로 제한한다',()=>{
    expect(coneDimension(null)).toBe(1);expect(coneDimension('invalid')).toBe(1);expect(coneDimension(0)).toBe(.25);expect(coneDimension(4)).toBe(3);expect(coneDimension(1.5)).toBe(1.5);
  });
  it('높이 25%에서는 깊이 300에 모이고 높이 300%에서는 깊이 2500에 모인다',()=>{
    expect(factor(300,{coneHeight:.25})).toBeCloseTo(.15,10);expect(factor(2500,{coneHeight:3})).toBeCloseTo(.15,10);
    expect(factor(300,{coneHeight:3})).toBeGreaterThan(.98);
  });
  it('깊이 500에서 높이 50%→100%→200%로 늘리면 같은 광원이 중심에서 더 멀리 남는다',()=>{
    const radii=[.5,1,2].map(coneHeight=>factor(500,{coneHeight}));expect(radii[0]).toBeLessThan(radii[1]);expect(radii[1]).toBeLessThan(radii[2]);
  });
  it('지름 50%와 200%는 가까운 깊이 80과 먼 깊이 500 모두 중심 거리를 각각 절반과 두 배로 만든다',()=>{
    for(const depth of [80,500]){const normal=factor(depth,{});expect(factor(depth,{coneDiameter:.5})).toBeCloseTo(normal*.5,10);expect(factor(depth,{coneDiameter:2})).toBeCloseTo(normal*2,10);}
  });
  it('높이와 지름 100%는 시연 19의 모으기 위치를 그대로 복원한다',()=>{
    for(const depth of [50,100,300,500,900,1000]){const p={x:900,y:450,depth};expect(convergenceOffset(p,view,.85,{coneHeight:1,coneDiameter:1})).toEqual(convergenceOffset(p,view,.85));}
  });
  it('지름 200%·높이 25%로 바꿔도 삼각형의 색·채움·각 면의 변 길이는 유지된다',()=>{
    const light={id:'cone-sample',x:25,z:400,elevation:110,layer:'overhead',kind:'point',extent:4,bright:1,faceWidth:2,faceLength:6,basisU:[1,0,0],basisV:[0,0,1]},options={scenario:'breakthrough',palette:'breakthrough',seed:42,mask:15,convergence:.85};
    const before=visibleLights([light],0,view,'surface',options),after=visibleLights([light],0,view,'surface',{...options,coneHeight:.25,coneDiameter:2});expect(after).toHaveLength(before.length);expect(before.length).toBeGreaterThan(0);
    before.forEach((p,i)=>{expect(after[i].rgb).toEqual(p.rgb);expect(after[i].mask).toBe(p.mask);p.surface.forEach((q,j)=>{const next=(j+1)%p.surface.length;expect(Math.hypot(after[i].surface[j].x-after[i].surface[next].x,after[i].surface[j].y-after[i].surface[next].y)).toBeCloseTo(Math.hypot(q.x-p.surface[next].x,q.y-p.surface[next].y),8);});});
  });
  it('이륙·침투는 원뿔 높이 25%·지름 300%를 전달해도 기존 발광 면 위치를 유지한다',()=>{
    for(const key of ['liftoff','infiltration']){const v=cameraAt(key,.23,1200,600),lights=makeLights(key,'mixed','flow'),options={scenario:key,palette:key,seed:42};expect(visibleLights(lights,130,v,'surface',{...options,coneHeight:.25,coneDiameter:3,convergence:.85})).toEqual(visibleLights(lights,130,v,'surface',options));}
  });
});
describe('비행 속도 1000% 조절',()=>{
  it('속도 10배는 유지하고 12배는 10배, 음수는 정지, 누락·오류는 기본 1배로 제한한다',()=>{
    expect(speedMultiplier(10)).toBe(10);expect(speedMultiplier(12)).toBe(10);expect(speedMultiplier(-1)).toBe(0);expect(speedMultiplier(null)).toBe(1);expect(speedMultiplier('invalid')).toBe(1);
  });
  it('돌파의 1000%는 초당 540, 100%는 초당 54이며 카메라 고도·각도·소실점은 유지한다',()=>{
    const normal=cameraAt('breakthrough',.12,1200,600,speedMultiplier(1),'mixed'),fast=cameraAt('breakthrough',.12,1200,600,speedMultiplier(10),'mixed');expect(normal.worldSpeed).toBe(54);expect(fast.worldSpeed).toBe(540);expect(fast.cameraHeight).toBe(normal.cameraHeight);expect(fast.pitchDegrees).toBe(normal.pitchDegrees);expect(fast.horizon).toBe(normal.horizon);
  });
});
