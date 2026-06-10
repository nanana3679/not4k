import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  CENTRAL_LANE_OPACITY,
  DEFAULT_GEOMETRIC_BACKGROUND_RANGES,
  DEFAULT_FUNNEL_GRID_PARAMS,
  type GeometricBackgroundRangeParams,
  type FunnelGridParams,
  type NumericRange,
  type SurfaceProjectedPoint,
  getGeometricBackgroundParams,
  getFunnelGridParams,
  getPerspectiveSurfaceDepths,
  getRadiatingFlowPhasePx,
  getSurfaceColumnPoints,
  getSurfaceRowPoints,
  projectSurfaceCoordinate,
  updateRangeBoundary,
} from "./geometricBackground";
import "./GeometricBackgroundTestPage.css";

const SURFACE_LINE_COUNT = 34;
const SURFACE_DEPTH_EXPONENT = 2.55;
const SURFACE_TILE_COLUMN_WORLD_X = [-74, -50, -26, -2, 24, 50, 76, 102, 126, 150, 174];
const SURFACE_TILE_COLUMN_DEPTH_SAMPLES = [0.03, 0.08, 0.14, 0.22, 0.32, 0.44, 0.58, 0.73, 0.88, 0.98];
const SURFACE_ROW_WORLD_X_SAMPLES = Array.from({ length: 42 }, (_, index) => -90 + index * (280 / 41));
const SURFACE_COMET_SPECS = [
  { id: "left-far-cyan", worldX: -50, depth: 0.12, tone: "cyan", speed: 0.82 },
  { id: "right-far-cyan", worldX: 150, depth: 0.18, tone: "cyan", speed: 0.76 },
  { id: "left-high-amber", worldX: -26, depth: 0.28, tone: "amber", speed: 0.9 },
  { id: "right-high-ghost", worldX: 126, depth: 0.36, tone: "ghost", speed: 0.72 },
  { id: "left-mid-cyan", worldX: 24, depth: 0.48, tone: "cyan", speed: 0.86 },
  { id: "right-mid-amber", worldX: 102, depth: 0.56, tone: "amber", speed: 0.94 },
  { id: "left-low-ghost", worldX: -74, depth: 0.67, tone: "ghost", speed: 0.8 },
  { id: "right-low-cyan", worldX: 174, depth: 0.74, tone: "cyan", speed: 0.88 },
  { id: "left-close-amber", worldX: -2, depth: 0.82, tone: "amber", speed: 0.74 },
  { id: "right-close-cyan", worldX: 76, depth: 0.9, tone: "cyan", speed: 0.78 },
];

