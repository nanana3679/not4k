// PROTOTYPE — 승인한 건축물 9종. 충돌·점수·게임 상태를 갖지 않는 순수 메시 제작기.
// THESIS: 기지의 용도가 읽히는 부재와 저고도 근접감. OWN-WORLD: 흑연 금속·콘크리트·주홍 도색.
// STORY: 단독 형태를 살피고 치수를 바꾼 뒤 혼합 비행으로 비교. FIRST VIEWPORT: 16:9 장면, 아래 조절.
// FORM: 사용자 승인 9종의 실제 입체 메시. 시안의 야외 원경·작은 마모는 복제하지 않는다.
import {random01} from './palette.mjs';
export const architectureTypes=[
 {id:'elbow',glyph:'ㄱ',name:'꺾인 배관'}, {id:'column',glyph:'ㅣ',name:'설비 기둥'},
 {id:'duct',glyph:'ㅡ',name:'수평 덕트'}, {id:'manifold',glyph:'ㅠ',name:'지면 접속 분배관'},
 {id:'landing',glyph:'ㅓ',name:'정비 통로'}, {id:'rack',glyph:'ㅜ',name:'설비 지지대'},
 {id:'tee-left',glyph:'ㅓ',name:'분기 배관'}, {id:'tee-right',glyph:'ㅏ',name:'분기 덕트'},
 {id:'cross',glyph:'+',name:'기둥·가로보'},
];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const num=(p,k,f,lo,hi)=>p.get(k)===null||p.get(k)===''||!Number.isFinite(Number(p.get(k)))?f:clamp(Number(p.get(k)),lo,hi);
export function architectureSettings(p){
 return {architecture:p.get('architecture')!=='0',asset:architectureTypes.some(t=>t.id===p.get('asset'))?p.get('asset'):'mixed',
  viewMode:p.get('viewMode')==='model'?'model':'flight',structureHeight:num(p,'structureHeight',18,8,40),
  wallDistance:num(p,'wallDistance',4,0,24),heightBoost:num(p,'heightBoost',.3,0,1),approach:num(p,'approach',.6,0,1),
  architectureLinked:p.get('architectureLinked')!=='0',modelYaw:num(p,'modelYaw',32,-75,75),modelPitch:num(p,'modelPitch',18,-10,65)};
}
export function architecturePose(settings,altitude){
 const a=clamp(Number.isFinite(altitude)?altitude:.5,0,1),low=settings.architectureLinked?1-a*a*(3-2*a):0;
 const width=settings.width||88,span=width*.2,wall=width*.48,margin=width*.06+1.8;
 // 벽 이격은 설치 평면의 이동이다. 벽 연결 구간은 아래 제작 함수가 이어 준다.
 const offset=Math.min(settings.wallDistance+low*settings.approach*width*.2,Math.max(0,wall-span-margin));
 return {height:Math.min(settings.structureHeight*(1+low*settings.heightBoost),(settings.height||144)*.7),
  offset,span,wall,low,inner:wall-offset-span};
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const light=unit([-.4,.8,-.65]);
export const architectureColors=[[.25,.31,.40],[.43,.50,.58],[.34,.36,.39],[.55,.22,.14],[.075,.095,.13],[.59,.65,.70]];

export function buildArchitecture(type,pose,{detail=true,thickness=2,context=true}={}){
 const faces=[],parts=[],feet=[];const {height:h,offset:o,span:s}=pose,tip=o+s,zScale=thickness===0?.001:Math.max(.25,thickness/2);
 const segments=detail==='inspect'?24:detail?12:8,r=.72,footH=.7;
 function tri(a,b,c,material,tag){
  const points=[a,b,c].map(p=>[p[0],p[1],p[2]*zScale]),normal=unit(cross(sub(points[1],points[0]),sub(points[2],points[0])));
  faces.push({points,material,shade:.5+.65*Math.abs(dot(normal,light)),tag});
 }
 function quad(a,b,c,d,mat=0,tag='body'){tri(a,b,c,mat,tag);tri(a,c,d,mat,tag);}
 function box(x0,y0,z0,x1,y1,z1,mat=0,tag='panel'){
  const p=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  for(const f of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]])quad(...f.map(i=>p[i]),mat,tag);
  parts.push({tag,kind:'box',min:[x0,y0,z0*zScale],max:[x1,y1,z1*zScale]});
 }
 function cylinder(a,b,radius,mat=0,tag='pipe',n=segments){
  const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u);
  const ring=(p,i)=>p.map((x,j)=>x+radius*(u[j]*Math.cos(i*2*Math.PI/n)+v[j]*Math.sin(i*2*Math.PI/n)));
  for(let i=0;i<n;i++){const p=ring(a,i),q=ring(a,i+1),r0=ring(b,i),s0=ring(b,i+1);quad(p,q,s0,r0,mat,tag);tri(a,q,p,mat,tag);tri(b,r0,s0,mat,tag);}
  parts.push({tag,kind:'cylinder',a:[...a],b:[...b],radius});
 }
 function beam(a,b,w,d,mat=0,tag='brace'){
  const axis=unit(sub(b,a)),u=unit(cross(axis,[0,0,1])),v=cross(axis,u);
  const p=[a,b].flatMap(c=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>c.map((x,k)=>x+u[k]*i*w/2+v[k]*j*d/2)));
  for(const f of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])quad(...f.map(i=>p[i]),mat,tag);
  parts.push({tag,kind:'beam',a:[...a],b:[...b],width:w,depth:d*zScale});
 }
 function foot(x,width=2.8,depth=3.2){
  box(x-width/2,0,-depth/2,x+width/2,footH,depth/2,2,'foundation');
  box(x-width*.43,footH,-depth*.43,x+width*.43,footH+.15,depth*.43,1,'base-plate');feet.push([x,0,0]);
  if(detail)for(const dx of [-1,1])for(const dz of [-1,1])box(x+dx*width*.33-.12,footH+.15,dz*depth*.33-.12,x+dx*width*.33+.12,footH+.38,dz*depth*.33+.12,5,'anchor');
 }
 function flange(a,b,t=.5,radius=r){
  const axis=unit(sub(b,a)),p=a.map((v,i)=>v+(b[i]-v)*t),lo=p.map((v,i)=>v-axis[i]*.15),hi=p.map((v,i)=>v+axis[i]*.15);
  cylinder(lo,hi,radius*1.4,1,'flange');
  if(detail){const u=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u);
   for(let i=0;i<4;i++){const angle=i*Math.PI/2,c=p.map((n,j)=>n+radius*1.14*(u[j]*Math.cos(angle)+v[j]*Math.sin(angle)));cylinder(c.map((n,j)=>n-axis[j]*.22),c.map((n,j)=>n+axis[j]*.22),.10,5,'bolt',6);}}
 }
 function pipe(a,b,radius=r){
  cylinder(a,b,radius,0,'pipe');flange(a,b,.14,radius);flange(a,b,.85,radius);
  const axis=unit(sub(b,a)),p=a.map((v,i)=>v+(b[i]-v)*.64);cylinder(p,p.map((v,i)=>v+axis[i]*.32),radius*1.015,3,'paint-band');
 }
 function wheel(x,y){
  box(x-.9,y-.8,-.95,x+.9,y+.8,.95,0,'valve-body');
  cylinder([x,y,-.9],[x,y,-1.7],.20,1,'valve-stem',8);
  if(detail)for(let i=0;i<12;i++){const angle=i*Math.PI/6,next=(i+1)*Math.PI/6;
   cylinder([x+Math.cos(angle)*.9,y+Math.sin(angle)*.9,-1.75],[x+Math.cos(next)*.9,y+Math.sin(next)*.9,-1.75],.10,3,'valve-wheel',6);}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;beam([x,y,-1.75],[x+Math.cos(a)*.9,y+Math.sin(a)*.9,-1.75],.12,.12,3,'valve-spoke');}
 }
 function upright(x,top=h,width=2.2){
  foot(x,width+1,3.4);box(x-width/2,footH,-1.2,x+width/2,top,1.2,0,'shaft');
  box(x-width*.34,footH+.4,-1.27,x+width*.34,top-.2,-1.22,4,'recess');
  for(const dx of [-.7,.7])box(x+dx-.09,footH,-1.45,x+dx+.09,top,1.35,1,'vertical-rib');
  const count=Math.max(1,Math.floor(top/3.2));
  for(let i=1;i<count;i++){const y=top*i/count;box(x-width/2-.08,y,-1.35,x+width/2+.08,y+.10,1.35,1,'panel-seam');}
  box(x-width/2+.12,top*.67,-1.37,x-width/2+.36,top*.88,-1.28,3,'paint-band');
  if(detail){cylinder([x+.35,1,-1.45],[x+.35,top-.3,-1.45],.13,1,'conduit',6);}
 }
 function iBeam(x0,x1,y){
  box(x0,y-.75,-.20,x1,y+.75,.20,0,'beam-web');
  for(const dy of [-.85,.65])box(x0,y+dy,-1,x1,y+dy+.20,1,1,'beam-flange');
  for(const x of [x0+.2,x1-.4])box(x,y-.7,-.27,x+.2,y+.7,.27,3,'beam-mark');
 }
 function horizontalDuct(x0,x1,y){
  const half=1.2;
  box(x0,y-half,-half,x1,y-half+.16,half,0,'duct-bottom');box(x0,y+half-.16,-half,x1,y+half,half,0,'duct-top');
  box(x0,y-half,-half,x1,y+half,-half+.16,0,'duct-side');box(x0,y-half,half-.16,x1,y+half,half,0,'duct-side');
  for(const t of [.1,.55,.92]){const x=x0+(x1-x0)*t;for(const z of [-1.28,1.18])box(x,y-1.28,z,x+.17,y+1.28,z+.10,1,'duct-seam');box(x,y+1.2,-1.28,x+.17,y+1.3,1.28,1,'duct-seam');}
  for(let i=-3;i<=3;i++)box(x1-.4,y+i*.28-.05,-1.04,x1,y+i*.28+.05,1.04,1,'louver');
  box(x0+(x1-x0)*.6,y-.7,-1.23,x0+(x1-x0)*.6+.24,y+.7,-1.2,3,'duct-mark');
  if(detail)box(x0+(x1-x0)*.25,y-.55,-1.25,x0+(x1-x0)*.25+1.5,y+.55,-1.21,4,'access-hatch');
 }
 // 중앙으로 옮겨도 독립된 바닥 기초와 벽 연결부를 유지한다.
 if(context){box(-.6,0,-2.8,0,h+2,2.8,2,'building-spine');box(.01,h*.55-1.8,-1.9,.12,h*.55+1.8,1.9,4,'service-recess');}
 if(type==='elbow'){
  const bend=1.5;pipe([0,h,0],[tip-bend,h,0]);
  for(let i=0;i<6;i++){const a=Math.PI/2-i*Math.PI/12,b=Math.PI/2-(i+1)*Math.PI/12;cylinder([tip-bend+bend*Math.cos(a),h-bend+bend*Math.sin(a),0],[tip-bend+bend*Math.cos(b),h-bend+bend*Math.sin(b),0],r,0,'elbow');}
  foot(tip);pipe([tip,footH,0],[tip,h-bend,0]);wheel(tip,h*.45);
 }else if(type==='manifold'){
  const x1=o+s*.30,x2=o+s*.80;pipe([0,h,0],[tip,h,0],r*1.13);
  for(const x of [x1,x2]){foot(x);pipe([x,footH,0],[x,h,0]);wheel(x,h*.43);}
 }else if(type==='tee-left'){
  foot(tip);pipe([tip,footH,0],[tip,h,0]);pipe([0,h*.53,0],[tip,h*.53,0]);wheel(tip*.48,h*.53);
 }else if(type==='duct'){
  const y=h*.62;horizontalDuct(0,tip,y);
  for(const z of [-.85,.85])beam([0,y-3,z],[tip*.35,y-1.2,z],.3,.35,1,'duct-corbel');
 }else if(type==='tee-right'){
  const x=o+s*.24;upright(x,h,2.6);horizontalDuct(x,tip,h*.55);
  beam([0,h*.55,0],[x,h*.55,0],1,1,0,'wall-connection');
 }else if(type==='column'){
  const x=o+s*.45;upright(x);for(const y of [h*.25,h*.72])beam([0,y,0],[x,y,0],.35,.45,1,'wall-bracket');
  if(detail){for(const dx of [-.45,.45])cylinder([x+dx,1,-1.75],[x+dx,h-1,-1.75],.09,1,'ladder-rail',6);for(let y=1;y<h-1;y+=.7)beam([x-.45,y,-1.75],[x+.45,y,-1.75],.10,.10,1,'ladder-rung');}
 }else if(type==='landing'){
  const x=o+s*.88,left=o+s*.05,y=h*.55;upright(x,h,2.7);
  beam([0,y,0],[left,y,0],1,1,0,'wall-connection');
  box(left,y-.45,-2.2,x-.1,y,2.2,0,'deck');
  box(x-.8,y,-1.41,x+.8,y+3.0,-1.28,4,'door');box(x-.12,y+.35,-1.46,x+.04,y+2.65,-1.40,1,'door-seam');
  iBeam(left,x,y-.5);
  for(const z of [-2.15,2.15]){beam([x,y-3,z*.75],[left+1,y-.45,z*.75],.40,.40,1,'deck-corbel');
   cylinder([left,y+1.65,z],[x,y+1.65,z],.10,1,'handrail',6);
   for(let t=0;t<=1;t+=.25){const xx=left+(x-left)*t;cylinder([xx,y,z],[xx,y+1.65,z],.09,1,'rail-post',6);}}
  if(detail)for(let xx=left+.3;xx<x-.1;xx+=.45)box(xx,y+.015,-2,xx+.10,y+.065,2,4,'grating');
 }else if(type==='rack'||type==='cross'){
  const x=o+s*.52,y=type==='rack'?h-1:h*.55;upright(x,type==='rack'?y:h,2.3);iBeam(o,tip,y);
  beam([0,y,0],[o,y,0],.45,.6,1,'wall-connection');
  box(x-1.3,y-1.05,-1.12,x+1.3,y+1.05,-.92,1,'joint-plate');
  for(const sign of [-1,1])beam([x,y-2.2,0],[x+sign*2.7,y-.75,0],.32,.4,1,'joint-gusset');
  if(detail)for(const dx of [-.95,.95])for(const dy of [-.7,0,.7])cylinder([x+dx,y+dy,-1.12],[x+dx,y+dy,-1.3],.12,5,'joint-bolt',6);
  cylinder([o,y+1.1,0],[tip,y+1.1,0],.18,1,'cable-route',6);
 }
 return {type,faces,parts,feet,pose};
}

