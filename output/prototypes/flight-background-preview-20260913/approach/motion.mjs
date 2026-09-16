// 시각 탐색 전용. 난이도 판정 규칙이나 게임의 altitude 수치가 아니다.
import { viewAt, project } from './projection.mjs';
import { makeLightGroups, elevatedLights } from './height.mjs';
import { projectSurface, projectedSurfaceAreaEstimate, surfaceBounds, trailWidth } from './surface.mjs';
import { makeFlowLights } from './flow.mjs';
import { objectKind, panelObjectTemplate, panelScreenAreaEstimate, projectScenarioObject } from './objects.mjs';
import { convergenceOffset, shiftProjection } from './convergence.mjs';
import { capDistantLights, renderQualityProfile, screenSpaceLod, shouldProjectLight } from './render-quality.mjs';
const lightGroups = makeLightGroups();
export const scenarios = {
  liftoff: { name: '이륙', english: 'LIFTOFF', number: '01', rgb: '76, 204, 223', core: '#c7f7ff', accent: '#75dae9', backdrop: '#040b14', altitude: .68, speed: 64, duration: .09, strength: .30, description: '저고도 지상 유도등 · 상승하며 드러나는 오브젝트', spacing: 48, keep: .57 },
  infiltration: { name: '침투', english: 'INFILTRATION', number: '02', rgb: '143, 125, 246', core: '#e9dfff', accent: '#b3a1ff', backdrop: '#080917', altitude: .23, speed: 58, duration: .12, strength: .40, description: '아래로 기우는 시선 · 가로 광원이 섞인 시설', spacing: 29, keep: .73 },
  breakthrough: { name: '돌파', english: 'BREAKTHROUGH', number: '03', rgb: '255, 91, 56', core: '#ffe7ce', accent: '#ff946f', backdrop: '#0c080d', altitude: .12, speed: 54, duration: .14, strength: .47, description: '지평선 없는 저공비행 · 화면 끝까지 이어지는 빛', spacing: 17, keep: .88 },
};
export const scenarioKey = value => Object.hasOwn(scenarios, value) ? value : 'breakthrough';
export const speedMultiplier=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value)) ? 1 : Math.max(0,Math.min(10,Number(value)));
export function cameraAt(key, altitude, width, height, speed = 1, heights = 'ground') {
  key = scenarioKey(key);
  const view = viewAt(altitude, width, height);
  if (key !== 'infiltration') {
    view.pitchDegrees = 12;
    const pitch = view.pitchDegrees * Math.PI / 180;
    view.sinPitch = Math.sin(pitch); view.cosPitch = Math.cos(pitch);
    if (key === 'breakthrough') {
      view.cameraHeight = 64 + view.altitude * 30;
      // 전방 시선은 유지하고 화면을 아래쪽 영역으로 잡아 지평을 프레임 밖에 둔다.
      view.horizon = heights === 'mixed' ? height * .34 : -height * .40;
      view.principalY = view.horizon + view.focal * Math.tan(pitch);
      view.heightMix = heights === 'mixed';
    } else {
      view.horizon = view.principalY - view.focal * Math.tan(pitch);
    }
  }
  view.worldSpeed = scenarios[key].speed * speed;
  view.showSky = key !== 'breakthrough';
  return view;
}

