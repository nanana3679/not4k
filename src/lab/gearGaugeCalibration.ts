import type { GearLightBox } from './gearLight';
import type { RuntimeGaugeConfig } from './runtimeGauge';

export type GaugeCalibrationLayer = 'eraseMask' | 'gaugeWindow';
export type CalibrationResizeHandle = 'left' | 'right' | 'top' | 'bottom';

export interface CalibrationRect extends GearLightBox {
  radius: number;
}

export interface GaugeCalibrationState {
  activeGaugeId: string;
  eraseMasks: Record<string, CalibrationRect>;
  gaugeWindows: Record<string, CalibrationRect>;
}

export interface GaugeCalibrationExport {
  canvas: RuntimeGaugeConfig['canvas'];
  layers: RuntimeGaugeConfig['layers'];
  eraseMasks: Array<CalibrationRect & {
    id: string;
    sourceGaugeId: string;
  }>;
  gauges: RuntimeGaugeConfig['gauges'];
}

const MIN_RECT_SIZE = 4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value);

function clampCalibrationRect(rect: CalibrationRect, canvas: RuntimeGaugeConfig['canvas']): CalibrationRect {
  const width = clamp(round(rect.width), MIN_RECT_SIZE, canvas.width);
  const height = clamp(round(rect.height), MIN_RECT_SIZE, canvas.height);
  const x = clamp(round(rect.x), 0, canvas.width - width);
  const y = clamp(round(rect.y), 0, canvas.height - height);
  const radius = clamp(round(rect.radius), 0, Math.floor(Math.min(width, height) / 2));

  return { x, y, width, height, radius };
}

function expandCalibrationRect(rect: CalibrationRect, padding: number, canvas: RuntimeGaugeConfig['canvas']): CalibrationRect {
  return clampCalibrationRect({
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
    radius: rect.radius + padding,
  }, canvas);
}

export function createGaugeCalibration(config: RuntimeGaugeConfig, erasePadding = 16): GaugeCalibrationState {
  const eraseMasks: Record<string, CalibrationRect> = {};
  const gaugeWindows: Record<string, CalibrationRect> = {};

  for (const gauge of config.gauges) {
    const window = clampCalibrationRect({
      ...gauge.window,
      radius: gauge.window.radius ?? 0,
    }, config.canvas);
    gaugeWindows[gauge.id] = window;
    eraseMasks[gauge.id] = expandCalibrationRect(window, erasePadding, config.canvas);
  }

  return {
    activeGaugeId: config.gauges[0]?.id ?? '',
    eraseMasks,
    gaugeWindows,
  };
}

export function moveCalibrationRect(
  rect: CalibrationRect,
  delta: { dx: number; dy: number },
  canvas: RuntimeGaugeConfig['canvas'],
): CalibrationRect {
  return clampCalibrationRect({
    ...rect,
    x: rect.x + delta.dx,
    y: rect.y + delta.dy,
  }, canvas);
}

export function resizeCalibrationRect(
  rect: CalibrationRect,
  handle: CalibrationResizeHandle,
  delta: { dx: number; dy: number },
  canvas: RuntimeGaugeConfig['canvas'],
): CalibrationRect {
  if (handle === 'left') {
    return clampCalibrationRect({
      ...rect,
      x: rect.x + delta.dx,
      width: rect.width - delta.dx,
    }, canvas);
  }

  if (handle === 'right') {
    return clampCalibrationRect({
      ...rect,
      width: rect.width + delta.dx,
    }, canvas);
  }

  if (handle === 'top') {
    return clampCalibrationRect({
      ...rect,
      y: rect.y + delta.dy,
      height: rect.height - delta.dy,
    }, canvas);
  }

  return clampCalibrationRect({
    ...rect,
    height: rect.height + delta.dy,
  }, canvas);
}

export function updateCalibrationRect(
  calibration: GaugeCalibrationState,
  layer: GaugeCalibrationLayer,
  gaugeId: string,
  patch: Partial<CalibrationRect>,
  canvas: RuntimeGaugeConfig['canvas'],
): GaugeCalibrationState {
  const collection = layer === 'eraseMask' ? calibration.eraseMasks : calibration.gaugeWindows;
  const current = collection[gaugeId];
  if (!current) return calibration;
  const nextRect = clampCalibrationRect({ ...current, ...patch }, canvas);

  if (layer === 'eraseMask') {
    return {
      ...calibration,
      eraseMasks: { ...calibration.eraseMasks, [gaugeId]: nextRect },
    };
  }

  return {
    ...calibration,
    gaugeWindows: { ...calibration.gaugeWindows, [gaugeId]: nextRect },
  };
}

export function exportGaugeCalibration(
  config: RuntimeGaugeConfig,
  calibration: GaugeCalibrationState,
): GaugeCalibrationExport {
  return {
    canvas: config.canvas,
    layers: config.layers,
    eraseMasks: config.gauges.map((gauge) => ({
      id: `${gauge.id}Erase`,
      sourceGaugeId: gauge.id,
      ...calibration.eraseMasks[gauge.id],
    })),
    gauges: config.gauges.map((gauge) => ({
      ...gauge,
      window: calibration.gaugeWindows[gauge.id],
    })),
  };
}
