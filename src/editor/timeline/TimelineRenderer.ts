/**
 * PixiJS v8 Timeline Renderer — chart-editor.md §Timeline Layout 기준
 *
 * 7 lanes: 4 note lanes (L1~L4) + BPM + time signature + message
 * 14 z-order layers (back to front)
 * Vertical timeline (time flows bottom-to-top)
 */

import { Application, Container, Graphics, Text, TextStyle, FillGradient } from "pixi.js";
import type {
  Chart,
  Beat,
  NoteEntity,
  PointNote,
  RangeNote,
  BpmMarker,
  TimeSignatureMarker,
  EventMarker,
  ExtraNoteEntity,
} from "../../shared";
import { beatToMs, measureStartBeat, beat, beatAdd, beatMulInt, extractBpmMarkers, extractTimeSignatures, beatEq } from "../../shared";
import {
  LANE_COUNT,
  AUXILIARY_LANES,
  LANE_WIDTH,
  AUX_LANE_WIDTH,
  NOTE_HEIGHT,
  TIMELINE_WIDTH,
  DEFAULT_MEASURES,
  TIMELINE_PADDING,
  COLORS,
  MINIMAP_WIDTH,
  EXTRA_LANE_WIDTH,
  MEASURE_LABEL_WIDTH,
  NOTE_Z_ORDER,
} from "./constants";
import type { Lane } from "../../shared";
import { computeMinimapTrillZoneRects } from "./minimapTrillZone";