function clipZ(poly,limit,sign){
 const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[2]-limit)*sign,db=(b[2]-limit)*sign;
  if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*t));}}
 return out;
}
export function architectureInstances(settings,pyramid,travel){
 const period=pyramid.width*.2*settings.wallGap,shift=travel*.956,out=[];
 for(const side of [-1,1]){
  const phase=side<0?.28:.77,first=Math.ceil((shift-5)/period-phase),last=Math.floor((pyramid.depth+shift+5)/period-phase);
  for(let cycle=first;cycle<=last;cycle++){
   const pick=((cycle+(side>0?4:0)+Math.floor(random01(`${settings.seed}/architecture/${side}`)*9))%9+9)%9;
   out.push({id:`architecture/${side}/${cycle}`,side,cycle,z:(cycle+phase)*period-shift,type:settings.asset==='mixed'?architectureTypes[pick].id:settings.asset});
  }
 }
 return out;
}
let cachedShapeKey='',cachedShapes=new Map();
export function architectureMeshes(settings,pyramid,travel,altitude){
 const pose=architecturePose(settings,altitude),ground=pyramid.baseCenter-pyramid.height/2,faces=[];
 const instances=architectureInstances(settings,pyramid,travel),shapeKey=JSON.stringify([pose,settings.wallThickness]);
 if(shapeKey!==cachedShapeKey){cachedShapeKey=shapeKey;cachedShapes=new Map();}
 const cache=cachedShapes;
 for(const instance of instances){
  const detail=instance.z<pyramid.depth*.35,key=instance.type+'/'+detail;
  if(!cache.has(key))cache.set(key,buildArchitecture(instance.type,pose,{detail,thickness:settings.wallThickness}));
  const model=cache.get(key);
  for(const face of model.faces){
   // A 뒤로 넘어간 꼭짓점은 수렴 변환 전에 자른다. 음수 축척으로 접히는 삼각형을 만들지 않는다.
   const local=face.points.map(([x,y,z])=>[x,y,z+instance.z]);
   const clipped=clipZ(clipZ(local,0,1),pyramid.depth-.01,-1).map(([x,y,z])=>{
    const t=1-z/pyramid.depth;return [instance.side*(pose.wall-x)*t,pyramid.apexHeight*(1-t)+(ground+y)*t,z];
   });
   for(let i=1;i<clipped.length-1;i++)faces.push({...face,points:[clipped[0],clipped[i],clipped[i+1]],id:instance.id});
  }
 }
 return {faces,instances,pose};
}
