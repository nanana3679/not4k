export type GearLightSide = 'left' | 'right';

export interface GearLightAssetSize {
  width: number;
  height: number;
}

export interface GearLightBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GearLightClipInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GearLightPresentation {
  opacity: number;
  brightness: number;
  saturation: number;
  shadowPx: number;
}

export const MAX_LIGHT_INTENSITY = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toPercent = (value: number, total: number) => (value / total) * 100;

const roundPercent = (value: number) => Math.round(value * 1000) / 1000;

export function clampLightHeight(value: number) {
  return clamp(value, 0, 1);
}

export function clampLightIntensity(value: number) {
  return clamp(value, 0, MAX_LIGHT_INTENSITY);
}

export function getVisibleLightBox(box: GearLightBox, heightRatio: number): GearLightBox {
  const visibleHeight = box.height * clampLightHeight(heightRatio);

  return {
    x: box.x,
    y: box.y + box.height - visibleHeight,
    width: box.width,
    height: visibleHeight,
  };
}

export function getClipInsetPercent(
  asset: GearLightAssetSize,
  box: GearLightBox,
  heightRatio: number,
): GearLightClipInset {
  const visibleBox = getVisibleLightBox(box, heightRatio);

  return {
    top: roundPercent(toPercent(visibleBox.y, asset.height)),
    right: roundPercent(toPercent(asset.width - (visibleBox.x + visibleBox.width), asset.width)),
    bottom: roundPercent(toPercent(asset.height - (visibleBox.y + visibleBox.height), asset.height)),
    left: roundPercent(toPercent(visibleBox.x, asset.width)),
  };
}

export function formatClipInset(inset: GearLightClipInset) {
  return `inset(${inset.top}% ${inset.right}% ${inset.bottom}% ${inset.left}%)`;
}

export function getGlowPresentation(intensity: number): GearLightPresentation {
  const safeIntensity = clampLightIntensity(intensity);

  if (safeIntensity === 0) {
    return {
      opacity: 0,
      brightness: 0.7,
      saturation: 0.9,
      shadowPx: 0,
    };
  }

  return {
    opacity: Math.min(1, 0.18 + safeIntensity * 0.38),
    brightness: 0.76 + safeIntensity * 0.52,
    saturation: 0.92 + safeIntensity * 0.12,
    shadowPx: 6 + safeIntensity * 18,
  };
}
