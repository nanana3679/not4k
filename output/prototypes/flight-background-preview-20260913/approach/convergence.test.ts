import { describe, expect, it } from 'vitest';
import { convergenceStrength, convergenceOffset, shiftProjection } from './convergence.mjs';
import { cameraAt, makeLights, visibleLights } from './motion.mjs';
import { project } from './projection.mjs';
const view=cameraAt('breakthrough',.12,1200,600,1,'mixed');
const radial=(p:any)=>Math.hypot(p.x-view.center,p.y-view.horizon);
const moved=(x:number,z:number,h:number,strength=.85)=>{const p=project(x,z,h,view)!;const d=convergenceOffset(p,view,strength);return {...p,x:p.x+d.x,y:p.y+d.y};};
describe('돌파에서 먼 광원이 모이는 원뿔 흐름',()=>{
  it('모으기 강도가 없거나 잘못되면 85%, -20%는 0%, 120%는 100%로 제한한다',()=>{
    expect(convergenceStrength(null)).toBe(.85);expect(convergenceStrength('invalid')).toBe(.85);expect(convergenceStrength(-.2)).toBe(0);expect(convergenceStrength(1.2)).toBe(1);expect(convergenceStrength(.4)).toBe(.4);
  });
  it('모으기 85%에서 깊이 100 이하의 가까운 광원은 원래 위치를 유지한다',()=>{
    for(const depth of [2,50,100])expect(convergenceOffset({x:100,y:500,depth},view,.85)).toEqual({x:0,y:0});
  });
  it('깊이 500의 광원은 소실점과의 거리가 57.5%, 깊이 900은 15%로 줄어든다',()=>{
    for(const [depth,factor] of [[500,.575],[900,.15]]){const p={x:900,y:450,depth},d=convergenceOffset(p,view,.85);expect(radial({x:p.x+d.x,y:p.y+d.y})/radial(p)).toBeCloseTo(factor,10);}
  });
  it('100%로 모으면 깊이 900 이상의 광원 중심이 소실점에 모인다',()=>{
    const p={x:100,y:500,depth:1000},d=convergenceOffset(p,view,1);expect(p.x+d.x).toBeCloseTo(view.center,10);expect(p.y+d.y).toBeCloseTo(view.horizon,10);
  });
  it('지면·눈높이·머리 위 광원이 850→500→250→100으로 가까워지면 중심에서 계속 넓게 벌어진다',()=>{
    for(const h of [.25,67.6,150])for(const x of [-40,40]){const radii=[850,500,250,100].map(z=>radial(moved(x,z,h)));for(let i=1;i<radii.length;i++)expect(radii[i]).toBeGreaterThan(radii[i-1]);}
  });
  it('깊이 100과 900 경계의 양쪽 0.001 차이에서 모으기 위치가 갑자기 뛰지 않는다',()=>{
    for(const depth of [100,900]){const a=convergenceOffset({x:900,y:450,depth:depth-.001},view,.85),b=convergenceOffset({x:900,y:450,depth:depth+.001},view,.85);expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(.00001);}
  });
  it('삼각형을 중심 쪽으로 이동해도 꼭짓점 사이 길이와 깊이·색 데이터가 바뀌지 않는다',()=>{
    const points=[{x:0,y:0,depth:500},{x:8,y:0,depth:503},{x:4,y:Math.sqrt(48),depth:501}];const moved=shiftProjection(points,{x:30,y:-40});
    for(let i=0;i<points.length;i++){const j=(i+1)%points.length;expect(Math.hypot(moved[i].x-moved[j].x,moved[i].y-moved[j].y)).toBeCloseTo(8,10);expect(moved[i].depth).toBe(points[i].depth);}expect(points[0]).toEqual({x:0,y:0,depth:500});
  });
  it('돌파의 같은 삼각형 여러 색 면은 모으기 0→85%에서 같은 양만 이동하고 채움·배색은 유지된다',()=>{
    const light={id:'test-cone',x:35,z:500,elevation:110,layer:'overhead',kind:'point',extent:4,bright:1,faceWidth:2,faceLength:6,basisU:[1,0,0],basisV:[0,0,1]};
    const options={scenario:'breakthrough',palette:'breakthrough',seed:42,mask:15};const before=visibleLights([light],0,view,'surface',{...options,convergence:0}),after=visibleLights([light],0,view,'surface',{...options,convergence:.85});expect(before.length).toBeGreaterThan(1);expect(after).toHaveLength(before.length);
    const dx=after[0].surface[0].x-before[0].surface[0].x,dy=after[0].surface[0].y-before[0].surface[0].y;
    before.forEach((p,i)=>{expect(after[i].id).toBe(p.id);expect(after[i].rgb).toEqual(p.rgb);expect(after[i].mask).toBe(p.mask);p.surface.forEach((point,j)=>{expect(after[i].surface[j].x-point.x).toBeCloseTo(dx,10);expect(after[i].surface[j].y-point.y).toBeCloseTo(dy,10);});});
  });
  it('이륙·침투는 모으기 값을 0에서 100%로 바꿔도 광원 위치와 면이 동일하다',()=>{
    for(const key of ['liftoff','infiltration']){const v=cameraAt(key,.23,1200,600),lights=makeLights(key,'mixed','flow'),options={scenario:key,palette:key,seed:42};expect(visibleLights(lights,130,v,'surface',{...options,convergence:1})).toEqual(visibleLights(lights,130,v,'surface',{...options,convergence:0}));}
  });
  it('모으기 85%의 돌파도 휴대폰 상단 18%에 10초 동안 광원이 계속 지나간다',()=>{
    const v=cameraAt('breakthrough',.12,390,490,1,'mixed'),lights=makeLights('breakthrough','mixed','flow');
    for(let t=0;t<=10;t+=.5){const current=visibleLights(lights,130+54*t,v,'surface',{scenario:'breakthrough',palette:'breakthrough',seed:42,convergence:.85});expect(current.some(p=>p.x>0&&p.x<390&&p.y>0&&p.y<490*.18)).toBe(true);}
  });
});
