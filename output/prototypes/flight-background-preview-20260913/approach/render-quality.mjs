const profileOrder = ['high', 'balanced', 'reduced', 'minimal'];

const profiles = Object.freeze({
  gpu: Object.freeze({
    name: 'gpu',
    detailArea: 0,
    tinyArea: .14,
    distantKeep: 1,
    tinyKeepScale: 1,
    preProjectionKeep: 1,
    maxDistantPoints: Number.POSITIVE_INFINITY,
    maxTrailSegments: 160,
  }),
  high: Object.freeze({
    name: 'high',
    detailArea: 1.25,
    tinyArea: .14,
    distantKeep: .46,
    tinyKeepScale: .55,
    preProjectionKeep: 1,
    maxDistantPoints: 320,
    maxTrailSegments: 120,
  }),
  balanced: Object.freeze({
    name: 'balanced',
    detailArea: 1.25,
    tinyArea: .14,
    distantKeep: .34,
    tinyKeepScale: .45,
    preProjectionKeep: .8,
    maxDistantPoints: 240,
    maxTrailSegments: 96,
  }),
  reduced: Object.freeze({
    name: 'reduced',
    detailArea: 1.25,
    tinyArea: .14,
    distantKeep: .23,
    tinyKeepScale: .35,
    preProjectionKeep: .55,
    maxDistantPoints: 160,
    maxTrailSegments: 48,
  }),
  minimal: Object.freeze({
    name: 'minimal',
    detailArea: 4,
    tinyArea: .2,
    distantKeep: .08,
    tinyKeepScale: .2,
    preProjectionKeep: .25,
    maxDistantPoints: 48,
    maxTrailSegments: 3,
  }),
});

const stableRanks = new Map();

function stableUnit(value) {
  const key = String(value);
  const cached = stableRanks.get(key);
  if (cached !== undefined) return cached;
  let hash = 2166136261;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  const rank = ((hash ^ (hash >>> 13)) >>> 0) / 4294967296;
  stableRanks.set(key, rank);
  return rank;
}

export function renderQualityProfile(value) {
  return profiles[value] ?? profiles.high;
}

export function renderPixelRatio(value, quality = 'high') {
  const ratio = Number.isFinite(value) && value > 0 ? value : 1;
  return Math.min(ratio, quality === 'minimal' ? 1 : 1.5);
}

export function screenSpaceLod(area, stableId, quality = 'high') {
  if (!Number.isFinite(area) || area <= 0) return 'hidden';
  const profile = renderQualityProfile(quality);
  if (area >= profile.detailArea) return 'detail';
  const keep = profile.distantKeep * (area < profile.tinyArea ? profile.tinyKeepScale : 1);
  return stableUnit(stableId) < keep ? 'point' : 'hidden';
}

export function shouldProjectLight(stableId, depth, quality = 'high') {
  const profile = renderQualityProfile(quality);
  if (!Number.isFinite(depth) || depth <= 220 || profile.preProjectionKeep >= 1) return true;
  return stableUnit(`${stableId}/projection`) < profile.preProjectionKeep;
}

export function screenPolygonArea(points) {
  if (!points || points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const point = points[index], next = points[(index + 1) % points.length];
    twiceArea += point.x * next.y - next.x * point.y;
  }
  return Math.abs(twiceArea) / 2;
}

export function capDistantLights(lights, quality = 'high') {
  const profile = renderQualityProfile(quality);
  const distant = lights.filter(light => light.lod === 'point');
  if (distant.length <= profile.maxDistantPoints) return lights;
  const selected = new Set(distant
    .map(light => ({ light, rank: stableUnit(`${light.stableId ?? light.id}/budget`) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, profile.maxDistantPoints)
    .map(entry => entry.light));
  return lights.filter(light => light.lod !== 'point' || selected.has(light));
}

export function adaptiveQualityState(name = 'high') {
  const safeName = renderQualityProfile(name).name;
  return { name: safeName, slowFrames: 0, fastFrames: 0 };
}

export function advanceAdaptiveQuality(state, frameMs) {
  const current = adaptiveQualityState(state?.name);
  current.slowFrames = Math.max(0, Number.isFinite(state?.slowFrames) ? state.slowFrames : 0);
  current.fastFrames = Math.max(0, Math.floor(state?.fastFrames ?? 0));
  if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs >= 250) return current;

  let index = profileOrder.indexOf(current.name);
  if (frameMs > 20) {
    current.slowFrames += 1;
    current.fastFrames = Math.max(0,current.fastFrames-8);
    if (current.slowFrames >= 8 && index < profileOrder.length - 1) {
      index += 1;
      return { name: profileOrder[index], slowFrames: 0, fastFrames: 0 };
    }
    return current;
  }

  if (frameMs <= 17.5) {
    current.slowFrames = Math.max(0,current.slowFrames-.2);
    current.fastFrames = current.slowFrames===0?current.fastFrames+1:Math.max(0,current.fastFrames-1);
    if (current.fastFrames >= 240 && index > 0) {
      index -= 1;
      return { name: profileOrder[index], slowFrames: 0, fastFrames: 0 };
    }
    return current;
  }

  return { name: current.name, slowFrames:Math.max(0,current.slowFrames-.1), fastFrames:Math.max(0,current.fastFrames-2) };
}
