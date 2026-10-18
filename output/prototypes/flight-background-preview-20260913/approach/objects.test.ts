import { describe, expect, it } from 'vitest';
import { panelObjectTemplate, projectScenarioObject, objectKind } from './objects.mjs';
import { projectSurface } from './surface.mjs';
import { cameraAt } from './motion.mjs';
import { objectColor, cellColors, secondaryRatio, palettes } from './palette.mjs';
import { triangleWorldParts } from './triangles.mjs';
const lamp={id:'panel',x:15,z:200,elevation:.25,layer:'ground',kind:'horizontal',extent:4,bright:1};
describe('난이도별 광원 형태 복원',()=>{
  it('이륙·침투는 panel, 돌파는 triangle을 선택한다',()=>{
    expect(objectKind('liftoff')).toBe('panel');expect(objectKind('infiltration')).toBe('panel');expect(objectKind('breakthrough')).toBe('triangle');
  });
  it('이륙·침투의 크기 100% 발광 면은 시연 13과 동일한 투영 좌표·6개 꼭짓점을 쓴다',()=>{
    for(const key of ['liftoff','infiltration']){const view=cameraAt(key,.23,1200,600),parts=projectScenarioObject(lamp,200,view,{palette:key,seed:42,scale:1});
      expect(parts).toHaveLength(1);expect(parts[0].geometry).toBe('panel');expect(parts[0].points).toHaveLength(6);expect(parts[0].points).toEqual(projectSurface(lamp,200,view));expect(palettes[key].colors).toContainEqual(parts[0].rgb);
    }
  });
  it('이륙 수직 광원도 삼각형으로 바꾸지 않고 기존 세워진 발광 면의 좌표를 유지한다',()=>{
    const source={...lamp,kind:'vertical',extent:14},view=cameraAt('liftoff',.68,1200,600);
    expect(projectScenarioObject(source,200,view,{palette:'liftoff',scale:1})[0].points).toEqual(projectSurface(source,200,view));
  });
  it('돌파에서 네 칸을 같은 색으로 채운 원형은 꼭짓점 3개인 삼각형 한 면이다',()=>{
    const parts=projectScenarioObject(lamp,200,cameraAt('breakthrough',.12,1200,600),{scenario:'breakthrough',mask:15});
    expect(parts).toHaveLength(1);expect(parts[0].geometry).toBe('triangle');expect(parts[0].points).toHaveLength(3);
  });
  it('같은 광원·크기·배색을 두 번 요청하면 캐시한 panel 템플릿을 재사용하고 원본은 변경하지 않는다',()=>{
    const source={...lamp},options={scenario:'infiltration',palette:'infiltration',seed:42,secondary:.15,scale:1};
    const first=panelObjectTemplate(source,options),second=panelObjectTemplate(source,options);
    expect(second).toBe(first);expect(source).toEqual(lamp);
    expect(panelObjectTemplate(source,{...options,scale:2})).not.toBe(first);
  });
});
describe('Primary와 Secondary의 서로 다른 등장 빈도',()=>{
  it('세 난이도에서 광원 1000개의 보조색 선택은 기본 20% 주변인 17~23%다',()=>{
    for(const key of Object.keys(palettes)){const chosen=Array.from({length:1000},(_,i)=>objectColor('sample-'+i,key,42));
      const count=chosen.filter(c=>c.tier==='secondary').length;expect(count).toBeGreaterThanOrEqual(170);expect(count).toBeLessThanOrEqual(230);
      expect(chosen.every(c=>palettes[key][c.tier].colors.some(rgb=>rgb.every((n,i)=>n===c.rgb[i])))).toBe(true);
    }
  });
  it('보조색 비율 0%면 400개의 작은 삼각형이 모두 주조색이고 50%면 보조색이 160~240개다',()=>{
    const none=Array.from({length:100},(_,i)=>cellColors('sample-'+i,15,'breakthrough',42,0)).flat();
    const half=Array.from({length:100},(_,i)=>cellColors('sample-'+i,15,'breakthrough',42,.5)).flat();
    expect(none.every(c=>c.tier==='primary')).toBe(true);expect(half.filter(c=>c.tier==='secondary').length).toBeGreaterThanOrEqual(160);expect(half.filter(c=>c.tier==='secondary').length).toBeLessThanOrEqual(240);
  });
  it('보조색 비율을 20%에서 30%로 높여도 이미 보조색이던 칸의 색은 바뀌지 않는다',()=>{
    for(let i=0;i<100;i++){const a=cellColors('sample-'+i,15,'breakthrough',42,.2),b=cellColors('sample-'+i,15,'breakthrough',42,.3);for(const c of a.filter(c=>c.tier==='secondary'))expect(b.find(n=>n.bit===c.bit)).toEqual(c);}
  });
  it('같은 광원의 보조색 비율을 50%→0%→50%로 바꾸면 캐시가 갱신되고 원래 배색이 복원된다',()=>{
    const options={palette:'breakthrough',seed:42,mask:15,secondary:.5},first=triangleWorldParts(lamp,200,options);
    expect(triangleWorldParts(lamp,200,{...options,secondary:0}).every(p=>p.tier==='primary')).toBe(true);expect(triangleWorldParts(lamp,200,options)).toEqual(first);
  });
  it('보조색 비율이 없으면 20%, 음수는 0%, 80%는 50%로 제한하고 35%는 유지한다',()=>{
    expect(secondaryRatio(null)).toBe(.2);expect(secondaryRatio('bad')).toBe(.2);expect(secondaryRatio(-.1)).toBe(0);expect(secondaryRatio(.8)).toBe(.5);expect(secondaryRatio(.35)).toBe(.35);
  });
});