export default function GeometricBackgroundTestPage() {
  const [altitude, setAltitude] = useState(1);
  const [backgroundRangeInput, setBackgroundRangeInput] = useState<GeometricBackgroundRangeParams>(
    DEFAULT_GEOMETRIC_BACKGROUND_RANGES,
  );
  const [funnelInput, setFunnelInput] = useState<FunnelGridParams>(DEFAULT_FUNNEL_GRID_PARAMS);
  const [phasePx, setPhasePx] = useState(0);
  const params = useMemo(
    () => getGeometricBackgroundParams(altitude, backgroundRangeInput),
    [altitude, backgroundRangeInput],
  );
  const funnelParams = useMemo(() => getFunnelGridParams(funnelInput, altitude), [funnelInput, altitude]);
  const rayStepDeg = 18 - funnelParams.curvature * 12;
  const accentRayStepDeg = rayStepDeg * 1.7;
  const ringGapPx = 36 - funnelParams.curvature * 20;
  const surfacePhase = getRadiatingFlowPhasePx(phasePx, params.tileSizePx) / params.tileSizePx;
  const surfaceCometFlow = phasePx / Math.max(1, params.tileSizePx) * 0.16;
  const surfaceDepths = useMemo(
    () => getPerspectiveSurfaceDepths(SURFACE_LINE_COUNT, SURFACE_DEPTH_EXPONENT, surfacePhase),
    [surfacePhase],
  );
  const surfaceLines = useMemo(
    () => surfaceDepths.map((depth, index) => getSurfaceDepthLine(depth, index, funnelParams.vanishingPointYPercent)),
    [surfaceDepths, funnelParams.vanishingPointYPercent],
  );
  const surfaceTileColumns = useMemo(
    () => SURFACE_TILE_COLUMN_WORLD_X.map(
      (worldX, index) => getSurfaceTileColumnLine(worldX, index, funnelParams.vanishingPointYPercent),
    ),
    [funnelParams.vanishingPointYPercent],
  );
  const surfaceComets = useMemo(
    () => SURFACE_COMET_SPECS
      .map((spec) => getSurfaceComet(spec, surfaceCometFlow, funnelParams.vanishingPointYPercent))
      .filter((comet) => comet.visible),
    [surfaceCometFlow, funnelParams.vanishingPointYPercent],
  );
  const pageStyle = {
    "--horizon-top": `${params.horizonTopPercent}%`,
    "--ground-top": `${params.groundTopPercent}%`,
    "--vanishing-x": `${funnelParams.vanishingPointXPercent}%`,
    "--vanishing-y": `${funnelParams.vanishingPointYPercent}%`,
    "--funnel-curvature": funnelParams.curvature,
    "--funnel-radius": `${funnelParams.radiusPercent}%`,
    "--funnel-ray-step": `${rayStepDeg}deg`,
    "--funnel-accent-ray-step": `${accentRayStepDeg}deg`,
    "--funnel-ring-gap": `${ringGapPx}px`,
    "--funnel-ring-phase": `${getRadiatingFlowPhasePx(phasePx, ringGapPx)}px`,
    "--surface-horizon-y": `${funnelParams.vanishingPointYPercent}%`,
    "--surface-bend-radius-x": "140%",
    "--surface-bend-radius-y": "82%",
    "--static-background-tint": "207, 222, 232",
    "--front-light-opacity": params.forwardLightOpacity,
    "--front-light-height": `${params.forwardLightHeightPercent}%`,
    "--surface-comet-opacity": params.surfaceCometOpacity,
    "--surface-comet-head-radius": `${params.surfaceCometHeadRadiusPx}px`,
  } as CSSProperties;

  const setFunnelValue = (key: keyof FunnelGridParams, value: number) => {
    setFunnelInput((current) => ({ ...current, [key]: value }));
  };

  const setBackgroundRangePair = (
    minKey: keyof GeometricBackgroundRangeParams,
    maxKey: keyof GeometricBackgroundRangeParams,
    range: NumericRange,
  ) => {
    setBackgroundRangeInput((current) => ({
      ...current,
      [minKey]: range.min,
      [maxKey]: range.max,
    }));
  };

  const setFunnelYRange = (range: NumericRange) => {
    setFunnelInput((current) => ({
      ...current,
      vanishingPointYMinPercent: range.min,
      vanishingPointYMaxPercent: range.max,
    }));
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId = 0;
    let previousTime = performance.now();

    const tick = (time: number) => {
      const deltaSec = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;
      setPhasePx((current) => current + params.parallaxSpeedPxPerSec * deltaSec);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [params.parallaxSpeedPxPerSec]);

  return (
    <main className="geometric-test-page" style={pageStyle}>
      <div
        className="geometric-test-skyline"
        style={{
          opacity: params.horizonOpacity,
          clipPath: "polygon(0 0, 100% 0, 100% var(--surface-horizon-y), 0 var(--surface-horizon-y))",
        }}
      />
      <div
        className="geometric-test-funnel-grid"
      />
      <svg
        className="geometric-test-surface-lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-surface-coordinate-model="shared-uv"
      >
        {surfaceLines.map((line) => (
          <path
            key={line.id}
            className="geometric-test-surface-depth-line"
            d={line.path}
            opacity={line.opacity}
            strokeWidth={line.strokeWidth}
          />
        ))}
        <g className="geometric-test-surface-tile-columns">
          {surfaceTileColumns.map((column) => (
            <path
              key={column.id}
              className={`geometric-test-surface-tile-column geometric-test-surface-tile-column-${column.tone}`}
              d={column.path}
              opacity={column.opacity}
            />
          ))}
        </g>
        <g className="geometric-test-surface-comets">
          {surfaceComets.map((comet) => (
            <g
              key={comet.id}
              className={`geometric-test-surface-comet geometric-test-surface-comet-${comet.tone}`}
              opacity={comet.opacity}
              data-surface-tile-world-x={comet.surfaceTileWorldX}
            >
              <circle
                className="geometric-test-surface-comet-glow"
                cx={comet.head.x}
                cy={comet.head.y}
                r={comet.glowRadius}
              />
              <circle
                className="geometric-test-surface-comet-head"
                cx={comet.head.x}
                cy={comet.head.y}
                r={comet.headRadius}
              />
            </g>
          ))}
        </g>
      </svg>
      <div className="geometric-test-forward-light" />
      <div className="geometric-test-vignette" />
      <section
        className="geometric-test-lane-shield"
        style={{ opacity: CENTRAL_LANE_OPACITY }}
        aria-hidden="true"
      >
        <div className="geometric-test-lanes">
          <div className="geometric-test-lane" />
          <div className="geometric-test-lane" />
          <div className="geometric-test-lane" />
          <div className="geometric-test-lane" />
        </div>
      </section>

      <section className="geometric-test-control" aria-label="Geometric background altitude controls">
        <div className="geometric-test-control-row">
          <label htmlFor="altitude-range">Altitude</label>
          <span className="geometric-test-value">{params.altitude.toFixed(2)}</span>
        </div>
        <input
          id="altitude-range"
          className="geometric-test-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={altitude}
          onChange={(event) => setAltitude(Number(event.currentTarget.value))}
        />
        <div className="geometric-test-stats">
          <span className="geometric-test-stat">tile {Math.round(params.tileSizePx)}px</span>
          <span className="geometric-test-stat">speed {Math.round(params.parallaxSpeedPxPerSec)}px/s</span>
          <span className="geometric-test-stat">light {formatSliderValue(params.forwardLightOpacity, 0.01)}</span>
          <span className="geometric-test-stat">light h {Math.round(params.forwardLightHeightPercent)}%</span>
          <span className="geometric-test-stat">vanish y {Math.round(funnelParams.vanishingPointYPercent)}%</span>
          <span className="geometric-test-stat">lane opacity {CENTRAL_LANE_OPACITY}</span>
        </div>

        <div className="geometric-test-control-grid">
          <DualRangeControl
            id="tile-range"
            label="Tile"
            min={24}
            max={320}
            step={1}
            minValue={params.tileSizeMinPx}
            maxValue={params.tileSizeMaxPx}
            suffix="px"
            onChange={(range) => setBackgroundRangePair("tileSizeMinPx", "tileSizeMaxPx", range)}
          />
          <DualRangeControl
            id="speed-range"
            label="Speed"
            min={0}
            max={2000}
            step={1}
            minValue={params.parallaxSpeedMinPxPerSec}
            maxValue={params.parallaxSpeedMaxPxPerSec}
            suffix="px/s"
            onChange={(range) => setBackgroundRangePair("parallaxSpeedMinPxPerSec", "parallaxSpeedMaxPxPerSec", range)}
          />
          <DualRangeControl
            id="front-light-intensity-range"
            label="Light"
            min={0}
            max={1}
            step={0.01}
            minValue={params.forwardLightIntensityMin}
            maxValue={params.forwardLightIntensityMax}
            onChange={(range) => setBackgroundRangePair("forwardLightIntensityMin", "forwardLightIntensityMax", range)}
          />
          <DualRangeControl
            id="front-light-height-range"
            label="Light Height"
            min={0}
            max={100}
            step={1}
            minValue={params.forwardLightHeightMinPercent}
            maxValue={params.forwardLightHeightMaxPercent}
            suffix="%"
            onChange={(range) => setBackgroundRangePair(
              "forwardLightHeightMinPercent",
              "forwardLightHeightMaxPercent",
              range,
            )}
          />
          <DualRangeControl
            id="vanishing-y-range"
            label="Vanishing Y"
            min={-80}
            max={120}
            step={1}
            minValue={funnelParams.vanishingPointYMinPercent}
            maxValue={funnelParams.vanishingPointYMaxPercent}
            suffix="%"
            onChange={setFunnelYRange}
          />
          <RangeControl
            id="curvature-range"
            label="Curvature"
            min={0}
            max={1}
            step={0.01}
            value={funnelParams.curvature}
            onChange={(value) => setFunnelValue("curvature", value)}
          />
          <RangeControl
            id="radius-range"
            label="Radius"
            min={28}
            max={180}
            step={1}
            value={funnelParams.radiusPercent}
            suffix="%"
            onChange={(value) => setFunnelValue("radiusPercent", value)}
          />
        </div>
      </section>
    </main>
  );
}

interface DualRangeControlProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  minValue: number;
  maxValue: number;
  suffix?: string;
  onChange: (range: NumericRange) => void;
}

