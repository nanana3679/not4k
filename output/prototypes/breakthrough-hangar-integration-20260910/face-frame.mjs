// 돌파 광원 면을 프레임마다 같은 버퍼에 계산한다(게임 배경 경로).
// legacy/는 원본 시연을 SHA-256으로 고정한 사본이라 고치지 않는다. 대신 legacy의 frameAt·worldFaces와
// integration.mjs의 collectFaces가 새 객체로 만드는 결과와 같은 값을 여기서 할당 없이 다시 계산한다.
// 직선·윤곽선 도안은 이 모듈이 계산하고, 삼각형 채움 도안은 legacy worldFaces 결과를 그대로 받아 쓴다.
// 반환한 면 배열·면 객체·꼭짓점은 같은 FaceFrame의 다음 호출에서 덮어쓴다. 잔상 비교에 직전 프레임 면이 필요하므로
// 게임은 FaceFrame 두 개를 번갈아 쓴다.
import {depthStretchAt,triangleVertices,worldFaces} from './legacy/geometry.mjs';
import {objectColor,random01} from './legacy/palette.mjs';
import {hypot2} from './hypot.mjs';

// 광원마다 고정인 도안(직선·윤곽선 꼭짓점과 색). legacy appearance()와 같은 값이다.
const LEGACY_PARTS=Object.freeze([]);
const partCache=new WeakMap();
function lightParts(light,settings,line){
 let entry=partCache.get(light);
 if(!entry)partCache.set(light,entry=new PartCacheEntry());
 // 같은 seed·윤곽선 비율·형태·보조색이면 legacy appearance와 같은 도안을 그대로 돌려준다.
 if(entry.parts!==null&&entry.seed===settings.seed&&entry.outlineRatio===settings.outline&&entry.line===line&&entry.secondary===settings.secondary)return entry.parts;
 if(entry.seed!==settings.seed){entry.seed=settings.seed;entry.outlineRandom=random01(`${settings.seed}/${light.id}/outline`);}
 const outline=entry.outlineRandom<settings.outline;
 let parts=LEGACY_PARTS;
 if(line){
  const area=Math.sqrt(3)/4*[1,2,4,8].filter(bit=>light.mask&bit).length/4;
  const length=1.4,halfWidth=area/length/2;
  const color=objectColor(light.id,'breakthrough',settings.seed,settings.secondary);
  parts=[{id:'line',rgb:color.rgb,points:[[-halfWidth,-length/2],[halfWidth,-length/2],[halfWidth,length/2],[-halfWidth,length/2]],outline}];
 }else if(outline){
  const color=objectColor(light.id,'breakthrough',settings.seed,settings.secondary);
  parts=[{id:'outline',rgb:color.rgb,points:triangleVertices.slice(0,3),outline}];
 }
 entry.outlineRatio=settings.outline;entry.line=line;entry.secondary=settings.secondary;entry.parts=parts;
 return parts;
}
// 프레임 버퍼의 광원 칸에 도안을 기억해 매 프레임 WeakMap을 찾지 않는다. 광원·설정이 바뀌면 lightParts에서 다시 받는다.
function cachedParts(lightFaces,light,settings,line){
 if(lightFaces.partsLight===light&&lightFaces.partsSeed===settings.seed&&lightFaces.partsOutline===settings.outline&&lightFaces.partsLine===line&&lightFaces.partsSecondary===settings.secondary)return lightFaces.parts;
 lightFaces.parts=lightParts(light,settings,line);
 lightFaces.partsLight=light;lightFaces.partsSeed=settings.seed;lightFaces.partsOutline=settings.outline;lightFaces.partsLine=line;lightFaces.partsSecondary=settings.secondary;
 return lightFaces.parts;
}
class PartCacheEntry{
 constructor(){this.seed=NaN;this.outlineRandom=0;this.outlineRatio=NaN;this.line=false;this.secondary=NaN;this.parts=null;}
}

