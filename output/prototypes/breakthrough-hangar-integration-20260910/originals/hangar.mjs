// PROTOTYPE: E hangar at architectural scale, same continuous geometry technique as A.
export const DEFAULTS=Object.freeze({altitude:0,speed:1000,progress:.2,size:100,paused:false,auto:false,lanes:false,art:true,view:'flight',yaw:24,clearance:4});
export const STOPS=[.15,.4,.60,.67];
export const LABELS=['원거리','중거리','근거리','통과'];
export const TEXTURES=['armor','window','door','hull','soffit'];
export const TRAVEL_SPAN=400;
export const WORLD_SPEED_100=145/24; // Same world speed as the smaller A study.
export const PASS_SECONDS_100=TRAVEL_SPAN/WORLD_SPEED_100;
export const MAX_X=34;
export const clamp=(v,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
const num=(v,f)=>Number.isFinite(v)?v:f;
export function readSettings(search,reduced=false){const p=new URLSearchParams(search),n=(k,lo,hi)=>clamp(num(p.has(k)&&p.get(k).trim()!==''?Number(p.get(k)):NaN,DEFAULTS[k]),lo,hi),b=(k,f=DEFAULTS[k])=>p.get(k)==='1'?true:p.get(k)==='0'?false:f;return{altitude:n('altitude',0,1),speed:n('speed',0,1000),progress:n('progress',0,1),size:n('size',50,180),paused:b('paused',reduced),auto:b('auto'),lanes:b('lanes'),art:b('art'),view:p.get('view')==='orbit'?'orbit':'flight',yaw:n('yaw',-70,70),clearance:n('clearance',2,18)};}
export const writeSettings=s=>new URLSearchParams(Object.keys(DEFAULTS).map(k=>[k,typeof s[k]==='boolean'?String(Number(s[k])):typeof s[k]==='number'?String(Math.round(s[k]*10000)/10000):s[k]])).toString();
export function advance(p,seconds,speed,paused=false){if(paused||!Number.isFinite(seconds)||seconds<=0||!Number.isFinite(speed)||speed<=0)return clamp(num(p,0));return(clamp(num(p,0))+seconds*clamp(speed,0,1000)/(PASS_SECONDS_100*100))%1;}
export const automaticAltitude=seconds=>(1-Math.cos(seconds*Math.PI/6))/2;
export function pose(settings){const a=clamp(num(settings.altitude,0)),scale=clamp(num(settings.size,100),50,180)/100;
 if(settings.view==='orbit'){const angle=clamp(num(settings.yaw,24),-70,70)*Math.PI/180,r=94;return{scale,object:[-16*scale,-25*scale,0],camera:[Math.sin(angle)*r,-12+66*a,Math.cos(angle)*r],target:[0,0,0],viewOffset:0};}
 return{scale,object:[-clamp(num(settings.clearance,4),2,18)-MAX_X*scale,0,-300+TRAVEL_SPAN*clamp(num(settings.progress,0))],camera:[0,36+34*a,0],target:[0,36+34*a,-100],viewOffset:-.1};
}
export function hangarBlueprint(){const vertices=[],faces=[],panels=[],boxes=[],beams=[],solids=[];
 const box=(id,position,size,tone='beam')=>boxes.push({id,position,size,tone});
 const beam=(id,start,end,width=.14,depth=width,tone='beam')=>beams.push({id,start,end,width,depth,tone});
 const panel=(id,x,y,z,w,h,texture)=>panels.push({id,points:[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],texture,uv:[[0,0],[1,0],[1,1],[0,1]]});
 const prism=(id,profile,front,back,tone='hull')=>{
  const offset=vertices.length,n=profile.length;
  const points=[...profile.map(([x,y])=>[x,y,front]),...profile.map(([x,y])=>[x,y,back])];vertices.push(...points);
  const loX=Math.min(...profile.map(p=>p[0])),hiX=Math.max(...profile.map(p=>p[0])),loY=Math.min(...profile.map(p=>p[1])),hiY=Math.max(...profile.map(p=>p[1]));
  const localFaces=[{name:'front',local:profile.map((_,i)=>i),tone},{name:'back',local:profile.map((_,i)=>2*n-1-i),tone:'back'}];
  for(let i=0;i<n;i++){const j=(i+1)%n,dy=profile[j][1]-profile[i][1],dx=profile[j][0]-profile[i][0];localFaces.push({name:`edge-${i}`,local:[n+i,n+j,j,i],tone:Math.abs(dx)>Math.abs(dy)?(dx>0?'soffit':'roof'):tone});}
  for(const f of localFaces){const p=f.local.map(i=>points[i]);faces.push({id:`${id}/${f.name}`,solid:id,indices:f.local.map(i=>i+offset),points:p,tone:f.tone,uv:f.name==='front'||f.name==='back'?p.map(([x,y])=>[(x-loX)/(hiX-loX),(y-loY)/(hiY-loY)]):[[0,0],[1,0],[1,1],[0,1]]});}
  solids.push({id,vertices:points,bounds:{min:[loX,loY,back],max:[hiX,hiY,front]}});
 };
 const chamfer=(x0,y0,x1,y1,c)=>[[x0+c,y0],[x1-c,y0],[x1,y0+c],[x1,y1-c],[x1-c,y1],[x0+c,y1],[x0,y1-c],[x0,y0+c]];
 prism('left-pier',chamfer(0,-4,6.7,50,.8),16,-16);
 prism('right-pier',chamfer(25.3,-4,32,50,.8),16,-16);
 prism('upper-module',[[-1,43],[31,43],[34,46],[34,51],[31,54],[-1,54],[-2,53],[-2,44]],23,-18);
 // The center is a deep architectural opening, not a painted black rectangle.
 box('recess-back',[16,27,-14.6],[18.6,32,1.2],'back');
 box('recess-deck',[16,10,0],[18.6,1.4,28],'under');
 box('lower-connector',[16,1,-7],[20,2.4,17],'hull');
 for(const z of [-10,3,15]){
  beam(`overhead-cross-${z}`,[6.5,41,z],[25.5,41,z],.48,.6,'under');
  beam(`overhead-low-${z}`,[6.5,38.8,z],[25.5,38.8,z],.25,.35,'rail');
  for(let i=0;i<5;i++){const x=6.5+i*3.8;beam(`overhead-diagonal-${z}-${i}`,[x,i%2?41:38.8,z],[x+3.8,i%2?38.8:41,z],.15,.2,'rail');}
 }
 // Small doors and service landings establish human scale across six levels.
 for(const y of [1,9,17,25,33,41])for(const side of ['left','right']){
  const x=side==='left'?2.5:27.5;
  panel(`service-door-${side}-${y}`,x,y+.24,16.045,1.6,2.8,'door');
  box(`service-landing-${side}-${y}`,[x+.8,y,17.7],[3.7,.28,3.5],'side');
  for(const xx of [x-1,x+2.6])beam(`service-post-${side}-${y}-${xx}`,[xx,y+.14,19.3],[xx,y+1.2,19.3],.07,.07,'rail');
  for(const yy of [y+.62,y+1.2])beam(`service-rail-${side}-${y}-${yy}`,[x-1,yy,19.3],[x+2.6,yy,19.3],.065,.065,'rail');
 }
 // Two interior galleries attach to the rear wall and lead to small lit rooms.
 for(const y of [22,34]){
  box(`rear-gallery-${y}`,[16,y,-10.5],[18.6,.35,5.8],'side');
  beam(`rear-rail-${y}`,[7,y+1.1,-7.7],[25,y+1.1,-7.7],.09,.09,'rail');
  for(const x of [7,13,19,25])beam(`rear-post-${y}-${x}`,[x,y+.18,-7.7],[x,y+1.1,-7.7],.07,.07,'rail');
  panel(`recess-window-${y}`,11,y+1.6,-13.965,8,1.2,'window');
 }
 // Slanted armor ribs with real thickness break the tall rectangular elevations.
 for(const x of [1.2,29.8])for(const y of [4,20,36]){
  const dx=x<10?3.8:-3.8;
  beam(`pier-diagonal-${x}-${y}`,[x,y,16.38],[x+dx,y+6.5,16.38],.52,.68,'side');
 }
 for(const x of [4,16,28]){
  beam(`bridge-soffit-${x}`,[x,42.62,-15],[x,42.62,21],.32,.45,'dark');
  box(`bridge-lamp-${x}`,[x,42.42,17],[1.4,.12,.36],'warm');
 }
 // Sparse roof ridges and recessed blocks, small details above the 54-unit hull.
 for(const z of [-11,4,17])box(`roof-strip-${z}`,[15,54.07,z],[25,.14,.15],'dark');
 for(const x of [1,31])for(const z of [-14,21]){
  box(`beacon-${x}-${z}`,[x,54.25,z],[.16,.32,.16],'red');
 }
 return{vertices,faces,panels,boxes,beams,solids,opening:{x:[6.7,25.3],y:[10.7,38.8],z:[-14,16]}};
}
