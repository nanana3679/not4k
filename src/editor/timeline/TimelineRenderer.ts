/**
 * PixiJS v8 Timeline Renderer — chart-editor.md §Timeline Layout 기준
 *
 * 7 lanes: 4 note lanes (L1~L4) + BPM + time signature + message
 * 14 z-order layers (back to front)
 * Vertical timeline (time flows bottom-to-top)
 */

import { Application, Container, Graphics, TextStyle, FillGradient } from "pixi.js";
import type {
  Chart,
  Beat,
  NoteEntity,
  BpmMarker,
  TimeSignatureMarker,
  ExtraNoteEntity,
} from "../../shared";
import { beatToMs, measureStartBeat, extractBpmMarkers, extractTimeSignatures } from "../../shared";
import {
  TIMELINE_WIDTH,
  DEFAULT_MEASURES,
  TIMELINE_PADDING,
  MINIMAP_WIDTH,
  EXTRA_LANE_WIDTH,
  MEASURE_LABEL_WIDTH,
} from "./constants";
import type { Lane } from "../../shared";
import { MinimapRenderer } from "./MinimapRenderer";
import { GridRenderer } from "./GridRenderer";
import type { GridHost } from "./GridRenderer";
import { NoteRenderer } from "./NoteRenderer";
import type { NoteHost } from "./NoteRenderer";
import { OverlayRenderer } from "./OverlayRenderer";
import type { OverlayHost } from "./OverlayRenderer";
import { destroyChildren } from "./utils";

export interface TimelineRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  onScroll?: (scrollY: number) => void;
}

/**
 * PixiJS v8 Timeline Renderer
 *
 * Manages 14 z-order layers and renders the chart timeline.
 * All positions are in pixels; time flows top-to-bottom.
 */
export class TimelineRenderer {
  private app!: Application;
  private initialized: boolean = false;

  // Layer containers (z-order: back to front)
  private laneBackgrounds!: Container;
  private waveformLayer!: Container;
  private measureLines!: Container;
  private beatLines!: Container;
  private snapLines!: Container;
  private trillZoneLayer!: Container;
  private moveOriginLayer!: Container;
  private longNoteBodyLayer!: Container;
  private longNoteEndLayer!: Container;
  private longNoteHeadLayer!: Container;
  private noteLayer!: Container;
  private selectedLongBodyLayer!: Container;
  private selectedLongEndLayer!: Container;
  private selectedLongHeadLayer!: Container;
  private selectedNoteLayer!: Container;
  private violationLayer!: Container;
  private hoverLayer!: Container;
  private ghostLayer!: Container;
  private boxSelectLayer!: Container;
  private measureLabels!: Container;
  private playbackCursorLayer!: Container;
  private minimapLayer!: Container;

  // Sub-renderers (composition)
  private minimapRenderer!: MinimapRenderer;
  private gridRenderer!: GridRenderer;
  private noteRenderer!: NoteRenderer;
  private overlayRenderer!: OverlayRenderer;

  // State
  private _zoom: number = 200; // pixelPerSecond
  private _scrollY: number = 0;
  private _snap: number = 4; // 1/4 beat snap
  private _selectedNotes: Set<number> = new Set();
  private _moveOrigins: { note: NoteEntity; beat: Beat; endBeat?: Beat; lane: Lane }[] | null = null;
  private _boxSelectRect: { startY: number; startLane: Lane | null; endY: number; endLane: Lane | null; startExtraLane?: number; endExtraLane?: number } | null = null;

  // Extra lane state
  private _extraLaneCount: number = 0;
  private _extraNotes: ExtraNoteEntity[] = [];
  private _selectedExtraNotes: Set<number> = new Set();
  private _hoveredNoteIndex: number | null = null;
  private _hoveredExtraNoteIndex: number | null = null;

  // Last playback cursor time (for re-render on layout change)
  private _lastCursorTimeMs: number = 0;

  // Viewport culling: last scrollY at which full render was performed
  private _lastRenderScrollY: number = 0;

  // Gradient cache
  private bodyGradientCache = new Map<number, FillGradient>();

  // Reusable TextStyle cache (prevents texture leaks from repeated new TextStyle())
  private _measureLabelStyle: TextStyle | null = null;
  private _eventLabelStyle: TextStyle | null = null;

