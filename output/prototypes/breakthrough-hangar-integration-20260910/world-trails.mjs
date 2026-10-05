import {surfaceTrailOpacity} from './legacy/afterglow.mjs';
import {hypot2} from './hypot.mjs';

export const mobileTrailQuality={sampleDistance:8,maxSteps:6,maxSamples:900};
const DEFAULT_QUALITY=Object.freeze({});

export function limitTrailSamples(samples,maxSamples=Infinity){
 if(!Number.isFinite(maxSamples)||samples.length<=maxSamples)return samples;
 const limit=Math.max(0,Math.floor(maxSamples));
 if(limit===0)return [];
 if(limit===1)return [samples.at(-1)];
 const last=samples.length-1;
 return Array.from({length:limit},(_,i)=>samples[Math.round(i*last/(limit-1))]);
}

// Keep world vertices, not a flattened previous framebuffer. Old cycle IDs cannot join.
// pool(TrailPool)을 넘기면 같은 값을 그 버퍼에 다시 써서 표본 객체를 만들지 않는다. 이때 history는 직전에 받은 반환 배열이다.
export function advanceTrails(history,previous,current,now,duration,dt,quality=DEFAULT_QUALITY,pool){
 if(pool)return advanceTrailsInto(pool,history,previous,current,now,duration,dt,quality);
 if(duration<=0)return [];
 const out=history.filter(s=>now-s.time<duration);
 const sampleDistance=Number.isFinite(quality.sampleDistance)&&quality.sampleDistance>0?quality.sampleDistance:4;
 const maxSteps=Number.isFinite(quality.maxSteps)&&quality.maxSteps>0?Math.floor(quality.maxSteps):12;
 const maxSamples=quality.maxSamples??Infinity;
 if(!(dt>0))return limitTrailSamples(out,maxSamples);
 const byId=new Map(current.map(s=>[s.id,s])),interval=Math.min(dt,duration);
 for(const old of previous){
  const next=byId.get(old.id),matches=next?.points.length===old.points.length&&next.outline===old.outline&&old.points.every((_,i)=>(old.edges?.[i]!==false)===(next.edges?.[i]!==false));
  const distance=matches?Math.max(...old.screen.map((p,i)=>Math.hypot(p.x-next.screen[i].x,p.y-next.screen[i].y))):Infinity;
  if(distance<.15)continue;
  if(!matches||distance>180){if(dt<duration)out.push({...old,time:now-dt,interval});continue;}
  const steps=Math.min(maxSteps,Math.max(1,Math.ceil(distance/sampleDistance)));
  for(let i=0;i<steps;i++){
   const phase=(i+.5)/steps,t=(dt-interval+phase*interval)/dt;
   out.push({...old,points:old.points.map((p,j)=>p.map((v,k)=>v+(next.points[j][k]-v)*t)),alpha:old.alpha+(next.alpha-old.alpha)*t,time:now-interval+phase*interval,interval:interval/steps});
  }
 }
 return limitTrailSamples(out,maxSamples);
}
export const trailAlpha=(s,now,duration)=>s.alpha*surfaceTrailOpacity(now-s.time,duration,s.interval,.64);

// 잔상 표본 버퍼. 수명이 끝난 표본 객체를 모아 두었다가 다음 표본으로 다시 쓴다.
// 그리기와 trailAlpha는 points·rgb·outline·edges·lineWidth·alpha·time·interval만 쓴다. 원래 면의 frame·screen은
// FaceFrame 버퍼라 두 프레임 뒤 덮어쓰이므로 표본에 옮기지 않고 null로 둔다(잘못 읽으면 바로 드러나게).
// 재사용 대기 표본은 살아 있는 표본의 2배+256개까지만 남긴다. 잠깐 끊긴 프레임에 생긴 큰 묶음을 계속 붙잡지 않는다.
const FREE_SLACK=256;
export class TrailPool{
 constructor(){
  this.samples=[];this.free=[];this.freeCount=0;
  // 현재 프레임 면을 slotKey로 찾는 표. marks가 이번 호출 번호와 같은 칸만 유효하다.
  this.byKey=[];this.marks=new Int32Array(256);this.mark=0;this.byId=null;
 }
 // 모든 표본을 돌려받고 빈 반환 배열을 준다. 재시작 때 쓴다.
 clear(){
  for(let i=0;i<this.samples.length;i++)this.release(this.samples[i]);
  this.samples.length=0;
  return this.samples;
 }
 release(sample){if(sample.trailPool===this)this.free[this.freeCount++]=sample;}
 // 대기 표본이 살아 있는 표본 수 live의 2배+256개를 넘으면 그만큼만 남기고 버린다. 남는 표본만 GC에 맡기므로 결과 값은 같다.
 trim(live){
  const cap=live*2+FREE_SLACK;
  if(this.freeCount<=cap)return;
  this.freeCount=cap;this.free.length=cap;
 }
 take(){
  if(this.freeCount)return this.free[--this.freeCount];
  const sample={id:'',outline:false,rgb:null,points:[],edges:undefined,frame:null,surface:'wall',screen:null,alpha:0,lineWidth:0,time:0,interval:0};
  // 열거되지 않는 소유 표시와 꼭짓점·경계 보관함. 표본 비교·복사에 끼지 않는다.
  Object.defineProperties(sample,{trailPool:{value:this},pointStore:{value:[]},edgeStore:{value:[]}});
  return sample;
 }
 index(current){
  this.byId=null;
  if(++this.mark===0x7fffffff)this.mark=1;
  for(let i=0;i<current.length;i++){
   const key=current[i].slotKey;
   if(!Number.isInteger(key)){this.byId=new Map(current.map(s=>[s.id,s]));return;}
   if(key>=this.marks.length){const marks=new Int32Array(2**Math.ceil(Math.log2(key+1)));marks.set(this.marks);this.marks=marks;}
   this.byKey[key]=current[i];this.marks[key]=this.mark;
  }
 }
 // advanceTrails의 byId.get(old.id)와 같은 면을 찾는다. 같은 광원 배열에서 만든 FaceFrame 면은 slotKey로 찾는다.
 find(old){
  if(this.byId)return this.byId.get(old.id);
  const key=old.slotKey;
  if(!Number.isInteger(key)||key>=this.marks.length||this.marks[key]!==this.mark)return undefined;
  const next=this.byKey[key];
  return next.id===old.id?next:undefined;
 }
}

