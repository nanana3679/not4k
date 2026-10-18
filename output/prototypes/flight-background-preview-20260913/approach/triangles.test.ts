import { describe, expect, it } from 'vitest';
import { cells, vertices, triangleParts, countCells, masksForCount, fillCount, maskMode, lightMask, toggleCell, triangleFrame, triangleWorldParts, projectObject, objectScale } from './triangles.mjs';
import { cameraAt, visibleLights, makeLights, advanceTrails } from './motion.mjs';
const area=(points:number[][])=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1]},0))/2;
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
const lamp={id:'triangle',x:15,z:200,elevation:67.6,layer:'eye',kind:'horizontal',extent:12,bright:1};
const view=()=>({...cameraAt('breakthrough',.12,1200,600,1,'mixed'),sinPitch:0,cosPitch:1});

describe('정삼각형 네 칸의 채움 조합',()=>{
  it('큰 정삼각형의 네 칸은 모두 한 변이 0.5이고 각 면적은 큰 삼각형의 1/4이다',()=>{
    for(const cell of cells){const points=cell.vertices.map(i=>vertices[i]);for(let i=0;i<3;i++)expect(distance(points[i],points[(i+1)%3])).toBeCloseTo(.5,12);expect(area(points)).toBeCloseTo(Math.sqrt(3)/16,12);}
  });
  it('1·2·3·4칸을 채우는 조합 수는 4·6·4·1개이며 전체 비어 있지 않은 조합은 15개다',()=>{
    expect(['1','2','3','4'].map(n=>masksForCount(n).length)).toEqual([4,6,4,1]);expect(new Set(masksForCount('all')).size).toBe(15);expect(masksForCount('all')).not.toContain(0);
  });
  it('15가지 채움 조합 모두 합쳐진 면적이 채운 칸 수 × 정삼각형 면적의 1/4과 같다',()=>{
    for(const mask of masksForCount('all'))expect(triangleParts(mask).reduce((sum,p)=>sum+area(p.outline),0)).toBeCloseTo(countCells(mask)*Math.sqrt(3)/16,12);
  });
  it('네 칸을 모두 채우면 내부 변 없이 꼭짓점 3개인 정삼각형 한 면이 된다',()=>{
    const parts=triangleParts(15);expect(parts).toHaveLength(1);expect(parts[0].outline).toHaveLength(3);for(let i=0;i<3;i++)expect(distance(parts[0].outline[i],parts[0].outline[(i+1)%3])).toBeCloseTo(1,12);
  });
  it('위와 가운데를 채우면 공유 변이 사라지고 네 꼭짓점의 한 면으로 이어진다',()=>{
    const parts=triangleParts(5);expect(parts).toHaveLength(1);expect(parts[0].outline).toHaveLength(4);
  });
  it('가운데를 비우고 바깥 세 칸을 채우면 가운데를 가로지르지 않는 세 면을 유지한다',()=>{
    const parts=triangleParts(11);expect(parts).toHaveLength(3);expect(parts.map(p=>p.part)).toEqual([1,2,8]);expect(parts.every(p=>p.outline.length===3)).toBe(true);
  });
  it('위와 왼쪽 아래는 꼭짓점에서만 닿으므로 두 면 사이에 새 연결 면을 만들지 않는다',()=>{
    expect(triangleParts(3)).toHaveLength(2);expect(triangleParts(3).reduce((sum,p)=>sum+area(p.outline),0)).toBeCloseTo(Math.sqrt(3)/8,12);
  });
  it('모두 비운 0에서는 면이 없고 마지막 위 칸을 끄거나 다시 켤 수 있다',()=>{
    expect(triangleParts(0)).toEqual([]);expect(toggleCell(1,1)).toBe(0);expect(toggleCell(0,1)).toBe(1);
  });
});

