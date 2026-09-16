// 한 변 1인 정삼각형을 변의 중점으로 4등분한다. 좌표 원점은 큰 삼각형의 무게중심이다.
import { projectVertices } from './surface.mjs';
import { colorGroups, paletteKey, seedMode, random01, secondaryRatio } from './palette.mjs';
const root3=Math.sqrt(3);
export const vertices=[[0,root3/3],[-.5,-root3/6],[.5,-root3/6],[-.25,root3/12],[.25,root3/12],[0,-root3/6]];
export const cells=[
  {bit:1,name:'위',vertices:[0,3,4]},
  {bit:2,name:'왼쪽 아래',vertices:[3,1,5]},
  {bit:4,name:'가운데',vertices:[3,5,4]},
  {bit:8,name:'오른쪽 아래',vertices:[4,5,2]},
];
export const fillCount = value => ['1','2','3','4'].includes(String(value)) ? String(value) : 'all';
export const maskMode = value => /^([0-9]|1[0-5])$/.test(String(value)) ? Number(value) : null;
export const objectScale = value => value===null||value===''||!Number.isFinite(Number(value)) ? 1 : Math.max(1,Math.min(3,Number(value)));
export const countCells = mask => cells.filter(cell=>(mask&cell.bit)!==0).length;
export const masksForCount = count => Array.from({length:15},(_,i)=>i+1).filter(mask=>fillCount(count)==='all'||countCells(mask)===Number(count));
export const toggleCell = (mask,bit) => (Number(mask)&15)^bit;
const hashId = id => {let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;return hash;};
export function lightMask(light,{fill='all',mask=null,seed}={}) {
  if(maskMode(mask)!==null)return maskMode(mask);
  const choices=masksForCount(fill);
  const index=seed===undefined?hashId(light.id)%choices.length:Math.floor(random01(`${seedMode(seed)??0}/${light.id}/fill`)*choices.length);
  return choices[index];
}

// 서로 변을 공유하는 채워진 칸을 먼저 합친다. 내부 변은 그리지 않고 외곽선만 한 번 채운다.
function mergedParts(mask) {
  const selected=cells.filter(cell=>(mask&cell.bit)!==0),components=[];
  while(selected.length){
    const component=[selected.shift()];
    for(let i=0;i<component.length;i++)for(let j=selected.length-1;j>=0;j--){
      if(component[i].vertices.filter(id=>selected[j].vertices.includes(id)).length===2)component.push(...selected.splice(j,1));
    }
    const boundary=new Map();
    for(const cell of component)for(let i=0;i<3;i++){
      const a=cell.vertices[i],b=cell.vertices[(i+1)%3],edge=[a,b].sort().join('/');
      if(boundary.has(edge))boundary.delete(edge);else boundary.set(edge,[a,b]);
    }
    const edges=[...boundary.values()],outline=[edges[0][0]],first=outline[0];let current=first;
    do{const next=edges.find(([a])=>a===current)[1];current=next;if(current!==first)outline.push(current);}while(current!==first);
    // 같은 직선 위의 중점은 제거한다. 4칸을 채우면 꼭짓점 3개인 큰 정삼각형이 된다.
    const points=outline.map(id=>vertices[id]).filter((b,i,list)=>{
      const a=list[(i+list.length-1)%list.length],c=list[(i+1)%list.length];
      return Math.abs((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))>1e-10;
    });
    components.push({part:component.reduce((sum,c)=>sum|c.bit,0),outline:points});
  }
  return components;
}
const partsCache=Array.from({length:16},(_,mask)=>mergedParts(mask));
export const triangleParts = mask => partsCache[Number(mask)&15];
const colorCache=new WeakMap();
function coloredParts(light,mask,options){
  const key=`${mask}/${paletteKey(options.palette)}/${seedMode(options.seed)??0}/${secondaryRatio(options.secondary,options.palette)}`;
  const cached=colorCache.get(light);if(cached?.key===key)return cached.parts;
  const parts=colorGroups(light.id,mask,options.palette,options.seed,options.secondary).flatMap(group=>triangleParts(group.mask).map(piece=>({
    ...piece,part:`${piece.part}/color-${group.colorIndex}`,rgb:group.rgb,colorIndex:group.colorIndex,tier:group.tier,
  })));
  colorCache.set(light,{key,parts});return parts;
}

export function triangleFrame(light,z,scale=1) {
  const vertical=light.kind==='vertical';
  const flat=!vertical&&(!light.layer||light.layer==='ground'||light.layer==='overhead');
  const w=light.faceWidth??(vertical?Math.max(1.6,light.extent*.2):light.extent*(light.kind==='point'?.75:1));
  const h=light.faceLength??(vertical?light.extent:light.extent*(flat?.7:.48));
  // 이전 면의 면적을 기준으로 크기를 잡되 두 축에 같은 배율을 적용해 실제 정삼각형을 유지한다.
  const side=Math.sqrt(w*h*4/root3)*objectScale(scale);
  return {center:[light.x,(light.elevation??.25)+(vertical&&!light.basisU?light.extent/2:0),z],
    u:light.basisU??[1,0,0],v:light.basisV??(flat?[0,0,1]:[0,1,0]),side};
}
export function triangleWorldParts(light,z,options={}) {
  const mask=lightMask(light,options),frame=triangleFrame(light,z,options.scale);
  const parts=options.palette===undefined?triangleParts(mask):coloredParts(light,mask,options);
  return parts.map(piece=>({part:piece.part,mask,...(piece.rgb?{rgb:piece.rgb,colorIndex:piece.colorIndex,tier:piece.tier}:{}),points:piece.outline.map(([u,v])=>frame.center.map((n,i)=>n+frame.side*(u*frame.u[i]+v*frame.v[i])))}));
}
export function projectObject(light,z,view,options={}) {
  return triangleWorldParts(light,z,options).map(piece=>({...piece,points:projectVertices(piece.points,view)})).filter(piece=>piece.points.length>=3);
}
