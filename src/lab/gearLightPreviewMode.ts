import type { GearLightBox, GearLightSide } from './gearLight';

export type GearLightPreviewMode = 'runtime' | 'adjusted' | 'source' | 'glow' | 'gauge';

export type GearLightSideBoxes = Record<GearLightSide, GearLightBox>;

interface ResolveGearLightViewModeInput {
  viewMode: GearLightPreviewMode;
  canShowAdjusted: boolean;
  canShowGauge: boolean;
  canShowRuntimeGauge: boolean;
}

export function hasGearLightSideBoxes(
  boxes: Partial<Record<GearLightSide, GearLightBox>> | null | undefined,
): boxes is GearLightSideBoxes {
  return Boolean(boxes?.left && boxes.right);
}

export function resolveGearLightViewMode({
  viewMode,
  canShowAdjusted,
  canShowGauge,
  canShowRuntimeGauge,
}: ResolveGearLightViewModeInput): GearLightPreviewMode {
  if (viewMode === 'runtime' && !canShowRuntimeGauge) return 'source';
  if (viewMode === 'adjusted' && !canShowAdjusted) return canShowGauge ? 'gauge' : 'source';
  if (viewMode === 'gauge' && !canShowGauge) return canShowAdjusted ? 'adjusted' : 'source';

  return viewMode;
}
