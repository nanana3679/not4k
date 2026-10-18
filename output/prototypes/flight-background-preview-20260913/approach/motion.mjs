// 시각 탐색 전용. 난이도 판정 규칙이나 게임의 altitude 수치가 아니다.
import { viewAt, project } from './projection.mjs';
import { makeLightGroups, elevatedLights } from './height.mjs';
import { ScreenPolygon, polygonBoundsInto, projectSurfaceInto, projectedSurfaceAreaEstimate, trailWidth } from './surface.mjs';
import { VisibleLightFrame } from './visible-light-frame.mjs';
import { makeFlowLights } from './flow.mjs';
import { objectKind, panelObjectTemplate, panelTemplateKey, projectScenarioObject } from './objects.mjs';
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

// 광원 회차별 ID 문자열은 회차가 바뀔 때만 다시 만든다. ids는 출력 버퍼의 원본 광원 칸(frame.source)이다.
function lightIds(ids, cycle) {
  if (ids.cycle !== cycle) { ids.cycle = cycle; ids.object = `${ids.light.id}/${cycle}`; ids.panel = ''; ids.point = ''; }
  return ids;
}
// 같은 장면·크기·배색의 panel 템플릿을 원본 광원 칸에 기억한다. panelObjectTemplate과 같은 객체다.
function panelTemplate(source, options) {
  const key = panelTemplateKey(options);
  if (source.templateKey !== key) { source.template = panelObjectTemplate(source.light, options); source.templateKey = key; }
  return source.template;
}
const panelId = ids => ids.panel || (ids.panel = `${ids.object}/part-panel`);
const pointId = ids => ids.point || (ids.point = `${ids.object}/point`);

const ZERO_OFFSET = Object.freeze({ x:0, y:0 });
// 한 광원을 처리하는 동안만 쓰는 투영 작업 공간. 결과에 넣을 때는 출력 버퍼의 객체로 복사한다.
const projectedBase = { x:0, y:0, scale:0, depth:0 }, projectedA = { x:0, y:0, scale:0, depth:0 }, projectedB = { x:0, y:0, scale:0, depth:0 };
const polygon = new ScreenPolygon(), polygonBounds = { left:0, right:0, top:0, bottom:0 };
const outsideView = (bounds, view) => bounds.right < -45 || bounds.left > view.width + 45 || bounds.bottom < -100 || bounds.top > view.height + 50;
const pointOutsideView = (base, view) => base.x<-45||base.x>view.width+45||base.y<-100||base.y>view.height+50;

function writePointBounds(bounds, base, pointSize) {
  bounds.left = base.x - pointSize; bounds.right = base.x + pointSize; bounds.top = base.y - pointSize; bounds.bottom = base.y + pointSize;
}
function copyBounds(target, source) {
  target.left = source.left; target.right = source.right; target.top = source.top; target.bottom = source.bottom;
}

// polygon의 면 조각 하나를 화면 밖 판정 후 detail 광원으로 기록하고 그 광원을 돌려준다. 화면 밖이면 null.
// 깊이·크기·밝기는 호출한 쪽이 직접 쓴다(실수 인자를 함수 경계로 넘기면 매번 boxing 할당이 생긴다).
function writeSurfacePiece(frame, view, source, ids, base, a, b, piece) {
  const bounds = polygonBoundsInto(polygon, polygonBounds);
  if (outsideView(bounds, view)) return null;
  const data = polygon.data;
  let sumX = 0, sumY = 0;
  for (let i = 0; i < polygon.count; i++) { sumX = sumX + data[i * 4]; sumY = sumY + data[i * 4 + 1]; }
  const slot = frame.next(source, base, a, b), light = slot.light;
  light.id = piece.part === 'panel' ? panelId(ids) : `${ids.object}/part-${piece.part}`;
  light.objectId = ids.object;
  light.mask = piece.mask; light.part = piece.part; light.geometry = piece.geometry;
  if (piece.rgb) { light.rgb = piece.rgb; light.colorIndex = piece.colorIndex; light.tier = piece.tier; }
  light.x = sumX / polygon.count; light.y = sumY / polygon.count;
  light.surface = frame.surface(slot, polygon);
  copyBounds(light.bounds, bounds);
  light.lod = 'detail'; light.stableId = source.id;
  return light;
}