const fract = n => n - Math.floor(n);
const random = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
export const wrapLength = 2448;
export function makeLights(key, heights = 'ground', layout = 'aligned') {
  if(key==='breakthrough' && layout==='flow') return makeFlowLights(heights);
  const scene = scenarios[scenarioKey(key)];
  const bands = [7, 14, 25, 42, 69, 110, 174, 278, 445, 710];
  const lights = [];
  for (const side of [-1, 1]) for (let band = 0; band < bands.length; band++) {
    for (let row = 0; row < Math.floor(wrapLength / scene.spacing); row++) {
      const seed = row * 137 + band * 23 + (side + 1) * 401;
      if (random(seed) > scene.keep) continue;
      // 시설의 반복을 유지하면서 위치를 조금씩 흩뜨리고 어두운 간격을 남긴다.
      if (key === 'infiltration' && (row + band * 2) % 11 > 7) continue;
      const kind = key === 'liftoff' ? (row % 7 === 0 ? 'vertical' : 'point')
        : key === 'infiltration' ? (row % 3 === 0 ? 'point' : 'horizontal')
        : (row % 5 === 0 ? 'horizontal' : 'point');
      lights.push({
        id: `${side}/${band}/${row}`, kind,
        x: side * bands[band] * (.9 + random(seed + 7) * .20),
        z: row * scene.spacing + band * 7 + side * 9 + random(seed + 4) * 6,
        extent: kind === 'vertical' ? 8 + random(seed + 8) * 6 : 1.4 + random(seed + 8) * 2.1,
        bright: .62 + random(seed + 15) * .38,
      });
    }
  }
  return key === 'breakthrough' && heights === 'mixed' ? [...lights, ...elevatedLights(lightGroups)] : lights;
}

