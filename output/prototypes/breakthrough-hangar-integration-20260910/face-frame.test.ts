import {describe,it,expect} from 'vitest';
import {readSettings,scenePyramid,lightLayout,collectFaces,travelAt} from './integration.mjs';
import {viewAt,advanceMotion} from './legacy/geometry.mjs';
import {FaceFrame} from './face-frame.mjs';
import {LightBatch,writeFaceLayers,writeTrailFaces} from './light-batch.mjs';
import {TrailPool,advanceTrails,trailAlpha} from './world-trails.mjs';
import {breakthroughSearch} from '../flight-background-preview-20260913/flight-presets.mjs';

// 버퍼 재사용 전 구현(fcc4086)으로 같은 입력을 계산해 기록한 값과 비교한다.
// 그림을 일부러 바꾸는 변경이라면 실패 메시지의 새 값으로 기준값을 갱신한다.
class Hash{
 h1=0x811c9dc5;h2=(0x01000193^0x5bd1e995)>>>0;
 bytes(bytes:Uint8Array){for(const b of bytes){this.h1=Math.imul(this.h1^b,16777619)>>>0;this.h2=Math.imul(this.h2^b,0x5bd1e995)>>>0;this.h2=(this.h2^(this.h2>>>13))>>>0;}}
 num(v:number){const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,v);this.bytes(new Uint8Array(view.buffer));}
 f32(values:Float32Array,count:number){this.bytes(new Uint8Array(values.buffer,values.byteOffset,count*4));}
 hex(){return this.h1.toString(16).padStart(8,'0')+this.h2.toString(16).padStart(8,'0');}
}
const hashBatch=(hash:Hash,batch:LightBatch)=>{const at=batch.geometry.attributes;hash.num(batch.count);hash.f32(at.position.array,batch.count*3);hash.f32(at.tint.array,batch.count*4);hash.f32(at.offset.array,batch.count*2);};
type Face={id:string;outline:boolean;rgb:number[];points:number[][];edges?:boolean[];surface:string;screen:{x:number;y:number}[];alpha:number;lineWidth:number;frame:{t:number;cycle:number;point:number[];forward:number[];across:number[];side:number;stretch:number}};
const plainFace=(f:Face)=>({id:f.id,outline:f.outline,rgb:f.rgb,points:f.points.map(p=>[...p]),edges:f.edges&&[...f.edges],surface:f.surface,screen:f.screen.map(p=>({x:p.x,y:p.y})),alpha:f.alpha,lineWidth:f.lineWidth,
 frame:{t:f.frame.t,cycle:f.frame.cycle,point:[...f.frame.point],forward:[...f.frame.forward],across:[...f.frame.across],side:f.frame.side,stretch:f.frame.stretch}});