const PANEL_PIECE = { part:'panel', geometry:'panel', mask:undefined, rgb:undefined, colorIndex:undefined, tier:undefined };

/**
 * 화면에 보이는 광원을 계산한다. frame(VisibleLightFrame)을 넘기면 그 버퍼의 배열과 객체를 다시 써서
 * 프레임마다 새 객체를 만들지 않는다. 이때 반환 배열과 광원 객체는 같은 frame의 다음 호출에서 덮어쓴다.
 */
export function visibleLights(lights, travel, view, shape = 'line', objectOptions, renderOptions, frame = new VisibleLightFrame()) {
  frame.begin();
  const quality=objectOptions?.quality??renderOptions?.quality;
  // 투영 전 솎아내기가 없는 품질(gpu 포함)은 shouldProjectLight가 항상 true이므로 호출을 건너뛴다.
  const thinsBeforeProjection=Boolean(quality)&&renderQualityProfile(quality).preProjectionKeep<1;
  const objectDetailArea=objectOptions?.quality?renderQualityProfile(objectOptions.quality).detailArea:0;
  const panelObjects=shape==='surface'&&objectOptions&&objectKind(objectOptions.scenario??objectOptions.palette)==='panel';
  for (let index = 0; index < lights.length; index++) {
    const light = lights[index], source = frame.source(index, light);
    const raw = light.z - travel;
    const cycle = Math.floor((raw + 384) / wrapLength);
    const z = raw - cycle * wrapLength;
    const elevation = light.elevation ?? .25;
    const base = project(light.x, z, elevation, view, projectedBase);
    if (!base || base.depth < 2) continue;
    const horizonFade = light.layer && light.layer!=='ground' ? 1 : Math.min(1, Math.max(0, (base.y - view.horizon) / 95));
    const distanceFade = view.heightMix ? Math.max(0, 1 - base.depth / 1100) ** .85 : 1;
    const alpha = horizonFade * Math.min(1, 570 / base.depth) * distanceFade * light.bright;
    if (alpha < .025) continue;
    if(thinsBeforeProjection&&!shouldProjectLight(light.id,base.depth,quality))continue;
    const size = Math.min(3.2, Math.max(.45, base.scale * .27));
    if(shape==='surface'&&renderOptions?.quality){
      const estimatedArea=projectedSurfaceAreaEstimate(light,z,view);
      const lod=renderOptions.keepAllPoints&&estimatedArea<renderQualityProfile(renderOptions.quality).detailArea
        ? 'point'
        : screenSpaceLod(estimatedArea,light.id,renderOptions.quality);
      if(lod==='hidden')continue;
      if(lod==='point'){
        if(pointOutsideView(base,view))continue;
        const pointSize=Math.max(.65,Math.min(1.15,Math.sqrt(estimatedArea)));
        const record=frame.next(light,base,base,base).light;
        record.elevation=elevation;record.size=pointSize;record.alpha=alpha;
        record.id=pointId(lightIds(source,cycle));record.stableId=light.id;
        record.x=base.x;record.y=base.y;record.lod='point';record.geometry='point';
        writePointBounds(record.bounds,base,pointSize);
        continue;
      }
    }
    if(panelObjects&&objectOptions.quality){
      // panelScreenAreaEstimate와 같은 값이다(템플릿 크기의 면 넓이 추정).
      const estimatedArea=projectedSurfaceAreaEstimate(panelTemplate(source,objectOptions).sized,z,view);
      // screenSpaceLod와 같은 판정이다. 원래 면으로 그릴 넓이면 함수 호출 없이 바로 detail로 둔다.
      const lod=Number.isFinite(estimatedArea)&&estimatedArea>0&&estimatedArea>=objectDetailArea
        ? 'detail'
        : screenSpaceLod(estimatedArea,light.id,objectOptions.quality);
      if(lod==='hidden')continue;
      if(lod==='point'){
        if(pointOutsideView(base,view))continue;
        const color=panelTemplate(source,objectOptions).color;
        const pointSize=Math.max(.65,Math.min(1.15,Math.sqrt(estimatedArea)));
        const ids=lightIds(source,cycle);
        const record=frame.next(light,base,base,base).light;
        record.elevation=elevation;record.size=pointSize;record.alpha=alpha;
        record.id=pointId(ids);record.stableId=light.id;record.objectId=ids.object;
        record.part='point';record.geometry='point';record.tier=color.tier;record.colorIndex=color.colorIndex;record.rgb=color.rgb;
        record.x=base.x;record.y=base.y;record.lod='point';
        writePointBounds(record.bounds,base,pointSize);
        continue;
      }
    }
    let a = base, b = base;
    if (light.kind === 'vertical') b = project(light.x, z, elevation + light.extent, view, projectedB);
    if (light.kind === 'horizontal') {
      a = project(light.x - light.extent / 2, z, elevation + .1, view, projectedA);
      b = project(light.x + light.extent / 2, z, elevation + .1, view, projectedB);
    }
    if (!a || !b) continue;
    if(shape==='surface' && objectOptions) {
      const ids=lightIds(source,cycle);
      if(panelObjects) {
        // panel은 조각 하나뿐이고 돌파가 아니므로 모으기 이동이 없다. projectScenarioObject와 같은 면을 작업 버퍼에 투영한다.
        const {sized,color}=panelTemplate(source,objectOptions);
        if(projectSurfaceInto(sized,z,view,polygon)<3)continue;
        PANEL_PIECE.rgb=color.rgb;PANEL_PIECE.colorIndex=color.colorIndex;PANEL_PIECE.tier=color.tier;
        const record=writeSurfacePiece(frame,view,light,ids,base,a,b,PANEL_PIECE);
        if(record){record.elevation=elevation;record.size=size;record.alpha=alpha;}
        continue;
      }
      const offset=objectOptions.scenario==='breakthrough'?convergenceOffset(base,view,objectOptions.convergence,objectOptions):ZERO_OFFSET;
      for(const piece of projectScenarioObject(light,z,view,objectOptions)) {
        const surface=shiftProjection(piece.points,offset);
        polygon.reserve(surface.length);
        for(let i=0;i<surface.length;i++){const p=surface[i];polygon.data[i*4]=p.x;polygon.data[i*4+1]=p.y;polygon.data[i*4+2]=p.scale;polygon.data[i*4+3]=p.depth;}
        polygon.count=surface.length;
        const record=writeSurfacePiece(frame,view,light,ids,base,a,b,piece);
        if(record){record.elevation=elevation;record.size=size;record.alpha=alpha;}
      }
      continue;
    }
    let bounds;
    if (shape === 'surface') {
      if (projectSurfaceInto(light, z, view, polygon) < 3) continue;
      bounds = polygonBoundsInto(polygon, polygonBounds);
    } else {
      bounds = polygonBounds;
      bounds.left = Math.min(a.x, b.x); bounds.right = Math.max(a.x, b.x); bounds.top = Math.min(a.y, b.y); bounds.bottom = Math.max(a.y, b.y);
    }
    if (outsideView(bounds, view)) continue;
    const slot = frame.next(light, base, a, b), record = slot.light;
    record.elevation = elevation; record.size = size; record.alpha = alpha;
    record.id = lightIds(source, cycle).object;
    record.x = (a.x + b.x) / 2; record.y = (a.y + b.y) / 2;
    if (shape === 'surface') record.surface = frame.surface(slot, polygon);
    copyBounds(record.bounds, bounds);
  }
  const visible = frame.end();
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
