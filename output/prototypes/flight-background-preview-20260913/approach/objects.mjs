// 삼각형 채움은 돌파에만 적용한다. 이륙·침투는 시연 13의 발광 면을 그대로 쓴다.
import { projectObject, objectScale } from './triangles.mjs';
import { projectSurface, projectedSurfaceAreaEstimate } from './surface.mjs';
import { objectColor } from './palette.mjs';
export const objectKind=key=>key==='liftoff'||key==='infiltration'?'panel':'triangle';
const panelCache=new WeakMap();
// 캐시 키 문자열은 장면·크기·배색 값이 바뀔 때만 다시 만든다. 매 프레임 광원마다 문자열을 만들지 않는다.
let lastKeyParts=null,lastCacheKey='';
function panelCacheKey(key,scale,seed,secondary){
  const parts=lastKeyParts;
  if(parts&&parts.key===key&&parts.scale===scale&&parts.seed===seed&&parts.secondary===secondary)return lastCacheKey;
  lastKeyParts={key,scale,seed,secondary};lastCacheKey=`${key}/${scale}/${seed}/${secondary}`;
  return lastCacheKey;
}
// panelObjectTemplate 캐시 키. 같은 키면 같은 광원의 템플릿을 다시 쓸 수 있다.
export function panelTemplateKey(options={}){
  return panelCacheKey(options.scenario??options.palette??'breakthrough',objectScale(options.scale),options.seed??'',options.secondary??'');
}
export function panelObjectTemplate(light,options={}){
  const key=options.scenario??options.palette??'breakthrough';
  const scale=objectScale(options.scale);
  const cacheKey=panelCacheKey(key,scale,options.seed??'',options.secondary??'');
  const cached=panelCache.get(light);if(cached?.key===cacheKey)return cached.value;
  const sized={...light,extent:light.extent*scale,
    elevation:(light.elevation??.25)+(light.kind==='vertical'&&!light.basisU?light.extent*(1-scale)/2:0),
    faceWidth:light.faceWidth===undefined?undefined:light.faceWidth*scale,
    faceLength:light.faceLength===undefined?undefined:light.faceLength*scale};
  const value={sized,color:objectColor(light.id,key,options.seed,options.secondary)};
  panelCache.set(light,{key:cacheKey,value});return value;
}
export function panelScreenAreaEstimate(light,z,view,options={}){
  return projectedSurfaceAreaEstimate(panelObjectTemplate(light,options).sized,z,view);
}
export function projectScenarioObject(light,z,view,options={}){
  const key=options.scenario??options.palette??'breakthrough';
  if(objectKind(key)==='triangle')return projectObject(light,z,view,options).map(piece=>({...piece,geometry:'triangle'}));
  const {sized,color}=panelObjectTemplate(light,options);
  const points=projectSurface(sized,z,view);
  if(points.length<3)return [];
  return [{part:'panel',geometry:'panel',points,...color}];
}