describe('돌파 광원 면 버퍼 재사용',()=>{
 for(const [label,search,floor] of [['게임 기본 직선',breakthroughSearch,false],['삼각형',`variant=triangles`,false],['혼합·이전 시점',`variant=mixed&clearance=0`,false],['윤곽선 100%',`variant=triangles&outline=1`,false],['바닥·천장 광원',`variant=lines`,true]] as const)it(`${label}은 고도 0·50·100%와 전진 0·35·1902·2500에서 FaceFrame 두 개를 번갈아 써도 legacy 기반 collectFaces와 면 값이 같다`,()=>{
  const s=readSettings(search);if(floor){s.floor=true;s.ceiling=true;}
  const lights=lightLayout(s),frames=[new FaceFrame(),new FaceFrame()];let k=0;
  for(const altitude of [0,.5,1])for(const travel of [0,35,1902.35,2500.123]){
   s.altitude=altitude;const p=scenePyramid(s),v=viewAt(960,540,altitude,p);
   const fresh=collectFaces(lights,travel,s,p,v),reused=collectFaces(lights,travel,s,p,v,frames[k++%2]);
   expect(reused.length).toBeGreaterThan(0);
   expect(reused.map(plainFace)).toEqual(fresh.map(plainFace));
  }
 });

 it('같은 FaceFrame으로 다음 프레임을 계산하면 같은 면 배열과 면 객체를 다시 쓴다',()=>{
  const s=readSettings(breakthroughSearch),lights=lightLayout(s),frame=new FaceFrame(),p=scenePyramid(s),v=viewAt(960,540,s.altitude,p);
  const first=collectFaces(lights,1900,s,p,v,frame),face=first.find(f=>f.id.startsWith('p0-0/'));
  const second=collectFaces(lights,1900.5,s,p,v,frame);
  expect(second).toBe(first);
  expect(second.find(f=>f.id.startsWith('p0-0/'))).toBe(face);
 });

 it('광원 크기 0%는 FaceFrame을 넘겨도 빈 면 배열을 돌려준다',()=>{
  const s=readSettings('size=0'),p=scenePyramid(s);
  expect(collectFaces(lightLayout(s),0,s,p,viewAt(800,450,.5,p),new FaceFrame())).toEqual([]);
 });

 it('게임 돌파 960×540 57프레임(40번째 재시작 포함)을 면·잔상 버퍼 재사용으로 그린 세 겹 정점은 재사용 전 해시 561f6083eef66e34와 같다',()=>{
  const sequence:[number,number][]=[];
  for(const [altitude,dt,count] of [[1,0,1],[.9,1/60,12],[.5,1/144,20],[.2,.05,6],[0,1/60,10],[.68,1/120,8]] as const)for(let i=0;i<count;i++)sequence.push([altitude,dt]);
  const core=new LightBatch(),halo=new LightBatch(true),after=new LightBatch(true),frames=[new FaceFrame(),new FaceFrame()],pool=new TrailPool();
  let state:ReturnType<typeof readSettings>,motion:{travel:number;time:number;noteTime:number},lights:unknown[],previous:Face[]=[],trails:unknown[]=[],k=0;
  const reset=()=>{state=readSettings(breakthroughSearch);motion={travel:travelAt(state.progress,scenePyramid(state)),time:0,noteTime:0};lights=lightLayout(state);previous=[];trails=pool.clear();};
  reset();
  const hash=new Hash();let faces=0,samples=0;
  sequence.forEach(([altitude,dt],index)=>{
   if(index===40)reset();
   state.altitude=altitude;motion=advanceMotion(motion,dt,state.speed,true);
   const pyramid=scenePyramid(state),view=viewAt(960,540,altitude,pyramid);
   k=1-k;const current=collectFaces(lights,motion.travel,state,pyramid,view,frames[k]);
   trails=advanceTrails(trails,previous,current,motion.time,state.trail,dt,undefined,pool);previous=current;
   core.begin();halo.begin();after.begin();
   writeTrailFaces(after,trails,view,motion.time,state.trail);writeFaceLayers(core,halo,current,view);
   core.end();halo.end();after.end();
   hashBatch(hash,after);hashBatch(hash,halo);hashBatch(hash,core);faces+=current.length;samples+=trails.length;
  });
  expect({hash:hash.hex(),faces,samples}).toEqual({hash:'561f6083eef66e34',faces:15059,samples:460112});
  for(const batch of [core,halo,after])batch.dispose();
 });

 it('writeFaceLayers·writeTrailFaces는 면마다 face(core)·face(halo,α×.07,3)·face(halo,α×.025,8)과 잔상 face(after,trailAlpha)와 같은 정점을 쓴다',()=>{
  const s=readSettings(breakthroughSearch),lights=lightLayout(s),p=scenePyramid(s),v=viewAt(960,540,.4,p);
  const faces=collectFaces(lights,1900,s,p,v),samples=advanceTrails([],faces,collectFaces(lights,1902,s,p,v),.016,.12,.016);
  const bulk=[new LightBatch(),new LightBatch(true),new LightBatch(true)],single=[new LightBatch(),new LightBatch(true),new LightBatch(true)];
  for(const b of [...bulk,...single])b.begin();
  writeFaceLayers(bulk[0],bulk[1],faces,v);writeTrailFaces(bulk[2],samples,v,.03,.12);
  for(const face of faces){single[0].face(face,v);single[1].face(face,v,face.alpha*.07,3);single[1].face(face,v,face.alpha*.025,8);}
  for(const sample of samples)single[2].face(sample,v,trailAlpha(sample,.03,.12));
  for(const b of [...bulk,...single])b.end();
  expect(samples.length).toBeGreaterThan(0);
  for(let i=0;i<3;i++){const a=new Hash(),b=new Hash();hashBatch(a,bulk[i]);hashBatch(b,single[i]);expect(bulk[i].count).toBe(single[i].count);expect(a.hex()).toBe(b.hex());}
 });
});
