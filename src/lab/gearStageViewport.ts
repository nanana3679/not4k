export const STAGE_ZOOM_MIN = 0.5;
export const STAGE_ZOOM_MAX = 4;
export const STAGE_ZOOM_STEP = 0.25;
export const STAGE_ZOOM_DEFAULT = 1;

const roundZoom = (value: number) => Math.round(value * 100) / 100;

export function clampStageZoom(value: number): number {
  if (!Number.isFinite(value)) return STAGE_ZOOM_DEFAULT;
  return Math.min(STAGE_ZOOM_MAX, Math.max(STAGE_ZOOM_MIN, roundZoom(value)));
}

export function stepStageZoom(value: number, direction: 'in' | 'out'): number {
  return clampStageZoom(value + (direction === 'in' ? STAGE_ZOOM_STEP : -STAGE_ZOOM_STEP));
}

export function formatStageZoom(value: number): string {
  return `${Math.round(clampStageZoom(value) * 100)}%`;
}
