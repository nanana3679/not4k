// 삼각형 채움은 돌파에만 적용한다. 이륙·침투는 시연 13의 발광 면을 그대로 쓴다.
import { projectObject, objectScale } from './triangles.mjs';
import { projectSurface, projectedSurfaceAreaEstimate } from './surface.mjs';
import { objectColor } from './palette.mjs';
export const objectKind=key=>key==='liftoff'||key==='infiltration'?'panel':'triangle';
const panelCache=new WeakMap();
export function panelObjectTemplate(light,options={}){
  const key=options.scenario??options.palette??'breakthrough';
  const scale=objectScale(options.scale);
  const cacheKey=`${key}/${scale}/${options.seed??''}/${options.secondary??''}`;
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
