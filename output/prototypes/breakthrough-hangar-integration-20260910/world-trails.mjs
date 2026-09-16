import {surfaceTrailOpacity} from './legacy/afterglow.mjs';

export const mobileTrailQuality={sampleDistance:8,maxSteps:6,maxSamples:900};

export function limitTrailSamples(samples,maxSamples=Infinity){
 if(!Number.isFinite(maxSamples)||samples.length<=maxSamples)return samples;
 const limit=Math.max(0,Math.floor(maxSamples));
 if(limit===0)return [];
 if(limit===1)return [samples.at(-1)];
 const last=samples.length-1;
 return Array.from({length:limit},(_,i)=>samples[Math.round(i*last/(limit-1))]);
}

// Keep world vertices, not a flattened previous framebuffer. Old cycle IDs cannot join.
export function advanceTrails(history,previous,current,now,duration,dt,quality={}){
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
