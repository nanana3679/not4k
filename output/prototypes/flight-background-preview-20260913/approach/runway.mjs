// 이륙 시연 전용. 항공 시설 규격이나 실제 게임의 고도 규칙이 아니다.
import {wrapLength, visibleLights} from './motion.mjs';
import {projectVertices} from './surface.mjs';

export const runwayHalfWidth = 80;
export const runwaySpacing = 36;
export const runwayColor = Object.freeze([255,220,64]);
// 일반 오브젝트 밝기(0~1). liftoffLighting(altitude).objects와 같다.
export function liftoffBlend(altitude) {
  const a = Number.isFinite(altitude) ? altitude : .25;
  const t = Math.max(0, Math.min(1, (a - .25) / .4));
  return t * t * (3 - 2 * t);
}
export function liftoffLighting(altitude) {
  const blend = liftoffBlend(altitude);
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

const runwayRenderOptions = new Map();
// frame(VisibleLightFrame)을 넘기면 그 버퍼를 다시 쓴다. visibleLights가 이 호출에서 만든 광원에만 색·밝기를 덧쓴다.
export function visibleRunwayLights(travel, view, _seed, quality, frame) {
  const strength = 1 - .65 * liftoffBlend(view.altitude);
  // 가이드는 지면에 눕힌 고정 크기의 작은 면이다. 다른 오브젝트의 크기·형태와 분리한다.
  // 모든 가이드의 본체와 잔광은 노란색으로 고정한다. 일반 오브젝트 팔레트와 독립적이다.
  let renderOptions;
  if (quality) {
    renderOptions = runwayRenderOptions.get(quality);
    if (!renderOptions) runwayRenderOptions.set(quality, renderOptions = Object.freeze({quality,keepAllPoints:quality!=='minimal'}));
  }
  const current = visibleLights(fixtures,travel,view,'surface',undefined,renderOptions,frame);
  for (let i = 0; i < current.length; i++) {
    const light = current[i];
    light.rgb = runwayColor; light.guide = true; light.alpha = light.alpha * strength; light.stableId = light.stableId ?? light.id;
  }
  return current;
}

export function runwayGround(view) {
  const edge = runwayHalfWidth + 3;
  return projectVertices([[-edge,0,wrapLength],[edge,0,wrapLength],[edge,0,0],[-edge,0,0]], view);
}

/**
 * 게임 경로용 이륙 광원 합성. liftoffObjectLights(objects)와 guides를 이어 붙인 결과를 target 배열에 다시 쓴다.
 * 새 객체를 만들지 않으려고 objects 광원의 alpha를 직접 낮추므로 같은 프레임의 VisibleLightFrame 결과에만 쓴다.
 */
export function writeLiftoffLights(target, objects, guides, altitude) {
  const strength = liftoffBlend(altitude);
  let count = 0;
  if (strength !== 0) for (let i = 0; i < objects.length; i++) {
    const light = objects[i];
    if (strength !== 1) {
      light.alpha = light.alpha * strength;
      if (light.alpha < .025) continue;
    }
    target[count++] = light;
  }
  for (let i = 0; i < guides.length; i++) target[count++] = guides[i];
  target.length = count;
  return target;
}

export function liftoffObjectLights(current, altitude) {
  const strength = liftoffLighting(altitude).objects;
  if (strength === 1) return current;
  if (strength === 0) return [];
  return current.map(light => ({...light, alpha:light.alpha * strength})).filter(light => light.alpha >= .025);
}