// 사각뿔마다 같은 경계 법선·길이. 프레임 안의 모든 광원이 공유하므로 사각뿔 값이 바뀔 때만 다시 계산한다.
class PyramidTerms{
 constructor(){
  this.width=NaN;this.depth=NaN;this.height=NaN;this.baseCenter=NaN;this.apexHeight=NaN;
  // 법선 세 개(앞, 위/오른쪽, 아래/왼쪽)를 [x,y,z]로 이어 담고 각 길이를 따로 둔다. 벽과 바닥·천장이 다르다.
  this.wallNormals=new Float64Array(9);this.wallLengths=new Float64Array(3);
  this.floorNormals=new Float64Array(9);this.floorLengths=new Float64Array(3);
 }
 update(p){
  if(this.width===p.width&&this.depth===p.depth&&this.height===p.height&&this.baseCenter===p.baseCenter&&this.apexHeight===p.apexHeight)return this;
  this.width=p.width;this.depth=p.depth;this.height=p.height;this.baseCenter=p.baseCenter;this.apexHeight=p.apexHeight;
  const halfHeight=p.height/2,halfWidth=p.width/2;
  const upperSlope=(p.baseCenter+halfHeight-p.apexHeight)/p.depth,lowerSlope=(p.baseCenter-halfHeight-p.apexHeight)/p.depth;
  this.wallNormals.set([0,0,1,0,1,upperSlope,0,-1,-lowerSlope]);
  this.floorNormals.set([0,0,1,1,0,halfWidth/p.depth,-1,0,halfWidth/p.depth]);
  for(let k=0;k<3;k++){
   this.wallLengths[k]=Math.hypot(this.wallNormals[k*3],this.wallNormals[k*3+1],this.wallNormals[k*3+2]);
   this.floorLengths[k]=Math.hypot(this.floorNormals[k*3],this.floorNormals[k*3+1],this.floorNormals[k*3+2]);
  }
  return this;
 }
}

// 광원 하나의 프레임별 버퍼. frame은 legacy frameAt 결과와 같은 모양이고 parts 순서대로 면 슬롯을 둔다.
class LightFaces{
 constructor(index){
  this.index=index;
  this.frame={t:0,cycle:0,point:[0,0,0],forward:[0,0,0],across:[0,0,0],side:0,stretch:1};
  this.slots=[];
  // 광원마다 고정이거나 고도가 바뀔 때만 바뀌는 Math.hypot 결과.
  this.horizontalD=NaN;this.horizontalDepth=NaN;this.horizontal=0;
  this.totalHorizontal=NaN;this.totalRise=NaN;this.total=0;
  this.normalDepth=NaN;this.normalRise=NaN;this.normalLength=0;
  this.parts=null;this.partsLight=null;this.partsSeed=NaN;this.partsOutline=NaN;this.partsLine=false;this.partsSecondary=NaN;
 }
}

// 면 하나의 버퍼. face는 소비자에게 넘기는 객체다. points·screen·edges는 정확한 길이의 배열이고
// *Store는 길이가 줄어도 꼭짓점 객체를 버리지 않는 보관함이다.
class FaceSlot{
 constructor(key){
  this.points=[];this.screen=[];this.edges=[];
  this.pointStore=[];this.screenStore=[];
  this.face={id:'',outline:false,rgb:null,points:this.points,edges:undefined,frame:null,surface:'wall',screen:this.screen,alpha:0,lineWidth:0};
  // 잔상이 다음 프레임의 같은 면을 찾는 번호. 열거되지 않아 면 비교·복사에 끼지 않는다.
  Object.defineProperty(this.face,'slotKey',{value:key});
  this.idCycle=NaN;this.idPart=null;
 }
}

const mappedScratch=new Float64Array(48),distanceScratch=new Float64Array(3);
const FACE_KEYS_PER_LIGHT=8;

