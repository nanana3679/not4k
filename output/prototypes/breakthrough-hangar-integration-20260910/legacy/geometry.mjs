// PROTOTYPE 35 — 가까운 단면은 고정하고 A의 상하 이동 폭은 aa′ 기준으로 확대한다.
import {artFor} from './surface-art.mjs';
import {architectureSettings} from './architecture.mjs';
import {originalSettings} from './original-motion.mjs';
import { random01, colorGroups, objectColor } from './palette.mjs';
// A의 이동 기준 aa′는 단면 높이 조절과 독립적으로 유지한다.
export const APEX_REFERENCE_HEIGHT=72;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const number=(v,f,a,b)=>v===null||v===''||!Number.isFinite(Number(v))?f:clamp(Number(v),a,b);
export const MAX_OBJECT_SIZE=2.5;
export const sizeFromPercent=value=>number(value,10,0,100)*MAX_OBJECT_SIZE/100;
export const sizeToPercent=value=>Math.round(number(value,.25,0,MAX_OBJECT_SIZE)*100/MAX_OBJECT_SIZE);
export function settingsFrom(search=''){
  const p=new URLSearchParams(search);
  return {...architectureSettings(p),...originalSettings(p),variant:['triangles','lines','mixed'].includes(p.get('variant'))?p.get('variant'):'lines',
    altitude:number(p.get('altitude'),.5,0,1),speed:number(p.get('speed'),1000,0,1000),clearance:p.get('clearance')!=='0',
    width:number(p.get('width'),88,32,160),depth:number(p.get('depth'),200,100,420),
    planes:Math.round(number(p.get('planes'),8,2,16)/2)*2,density:number(p.get('density'),100,30,180),
    size:number(p.get('size'),.25,0,MAX_OBJECT_SIZE),nearStretch:number(p.get('nearStretch'),4,1,8),height:number(p.get('height'),144,24,280),
    apexLow:number(p.get('apexLow'),1,0,1),apexHigh:number(p.get('apexHigh'),0,0,1),apexLinked:p.get('apexLinked')!=='0',
    apexGain:number(p.get('apexGain'),5,1,10),
    outline:number(p.get('outline'),.25,0,1),secondary:number(p.get('secondary'),.2,0,.5),trail:number(p.get('trail'),.12,0,.3),
    seed:Math.floor(number(p.get('seed'),42,0,4294967295)),lanes:p.get('lanes')!=='0',
    walls:p.get('walls')!=='0',wallThickness:number(p.get('wallThickness'),2,0,6),wallGap:number(p.get('wallGap'),4,1,4),wallBrightness:number(p.get('wallBrightness'),.3,0,1.5),floor:p.get('floor')!=='0',ceiling:p.get('ceiling')!=='0',
    floorArt:artFor('floor',p.get('floorArt')),ceilingArt:artFor('ceiling',p.get('ceilingArt')),surfaceBrightness:number(p.get('surfaceBrightness'),.85,0,1.5),guides:p.get('guides')==='1',running:p.get('paused')!=='1'};
}
export function pyramidFor(s,altitude=s.altitude){
  const a=s.apexLinked?clamp(altitude,0,1):.5,t=a*a*(3-2*a),baseCenter=12;
  const middle=(s.apexLow+s.apexHigh)/2;
  const position=middle+(s.apexLow+(s.apexHigh-s.apexLow)*t-middle)*s.apexGain;
  return {width:s.width,depth:s.depth,height:s.height,baseCenter,apexPosition:position,
    apexHeight:baseCenter+(position-.5)*APEX_REFERENCE_HEIGHT};
}
export const sectionVertices=(d,pyramid)=>[[0,pyramid.apexHeight,pyramid.depth],
  [d,pyramid.baseCenter-pyramid.height/2,0],[d,pyramid.baseCenter+pyramid.height/2,0]];
