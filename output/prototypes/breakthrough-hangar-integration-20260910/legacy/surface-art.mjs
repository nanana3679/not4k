// PROTOTYPE — 생성 이미지의 목록과 표면 좌표. DOM이나 GPU 없이 검증한다.
export const artThemes=[{id:'armor',name:'장갑 시설'},{id:'conduit',name:'배관 시설'},{id:'rib',name:'거대 골조'}];
export const surfaceArt=artThemes.flatMap(theme=>['floor','ceiling'].map(surface=>({
  id:`${theme.id}-${surface}`,surface,theme:theme.id,name:theme.name,
  path:`assets/${theme.id}-${surface}.png`
})));
export function artFor(surface,value){
  if(value==='lights')return 'lights';
  return surfaceArt.find(art=>art.id===value&&art.surface===surface)?.id||`armor-${surface}`;
}
// 벽면 목록은 geometry와의 순환 의존 없이 동일한 자산 ID를 조회한다.
export const artById=id=>surfaceArt.find(art=>art.id===id)||(['wall-armor','wall-brace'].includes(id)?{id,path:`assets/${id}.png`}:undefined);
// 가로 좌표는 A에서 가까운 쪽의 어느 점을 향하는지, 세로 좌표는 전진 거리에 대응한다.
export function textureCoordinates([x,y,z],pyramid,travel){
  const t=Math.max(.0001,1-z/pyramid.depth);
  return [x/(pyramid.width*t)+.5,(z+.956*travel)/pyramid.width];
}
export function clipCoordinates([x,y,z],view){
  const w=z+view.back;
  return [2*x*view.focal/view.width,2*(y-view.cameraHeight)*view.focal/view.height+(1-2*view.principalY/view.height)*w,0,w];
}
export const isTexture=(settings,surface)=>settings[surface]&&settings[`${surface}Art`]!=='lights';
export const showSurfaceLight=(settings,surface)=>!surface||surface==='wall'||settings[`${surface}Art`]==='lights';
