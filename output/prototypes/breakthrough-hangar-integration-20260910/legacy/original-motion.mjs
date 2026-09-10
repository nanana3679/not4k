// 원래 PNG·윤곽은 바꾸지 않는다. 시점·균등 크기·설치 평면만 고도에 연결한다.
import {wallContours} from './wall-contours.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const number=(p,key,f,a,b)=>p.get(key)===null||p.get(key)===''||!Number.isFinite(Number(p.get(key)))?f:clamp(Number(p.get(key)),a,b);
export function originalSettings(p){
 const requested=p.get('obstacleMode');
 const obstacleMode=['original','blocks','architecture'].includes(requested)?requested:
  p.get('architecture')==='0'&&p.get('clearance')!=='0'?'blocks':p.get('architecture')==='1'||p.get('viewMode')==='model'?'architecture':'original';
 return {obstacleMode,architecture:obstacleMode==='architecture',...(['original','blocks'].includes(requested)?{viewMode:'flight'}:{}),
  originalHeight:number(p,'originalHeight',60,8,100),originalInset:number(p,'originalInset',0,0,24),
  originalCameraLinked:p.get('originalCameraLinked')!=='0',originalHeightLinked:p.get('originalHeightLinked')!=='0',originalApproachLinked:p.get('originalApproachLinked')!=='0'};
}
export const usesOriginalMotion=s=>s.clearance&&s.obstacleMode==='original';
export function originalPose(settings,altitude=settings.altitude){
 const a=clamp(Number.isFinite(altitude)?altitude:.5,0,1),low=1-a*a*(3-2*a);
 const height=Math.min(settings.originalHeight*(1+(settings.originalHeightLinked?low*settings.heightBoost:0)),settings.height*.7);
 // 양쪽 실루엣과 두께 사이에 중앙 여백을 남긴다. 광원·벽의 위치는 바꾸지 않는다.
 const outer=settings.width*(settings.planes===2?.095:.48),margin=settings.width*(settings.planes===2?.04:.12);
 const maxInset=Math.max(0,outer-margin-settings.wallThickness/2);
 const inset=Math.min(settings.originalInset+(settings.originalApproachLinked?low*settings.approach*settings.width*.2:0),maxInset);
 return {height,inset,low,inner:outer-inset-settings.wallThickness/2};
}
export function originalLayout(settings,pyramid,plane,altitude=settings.altitude){
 const pose=originalPose(settings,altitude);
 const ys=(wallContours[plane.art]||[]).flat().map(([,v])=>plane.flip?1-v:v);
 const minV=ys.length?Math.min(...ys):0,maxV=ys.length?Math.max(...ys):1;
 const sourceHeight=pyramid.height*.62;
 return {...pose,ground:pyramid.baseCenter-pyramid.height/2,minV,
  scale:pose.height/((maxV-minV)*sourceHeight),sourceHeight,
  d:Math.sign(plane.d)*(Math.abs(plane.d)-pose.inset)};
}
