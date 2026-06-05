import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE,
  DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGES,
  DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS,
  PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT,
  buildPerspectiveSurfaceGrid,
  getPerspectiveGridObjectTrail,
  resolvePerspectiveSurfaceGridParamsFromAltitude,
  resolveSpanCellFromGroundPoint,
  resolveSpanGridSize,
  resolveSpanPositionFromGroundPoint,
  toggleGroundPointAtSpanCell,
  type GroundPoint,
  type PerspectiveSurfaceGridSpanCell,
  type PerspectiveSurfaceGridAltitudeRangeKey,
  type PerspectiveSurfaceGridAltitudeRanges,
  type PerspectiveSurfaceGridNumberRange,
} from "./perspectiveSurfaceGrid";
import "./PerspectiveSurfaceGridTestPage.css";

const DEFAULT_OBJECT_POINTS: GroundPoint[] = [{ x: 4, z: 8 }];
const DEFAULT_OBJECT_LIGHT_TRAIL = {
  timeSeconds: 0.18,
  opacity: 0.72,
};
type ControlTab = "surface" | "span" | "object";
type RangeBound = "altitude0" | "altitude1";

interface SurfaceRangeControlConfig {
  key: PerspectiveSurfaceGridAltitudeRangeKey;
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SURFACE_RANGE_CONTROLS: SurfaceRangeControlConfig[] = [
  { key: "horizonYPercent", id: "perspective-horizon-y", label: "Horizon Y", min: -20, max: 80, step: 1 },
  { key: "cameraHeight", id: "perspective-camera-height", label: "Camera H", min: 1, max: 18, step: 0.25 },
  { key: "fieldOfView", id: "perspective-fov", label: "FOV", min: 4, max: 28, step: 0.25 },
  { key: "surfaceAngleDeg", id: "perspective-surface-angle", label: "Angle", min: 0, max: 90, step: 1 },
  { key: "radialStrength", id: "perspective-radial-strength", label: "Radial", min: 0, max: 1, step: 0.01 },
  { key: "gridSpacing", id: "perspective-grid-spacing", label: "Spacing", min: 1, max: 12, step: 1 },
  { key: "gridCount", id: "perspective-grid-count", label: "Grid Count", min: 2, max: 32, step: 1 },
  { key: "scrollSpeed", id: "perspective-scroll-speed", label: "Scroll Speed", min: 0, max: 80, step: 1 },
  { key: "forwardLightOpacity", id: "perspective-forward-light", label: "Light", min: 0, max: 1, step: 0.01 },
  {
    key: "forwardLightHeightPercent",
    id: "perspective-forward-light-height",
    label: "Light Height",
    min: 0,
    max: 100,
    step: 1,
  },
  { key: "zFar", id: "perspective-z-far", label: "Far Z", min: 8, max: 80, step: 1 },
];

export default function PerspectiveSurfaceGridTestPage() {
  const [activeTab, setActiveTab] = useState<ControlTab>("surface");
  const [altitude, setAltitude] = useState(DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE);
  const [surfaceRanges, setSurfaceRanges] = useState<PerspectiveSurfaceGridAltitudeRanges>(
    DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGES,
  );
  const [scrollOffsetZ, setScrollOffsetZ] = useState(0);
  const [objectPoints, setObjectPoints] = useState<GroundPoint[]>(DEFAULT_OBJECT_POINTS);
  const [objectLightTrail, setObjectLightTrail] = useState(DEFAULT_OBJECT_LIGHT_TRAIL);
  const [spanGridSize, setSpanGridSize] = useState(() => resolveSpanGridSize(DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS));
  const gridInput = useMemo(
    () => resolvePerspectiveSurfaceGridParamsFromAltitude(altitude, surfaceRanges, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS),
    [altitude, surfaceRanges],
  );
  const grid = useMemo(() => buildPerspectiveSurfaceGrid({ ...gridInput, scrollOffsetZ }), [gridInput, scrollOffsetZ]);
  const primaryObjectPoint = objectPoints[0] ?? null;
  const primaryObjectSpanPosition = useMemo(
    () => primaryObjectPoint === null ? null : resolveSpanPositionFromGroundPoint(primaryObjectPoint, grid.params),
    [grid.params, primaryObjectPoint],
  );
  const primarySpanCell = useMemo(
    () => primaryObjectPoint === null ? null : resolveSpanCellFromGroundPoint(primaryObjectPoint, spanGridSize, grid.params),
    [grid.params, primaryObjectPoint, spanGridSize],
  );
  const occupiedSpanCellKeys = useMemo(
    () => new Set(
      objectPoints.map((point) => getSpanCellKey(resolveSpanCellFromGroundPoint(point, spanGridSize, grid.params))),
    ),
    [grid.params, objectPoints, spanGridSize],
  );
  const objectVisuals = useMemo(
    () => objectPoints.map((point) => {
      const trail = getPerspectiveGridObjectTrail(point, grid.params, objectLightTrail.timeSeconds);

      return {
        point,
        marker: trail.head,
        trail,
      };
    }),
    [grid.params, objectLightTrail.timeSeconds, objectPoints],
  );
  const scrollSpan = grid.params.zFar - grid.params.zNear;
  const pageStyle = {
    "--perspective-horizon-y": `${grid.params.horizonYPercent}%`,
    "--perspective-forward-light-opacity": grid.params.forwardLightOpacity,
    "--perspective-forward-light-height": `${grid.params.forwardLightHeightPercent}%`,
  } as CSSProperties;

  const setObjectSpanCell = (cell: PerspectiveSurfaceGridSpanCell) => {
    setObjectPoints((current) => toggleGroundPointAtSpanCell(current, cell, spanGridSize, grid.params));
  };

  const setObjectLightTrailValue = (key: keyof typeof objectLightTrail, value: number) => {
    setObjectLightTrail((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const setSpanGridSizeValue = (key: keyof typeof spanGridSize, value: number) => {
    setSpanGridSize((current) => ({
      ...current,
      [key]: Math.max(1, Math.min(32, Math.round(value))),
    }));
  };

  const setSurfaceRangeValue = (
    key: PerspectiveSurfaceGridAltitudeRangeKey,
    bound: RangeBound,
    value: number,
  ) => {
    setSurfaceRanges((current) => {
      const nextRange = { ...current[key], [bound]: value };

      return {
        ...current,
        [key]: nextRange,
      };
    });
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId = 0;
    let previousTime = performance.now();

    const tick = (time: number) => {
      const deltaSec = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;
      setScrollOffsetZ((current) => current + gridInput.scrollSpeed * deltaSec);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [gridInput.scrollSpeed]);

  return (
    <main className="perspective-surface-grid-page" style={pageStyle}>
      <svg
        className="perspective-surface-grid-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        data-coordinate-model="ground-xz"
        aria-hidden="true"
      >
        <line
          className="perspective-surface-grid-horizon"
          x1="-8"
          x2="108"
          y1={grid.params.horizonYPercent}
          y2={grid.params.horizonYPercent}
        />
        {grid.rows.map((row) => (
          <path
            key={row.id}
            className="perspective-surface-grid-row"
            d={row.path}
            opacity={getLineOpacity(row.z ?? grid.params.zFar, grid.params.zNear, grid.params.zFar)}
          />
        ))}
        {grid.columns.map((column) => (
          <path
            key={column.id}
            className="perspective-surface-grid-column"
            d={column.path}
            opacity="0.74"
          />
        ))}
        {objectVisuals.map(({ point, trail }, objectIndex) => (
          trail.segments.map((segment, segmentIndex) => (
            <path
              key={`${point.x}-${point.z}-${objectIndex}-trail-${segmentIndex}`}
              className="perspective-surface-grid-object-trail"
              d={segment.path}
              opacity={(segment.alpha * objectLightTrail.opacity).toFixed(3)}
              strokeWidth={getLightTrailStrokeWidth(segment.end)}
              data-object-trail-index={objectIndex}
              data-object-trail-segment-index={segmentIndex}
              data-ground-x={point.x}
              data-ground-z={point.z}
              data-light-trail-time={objectLightTrail.timeSeconds}
            />
          ))
        ))}
        {objectVisuals.map(({ point, marker }, index) => (
          <g
            key={`${point.x}-${point.z}-${index}`}
            className="perspective-surface-grid-object"
            data-object-index={index}
            data-ground-x={point.x}
            data-ground-z={point.z}
            transform={`translate(${marker.screenXPercent.toFixed(3)} ${marker.screenYPercent.toFixed(3)})`}
          >
            <circle className="perspective-surface-grid-object-glow" r={(1.7 * marker.scale).toFixed(3)} />
            <circle className="perspective-surface-grid-object-core" r={(0.48 * marker.scale).toFixed(3)} />
            <line className="perspective-surface-grid-object-pin" x1="0" y1="0" x2="0" y2={(-3.4 * marker.scale).toFixed(3)} />
          </g>
        ))}
        <circle
          className="perspective-surface-grid-vanishing-point"
          cx={PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT}
          cy={grid.params.horizonYPercent}
          r="0.42"
        />
      </svg>
      <div className="perspective-surface-grid-forward-light" aria-hidden="true" />

      <section className="perspective-surface-grid-control" aria-label="Perspective surface grid controls">
        <div className="perspective-surface-grid-control-header">
          <strong>Perspective Surface Grid</strong>
          <span>alt {altitude.toFixed(2)} / objects {objectPoints.length}</span>
        </div>
        <div className="perspective-surface-grid-tabs" role="tablist" aria-label="Perspective controls">
          <button
            id="perspective-tab-surface"
            type="button"
            role="tab"
            aria-selected={activeTab === "surface"}
            aria-controls="perspective-panel-surface"
            onClick={() => setActiveTab("surface")}
          >
            Surface
          </button>
          <button
            id="perspective-tab-span"
            type="button"
            role="tab"
            aria-selected={activeTab === "span"}
            aria-controls="perspective-panel-span"
            onClick={() => setActiveTab("span")}
          >
            Span
          </button>
          <button
            id="perspective-tab-object"
            type="button"
            role="tab"
            aria-selected={activeTab === "object"}
            aria-controls="perspective-panel-object"
            onClick={() => setActiveTab("object")}
          >
            Object
          </button>
        </div>
        <div
          id="perspective-panel-surface"
          className="perspective-surface-grid-panel"
          role="tabpanel"
          aria-labelledby="perspective-tab-surface"
          hidden={activeTab !== "surface"}
        >
          <RangeControl
            id="perspective-altitude"
            label="Altitude"
            value={altitude}
            min={0}
            max={1}
            step={0.01}
            onChange={setAltitude}
          />
          <div className="perspective-surface-grid-control-grid">
            {SURFACE_RANGE_CONTROLS.map((control) => (
              <RangePairControl
                key={control.key}
                id={control.id}
                label={control.label}
                value={grid.params[control.key]}
                range={surfaceRanges[control.key]}
                min={control.min}
                max={control.max}
                step={control.step}
                onChange={(bound, value) => setSurfaceRangeValue(control.key, bound, value)}
              />
            ))}
          </div>
        </div>
        <div
          id="perspective-panel-span"
          className="perspective-surface-grid-panel"
          role="tabpanel"
          aria-labelledby="perspective-tab-span"
          hidden={activeTab !== "span"}
        >
          <div className="perspective-surface-grid-span-summary" aria-label="Scroll span values">
            <span>
              <span>Scroll Span</span>
              <strong>{formatValue(scrollSpan, 1)}</strong>
            </span>
            <span>
              <span>Objects</span>
              <strong>{objectPoints.length}</strong>
            </span>
            <span>
              <span>First Cell</span>
              <strong>{formatSpanCell(primarySpanCell)}</strong>
            </span>
          </div>
          <div className="perspective-surface-grid-control-grid perspective-surface-grid-span-size-controls">
            <RangeControl
              id="perspective-span-columns"
              label="Span Width"
              value={spanGridSize.columns}
              min={1}
              max={32}
              step={1}
              onChange={(value) => setSpanGridSizeValue("columns", value)}
            />
            <RangeControl
              id="perspective-span-rows"
              label="Span Height"
              value={spanGridSize.rows}
              min={1}
              max={32}
              step={1}
              onChange={(value) => setSpanGridSizeValue("rows", value)}
            />
          </div>
          <SpanCellPicker
            gridSize={spanGridSize}
            occupiedCellKeys={occupiedSpanCellKeys}
            onSelect={setObjectSpanCell}
          />
        </div>
        <div
          id="perspective-panel-object"
          className="perspective-surface-grid-panel"
          role="tabpanel"
          aria-labelledby="perspective-tab-object"
          hidden={activeTab !== "object"}
        >
          <div className="perspective-surface-grid-span-summary" aria-label="Object placement values">
            <span>
              <span>Selected Cell</span>
              <strong>{formatSpanCell(primarySpanCell)}</strong>
            </span>
            <span>
              <span>Span</span>
              <strong>{formatSpanPosition(primaryObjectSpanPosition)}</strong>
            </span>
            <span>
              <span>Objects</span>
              <strong>{objectPoints.length}</strong>
            </span>
          </div>
          <fieldset className="perspective-surface-grid-object-trail-controls">
            <legend>Light Trail</legend>
            <div className="perspective-surface-grid-control-grid">
              <RangeControl
                id="perspective-object-trail-time"
                label="Trail Time"
                value={objectLightTrail.timeSeconds}
                min={0}
                max={0.6}
                step={0.01}
                onChange={(value) => setObjectLightTrailValue("timeSeconds", value)}
              />
              <RangeControl
                id="perspective-object-trail-opacity"
                label="Trail Opacity"
                value={objectLightTrail.opacity}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => setObjectLightTrailValue("opacity", value)}
              />
            </div>
          </fieldset>
        </div>
      </section>
    </main>
  );
}

interface RangeControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

interface RangePairControlProps {
  id: string;
  label: string;
  value: number;
  range: PerspectiveSurfaceGridNumberRange;
  min: number;
  max: number;
  step: number;
  onChange: (bound: RangeBound, value: number) => void;
}

interface SpanCellPickerProps {
  gridSize: {
    columns: number;
    rows: number;
  };
  occupiedCellKeys: Set<string>;
  onSelect: (cell: PerspectiveSurfaceGridSpanCell) => void;
}

function SpanCellPicker({ gridSize, occupiedCellKeys, onSelect }: SpanCellPickerProps) {
  const pickerStyle = {
    "--span-grid-columns": gridSize.columns,
  } as CSSProperties;

  return (
    <div
      className="perspective-surface-grid-span-picker"
      style={pickerStyle}
      role="grid"
      aria-label="Span object placement grid"
    >
      {Array.from({ length: gridSize.rows }, (_, row) => (
        Array.from({ length: gridSize.columns }, (_, column) => {
          const hasObject = occupiedCellKeys.has(getSpanCellKey({ column, row }));

          return (
            <button
              key={`${column}-${row}`}
              className="perspective-surface-grid-span-cell"
              type="button"
              aria-label={`Span cell column ${column + 1} row ${row + 1}`}
              aria-pressed={hasObject}
              data-span-cell-column={column}
              data-span-cell-row={row}
              data-span-cell-has-object={hasObject}
              onClick={() => onSelect({ column, row })}
            >
              <span aria-hidden="true" />
            </button>
          );
        })
      ))}
    </div>
  );
}

function RangePairControl({ id, label, value, range, min, max, step, onChange }: RangePairControlProps) {
  const altitude0Percent = getRangePercent(range.altitude0, min, max);
  const altitude1Percent = getRangePercent(range.altitude1, min, max);
  const dualRangeStyle = {
    "--dual-range-min": `${Math.min(altitude0Percent, altitude1Percent)}%`,
    "--dual-range-max": `${Math.max(altitude0Percent, altitude1Percent)}%`,
    "--dual-range-altitude-0": `${altitude0Percent}%`,
    "--dual-range-altitude-1": `${altitude1Percent}%`,
  } as CSSProperties;

  return (
    <fieldset className="perspective-surface-grid-range-pair">
      <legend>
        <span>{label}</span>
        <strong>{formatValue(value, step)}</strong>
      </legend>
      <div
        className="perspective-surface-grid-dual-range"
        style={dualRangeStyle}
        aria-label={`${label} altitude endpoints`}
      >
        <div className="perspective-surface-grid-dual-range-values">
          <span className="perspective-surface-grid-dual-range-value perspective-surface-grid-dual-range-value-altitude-0">
            Alt 0 {formatValue(range.altitude0, step)}
          </span>
          <span className="perspective-surface-grid-dual-range-value perspective-surface-grid-dual-range-value-altitude-1">
            Alt 1 {formatValue(range.altitude1, step)}
          </span>
        </div>
        <div className="perspective-surface-grid-dual-range-track-shell">
          <div className="perspective-surface-grid-dual-range-track" aria-hidden="true">
            <span className="perspective-surface-grid-dual-range-fill" />
          </div>
          <span
            className="perspective-surface-grid-dual-range-handle-face perspective-surface-grid-dual-range-handle-face-round perspective-surface-grid-dual-range-handle-face-altitude-0"
            data-handle-face="0"
            aria-hidden="true"
          >
            0
          </span>
          <span
            className="perspective-surface-grid-dual-range-handle-face perspective-surface-grid-dual-range-handle-face-round perspective-surface-grid-dual-range-handle-face-altitude-1"
            data-handle-face="1"
            aria-hidden="true"
          >
            1
          </span>
          <input
            id={`${id}-altitude-0`}
            className="perspective-surface-grid-dual-range-thumb perspective-surface-grid-dual-range-thumb-altitude-0"
            type="range"
            min={min}
            max={max}
            step={step}
            value={range.altitude0}
            aria-label={`${label} altitude 0`}
            data-endpoint="altitude-0"
            onChange={(event) => onChange("altitude0", Number(event.target.value))}
          />
          <input
            id={`${id}-altitude-1`}
            className="perspective-surface-grid-dual-range-thumb perspective-surface-grid-dual-range-thumb-altitude-1"
            type="range"
            min={min}
            max={max}
            step={step}
            value={range.altitude1}
            aria-label={`${label} altitude 1`}
            data-endpoint="altitude-1"
            onChange={(event) => onChange("altitude1", Number(event.target.value))}
          />
        </div>
      </div>
    </fieldset>
  );
}

function RangeControl({ id, label, value, min, max, step, onChange }: RangeControlProps) {
  return (
    <label className="perspective-surface-grid-range" htmlFor={id}>
      <span>
        <span>{label}</span>
        <strong>{formatValue(value, step)}</strong>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function getSpanCellKey(cell: PerspectiveSurfaceGridSpanCell): string {
  return `${cell.column}:${cell.row}`;
}

function formatSpanCell(cell: PerspectiveSurfaceGridSpanCell | null): string {
  if (cell === null) return "none";

  return `${cell.column + 1} / ${cell.row + 1}`;
}

function formatSpanPosition(position: { x: number; z: number } | null): string {
  if (position === null) return "none";

  return `${formatValue(position.x, 0.01)} / ${formatValue(position.z, 0.01)}`;
}

function getLightTrailStrokeWidth(point: { scale: number }): string {
  return (0.96 * point.scale).toFixed(3);
}

function getLineOpacity(z: number, zNear: number, zFar: number): string {
  const factor = 1 - Math.min(1, Math.max(0, (z - zNear) / Math.max(1, zFar - zNear)));

  return (0.22 + factor * 0.46).toFixed(3);
}

function formatValue(value: number, step: number): string {
  return step < 1 ? value.toFixed(2) : Math.round(value).toString();
}

function getRangePercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;

  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}
