import type { ObserverRange } from './observerRepetitionPlan';

export type ObserverMinimapDragPart = 'start' | 'end' | 'move';
export const OBSERVER_MINIMAP_WIDTH = 60;
/** 미니맵과 화면 위·아래·오른쪽 가장자리 사이 여백(CSS px). */
export const OBSERVER_MINIMAP_EDGE_MARGIN = 16;
export const MINIMAP_TIME_INSET = 12;
export const MINIMAP_HANDLE_RADIUS = 8;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** 에디터처럼 0ms는 아래, D는 위다. 양끝 핸들이 잘리지 않도록 12px씩 비운다. */
export function minimapTimeToY(timeMs: number, durationMs: number, height: number): number {
  const span = Math.max(0, height - 2 * MINIMAP_TIME_INSET);
  return height - MINIMAP_TIME_INSET - (durationMs > 0 ? timeMs / durationMs : 0) * span;
}

export function minimapYToTime(y: number, durationMs: number, height: number): number {
  const span = height - 2 * MINIMAP_TIME_INSET;
  return span > 0 ? clamp((height - MINIMAP_TIME_INSET - y) / span * durationMs, 0, durationMs) : 0;
}

export function minimapOverlay(range: ObserverRange, positionMs: number, durationMs: number, height: number) {
  const startY = minimapTimeToY(range.startMs, durationMs, height);
  const endY = minimapTimeToY(range.endMs, durationMs, height);
  return { startY, endY, top: endY, height: startY - endY,
    playheadY: minimapTimeToY(clamp(positionMs, 0, durationMs), durationMs, height) };
}

export function hitMinimapRange(
  x: number, y: number, range: ObserverRange, durationMs: number, height: number,
): ObserverMinimapDragPart | null {
  if (x < 0 || x > OBSERVER_MINIMAP_WIDTH || y < 0 || y > height) return null;
  const { startY, endY } = minimapOverlay(range, 0, durationMs, height);
  const startHit = Math.abs(y - startY) <= MINIMAP_HANDLE_RADIUS;
  const endHit = Math.abs(y - endY) <= MINIMAP_HANDLE_RADIUS;
  // 겹친 핸들도 화면의 A(왼쪽)·B(오른쪽) 표식을 각각 잡을 수 있다.
  if (startHit && endHit) return x < OBSERVER_MINIMAP_WIDTH / 2 ? 'start' : 'end';
  if (startHit) return 'start';
  if (endHit) return 'end';
  return y > endY && y < startY ? 'move' : null;
}

/** PreviewRangeSelector의 고정된 down 시점 범위·delta 공식을 세로 시간축에 적용한다. 스냅은 없다. */
export function dragMinimapRange(
  part: ObserverMinimapDragPart, initial: ObserverRange, downY: number, y: number,
  durationMs: number, height: number,
): ObserverRange {
  const span = height - 2 * MINIMAP_TIME_INSET;
  const delta = span > 0 ? (downY - y) / span * durationMs : 0;
  // 핸들 중심에서 벗어나 잡아도 클릭만으로 구간이 바뀌지 않도록 최초 잡은 offset을 보존한다.
  if (part === 'start') return { startMs: clamp(initial.startMs + delta, 0, initial.endMs), endMs: initial.endMs };
  if (part === 'end') return { startMs: initial.startMs, endMs: clamp(initial.endMs + delta, initial.startMs, durationMs) };
  const length = initial.endMs - initial.startMs;
  const startMs = clamp(initial.startMs + delta, 0, durationMs - length);
  return { startMs, endMs: Math.min(durationMs, startMs + length) };
}
