import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Application, Graphics } from "pixi.js";
import {
  DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE,
  PERSPECTIVE_SURFACE_GRID_OBJECT_DEFAULT_OUTLINE_WIDTH,
  PERSPECTIVE_SURFACE_GRID_OBJECT_MAX_OUTLINE_WIDTH,
  PERSPECTIVE_SURFACE_GRID_OBJECT_MIN_OUTLINE_WIDTH,
  PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT,
  buildPerspectiveSurfaceGrid,
  getPerspectiveGridObjectConnectionSegment,
  getPerspectiveGridObjectMarker,
  getPerspectiveGridObjectTrail,
  projectPerspectiveGridObjectSurfaceShape,
  type PerspectiveSurfaceGridObjectAppearance,
  type PerspectiveSurfaceGridObjectConnection,
  type PerspectiveSurfaceGridObjectLightTrailSettings,
  type PerspectiveSurfaceGridObjectPlacement,
  type PerspectiveSurfaceGridParams,
  type PerspectiveSurfaceGridSurfacePattern,
  type ProjectedGroundPoint,
} from "./perspectiveSurfaceGrid";

interface PerspectiveSurfaceGridPixiPreviewProps {
  params: PerspectiveSurfaceGridParams;
  surfacePattern: PerspectiveSurfaceGridSurfacePattern;
  isScrollPaused: boolean;
  objectPlacements: PerspectiveSurfaceGridObjectPlacement[];
  objectConnections: PerspectiveSurfaceGridObjectConnection[];
  objectLightTrail: PerspectiveSurfaceGridObjectLightTrailSettings;
  selectedObjectIndex: number;
  connectionStartIndex: number | null;
  onObjectSelect: (index: number) => void;
}

interface PreviewConfig extends PerspectiveSurfaceGridPixiPreviewProps {}

interface PreviewSize {
  width: number;
  height: number;
}

let unsafeEvalLoadPromise: Promise<void> | null = null;

export function PerspectiveSurfaceGridPixiPreview(props: PerspectiveSurfaceGridPixiPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const configRef = useRef<PreviewConfig>(props);
  const scrollOffsetRef = useRef(0);
  const sizeRef = useRef<PreviewSize>({ width: 1, height: 1 });
  const dirtyRef = useRef(true);

  useEffect(() => {
    configRef.current = props;
    dirtyRef.current = true;
  }, [props]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (host === null || canvas === null) return undefined;

    let app: Application | null = null;
    let surface: Graphics | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;

    const resize = () => {
      const width = Math.max(1, Math.round(host.clientWidth));
      const height = Math.max(1, Math.round(host.clientHeight));
      sizeRef.current = { width, height };
      app?.renderer.resize(width, height);
      dirtyRef.current = true;
    };

    const start = async () => {
      const pixi = await import("pixi.js");
      await loadPixiUnsafeEval();
      if (disposed) return;

      app = new pixi.Application();
      await app.init({
        canvas,
        width: Math.max(1, host.clientWidth),
        height: Math.max(1, host.clientHeight),
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        antialias: true,
        backgroundAlpha: 0,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }

      surface = new pixi.Graphics();
      app.stage.addChild(surface);
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();

      app.ticker.add((ticker) => {
        const config = configRef.current;
        if (!config.isScrollPaused) {
          scrollOffsetRef.current += config.params.scrollSpeed * Math.min(0.05, ticker.deltaMS / 1000);
          dirtyRef.current = true;
        }
        if (!dirtyRef.current || surface === null) return;

        drawPreview(surface, config, sizeRef.current, scrollOffsetRef.current);
        dirtyRef.current = false;
      });
    };

    void start();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      app?.destroy(true, { children: true });
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const rect = canvas.getBoundingClientRect();
    const hitIndex = findHitObjectIndex(
      event.clientX - rect.left,
      event.clientY - rect.top,
      configRef.current,
      sizeRef.current,
      scrollOffsetRef.current,
    );
    if (hitIndex === null) return;

    props.onObjectSelect(hitIndex);
  };

  return (
    <div
      ref={hostRef}
      className="perspective-surface-grid-pixi-preview"
      data-renderer="pixi"
      data-coordinate-model="ground-xz"
      data-surface-pattern={props.surfacePattern}
      data-object-count={props.objectPlacements.length}
      data-object-connection-count={props.objectConnections.length}
      data-light-trail-time={props.objectLightTrail.timeSeconds}
      data-selected-object-index={props.selectedObjectIndex}
      aria-label="Perspective surface Pixi preview"
    >
      <canvas
        ref={canvasRef}
        className="perspective-surface-grid-canvas"
        onPointerDown={handlePointerDown}
      />
    </div>
  );
}

async function loadPixiUnsafeEval(): Promise<void> {
  unsafeEvalLoadPromise ??= import("pixi.js/unsafe-eval")
    .then(() => undefined)
    .catch((error: unknown) => {
      if (isDuplicatePixiEnvironmentHandlerError(error)) return;
      throw error;
    });

  return unsafeEvalLoadPromise;
}

function isDuplicatePixiEnvironmentHandlerError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension type environment already has a handler");
}

