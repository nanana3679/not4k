import { describe, expect, it } from 'vitest';
import { palettes, cellColors, colorGroups, seedMode, paletteKey } from './palette.mjs';
import { lightMask, triangleWorldParts, triangleParts, countCells } from './triangles.mjs';
import { cameraAt, visibleLights, advanceTrails, makeLights } from './motion.mjs';
const lamp={id:'triangle',x:15,z:200,elevation:67.6,layer:'eye',kind:'horizontal',extent:12,bright:1};
const view=()=>({...cameraAt('breakthrough',.12,1200,600,1,'mixed'),sinPitch:0,cosPitch:1});
const area=(points:number[][])=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1]},0))/2;

describe('작은 삼각형별 자동 팔레트 선택',()=>{
  it('세 난이도에서 100개 광원의 네 칸은 해당 난이도의 주조·보조 6색 팔레트 안에서만 색을 고른다',()=>{
    for(const key of Object.keys(palettes))for(let i=0;i<100;i++){
      const colors=cellColors('sample-'+i,15,key,42);expect(colors).toHaveLength(4);
      for(const cell of colors)expect(palettes[key].colors).toContainEqual(cell.rgb);
    }
  });
  it('seed=42에서 네 칸을 채운 광원 100개 중 80개 이상은 한 오브젝트 안에 2색 이상을 가진다',()=>{
    const colorful=Array.from({length:100},(_,i)=>new Set(cellColors('sample-'+i,15,'breakthrough',42).map(c=>c.colorIndex)).size).filter(n=>n>=2);
    expect(colorful.length).toBeGreaterThanOrEqual(80);
  });
  it('가운데를 비운 mask=11은 위·왼쪽 아래·오른쪽 아래에만 색을 배정한다',()=>{
    expect(cellColors(lamp.id,11,'liftoff',42).map(c=>c.bit)).toEqual([1,2,8]);expect(cellColors(lamp.id,0,'liftoff',42)).toEqual([]);
  });
  it('같은 광원·칸·seed는 다시 생성하거나 다른 난이도를 거쳐 돌아와도 같은 색을 유지한다',()=>{
    const before=cellColors(lamp.id,15,'infiltration',42);cellColors(lamp.id,15,'breakthrough',42);
    expect(cellColors(lamp.id,15,'infiltration',42)).toEqual(before);
  });
  it('네 칸 중 가운데를 비워도 나머지 세 칸의 색은 바뀌지 않는다',()=>{
    expect(cellColors(lamp.id,11,'breakthrough',42)).toEqual(cellColors(lamp.id,15,'breakthrough',42).filter(c=>c.bit!==4));
  });
  it('seed를 42에서 43으로 바꾸면 100개 광원 중 80개 이상에서 색 조합이 달라진다',()=>{
    let changed=0;for(let i=0;i<100;i++)if(JSON.stringify(cellColors('sample-'+i,15,'liftoff',42))!==JSON.stringify(cellColors('sample-'+i,15,'liftoff',43)))changed++;
    expect(changed).toBeGreaterThanOrEqual(80);
  });
  it('1000개 광원에 배정한 4000칸에서 가장 밝은 보조색은 10% 미만이고 6색이 모두 등장한다',()=>{
    const indices=Array.from({length:1000},(_,i)=>cellColors('sample-'+i,15,'breakthrough',42)).flat().map(c=>c.colorIndex);
    expect(new Set(indices).size).toBe(6);expect(indices.filter(i=>i===5).length).toBeLessThan(400);
  });
});
describe('배색된 면과 잔광',()=>{
  it('15가지 채움 조합에서 같은 색끼리 합쳐도 원래 채운 총면적이 유지된다',()=>{
    for(let mask=1;mask<=15;mask++){
      const groups=colorGroups(lamp.id,mask,'breakthrough',42);
      expect(groups.reduce((bits,g)=>bits|g.mask,0)).toBe(mask);
      const total=groups.flatMap(g=>triangleParts(g.mask)).reduce((sum,p)=>sum+area(p.outline),0);
      expect(total).toBeCloseTo(countCells(mask)*Math.sqrt(3)/16,12);
      for(const g of groups)expect(cellColors(lamp.id,g.mask,'breakthrough',42).every(c=>c.colorIndex===g.colorIndex)).toBe(true);
    }
  });
  it('색 선택은 전진 위치 200→198과 크기 100→200%를 바꿔도 바뀌지 않는다',()=>{
    const a=triangleWorldParts(lamp,200,{palette:'breakthrough',seed:42,scale:1});
    const b=triangleWorldParts(lamp,198,{palette:'breakthrough',seed:42,scale:2});
    expect(a.map(p=>({part:p.part,rgb:p.rgb,mask:p.mask}))).toEqual(b.map(p=>({part:p.part,rgb:p.rgb,mask:p.mask})));
  });
  it('여러 색의 삼각형이 거리 200→198로 움직이면 각 면의 색이 그 면의 실제 경로 잔광에 기록된다',()=>{
    const options={palette:'breakthrough',seed:42,mask:15},old=visibleLights([lamp],0,view(),'surface',options),current=visibleLights([lamp],2,view(),'surface',options);
    const frames=advanceTrails([],old,current,1,.14);expect(frames).toHaveLength(1);expect(frames[0].segments.length).toBe(current.length);
    frames[0].segments.forEach((s,i)=>expect(s).toMatchObject({x1:old[i].x,y1:old[i].y,x2:current[i].x,y2:current[i].y,rgb:current[i].rgb}));
  });
  it('난이도를 바꾸면 같은 광원 캐시도 해당 팔레트로 갱신되고 원래 난이도로 돌아오면 복원된다',()=>{
    const before=triangleWorldParts(lamp,200,{palette:'liftoff',seed:42,mask:15});
    const changed=triangleWorldParts(lamp,200,{palette:'infiltration',seed:42,mask:15});
    expect(changed.every(p=>palettes.infiltration.colors.some(c=>JSON.stringify(c)===JSON.stringify(p.rgb)))).toBe(true);
    expect(triangleWorldParts(lamp,200,{palette:'liftoff',seed:42,mask:15})).toEqual(before);
  });
  it('세 난이도의 자동 혼합은 광원 원본 좌표·개수·밝기를 수정하지 않는다',()=>{
    for(const key of Object.keys(palettes)){const lights=makeLights(key,'mixed','flow'),saved=structuredClone(lights);
      const current=visibleLights(lights,130,cameraAt(key,.12,1200,600,1,'mixed'),'surface',{palette:key,seed:42});
      expect(current.length).toBeGreaterThan(0);expect(current.every(p=>p.rgb)).toBe(true);expect(lights).toEqual(saved);
    }
  });
  it('seed=42의 광원 1000개는 15가지 채움을 모두 포함하고 seed=43으로 바꾸면 혼합 배치가 달라진다',()=>{
    const a=Array.from({length:1000},(_,i)=>lightMask({id:'sample-'+i},{seed:42}));
    const b=Array.from({length:1000},(_,i)=>lightMask({id:'sample-'+i},{seed:43}));
    expect(new Set(a)).toEqual(new Set(Array.from({length:15},(_,i)=>i+1)));expect(b).not.toEqual(a);
  });
  it('seed 0과 4294967295는 복원하고 음수·소수·상한 초과·빈 값은 새 무작위 값으로 대체할 수 있게 null을 반환한다',()=>{
    expect(seedMode('0')).toBe(0);expect(seedMode('4294967295')).toBe(4294967295);for(const value of [null,'','-1','1.5','4294967296'])expect(seedMode(value)).toBeNull();expect(paletteKey('unknown')).toBe('breakthrough');
  });
});
