import { trailWidth } from './surface.mjs';

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const proceduralTrailQuality = { maxSegments: 120 };

export function proceduralTrailStrength(altitude) {
  return .45 + clamp01(altitude) * 1.55;
}

export function proceduralTrailBatchStyle(segment) {
  const size = Number.isFinite(segment.size) ? segment.size : 1;
  return {
    width:Math.max(.5,Math.min(8,Math.round(size*2)/2)),
    alpha:Math.max(.1,Math.round(clamp01(segment.alpha)*5)/5),
  };
}

export function proceduralTrailGlowAlpha(quality) {
  return quality === 'minimal' ? 0 : .13;
}

function sampledIndexes(total, limit) {
  if (total <= limit) return Array.from({ length: total }, (_, index) => index);
  if (limit <= 1) return [total - 1];
  return Array.from({ length: limit }, (_, index) => Math.round(index * (total - 1) / (limit - 1)));
}

export function proceduralTrailSegments(lights, view, options = {}) {
  if (!lights.length) return [];
  const strength = proceduralTrailStrength(options.altitude);
  const limit = Math.max(1, Math.floor(options.maxSegments ?? proceduralTrailQuality.maxSegments));
  const detailed=lights.filter(light=>light.lod!=='point')
    .sort((a,b)=>(a.base?.depth??Infinity)-(b.base?.depth??Infinity));
  const distant=lights.filter(light=>light.lod==='point');
  const selected=detailed.length>=limit
    ? detailed.slice(0,limit)
    : [...detailed,...sampledIndexes(distant.length,limit-detailed.length).map(index=>distant[index])];
  const segments = [];
  for (const light of selected) {
    const dx = view.center - light.x;
    const dy = view.horizon - light.y;
    const radialDistance = Math.hypot(dx, dy);
    if (radialDistance < .1) continue;
    const depth = Math.max(12, light.base?.depth ?? 180);
    const frameMotion = Math.max(2, Math.min(28, radialDistance * Math.max(0, view.worldSpeed) / depth / 60));
    const length = Math.min(44, frameMotion * strength);
    const width = light.surface
      ? trailWidth(light.surface, dx, dy)
      : light.kind === 'horizontal' && light.a && light.b
        ? Math.min(8, Math.abs(light.b.x - light.a.x) * .30)
        : light.size;
    segments.push({
      id: light.id,
      x1: light.x,
      y1: light.y,
      x2: light.x + dx / radialDistance * length,
      y2: light.y + dy / radialDistance * length,
      size: Math.max(.7, Number.isFinite(width) ? width : 1),
      alpha: light.alpha,
      ...(light.rgb ? { rgb: light.rgb } : {}),
    });
  }
  return segments;
}