// old 면의 값을 표본으로 옮긴다. points는 표본 소유 배열에 복사하고 time·interval은 호출한 쪽이 쓴다.
// frame·screen은 old의 FaceFrame 버퍼(두 프레임 뒤 덮어씀)라 참조를 남기지 않고 null로 둔다.
function copyFace(sample,old){
 sample.id=old.id;sample.outline=old.outline;sample.rgb=old.rgb;sample.frame=null;sample.surface=old.surface;
 sample.screen=null;sample.alpha=old.alpha;sample.lineWidth=old.lineWidth;
 if(old.edges){
  const edges=sample.edgeStore;
  for(let i=0;i<old.edges.length;i++)edges[i]=old.edges[i];
  edges.length=old.edges.length;sample.edges=edges;
 }else sample.edges=old.edges;
}

function pointsOf(sample,count){
 const points=sample.points,store=sample.pointStore;
 for(let j=0;j<count;j++)points[j]=store[j]??(store[j]=[0,0,0]);
 points.length=count;
 return points;
}

function limitInPlace(pool,samples,maxSamples){
 if(!Number.isFinite(maxSamples)||samples.length<=maxSamples)return samples;
 const limit=Math.max(0,Math.floor(maxSamples)),last=samples.length-1;
 // limitTrailSamples가 고르는 번호는 증가하므로 앞에서부터 옮겨 담을 수 있다.
 let kept=0,next=limit===0?-1:limit===1?last:0;
 for(let i=0;i<=last;i++){
  if(i===next){
   samples[kept++]=samples[i];
   next=kept>=limit?-1:limit===1?last:Math.round(kept*last/(limit-1));
  }else pool.release(samples[i]);
 }
 samples.length=kept;
 return samples;
}

function advanceTrailsInto(pool,history,previous,current,now,duration,dt,quality){
 const samples=advanceTrailSamples(pool,history,previous,current,now,duration,dt,quality);
 pool.trim(samples.length);
 return samples;
}

function advanceTrailSamples(pool,history,previous,current,now,duration,dt,quality){
 if(duration<=0)return pool.clear();
 const out=pool.samples,own=history===out;
 let count=0;
 for(let i=0;i<history.length;i++){
  const sample=history[i];
  if(now-sample.time<duration)out[count++]=sample;
  else if(own)pool.release(sample);
 }
 const sampleDistance=Number.isFinite(quality.sampleDistance)&&quality.sampleDistance>0?quality.sampleDistance:4;
 const maxSteps=Number.isFinite(quality.maxSteps)&&quality.maxSteps>0?Math.floor(quality.maxSteps):12;
 const maxSamples=quality.maxSamples??Infinity;
 if(!(dt>0)){out.length=count;return limitInPlace(pool,out,maxSamples);}
 pool.index(current);
 const interval=Math.min(dt,duration);
 for(let o=0;o<previous.length;o++){
  const old=previous[o],next=pool.find(old),oldPoints=old.points;
  let matches=next!==undefined&&next.points.length===oldPoints.length&&next.outline===old.outline;
  if(matches)for(let i=0;i<oldPoints.length;i++)if((old.edges?.[i]!==false)!==(next.edges?.[i]!==false)){matches=false;break;}
  let distance=Infinity;
  if(matches){
   distance=-Infinity;
   for(let i=0;i<old.screen.length;i++)distance=Math.max(distance,hypot2(old.screen[i].x-next.screen[i].x,old.screen[i].y-next.screen[i].y));
  }
  if(distance<.15)continue;
  if(!matches||distance>180){
   if(dt<duration){
    const sample=pool.take();copyFace(sample,old);
    const points=pointsOf(sample,oldPoints.length);
    for(let j=0;j<oldPoints.length;j++){points[j][0]=oldPoints[j][0];points[j][1]=oldPoints[j][1];points[j][2]=oldPoints[j][2];}
    sample.time=now-dt;sample.interval=interval;out[count++]=sample;
   }
   continue;
  }
  const steps=Math.min(maxSteps,Math.max(1,Math.ceil(distance/sampleDistance))),nextPoints=next.points;
  for(let i=0;i<steps;i++){
   const phase=(i+.5)/steps,t=(dt-interval+phase*interval)/dt;
   const sample=pool.take();copyFace(sample,old);
   const points=pointsOf(sample,oldPoints.length);
   for(let j=0;j<oldPoints.length;j++)for(let k=0;k<3;k++){const v=oldPoints[j][k];points[j][k]=v+(nextPoints[j][k]-v)*t;}
   sample.alpha=old.alpha+(next.alpha-old.alpha)*t;sample.time=now-interval+phase*interval;sample.interval=interval/steps;
   out[count++]=sample;
  }
 }
 out.length=count;
 return limitInPlace(pool,out,maxSamples);
}