  // Reusable playback cursor Graphics (avoids 60fps destroy/create)
  private _cursorLine: Graphics | null = null;
  private _cursorHandle: Graphics | null = null;

  // Violation overlay state (for paste preview)
  private _violatingNoteIndices: Set<number> = new Set();

  // Chart data
  private chart: Chart | null = null;

  // Waveform data
  private waveformPeaks: Float32Array | null = null;
  private waveformDurationMs: number = 0;

  // BPM/TimeSignature extraction cache
  private _cachedBpmMarkers: BpmMarker[] | null = null;
  private _cachedTimeSignatures: TimeSignatureMarker[] | null = null;
  private _cachedEventsRef: readonly import("../../shared").EventMarker[] | null = null;

  // getTotalTimelineMs cache
  private _cachedTotalTimelineMs: number | null = null;

  private get cachedBpmMarkers(): BpmMarker[] {
    if (!this.chart) return [];
    if (this._cachedEventsRef !== this.chart.events || !this._cachedBpmMarkers) {
      this._cachedBpmMarkers = extractBpmMarkers(this.chart.events);
      this._cachedTimeSignatures = extractTimeSignatures(this.chart.events);
      this._cachedEventsRef = this.chart.events;
    }
    return this._cachedBpmMarkers;
  }

  private get cachedTimeSignatures(): TimeSignatureMarker[] {
    if (!this.chart) return [];
    if (this._cachedEventsRef !== this.chart.events || !this._cachedTimeSignatures) {
      this._cachedBpmMarkers = extractBpmMarkers(this.chart.events);
      this._cachedTimeSignatures = extractTimeSignatures(this.chart.events);
      this._cachedEventsRef = this.chart.events;
    }
    return this._cachedTimeSignatures;
  }

  private options: TimelineRendererOptions;

  constructor(options: TimelineRendererOptions) {
    this.options = options;
  }

