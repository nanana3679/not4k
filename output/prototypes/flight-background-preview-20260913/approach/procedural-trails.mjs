import { trailWidth } from './surface.mjs';
import { hypot2 } from './hypot.mjs';

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const proceduralTrailQuality = { maxSegments: 120 };

export function proceduralTrailStrength(altitude) {
  return .45 + clamp01(altitude) * 1.55;
}

// GPU 배치가 잔광 굵기·밝기를 정하는 규칙. 객체 없이 숫자로 계산할 수 있게 나눠 둔다.
export function proceduralTrailWidth(size) {
  const value = Number.isFinite(size) ? size : 1;
  return Math.max(.5,Math.min(8,Math.round(value*2)/2));
}

export function proceduralTrailAlpha(alpha) {
  return Math.max(.1,Math.round(clamp01(alpha)*5)/5);
}

export function proceduralTrailBatchStyle(segment) {
  return {
    width:proceduralTrailWidth(segment.size),
    alpha:proceduralTrailAlpha(segment.alpha),
  };
}

export function proceduralTrailGlowAlpha(quality) {
  return quality === 'minimal' ? 0 : .13;
}

// 잔광 출력 버퍼. 게임은 같은 버퍼를 매 프레임 넘겨 선분 객체와 정렬용 배열을 다시 쓴다.
// 버퍼를 넘기지 않은 호출은 새 버퍼를 쓰므로 이전처럼 매번 독립된 결과를 받는다.
export class TrailSegmentFrame {
  constructor() {
    this.segments = [];
    this.pool = [];
    this.detailed = [];
    this.distant = [];
    this.keys = new Float64Array(64);
    this.order = new Int32Array(64);
    this.mergeScratch = new Int32Array(64);
  }

  reserveSort(count) {
    if (this.keys.length >= count) return;
    const capacity = 2 ** Math.ceil(Math.log2(count));
    this.keys = new Float64Array(capacity);
    this.order = new Int32Array(capacity);
    this.mergeScratch = new Int32Array(capacity);
  }

  segment(index) {
    return this.pool[index] ?? (this.pool[index] = { id:undefined, x1:0, y1:0, x2:0, y2:0, size:0, alpha:0, rgb:undefined });
  }
}

// keys 오름차순으로 order의 앞 count개를 안정 정렬한다. 같은 키는 원래 순서를 유지해 Array.prototype.sort와 같은 순서를 만든다.
function stableSortByKey(order, scratch, keys, count) {
  let source = order, target = scratch;
  for (let width = 1; width < count; width *= 2) {
    for (let left = 0; left < count; left += width * 2) {
      const middle = Math.min(left + width, count), right = Math.min(left + width * 2, count);
      let i = left, j = middle, k = left;
      while (i < middle && j < right) target[k++] = keys[source[j]] < keys[source[i]] ? source[j++] : source[i++];
      while (i < middle) target[k++] = source[i++];
      while (j < right) target[k++] = source[j++];
    }
    const swap = source; source = target; target = swap;
  }
  return source;
}

/**
 * 현재 광원에서 절대 고도 잔광 선분을 만든다. 가까운 detail을 depth 순으로 먼저 고르고
 * 남은 예산은 원거리 point를 고르게 표본으로 채운다. frame을 넘기면 반환 배열과 선분 객체를 다음 호출에서 덮어쓴다.
 */
export function proceduralTrailSegments(lights, view, options = {}, frame = new TrailSegmentFrame()) {
  const segments = frame.segments;
  if (!lights.length) { segments.length = 0; return segments; }
  const strength = proceduralTrailStrength(options.altitude);
  const limit = Math.max(1, Math.floor(options.maxSegments ?? proceduralTrailQuality.maxSegments));
  const detailed = frame.detailed, distant = frame.distant;
  let detailedCount = 0, distantCount = 0;
  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    if (light.lod === 'point') distant[distantCount++] = light;
    else detailed[detailedCount++] = light;
  }
  detailed.length = detailedCount; distant.length = distantCount;
  frame.reserveSort(detailedCount);
  const keys = frame.keys;
  for (let i = 0; i < detailedCount; i++) { keys[i] = detailed[i].base?.depth ?? Infinity; frame.order[i] = i; }
  const order = stableSortByKey(frame.order, frame.mergeScratch, keys, detailedCount);
  const selectedDetailed = Math.min(detailedCount, limit);
  // 가까운 detail이 예산보다 적으면 원거리 point의 처음과 마지막을 포함해 고르게 고른다.
  const distantLimit = limit - selectedDetailed, sampledDistant = detailedCount >= limit ? 0 : Math.min(distantCount, distantLimit);
  const sampleOne = detailedCount < limit && distantCount > distantLimit && distantLimit <= 1;
  let count = 0;
  const total = selectedDetailed + (sampleOne ? 1 : sampledDistant);
  for (let index = 0; index < total; index++) {
    let light;
    if (index < selectedDetailed) light = detailed[order[index]];
    else {
      const sample = index - selectedDetailed;
      light = distant[sampleOne ? distantCount - 1
        : distantCount <= distantLimit ? sample : Math.round(sample * (distantCount - 1) / (distantLimit - 1))];
    }
    const dx = view.center - light.x;
    const dy = view.horizon - light.y;
    const radialDistance = hypot2(dx, dy);
    if (radialDistance < .1) continue;
    const depth = Math.max(12, light.base?.depth ?? 180);
    const frameMotion = Math.max(2, Math.min(28, radialDistance * Math.max(0, view.worldSpeed) / depth / 60));
    const length = Math.min(44, frameMotion * strength);
    const width = light.surface
      ? trailWidth(light.surface, dx, dy)
      : light.kind === 'horizontal' && light.a && light.b
        ? Math.min(8, Math.abs(light.b.x - light.a.x) * .30)
        : light.size;
    const segment = frame.segment(count);
    segment.id = light.id;
    segment.x1 = light.x;
    segment.y1 = light.y;
    segment.x2 = light.x + dx / radialDistance * length;
    segment.y2 = light.y + dy / radialDistance * length;
    segment.size = Math.max(.7, Number.isFinite(width) ? width : 1);
    segment.alpha = light.alpha;
    segment.rgb = light.rgb ? light.rgb : undefined;
    segments[count++] = segment;
  }
  segments.length = count;
  return segments;
}
