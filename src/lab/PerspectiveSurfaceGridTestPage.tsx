import { type CSSProperties, useMemo, useState } from "react";
import {
  DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS,
  PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT,
  buildPerspectiveSurfaceGrid,
  getPerspectiveGridObjectMarker,
  normalizePerspectiveSurfaceGridParams,
  type PerspectiveSurfaceGridParams,
} from "./perspectiveSurfaceGrid";
import "./PerspectiveSurfaceGridTestPage.css";

const DEFAULT_OBJECT_POINT = { x: 4, z: 8 };

export default function PerspectiveSurfaceGridTestPage() {
  const [gridInput, setGridInput] = useState<PerspectiveSurfaceGridParams>(DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS);
  const [objectPoint, setObjectPoint] = useState(DEFAULT_OBJECT_POINT);
  const [snapObject, setSnapObject] = useState(true);
  const grid = useMemo(() => buildPerspectiveSurfaceGrid(gridInput), [gridInput]);
  const objectGroundPoint = useMemo(() => {
    if (!snapObject) return objectPoint;

    return {
      x: snapToStep(objectPoint.x, grid.params.gridSpacing),
      z: snapToStep(objectPoint.z, grid.params.gridSpacing),
    };
  }, [grid.params.gridSpacing, objectPoint, snapObject]);
  const objectMarker = useMemo(
    () => getPerspectiveGridObjectMarker(objectGroundPoint, grid.params),
    [grid.params, objectGroundPoint],
  );
  const pageStyle = {
    "--perspective-horizon-y": `${grid.params.horizonYPercent}%`,
    "--perspective-object-x": `${objectMarker.screenXPercent}%`,
    "--perspective-object-y": `${objectMarker.screenYPercent}%`,
    "--perspective-object-scale": objectMarker.scale,
  } as CSSProperties;

  const setGridValue = (key: keyof PerspectiveSurfaceGridParams, value: number) => {
    setGridInput((current) => normalizePerspectiveSurfaceGridParams({ ...current, [key]: value }));
  };

  const setObjectValue = (key: keyof typeof objectPoint, value: number) => {
    setObjectPoint((current) => ({ ...current, [key]: value }));
  };

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
        <g
          className="perspective-surface-grid-object"
          data-ground-x={objectGroundPoint.x}
          data-ground-z={objectGroundPoint.z}
          transform={`translate(${objectMarker.screenXPercent.toFixed(3)} ${objectMarker.screenYPercent.toFixed(3)})`}
        >
          <circle className="perspective-surface-grid-object-glow" r={(1.7 * objectMarker.scale).toFixed(3)} />
          <circle className="perspective-surface-grid-object-core" r={(0.48 * objectMarker.scale).toFixed(3)} />
          <line className="perspective-surface-grid-object-pin" x1="0" y1="0" x2="0" y2={(-3.4 * objectMarker.scale).toFixed(3)} />
        </g>
        <circle
          className="perspective-surface-grid-vanishing-point"
          cx={PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT}
          cy={grid.params.horizonYPercent}
          r="0.42"
        />
      </svg>

      <section className="perspective-surface-grid-control" aria-label="Perspective surface grid controls">
        <div className="perspective-surface-grid-control-header">
          <strong>Perspective Surface Grid</strong>
          <span>x {objectGroundPoint.x} / z {objectGroundPoint.z}</span>
        </div>
        <div className="perspective-surface-grid-control-grid">
          <RangeControl
            id="perspective-horizon-y"
            label="Horizon Y"
            value={grid.params.horizonYPercent}
            min={-20}
            max={80}
            step={1}
            onChange={(value) => setGridValue("horizonYPercent", value)}
          />
          <RangeControl
            id="perspective-camera-height"
            label="Camera H"
            value={grid.params.cameraHeight}
            min={1}
            max={18}
            step={0.25}
            onChange={(value) => setGridValue("cameraHeight", value)}
          />
          <RangeControl
            id="perspective-fov"
            label="FOV"
            value={grid.params.fieldOfView}
            min={4}
            max={28}
            step={0.25}
            onChange={(value) => setGridValue("fieldOfView", value)}
          />
          <RangeControl
            id="perspective-surface-angle"
            label="Angle"
            value={grid.params.surfaceAngleDeg}
            min={0}
            max={90}
            step={1}
            onChange={(value) => setGridValue("surfaceAngleDeg", value)}
          />
          <RangeControl
            id="perspective-grid-spacing"
            label="Spacing"
            value={grid.params.gridSpacing}
            min={1}
            max={12}
            step={1}
            onChange={(value) => setGridValue("gridSpacing", value)}
          />
          <RangeControl
            id="perspective-z-far"
            label="Far Z"
            value={grid.params.zFar}
            min={8}
            max={80}
            step={1}
            onChange={(value) => setGridValue("zFar", value)}
          />
          <RangeControl
            id="perspective-object-x"
            label="Object X"
            value={objectPoint.x}
            min={grid.params.xMin}
            max={grid.params.xMax}
            step={1}
            onChange={(value) => setObjectValue("x", value)}
          />
          <RangeControl
            id="perspective-object-z"
            label="Object Z"
            value={objectPoint.z}
            min={grid.params.zNear}
            max={grid.params.zFar}
            step={1}
            onChange={(value) => setObjectValue("z", value)}
          />
        </div>
        <label className="perspective-surface-grid-checkbox" htmlFor="perspective-object-snap">
          <input
            id="perspective-object-snap"
            type="checkbox"
            checked={snapObject}
            onChange={(event) => setSnapObject(event.target.checked)}
          />
          <span>Snap object to grid</span>
        </label>
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

function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;

  return Math.round(value / step) * step;
}

function getLineOpacity(z: number, zNear: number, zFar: number): string {
  const factor = 1 - Math.min(1, Math.max(0, (z - zNear) / Math.max(1, zFar - zNear)));

  return (0.22 + factor * 0.46).toFixed(3);
}

function formatValue(value: number, step: number): string {
  return step < 1 ? value.toFixed(2) : Math.round(value).toString();
}
