// Isolated comparison: preserved original geometry, altitude-linked lines, shared projection.
import {settingsFrom,makeLights,worldFaces,project,planeOffsets,clamp} from './legacy/geometry.mjs';
import {clearanceScene} from './legacy/clearance.mjs';
import {passagePyramid,passageProgressForDepth,PASSAGE_STOPS} from './passage.mjs';
export const TEXTURES=['armor','window','door','hull','soffit'];
export const MODEL_IDS=['A','B','C','D','E','F','G','H'];
// Architectural depth is independent of the finite light pyramid: a rigid 58-unit
// building is already large at its 200-unit apex. Fade only beyond readable distance.
export const BUILDING_START=1600;
export const BUILDING_FOG=Object.freeze({near:650,far:1400});
export function readSettings(search='',reduced=false){
 const p=new URLSearchParams(search),s=settingsFrom(search);
 const n=(k,f,lo,hi)=>p.has(k)&&p.get(k).trim()!==''&&Number.isFinite(Number(p.get(k)))?clamp(Number(p.get(k)),lo,hi):f;
 return {...s,study:p.get('study')==='passage'?'passage':'modules',backdrop:p.get('backdrop')==='architecture'?'architecture':'none',backdropBrightness:n('backdropBrightness',50,0,100),backdropMotion:p.get('backdropMotion')==='static'?'static':'recursive',backdropRate:n('backdropRate',100,0,300),backdropPhase:n('backdropPhase',0,0,1)%1,surroundings:p.get('surroundings')==='1',extensions:p.get('extensions')==='1',module:MODEL_IDS.includes(p.get('module'))?p.get('module'):'E',floor:false,ceiling:false,building:p.get('building')!=='0',buildingSize:n('buildingSize',100,50,180),progress:n('progress',p.get('study')==='passage'?passageProgressForDepth(PASSAGE_STOPS.approach):.25,0,1),auto:p.get('auto')==='1',art:p.get('art')!=='0',lanes:p.get('lanes')==='1',running:p.has('paused')?p.get('paused')!=='1':!reduced};
}
export function writeSettings(s,progress){
 const keys=['study','backdropMotion','backdropRate','backdropPhase','backdrop','backdropBrightness','surroundings','extensions','module','variant','altitude','speed','clearance','width','depth','planes','density','size','nearStretch','height','apexLow','apexHigh','apexLinked','apexGain','outline','secondary','trail','seed','lanes','guides','building','buildingSize','auto','art'];
 const p=new URLSearchParams(keys.map(k=>[k,typeof s[k]==='boolean'?String(Number(s[k])):String(s[k])]));p.set('paused',s.running?'0':'1');p.set('progress',String(progress));return p.toString();
}
export const scenePyramid=s=>s.study==='passage'?passagePyramid(clearanceScene({...s,clearance:true},s.altitude),s.altitude):clearanceScene(s,s.altitude);
export function matchCamera(camera,view){
 camera.fov=2*Math.atan(view.height/(2*view.focal))*180/Math.PI;camera.aspect=view.width/view.height;
 camera.near=2;camera.far=2000;camera.position.set(0,view.cameraHeight,view.back);camera.quaternion.identity();
 camera.setViewOffset(view.width,view.height,0,view.height/2-view.principalY,view.width,view.height);
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
export const travelPeriod=()=>BUILDING_START+400;
export const progressForDepth=z=>clamp((BUILDING_START-z)/travelPeriod(),0,1);
export const progressAt=(travel,p)=>((travel*.956/travelPeriod(p))%1+1)%1;
export const travelAt=(progress,p)=>progress*travelPeriod(p)/.956;
export function buildingPose(s,p,travel,dimensions=[36,58.41,41]){
 const phase=progressAt(travel,p),z=BUILDING_START-phase*travelPeriod(p);
 const d=planeOffsets(p,s.planes)[0];
 // At 100%, every model shares the same lower datum, retaining its own dimensions.
 // The E path is unchanged. Do not lift small models to the E building's center.
 const nearY=(s.clearance?p.baseCenter-p.height/2:p.baseCenter-29.205)+dimensions[1]/2;
 // Extend the SAME projected A→near-anchor ray to true distant depth. Extending
 // the finite AD plane itself past A would put the building on the opposite side.
 const cameraHeight=p.cameraHeight??12,slope=(p.apexHeight-cameraHeight)/(p.depth+8);
 return {center:[d,nearY+slope*z,z],scale:s.buildingSize/100,phase,visible:z>=-100};
}
export const lightLayout=s=>makeLights(s);
export function linePyramidFor(s,p,view){
 const altitude=clamp(Number.isFinite(s.altitude)?s.altitude:.5,0,1);
 const t=altitude*altitude*(3-2*altitude);
 // 저고도는 위쪽 양옆→중앙 하단, 고고도는 아래쪽 양옆→중앙 상단.
 // 카메라와 건축 배경 대신 직선이 놓이는 단면만 조절한다.
 const focusY=view.height*(.85-.7*t);
 return {...p,baseCenter:view.cameraHeight+(1-2*t)*p.height/2,
  apexHeight:view.cameraHeight+(view.principalY-focusY)*(p.depth+view.back)/view.focal};
}
export function collectFaces(lights,travel,s,p,view){
 const result=[];
 if(s.size===0)return result;
 const linePyramid=linePyramidFor(s,p,view);
 for(const light of lights){
  const isLine=s.variant==='lines'||s.variant==='mixed'&&light.isLine;
  for(const face of worldFaces(light,travel,s,isLine?linePyramid:p)){
   if(face.points.length<3)continue;
   const screen=face.points.map(v=>project(v,view));
   if(screen.every(v=>v.x< -70)||screen.every(v=>v.x>view.width+70)||screen.every(v=>v.y< -70)||screen.every(v=>v.y>view.height+70))continue;
   const area=Math.abs(screen.reduce((sum,v,i)=>{const q=screen[(i+1)%screen.length];return sum+v.x*q.y-q.x*v.y;},0))/2;
   if(area<.2)continue;
   const t=face.frame.t,alpha=Math.min(1,t/.2)*Math.min(1,(1-t)/.05)*light.brightness;
   result.push({...face,screen,alpha,lineWidth:Math.max(.65,Math.min(2.4,Math.sqrt(area)*.045))});
  }
 }
 return result.sort((a,b)=>b.frame.point[2]-a.frame.point[2]);
}