function DualRangeControl({
  id,
  label,
  min,
  max,
  step,
  minValue,
  maxValue,
  suffix = "",
  onChange,
}: DualRangeControlProps) {
  const minLabel = formatSliderValue(minValue, step);
  const maxLabel = formatSliderValue(maxValue, step);
  const rangeSpan = max - min || 1;
  const minPercent = ((minValue - min) / rangeSpan) * 100;
  const maxPercent = ((maxValue - min) / rangeSpan) * 100;
  const minInputId = `${id}-min`;
  const maxInputId = `${id}-max`;

  const handleBoundaryChange = (boundary: keyof NumericRange, value: number) => {
    onChange(updateRangeBoundary({ min: minValue, max: maxValue }, boundary, value));
  };

  return (
    <div className="geometric-test-dual-slider">
      <div className="geometric-test-slider-label">
        <span>{label}</span>
        <span className="geometric-test-value">{minLabel}{suffix} - {maxLabel}{suffix}</span>
      </div>
      <div className="geometric-test-dual-range">
        <div className="geometric-test-dual-range-track" />
        <div
          className="geometric-test-dual-range-fill"
          style={{ left: `${minPercent}%`, width: `${maxPercent - minPercent}%` }}
        />
        <input
          id={minInputId}
          className="geometric-test-dual-range-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={minValue}
          aria-label={`${label} min`}
          onChange={(event) => handleBoundaryChange("min", Number(event.currentTarget.value))}
        />
        <input
          id={maxInputId}
          className="geometric-test-dual-range-input geometric-test-dual-range-input-max"
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxValue}
          aria-label={`${label} max`}
          onChange={(event) => handleBoundaryChange("max", Number(event.currentTarget.value))}
        />
      </div>
    </div>
  );
}

