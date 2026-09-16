// 돌파의 잔광: 지난 면의 위치·외곽·색을 기록하고 짧은 시간 동안 감쇠시킨다.
// 중심선의 굵기로 삼각형을 대체하지 않는다. 샘플 간에는 외곽점을 보간한다.
export function surfaceTrailOpacity(age,duration,interval,strength=1){
  if(duration<=0||interval<=0||age<0||age>=duration)return 0;
  const start=Math.max(0,age-interval/2),end=Math.min(duration,age+interval/2);
  const energy=((1-start/duration)**3-(1-end/duration)**3)*Math.max(0,strength);
  return 1-Math.exp(-energy);
}
const snapshot=(light,time,interval,surface=light.surface,alpha=light.alpha)=>({
  id:light.id,time,interval,alpha,rgb:light.rgb,outline:!!light.outline,lineWidth:light.outline?light.lineWidth:0,surface:surface.map(p=>({x:p.x,y:p.y,...(p.connectNext===false?{connectNext:false}:{})})),
});
export function advanceSurfaceTrails(history,previous,current,now,duration,dt){
  if(duration<=0)return [];
  const frames=[];
  for(const frame of history){
    const segments=frame.segments.filter(s=>now-s.time<duration);
    if(segments.length)frames.push(segments.length===frame.segments.length?frame:{...frame,segments});
  }
  if(!(dt>0))return frames;
  const interval=Math.min(dt,duration),byId=new Map(current.map(light=>[light.id,light])),segments=[];
  for(const old of previous){
    if(!old.surface?.length)continue;
    const next=byId.get(old.id);
    const matches=next?.surface?.length===old.surface.length&&!!next.outline===!!old.outline&&old.surface.every((p,i)=>(p.connectNext!==false)===(next.surface[i].connectNext!==false));
    const distance=matches?Math.max(...old.surface.map((p,i)=>Math.hypot(p.x-next.surface[i].x,p.y-next.surface[i].y))):Infinity;
    if(distance<.15)continue;
    if(!matches||distance>180){
      // 가까운 경계에서 꼭짓점 개수가 바뀌거나 시야를 나가면 이전 외곽만 남긴다.
      if(dt<duration)segments.push(snapshot(old,now-dt,interval));continue;
    }
    // 빠르게 지나가는 면도 중간에 끊기지 않게 이동량에 따라 짧게 보간한다.
    const steps=Math.min(12,Math.max(1,Math.ceil(distance/4)));
    for(let i=0;i<steps;i++){
      const phase=(i+.5)/steps,t=(dt-interval+phase*interval)/dt;
      const points=old.surface.map((p,j)=>({x:p.x+(next.surface[j].x-p.x)*t,y:p.y+(next.surface[j].y-p.y)*t,...(p.connectNext===false?{connectNext:false}:{})}));
      segments.push(snapshot(old,now-interval+phase*interval,interval/steps,points,old.alpha+(next.alpha-old.alpha)*t));
    }
  }
  if(segments.length)frames.push({time:now,segments});
  return frames;
}

const batchCache=new WeakMap();
export function surfaceTrailBatches(frame){
  const cached=batchCache.get(frame);if(cached)return cached;
  const batches=new Map();
  for(const segment of frame.segments){
    const alpha=Math.round(segment.alpha*16)/16;
    if(alpha<=0)continue;
    const outline=!!segment.outline,lineWidth=outline?Math.round(segment.lineWidth*4)/4:0;
    const key=`${segment.time}/${segment.interval}/${alpha}/${segment.rgb?.join(',')}/${outline}/${lineWidth}`;
    if(!batches.has(key))batches.set(key,{time:segment.time,interval:segment.interval,alpha,rgb:segment.rgb,outline,lineWidth,surfaces:[]});
    batches.get(key).surfaces.push(segment.surface);
  }
  const result=[...batches.values()].sort((a,b)=>a.time-b.time);batchCache.set(frame,result);return result;
}

// 한 프레임의 같은 색·밝기 외곽은 합쳐 그린다. 보간 표본마다 blur/fill하지 않는다.
const compactCache=new WeakMap();
export function compactTrailBatches(frame){
  const cached=compactCache.get(frame);if(cached)return cached;
  const groups=new Map();
  for(const s of frame.segments){
    const alpha=Math.round(s.alpha*4)/4;if(alpha<=0)continue;
    const outline=!!s.outline,lineWidth=outline?Math.round(s.lineWidth*4)/4:0;
    const key=`${s.rgb.join(',')}/${alpha}/${outline}/${lineWidth}`;
    if(!groups.has(key))groups.set(key,{rgb:s.rgb,alpha,outline,lineWidth,start:Infinity,end:-Infinity,surfaces:[]});
    const group=groups.get(key);group.start=Math.min(group.start,s.time-s.interval/2);group.end=Math.max(group.end,s.time+s.interval/2);
    // 서로 반대로 투영된 좌우 면이 한 경로에서 상쇄되지 않도록 방향을 맞춘다.
    const winding=s.surface.reduce((sum,p,i)=>{const q=s.surface[(i+1)%s.surface.length];return sum+p.x*q.y-q.x*p.y;},0);
    group.surfaces.push(!s.outline&&winding<0?[...s.surface].reverse():s.surface);
  }
  const result=[...groups.values()].map(g=>({...g,time:(g.start+g.end)/2,interval:g.end-g.start}));
  compactCache.set(frame,result);return result;
}
