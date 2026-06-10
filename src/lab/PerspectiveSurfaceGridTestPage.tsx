import { type CSSProperties, type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import {
  DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE,
  DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGES,
  DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE,
  DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_CONNECTIONS,
  DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_LIGHT_TRAIL,
  DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_PLACEMENTS,
  DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS,
  PERSPECTIVE_SURFACE_GRID_OBJECT_DEFAULT_OUTLINE_WIDTH,
  PERSPECTIVE_SURFACE_GRID_OBJECT_MAX_OUTLINE_WIDTH,
  PERSPECTIVE_SURFACE_GRID_OBJECT_MIN_OUTLINE_WIDTH,
  PERSPECTIVE_SURFACE_GRID_OBJECT_RENDER_MODES,
  PERSPECTIVE_SURFACE_GRID_OBJECT_SHAPES,
  createRandomPerspectiveSurfaceGridObjectPlacements,
  getPerspectiveGridObjectTrail,
  removePerspectiveSurfaceGridObjectConnectionsForObject,
  resolvePerspectiveSurfaceGridRandomObjectCount,
  resolvePerspectiveSurfaceGridParamsFromAltitude,
  resolveGroundPointFromSpanCell,
  resolveSpanCellFromGroundPoint,
  resolveSpanGridSize,
  resolveSpanTriangleCellFromGroundPoint,
  togglePerspectiveSurfaceGridObjectConnection,
  type PerspectiveSurfaceGridSpanCell,
  type PerspectiveSurfaceGridSpanGridSize,
  type PerspectiveSurfaceGridAltitudeRangeKey,
  type PerspectiveSurfaceGridAltitudeRanges,
  type PerspectiveSurfaceGridNumberRange,
  type PerspectiveSurfaceGridObjectAppearance,
  type PerspectiveSurfaceGridObjectConnection,
  type PerspectiveSurfaceGridObjectPlacement,
  type PerspectiveSurfaceGridObjectRenderMode,
  type PerspectiveSurfaceGridObjectShape,
  type PerspectiveSurfaceGridParams,
  type PerspectiveSurfaceGridSurfacePattern,
} from "./perspectiveSurfaceGrid";
import { PerspectiveSurfaceGridPixiPreview } from "./PerspectiveSurfaceGridPixiPreview";
import {
  PERSPECTIVE_SURFACE_GRID_PRESET_OUTPUT_PATH,
  PERSPECTIVE_SURFACE_GRID_PRESET_SAVE_ENDPOINT,
  createPerspectiveSurfaceGridPreset,
} from "./perspectiveSurfaceGridPreset";
import "./PerspectiveSurfaceGridTestPage.css";

type ControlTab = "surface" | "layout" | "style" | "export";
type LayoutTool = "select" | "place" | "connect" | "erase";
type RangeBound = "altitude0" | "altitude1";
type PresetSaveStatus = "idle" | "saving" | "saved" | "error";

const LAYOUT_TOOLS: LayoutTool[] = ["select", "place", "connect", "erase"];
const SPAN_TRIANGLE_TILE_WIDTH = 18;
const SPAN_TRIANGLE_TILE_HEIGHT = 15.588;

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
  { key: "gridCount", id: "perspective-grid-count", label: "Grid Count", min: 2, max: 64, step: 1 },
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
  const [activeTab, setActiveTab] = useState<ControlTab>("layout");
  const [layoutTool, setLayoutTool] = useState<LayoutTool>("select");
  const [altitude, setAltitude] = useState(DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE);
  const [isScrollPaused, setIsScrollPaused] = useState(false);
  const [surfaceRanges, setSurfaceRanges] = useState<PerspectiveSurfaceGridAltitudeRanges>(
    DEFAULT_PERSPECTIVE_SURFACE_GRID_ALTITUDE_RANGES,
  );
  const [surfacePattern, setSurfacePattern] = useState<PerspectiveSurfaceGridSurfacePattern>("triangles");
  const [objectPlacements, setObjectPlacements] = useState<PerspectiveSurfaceGridObjectPlacement[]>(
    () => DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_PLACEMENTS.map(copyObjectPlacement),
  );
  const [objectConnections, setObjectConnections] = useState<PerspectiveSurfaceGridObjectConnection[]>(
    () => DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_CONNECTIONS.map(copyObjectConnection),
  );
  const [objectDefaultAppearance, setObjectDefaultAppearance] = useState(
    () => copyObjectAppearance(DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE),
  );
  const [selectedObjectIndex, setSelectedObjectIndex] = useState(0);
  const [connectionStartIndex, setConnectionStartIndex] = useState<number | null>(null);
  const [objectLightTrail, setObjectLightTrail] = useState(DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_LIGHT_TRAIL);
  const [spanGridSize, setSpanGridSize] = useState(() => resolveSpanGridSize(DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS));
  const [objectDensity, setObjectDensity] = useState(0.15);
  const [presetSaveStatus, setPresetSaveStatus] = useState<PresetSaveStatus>("idle");
  const [presetSaveMessage, setPresetSaveMessage] = useState(PERSPECTIVE_SURFACE_GRID_PRESET_OUTPUT_PATH);
  const gridInput = useMemo(
    () => resolvePerspectiveSurfaceGridParamsFromAltitude(altitude, surfaceRanges, DEFAULT_PERSPECTIVE_SURFACE_GRID_PARAMS),
    [altitude, surfaceRanges],
  );
  const gridParams = gridInput;
  const selectedObject = objectPlacements[selectedObjectIndex] ?? null;
  const selectedObjectAppearance = selectedObject?.appearance ?? DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE;
  const workbenchState = getWorkbenchState(layoutTool, connectionStartIndex);
  const selectedSpanCell = useMemo(
    () => selectedObject === null
      ? null
      : resolvePlacementSpanCell(selectedObject, spanGridSize, gridParams, surfacePattern),
    [gridParams, selectedObject, spanGridSize, surfacePattern],
  );
  const selectedSpanCellKey = selectedSpanCell === null ? null : getSpanCellKey(selectedSpanCell);
  const spanCellObjectIndexes = useMemo(() => {
    const indexes = new Map<string, number>();
    objectPlacements.forEach((placement, index) => {
      indexes.set(getSpanCellKey(resolvePlacementSpanCell(placement, spanGridSize, gridParams, surfacePattern)), index);
    });

    return indexes;
  }, [gridParams, objectPlacements, spanGridSize, surfacePattern]);
  const occupiedSpanCellKeys = useMemo(
    () => new Set(spanCellObjectIndexes.keys()),
    [spanCellObjectIndexes],
  );
  const connectableSpanCellKeys = useMemo(() => {
    const keys = new Set<string>();
    objectPlacements.forEach((placement) => {
      if (placement.appearance.shape !== "point") return;

      keys.add(getSpanCellKey(resolvePlacementSpanCell(placement, spanGridSize, gridParams, surfacePattern)));
    });

    return keys;
  }, [gridParams, objectPlacements, spanGridSize, surfacePattern]);
  const scrollSpan = gridParams.zFar - gridParams.zNear;
  const randomObjectCount = resolvePerspectiveSurfaceGridRandomObjectCount(spanGridSize, objectDensity);
  const trailStampCount = useMemo(
    () => objectPlacements.reduce((sum, placement) => (
      sum + Math.max(0, getPerspectiveGridObjectTrail(placement, gridParams, objectLightTrail.timeSeconds).points.length - 1)
    ), 0),
    [gridParams, objectLightTrail.timeSeconds, objectPlacements],
  );
  const performanceBudget = resolvePerformanceBudget({
    objectCount: objectPlacements.length,
    connectionCount: objectConnections.length,
    trailStampCount,
  });
  const pageStyle = {
    "--perspective-horizon-y": `${gridParams.horizonYPercent}%`,
    "--perspective-forward-light-opacity": gridParams.forwardLightOpacity,
    "--perspective-forward-light-height": `${gridParams.forwardLightHeightPercent}%`,
  } as CSSProperties;

  const setObjectSpanCell = (cell: PerspectiveSurfaceGridSpanCell) => {
    const matchingIndex = objectPlacements.findIndex((placement) => (
      getSpanCellKey(resolvePlacementSpanCell(placement, spanGridSize, gridParams, surfacePattern)) === getSpanCellKey(cell)
    ));

    if (layoutTool === "erase") {
      if (matchingIndex >= 0) removeObjectAtIndex(matchingIndex);
      return;
    }

    if (matchingIndex >= 0) {
      selectObjectForEditing(matchingIndex);
      return;
    }

    if (layoutTool !== "place" && layoutTool !== "connect") return;

    const point = resolveGroundPointFromSpanCell(cell, spanGridSize, gridParams);
    const appearance = layoutTool === "connect"
      ? { ...copyObjectAppearance(objectDefaultAppearance), shape: "point" as const }
      : copyObjectAppearance(objectDefaultAppearance);
    const nextPlacement = {
      ...point,
      heightY: 0,
      appearance,
    };
    const nextIndex = objectPlacements.length;
    const nextPlacements = [...objectPlacements, nextPlacement];

    setObjectPlacements(nextPlacements);
    setSelectedObjectIndex(nextIndex);
    if (layoutTool === "connect") {
      if (connectionStartIndex === null) {
        setConnectionStartIndex(nextIndex);
      } else {
        setObjectConnections((current) => (
          togglePerspectiveSurfaceGridObjectConnection(current, connectionStartIndex, nextIndex, nextPlacements)
        ));
        setConnectionStartIndex(null);
      }
    }
    setActiveTab("layout");
  };

  const selectObjectForEditing = (index: number) => {
    if (layoutTool === "erase") {
      removeObjectAtIndex(index);
      return;
    }

    const target = objectPlacements[index];
    if (layoutTool === "connect" && target?.appearance.shape !== "point") {
      setSelectedObjectIndex(index);
      setActiveTab("layout");
      return;
    }

    if (layoutTool === "connect" && connectionStartIndex === null && target?.appearance.shape === "point") {
      setConnectionStartIndex(index);
      setSelectedObjectIndex(index);
      setActiveTab("layout");
      return;
    }

    if (layoutTool === "connect" && connectionStartIndex !== null && connectionStartIndex !== index) {
      setObjectConnections((current) => (
        togglePerspectiveSurfaceGridObjectConnection(current, connectionStartIndex, index, objectPlacements)
      ));
      setConnectionStartIndex(null);
    }

    setSelectedObjectIndex(index);
    setActiveTab("layout");
  };

  const setLayoutToolValue = (tool: LayoutTool) => {
    setLayoutTool(tool);
    if (tool !== "connect") setConnectionStartIndex(null);
  };

  const setObjectShape = (shape: PerspectiveSurfaceGridObjectShape) => {
    updateSelectedObjectAppearance({ shape });
    if (shape !== "point") {
      setObjectConnections((current) => removePerspectiveSurfaceGridObjectConnectionsForObject(current, selectedObjectIndex));
      setConnectionStartIndex((current) => current === selectedObjectIndex ? null : current);
    }
  };

  const setObjectDiameter = (diameter: number) => {
    updateSelectedObjectAppearance({ diameter });
  };

  const setObjectOutlineWidth = (outlineWidth: number) => {
    updateSelectedObjectAppearance({ outlineWidth });
  };

  const setObjectRotationDeg = (rotationDeg: number) => {
    updateSelectedObjectAppearance({ rotationDeg });
  };

  const setObjectColor = (color: string) => {
    updateSelectedObjectAppearance({ color });
  };

  const setObjectRenderMode = (renderMode: PerspectiveSurfaceGridObjectRenderMode) => {
    updateSelectedObjectAppearance({ renderMode });
  };

  const setObjectHeightY = (heightY: number) => {
    updateSelectedObject((placement) => ({
      ...placement,
      heightY: Math.max(0, Math.min(20, heightY)),
    }));
  };

  const setObjectDefaultShape = (shape: PerspectiveSurfaceGridObjectShape) => {
    updateObjectDefaultAppearance({ shape });
  };

  const setObjectDefaultDiameter = (diameter: number) => {
    updateObjectDefaultAppearance({ diameter });
  };

  const setObjectDefaultOutlineWidth = (outlineWidth: number) => {
    updateObjectDefaultAppearance({ outlineWidth });
  };

  const setObjectDefaultRotationDeg = (rotationDeg: number) => {
    updateObjectDefaultAppearance({ rotationDeg });
  };

  const setObjectDefaultColor = (color: string) => {
    updateObjectDefaultAppearance({ color });
  };

  const setObjectDefaultRenderMode = (renderMode: PerspectiveSurfaceGridObjectRenderMode) => {
    updateObjectDefaultAppearance({ renderMode });
  };

  const removeSelectedObject = () => {
    if (selectedObject === null) return;

    removeObjectAtIndex(selectedObjectIndex);
  };

  const removeObjectAtIndex = (indexToRemove: number) => {
    const nextPlacements = objectPlacements.filter((_, index) => index !== indexToRemove);
    setObjectPlacements(nextPlacements);
    setObjectConnections((current) => removePerspectiveSurfaceGridObjectConnectionsForObject(current, indexToRemove));
    setConnectionStartIndex((current) => {
      if (current === null || current === indexToRemove) return null;

      return current > indexToRemove ? current - 1 : current;
    });
    setSelectedObjectIndex((current) => Math.max(0, Math.min(
      current > indexToRemove ? current - 1 : current,
      nextPlacements.length - 1,
    )));
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

  const randomizeSpanObjects = () => {
    const placements = createRandomPerspectiveSurfaceGridObjectPlacements({
      size: spanGridSize,
      input: gridParams,
      density: objectDensity,
      surfacePattern,
    });

    setObjectPlacements(placements);
    setObjectConnections([]);
    setConnectionStartIndex(null);
    setSelectedObjectIndex(0);
  };

  const clearSpanObjects = () => {
    setObjectPlacements([]);
    setObjectConnections([]);
    setConnectionStartIndex(null);
    setSelectedObjectIndex(0);
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

  const updateSelectedObject = (
    updater: (placement: PerspectiveSurfaceGridObjectPlacement) => PerspectiveSurfaceGridObjectPlacement,
  ) => {
    setObjectPlacements((current) => current.map((placement, index) => (
      index === selectedObjectIndex ? updater(placement) : placement
    )));
  };

  const updateSelectedObjectAppearance = (appearancePatch: Partial<PerspectiveSurfaceGridObjectAppearance>) => {
    updateSelectedObject((placement) => ({
      ...placement,
      appearance: {
        ...placement.appearance,
        ...appearancePatch,
      },
    }));
  };

  const updateObjectDefaultAppearance = (appearancePatch: Partial<PerspectiveSurfaceGridObjectAppearance>) => {
    setObjectDefaultAppearance((current) => ({
      ...current,
      ...appearancePatch,
    }));
  };

  const saveCurrentPreset = async () => {
    setPresetSaveStatus("saving");
    setPresetSaveMessage("Saving preset...");

    const preset = createPerspectiveSurfaceGridPreset({
      altitude,
      surfacePattern,
      surfaceRanges,
      params: gridParams,
      spanGridSize,
      objectPlacements,
      objectConnections,
      objectLightTrail,
    });

    try {
      const response = await fetch(PERSPECTIVE_SURFACE_GRID_PRESET_SAVE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody || `HTTP ${response.status}`);
      }

      setPresetSaveStatus("saved");
      setPresetSaveMessage(`Saved to ${PERSPECTIVE_SURFACE_GRID_PRESET_OUTPUT_PATH}`);
    } catch (error) {
      setPresetSaveStatus("error");
      setPresetSaveMessage(error instanceof Error ? error.message : "Preset save failed");
    }
  };

  return (
    <main className="perspective-surface-grid-page" style={pageStyle}>
      <PerspectiveSurfaceGridPixiPreview
        params={gridParams}
        surfacePattern={surfacePattern}
        isScrollPaused={isScrollPaused}
        objectPlacements={objectPlacements}
        objectConnections={objectConnections}
        objectLightTrail={objectLightTrail}
        selectedObjectIndex={selectedObjectIndex}
        connectionStartIndex={connectionStartIndex}
        onObjectSelect={selectObjectForEditing}
      />
      <div className="perspective-surface-grid-forward-light" aria-hidden="true" />

      <aside className="perspective-surface-grid-altitude-control" aria-label="Global altitude control">
        <RangeControl
          id="perspective-global-altitude"
          label="Altitude"
          value={altitude}
          min={0}
          max={1}
          step={0.01}
          onChange={setAltitude}
        />
        <div className="perspective-surface-grid-altitude-presets" role="group" aria-label="Altitude previews">
          <button id="perspective-altitude-preview-low" type="button" onClick={() => setAltitude(0)}>
            Low
          </button>
          <button id="perspective-altitude-preview-mid" type="button" onClick={() => setAltitude(0.5)}>
            Mid
          </button>
          <button id="perspective-altitude-preview-high" type="button" onClick={() => setAltitude(1)}>
            High
          </button>
          <button
            id="perspective-scroll-pause"
            type="button"
            aria-pressed={isScrollPaused}
            onClick={() => setIsScrollPaused((current) => !current)}
          >
            Pause
          </button>
        </div>
      </aside>

      <section className="perspective-surface-grid-control" aria-label="Perspective surface grid controls">
        <div className="perspective-surface-grid-control-header">
          <strong>Perspective Surface Grid</strong>
          <span>alt {altitude.toFixed(2)}</span>
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
            id="perspective-tab-layout"
            type="button"
            role="tab"
            aria-selected={activeTab === "layout"}
            aria-controls="perspective-panel-layout"
            onClick={() => setActiveTab("layout")}
          >
            Layout
          </button>
          <button
            id="perspective-tab-style"
            type="button"
            role="tab"
            aria-selected={activeTab === "style"}
            aria-controls="perspective-panel-style"
            onClick={() => setActiveTab("style")}
          >
            Style
          </button>
          <button
            id="perspective-tab-export"
            type="button"
            role="tab"
            aria-selected={activeTab === "export"}
            aria-controls="perspective-panel-export"
            onClick={() => setActiveTab("export")}
          >
            Export
          </button>
        </div>
        <div
          id="perspective-panel-surface"
          className="perspective-surface-grid-panel"
          role="tabpanel"
          aria-labelledby="perspective-tab-surface"
          hidden={activeTab !== "surface"}
        >
          <div className="perspective-surface-grid-pattern-options" role="group" aria-label="Surface pattern">
            <button
              type="button"
              aria-pressed={surfacePattern === "triangles"}
              data-surface-pattern-option="triangles"
              onClick={() => setSurfacePattern("triangles")}
            >
              Triangles
            </button>
            <button
              type="button"
              aria-pressed={surfacePattern === "grid"}
              data-surface-pattern-option="grid"
              onClick={() => setSurfacePattern("grid")}
            >
              Grid
            </button>
          </div>
          <div className="perspective-surface-grid-control-grid">
            {SURFACE_RANGE_CONTROLS.map((control) => (
              <RangePairControl
                key={control.key}
                id={control.id}
                label={control.label}
                value={gridParams[control.key]}
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
          id="perspective-panel-layout"
          className="perspective-surface-grid-panel"
          role="tabpanel"
          aria-labelledby="perspective-tab-layout"
          hidden={activeTab !== "layout"}
          data-panel-scope="layout-workbench"
          data-selected-object-index={selectedObject === null ? -1 : selectedObjectIndex}
          data-layout-tool={layoutTool}
        >
          <div
            className="perspective-surface-grid-tool-mode-bar"
            role="group"
            aria-label="Layout tool mode"
            data-layout-tool={layoutTool}
          >
            {LAYOUT_TOOLS.map((tool) => (
              <button
                key={tool}
                id={`perspective-layout-tool-${tool}`}
                type="button"
                aria-pressed={layoutTool === tool}
                data-layout-tool-option={tool}
                onClick={() => setLayoutToolValue(tool)}
              >
                {formatLayoutToolLabel(tool)}
              </button>
            ))}
          </div>
          <div
            className="perspective-surface-grid-workbench-status"
            data-workbench-state={workbenchState}
            data-workbench-selected-object={selectedObject === null ? "" : selectedObjectIndex}
            data-workbench-connection-start={connectionStartIndex ?? ""}
          >
            <span>{formatLayoutToolLabel(layoutTool)}</span>
            <strong>{formatWorkbenchStatus(layoutTool, connectionStartIndex, selectedObject)}</strong>
          </div>
          <div className="perspective-surface-grid-span-summary" aria-label="Scroll span values">
            <span>
              <span>Scroll Span</span>
              <strong>{formatValue(scrollSpan, 1)}</strong>
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
          <div
            className="perspective-surface-grid-randomize-controls"
            data-random-object-count={randomObjectCount}
          >
            <RangeControl
              id="perspective-span-object-density"
              label="Density"
              value={objectDensity}
              min={0}
              max={0.5}
              step={0.01}
              onChange={setObjectDensity}
            />
            <span className="perspective-surface-grid-randomize-count">
              <span>Objects</span>
              <strong>{randomObjectCount}</strong>
            </span>
            <button
              id="perspective-span-randomize-objects"
              type="button"
              onClick={randomizeSpanObjects}
            >
              Randomize
            </button>
            <button
              id="perspective-span-clear-objects"
              type="button"
              onClick={clearSpanObjects}
            >
              Clear
            </button>
          </div>
          <SpanCellPicker
            gridSize={spanGridSize}
            surfacePattern={surfacePattern}
            occupiedCellKeys={occupiedSpanCellKeys}
            connectableCellKeys={connectableSpanCellKeys}
            selectedCellKey={selectedSpanCellKey}
            objectIndexByCellKey={spanCellObjectIndexes}
            layoutTool={layoutTool}
            onSelect={setObjectSpanCell}
          />
          <div className="perspective-surface-grid-placement-object-tools">
            <div className="perspective-surface-grid-object-inspector">
              <ObjectAppearanceControls
                className="perspective-surface-grid-object-appearance-controls"
                legend="Object Shape"
                ariaLabel="Object shape"
                idPrefix="perspective-placement-object"
                appearance={selectedObjectAppearance}
                disabled={selectedObject === null}
                shapeOptionDataAttribute="data-object-shape-option"
                onShapeChange={setObjectShape}
                onColorChange={setObjectColor}
                onRenderModeChange={setObjectRenderMode}
                onDiameterChange={setObjectDiameter}
                onOutlineWidthChange={setObjectOutlineWidth}
                onRotationDegChange={setObjectRotationDeg}
                footer={(
                  <>
                    <RangeControl
                      id="perspective-placement-object-height-y"
                      label="Height Y"
                      value={selectedObject?.heightY ?? 0}
                      min={0}
                      max={20}
                      step={0.1}
                      onChange={setObjectHeightY}
                    />
                    <button
                      className="perspective-surface-grid-remove-object"
                      type="button"
                      disabled={selectedObject === null}
                      onClick={removeSelectedObject}
                    >
                      Remove Selected
                    </button>
                  </>
                )}
              />
            </div>
          </div>
        </div>
        <div
          id="perspective-panel-style"
          className="perspective-surface-grid-panel"
          role="tabpanel"
          aria-labelledby="perspective-tab-style"
          hidden={activeTab !== "style"}
          data-panel-scope="style-defaults"
        >
          <ObjectAppearanceControls
            className="perspective-surface-grid-object-appearance-controls perspective-surface-grid-object-default-controls"
            legend="New Object Defaults"
            ariaLabel="New object defaults"
            idPrefix="perspective-object-default"
            appearance={objectDefaultAppearance}
            shapeOptionDataAttribute="data-object-default-shape-option"
            fieldsetDataAttributes={{
              "data-object-default-shape": objectDefaultAppearance.shape,
              "data-object-default-color": objectDefaultAppearance.color,
            }}
            onShapeChange={setObjectDefaultShape}
            onColorChange={setObjectDefaultColor}
            onRenderModeChange={setObjectDefaultRenderMode}
            onDiameterChange={setObjectDefaultDiameter}
            onOutlineWidthChange={setObjectDefaultOutlineWidth}
            onRotationDegChange={setObjectDefaultRotationDeg}
          />
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
        <div
          id="perspective-panel-export"
          className="perspective-surface-grid-panel"
          role="tabpanel"
          aria-labelledby="perspective-tab-export"
          hidden={activeTab !== "export"}
          data-panel-scope="export-preset"
        >
          <div
            className="perspective-surface-grid-performance-summary"
            data-performance-object-count={objectPlacements.length}
            data-performance-connection-count={objectConnections.length}
            data-performance-trail-stamp-count={trailStampCount}
            data-performance-budget={performanceBudget}
          >
            <span>
              <span>Objects</span>
              <strong>{objectPlacements.length}</strong>
            </span>
            <span>
              <span>Connections</span>
              <strong>{objectConnections.length}</strong>
            </span>
            <span>
              <span>Trail Stamps</span>
              <strong>{trailStampCount}</strong>
            </span>
            <span>
              <span>Budget</span>
              <strong>{performanceBudget.toUpperCase()}</strong>
            </span>
          </div>
          <div className="perspective-surface-grid-preset-actions">
            <button
              id="perspective-save-preset"
              type="button"
              disabled={presetSaveStatus === "saving"}
              onClick={saveCurrentPreset}
            >
              Save Preset
            </button>
            <span data-preset-save-status={presetSaveStatus}>{presetSaveMessage}</span>
          </div>
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
  surfacePattern: PerspectiveSurfaceGridSurfacePattern;
  occupiedCellKeys: Set<string>;
  connectableCellKeys: Set<string>;
  selectedCellKey: string | null;
  objectIndexByCellKey: Map<string, number>;
  layoutTool: LayoutTool;
  onSelect: (cell: PerspectiveSurfaceGridSpanCell) => void;
}

interface ObjectAppearanceControlsProps {
  className: string;
  legend: string;
  ariaLabel: string;
  idPrefix: string;
  appearance: PerspectiveSurfaceGridObjectAppearance;
  disabled?: boolean;
  shapeOptionDataAttribute: string;
  fieldsetDataAttributes?: Record<string, string>;
  footer?: ReactNode;
  onShapeChange: (shape: PerspectiveSurfaceGridObjectShape) => void;
  onColorChange: (color: string) => void;
  onRenderModeChange: (renderMode: PerspectiveSurfaceGridObjectRenderMode) => void;
  onDiameterChange: (diameter: number) => void;
  onOutlineWidthChange: (outlineWidth: number) => void;
  onRotationDegChange: (rotationDeg: number) => void;
}

function ObjectAppearanceControls({
  className,
  legend,
  ariaLabel,
  idPrefix,
  appearance,
  disabled = false,
  shapeOptionDataAttribute,
  fieldsetDataAttributes = {},
  footer,
  onShapeChange,
  onColorChange,
  onRenderModeChange,
  onDiameterChange,
  onOutlineWidthChange,
  onRotationDegChange,
}: ObjectAppearanceControlsProps) {
  return (
    <fieldset className={className} aria-label={ariaLabel} {...fieldsetDataAttributes}>
      <legend>{legend}</legend>
      <div className="perspective-surface-grid-object-shape-options" role="group" aria-label={ariaLabel}>
        {PERSPECTIVE_SURFACE_GRID_OBJECT_SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            aria-pressed={appearance.shape === shape}
            disabled={disabled}
            {...{ [shapeOptionDataAttribute]: shape }}
            onClick={() => onShapeChange(shape)}
          >
            {formatObjectShapeLabel(shape)}
          </button>
        ))}
      </div>
      <div className="perspective-surface-grid-object-render-options" role="group" aria-label={`${ariaLabel} render mode`}>
        {PERSPECTIVE_SURFACE_GRID_OBJECT_RENDER_MODES.map((renderMode) => (
          <button
            key={renderMode}
            type="button"
            aria-pressed={(appearance.renderMode ?? DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.renderMode) === renderMode}
            disabled={disabled}
            data-object-render-mode-option={renderMode}
            onClick={() => onRenderModeChange(renderMode)}
          >
            {formatObjectRenderModeLabel(renderMode)}
          </button>
        ))}
      </div>
      <label className="perspective-surface-grid-color" htmlFor={`${idPrefix}-color`}>
        <span>
          <span>Color</span>
          <strong>{appearance.color}</strong>
        </span>
        <input
          id={`${idPrefix}-color`}
          type="color"
          value={appearance.color}
          disabled={disabled}
          onChange={(event) => onColorChange(event.target.value)}
        />
      </label>
      <RangeControl
        id={`${idPrefix}-diameter`}
        label="Diameter"
        value={appearance.diameter}
        min={0.4}
        max={4.8}
        step={0.01}
        onChange={onDiameterChange}
      />
      <RangeControl
        id={`${idPrefix}-outline-width`}
        label="Outline"
        value={getObjectOutlineWidth(appearance)}
        min={PERSPECTIVE_SURFACE_GRID_OBJECT_MIN_OUTLINE_WIDTH}
        max={PERSPECTIVE_SURFACE_GRID_OBJECT_MAX_OUTLINE_WIDTH}
        step={0.01}
        onChange={onOutlineWidthChange}
      />
      <RangeControl
        id={`${idPrefix}-rotation`}
        label="Rotation"
        value={appearance.rotationDeg}
        min={0}
        max={360}
        step={1}
        onChange={onRotationDegChange}
      />
      {footer}
    </fieldset>
  );
}

function SpanCellPicker({
  gridSize,
  surfacePattern,
  occupiedCellKeys,
  connectableCellKeys,
  selectedCellKey,
  objectIndexByCellKey,
  layoutTool,
  onSelect,
}: SpanCellPickerProps) {
  const isTrianglePicker = surfacePattern === "triangles";
  const normalizedGridSize = normalizeSpanPickerGridSize(gridSize);
  const triangleMapSize = getSpanTriangleMapSize(normalizedGridSize);
  const triangleTiles = isTrianglePicker ? createSpanTrianglePickerTiles(normalizedGridSize) : [];
  const pickerStyle = {
    "--span-grid-columns": normalizedGridSize.columns,
    "--span-cell-gap": "0px",
  } as CSSProperties;
  const triangleMapStyle = {
    width: `${triangleMapSize.width}px`,
    height: `${triangleMapSize.height}px`,
  } as CSSProperties;
  const handleTriangleTileKeyDown = (
    event: KeyboardEvent<SVGPolygonElement>,
    cell: PerspectiveSurfaceGridSpanCell,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    onSelect(cell);
  };

  if (isTrianglePicker) {
    return (
      <div
        className="perspective-surface-grid-span-picker"
        style={pickerStyle}
        role="grid"
        aria-label="Span object placement grid"
        data-layout-tool={layoutTool}
        data-span-picker-pattern={surfacePattern}
      >
        <svg
          className="perspective-surface-grid-span-triangle-map"
          viewBox={`0 0 ${triangleMapSize.width} ${triangleMapSize.height}`}
          style={triangleMapStyle}
          role="presentation"
          aria-hidden="false"
        >
          {triangleTiles.map(({ cell, points }) => {
            const cellKey = getSpanCellKey(cell);
            const hasObject = occupiedCellKeys.has(cellKey);
            const objectIndex = objectIndexByCellKey.get(cellKey);
            const isConnectable = connectableCellKeys.has(cellKey);
            const cellLabel = `Span triangle ${cell.triangle} column ${cell.column + 1} row ${cell.row + 1}`;

            return (
              <polygon
                key={cellKey}
                className="perspective-surface-grid-span-triangle-tile"
                points={points}
                role="button"
                tabIndex={0}
                aria-label={cellLabel}
                aria-pressed={hasObject}
                data-span-cell-column={cell.column}
                data-span-cell-row={cell.row}
                data-span-cell-triangle={cell.triangle}
                data-span-cell-has-object={hasObject}
                data-span-cell-connectable={isConnectable}
                data-span-cell-selected={selectedCellKey === cellKey}
                data-span-cell-object-index={objectIndex ?? ""}
                onClick={() => onSelect(cell)}
                onKeyDown={(event) => handleTriangleTileKeyDown(event, cell)}
              />
            );
          })}
        </svg>
      </div>
    );
  }

  return (
    <div
      className="perspective-surface-grid-span-picker"
      style={pickerStyle}
      role="grid"
      aria-label="Span object placement grid"
      data-layout-tool={layoutTool}
      data-span-picker-pattern={surfacePattern}
    >
      {Array.from({ length: normalizedGridSize.rows }, (_, row) => (
        Array.from({ length: normalizedGridSize.columns }, (_, column) => {
          const cell = { column, row };
          const cellKey = getSpanCellKey(cell);
          const hasObject = occupiedCellKeys.has(cellKey);
          const objectIndex = objectIndexByCellKey.get(cellKey);
          const isConnectable = connectableCellKeys.has(cellKey);

          return (
            <button
              key={cellKey}
              className="perspective-surface-grid-span-cell"
              type="button"
              aria-label={`Span cell column ${column + 1} row ${row + 1}`}
              aria-pressed={hasObject}
              data-span-cell-column={column}
              data-span-cell-row={row}
              data-span-cell-triangle=""
              data-span-cell-has-object={hasObject}
              data-span-cell-connectable={isConnectable}
              data-span-cell-selected={selectedCellKey === cellKey}
              data-span-cell-object-index={objectIndex ?? ""}
              onClick={() => onSelect(cell)}
            />
          );
        })
      ))}
    </div>
  );
}

interface SpanTrianglePickerTile {
  cell: PerspectiveSurfaceGridSpanCell;
  points: string;
}

function normalizeSpanPickerGridSize(gridSize: PerspectiveSurfaceGridSpanGridSize): PerspectiveSurfaceGridSpanGridSize {
  return {
    columns: Math.max(1, Math.round(Number.isFinite(gridSize.columns) ? gridSize.columns : 1)),
    rows: Math.max(1, Math.round(Number.isFinite(gridSize.rows) ? gridSize.rows : 1)),
  };
}

function getSpanTriangleMapSize(gridSize: PerspectiveSurfaceGridSpanGridSize): { width: number; height: number } {
  return {
    width: (gridSize.columns + 0.5) * SPAN_TRIANGLE_TILE_WIDTH,
    height: gridSize.rows * SPAN_TRIANGLE_TILE_HEIGHT,
  };
}

function createSpanTrianglePickerTiles(gridSize: PerspectiveSurfaceGridSpanGridSize): SpanTrianglePickerTile[] {
  return Array.from({ length: gridSize.rows }, (_, row) => (
    Array.from({ length: gridSize.columns }, (_, column) => {
      const x = column * SPAN_TRIANGLE_TILE_WIDTH;
      const y = row * SPAN_TRIANGLE_TILE_HEIGHT;
      const topLeft = { x: x + SPAN_TRIANGLE_TILE_WIDTH / 2, y };
      const topRight = { x: x + SPAN_TRIANGLE_TILE_WIDTH * 1.5, y };
      const bottomRight = { x: x + SPAN_TRIANGLE_TILE_WIDTH, y: y + SPAN_TRIANGLE_TILE_HEIGHT };
      const bottomLeft = { x, y: y + SPAN_TRIANGLE_TILE_HEIGHT };

      return [
        {
          cell: { column, row, triangle: "upper" as const },
          points: formatSpanTrianglePoints([topLeft, topRight, bottomRight]),
        },
        {
          cell: { column, row, triangle: "lower" as const },
          points: formatSpanTrianglePoints([topLeft, bottomRight, bottomLeft]),
        },
      ];
    }).flat()
  )).flat();
}

function formatSpanTrianglePoints(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" ");
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

function copyObjectPlacement(placement: PerspectiveSurfaceGridObjectPlacement): PerspectiveSurfaceGridObjectPlacement {
  return {
    x: placement.x,
    z: placement.z,
    heightY: placement.heightY ?? 0,
    appearance: copyObjectAppearance(placement.appearance),
  };
}

function copyObjectAppearance(appearance: PerspectiveSurfaceGridObjectAppearance): PerspectiveSurfaceGridObjectAppearance {
  return {
    shape: appearance.shape,
    diameter: appearance.diameter,
    outlineWidth: getObjectOutlineWidth(appearance),
    rotationDeg: appearance.rotationDeg,
    color: appearance.color,
    renderMode: appearance.renderMode ?? DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.renderMode,
  };
}

function getObjectOutlineWidth(appearance: PerspectiveSurfaceGridObjectAppearance): number {
  const fallback = DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.outlineWidth
    ?? PERSPECTIVE_SURFACE_GRID_OBJECT_DEFAULT_OUTLINE_WIDTH;
  const outlineWidth = appearance.outlineWidth ?? fallback;

  if (!Number.isFinite(outlineWidth)) return fallback;

  return Math.min(
    PERSPECTIVE_SURFACE_GRID_OBJECT_MAX_OUTLINE_WIDTH,
    Math.max(PERSPECTIVE_SURFACE_GRID_OBJECT_MIN_OUTLINE_WIDTH, outlineWidth),
  );
}

function copyObjectConnection(connection: PerspectiveSurfaceGridObjectConnection): PerspectiveSurfaceGridObjectConnection {
  return {
    fromIndex: connection.fromIndex,
    toIndex: connection.toIndex,
  };
}

function resolvePlacementSpanCell(
  placement: PerspectiveSurfaceGridObjectPlacement,
  gridSize: PerspectiveSurfaceGridSpanGridSize,
  params: PerspectiveSurfaceGridParams,
  surfacePattern: PerspectiveSurfaceGridSurfacePattern,
): PerspectiveSurfaceGridSpanCell {
  if (surfacePattern === "triangles") {
    return resolveSpanTriangleCellFromGroundPoint(placement, gridSize, params);
  }

  return resolveSpanCellFromGroundPoint(placement, gridSize, params);
}

function getSpanCellKey(cell: PerspectiveSurfaceGridSpanCell): string {
  return `${cell.column}:${cell.row}:${cell.triangle ?? "cell"}`;
}

function formatObjectShapeLabel(shape: PerspectiveSurfaceGridObjectShape): string {
  if (shape === "point") return "Point";
  if (shape === "triangle") return "Triangle";
  if (shape === "square") return "Square";

  return "Circle";
}

function formatObjectRenderModeLabel(renderMode: PerspectiveSurfaceGridObjectRenderMode): string {
  if (renderMode === "outline") return "Outline";

  return "Filled";
}

function formatLayoutToolLabel(tool: LayoutTool): string {
  if (tool === "place") return "Place";
  if (tool === "connect") return "Connect";
  if (tool === "erase") return "Erase";

  return "Select";
}

function getWorkbenchState(tool: LayoutTool, connectionStartIndex: number | null): string {
  if (tool === "connect" && connectionStartIndex !== null) return "connect-target";

  return tool;
}

function formatWorkbenchStatus(
  tool: LayoutTool,
  connectionStartIndex: number | null,
  selectedObject: PerspectiveSurfaceGridObjectPlacement | null,
): string {
  if (tool === "connect" && connectionStartIndex !== null) return `#${connectionStartIndex + 1}`;
  if (tool === "erase") return "cells";
  if (tool === "place") return "empty cells";
  if (selectedObject === null) return "none";

  return selectedObject.appearance.shape;
}

function resolvePerformanceBudget({
  objectCount,
  connectionCount,
  trailStampCount,
}: {
  objectCount: number;
  connectionCount: number;
  trailStampCount: number;
}): "ok" | "warn" {
  if (objectCount > 120 || connectionCount > 180 || trailStampCount > 1200) return "warn";

  return "ok";
}

function formatValue(value: number, step: number): string {
  return step < 1 ? value.toFixed(2) : Math.round(value).toString();
}

function getRangePercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;

  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}
