// PROTOTYPE — 고도에 따른 여유를 비교한다. 충돌·실패·입력 판정은 없다.
import {pyramidFor,clamp} from './geometry.mjs';
import {random01} from './palette.mjs';
import {usesOriginalMotion} from './original-motion.mjs';

export function clearanceScene(settings,altitude=settings.altitude){
 const original=usesOriginalMotion(settings);
 const a=original&&settings.originalCameraLinked===false ? .5 : clamp(Number.isFinite(altitude)?altitude:.5,0,1);
 const pyramid=pyramidFor(settings,a);
 if(!settings.clearance)return pyramid;
 const ground=pyramid.baseCenter-pyramid.height/2;
 const cameraHeight=ground+pyramid.height*(.04+(original ? .56 : .24)*a*a);
 // 기존 A 조절을 2.5% 크기의 보조 흐름으로 보존한다. 근접감의 주역은 수직 간격이다.
 const apexHeight=cameraHeight+(pyramid.apexHeight-pyramid.baseCenter)*.025;
 return {...pyramid,clearance:true,cameraHeight,apexHeight};
}

export function clearanceProfile(pyramid,plane,seed){
 const r=tag=>random01(`${seed}/clearance/${plane.plane}/${tag}`);
 const ground=pyramid.baseCenter-pyramid.height/2;
 return {ground,top:ground+pyramid.height*(.14+.055*r('height')),
  inner:Math.min(Math.abs(plane.d)*.3,pyramid.width*(.12+.025*r('inset'))),outer:Math.abs(plane.d),
  phase:plane.phase,extent:pyramid.width*.75};
}

function clipDepth(poly,limit,sign){
 const out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=(a[2]-limit)*sign,db=(b[2]-limit)*sign;
  if(da>=0)out.push(a);
  if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*t));}
 }
 return out;
}

export function clearanceMeshes(settings,pyramid,travel,plane){
 const profile=clearanceProfile(pyramid,plane,settings.seed),side=Math.sign(plane.d);
 const period=pyramid.width*settings.wallGap,shift=.956*travel;
 const first=Math.ceil((shift-profile.extent)/period-profile.phase),last=Math.floor((pyramid.depth+shift)/period-profile.phase);
 const faces=[];
 function add(points,shade,kind,id){
  const clipped=clipDepth(clipDepth(points,0,1),pyramid.depth-.001,-1);
  for(let i=1;i<clipped.length-1;i++)faces.push({points:[clipped[0],clipped[i],clipped[i+1]],shade,textured:true,kind,id});
 }
 for(let cycle=first;cycle<=last;cycle++){
  const start=(cycle+profile.phase)*period-shift,end=start+profile.extent;
  // 두께 0에서는 바깥 면 하나, 기본 2에서는 안쪽으로 뻗은 윗면·옆면·끝면이 생긴다.
  const inner=profile.outer-(profile.outer-profile.inner)*Math.min(settings.wallThickness/2,1.3);
  const point=(x,y,z,u,v)=>{const t=1-z/pyramid.depth;return [side*x*t,pyramid.apexHeight*(1-t)+y*t,z,u,v];};
  const p=(x,y,z,u,v)=>point(x,y,z,u,v),lo=profile.ground,hi=profile.top;
  const id=`bank-${plane.plane}-${cycle}`;
  add([p(inner,lo,start,0,0),p(inner,hi,start,0,1),p(inner,hi,end,1,1),p(inner,lo,end,1,0)],.8,'side',id);
  if(settings.wallThickness>0){
   add([p(inner,hi,start,0,0),p(profile.outer,hi,start,1,0),p(profile.outer,hi,end,1,1),p(inner,hi,end,0,1)],1.7,'top',id);
   add([p(inner,lo,start,0,0),p(profile.outer,lo,start,1,0),p(profile.outer,hi,start,1,1),p(inner,hi,start,0,1)],.55,'end',id);
   add([p(inner,lo,end,0,0),p(inner,hi,end,0,1),p(profile.outer,hi,end,1,1),p(profile.outer,lo,end,1,0)],.65,'end',id);
  }
 }
 return faces;
}