export class FaceFrame{
 constructor(){
  this.faces=[];this.count=0;this.lights=[];this.sortScratch=[];
  this.lineTerms=new PyramidTerms();this.baseTerms=new PyramidTerms();
 }
 begin(){this.count=0;}
 light(index){return this.lights[index]??(this.lights[index]=new LightFaces(index));}
 slot(lightFaces,partIndex){return lightFaces.slots[partIndex]??(lightFaces.slots[partIndex]=new FaceSlot(lightFaces.index*FACE_KEYS_PER_LIGHT+partIndex));}
 commit(face){this.faces[this.count++]=face;}
 // legacy와 같이 가까운 깊이(frame.point[2])가 큰 면부터 정렬한다. 같은 깊이는 원래 순서를 지킨다.
 end(){
  const faces=this.faces;faces.length=this.count;
  sortByDepthDescending(faces,this.sortScratch);
  return faces;
 }
}

function sortByDepthDescending(items,scratch){
 const count=items.length;
 if(scratch.length<count)scratch.length=count;
 let source=items,target=scratch;
 for(let width=1;width<count;width*=2){
  for(let left=0;left<count;left+=width*2){
   const middle=Math.min(left+width,count),right=Math.min(left+width*2,count);
   let i=left,j=middle,k=left;
   while(i<middle&&j<right)target[k++]=source[j].frame.point[2]>source[i].frame.point[2]?source[j++]:source[i++];
   while(i<middle)target[k++]=source[i++];
   while(j<right)target[k++]=source[j++];
  }
  const swap=source;source=target;target=swap;
 }
 if(source!==items)for(let i=0;i<count;i++)items[i]=source[i];
}

// legacy frameAt(light,travel,pyramid,nearStretch)과 같은 값을 lightFaces.frame에 쓴다.
function frameInto(lightFaces,light,travel,pyramid,terms,nearStretch=1){
 const frame=lightFaces.frame;
 const cycle=light.phase+travel/pyramid.depth;
 const t=.018+(cycle-Math.floor(cycle))*.956;
 const endHeight=pyramid.baseCenter+light.endFraction*pyramid.height/2;
 const px=light.d*t,py=pyramid.apexHeight+(endHeight-pyramid.apexHeight)*t,pz=pyramid.depth*(1-t);
 if(lightFaces.horizontalD!==light.d||lightFaces.horizontalDepth!==pyramid.depth){
  lightFaces.horizontalD=light.d;lightFaces.horizontalDepth=pyramid.depth;lightFaces.horizontal=hypot2(light.d,pyramid.depth);
 }
 const horizontal=lightFaces.horizontal;
 const out0=light.d/horizontal,out2=-pyramid.depth/horizontal;
 const rise=pyramid.baseCenter+light.endFraction*pyramid.height/2-pyramid.apexHeight;
 if(lightFaces.totalHorizontal!==horizontal||lightFaces.totalRise!==rise){
  lightFaces.totalHorizontal=horizontal;lightFaces.totalRise=rise;lightFaces.total=hypot2(horizontal,rise);
 }
 const total=lightFaces.total;
 const forward=frame.forward,across=frame.across;
 forward[0]=-out0*horizontal/total;forward[1]=-rise/total;forward[2]=-out2*horizontal/total;
 across[0]=-out0*rise/total;across[1]=horizontal/total;across[2]=-out2*rise/total;
 const horizontalSurface=light.surface==='floor'||light.surface==='ceiling';
 if(horizontalSurface){
  if(lightFaces.normalDepth!==pyramid.depth||lightFaces.normalRise!==rise){
   lightFaces.normalDepth=pyramid.depth;lightFaces.normalRise=rise;lightFaces.normalLength=hypot2(pyramid.depth,rise);
  }
  const ny=pyramid.depth/lightFaces.normalLength,nz=rise/lightFaces.normalLength;
  const a0=ny*forward[2]-nz*forward[1],a1=nz*forward[0],a2=-ny*forward[0];
  across[0]=a0;across[1]=a1;across[2]=a2;
 }
 // verticalBounds(pz,pyramid)
 const boundT=1-pz/pyramid.depth,center=pyramid.apexHeight+(pyramid.baseCenter-pyramid.apexHeight)*boundT;
 const lower=center-pyramid.height/2*boundT,upper=center+pyramid.height/2*boundT;
 const halfWidth=pyramid.width/2;
 const normals=horizontalSurface?terms.floorNormals:terms.wallNormals,lengths=horizontalSurface?terms.floorLengths:terms.wallLengths;
 const distances=distanceScratch;
 distances[0]=pyramid.depth-pz;
 if(horizontalSurface){distances[1]=halfWidth*t-px;distances[2]=halfWidth*t+px;}
 else{distances[1]=upper-py;distances[2]=py-lower;}
 const boundaryDistance=Math.min(distances[0]/lengths[0],distances[1]/lengths[1],distances[2]/lengths[2]);
 let side=Math.min(light.side,Math.max(0,boundaryDistance)*.985/.73);
 const stretch=depthStretchAt(t,nearStretch);
 if(stretch>1){
  for(let k=0;k<3;k++){
   const n0=normals[k*3],n1=normals[k*3+1],n2=normals[k*3+2];
   const dotAcross=0+n0*across[0]+n1*across[1]+n2*across[2];
   const dotForward=0+n0*forward[0]+n1*forward[1]+n2*forward[2];
   const extent=.5*Math.abs(dotAcross)+.7*stretch*Math.abs(dotForward);
   if(extent>1e-12)side=Math.min(side,Math.max(0,distances[k])*.985/extent);
  }
 }
 frame.t=t;frame.cycle=Math.floor(cycle);
 frame.point[0]=px;frame.point[1]=py;frame.point[2]=pz;
 frame.side=side;frame.stretch=stretch;
 return frame;
}

