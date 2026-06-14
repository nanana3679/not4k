import type { GearLightBox } from './gearLight';

export type RuntimeGaugeDirection = 'bottom-to-top' | 'top-to-bottom';

export interface RuntimeGaugeGradientStop {
  at: number;
  color: string;
}

export interface RuntimeGaugeGlow {
  color: string;
  blur: number;
  alpha: number;
}

export interface RuntimeGaugeDefinition {
  id: string;
  label: string;
  window: GearLightBox & { radius?: number };
  direction: RuntimeGaugeDirection;
  gradient: RuntimeGaugeGradientStop[];
  innerGlow: RuntimeGaugeGlow;
}

export interface RuntimeGaugeConfig {
  canvas: {
    width: number;
    height: number;
  };
  layers: {
    back: string;
    front: string;
  };
  gauges: RuntimeGaugeDefinition[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function clampGaugeValue(value: number) {
  return clamp(value, 0, 1);
}

export function getRuntimeGaugeFillBox(gauge: RuntimeGaugeDefinition, value: number): GearLightBox {
  const safeValue = clampGaugeValue(value);
  const fillHeight = gauge.window.height * safeValue;

  if (gauge.direction === 'top-to-bottom') {
    return {
      x: gauge.window.x,
      y: gauge.window.y,
      width: gauge.window.width,
      height: fillHeight,
    };
  }

  return {
    x: gauge.window.x,
    y: gauge.window.y + gauge.window.height - fillHeight,
    width: gauge.window.width,
    height: fillHeight,
  };
}

export function formatRuntimeGaugeGradient(gauge: RuntimeGaugeDefinition) {
  const direction = gauge.direction === 'bottom-to-top' ? 'to top' : 'to bottom';
  const stops = [...gauge.gradient]
    .sort((a, b) => a.at - b.at)
    .map((stop) => `${stop.color} ${Math.round(clampGaugeValue(stop.at) * 100)}%`)
    .join(', ');

  return `linear-gradient(${direction}, ${stops})`;
}