function drawPreview(
  surface: Graphics,
  config: PreviewConfig,
  size: PreviewSize,
  scrollOffsetZ: number,
): void {
  const params = {
    ...config.params,
    scrollOffsetZ,
  };
  const grid = buildPerspectiveSurfaceGrid(params);

  surface.clear();
  drawHorizon(surface, params, size);

  if (config.surfacePattern === "triangles") {
    grid.triangles.forEach((triangle, index) => {
      const color = index % 9 === 0 ? 0xffd27c : 0x76dde6;
      drawClosedPolygon(surface, triangle.points, size);
      surface.fill({ color: 0x6ee7e5, alpha: 0.018 });
      surface.stroke({
        width: 1,
        color,
        alpha: getLineOpacity(triangle.averageZ, params.zNear, params.zFar) * 0.62,
        alignment: 0.5,
      });
    });
  } else {
    grid.rows.forEach((row) => {
      strokeProjectedLine(surface, row.points, size, 0xdaf0f1, getLineOpacity(row.z ?? params.zFar, params.zNear, params.zFar), 1);
    });
    grid.columns.forEach((column, index) => {
      strokeProjectedLine(surface, column.points, size, index % 7 === 0 ? 0xffd27c : 0x52d4e6, 0.58, 1.2);
    });
  }

  config.objectConnections.forEach((connection) => {
    const segment = getPerspectiveGridObjectConnectionSegment(connection, config.objectPlacements, params);
    if (segment === null) return;

    strokeProjectedLine(surface, [segment.from, segment.to], size, parseHexColor(segment.color), 0.5, 1.2);
  });

  config.objectPlacements.forEach((placement) => {
    const trail = getPerspectiveGridObjectTrail(placement, params, config.objectLightTrail.timeSeconds);
    const trailPoints = trail.points.slice(0, -1);
    trailPoints.forEach((point, index) => {
      const alpha = getTrailStampOpacity(index, trailPoints.length, config.objectLightTrail.opacity);
      drawObjectShape(surface, point, placement.appearance, params, size, alpha * 0.72);
    });
  });

  config.objectPlacements.forEach((placement, index) => {
    const trail = getPerspectiveGridObjectTrail(placement, params, config.objectLightTrail.timeSeconds);
    const groundMarker = getPerspectiveGridObjectMarker({
      x: placement.x,
      z: placement.z,
      heightY: 0,
    }, params);
    const marker = trail.head;

    strokeProjectedLine(surface, [groundMarker, marker], size, 0xedfffb, (placement.heightY ?? 0) > 0 ? 0.55 : 0, 1);
    drawObjectShape(surface, marker, {
      ...placement.appearance,
      diameter: placement.appearance.diameter * 1.72,
      renderMode: "outline",
    }, params, size, 0.22);
    drawObjectShape(surface, marker, placement.appearance, params, size, 0.92);
    if (index === config.selectedObjectIndex) {
      drawObjectShape(surface, marker, {
        ...placement.appearance,
        color: "#ffe6a6",
        renderMode: "outline",
        outlineWidth: Math.max(getObjectOutlineWidth(placement.appearance), 0.24),
      }, params, size, 0.95);
    }
    if (index === config.connectionStartIndex) {
      drawObjectShape(surface, marker, {
        ...placement.appearance,
        color: "#6ee7e5",
        renderMode: "outline",
        outlineWidth: Math.max(getObjectOutlineWidth(placement.appearance), 0.3),
      }, params, size, 0.9);
    }
  });

  surface.circle(
    toSurfaceX(PERSPECTIVE_SURFACE_GRID_VANISHING_X_PERCENT, size),
    toSurfaceY(params.horizonYPercent, size),
    4,
  );
  surface.fill({ color: 0xffd373, alpha: 0.92 });
}

function drawHorizon(surface: Graphics, params: PerspectiveSurfaceGridParams, size: PreviewSize): void {
  surface.moveTo(toSurfaceX(-8, size), toSurfaceY(params.horizonYPercent, size));
  surface.lineTo(toSurfaceX(108, size), toSurfaceY(params.horizonYPercent, size));
  surface.stroke({ width: 1, color: 0xdcf0f4, alpha: 0.42, alignment: 0.5 });
}

function drawObjectShape(
  surface: Graphics,
  center: ProjectedGroundPoint,
  appearance: PerspectiveSurfaceGridObjectAppearance,
  params: PerspectiveSurfaceGridParams,
  size: PreviewSize,
  alpha: number,
): void {
  if (alpha <= 0) return;

  const surfaceShape = projectPerspectiveGridObjectSurfaceShape(center, appearance, params);
  const color = parseHexColor(appearance.color);
  const renderMode = appearance.renderMode ?? DEFAULT_PERSPECTIVE_SURFACE_GRID_OBJECT_APPEARANCE.renderMode;
  const outlineWidth = getObjectOutlineWidthPixels(appearance);

  if (appearance.shape === "point") {
    surface.circle(
      toSurfaceX(surfaceShape.center.screenXPercent, size),
      toSurfaceY(surfaceShape.center.screenYPercent, size),
      Math.max(1.2, appearance.diameter * surfaceShape.center.scale * 1.4),
    );
    if (renderMode === "outline") {
      surface.stroke({ width: outlineWidth, color, alpha, alignment: 0.5 });
    } else {
      surface.fill({ color, alpha });
    }
    return;
  }

  drawClosedPolygon(surface, surfaceShape.vertices, size);
  if (renderMode === "outline") {
    surface.stroke({ width: outlineWidth, color, alpha, alignment: 0.5 });
  } else {
    surface.fill({ color, alpha: alpha * 0.78 });
    surface.stroke({ width: 1, color, alpha: alpha * 0.62, alignment: 0.5 });
  }
}