export const surfaceVertices=(surface,pyramid)=>{
  const y=pyramid.baseCenter+(surface==='floor'?-1:1)*pyramid.height/2;
  return [[0,pyramid.apexHeight,pyramid.depth],[-pyramid.width/2,y,0],[pyramid.width/2,y,0]];
};
export function verticalBounds(z,pyramid){
  const t=1-z/pyramid.depth,center=pyramid.apexHeight+(pyramid.baseCenter-pyramid.apexHeight)*t;
  return {lower:center-pyramid.height/2*t,upper:center+pyramid.height/2*t};
}
export function insidePyramid([x,y,z],pyramid,tolerance=1e-8){
  const t=1-z/pyramid.depth,bounds=verticalBounds(z,pyramid);
  return t>=-tolerance&&t<=1+tolerance&&Math.abs(x)<=pyramid.width/2*t+tolerance&&y>=bounds.lower-tolerance&&y<=bounds.upper+tolerance;
}
export function planeOffsets(pyramid,count){
  const half=count/2;
  return Array.from({length:count},(_,i)=>{
    const j=i<half?half-1-i:i-half;
    return (i<half?-1:1)*pyramid.width/2*(.19+.77*j/Math.max(1,half-1));
  });
}
export function makeLights(settings){
  const pyramid=pyramidFor(settings),offsets=planeOffsets(pyramid,settings.planes),perPlane=Math.round(42*settings.density/100);
  const walls=offsets.flatMap((d,plane)=>Array.from({length:perPlane},(_,i)=>{
    const id=`p${plane}-${i}`,rand=tag=>random01(`${settings.seed}/${id}/${tag}`);
    // 가까운 쪽 목표 높이는 고도에 무관하게 고정한다. 움직이는 A에서 이 위치로 흐른다.
    const band=rand('band'),endFraction=band<.46?(rand('height')-.5)*.24:
      band<.78?.4+rand('height')*.5:-.9+rand('height')*.38;
    return {id,d,plane,endFraction,phase:(i+rand('phase'))/perPlane,
      side:(4.3+rand('size')*4.6)*settings.size,mask:1+Math.floor(rand('mask')*15),
      isLine:rand('shape')<.35,brightness:.65+rand('light')*.35};
  }));
  const surfaces=[],count=Math.round(112*settings.density/100);
  for(const surface of ['floor','ceiling'])if(settings[surface]){
    for(let i=0;i<count;i++){
      const id=`${surface}-${i}`,rand=tag=>random01(`${settings.seed}/${id}/${tag}`);
      surfaces.push({id,surface,plane:-1,d:(rand('across')*1.76-.88)*pyramid.width/2,endFraction:surface==='floor'?-1:1,
        phase:(i+rand('phase'))/count,side:(4.3+rand('size')*4.6)*settings.size,mask:1+Math.floor(rand('mask')*15),
        isLine:rand('shape')<.35,brightness:.65+rand('light')*.35});
    }
  }
  return walls.concat(surfaces);
}
export function centerAt(light,travel,pyramid){
  const cycle=light.phase+travel/pyramid.depth;
  const t=.018+(cycle-Math.floor(cycle))*.956;
  const endHeight=pyramid.baseCenter+light.endFraction*pyramid.height/2;
  return {t,cycle:Math.floor(cycle),point:[light.d*t,pyramid.apexHeight+(endHeight-pyramid.apexHeight)*t,pyramid.depth*(1-t)]};
}
export function depthStretchAt(t,nearStretch=4){
  const near=clamp((t-.35)/.65,0,1);
  return 1+(nearStretch-1)*near*near;
}
export function frameAt(light,travel,pyramid,nearStretch=1){
  const state=centerAt(light,travel,pyramid),horizontal=Math.hypot(light.d,pyramid.depth);
  const out=[light.d/horizontal,0,-pyramid.depth/horizontal];
  const rise=pyramid.baseCenter+light.endFraction*pyramid.height/2-pyramid.apexHeight,total=Math.hypot(horizontal,rise);
  const forward=[-out[0]*horizontal/total,-rise/total,-out[2]*horizontal/total];
  // forward에 직교하면서 같은 ad 수직 평면 안에 놓이는 축.
  let across=[-out[0]*rise/total,horizontal/total,-out[2]*rise/total];
  const horizontalSurface=light.surface==='floor'||light.surface==='ceiling';
  if(horizontalSurface){
    const normalLength=Math.hypot(pyramid.depth,rise),ny=pyramid.depth/normalLength,nz=rise/normalLength;
    across=[ny*forward[2]-nz*forward[1],nz*forward[0],-ny*forward[0]];
  }
  // 기본 도안에 원근 강조를 적용한 뒤 전체 광원을 같은 비율로 축소해 단면 안에 넣는다.
  // 모든 형태는 단위 반지름 .73 안에 있으므로 각 경계까지 거리/.73 이하로 제한한다.
  const bounds=verticalBounds(state.point[2],pyramid),halfHeight=pyramid.height/2;
  const upperSlope=(pyramid.baseCenter+halfHeight-pyramid.apexHeight)/pyramid.depth;
  const lowerSlope=(pyramid.baseCenter-halfHeight-pyramid.apexHeight)/pyramid.depth;
  const halfWidth=pyramid.width/2;
  const constraints=horizontalSurface?
    [[[0,0,1],pyramid.depth-state.point[2]],[[1,0,halfWidth/pyramid.depth],halfWidth*state.t-state.point[0]],
      [[-1,0,halfWidth/pyramid.depth],halfWidth*state.t+state.point[0]]]:
    [[[0,0,1],pyramid.depth-state.point[2]],[[0,1,upperSlope],bounds.upper-state.point[1]],
      [[0,-1,-lowerSlope],state.point[1]-bounds.lower]];
  const boundaryDistance=Math.min(...constraints.map(([normal,distance])=>distance/Math.hypot(...normal)));
  let side=Math.min(light.side,Math.max(0,boundaryDistance)*.985/.73);
  const stretch=depthStretchAt(state.t,nearStretch);
  if(stretch>1){
    // 모든 도안이 들어가는 u±.5, v±.7의 상자를 먼 끝과 위아래 경계에 맞춘다.
    // 가까운 끝은 출구이므로 축소하지 않고 worldFaces에서 넘은 부분만 자른다.
    // 길이 강조는 전방 축에만 적용하며 중심과 ad 수직 평면은 유지한다.
    for(const [normal,distance]of constraints){
      const dot=axis=>normal.reduce((sum,n,i)=>sum+n*axis[i],0);
      const extent=.5*Math.abs(dot(across))+.7*stretch*Math.abs(dot(forward));
      if(extent>1e-12)side=Math.min(side,Math.max(0,distance)*.985/extent);
    }
  }
  return {...state,forward,across,side,stretch};
}
export const mapPoint=(frame,[u,v])=>frame.point.map((x,i)=>x+frame.side*(u*frame.across[i]+v*frame.stretch*frame.forward[i]));
export const triangleVertices=[[0,Math.sqrt(3)/3],[-.5,-Math.sqrt(3)/6],[.5,-Math.sqrt(3)/6],[-.25,Math.sqrt(3)/12],[.25,Math.sqrt(3)/12],[0,-Math.sqrt(3)/6]];
const cells=[[0,3,4],[3,1,5],[3,5,4],[4,5,2]];
function outlines(mask){
  const pending=cells.map((indices,i)=>({indices,bit:1<<i})).filter(c=>mask&c.bit),result=[];
  while(pending.length){
    const group=[pending.shift()];
    for(let i=0;i<group.length;i++)for(let j=pending.length-1;j>=0;j--)
      if(group[i].indices.filter(k=>pending[j].indices.includes(k)).length===2)group.push(...pending.splice(j,1));
    const edges=new Map();
    for(const c of group)for(let i=0;i<3;i++){
      const a=c.indices[i],b=c.indices[(i+1)%3],key=[a,b].sort().join('/');
      if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
    }
    const remaining=[...edges.values()],first=remaining[0][0],path=[first];let at=first;
    do{at=remaining.find(([a])=>a===at)[1];if(at!==first)path.push(at);}while(at!==first);
    result.push({part:group.reduce((s,c)=>s|c.bit,0),points:path.map(i=>triangleVertices[i])});
  }
  return result;
}
const masks=Array.from({length:16},(_,i)=>outlines(i));
const appearanceCache=new WeakMap();
function appearance(light,settings,line){
  const outline=random01(`${settings.seed}/${light.id}/outline`)<settings.outline;
  const key=`${line}/${outline}/${settings.seed}/${settings.secondary}`;
  const old=appearanceCache.get(light);if(old?.key===key)return old.parts;
  let parts;
  if(line){
    const area=Math.sqrt(3)/4*[1,2,4,8].filter(bit=>light.mask&bit).length/4;
    const length=1.4,halfWidth=area/length/2;
    const color=objectColor(light.id,'breakthrough',settings.seed,settings.secondary);
    parts=[{id:'line',rgb:color.rgb,points:[[-halfWidth,-length/2],[halfWidth,-length/2],[halfWidth,length/2],[-halfWidth,length/2]]}];
  }else if(outline){
    const color=objectColor(light.id,'breakthrough',settings.seed,settings.secondary);
    parts=[{id:'outline',rgb:color.rgb,points:triangleVertices.slice(0,3)}];
  }else parts=colorGroups(light.id,light.mask,'breakthrough',settings.seed,settings.secondary).flatMap(color=>masks[color.mask].map(part=>({id:`${color.colorIndex}/${part.part}`,rgb:color.rgb,points:part.points})));
  parts=parts.map(part=>({...part,outline}));
  appearanceCache.set(light,{key,parts});return parts;
}
export function clipAtFront(points){
  const clipped=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],insideA=a[2]>=0,insideB=b[2]>=0;
    if(insideA)clipped.push(a);
    if(insideA!==insideB){
      const t=a[2]/(a[2]-b[2]);clipped.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,0]);
    }
  }
  return clipped;
}
export function worldFaces(light,travel,settings,scenePyramid){
  if(light.side<=0)return [];
  const pyramid=scenePyramid||pyramidFor(settings),frame=frameAt(light,travel,pyramid,settings.nearStretch);
  const line=settings.variant==='lines'||settings.variant==='mixed'&&light.isLine;
  return appearance(light,settings,line).map(part=>{
    const points=clipAtFront(part.points.map(p=>mapPoint(frame,p)));
    // 절단 경계는 원래 도형의 테두리가 아니므로 윤곽선에 덧그리지 않는다.
    const edges=part.outline?points.map((p,i)=>!(p[2]===0&&points[(i+1)%points.length][2]===0)):undefined;
    return {id:`${light.id}/${frame.cycle}/${part.outline?'stroke':'fill'}/${part.id}`,outline:part.outline,rgb:part.rgb,points,edges,frame,surface:light.surface||'wall'};
  });
}
export function viewAt(width,height,altitude,pyramid){
  const focal=Math.min(width*.94,height*1.1),cameraHeight=pyramid.cameraHeight??12,back=8,principalY=height*.4;
  // A의 실제 투영 위치를 따른다. 화면 한곳으로 되돌리는 보정을 하지 않는다.
  const focus={x:width/2,y:principalY+(cameraHeight-pyramid.apexHeight)*focal/(pyramid.depth+back)};
  return {width,height,focal,cameraHeight,back,focus,principalY};
}
export function project([x,y,z],view){
  const depth=z+view.back;
  return {x:view.width/2+x*view.focal/depth,y:view.principalY+(view.cameraHeight-y)*view.focal/depth};
}
export function projectPolygon(points,view){
  const clipped=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=a[2]+view.back-2,db=b[2]+view.back-2;
    if(da>=0)clipped.push(a);
    if((da>=0)!==(db>=0))clipped.push(a.map((n,j)=>n+(b[j]-n)*da/(da-db)));
  }
  return clipped.length<3?[]:clipped.map(p=>project(p,view));
}
export function laneAt(width,height){
  const laneWidth=Math.max(112,Math.min(252,width*.32));
  return {left:(width-laneWidth)/2,width:laneWidth,top:24,hit:height*.85,noteSpeed:height*.48};
}
export function advanceMotion(state,dt,speed,running){
  const elapsed=running?clamp(dt,0,.05):0;
  return {time:state.time+elapsed,travel:state.travel+elapsed*28*speed/100,noteTime:state.noteTime+elapsed};
}
