import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  CENTRAL_LANE_OPACITY,
  DEFAULT_GEOMETRIC_BACKGROUND_RANGES,
  DEFAULT_FUNNEL_GRID_PARAMS,
  type GeometricBackgroundRangeParams,
  type FunnelGridParams,
  type NumericRange,
  getGeometricBackgroundParams,
  getFunnelGridParams,
  getPerspectiveSurfaceDepths,
  getRadiatingFlowPhasePx,
  updateRangeBoundary,
} from "./geometricBackground";
import "./GeometricBackgroundTestPage.css";

const SURFACE_LINE_COUNT = 34;
const SURFACE_DEPTH_EXPONENT = 2.55;

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
  const surfaceLines = useMemo(
    () => getPerspectiveSurfaceDepths(SURFACE_LINE_COUNT, SURFACE_DEPTH_EXPONENT, surfacePhase)
      .map((depth, index) => getSurfaceDepthLine(depth, index, funnelParams.vanishingPointYPercent)),
    [surfacePhase, funnelParams.vanishingPointYPercent],
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
        style={{ opacity: params.horizonOpacity }}
      />
      <div
        className="geometric-test-horizon"
        style={{ opacity: params.horizonOpacity }}
      />
      <div
        className="geometric-test-funnel-grid"
      />
      <svg
        className="geometric-test-surface-lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
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
      </svg>

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
            max={180}
            step={1}
            minValue={params.parallaxSpeedMinPxPerSec}
            maxValue={params.parallaxSpeedMaxPxPerSec}
            suffix="px/s"
            onChange={(range) => setBackgroundRangePair("parallaxSpeedMinPxPerSec", "parallaxSpeedMaxPxPerSec", range)}
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
  const y = horizonYPercent + (100 - horizonYPercent) * depth;
  const edgeDrop = 7.5 * (1 - depth);
  const bendLift = 18 * depth * (1 - depth);
  const leftY = y + edgeDrop;
  const centerY = y - bendLift;
  const rightY = y + edgeDrop;

  return {
    id: `${index}-${depth.toFixed(4)}`,
    path: `M -8 ${leftY.toFixed(3)} C 18 ${centerY.toFixed(3)} 82 ${centerY.toFixed(3)} 108 ${rightY.toFixed(3)}`,
    opacity: (0.08 + depth * 0.48).toFixed(3),
    strokeWidth: (0.08 + depth * 0.22).toFixed(3),
  };
}