interface RangeControlProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
}

function RangeControl({ id, label, min, max, step, value, suffix = "", onChange }: RangeControlProps) {
  const valueLabel = formatSliderValue(value, step);

  return (
    <label className="geometric-test-slider" htmlFor={id}>
      <span className="geometric-test-slider-label">
        <span>{label}</span>
        <span className="geometric-test-value">{valueLabel}{suffix}</span>
      </span>
      <input
        id={id}
        className="geometric-test-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function formatSliderValue(value: number, step: number): string {
  return step < 1 ? value.toFixed(2) : Math.round(value).toString();
}

function getSurfaceDepthLine(depth: number, index: number, horizonYPercent: number) {
  const points = getSurfaceRowPoints(depth, SURFACE_ROW_WORLD_X_SAMPLES, { horizonYPercent });

  return {
    id: `${index}-${depth.toFixed(4)}`,
    path: formatSurfacePolylinePath(points),
    opacity: (0.08 + depth * 0.48).toFixed(3),
    strokeWidth: (0.08 + depth * 0.22).toFixed(3),
  };
}

function getSurfaceTileColumnLine(worldX: number, index: number, horizonYPercent: number) {
  const points = getSurfaceColumnPoints(worldX, SURFACE_TILE_COLUMN_DEPTH_SAMPLES, { horizonYPercent });
  const tone = index % 4 === 1 ? "amber" : "cyan";

  return {
    id: `${index}-${worldX}`,
    path: formatSurfacePolylinePath(points),
    opacity: (0.26 + (index % 3) * 0.06).toFixed(3),
    tone,
  };
}

type SurfaceCometSpec = typeof SURFACE_COMET_SPECS[number];

function getSurfaceComet(
  spec: SurfaceCometSpec,
  flow: number,
  horizonYPercent: number,
) {
  const cycleDepth = wrapUnit(spec.depth + flow * spec.speed);
  const surfaceDepth = 0.04 + cycleDepth * 0.92;
  const fade = getCometDepthFade(cycleDepth);
  const head = projectSurfaceCoordinate({ u: spec.worldX, v: surfaceDepth }, { horizonYPercent });
  const headRadius = 0.13 + surfaceDepth * 0.22;

  return {
    id: `${spec.id}-${cycleDepth.toFixed(3)}`,
    glowRadius: (headRadius * 2.25).toFixed(3),
    head: {
      x: head.x.toFixed(3),
      y: head.y.toFixed(3),
    },
    headRadius: headRadius.toFixed(3),
    opacity: (fade * (0.46 + surfaceDepth * 0.5)).toFixed(3),
    surfaceTileWorldX: spec.worldX,
    tone: spec.tone,
    visible: fade > 0.04,
  };
}

function getCometDepthFade(depth: number): number {
  const fadeIn = Math.min(1, depth / 0.1);
  const fadeOut = Math.min(1, (1 - depth) / 0.12);

  return Math.max(0, Math.min(fadeIn, fadeOut));
}

function wrapUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return ((value % 1) + 1) % 1;
}

function formatSurfacePoint(point: Pick<SurfaceProjectedPoint, "x" | "y">): string {
  return `${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
}

function formatSurfacePolylinePath(points: SurfaceProjectedPoint[]): string {
  return `M ${points.map(formatSurfacePoint).join(" L ")}`;
}