// 도안 꼭짓점을 mapPoint로 세계 좌표에 놓고 clipAtFront처럼 앞면 z=0에서 자른 결과를 face.points에 쓴다.
function placePart(slot,frame,unitPoints){
 const count=unitPoints.length,mapped=mappedScratch,point=frame.point,across=frame.across,forward=frame.forward;
 for(let j=0;j<count;j++){
  const u=unitPoints[j][0],v=unitPoints[j][1];
  for(let i=0;i<3;i++)mapped[j*3+i]=point[i]+frame.side*(u*across[i]+v*frame.stretch*forward[i]);
 }
 const points=slot.points,store=slot.pointStore;
 slot.face.points=points;
 let clipped=0;
 for(let j=0;j<count;j++){
  const a=j*3,b=((j+1)%count)*3,insideA=mapped[a+2]>=0,insideB=mapped[b+2]>=0;
  if(insideA){
   const target=store[clipped]??(store[clipped]=[0,0,0]);
   target[0]=mapped[a];target[1]=mapped[a+1];target[2]=mapped[a+2];points[clipped++]=target;
  }
  if(insideA!==insideB){
   const t=mapped[a+2]/(mapped[a+2]-mapped[b+2]),target=store[clipped]??(store[clipped]=[0,0,0]);
   target[0]=mapped[a]+(mapped[b]-mapped[a])*t;target[1]=mapped[a+1]+(mapped[b+1]-mapped[a+1])*t;target[2]=0;points[clipped++]=target;
  }
 }
 points.length=clipped;
 return clipped;
}

// legacy worldFaces의 절단 경계 표시와 같다. 연속한 두 꼭짓점이 모두 z=0이면 그 변은 그리지 않는다.
function edgesInto(slot){
 const points=slot.points,edges=slot.edges;
 for(let i=0;i<points.length;i++)edges[i]=!(points[i][2]===0&&points[(i+1)%points.length][2]===0);
 edges.length=points.length;
 return edges;
}