function drawClosedPolygon(surface: Graphics, points: ProjectedGroundPoint[], size: PreviewSize): void {
  const first = points[0];
  if (first === undefined) return;

  surface.moveTo(toSurfaceX(first.screenXPercent, size), toSurfaceY(first.screenYPercent, size));
  points.slice(1).forEach((point) => {
    surface.lineTo(toSurfaceX(point.screenXPercent, size), toSurfaceY(point.screenYPercent, size));
  });
  surface.closePath();
}

function strokeProjectedLine(
  surface: Graphics,
  points: ProjectedGroundPoint[],
  size: PreviewSize,
  color: number,
  alpha: number,
  width: number,
): void {
  const first = points[0];
  if (first === undefined || alpha <= 0) return;

  surface.moveTo(toSurfaceX(first.screenXPercent, size), toSurfaceY(first.screenYPercent, size));
  points.slice(1).forEach((point) => {
    surface.lineTo(toSurfaceX(point.screenXPercent, size), toSurfaceY(point.screenYPercent, size));
  });
  surface.stroke({ width, color, alpha, alignment: 0.5 });
}

function findHitObjectIndex(
  screenX: number,
  screenY: number,
  config: PreviewConfig,
  size: PreviewSize,
  scrollOffsetZ: number,
): number | null {
  const params = {
    ...config.params,
    scrollOffsetZ,
  };

  for (let index = config.objectPlacements.length - 1; index >= 0; index -= 1) {
    const placement = config.objectPlacements[index];
    const trail = getPerspectiveGridObjectTrail(placement, params, config.objectLightTrail.timeSeconds);
    const hitAppearance = {
      ...placement.appearance,
      diameter: placement.appearance.diameter * 1.85,
    };
    const shape = projectPerspectiveGridObjectSurfaceShape(trail.head, hitAppearance, params);
    if (isScreenPointInObjectShape(screenX, screenY, shape.vertices, hitAppearance, size)) return index;
  }

  return null;
}

function isScreenPointInObjectShape(
  screenX: number,
  screenY: number,
  vertices: ProjectedGroundPoint[],
  appearance: PerspectiveSurfaceGridObjectAppearance,
  size: PreviewSize,
): boolean {
  const pixelVertices = vertices.map((vertex) => ({
    x: toSurfaceX(vertex.screenXPercent, size),
    y: toSurfaceY(vertex.screenYPercent, size),
  }));
  if (appearance.shape === "point") {
    const center = pixelVertices.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    center.x /= Math.max(1, pixelVertices.length);
    center.y /= Math.max(1, pixelVertices.length);

    return Math.hypot(screenX - center.x, screenY - center.y) <= Math.max(8, appearance.diameter * 4);
  }

  return isPointInPolygon(screenX, screenY, pixelVertices);
}

function isPointInPolygon(
  screenX: number,
  screenY: number,
  vertices: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;

  vertices.forEach((vertex, index) => {
    const previous = vertices[(index + vertices.length - 1) % vertices.length];
    const intersects = ((vertex.y > screenY) !== (previous.y > screenY))
      && (screenX < ((previous.x - vertex.x) * (screenY - vertex.y)) / (previous.y - vertex.y) + vertex.x);
    if (intersects) inside = !inside;
  });

  return inside;
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

function getObjectOutlineWidthPixels(appearance: PerspectiveSurfaceGridObjectAppearance): number {
  return Math.max(0.25, Math.min(6, getObjectOutlineWidth(appearance) * 6.667));
}

function getTrailStampOpacity(index: number, count: number, baseOpacity: number): number {
  if (count <= 0) return 0;

  const factor = (index + 1) / count;
  return baseOpacity * (0.08 + (factor ** 1.35) * 0.72);
}

function getLineOpacity(z: number, zNear: number, zFar: number): number {
  const factor = 1 - Math.min(1, Math.max(0, (z - zNear) / Math.max(1, zFar - zNear)));

  return 0.22 + factor * 0.46;
}

function parseHexColor(value: string): number {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 0xebfffb;

  return Number.parseInt(normalized, 16);
}

function toSurfaceX(percent: number, size: PreviewSize): number {
  return (percent / 100) * size.width;
}

function toSurfaceY(percent: number, size: PreviewSize): number {
  return (percent / 100) * size.height;
}
