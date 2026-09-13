// 이륙 시연 전용. 항공 시설 규격이나 실제 게임의 고도 규칙이 아니다.
import {wrapLength, visibleLights} from './motion.mjs';
import {projectVertices} from './surface.mjs';

export const runwayHalfWidth = 80;
export const runwaySpacing = 36;
export const runwayColor = Object.freeze([255,220,64]);
export function liftoffLighting(altitude) {
  const a = Number.isFinite(altitude) ? altitude : .25;
  const t = Math.max(0, Math.min(1, (a - .25) / .4));
  const blend = t * t * (3 - 2 * t);
  return {objects:blend, guides:1 - .65 * blend, ground:.68 - .40 * blend};
}

export function makeRunwayLights() {
  const lights = [];
  for (let row = 0; row < wrapLength / runwaySpacing; row++) {
    for (const side of [-1, 1]) lights.push({
      id:`runway/${row}/${side}`, row, x:side * runwayHalfWidth, z:row * runwaySpacing,
      kind:'point', layer:'ground', elevation:0, extent:2, bright:1,
      basisU:[1,0,0], basisV:[0,0,1], faceWidth:1.8, faceLength:2.8,
    });
  }
  return lights;
}
const fixtures = makeRunwayLights();

export function visibleRunwayLights(travel, view, _seed, quality) {
  const strength = liftoffLighting(view.altitude).guides;
  // 가이드는 지면에 눕힌 고정 크기의 작은 면이다. 다른 오브젝트의 크기·형태와 분리한다.
  // 모든 가이드의 본체와 잔광은 노란색으로 고정한다. 일반 오브젝트 팔레트와 독립적이다.
  const renderOptions=quality?{quality,keepAllPoints:quality!=='minimal'}:undefined;
  return visibleLights(fixtures,travel,view,'surface',undefined,renderOptions)
    .map(light=>({...light,rgb:runwayColor,guide:true,alpha:light.alpha*strength,stableId:light.stableId??light.id}));
}

export function runwayGround(view) {
  const edge = runwayHalfWidth + 3;
  return projectVertices([[-edge,0,wrapLength],[edge,0,wrapLength],[edge,0,0],[-edge,0,0]], view);
}

export function liftoffObjectLights(current, altitude) {
  const strength = liftoffLighting(altitude).objects;
  if (strength === 1) return current;
  if (strength === 0) return [];
  return current.map(light => ({...light, alpha:light.alpha * strength})).filter(light => light.alpha >= .025);
}