export function visibleLights(lights, travel, view, shape = 'line', objectOptions, renderOptions) {
  const visible = [];
  for (const light of lights) {
    const raw = light.z - travel;
    const cycle = Math.floor((raw + 384) / wrapLength);
    const z = raw - cycle * wrapLength;
    const elevation = light.elevation ?? .25;
    const base = project(light.x, z, elevation, view);
    if (!base || base.depth < 2) continue;
    const horizonFade = light.layer && light.layer!=='ground' ? 1 : Math.min(1, Math.max(0, (base.y - view.horizon) / 95));
    const distanceFade = view.heightMix ? Math.max(0, 1 - base.depth / 1100) ** .85 : 1;
    const alpha = horizonFade * Math.min(1, 570 / base.depth) * distanceFade * light.bright;
    if (alpha < .025) continue;
    const quality=objectOptions?.quality??renderOptions?.quality;
    if(quality&&!shouldProjectLight(light.id,base.depth,quality))continue;
    const size = Math.min(3.2, Math.max(.45, base.scale * .27));
    if(shape==='surface'&&renderOptions?.quality){
      const estimatedArea=projectedSurfaceAreaEstimate(light,z,view);
      const lod=renderOptions.keepAllPoints&&estimatedArea<renderQualityProfile(renderOptions.quality).detailArea
        ? 'point'
        : screenSpaceLod(estimatedArea,light.id,renderOptions.quality);
      if(lod==='hidden')continue;
      if(lod==='point'){
        if(base.x<-45||base.x>view.width+45||base.y<-100||base.y>view.height+50)continue;
        const pointSize=Math.max(.65,Math.min(1.15,Math.sqrt(estimatedArea)));
        visible.push({id:`${light.id}/${cycle}/point`,stableId:light.id,kind:light.kind,layer:light.layer??'ground',elevation,
          x:base.x,y:base.y,a:base,b:base,base,size:pointSize,alpha,lod:'point',geometry:'point',
          bounds:{left:base.x-pointSize,right:base.x+pointSize,top:base.y-pointSize,bottom:base.y+pointSize}});
        continue;
      }
    }
    if(shape==='surface'&&objectOptions&&objectKind(objectOptions.scenario??objectOptions.palette)==='panel'&&objectOptions.quality){
      const estimatedArea=panelScreenAreaEstimate(light,z,view,objectOptions);
      const lod=screenSpaceLod(estimatedArea,light.id,objectOptions.quality);
      if(lod==='hidden')continue;
      if(lod==='point'){
        if(base.x<-45||base.x>view.width+45||base.y<-100||base.y>view.height+50)continue;
        const color=panelObjectTemplate(light,objectOptions).color;
        const pointSize=Math.max(.65,Math.min(1.15,Math.sqrt(estimatedArea)));
        visible.push({id:`${light.id}/${cycle}/point`,stableId:light.id,objectId:`${light.id}/${cycle}`,
          part:'point',geometry:'point',...color,kind:light.kind,layer:light.layer??'ground',elevation,
          x:base.x,y:base.y,a:base,b:base,base,size:pointSize,alpha,lod:'point',
          bounds:{left:base.x-pointSize,right:base.x+pointSize,top:base.y-pointSize,bottom:base.y+pointSize}});
        continue;
      }
    }
    let a = base, b = base;
    if (light.kind === 'vertical') b = project(light.x, z, elevation + light.extent, view);
    if (light.kind === 'horizontal') {
      a = project(light.x - light.extent / 2, z, elevation + .1, view);
      b = project(light.x + light.extent / 2, z, elevation + .1, view);
    }
    if (!a || !b) continue;
    if(shape==='surface' && objectOptions) {
      const offset=objectOptions.scenario==='breakthrough'?convergenceOffset(base,view,objectOptions.convergence,objectOptions):{x:0,y:0};
      for(const piece of projectScenarioObject(light,z,view,objectOptions)) {
        const surface=shiftProjection(piece.points,offset), bounds=surfaceBounds(surface);
        if(bounds.right<-45 || bounds.left>view.width+45 || bounds.bottom<-100 || bounds.top>view.height+50) continue;
        const x=surface.reduce((sum,p)=>sum+p.x,0)/surface.length;
        const y=surface.reduce((sum,p)=>sum+p.y,0)/surface.length;
        visible.push({id:`${light.id}/${cycle}/part-${piece.part}`,objectId:`${light.id}/${cycle}`,
          mask:piece.mask,part:piece.part,geometry:piece.geometry,...(piece.rgb?{rgb:piece.rgb,colorIndex:piece.colorIndex,tier:piece.tier}:{}),kind:light.kind,layer:light.layer??'ground',elevation,
          x,y,a,b,base,size,alpha,surface,bounds,lod:'detail',stableId:light.id});
      }
      continue;
    }
    const surface = shape === 'surface' ? projectSurface(light, z, view) : undefined;
    if (surface && surface.length < 3) continue;
    const bounds = surfaceBounds(surface ?? [a,b]);
    if (bounds.right < -45 || bounds.left > view.width + 45 || bounds.bottom < -100 || bounds.top > view.height + 50) continue;
    visible.push({ id: `${light.id}/${cycle}`, kind: light.kind, layer: light.layer ?? 'ground', elevation, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a, b, base, size, alpha, surface, bounds });
  }
  return objectOptions?.quality && objectKind(objectOptions.scenario??objectOptions.palette)==='panel'
    ? capDistantLights(visible,objectOptions.quality)
    : visible;
}

export function trailOpacity(age, duration) {
  if (duration <= 0 || age < 0 || age >= duration) return 0;
  return (1 - age / duration) ** 2;
}

// 실제 지나온 화면 좌표를 유지한다. 잔광의 수명은 프레임 수가 아닌 초 단위다.
export function advanceTrails(history, previous, current, now, duration) {
  const frames = history.filter(frame => now - frame.time < duration);
  const byId = new Map(previous.map(light => [light.id, light]));
  const segments = [];
  for (const light of current) {
    const old = byId.get(light.id);
    if (!old) continue;
    const distance = Math.hypot(light.x - old.x, light.y - old.y);
    if (distance < .15 || distance > 180) continue;
    const width = light.surface ? trailWidth(light.surface, light.x-old.x, light.y-old.y) : light.kind === 'horizontal' ? Math.min(8, Math.abs(light.b.x - light.a.x) * .30) : light.size;
    segments.push({ x1: old.x, y1: old.y, x2: light.x, y2: light.y, size: Math.max(.7, width), alpha: light.alpha, ...(light.rgb?{rgb:light.rgb}:{} ) });
  }
  if (segments.length) frames.push({ time: now, segments });
  return frames;
}