describe('정삼각형의 비행 공간 투영과 잔광',()=>{
  it('눈높이·수직·지면·원근 흐름 방향 모두 큰 삼각형의 세계 좌표 세 변 길이가 같다',()=>{
    const sources=[lamp,{...lamp,kind:'vertical'}, {...lamp,kind:'point',layer:'ground',elevation:.25},makeLights('breakthrough','mixed','flow').find(l=>l.layer==='eye')];
    for(const source of sources){const p=triangleWorldParts(source,200,{mask:15})[0].points;expect(distance(p[0],p[1])).toBeCloseTo(distance(p[1],p[2]),10);expect(distance(p[1],p[2])).toBeCloseTo(distance(p[2],p[0]),10);}
  });
  it('면 비율이 폭 2·길이 8이던 광원도 전체 정삼각형 면적은 16이고 세 변 길이는 같다',()=>{
    const frame=triangleFrame({...lamp,faceWidth:2,faceLength:8},200);expect(frame.side**2*Math.sqrt(3)/4).toBeCloseTo(16,10);
  });
  it('위 칸만 채워도 기준 정삼각형의 중심으로 재배치하지 않고 위쪽 위치를 유지한다',()=>{
    const frame=triangleFrame(lamp,200),points=triangleWorldParts(lamp,200,{mask:1})[0].points;
    expect(points.reduce((sum,p)=>sum+p[1],0)/3).toBeGreaterThan(frame.center[1]);
  });
  it('수직 정삼각형을 100%에서 300%로 키우면 중심은 그대로이고 변은 3배가 된다',()=>{
    const source={...lamp,kind:'vertical'},a=triangleWorldParts(source,200,{mask:15,scale:1})[0].points,b=triangleWorldParts(source,200,{mask:15,scale:3})[0].points;
    expect(distance(b[0],b[1])/distance(a[0],a[1])).toBeCloseTo(3,10);for(let axis=0;axis<3;axis++)expect(a.reduce((s,p)=>s+p[axis],0)/3).toBeCloseTo(b.reduce((s,p)=>s+p[axis],0)/3,10);
  });
  it('가운데가 빈 세 면이 거리 200에서 198로 이동하면 각자의 경로에 잔광 3개가 남는다',()=>{
    const old=visibleLights([lamp],0,view(),'surface',{mask:11}),current=visibleLights([lamp],2,view(),'surface',{mask:11});
    expect(new Set(current.map(p=>p.id)).size).toBe(3);const frames=advanceTrails([],old,current,1,.14);expect(frames[0].segments).toHaveLength(3);
    frames[0].segments.forEach((s,i)=>expect(s).toMatchObject({x1:old[i].x,y1:old[i].y,x2:current[i].x,y2:current[i].y}));
  });
  it('지면의 삼각형이 가까운 경계를 넘으면 깊이 2에서 잘라 유한한 좌표만 남긴다',()=>{
    const parts=projectObject({...lamp,layer:'ground',kind:'point',elevation:0},2,view(),{mask:15});expect(parts.length).toBeGreaterThan(0);expect(parts.flatMap(p=>p.points).every(p=>p.depth>=2-1e-8&&Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
  });
  it('모두 비운 조합과 카메라 뒤 거리 -200의 조합은 표시할 면을 반환하지 않는다',()=>{
    expect(projectObject(lamp,200,view(),{mask:0})).toEqual([]);expect(projectObject(lamp,-200,view(),{mask:15})).toEqual([]);
  });
  it('세 난이도에서 15가지 조합을 바꿔도 광원 위치·개수·밝기는 원본 그대로다',()=>{
    for(const key of ['liftoff','infiltration','breakthrough']){const lights=makeLights(key,'mixed','flow'),saved=structuredClone(lights),v=cameraAt(key,.12,1200,600,1,'mixed');for(const mask of [1,5,11,15])expect(visibleLights(lights,130,v,'surface',{mask}).length).toBeGreaterThan(0);expect(lights).toEqual(saved);}
  });
});

describe('채움 선택과 공유 주소',()=>{
  it('혼합 모드에서 동일한 ID는 전진 위치가 바뀌어도 같은 채움 조합을 유지한다',()=>{
    expect(lightMask(lamp)).toBe(lightMask({...lamp,z:180}));for(const fill of ['1','2','3','4'])expect(countCells(lightMask(lamp,{fill}))).toBe(Number(fill));
  });
  it('mask=0과 15는 고정 조합이고 없거나 16·-1·1.5이면 혼합 모드다',()=>{
    expect(maskMode('0')).toBe(0);expect(maskMode('15')).toBe(15);for(const value of [null,'16','-1','1.5','all'])expect(maskMode(value)).toBeNull();expect(lightMask(lamp,{mask:0})).toBe(0);
  });
  it('fill은 1~4만 칸 수를 고정하며 0·5·빈 값은 전체 15조합을 섞는다',()=>{
    expect(fillCount('2')).toBe('2');for(const value of [null,'0','5'])expect(fillCount(value)).toBe('all');
  });
  it('크기가 없거나 유효하지 않으면 100%, 400%는 300%로 제한하고 180%는 유지한다',()=>{
    expect(objectScale(null)).toBe(1);expect(objectScale('bad')).toBe(1);expect(objectScale(4)).toBe(3);expect(objectScale(1.8)).toBe(1.8);
  });
});