  /**
   * Initialize PixiJS Application (v8 API: create then init)
   */
  async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      canvas: this.options.canvas,
      width: this.options.width,
      height: this.options.height,
      backgroundColor: 0x000000,
      antialias: true,
    });

    // Create all layers in z-order
    this.laneBackgrounds = new Container();
    this.waveformLayer = new Container();
    this.measureLines = new Container();
    this.beatLines = new Container();
    this.snapLines = new Container();
    this.trillZoneLayer = new Container();
    this.moveOriginLayer = new Container();
    this.longNoteBodyLayer = new Container();
    this.longNoteEndLayer = new Container();
    this.longNoteHeadLayer = new Container();
    this.noteLayer = new Container();
    this.selectedLongBodyLayer = new Container();
    this.selectedLongEndLayer = new Container();
    this.selectedLongHeadLayer = new Container();
    this.selectedNoteLayer = new Container();
    this.violationLayer = new Container();
    this.hoverLayer = new Container();
    this.ghostLayer = new Container();
    this.boxSelectLayer = new Container();
    this.measureLabels = new Container();
    this.playbackCursorLayer = new Container();

    this.app.stage.addChild(this.laneBackgrounds);
    this.app.stage.addChild(this.waveformLayer);
    this.app.stage.addChild(this.measureLines);
    this.app.stage.addChild(this.beatLines);
    this.app.stage.addChild(this.snapLines);
    this.app.stage.addChild(this.trillZoneLayer);
    this.app.stage.addChild(this.moveOriginLayer);
    this.app.stage.addChild(this.longNoteBodyLayer);
    this.app.stage.addChild(this.longNoteEndLayer);
    this.app.stage.addChild(this.longNoteHeadLayer);
    this.app.stage.addChild(this.noteLayer);
    this.app.stage.addChild(this.selectedLongBodyLayer);
    this.app.stage.addChild(this.selectedLongEndLayer);
    this.app.stage.addChild(this.selectedLongHeadLayer);
    this.app.stage.addChild(this.selectedNoteLayer);
    this.app.stage.addChild(this.violationLayer);
    this.app.stage.addChild(this.hoverLayer);
    this.app.stage.addChild(this.ghostLayer);
    this.app.stage.addChild(this.boxSelectLayer);
    this.app.stage.addChild(this.measureLabels);
    this.app.stage.addChild(this.playbackCursorLayer);

    // Minimap layer (topmost, not affected by scroll)
    this.minimapLayer = new Container();
    this.app.stage.addChild(this.minimapLayer);

    // Build sub-renderers via host interfaces
    this._initSubRenderers();

    this.minimapRenderer.setupEvents();

    this.initialized = true;
  }

  private _initSubRenderers(): void {
    const self = this;

    // MinimapRenderer host
    this.minimapRenderer = new MinimapRenderer({
      get chart() { return self.chart; },
      get options() { return self.options; },
      get scrollY() { return self._scrollY; },
      get totalTimelineHeight() { return self.totalTimelineHeight; },
      get waveformDurationMs() { return self.waveformDurationMs; },
      get zoom() { return self._zoom; },
      get cachedBpmMarkers() { return self.cachedBpmMarkers; },
      get cachedTimeSignatures() { return self.cachedTimeSignatures; },
      getTotalTimelineMs() { return self.getTotalTimelineMs(); },
      timeToY(timeMs: number) { return self.timeToY(timeMs); },
      get minimapLayer() { return self.minimapLayer; },
    });

    // GridRenderer host
    const gridHost: GridHost = {
      get chart() { return self.chart; },
      get zoom() { return self._zoom; },
      get snap() { return self._snap; },
      get extraLaneCount() { return self._extraLaneCount; },
      get currentTimelineWidth() { return self.currentTimelineWidth; },
      get waveformPeaks() { return self.waveformPeaks; },
      get waveformDurationMs() { return self.waveformDurationMs; },
      get cachedBpmMarkers() { return self.cachedBpmMarkers; },
      get cachedTimeSignatures() { return self.cachedTimeSignatures; },
      get measureLabelStyle() { return self._measureLabelStyle; },
      setMeasureLabelStyle(style: TextStyle) { self._measureLabelStyle = style; },
      getVisibleTimeRange() { return self.getVisibleTimeRange(); },
      timeToY(timeMs: number) { return self.timeToY(timeMs); },
      getTotalTimelineMs() { return self.getTotalTimelineMs(); },
      get laneBackgrounds() { return self.laneBackgrounds; },
      get waveformLayer() { return self.waveformLayer; },
      get measureLines() { return self.measureLines; },
      get beatLines() { return self.beatLines; },
      get snapLines() { return self.snapLines; },
      get trillZoneLayer() { return self.trillZoneLayer; },
      get measureLabels() { return self.measureLabels; },
    };
    this.gridRenderer = new GridRenderer(gridHost);

    // NoteRenderer host
    const noteHost: NoteHost = {
      get chart() { return self.chart; },
      get extraNotes() { return self._extraNotes; },
      get selectedNotes() { return self._selectedNotes; },
      get selectedExtraNotes() { return self._selectedExtraNotes; },
      get cachedBpmMarkers() { return self.cachedBpmMarkers; },
      get bodyGradientCache() { return self.bodyGradientCache; },
      getVisibleTimeRange() { return self.getVisibleTimeRange(); },
      timeToY(timeMs: number) { return self.timeToY(timeMs); },
      get longNoteBodyLayer() { return self.longNoteBodyLayer; },
      get longNoteEndLayer() { return self.longNoteEndLayer; },
      get longNoteHeadLayer() { return self.longNoteHeadLayer; },
      get noteLayer() { return self.noteLayer; },
      get selectedLongBodyLayer() { return self.selectedLongBodyLayer; },
      get selectedLongEndLayer() { return self.selectedLongEndLayer; },
      get selectedLongHeadLayer() { return self.selectedLongHeadLayer; },
      get selectedNoteLayer() { return self.selectedNoteLayer; },
    };
    this.noteRenderer = new NoteRenderer(noteHost);

    // OverlayRenderer host
    const overlayHost: OverlayHost = {
      get chart() { return self.chart; },
      get extraNotes() { return self._extraNotes; },
      get violatingNoteIndices() { return self._violatingNoteIndices; },
      get moveOrigins() { return self._moveOrigins; },
      get boxSelectRect() { return self._boxSelectRect; },
      get scrollY() { return self._scrollY; },
      get contentOffsetX() { return self.contentOffsetX; },
      get cachedBpmMarkers() { return self.cachedBpmMarkers; },
      getVisibleTimeRange() { return self.getVisibleTimeRange(); },
      timeToY(timeMs: number) { return self.timeToY(timeMs); },
      get ghostLayer() { return self.ghostLayer; },
      get hoverLayer() { return self.hoverLayer; },
      get violationLayer() { return self.violationLayer; },
      get moveOriginLayer() { return self.moveOriginLayer; },
      get boxSelectLayer() { return self.boxSelectLayer; },
      get noteRenderer() { return self.noteRenderer; },
    };
    this.overlayRenderer = new OverlayRenderer(overlayHost);
  }

  /**
   * Set the chart data to render
   */
  setChart(chart: Chart): void {
    this.chart = chart;
    this._cachedEventsRef = null;
    this._cachedTotalTimelineMs = null;
    this.render();
  }

  /**
   * Set waveform data for audio visualization
   *
   * @param peaks - Pre-computed peak amplitude array (0.0 to 1.0)
   * @param durationMs - Audio duration in milliseconds
   */
  setWaveformData(peaks: Float32Array, durationMs: number): void {
    this.waveformPeaks = peaks;
    this.waveformDurationMs = durationMs;
    this._cachedTotalTimelineMs = null;
    this.render();
  }

  /**
   * Update zoom level (pixelPerSecond)
   */
  set zoom(value: number) {
    this._zoom = value;
    this.render();
  }

  get zoom(): number {
    return this._zoom;
  }

  /**
   * Update scroll position (pixels)
   */
  set scrollY(value: number) {
    this._scrollY = value;
    this.updateScroll();

    const threshold = this.options.height * 0.3;
    if (Math.abs(value - this._lastRenderScrollY) > threshold) {
      this.render();
    } else {
      this.minimapRenderer.updateViewport();
      this.app?.render();
    }
  }

  get scrollY(): number {
    return this._scrollY;
  }

  /**
   * Update snap division (1/N beat)
   */
  set snap(value: number) {
    this._snap = value;
    this.render();
  }

  get snap(): number {
    return this._snap;
  }

  /**
   * Set selected note indices
   */
  setSelectedNotes(indices: Set<number>): void {
    this._selectedNotes = indices;
    this.render();
  }

  /** Set extra lane count */
  setExtraLaneCount(count: number): void {
    this._extraLaneCount = count;
    this.render();
    this.updatePlaybackCursor(this._lastCursorTimeMs);
  }

  get extraLaneCount(): number {
    return this._extraLaneCount;
  }

  /** Set extra notes */
  setExtraNotes(notes: ExtraNoteEntity[]): void {
    this._extraNotes = notes;
    this.render();
  }

  /** Set selected extra note indices */
  setSelectedExtraNotes(indices: Set<number>): void {
    this._selectedExtraNotes = indices;
    this.render();
  }

  /** Set hovered note index (or null to clear) — lightweight overlay update */
  setHoveredNote(index: number | null): void {
    if (this._hoveredNoteIndex === index) return;
    this._hoveredNoteIndex = index;
    this.updateHoverOverlay();
  }

  /** Set hovered extra note index (or null to clear) — lightweight overlay update */
  setHoveredExtraNote(index: number | null): void {
    if (this._hoveredExtraNoteIndex === index) return;
    this._hoveredExtraNoteIndex = index;
    this.updateHoverOverlay();
  }

  /** Dynamic timeline width including extra lanes */
  get currentTimelineWidth(): number {
    return TIMELINE_WIDTH + this._extraLaneCount * EXTRA_LANE_WIDTH;
  }

  /**
   * Set move origin ghost data (shown during note drag move).
   * Pass original note entities with their original positions.
   */
  setMoveOrigins(origins: { note: NoteEntity; beat: Beat; endBeat?: Beat; lane: Lane }[]): void {
    this._moveOrigins = origins;
  }

  /** Clear move origin ghosts */
  clearMoveOrigins(): void {
    this._moveOrigins = null;
  }

  /** Set box select rectangle for visual feedback (pixel Y coords) */
  setBoxSelectRect(rect: { startY: number; startLane: Lane | null; endY: number; endLane: Lane | null; startExtraLane?: number; endExtraLane?: number }): void {
    this._boxSelectRect = rect;
  }

  /** Clear box select rectangle */
  clearBoxSelectRect(): void {
    this._boxSelectRect = null;
    destroyChildren(this.boxSelectLayer);
  }

  /**
   * Content height: total timeline or canvas height, whichever is larger.
   */
  private get contentHeight(): number {
    return Math.max(this.totalTimelineHeight, this.options.height);
  }

  /**
   * Horizontal offset to center the timeline content within the canvas.
   */
  get contentOffsetX(): number {
    const contentWidth = MEASURE_LABEL_WIDTH + this.currentTimelineWidth;
    return Math.max(0, (this.options.width - MINIMAP_WIDTH - contentWidth) / 2)
      + MEASURE_LABEL_WIDTH;
  }

  /**
   * Convert time (ms) to Y pixel position (container-local space).
   * Time flows bottom-to-top: minTime = near bottom (with padding below), later time = higher (lower Y).
   */
  timeToY(timeMs: number): number {
    return this.contentHeight - TIMELINE_PADDING - ((timeMs - this.getMinTimeMs()) * this._zoom) / 1000;
  }

  /**
   * Convert screen Y pixel position to time (ms).
   * Accounts for scroll offset, bottom-to-top layout, and bottom padding.
   */
  yToTime(y: number): number {
    const containerY = y + this._scrollY;
    return ((this.contentHeight - TIMELINE_PADDING - containerY) * 1000) / this._zoom + this.getMinTimeMs();
  }

  /**
   * Calculate total timeline duration in ms based on audio or default measures.
   */
  getTotalTimelineMs(): number {
    if (this._cachedTotalTimelineMs !== null) return this._cachedTotalTimelineMs;
    if (!this.chart) return 0;
    const bpmMarkers = this.cachedBpmMarkers;
    const timeSignatures = this.cachedTimeSignatures;
    const meta = this.chart.meta;
    if (bpmMarkers.length === 0 || timeSignatures.length === 0) return 0;

    let totalMeasures = DEFAULT_MEASURES;

    if (this.waveformDurationMs > 0) {
      // Find the number of measures that covers the audio duration
      for (let m = 1; m <= 10000; m++) {
        const mBeat = measureStartBeat(m, timeSignatures);
        const mMs = beatToMs(mBeat, bpmMarkers, meta.offsetMs);
        if (mMs >= this.waveformDurationMs) {
          totalMeasures = m;
          break;
        }
      }
    }

    const endBeat = measureStartBeat(totalMeasures, timeSignatures);
    const result = beatToMs(endBeat, bpmMarkers, meta.offsetMs);
    this._cachedTotalTimelineMs = result;
    return result;
  }

  /**
   * Clamp a time (ms) to the chart's measure range [measure 0 start, last measure end].
   */
  clampToMeasureRange(timeMs: number): number {
    if (!this.chart) return timeMs;
    const offsetMs = this.chart.meta.offsetMs;
    const measureStartMs = offsetMs; // measure 0 starts at offsetMs
    const measureEndMs = this.getTotalTimelineMs();
    return Math.max(measureStartMs, Math.min(measureEndMs, timeMs));
  }

  /**
   * Minimum time in ms (negative when offset < 0, otherwise 0).
   */
  private getMinTimeMs(): number {
    return Math.min(0, this.chart?.meta.offsetMs ?? 0);
  }

  /**
   * Total timeline height in pixels (for scroll bounds), including padding.
   */
  get totalTimelineHeight(): number {
    return ((this.getTotalTimelineMs() - this.getMinTimeMs()) * this._zoom) / 1000 + TIMELINE_PADDING * 2;
  }

  /**
   * Update scroll position for all layers (except minimap layer which stays fixed)
   */
  private updateScroll(): void {
    const layers = [
      this.laneBackgrounds,
      this.waveformLayer,
      this.measureLines,
      this.beatLines,
      this.snapLines,
      this.trillZoneLayer,
      this.moveOriginLayer,
      this.longNoteBodyLayer,
      this.longNoteEndLayer,
      this.longNoteHeadLayer,
      this.noteLayer,
      this.selectedLongBodyLayer,
      this.selectedLongEndLayer,
      this.selectedLongHeadLayer,
      this.selectedNoteLayer,
      this.violationLayer,
      this.hoverLayer,
      this.ghostLayer,
      this.boxSelectLayer,
      this.measureLabels,
      this.playbackCursorLayer,
    ];

    const offsetX = this.contentOffsetX;
    for (const layer of layers) {
      layer.x = offsetX;
      layer.y = -this._scrollY;
    }
    // minimapLayer is NOT scrolled/offset — stays fixed on screen
  }

  /**
   * Calculate the visible time range (ms) for viewport culling.
   * Returns the min/max time values visible on screen, with margin to prevent
   * pop-in during scrolling.
   */
  private getVisibleTimeRange(): { minTimeMs: number; maxTimeMs: number } {
    const canvasH = this.options.height;
    const margin = canvasH * 0.5; // 50% margin above and below viewport

    const viewTopY = this._scrollY - margin;
    const viewBottomY = this._scrollY + canvasH + margin;

    // Y decreases as time increases (bottom-to-top layout)
    const minTime = this.getMinTimeMs();
    const maxTimeMs = ((this.contentHeight - TIMELINE_PADDING - viewTopY) * 1000) / this._zoom + minTime;
    const minTimeMs = ((this.contentHeight - TIMELINE_PADDING - viewBottomY) * 1000) / this._zoom + minTime;

    return { minTimeMs: Math.max(this.getMinTimeMs(), minTimeMs), maxTimeMs };
  }

  /**
   * Full re-render
   */
  render(): void {
    if (!this.initialized || !this.chart) return;

    this._cachedTotalTimelineMs = null;
    this._lastRenderScrollY = this._scrollY;
    this.clearDynamicLayers();
    this.gridRenderer.renderLaneBackgrounds();
    this.gridRenderer.renderWaveform();
    this.gridRenderer.renderGridLines();
    this.gridRenderer.renderTrillZones();
    this.overlayRenderer.renderMoveOrigins();
    this.overlayRenderer.renderBoxSelectRect();
    this.noteRenderer.beginRender();
    this.noteRenderer.renderNotes();
    this.gridRenderer.renderMarkers(this.noteLayer, this._eventLabelStyle, (style) => { this._eventLabelStyle = style; });
    this.overlayRenderer.renderViolationOverlay();
    this.updateHoverOverlay();
    this.updateScroll();
    this.minimapRenderer.render();
    // Force PixiJS to repaint the canvas
    this.app.render();
  }

  /**
   * Clear all dynamic content layers
   */
  private clearDynamicLayers(): void {
    destroyChildren(this.waveformLayer);
    destroyChildren(this.measureLines);
    destroyChildren(this.beatLines);
    destroyChildren(this.snapLines);
    destroyChildren(this.trillZoneLayer);
    destroyChildren(this.moveOriginLayer);
    // 노트 레이어는 NoteRenderer.beginRender()에서 removeChildren으로 관리
    // (destroy 없이 풀링하여 GC 압력 감소)
    destroyChildren(this.violationLayer);
    destroyChildren(this.hoverLayer);
    destroyChildren(this.boxSelectLayer);
    destroyChildren(this.measureLabels);
  }

  /**
   * Update the playback cursor position. Called from App.tsx on each time update.
   */
  updatePlaybackCursor(timeMs: number): void {
    this._lastCursorTimeMs = timeMs;
    const y = this.timeToY(timeMs);

    // Reuse existing Graphics objects — avoids 60fps destroy/create overhead
    if (!this._cursorLine) {
      this._cursorLine = new Graphics();
      this.playbackCursorLayer.addChild(this._cursorLine);
    }
    if (!this._cursorHandle) {
      this._cursorHandle = new Graphics();
      this.playbackCursorLayer.addChild(this._cursorHandle);
    }

    // Cursor line (bright green, full width)
    this._cursorLine.clear();
    this._cursorLine.moveTo(0, y);
    this._cursorLine.lineTo(this.currentTimelineWidth, y);
    this._cursorLine.stroke({ width: 2, color: 0x00ff88 });

    // Draggable handle (triangle on the right edge, pointing left)
    this._cursorHandle.clear();
    const hx = this.currentTimelineWidth + 16;
    const hs = 8; // half-size of handle
    this._cursorHandle.moveTo(hx, y - hs);
    this._cursorHandle.lineTo(hx - hs * 2, y);
    this._cursorHandle.lineTo(hx, y + hs);
    this._cursorHandle.lineTo(hx, y - hs);
    this._cursorHandle.fill(0x00ff88);
  }

  /**
   * Show a semi-transparent ghost note at the given note lane and time.
   */
  showGhostNote(lane: Lane, timeMs: number): void {
    this.overlayRenderer.showGhostNote(lane, timeMs);
  }

  /**
   * Show a semi-transparent ghost marker in an auxiliary lane.
   * @param auxIndex 0=event
   */
  showGhostMarker(auxIndex: number, timeMs: number): void {
    this.overlayRenderer.showGhostMarker(auxIndex, timeMs);
  }

  /**
   * Show a semi-transparent ghost range (long note body + head + end).
   */
  showGhostRange(lane: Lane, startTimeMs: number, endTimeMs: number): void {
    this.overlayRenderer.showGhostRange(lane, startTimeMs, endTimeMs);
  }

  /** Show ghost note in extra lane */
  showGhostExtraNote(extraLane: number, timeMs: number): void {
    this.overlayRenderer.showGhostExtraNote(extraLane, timeMs);
  }

  /** Show ghost range in extra lane */
  showGhostExtraRange(extraLane: number, startTimeMs: number, endTimeMs: number): void {
    this.overlayRenderer.showGhostExtraRange(extraLane, startTimeMs, endTimeMs);
  }

  /**
   * Hide the ghost note/marker preview.
   */
  hideGhostNote(): void {
    this.overlayRenderer.hideGhostNote();
  }

  /**
   * Draw hover outline in the dedicated hover layer (lightweight, no full re-render).
   */
  private updateHoverOverlay(): void {
    this.overlayRenderer.updateHoverOverlay(this._hoveredNoteIndex, this._hoveredExtraNoteIndex);
  }

  /**
   * Set note indices that violate constraints (shown with red hatching overlay).
   */
  setViolatingNotes(indices: Set<number>): void {
    this._violatingNoteIndices = indices;
    this.overlayRenderer.renderViolationOverlay();
    this.app?.render();
  }

  /**
   * Resize the renderer to new dimensions.
   */
  resize(width: number, height: number): void {
    this.options.width = width;
    this.options.height = height;
    if (this.initialized) {
      this.app.renderer.resize(width, height);
      this.render();
    }
  }

  /**
   * Check if a screen-space point is within the minimap area.
   */
  isInMinimapArea(x: number): boolean {
    return this.minimapRenderer.isInMinimapArea(x);
  }

  /**
   * Handle minimap pointer down. Returns true if the event was consumed.
   */
  handleMinimapPointerDown(x: number, y: number): boolean {
    return this.minimapRenderer.handlePointerDown(x, y);
  }

  /**
   * Handle minimap pointer move. Returns true if dragging.
   */
  handleMinimapPointerMove(_x: number, y: number): boolean {
    return this.minimapRenderer.handlePointerMove(_x, y);
  }

  /**
   * Handle minimap pointer up.
   */
  handleMinimapPointerUp(): void {
    this.minimapRenderer.handlePointerUp();
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (!this.initialized) return;
    this.minimapRenderer.removeEvents();
    this.initialized = false;

    // Destroy app first (destroys all children including Text objects referencing cached styles)
    this.app.destroy(true, { children: true });

    // Then clean up cached resources
    for (const g of this.bodyGradientCache.values()) g.destroy();
    this.bodyGradientCache.clear();

    this._cursorLine = null;
    this._cursorHandle = null;
    this._measureLabelStyle?.destroy();
    this._measureLabelStyle = null;
    this._eventLabelStyle?.destroy();
    this._eventLabelStyle = null;
    // app.destroy가 자식을 이미 파괴했으므로 풀 참조만 정리
    this.noteRenderer.dispose();
    this.minimapRenderer.dispose();
  }
}