/** Container의 자식을 모두 destroy하고 제거 */
function destroyChildren(container: Container): void {
  for (const child of container.children) {
    child.destroy();
  }
  container.removeChildren();
}

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

  // Minimap drag state
  private minimapDragging: boolean = false;
  private minimapDragStartY: number = 0;
  private minimapDragStartScroll: number = 0;
  private boundMinimapPointerUp = () => this.handleMinimapPointerUp();

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
  private _timeLabelStyle: TextStyle | null = null;
  private _endTimeLabelStyle: TextStyle | null = null;

  // Reusable playback cursor Graphics (avoids 60fps destroy/create)
  private _cursorLine: Graphics | null = null;
  private _cursorHandle: Graphics | null = null;

  // Reusable minimap viewport indicator (avoids 60fps destroy/create on scroll)
  private _minimapViewport: Graphics | null = null;

  // Violation overlay state (for paste preview)
  private _violatingNoteIndices: Set<number> = new Set();

  // Chart data
  private chart: Chart | null = null;

  // Waveform data
  private waveformPeaks: Float32Array | null = null;
  private waveformDurationMs: number = 0;
  private _waveformMaxPeak: number = 0;

  // BPM/TimeSignature extraction cache
  private _cachedBpmMarkers: BpmMarker[] | null = null;
  private _cachedTimeSignatures: TimeSignatureMarker[] | null = null;
  private _cachedEventsRef: readonly EventMarker[] | null = null;

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

    // Minimap pointer events
    this.setupMinimapEvents();

    this.initialized = true;
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
    // Cache max peak for waveform normalization (avoids full scan every render)
    let maxPeak = 0;
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i] > maxPeak) maxPeak = peaks[i];
    }
    this._waveformMaxPeak = maxPeak;
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
      this.updateMinimapViewport();
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
   * Render lane backgrounds with height matching the total timeline.
   */
  private renderLaneBackgrounds(): void {
    destroyChildren(this.laneBackgrounds);

    const totalTimeMs = this.getTotalTimelineMs();
    const beat0Ms = this.chart ? this.chart.meta.offsetMs : 0;
    const topY = this.timeToY(totalTimeMs);
    const bottomY = this.timeToY(beat0Ms);
    const laneHeight = bottomY - topY;

    // Note lanes (L1~L4)
    for (let i = 0; i < LANE_COUNT; i++) {
      const bg = new Graphics();
      const color = i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
      bg.rect(i * LANE_WIDTH, topY, LANE_WIDTH, laneHeight);
      bg.fill(color);
      this.laneBackgrounds.addChild(bg);
    }

    // Auxiliary lanes (event only)
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    for (let i = 0; i < AUXILIARY_LANES; i++) {
      const bg = new Graphics();
      bg.rect(auxStartX + i * AUX_LANE_WIDTH, topY, AUX_LANE_WIDTH, laneHeight);
      bg.fill(COLORS.AUX_LANE_BG);
      this.laneBackgrounds.addChild(bg);
    }

    // Extra lanes (editor-only, right of event lane)
    const extraStartX = TIMELINE_WIDTH;
    for (let i = 0; i < this._extraLaneCount; i++) {
      const bg = new Graphics();
      const color = i % 2 === 0 ? COLORS.EXTRA_LANE_BG_EVEN : COLORS.EXTRA_LANE_BG_ODD;
      bg.rect(extraStartX + i * EXTRA_LANE_WIDTH, topY, EXTRA_LANE_WIDTH, laneHeight);
      bg.fill(color);
      this.laneBackgrounds.addChild(bg);
    }
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
    this.renderLaneBackgrounds();
    this.renderWaveform();
    this.renderGridLines();
    this.renderTrillZones();
    this.renderMoveOrigins();
    this.renderBoxSelectRect();
    this.renderNotes();
    this.renderMarkers();
    this.renderViolationOverlay();
    this.updateHoverOverlay();
    this.updateScroll();
    this.renderMinimap();
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
    destroyChildren(this.longNoteBodyLayer);
    destroyChildren(this.longNoteEndLayer);
    destroyChildren(this.longNoteHeadLayer);
    destroyChildren(this.noteLayer);
    destroyChildren(this.selectedLongBodyLayer);
    destroyChildren(this.selectedLongEndLayer);
    destroyChildren(this.selectedLongHeadLayer);
    destroyChildren(this.selectedNoteLayer);
    destroyChildren(this.violationLayer);
    destroyChildren(this.hoverLayer);
    destroyChildren(this.boxSelectLayer);
    destroyChildren(this.measureLabels);
  }

  /**
   * Render audio waveform visualization
   */
  private renderWaveform(): void {
    if (!this.waveformPeaks || this.waveformDurationMs === 0) return;

    const laneAreaWidth = LANE_COUNT * LANE_WIDTH;
    const centerX = laneAreaWidth / 2;

    const peaks = this.waveformPeaks;
    const peakCount = peaks.length;

    const scale = this._waveformMaxPeak > 0 ? 1 / this._waveformMaxPeak : 1;

    const msPerPeak = this.waveformDurationMs / peakCount;

    // Viewport culling: only draw peaks within visible range
    const { minTimeMs, maxTimeMs } = this.getVisibleTimeRange();
    const startIdx = Math.max(0, Math.floor(minTimeMs / msPerPeak) - 1);
    const endIdx = Math.min(peakCount - 1, Math.ceil(maxTimeMs / msPerPeak) + 1);
    if (startIdx > endIdx) return;

    const waveform = new Graphics();

    waveform.moveTo(centerX, this.timeToY(startIdx * msPerPeak));

    // Draw upper half (positive peaks)
    for (let i = startIdx; i <= endIdx; i++) {
      const timeMs = i * msPerPeak;
      const y = this.timeToY(timeMs);
      const normalized = peaks[i] * scale;
      const x = centerX + (normalized * laneAreaWidth) / 2;
      waveform.lineTo(x, y);
    }

    // Draw lower half (negative peaks) - go back in reverse
    for (let i = endIdx; i >= startIdx; i--) {
      const timeMs = i * msPerPeak;
      const y = this.timeToY(timeMs);
      const normalized = peaks[i] * scale;
      const x = centerX - (normalized * laneAreaWidth) / 2;
      waveform.lineTo(x, y);
    }

    waveform.lineTo(centerX, this.timeToY(startIdx * msPerPeak));

    waveform.fill({ color: 0x0078ff, alpha: 0.3 });

    this.waveformLayer.addChild(waveform);
  }

  /**
   * Render grid lines (measure, beat, snap).
   * Iterates measure by measure, respecting variable time signatures and BPMs.
   */
  private renderGridLines(): void {
    if (!this.chart) return;

    const bpmMarkers = this.cachedBpmMarkers;
    const timeSignatures = this.cachedTimeSignatures;
    const meta = this.chart.meta;
    if (bpmMarkers.length === 0 || timeSignatures.length === 0) return;

    const totalTimelineMs = this.getTotalTimelineMs();
    const sortedTS = [...timeSignatures].sort((a, b) => a.measure - b.measure);
    const { minTimeMs, maxTimeMs } = this.getVisibleTimeRange();

    if (!this._measureLabelStyle) {
      this._measureLabelStyle = new TextStyle({
        fontSize: 11,
        fill: 0x999999,
        fontFamily: "monospace",
      });
    }
    const measureLabelStyle = this._measureLabelStyle;

    for (let m = 0; ; m++) {
      const mStartBeat = measureStartBeat(m, timeSignatures);
      const mStartMs = beatToMs(mStartBeat, bpmMarkers, meta.offsetMs);
      if (mStartMs > totalTimelineMs || mStartMs > maxTimeMs) break;

      // Skip measures entirely before viewport
      const nextMStartBeat = measureStartBeat(m + 1, timeSignatures);
      const nextMStartMs = beatToMs(nextMStartBeat, bpmMarkers, meta.offsetMs);
      if (nextMStartMs < minTimeMs) continue;

      const y = this.timeToY(mStartMs);

      // Measure line
      const line = new Graphics();
      line.moveTo(0, y);
      line.lineTo(this.currentTimelineWidth, y);
      line.stroke({ width: 2, color: COLORS.MEASURE_LINE });
      this.measureLines.addChild(line);

      // Measure number label (left side)
      const label = new Text({
        text: String(m + 1),
        style: measureLabelStyle,
      });
      label.anchor.set(1, 0);
      label.x = -4;
      label.y = y - 14;
      this.measureLabels.addChild(label);

      // Active beatPerMeasure for this measure
      let bpm = sortedTS[0].beatPerMeasure;
      for (const ts of sortedTS) {
        if (ts.measure <= m) bpm = ts.beatPerMeasure;
        else break;
      }

      // Each subdivision = 1/bpm.d beats; there are bpm.n subdivisions per measure
      const subdivBeat = beat(1, bpm.d);

      // Beat lines (skip the first = measure line)
      for (let b = 1; b < bpm.n; b++) {
        const bBeat = beatAdd(mStartBeat, beatMulInt(subdivBeat, b));
        const bMs = beatToMs(bBeat, bpmMarkers, meta.offsetMs);
        if (bMs > totalTimelineMs) break;

        const bY = this.timeToY(bMs);
        const beatLine = new Graphics();
        beatLine.moveTo(0, bY);
        beatLine.lineTo(this.currentTimelineWidth, bY);
        beatLine.stroke({ width: 1, color: COLORS.BEAT_LINE });
        this.beatLines.addChild(beatLine);
      }

      // Snap lines within this measure (snap N = N-th note, grid = 4/N beats)
      // Total snap positions in this measure
      const measureBeats = bpm.n / bpm.d;
      const gridBeats = 4 / this._snap;
      const snapCount = Math.round(measureBeats / gridBeats);

      for (let s = 1; s < snapCount; s++) {
        // Skip if this position coincides with a beat line
        if ((s * 4 * bpm.d) % this._snap === 0) continue;

        const snapBeatVal = beatAdd(mStartBeat, beat(s * 4, this._snap));
        const snapMs = beatToMs(snapBeatVal, bpmMarkers, meta.offsetMs);
        if (snapMs > totalTimelineMs) break;

        const snapY = this.timeToY(snapMs);
        const snapLine = new Graphics();
        snapLine.moveTo(0, snapY);
        snapLine.lineTo(this.currentTimelineWidth, snapY);
        snapLine.stroke({ width: 1, color: COLORS.SNAP_LINE, alpha: 0.3 });
        this.snapLines.addChild(snapLine);
      }
    }

    // End-of-audio marker line
    if (this.waveformDurationMs > 0 && this.waveformDurationMs >= minTimeMs && this.waveformDurationMs <= maxTimeMs) {
      const endY = this.timeToY(this.waveformDurationMs);
      const endLine = new Graphics();
      endLine.moveTo(0, endY);
      endLine.lineTo(this.currentTimelineWidth, endY);
      endLine.stroke({ width: 1, color: 0x66aaff, alpha: 0.5 });
      this.measureLines.addChild(endLine);
    }
  }

  /**
   * Render trill zones
   */
  private renderTrillZones(): void {
    if (!this.chart) return;

    const { trillZones, meta } = this.chart;
    const bpmMarkers = this.cachedBpmMarkers;
    const { minTimeMs, maxTimeMs } = this.getVisibleTimeRange();

    for (const zone of trillZones) {
      const startMs = beatToMs(zone.beat, bpmMarkers, meta.offsetMs);
      const endMs = beatToMs(zone.endBeat, bpmMarkers, meta.offsetMs);

      // Viewport culling
      const lo = Math.min(startMs, endMs);
      const hi = Math.max(startMs, endMs);
      if (hi < minTimeMs || lo > maxTimeMs) continue;
      const startY = this.timeToY(startMs);
      const endY = this.timeToY(endMs);

      const x = (zone.lane - 1) * LANE_WIDTH;
      const width = LANE_WIDTH;
      const topY = Math.min(startY, endY);
      const rawHeight = Math.abs(endY - startY);
      const height = rawHeight > 0 ? rawHeight : NOTE_HEIGHT;
      const adjustedTopY = rawHeight > 0 ? topY : topY - NOTE_HEIGHT / 2;

      const bg = new Graphics();
      bg.rect(x, adjustedTopY, width, height);
      bg.fill({ color: COLORS.TRILL_ZONE, alpha: COLORS.TRILL_ZONE_ALPHA });
      this.trillZoneLayer.addChild(bg);
    }
  }

  /**
   * Render semi-transparent ghosts at the original positions of notes being moved.
   */
  private renderMoveOrigins(): void {
    if (!this._moveOrigins || !this.chart) return;

    const bpmMarkers = this.cachedBpmMarkers;
    const meta = this.chart.meta;
    const ORIGIN_ALPHA = 0.3;
    const { minTimeMs, maxTimeMs } = this.getVisibleTimeRange();

    for (const origin of this._moveOrigins) {
      const { note, beat: origBeat, endBeat: origEndBeat, lane } = origin;
      const x = (lane - 1) * LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;

      if (!origEndBeat) {
        // Point note ghost
        const timeMs = beatToMs(origBeat, bpmMarkers, meta.offsetMs);
        if (timeMs < minTimeMs || timeMs > maxTimeMs) continue;
        const y = this.timeToY(timeMs);

        let color: number;
        switch (note.type) {
          case "single": color = COLORS.SINGLE_NOTE; break;
          case "double": color = COLORS.DOUBLE_NOTE; break;
          case "trill": color = COLORS.TRILL_NOTE; break;
          default: color = COLORS.SINGLE_NOTE;
        }

        const gfx = new Graphics();
        if (note.type === "trill") {
          const cx = x + LANE_WIDTH / 2;
          gfx.moveTo(cx, y - h / 2);
          gfx.lineTo(cx + w / 2, y);
          gfx.lineTo(cx, y + h / 2);
          gfx.lineTo(cx - w / 2, y);
          gfx.lineTo(cx, y - h / 2);
        } else {
          const rectX = x + (LANE_WIDTH - w) / 2;
          gfx.rect(rectX, y - h / 2, w, h);
        }
        gfx.fill({ color, alpha: ORIGIN_ALPHA });
        this.moveOriginLayer.addChild(gfx);
      } else {
        // Range note ghost
        const startMs = beatToMs(origBeat, bpmMarkers, meta.offsetMs);
        const endMs = beatToMs(origEndBeat, bpmMarkers, meta.offsetMs);
        const lo = Math.min(startMs, endMs);
        const hi = Math.max(startMs, endMs);
        if (hi < minTimeMs || lo > maxTimeMs) continue;
        const startY = this.timeToY(startMs);
        const endY = this.timeToY(endMs);

        let bodyColor: number;
        switch (note.type) {
          case "long": bodyColor = COLORS.SINGLE_LONG; break;
          case "doubleLong": bodyColor = COLORS.DOUBLE_LONG; break;
          case "trillLong": bodyColor = COLORS.TRILL_LONG; break;
          default: bodyColor = COLORS.SINGLE_LONG;
        }

        // Body
        const topY = Math.min(startY, endY);
        const bottomY = Math.max(startY, endY);
        const bodyTopY = topY + h / 2;
        const bodyBottomY = bottomY - h / 2;
        const bodyHeight = bodyBottomY - bodyTopY;

        if (bodyHeight > 0) {
          const body = new Graphics();
          body.rect(x + (LANE_WIDTH - w) / 2, bodyTopY, w, bodyHeight);
          body.fill({ color: bodyColor, alpha: ORIGIN_ALPHA });
          this.moveOriginLayer.addChild(body);
        }

        // End
        const end = new Graphics();
        const endX = x + (LANE_WIDTH - w) / 2;
        end.rect(endX, endY - h / 2, w, h);
        end.fill({ color: bodyColor, alpha: ORIGIN_ALPHA * 0.5 });
        this.moveOriginLayer.addChild(end);
      }
    }
  }

  /**
   * Render box select rectangle overlay.
   */
  private renderBoxSelectRect(): void {
    destroyChildren(this.boxSelectLayer);
    if (!this._boxSelectRect || !this.chart) return;

    const { startY, startLane, endY, endLane, startExtraLane, endExtraLane } = this._boxSelectRect;

    // startY/endY are screen pixel coords; convert to world coords by adding scroll offset
    const y1 = startY + this._scrollY;
    const y2 = endY + this._scrollY;
    const topY = Math.min(y1, y2);
    const height = Math.max(y1, y2) - topY;

    // Compute x range: combine main lanes and extra lanes into one continuous rect
    let x1 = Infinity;
    let x2 = -Infinity;

    if (startLane !== null || endLane !== null) {
      const effectiveStart = startLane ?? endLane!;
      const effectiveEnd = endLane ?? startLane!;
      const minLane = Math.min(effectiveStart, effectiveEnd);
      const maxLane = Math.max(effectiveStart, effectiveEnd);
      x1 = Math.min(x1, (minLane - 1) * LANE_WIDTH);
      x2 = Math.max(x2, maxLane * LANE_WIDTH);
    }

    if (startExtraLane !== undefined || endExtraLane !== undefined) {
      const effectiveStart = startExtraLane ?? endExtraLane!;
      const effectiveEnd = endExtraLane ?? startExtraLane!;
      const minExtra = Math.min(effectiveStart, effectiveEnd);
      const maxExtra = Math.max(effectiveStart, effectiveEnd);
      const extraStartX = TIMELINE_WIDTH;
      x1 = Math.min(x1, extraStartX + (minExtra - 1) * EXTRA_LANE_WIDTH);
      x2 = Math.max(x2, extraStartX + maxExtra * EXTRA_LANE_WIDTH);
    }

    // When crossing from main to extra, fill the gap (aux lane area)
    if ((startLane !== null || endLane !== null) && (startExtraLane !== undefined || endExtraLane !== undefined)) {
      x1 = Math.min(x1, x1); // already covered
      x2 = Math.max(x2, x2); // already covered
    }

    if (x1 >= x2) return;

    const gfx = new Graphics();
    gfx.rect(x1, topY, x2 - x1, height);
    gfx.fill({ color: COLORS.BOX_SELECT_FILL, alpha: COLORS.BOX_SELECT_FILL_ALPHA });
    gfx.stroke({ width: COLORS.BOX_SELECT_STROKE_WIDTH, color: COLORS.BOX_SELECT_STROKE, alpha: COLORS.BOX_SELECT_STROKE_ALPHA });
    this.boxSelectLayer.addChild(gfx);
  }

  /**
   * Render notes (point and range notes)
   */
  private renderNotes(): void {
    if (!this.chart) return;

    const { notes } = this.chart;
    const { minTimeMs, maxTimeMs } = this.getVisibleTimeRange();
    const bpmMarkers = this.cachedBpmMarkers;
    const meta = this.chart.meta;

    // NOTE_Z_ORDER 기준으로 정렬 (낮은 값이 먼저 렌더 = 뒤에 배치)
    const sortedIndices = notes.map((_, i) => i).sort((a, b) =>
      (NOTE_Z_ORDER[notes[a].type] ?? 0) - (NOTE_Z_ORDER[notes[b].type] ?? 0)
    );

    for (const index of sortedIndices) {
      const note = notes[index];
      // Viewport culling
      const noteStartMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      if (this.isPointNote(note)) {
        if (noteStartMs < minTimeMs || noteStartMs > maxTimeMs) continue;
      } else {
        const noteEndMs = beatToMs((note as RangeNote).endBeat, bpmMarkers, meta.offsetMs);
        const lo = Math.min(noteStartMs, noteEndMs);
        const hi = Math.max(noteStartMs, noteEndMs);
        if (hi < minTimeMs || lo > maxTimeMs) continue;
      }

      const isSelected = this._selectedNotes.has(index);

      if (this.isPointNote(note)) {
        this.renderPointNote(note, isSelected);
      } else {
        this.renderRangeNote(note, isSelected);
      }
    }

    // Render extra notes
    this.renderExtraNotes();
  }

  /**
   * Type guard for PointNote
   */
  private isPointNote(note: NoteEntity): note is PointNote {
    return "type" in note && !("endBeat" in note);
  }

  /** RangeNote의 같은 beat/lane에 매칭되는 헤드 PointNote가 있는지 확인 */
  private hasMatchingHead(note: RangeNote): boolean {
    if (!this.chart) return false;
    for (const n of this.chart.notes) {
      if ("endBeat" in n) continue;
      if (n.lane === note.lane && beatEq(n.beat, note.beat)) return true;
    }
    return false;
  }

  /**
   * Render a point note (single, double, trill)
   */
  private renderPointNote(note: PointNote, isSelected: boolean): void {
    if (!this.chart) return;

    const bpmMarkers = this.cachedBpmMarkers;
    const meta = this.chart.meta;
    const timeMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
    const y = this.timeToY(timeMs);
    const x = (note.lane - 1) * LANE_WIDTH;

    let color: number;
    let shape: "rect" | "diamond" = "rect";

    switch (note.type) {
      case "single":
        color = COLORS.SINGLE_NOTE;
        break;
      case "double":
        color = COLORS.DOUBLE_NOTE;
        break;
      case "trill":
        color = COLORS.TRILL_NOTE;
        shape = "diamond";
        break;
    }

    const noteGfx = new Graphics();

    if (shape === "diamond") {
      // Diamond inscribed in rectangle (1:5 height:width ratio)
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const cx = x + LANE_WIDTH / 2;
      const cy = y;

      noteGfx.moveTo(cx, cy - h / 2);
      noteGfx.lineTo(cx + w / 2, cy);
      noteGfx.lineTo(cx, cy + h / 2);
      noteGfx.lineTo(cx - w / 2, cy);
      noteGfx.lineTo(cx, cy - h / 2);
      noteGfx.fill(color);
    } else {
      // Rectangle (1:5 height:width ratio, center-aligned)
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const rectX = x + (LANE_WIDTH - w) / 2;
      const rectY = y - h / 2;

      noteGfx.rect(rectX, rectY, w, h);
      noteGfx.fill(color);
    }

    if (isSelected) {
      noteGfx.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.selectedNoteLayer.addChild(noteGfx);
    } else {
      this.noteLayer.addChild(noteGfx);
    }
  }

  /**
   * Render a range note (long note body)
   */
  private getBodyGradient(color: number): FillGradient {
    let gradient = this.bodyGradientCache.get(color);
    if (!gradient) {
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      // Edge: 70% toward white (lighter, opaque)
      const lr = Math.round(r + (255 - r) * 0.7);
      const lg = Math.round(g + (255 - g) * 0.7);
      const lb = Math.round(b + (255 - b) * 0.7);
      gradient = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 },
        colorStops: [
          { offset: 0, color: `rgb(${lr},${lg},${lb})` },
          { offset: 0.5, color: `rgb(${r},${g},${b})` },
          { offset: 1, color: `rgb(${lr},${lg},${lb})` },
        ],
        textureSpace: 'local',
      });
      this.bodyGradientCache.set(color, gradient);
    }
    return gradient;
  }

  private renderRangeNote(note: RangeNote, isSelected: boolean): void {
    if (!this.chart) return;

    const bpmMarkers = this.cachedBpmMarkers;
    const meta = this.chart.meta;
    const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
    const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
    const startY = this.timeToY(startMs);
    const endY = this.timeToY(endMs);

    const x = (note.lane - 1) * LANE_WIDTH;
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;

    let bodyColor: number;

    switch (note.type) {
      case "long":
        bodyColor = COLORS.SINGLE_LONG;
        break;
      case "doubleLong":
        bodyColor = COLORS.DOUBLE_LONG;
        break;
      case "trillLong":
        bodyColor = COLORS.TRILL_LONG;
        break;
    }

    // Long note body (center strip between head and end, direction-independent)
    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);
    const hasHead = this.hasMatchingHead(note);
    const bodyTopY = topY + h / 2;
    const bodyBottomY = hasHead ? (bottomY - h / 2) : bottomY;
    const bodyHeight = bodyBottomY - bodyTopY;

    if (bodyHeight > 0) {
      const body = new Graphics();
      const bodyX = x + (LANE_WIDTH - w) / 2;
      const bodyGradient = this.getBodyGradient(bodyColor);
      if (note.type === "trillLong") {
        // Extend body rect by half diamond height into each endpoint
        const extTop = h / 2;
        const extBottom = hasHead ? h / 2 : 0;
        body.rect(bodyX, bodyTopY - extTop, w, bodyHeight + extTop + extBottom);
      } else {
        body.rect(bodyX, bodyTopY, w, bodyHeight);
      }
      body.fill(bodyGradient);

      if (isSelected) {
        body.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
        this.selectedLongBodyLayer.addChild(body);
      } else {
        this.longNoteBodyLayer.addChild(body);
      }
    }

    // Long note end (end point) — 50% alpha + horizontal gradient
    const headGradient = this.getBodyGradient(bodyColor);
    const end = new Graphics();
    if (note.type === "trillLong") {
      const cx = x + LANE_WIDTH / 2;
      end.moveTo(cx, endY - h / 2);
      end.lineTo(cx + w / 2, endY);
      end.lineTo(cx, endY + h / 2);
      end.lineTo(cx - w / 2, endY);
      end.lineTo(cx, endY - h / 2);
      end.fill(0x888888);
    } else {
      const endX = x + (LANE_WIDTH - w) / 2;
      const endNoteY = endY - h / 2;
      end.rect(endX, endNoteY, w, h);
      end.fill({ fill: headGradient, alpha: 0.5 });
    }

    if (isSelected) {
      end.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.selectedLongEndLayer.addChild(end);
    } else {
      this.longNoteEndLayer.addChild(end);
    }

    // 헤드리스 롱노트: 시작 지점에 불투명 캡 표시
    if (!hasHead) {
      const startCap = new Graphics();
      if (note.type === "trillLong") {
        const cx = x + LANE_WIDTH / 2;
        startCap.moveTo(cx, startY - h / 2);
        startCap.lineTo(cx + w / 2, startY);
        startCap.lineTo(cx, startY + h / 2);
        startCap.lineTo(cx - w / 2, startY);
        startCap.lineTo(cx, startY - h / 2);
        startCap.fill(headGradient);
      } else {
        const capX = x + (LANE_WIDTH - w) / 2;
        startCap.rect(capX, startY - h / 2, w, h);
        startCap.fill(headGradient);
      }
      if (isSelected) {
        startCap.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
        this.selectedLongHeadLayer.addChild(startCap);
      } else {
        this.longNoteHeadLayer.addChild(startCap);
      }
    }
  }

  /**
   * Render extra lane notes (editor-only).
   */
  private renderExtraNotes(): void {
    if (!this.chart || this._extraLaneCount === 0) return;

    const bpmMarkers = this.cachedBpmMarkers;
    const meta = this.chart.meta;
    const extraStartX = TIMELINE_WIDTH;
    const { minTimeMs, maxTimeMs } = this.getVisibleTimeRange();

    this._extraNotes.forEach((note, index) => {
      // Viewport culling
      const noteStartMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      if ("endBeat" in note) {
        const noteEndMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const lo = Math.min(noteStartMs, noteEndMs);
        const hi = Math.max(noteStartMs, noteEndMs);
        if (hi < minTimeMs || lo > maxTimeMs) return;
      } else {
        if (noteStartMs < minTimeMs || noteStartMs > maxTimeMs) return;
      }

      const isSelected = this._selectedExtraNotes.has(index);
      const x = extraStartX + (note.extraLane - 1) * EXTRA_LANE_WIDTH;

      if ("endBeat" in note) {
        this.renderRangeNoteAt(x, EXTRA_LANE_WIDTH, note.beat, note.endBeat, note.type, isSelected, bpmMarkers, meta);
      } else {
        this.renderPointNoteAt(x, EXTRA_LANE_WIDTH, note.beat, note.type, isSelected, bpmMarkers, meta);
      }
    });
  }

  /** Render a point note at a specific X position (shared by normal and extra notes) */
  private renderPointNoteAt(
    x: number, laneWidth: number, noteBeat: Beat, noteType: string,
    isSelected: boolean, bpmMarkers: BpmMarker[], meta: { offsetMs: number },
  ): void {
    const timeMs = beatToMs(noteBeat, bpmMarkers, meta.offsetMs);
    const y = this.timeToY(timeMs);
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;

    let color: number;
    let shape: "rect" | "diamond" = "rect";
    switch (noteType) {
      case "single": color = COLORS.SINGLE_NOTE; break;
      case "double": color = COLORS.DOUBLE_NOTE; break;
      case "trill": color = COLORS.TRILL_NOTE; shape = "diamond"; break;
      default: color = COLORS.SINGLE_NOTE;
    }

    const noteGfx = new Graphics();
    if (shape === "diamond") {
      const cx = x + laneWidth / 2;
      noteGfx.moveTo(cx, y - h / 2);
      noteGfx.lineTo(cx + w / 2, y);
      noteGfx.lineTo(cx, y + h / 2);
      noteGfx.lineTo(cx - w / 2, y);
      noteGfx.lineTo(cx, y - h / 2);
      noteGfx.fill(color);
    } else {
      const rectX = x + (laneWidth - w) / 2;
      noteGfx.rect(rectX, y - h / 2, w, h);
      noteGfx.fill(color);
    }

    if (isSelected) {
      noteGfx.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.selectedNoteLayer.addChild(noteGfx);
    } else {
      this.noteLayer.addChild(noteGfx);
    }
  }

  /** Render a range note at a specific X position (shared by normal and extra notes) */
  private renderRangeNoteAt(
    x: number, laneWidth: number, startBeat: Beat, endBeat: Beat, noteType: string,
    isSelected: boolean, bpmMarkers: BpmMarker[], meta: { offsetMs: number },
  ): void {
    const startMs = beatToMs(startBeat, bpmMarkers, meta.offsetMs);
    const endMs = beatToMs(endBeat, bpmMarkers, meta.offsetMs);
    const startY = this.timeToY(startMs);
    const endY = this.timeToY(endMs);
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;

    let bodyColor: number;
    switch (noteType) {
      case "long": bodyColor = COLORS.SINGLE_LONG; break;
      case "doubleLong": bodyColor = COLORS.DOUBLE_LONG; break;
      case "trillLong": bodyColor = COLORS.TRILL_LONG; break;
      default: bodyColor = COLORS.SINGLE_LONG;
    }

    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);
    const bodyTopY = topY + h / 2;
    const bodyBottomY = bottomY - h / 2;
    const bodyHeight = bodyBottomY - bodyTopY;

    const bodyGradient = this.getBodyGradient(bodyColor);
    const bodyX = x + (laneWidth - w) / 2;
    const cx = x + laneWidth / 2;

    // Body
    if (bodyHeight > 0) {
      const body = new Graphics();
      if (noteType === "trillLong") {
        // Extend body rect by half diamond height into each endpoint
        body.rect(bodyX, bodyTopY - h / 2, w, bodyHeight + h);
      } else {
        body.rect(bodyX, bodyTopY, w, bodyHeight);
      }
      body.fill(bodyGradient);

      if (isSelected) {
        body.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
        this.selectedLongBodyLayer.addChild(body);
      } else {
        this.longNoteBodyLayer.addChild(body);
      }
    }

    // End cap (diamond for trillLong, rect for others)
    const end = new Graphics();
    if (noteType === "trillLong") {
      end.moveTo(cx, endY - h / 2);
      end.lineTo(cx + w / 2, endY);
      end.lineTo(cx, endY + h / 2);
      end.lineTo(cx - w / 2, endY);
      end.lineTo(cx, endY - h / 2);
      end.fill(0x888888);
    } else {
      end.rect(bodyX, endY - h / 2, w, h);
      end.fill({ fill: bodyGradient, alpha: 0.5 });
    }
    if (isSelected) {
      end.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.selectedLongEndLayer.addChild(end);
    } else {
      this.longNoteEndLayer.addChild(end);
    }

    // Head cap (diamond for trillLong, rect for others)
    const head = new Graphics();
    if (noteType === "trillLong") {
      head.moveTo(cx, startY - h / 2);
      head.lineTo(cx + w / 2, startY);
      head.lineTo(cx, startY + h / 2);
      head.lineTo(cx - w / 2, startY);
      head.lineTo(cx, startY - h / 2);
      head.fill(bodyGradient);
    } else {
      head.rect(bodyX, startY - h / 2, w, h);
      head.fill(bodyGradient);
    }
    if (isSelected) {
      head.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.selectedLongHeadLayer.addChild(head);
    } else {
      this.longNoteHeadLayer.addChild(head);
    }
  }

  /** Show ghost note in extra lane */
  showGhostExtraNote(extraLane: number, timeMs: number): void {
    destroyChildren(this.ghostLayer);
    const x = TIMELINE_WIDTH + (extraLane - 1) * EXTRA_LANE_WIDTH;
    const y = this.timeToY(timeMs);
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;
    const rectX = x + (EXTRA_LANE_WIDTH - w) / 2;

    const ghost = new Graphics();
    ghost.rect(rectX, y - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    this.ghostLayer.addChild(ghost);
  }

  /** Show ghost range in extra lane */
  showGhostExtraRange(extraLane: number, startTimeMs: number, endTimeMs: number): void {
    destroyChildren(this.ghostLayer);
    const x = TIMELINE_WIDTH + (extraLane - 1) * EXTRA_LANE_WIDTH;
    const startY = this.timeToY(startTimeMs);
    const endY = this.timeToY(endTimeMs);
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;
    const rectX = x + (EXTRA_LANE_WIDTH - w) / 2;
    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);

    const ghost = new Graphics();
    ghost.rect(rectX, startY - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    ghost.rect(rectX, endY - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    const bodyTop = topY + h / 2;
    const bodyBottom = bottomY - h / 2;
    if (bodyBottom > bodyTop) {
      ghost.rect(rectX, bodyTop, w, bodyBottom - bodyTop);
      ghost.fill({ color: 0xffffff, alpha: 0.15 });
    }
    this.ghostLayer.addChild(ghost);
  }

  /**
   * Render BPM markers, time signature markers, and messages in aux lanes.
   */
  private renderMarkers(): void {
    if (!this.chart) return;

    const bpmMarkers = this.cachedBpmMarkers;
    const { events, meta } = this.chart;
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    const { minTimeMs, maxTimeMs } = this.getVisibleTimeRange();

    // Events (pink, aux index 0, range)
    for (const evt of events) {
      const startMs = beatToMs(evt.beat, bpmMarkers, meta.offsetMs);
      const endMs = beatToMs(evt.endBeat, bpmMarkers, meta.offsetMs);

      // Viewport culling
      const lo = Math.min(startMs, endMs);
      const hi = Math.max(startMs, endMs);
      if (hi < minTimeMs || lo > maxTimeMs) continue;

      const startY = this.timeToY(startMs);
      const endY = this.timeToY(endMs);
      const rawHeight = Math.abs(endY - startY);
      const height = rawHeight > 0 ? rawHeight : NOTE_HEIGHT;
      const topY = rawHeight > 0 ? Math.min(startY, endY) : Math.min(startY, endY) - NOTE_HEIGHT / 2;
      const gfx = new Graphics();
      gfx.rect(auxStartX, topY, AUX_LANE_WIDTH, height);
      gfx.fill({ color: COLORS.EVENT_MARKER, alpha: 0.5 });
      gfx.stroke({ width: 1.5, color: 0xffbbdd, alpha: 0.6, alignment: 0 });
      this.noteLayer.addChild(gfx);

      const parts: string[] = [];
      if (evt.stop) parts.push('STOP');
      if (evt.bpm !== undefined) parts.push(`BPM:${evt.bpm}`);
      if (evt.beatPerMeasure !== undefined) {
        const bp = evt.beatPerMeasure;
        parts.push(`TS:${bp.n}/${bp.d}`);
      }
      if (evt.text !== undefined) parts.push(evt.text);
      const displayText = parts.join(' | ') || '(empty)';
      if (!this._eventLabelStyle) {
        this._eventLabelStyle = new TextStyle({
          fontSize: 11,
          fill: 0xffffff,
          fontFamily: "monospace",
          wordWrap: true,
          wordWrapWidth: AUX_LANE_WIDTH - 4,
        });
      }
      const label = new Text({
        text: displayText,
        style: this._eventLabelStyle,
      });
      // Truncate if text overflows the marker height
      if (label.height > height) {
        // Estimate chars that fit, then add ellipsis
        const charsPerLine = Math.floor((AUX_LANE_WIDTH - 4) / 7);
        const lines = Math.max(1, Math.floor(height / 13));
        const maxChars = charsPerLine * lines - 1;
        const truncated = displayText.length > maxChars ? displayText.slice(0, maxChars) + '\u2026' : displayText;
        label.text = truncated;
        // Use a clone to avoid mutating the shared cached style
        label.style = new TextStyle({
          fontSize: 11,
          fill: 0xffffff,
          fontFamily: "monospace",
        });
      }
      label.anchor.set(0.5, 0.5);
      label.x = auxStartX + AUX_LANE_WIDTH / 2;
      label.y = topY + height / 2;
      this.noteLayer.addChild(label);
    }
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
    destroyChildren(this.ghostLayer);

    const y = this.timeToY(timeMs);
    const x = (lane - 1) * LANE_WIDTH;
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;
    const rectX = x + (LANE_WIDTH - w) / 2;
    const rectY = y - h / 2;

    const ghost = new Graphics();
    ghost.rect(rectX, rectY, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    this.ghostLayer.addChild(ghost);
  }

  /**
   * Show a semi-transparent ghost marker in an auxiliary lane.
   * @param auxIndex 0=event
   */
  showGhostMarker(auxIndex: number, timeMs: number): void {
    destroyChildren(this.ghostLayer);

    const y = this.timeToY(timeMs);
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    const x = auxStartX + auxIndex * AUX_LANE_WIDTH;

    const ghost = new Graphics();
    ghost.rect(x, y - NOTE_HEIGHT / 2, AUX_LANE_WIDTH, NOTE_HEIGHT);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    this.ghostLayer.addChild(ghost);
  }

  /**
   * Show a semi-transparent ghost range (long note body + head + end).
   */
  showGhostRange(lane: Lane, startTimeMs: number, endTimeMs: number): void {
    destroyChildren(this.ghostLayer);

    const startY = this.timeToY(startTimeMs);
    const endY = this.timeToY(endTimeMs);
    const x = (lane - 1) * LANE_WIDTH;
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;
    const rectX = x + (LANE_WIDTH - w) / 2;

    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);

    const ghost = new Graphics();
    // Head
    ghost.rect(rectX, startY - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    // End
    ghost.rect(rectX, endY - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    // Body
    const bodyTop = topY + h / 2;
    const bodyBottom = bottomY - h / 2;
    if (bodyBottom > bodyTop) {
      ghost.rect(rectX, bodyTop, w, bodyBottom - bodyTop);
      ghost.fill({ color: 0xffffff, alpha: 0.15 });
    }
    this.ghostLayer.addChild(ghost);
  }

  /**
   * Hide the ghost note/marker preview.
   */
  hideGhostNote(): void {
    destroyChildren(this.ghostLayer);
  }

  /**
   * Draw hover outline in the dedicated hover layer (lightweight, no full re-render).
   */
  private updateHoverOverlay(): void {
    destroyChildren(this.hoverLayer);
    if (!this.chart) return;

    // Sync scroll/offset position (needed when called standalone, not from full render)
    this.hoverLayer.x = this.contentOffsetX;
    this.hoverLayer.y = -this._scrollY;

    const bpmMarkers = this.cachedBpmMarkers;
    const meta = this.chart.meta;

    // Hovered regular note
    if (this._hoveredNoteIndex !== null && this._hoveredNoteIndex < this.chart.notes.length) {
      const note = this.chart.notes[this._hoveredNoteIndex];
      const x = (note.lane - 1) * LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      const startY = this.timeToY(startMs);

      if ("endBeat" in note) {
        const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const endY = this.timeToY(endMs);
        const topY = Math.min(startY, endY);
        const bottomY = Math.max(startY, endY);
        // Outline covering entire range note
        const gfx = new Graphics();
        const isDiamond = note.type === "trillLong";
        if (isDiamond) {
          gfx.rect(x + (LANE_WIDTH - w) / 2, topY - h / 2, w, bottomY - topY + h);
        } else {
          gfx.rect(x + (LANE_WIDTH - w) / 2, topY - h / 2, w, bottomY - topY + h);
        }
        gfx.stroke({ width: 1.5, color: COLORS.HOVERED_OUTLINE, alignment: 0 });
        this.hoverLayer.addChild(gfx);
      } else {
        const gfx = new Graphics();
        if (note.type === "trill") {
          const cx = x + LANE_WIDTH / 2;
          gfx.moveTo(cx, startY - h / 2);
          gfx.lineTo(cx + w / 2, startY);
          gfx.lineTo(cx, startY + h / 2);
          gfx.lineTo(cx - w / 2, startY);
          gfx.lineTo(cx, startY - h / 2);
        } else {
          gfx.rect(x + (LANE_WIDTH - w) / 2, startY - h / 2, w, h);
        }
        gfx.stroke({ width: 1.5, color: COLORS.HOVERED_OUTLINE, alignment: 0 });
        this.hoverLayer.addChild(gfx);
      }
    }

    // Hovered extra note
    if (this._hoveredExtraNoteIndex !== null && this._hoveredExtraNoteIndex < this._extraNotes.length) {
      const note = this._extraNotes[this._hoveredExtraNoteIndex];
      const x = TIMELINE_WIDTH + (note.extraLane - 1) * EXTRA_LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      const startY = this.timeToY(startMs);

      const gfx = new Graphics();
      if ("endBeat" in note) {
        const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const endY = this.timeToY(endMs);
        const topY = Math.min(startY, endY);
        const bottomY = Math.max(startY, endY);
        gfx.rect(x + (EXTRA_LANE_WIDTH - w) / 2, topY - h / 2, w, bottomY - topY + h);
      } else {
        gfx.rect(x + (EXTRA_LANE_WIDTH - w) / 2, startY - h / 2, w, h);
      }
      gfx.stroke({ width: 1.5, color: COLORS.HOVERED_OUTLINE, alignment: 0 });
      this.hoverLayer.addChild(gfx);
    }
  }

  /**
   * Set note indices that violate constraints (shown with red hatching overlay).
   */
  setViolatingNotes(indices: Set<number>): void {
    this._violatingNoteIndices = indices;
    this.renderViolationOverlay();
    this.app?.render();
  }

  /**
   * Render red hatching overlay on violating notes.
   */
  private renderViolationOverlay(): void {
    destroyChildren(this.violationLayer);
    if (!this.chart || this._violatingNoteIndices.size === 0) return;

    const bpmMarkers = this.cachedBpmMarkers;
    const meta = this.chart.meta;
    const { minTimeMs, maxTimeMs } = this.getVisibleTimeRange();

    for (const idx of this._violatingNoteIndices) {
      if (idx >= this.chart.notes.length) continue;
      const note = this.chart.notes[idx];
      const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);

      const x = (note.lane - 1) * LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const rectX = x + (LANE_WIDTH - w) / 2;

      let topY: number;
      let height: number;

      if ("endBeat" in note) {
        const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const lo = Math.min(startMs, endMs);
        const hi = Math.max(startMs, endMs);
        if (hi < minTimeMs || lo > maxTimeMs) continue;
        const startY = this.timeToY(startMs);
        const endY = this.timeToY(endMs);
        topY = Math.min(startY, endY) - h / 2;
        height = Math.abs(endY - startY) + h;
      } else {
        if (startMs < minTimeMs || startMs > maxTimeMs) continue;
        const y = this.timeToY(startMs);
        topY = y - h / 2;
        height = h;
      }

      const gfx = new Graphics();

      // Semi-transparent red background
      gfx.rect(rectX, topY, w, height);
      gfx.fill({ color: COLORS.VIOLATION_HATCH, alpha: COLORS.VIOLATION_HATCH_ALPHA * 0.5 });

      // Diagonal hatching lines — use height-based spacing for consistent density
      const spacing = Math.max(4, Math.min(8, height * 0.6));
      gfx.setStrokeStyle({ width: 1, color: COLORS.VIOLATION_HATCH, alpha: COLORS.VIOLATION_HATCH_ALPHA });
      for (let d = -height; d < w; d += spacing) {
        const x1 = Math.max(0, d);
        const y1 = Math.max(0, -d);
        const x2 = Math.min(w, d + height);
        const y2 = Math.min(height, w - d);
        if (x1 < w && x2 > 0 && y1 < height && y2 > 0) {
          gfx.moveTo(rectX + x1, topY + y1);
          gfx.lineTo(rectX + x2, topY + y2);
        }
      }
      gfx.stroke();

      this.violationLayer.addChild(gfx);
    }
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
   * Render minimap inside the canvas (topmost layer, not affected by scroll).
   * Shows a scaled-down overview of the entire timeline with note positions.
   */
  private renderMinimap(): void {
    destroyChildren(this.minimapLayer);
    this._minimapViewport = null; // destroyed by destroyChildren, will be recreated
    if (!this.chart) return;

    const canvasH = this.options.height;
    const totalH = this.totalTimelineHeight;
    if (totalH <= 0) return;

    const trackX = this.options.width - MINIMAP_WIDTH;
    const minimapContentWidth = MINIMAP_WIDTH;
    const scale = canvasH / totalH;

    // (1) Semi-transparent dark background
    const bg = new Graphics();
    bg.rect(trackX, 0, MINIMAP_WIDTH, canvasH);
    bg.fill({ color: 0x000000, alpha: 0.5 });
    this.minimapLayer.addChild(bg);

    // (2) Lane backgrounds (scaled)
    const noteLaneWidth = minimapContentWidth;
    const laneW = noteLaneWidth / LANE_COUNT;
    for (let i = 0; i < LANE_COUNT; i++) {
      const color = i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
      const laneBg = new Graphics();
      laneBg.rect(trackX + i * laneW, 0, laneW, canvasH);
      laneBg.fill({ color, alpha: 0.4 });
      this.minimapLayer.addChild(laneBg);
    }

    // Helper: convert container-local Y to minimap Y
    const toMinimapY = (containerY: number): number => containerY * scale;

    // (3) Measure lines
    const bpmMarkers = this.cachedBpmMarkers;
    const timeSignatures = this.cachedTimeSignatures;
    const meta = this.chart.meta;
    if (bpmMarkers.length > 0 && timeSignatures.length > 0) {
      const totalTimelineMs = this.getTotalTimelineMs();
      for (let m = 0; ; m++) {
        const mStartBeat = measureStartBeat(m, timeSignatures);
        const mStartMs = beatToMs(mStartBeat, bpmMarkers, meta.offsetMs);
        if (mStartMs > totalTimelineMs) break;

        const containerY = this.timeToY(mStartMs);
        const my = toMinimapY(containerY);
        if (my < 0 || my > canvasH) continue;

        const line = new Graphics();
        line.moveTo(trackX, my);
        line.lineTo(trackX + MINIMAP_WIDTH, my);
        line.stroke({ width: 1, color: 0xffffff, alpha: 0.2 });
        this.minimapLayer.addChild(line);
      }
    }

    // (3.5) Trill zones
    const trillRects = computeMinimapTrillZoneRects(
      this.chart.trillZones, bpmMarkers, meta.offsetMs,
      (ms) => this.timeToY(ms), toMinimapY, trackX, laneW,
    );
    for (const r of trillRects) {
      const zoneGfx = new Graphics();
      zoneGfx.rect(r.x, r.y, r.width, r.height);
      zoneGfx.fill({ color: COLORS.TRILL_ZONE, alpha: COLORS.TRILL_ZONE_ALPHA });
      this.minimapLayer.addChild(zoneGfx);
    }

    // (4) Notes
    const { notes } = this.chart;
    for (const note of notes) {
      const timeMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      const containerY = this.timeToY(timeMs);
      const my = toMinimapY(containerY);

      const laneIdx = note.lane - 1;
      const noteX = trackX + laneIdx * laneW;

      if ('endBeat' in note) {
        // Range note (long note): draw filled rect from start to end
        const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const endContainerY = this.timeToY(endMs);
        const endMy = toMinimapY(endContainerY);

        let noteColor: number;
        switch (note.type) {
          case 'long': noteColor = COLORS.SINGLE_LONG; break;
          case 'doubleLong': noteColor = COLORS.DOUBLE_LONG; break;
          case 'trillLong': noteColor = COLORS.TRILL_LONG; break;
          default: noteColor = COLORS.SINGLE_LONG;
        }

        const topY = Math.min(my, endMy);
        const height = Math.max(1, Math.abs(endMy - my));
        const longGfx = new Graphics();
        longGfx.rect(noteX, topY, laneW, height);
        longGfx.fill({ color: noteColor, alpha: 0.5 });
        this.minimapLayer.addChild(longGfx);
      } else {
        // Point note: 1px height horizontal line
        let noteColor: number;
        switch (note.type) {
          case 'single': noteColor = COLORS.SINGLE_NOTE; break;
          case 'double': noteColor = COLORS.DOUBLE_NOTE; break;
          case 'trill': noteColor = COLORS.TRILL_NOTE; break;
          default: noteColor = COLORS.SINGLE_NOTE;
        }

        const noteGfx = new Graphics();
        noteGfx.rect(noteX, my, laneW, 1);
        noteGfx.fill(noteColor);
        this.minimapLayer.addChild(noteGfx);
      }
    }

    // (5) Time labels
    if (this.waveformDurationMs > 0) {
      const intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300];
      const minSpacingPx = 30;
      let intervalSec = intervals[intervals.length - 1];
      for (const iv of intervals) {
        if (iv * this._zoom * scale >= minSpacingPx) {
          intervalSec = iv;
          break;
        }
      }

      const durationSec = this.waveformDurationMs / 1000;
      const fmtTime = (s: number) => {
        const m = Math.floor(s / 60);
        const ss = Math.floor(s % 60);
        return `${m}:${String(ss).padStart(2, '0')}`;
      };

      if (!this._timeLabelStyle) {
        this._timeLabelStyle = new TextStyle({
          fontSize: 9,
          fill: 0x66aaff,
          fontFamily: 'monospace',
        });
      }
      const timeLabelStyle = this._timeLabelStyle;

      for (let t = intervalSec; t <= durationSec; t += intervalSec) {
        const containerY = this.timeToY(t * 1000);
        const my = toMinimapY(containerY);
        if (my < 8 || my > canvasH - 4) continue;

        const label = new Text({ text: fmtTime(t), style: timeLabelStyle });
        label.x = trackX + 2;
        label.y = my;
        this.minimapLayer.addChild(label);
      }

      // End-of-audio time label
      const endContainerY = this.timeToY(this.waveformDurationMs);
      const endMy = toMinimapY(endContainerY);
      if (endMy >= 8 && endMy <= canvasH - 4) {
        if (!this._endTimeLabelStyle) {
          this._endTimeLabelStyle = new TextStyle({ fontSize: 9, fill: 0xff6644, fontFamily: 'monospace' });
        }
        const endLabel = new Text({
          text: fmtTime(durationSec),
          style: this._endTimeLabelStyle,
        });
        endLabel.x = trackX + 2;
        endLabel.y = endMy;
        this.minimapLayer.addChild(endLabel);
      }
    }

    // (6) Viewport indicator (reusable)
    this.updateMinimapViewport();
  }

  /**
   * Lightweight minimap viewport indicator update (no full minimap re-render).
   * Called on every scroll to avoid destroying/recreating all minimap content at 60fps.
   */
  private updateMinimapViewport(): void {
    const canvasH = this.options.height;
    const totalH = this.totalTimelineHeight;
    const trackX = this.options.width - MINIMAP_WIDTH;

    if (!this._minimapViewport) {
      this._minimapViewport = new Graphics();
      this.minimapLayer.addChild(this._minimapViewport);
    }

    this._minimapViewport.clear();

    if (totalH > canvasH) {
      const viewportTopY = (this._scrollY / totalH) * canvasH;
      const viewportHeight = (canvasH / totalH) * canvasH;

      this._minimapViewport.rect(trackX, viewportTopY, MINIMAP_WIDTH, viewportHeight);
      this._minimapViewport.fill({ color: 0xffffff, alpha: 0.15 });
      this._minimapViewport.stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    }
  }

  /**
   * Check if a screen-space point is within the minimap area.
   */
  isInMinimapArea(x: number): boolean {
    return x >= this.options.width - MINIMAP_WIDTH;
  }

  /**
   * Handle minimap pointer down. Returns true if the event was consumed.
   */
  handleMinimapPointerDown(x: number, y: number): boolean {
    if (!this.isInMinimapArea(x)) return false;

    const canvasH = this.options.height;
    const totalH = this.totalTimelineHeight;
    if (totalH <= canvasH) return false;

    const maxScroll = totalH - canvasH;
    const viewportTopY = (this._scrollY / totalH) * canvasH;
    const viewportHeight = (canvasH / totalH) * canvasH;

    if (y >= viewportTopY && y <= viewportTopY + viewportHeight) {
      // Start dragging viewport indicator
      this.minimapDragging = true;
      this.minimapDragStartY = y;
      this.minimapDragStartScroll = this._scrollY;
    } else {
      // Click on minimap: jump to position (center the view at click point)
      const ratio = y / canvasH;
      const targetScroll = ratio * totalH - canvasH / 2;
      const newScroll = Math.max(0, Math.min(maxScroll, targetScroll));
      this.options.onScroll?.(newScroll);
      // Start dragging from the new position so user can fine-tune
      this.minimapDragging = true;
      this.minimapDragStartY = y;
      this.minimapDragStartScroll = newScroll;
    }

    return true;
  }

  /**
   * Handle minimap pointer move. Returns true if dragging.
   */
  handleMinimapPointerMove(_x: number, y: number): boolean {
    if (!this.minimapDragging) return false;

    const canvasH = this.options.height;
    const totalH = this.totalTimelineHeight;
    const maxScroll = totalH - canvasH;

    if (canvasH <= 0) return true;

    const deltaY = y - this.minimapDragStartY;
    const deltaScroll = (deltaY / canvasH) * totalH;
    const newScroll = Math.max(0, Math.min(maxScroll, this.minimapDragStartScroll + deltaScroll));
    this.options.onScroll?.(newScroll);

    return true;
  }

  /**
   * Handle minimap pointer up.
   */
  handleMinimapPointerUp(): void {
    this.minimapDragging = false;
  }

  /**
   * Setup canvas-level pointer events for minimap drag interaction.
   */
  private setupMinimapEvents(): void {
    const canvas = this.options.canvas;
    canvas.addEventListener('pointerup', this.boundMinimapPointerUp);
    canvas.addEventListener('pointerleave', this.boundMinimapPointerUp);
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (!this.initialized) return;
    const canvas = this.options.canvas;
    canvas.removeEventListener('pointerup', this.boundMinimapPointerUp);
    canvas.removeEventListener('pointerleave', this.boundMinimapPointerUp);
    this.initialized = false;

    // Destroy app first (destroys all children including Text objects referencing cached styles)
    this.app.destroy(true, { children: true });

    // Then clean up cached resources
    for (const g of this.bodyGradientCache.values()) g.destroy();
    this.bodyGradientCache.clear();

    this._cursorLine = null;
    this._cursorHandle = null;
    this._minimapViewport = null;
    this._measureLabelStyle?.destroy();
    this._measureLabelStyle = null;
    this._eventLabelStyle?.destroy();
    this._eventLabelStyle = null;
    this._timeLabelStyle?.destroy();
    this._timeLabelStyle = null;
    this._endTimeLabelStyle?.destroy();
    this._endTimeLabelStyle = null;
  }
}
