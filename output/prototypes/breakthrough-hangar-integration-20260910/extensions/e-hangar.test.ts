import {expect,it} from 'vitest';
import {createExtensionBlueprint} from './e-hangar.mjs';
import {hangarBlueprint} from '../originals/hangar.mjs';

const model=createExtensionBlueprint();
const bounds=part=>({min:part.position.map((v,i)=>v-part.size[i]/2),max:part.position.map((v,i)=>v+part.size[i]/2)});
const intersects=(a,b)=>a.min.every((v,i)=>v<b.max[i]&&a.max[i]>b.min[i]);
const contains=(part,p)=>{const b=bounds(part);return p.every((v,i)=>v>b.min[i]+.01&&v<b.max[i]-.01);};
const box=id=>model.boxes.find(p=>p.id===id);

it('E 양쪽 소켓은 원래 하단 -4와 겹치고 서비스 축은 화물층 -122까지 이어진다',()=>{
 for(const side of ['left','right']){
  const socket=bounds(box(`${side}-pier-socket`));
  expect(intersects(socket,hangarBlueprint().solids.find(p=>p.id===`${side}-pier`).bounds)).toBe(true);
  let previous=socket;
  for(let i=0;i<4;i++){
   const current=bounds(box(`${side}-service-core-${i}`));
   expect(intersects(previous,current)).toBe(true);previous=current;
  }
  expect(previous.min[1]).toBeLessThanOrEqual(-124);
  expect(intersects(previous,bounds(box('cargo-transfer-2-roof')))).toBe(true);
 }
});

it('E 정비층·화물층의 앞 작업 공간은 실제로 비어 있고 바닥·뒤 방·측벽은 서로 접한다',()=>{
 expect(model.levels.length).toBeGreaterThanOrEqual(20);
 for(const level of model.levels){
  const floor=box(level.id+'-floor'),room=box(level.id+'-room'),side=box(level.id+'-side-wall');
  const fb=bounds(floor),rb=bounds(room),sb=bounds(side);
  expect(fb.max[1]).toBe(level.floor);
  expect(rb.min[1]).toBe(level.floor);expect(sb.min[1]).toBe(level.floor);
  expect(sb.min[2]).toBe(rb.max[2]);
  const point=[floor.position[0],level.floor+2.8,fb.max[2]-2];
  expect(model.boxes.some(p=>contains(p,point)),level.id).toBe(false);
  expect(model.boxes.some(p=>intersects(bounds(p),level.apron)),level.id+' 전체 작업 공간').toBe(false);
  expect(fb.min[2]).toBeLessThan(rb.max[2]);expect(fb.max[2]-rb.max[2]).toBeGreaterThan(10);
 }
});

it('E 양쪽 정비층의 문·점등 창은 공용 승강 축 내부에 묻히지 않고 앞에서 보인다',()=>{
 for(const panel of model.panels){
  const center=panel.points[0].map((v,i)=>(v+panel.points[2][i])/2);
  expect(model.boxes.some(p=>contains(p,center)),panel.id).toBe(false);
  for(const point of panel.points)expect(model.boxes.some(p=>contains(p,point)),panel.id).toBe(false);
 }
});

it('E 두 층짜리 정비 묶음은 층고 6과 문 높이 2.8을 쓰며 묶음 사이에 12 이상 쉼 구간을 둔다',()=>{
 for(const side of ['left','right']){
  const lower=model.levels.filter(l=>l.id.startsWith(side+'-service')&&l.id.endsWith('lower'));
  expect(lower).toHaveLength(4);
  for(let i=0;i<lower.length;i++){
   const upper=model.levels.find(l=>l.id===lower[i].id.replace('lower','upper'));
   expect(upper.floor-lower[i].floor).toBe(6);
   if(i)expect(lower[i-1].floor-(lower[i].floor+12)).toBeGreaterThanOrEqual(12);
  }
 }
 const doors=model.panels.filter(p=>p.texture==='door');
 expect(doors).toHaveLength(model.levels.length);
 expect(doors.every(p=>Math.abs(p.points[2][1]-p.points[0][1]-2.8)<1e-8)).toBe(true);
 expect(model.panels.filter(p=>p.texture==='window').length).toBeLessThan(model.levels.length/3);
});

it('E 중앙 통과공간 x=16・z=8은 y=-100~-12와 원래 격납고 안에서 막히지 않는다',()=>{
 for(const y of [-100,-84,-62,-40,-24,-12,12,25,38])
  expect(model.boxes.some(p=>contains(p,[16,y,8])),String(y)).toBe(false);
 const original=hangarBlueprint();
 for(const panel of original.panels)for(const point of panel.points)
  expect(model.boxes.some(p=>contains(p,point))).toBe(false);
});

it('E 화물 승강 축은 -139에서 -640까지 끊기지 않고 네 적재층 묶음과 접속한다',()=>{
 const cores=model.boxes.filter(p=>p.id.startsWith('cargo-lift-core-'));
 expect(bounds(cores[0]).max[1]).toBe(-139);
 expect(bounds(cores.at(-1)).min[1]).toBe(-640);
 for(let i=1;i<cores.length;i++)expect(intersects(bounds(cores[i-1]),bounds(cores[i]))).toBe(true);
 for(const level of model.levels.filter(l=>l.id.startsWith('lower-loading')))
  expect(cores.some(p=>intersects(bounds(p),bounds(box(level.id+'-floor')))),level.id).toBe(true);
});

it('E 모든 부재는 양의 크기이며 깊이 -54~22 안에 있어 최대180%의 안개 뒤에서 재사용할 수 있다',()=>{
 const ids=model.boxes.map(p=>p.id).concat(model.beams.map(p=>p.id),model.panels.map(p=>p.id));
 expect(new Set(ids).size).toBe(ids.length);
 for(const part of model.boxes){
  expect([...part.position,...part.size].every(Number.isFinite)).toBe(true);
  expect(part.size.every(n=>n>0)).toBe(true);
  expect(bounds(part).min[2]).toBeGreaterThanOrEqual(-54);
  expect(bounds(part).max[2]).toBeLessThanOrEqual(22);
 }
});