// collectFaces와 같이 화면 좌표를 구하고 화면 밖·작은 면을 걸러 alpha·lineWidth를 채운다. 통과하면 true.
function finishFace(slot,light,view){
 const face=slot.face,points=face.points,screen=slot.screen,store=slot.screenStore,count=points.length;
 face.screen=screen;
 let allLeft=true,allRight=true,allAbove=true,allBelow=true;
 for(let i=0;i<count;i++){
  const p=points[i],depth=p[2]+view.back,s=store[i]??(store[i]={x:0,y:0});
  s.x=view.width/2+p[0]*view.focal/depth;s.y=view.principalY+(view.cameraHeight-p[1])*view.focal/depth;screen[i]=s;
  if(!(s.x< -70))allLeft=false;
  if(!(s.x>view.width+70))allRight=false;
  if(!(s.y< -70))allAbove=false;
  if(!(s.y>view.height+70))allBelow=false;
 }
 screen.length=count;
 if(allLeft||allRight||allAbove||allBelow)return false;
 let sum=0;
 for(let i=0;i<count;i++){const v=screen[i],q=screen[(i+1)%count];sum=sum+v.x*q.y-q.x*v.y;}
 const area=Math.abs(sum)/2;
 if(area<.2)return false;
 const t=face.frame.t;
 face.alpha=Math.min(1,t/.2)*Math.min(1,(1-t)/.05)*light.brightness;
 face.lineWidth=Math.max(.65,Math.min(2.4,Math.sqrt(area)*.045));
 return true;
}

function faceId(slot,light,cycle,part){
 if(slot.idCycle!==cycle||slot.idPart!==part){
  slot.idCycle=cycle;slot.idPart=part;
  slot.face.id=`${light.id}/${cycle}/${part.outline?'stroke':'fill'}/${part.id}`;
 }
 return slot.face.id;
}

// collectFaces(lights,travel,s,p,view)와 같은 면을 out에 계산한다. linePyramid는 linePyramidFor(s,p,view)다.
export function collectFacesInto(out,lights,travel,s,p,view,linePyramid){
 out.begin();
 if(s.size===0)return out.end();
 const lineTerms=out.lineTerms.update(linePyramid),baseTerms=out.baseTerms.update(p);
 for(let index=0;index<lights.length;index++){
  const light=lights[index];
  if(light.side<=0)continue;
  const isLine=s.variant==='lines'||s.variant==='mixed'&&light.isLine,pyramid=isLine?linePyramid:p;
  const lightFaces=out.light(index),parts=cachedParts(lightFaces,light,s,isLine);
  if(parts===LEGACY_PARTS){
   // 삼각형 채움 도안은 게임 기본값이 아니라서 legacy worldFaces의 새 면을 그대로 받아 화면 값만 채운다.
   const legacy=worldFaces(light,travel,s,pyramid);
   for(let partIndex=0;partIndex<legacy.length;partIndex++){
    const source=legacy[partIndex];
    if(source.points.length<3)continue;
    const slot=out.slot(lightFaces,partIndex),face=slot.face;
    face.id=source.id;face.outline=source.outline;face.rgb=source.rgb;face.points=source.points;face.edges=source.edges;face.frame=source.frame;face.surface=source.surface;
    slot.idPart=null;
    if(finishFace(slot,light,view))out.commit(face);
   }
   continue;
  }
  const frame=frameInto(lightFaces,light,travel,pyramid,isLine?lineTerms:baseTerms,s.nearStretch);
  for(let partIndex=0;partIndex<parts.length;partIndex++){
   const part=parts[partIndex],slot=out.slot(lightFaces,partIndex),face=slot.face;
   if(placePart(slot,frame,part.points)<3)continue;
   face.outline=part.outline;face.rgb=part.rgb;face.edges=part.outline?edgesInto(slot):undefined;
   face.frame=frame;face.surface=light.surface||'wall';
   if(!finishFace(slot,light,view))continue;
   faceId(slot,light,frame.cycle,part);
   out.commit(face);
  }
 }
 return out.end();
}
