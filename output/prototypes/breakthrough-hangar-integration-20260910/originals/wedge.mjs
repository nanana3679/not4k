// PROTOTYPE: one immutable wedge, fixed texture coordinates, continuous camera.
export const DEFAULTS = Object.freeze({ altitude:0, speed:1000, progress:.2, size:100, paused:false, auto:false, lanes:false, art:true, view:'flight', yaw:24 });
export const STOPS = [.2,.55,.72,.79];
export const LABELS = ['원거리','중거리','근거리','통과'];
export const clamp = (v,lo=0,hi=1) => Math.min(hi,Math.max(lo,v));
const num = (v,fallback) => Number.isFinite(v) ? v : fallback;
export function readSettings(search,reduced=false) {
  const p=new URLSearchParams(search);
  const n=(key,lo,hi)=>clamp(num(p.has(key)&&p.get(key).trim()!==''?Number(p.get(key)):NaN,DEFAULTS[key]),lo,hi);
  const b=(key,f=DEFAULTS[key])=>p.get(key)==='1'?true:p.get(key)==='0'?false:f;
  return {altitude:n('altitude',0,1),speed:n('speed',0,1000),progress:n('progress',0,1),size:n('size',50,180),paused:b('paused',reduced),auto:b('auto'),lanes:b('lanes'),art:b('art'),view:p.get('view')==='orbit'?'orbit':'flight',yaw:n('yaw',-70,70)};
}
export const writeSettings = s => new URLSearchParams(Object.keys(DEFAULTS).map(k=>[k,typeof s[k]==='boolean'?String(Number(s[k])):typeof s[k]==='number'?String(Math.round(s[k]*10000)/10000):s[k]])).toString();
export function advance(p,seconds,speed,paused=false) {
  if(paused||!Number.isFinite(seconds)||seconds<=0||!Number.isFinite(speed)||speed<=0)return clamp(num(p,0));
  return (clamp(num(p,0))+seconds*clamp(speed,0,1000)/2400)%1;
}
export const automaticAltitude = seconds => (1-Math.cos(seconds*Math.PI/6))/2;
export function pose(settings) {
  const a=clamp(num(settings.altitude,0)), scale=clamp(num(settings.size,100),50,180)/100;
  if(settings.view==='orbit') {
    const angle=clamp(num(settings.yaw,24),-70,70)*Math.PI/180, radius=17;
    return { scale, object:[-4*scale,0,0], camera:[Math.sin(angle)*radius,-3.5+12*a,Math.cos(angle)*radius], target:[0,0,0], pitchChanges:true };
  }
  return { scale, object:[-3-9.5*scale,10,-120+145*clamp(num(settings.progress,0))], camera:[0,6.5+12*a,0], target:[0,6.5+12*a,-100], pitchChanges:false };
}
const zAt = x => 2.4-.8*x/9.5;
export function wedgeBlueprint() {
  const profile=[[0,-2.8],[9.5,.3],[9.5,1.6],[0,3.5]];
  const vertices=[...profile.map(([x,y])=>[x,y,zAt(x)]),...profile.map(([x,y])=>[x,y,-zAt(x)])];
  const faces=[
    {id:'front',indices:[0,1,2,3],tone:'side'}, {id:'back',indices:[7,6,5,4],tone:'back'},
    {id:'underside',indices:[4,5,1,0],tone:'under'}, {id:'nose',indices:[5,6,2,1],tone:'side'},
    {id:'roof',indices:[6,7,3,2],tone:'roof'}, {id:'rear',indices:[7,4,0,3],tone:'back'},
  ].map(f=>({...f,points:f.indices.map(i=>vertices[i]),uv:[[0,0],[1,0],[1,1],[0,1]]}));
  const panels=[], boxes=[], beams=[];
  const box=(id,position,size,tone='beam')=>boxes.push({id,position,size,tone});
  const beam=(id,start,end,width=.12,depth=width,tone='beam')=>beams.push({id,start,end,width,depth,tone});
  const panel=(id,points,texture)=>panels.push({id,points,texture,uv:[[0,0],[1,0],[1,1],[0,1]]});
  const onSide=(x,y,side=1,offset=.035)=>[x,y,side*(zAt(x)+offset)];
  // Every visible window/door stays on the same physical facade for the full pass.
  for(const side of [1,-1]) {
    const points=[onSide(2.05,.04,side),onSide(9.15,.49,side),onSide(9.15,1.25,side),onSide(2.05,2.6,side)];
    panel(`window-${side}`,side===1?points:[points[1],points[0],points[3],points[2]],'window');
    for(let i=0;i<4;i++)beam(`window-rim-${side}-${i}`,points[i],points[(i+1)%4],.12,.12,'dark');
    for(let i=1;i<=4;i++) {
      const t=i/5,x=2.05+7.1*t;
      beam(`mullion-${side}-${i}`,onSide(x,.04+.45*t,side,.095),onSide(x,2.6-1.35*t,side,.095),.085,.11,'dark');
    }
    const door=[onSide(.12,-.05,side,.07),onSide(1.72,-.05,side,.07),onSide(1.72,2.75,side,.07),onSide(.12,2.75,side,.07)];
    panel(`door-${side}`,side===1?door:[door[1],door[0],door[3],door[2]],'door');
  }
  box('rear-mount',[-1.4,-.9,0],[.65,11.6,5.65],'mount');
  box('rear-connection',[-.6,.1,0],[1.25,6.8,4.8],'side');
  // Two structural braces, with actual depth and continuous endpoints.
  for(const z of [-1.85,1.85]) {
    beam(`brace-${z}`,[-1.05,-5.95,z],[5.6,-1.03,z],.46,.52,'side');
    box(`brace-foot-${z}`,[-1.02,-5.85,z],[.35,.72,.8],'dark');
  }
  box('service-deck',[-.1,-.22,3.25],[3.9,.3,2.6],'side');
  box('deck-girder',[-.1,-.51,4.1],[3.9,.34,.26],'under');
  for(const x of [-1.8,-.2,1.65])beam(`rail-post-${x}`,[x,-.07,4.5],[x,1.12,4.5],.07,.07,'rail');
  for(const y of [.48,1.12])beam(`rail-long-${y}`,[-1.8,y,4.5],[1.65,y,4.5],.07,.07,'rail');
  for(const x of [-1.8,1.65]) {
    beam(`rail-end-${x}`,[x,1.12,2.3],[x,1.12,4.5],.07,.07,'rail');
    beam(`deck-support-${x}`,[x,-.37,4.2],[x,-2.2,2.15],.16,.2,'under');
  }
  // Sparse real metal strips on the roof; no texture/detail swaps at any distance.
  for(const x of [3.2,6.4]) {
    const y=3.5-(1.9*x/9.5)+.035;
    beam(`roof-seam-${x}`,[x,y,-zAt(x)],[x,y,zAt(x)],.035,.055,'dark');
  }
  box('tip-beacon',[9.48,1.69,1.64],[.15,.28,.15],'red');
  box('tip-beacon-core',[9.49,1.7,1.727],[.095,.14,.02],'warm');
  for(const z of [-1.85,1.85])beam(`brace-light-${z}`,[1.2,-3.94,z+.285],[2,-3.35,z+.285],.055,.05,'red');
  return {vertices,faces,panels,boxes,beams};
}
