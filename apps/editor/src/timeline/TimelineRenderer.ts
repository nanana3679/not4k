/**
 * PixiJS v8 Timeline Renderer — chart-editor.md §Timeline Layout 기준
 *
 * 7 lanes: 4 note lanes (L1~L4) + BPM + time signature + message
 * 14 z-order layers (back to front)
 * Vertical timeline (time flows bottom-to-top)
 */

import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type {
  Chart,
  Beat,
  NoteEntity,
  PointNote,
  RangeNote,
} from "@not4k/shared";
import { beatToMs, measureStartBeat, beat, beatAdd, beatMulInt, extractBpmMarkers, extractTimeSignatures } from "@not4k/shared";
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
  SCROLLBAR_WIDTH,
  SCROLLBAR_TRACK_COLOR,
  SCROLLBAR_TRACK_ALPHA,
  SCROLLBAR_THUMB_COLOR,
} from "./constants";
import type { Lane } from "@not4k/shared";

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
  private ghostLayer!: Container;
  private measureLabels!: Container;
  private playbackCursorLayer!: Container;
  private scrollbarLayer!: Container;

  // Scrollbar drag state
  private scrollbarDragging: boolean = false;
  private scrollbarDragStartY: number = 0;
  private scrollbarDragStartScroll: number = 0;
  private boundScrollbarPointerUp = () => this.handleScrollbarPointerUp();

  // State
  private _zoom: number = 200; // pixelPerSecond
  private _scrollY: number = 0;
  private _snap: number = 4; // 1/4 beat snap
  private _selectedNotes: Set<number> = new Set();
  private _moveOrigins: { note: NoteEntity; beat: Beat; endBeat?: Beat; lane: Lane }[] | null = null;

  // Chart data
  private chart: Chart | null = null;

  // Waveform data
  private waveformPeaks: Float32Array | null = null;
  private waveformDurationMs: number = 0;

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
    this.ghostLayer = new Container();
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
    this.app.stage.addChild(this.ghostLayer);
    this.app.stage.addChild(this.measureLabels);
    this.app.stage.addChild(this.playbackCursorLayer);

    // Scrollbar layer (topmost, not affected by scroll)
    this.scrollbarLayer = new Container();
    this.app.stage.addChild(this.scrollbarLayer);

    // Scrollbar pointer events
    this.setupScrollbarEvents();

    this.initialized = true;
  }

  /**
   * Set the chart data to render
   */
  setChart(chart: Chart): void {
    this.chart = chart;
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
    this.renderScrollbar();
    this.app?.render();
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
    const contentWidth = TIMELINE_WIDTH + 32; // timeline + measure label area
    return Math.max(0, (this.options.width - SCROLLBAR_WIDTH - contentWidth) / 2);
  }

  /**
   * Convert time (ms) to Y pixel position (container-local space).
   * Time flows bottom-to-top: time 0 = near bottom (with padding below), later time = higher (lower Y).
   */
  timeToY(timeMs: number): number {
    return this.contentHeight - TIMELINE_PADDING - (timeMs * this._zoom) / 1000;
  }

  /**
   * Convert screen Y pixel position to time (ms).
   * Accounts for scroll offset, bottom-to-top layout, and bottom padding.
   */
  yToTime(y: number): number {
    const containerY = y + this._scrollY;
    return ((this.contentHeight - TIMELINE_PADDING - containerY) * 1000) / this._zoom;
  }

  /**
   * Calculate total timeline duration in ms based on audio or default measures.
   */
  getTotalTimelineMs(): number {
    if (!this.chart) return 0;
    const bpmMarkers = extractBpmMarkers(this.chart.events);
    const timeSignatures = extractTimeSignatures(this.chart.events);
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
    return beatToMs(endBeat, bpmMarkers, meta.offsetMs);
  }

  /**
   * Total timeline height in pixels (for scroll bounds), including padding.
   */
  get totalTimelineHeight(): number {
    return (this.getTotalTimelineMs() * this._zoom) / 1000 + TIMELINE_PADDING * 2;
  }

  /**
   * Render lane backgrounds with height matching the total timeline.
   */
  private renderLaneBackgrounds(): void {
    this.laneBackgrounds.removeChildren();

    const totalTimeMs = this.getTotalTimelineMs();
    const topY = this.timeToY(totalTimeMs);
    const bottomY = this.timeToY(0);
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
  }

  /**
   * Update scroll position for all layers (except scrollbar layer which stays fixed)
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
      this.ghostLayer,
      this.measureLabels,
      this.playbackCursorLayer,
    ];

    const offsetX = this.contentOffsetX;
    for (const layer of layers) {
      layer.x = offsetX;
      layer.y = -this._scrollY;
    }
    // scrollbarLayer is NOT scrolled/offset — stays fixed on screen
  }

  /**
   * Full re-render
   */
  render(): void {
    if (!this.initialized || !this.chart) return;

    this.clearDynamicLayers();
    this.renderLaneBackgrounds();
    this.renderWaveform();
    this.renderGridLines();
    this.renderTrillZones();
    this.renderMoveOrigins();
    this.renderNotes();
    this.renderMarkers();
    this.updateScroll();
    this.renderScrollbar();
    // Force PixiJS to repaint the canvas
    this.app.render();
  }

  /**
   * Clear all dynamic content layers
   */
  private clearDynamicLayers(): void {
    this.waveformLayer.removeChildren();
    this.measureLines.removeChildren();
    this.beatLines.removeChildren();
    this.snapLines.removeChildren();
    this.trillZoneLayer.removeChildren();
    this.moveOriginLayer.removeChildren();
    this.longNoteBodyLayer.removeChildren();
    this.longNoteEndLayer.removeChildren();
    this.longNoteHeadLayer.removeChildren();
    this.noteLayer.removeChildren();
    this.selectedLongBodyLayer.removeChildren();
    this.selectedLongEndLayer.removeChildren();
    this.selectedLongHeadLayer.removeChildren();
    this.selectedNoteLayer.removeChildren();
    this.measureLabels.removeChildren();
  }

  /**
   * Render audio waveform visualization
   */
  private renderWaveform(): void {
    if (!this.waveformPeaks || this.waveformDurationMs === 0) return;

    const laneAreaWidth = LANE_COUNT * LANE_WIDTH;
    const centerX = laneAreaWidth / 2; // center of 4 note lanes

    const peaks = this.waveformPeaks;
    const peakCount = peaks.length;

    // Normalize: find max peak and scale so it fills the lane width
    let maxPeak = 0;
    for (let i = 0; i < peakCount; i++) {
      if (peaks[i] > maxPeak) maxPeak = peaks[i];
    }
    const scale = maxPeak > 0 ? 1 / maxPeak : 1;

    // Calculate time per peak
    const msPerPeak = this.waveformDurationMs / peakCount;

    const waveform = new Graphics();

    // Build the waveform shape centered within 4 note lanes
    waveform.moveTo(centerX, this.timeToY(0));

    // Draw upper half (positive peaks)
    for (let i = 0; i < peakCount; i++) {
      const timeMs = i * msPerPeak;
      const y = this.timeToY(timeMs);
      const normalized = peaks[i] * scale;
      const x = centerX + (normalized * laneAreaWidth) / 2;
      waveform.lineTo(x, y);
    }

    // Draw lower half (negative peaks) - go back in reverse
    for (let i = peakCount - 1; i >= 0; i--) {
      const timeMs = i * msPerPeak;
      const y = this.timeToY(timeMs);
      const normalized = peaks[i] * scale;
      const x = centerX - (normalized * laneAreaWidth) / 2;
      waveform.lineTo(x, y);
    }

    // Close the shape
    waveform.lineTo(centerX, this.timeToY(0));

    // Fill with semi-transparent blue
    waveform.fill({ color: 0x0078ff, alpha: 0.3 });

    this.waveformLayer.addChild(waveform);
  }

  /**
   * Render grid lines (measure, beat, snap).
   * Iterates measure by measure, respecting variable time signatures and BPMs.
   */
  private renderGridLines(): void {
    if (!this.chart) return;

    const bpmMarkers = extractBpmMarkers(this.chart.events);
    const timeSignatures = extractTimeSignatures(this.chart.events);
    const meta = this.chart.meta;
    if (bpmMarkers.length === 0 || timeSignatures.length === 0) return;

    const totalTimelineMs = this.getTotalTimelineMs();
    const sortedTS = [...timeSignatures].sort((a, b) => a.measure - b.measure);

    const measureLabelStyle = new TextStyle({
      fontSize: 11,
      fill: 0x999999,
      fontFamily: "monospace",
    });

    for (let m = 0; ; m++) {
      const mStartBeat = measureStartBeat(m, timeSignatures);
      const mStartMs = beatToMs(mStartBeat, bpmMarkers, meta.offsetMs);
      if (mStartMs > totalTimelineMs) break;

      const y = this.timeToY(mStartMs);

      // Measure line
      const line = new Graphics();
      line.moveTo(0, y);
      line.lineTo(TIMELINE_WIDTH, y);
      line.stroke({ width: 2, color: COLORS.MEASURE_LINE });
      this.measureLines.addChild(line);

      // Measure number label
      const label = new Text({
        text: String(m + 1),
        style: measureLabelStyle,
      });
      label.x = TIMELINE_WIDTH + 4;
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
        beatLine.lineTo(TIMELINE_WIDTH, bY);
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
        snapLine.lineTo(TIMELINE_WIDTH, snapY);
        snapLine.stroke({ width: 1, color: COLORS.SNAP_LINE, alpha: 0.3 });
        this.snapLines.addChild(snapLine);
      }
    }
  }

  /**
   * Render trill zones
   */
  private renderTrillZones(): void {
    if (!this.chart) return;

    const { trillZones, meta } = this.chart;
    const bpmMarkers = extractBpmMarkers(this.chart.events);

    for (const zone of trillZones) {
      const startMs = beatToMs(zone.beat, bpmMarkers, meta.offsetMs);
      const endMs = beatToMs(zone.endBeat, bpmMarkers, meta.offsetMs);
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

    const bpmMarkers = extractBpmMarkers(this.chart.events);
    const meta = this.chart.meta;
    const ORIGIN_ALPHA = 0.3;

    for (const origin of this._moveOrigins) {
      const { note, beat: origBeat, endBeat: origEndBeat, lane } = origin;
      const x = (lane - 1) * LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;

      if (!origEndBeat) {
        // Point note ghost
        const timeMs = beatToMs(origBeat, bpmMarkers, meta.offsetMs);
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
        const startY = this.timeToY(startMs);
        const endY = this.timeToY(endMs);

        let bodyColor: number;
        switch (note.type) {
          case "singleLong": bodyColor = COLORS.SINGLE_LONG; break;
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

        // Head
        const head = new Graphics();
        const headX = x + (LANE_WIDTH - w) / 2;
        head.rect(headX, startY - h / 2, w, h);
        head.fill({ color: bodyColor, alpha: ORIGIN_ALPHA });
        this.moveOriginLayer.addChild(head);

        // End
        const end = new Graphics();
        end.rect(headX, endY - h / 2, w, h);
        end.fill({ color: bodyColor, alpha: ORIGIN_ALPHA * 0.5 });
        this.moveOriginLayer.addChild(end);
      }
    }
  }

  /**
   * Render notes (point and range notes)
   */
  private renderNotes(): void {
    if (!this.chart) return;

    const { notes } = this.chart;

    notes.forEach((note, index) => {
      const isSelected = this._selectedNotes.has(index);

      if (this.isPointNote(note)) {
        this.renderPointNote(note, isSelected);
      } else {
        this.renderRangeNote(note, isSelected);
      }
    });
  }

  /**
   * Type guard for PointNote
   */
  private isPointNote(note: NoteEntity): note is PointNote {
    return "type" in note && !("endBeat" in note);
  }

  /**
   * Render a point note (single, double, trill)
   */
  private renderPointNote(note: PointNote, isSelected: boolean): void {
    if (!this.chart) return;

    const bpmMarkers = extractBpmMarkers(this.chart.events);
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
  private renderRangeNote(note: RangeNote, isSelected: boolean): void {
    if (!this.chart) return;

    const bpmMarkers = extractBpmMarkers(this.chart.events);
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
      case "singleLong":
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
    const bodyTopY = topY + h / 2;
    const bodyBottomY = bottomY - h / 2;
    const bodyHeight = bodyBottomY - bodyTopY;

    if (bodyHeight > 0) {
      const body = new Graphics();
      const bodyX = x + (LANE_WIDTH - w) / 2;
      body.rect(bodyX, bodyTopY, w, bodyHeight);
      body.fill(bodyColor);

      // Fill diamond corner gaps for trillLong (seamless body-to-head/end connection)
      if (note.type === "trillLong") {
        const cx = x + LANE_WIDTH / 2;
        // Head upper corners (at bottomY=startY, facing body)
        body.poly([bodyX, startY - h / 2, cx, startY - h / 2, bodyX, startY]);
        body.fill(bodyColor);
        body.poly([cx, startY - h / 2, bodyX + w, startY - h / 2, bodyX + w, startY]);
        body.fill(bodyColor);
        // End lower corners (at topY=endY, facing body)
        body.poly([bodyX, endY, cx, endY + h / 2, bodyX, endY + h / 2]);
        body.fill(bodyColor);
        body.poly([bodyX + w, endY, cx, endY + h / 2, bodyX + w, endY + h / 2]);
        body.fill(bodyColor);
      }

      if (isSelected) {
        body.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
        this.selectedLongBodyLayer.addChild(body);
      } else {
        this.longNoteBodyLayer.addChild(body);
      }
    }

    // Long note head (start point)
    const head = new Graphics();
    if (note.type === "trillLong") {
      const cx = x + LANE_WIDTH / 2;
      head.moveTo(cx, startY - h / 2);
      head.lineTo(cx + w / 2, startY);
      head.lineTo(cx, startY + h / 2);
      head.lineTo(cx - w / 2, startY);
      head.lineTo(cx, startY - h / 2);
      head.fill(bodyColor);
    } else {
      const headX = x + (LANE_WIDTH - w) / 2;
      const headY = startY - h / 2;
      head.rect(headX, headY, w, h);
      head.fill(bodyColor);
    }

    if (isSelected) {
      head.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.selectedLongHeadLayer.addChild(head);
    } else {
      this.longNoteHeadLayer.addChild(head);
    }

    // Long note end (end point) — 50% alpha for visual distinction
    const end = new Graphics();
    if (note.type === "trillLong") {
      const cx = x + LANE_WIDTH / 2;
      end.moveTo(cx, endY - h / 2);
      end.lineTo(cx + w / 2, endY);
      end.lineTo(cx, endY + h / 2);
      end.lineTo(cx - w / 2, endY);
      end.lineTo(cx, endY - h / 2);
      end.fill({ color: bodyColor, alpha: 0.5 });
    } else {
      const endX = x + (LANE_WIDTH - w) / 2;
      const endNoteY = endY - h / 2;
      end.rect(endX, endNoteY, w, h);
      end.fill({ color: bodyColor, alpha: 0.5 });
    }

    if (isSelected) {
      end.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.selectedLongEndLayer.addChild(end);
    } else {
      this.longNoteEndLayer.addChild(end);
    }
  }

  /**
   * Render BPM markers, time signature markers, and messages in aux lanes.
   */
  private renderMarkers(): void {
    if (!this.chart) return;

    const bpmMarkers = extractBpmMarkers(this.chart.events);
    const { events, meta } = this.chart;
    const auxStartX = LANE_COUNT * LANE_WIDTH;

    // Events (pink, aux index 0, range)
    for (const evt of events) {
      const startMs = beatToMs(evt.beat, bpmMarkers, meta.offsetMs);
      const endMs = beatToMs(evt.endBeat, bpmMarkers, meta.offsetMs);
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
      const label = new Text({
        text: displayText,
        style: new TextStyle({
          fontSize: 11,
          fill: 0xffffff,
          fontFamily: "monospace",
          wordWrap: true,
          wordWrapWidth: AUX_LANE_WIDTH - 4,
        }),
      });
      // Truncate if text overflows the marker height
      if (label.height > height) {
        // Estimate chars that fit, then add ellipsis
        const charsPerLine = Math.floor((AUX_LANE_WIDTH - 4) / 7);
        const lines = Math.max(1, Math.floor(height / 13));
        const maxChars = charsPerLine * lines - 1;
        const truncated = displayText.length > maxChars ? displayText.slice(0, maxChars) + '\u2026' : displayText;
        label.text = truncated;
        label.style.wordWrap = false;
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
    this.playbackCursorLayer.removeChildren();

    const y = this.timeToY(timeMs);

    // Cursor line (bright green, full width)
    const line = new Graphics();
    line.moveTo(0, y);
    line.lineTo(TIMELINE_WIDTH, y);
    line.stroke({ width: 2, color: 0x00ff88 });
    this.playbackCursorLayer.addChild(line);

    // Draggable handle (triangle on the right edge, pointing left)
    const handle = new Graphics();
    const hx = TIMELINE_WIDTH + 16;
    const hs = 8; // half-size of handle
    handle.moveTo(hx, y - hs);
    handle.lineTo(hx - hs * 2, y);
    handle.lineTo(hx, y + hs);
    handle.lineTo(hx, y - hs);
    handle.fill(0x00ff88);
    this.playbackCursorLayer.addChild(handle);
  }

  /**
   * Show a semi-transparent ghost note at the given note lane and time.
   */
  showGhostNote(lane: Lane, timeMs: number): void {
    this.ghostLayer.removeChildren();

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
    this.ghostLayer.removeChildren();

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
    this.ghostLayer.removeChildren();

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
    this.ghostLayer.removeChildren();
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
   * Render scrollbar inside the canvas (topmost layer, not affected by scroll).
   */
  private renderScrollbar(): void {
    this.scrollbarLayer.removeChildren();

    const canvasH = this.options.height;
    const totalH = this.totalTimelineHeight;
    if (totalH <= canvasH) return; // no scrollbar needed

    const trackX = this.options.width - SCROLLBAR_WIDTH;

    // Track background
    const track = new Graphics();
    track.rect(trackX, 0, SCROLLBAR_WIDTH, canvasH);
    track.fill({ color: SCROLLBAR_TRACK_COLOR, alpha: SCROLLBAR_TRACK_ALPHA });
    this.scrollbarLayer.addChild(track);

    // Thumb
    const thumbHeight = Math.max(20, (canvasH / totalH) * canvasH);
    const maxScroll = totalH - canvasH;
    const thumbY = maxScroll > 0
      ? (this._scrollY / maxScroll) * (canvasH - thumbHeight)
      : 0;

    const thumb = new Graphics();
    thumb.roundRect(trackX + 1, thumbY, SCROLLBAR_WIDTH - 2, thumbHeight, 4);
    thumb.fill({ color: SCROLLBAR_THUMB_COLOR, alpha: 0.8 });
    this.scrollbarLayer.addChild(thumb);
  }

  /**
   * Check if a screen-space point is within the scrollbar area.
   */
  isInScrollbarArea(x: number): boolean {
    return x >= this.options.width - SCROLLBAR_WIDTH;
  }

  /**
   * Handle scrollbar pointer down. Returns true if the event was consumed.
   */
  handleScrollbarPointerDown(x: number, y: number): boolean {
    if (!this.isInScrollbarArea(x)) return false;

    const canvasH = this.options.height;
    const totalH = this.totalTimelineHeight;
    if (totalH <= canvasH) return false;

    const thumbHeight = Math.max(20, (canvasH / totalH) * canvasH);
    const maxScroll = totalH - canvasH;
    const thumbY = maxScroll > 0
      ? (this._scrollY / maxScroll) * (canvasH - thumbHeight)
      : 0;

    if (y >= thumbY && y <= thumbY + thumbHeight) {
      // Start dragging thumb
      this.scrollbarDragging = true;
      this.scrollbarDragStartY = y;
      this.scrollbarDragStartScroll = this._scrollY;
    } else {
      // Click on track: jump to position (center the view at click point)
      const ratio = y / canvasH;
      const targetScroll = ratio * totalH - canvasH / 2;
      const newScroll = Math.max(0, Math.min(maxScroll, targetScroll));
      this.options.onScroll?.(newScroll);
    }

    return true;
  }

  /**
   * Handle scrollbar pointer move. Returns true if dragging.
   */
  handleScrollbarPointerMove(_x: number, y: number): boolean {
    if (!this.scrollbarDragging) return false;

    const canvasH = this.options.height;
    const totalH = this.totalTimelineHeight;
    const thumbHeight = Math.max(20, (canvasH / totalH) * canvasH);
    const maxScroll = totalH - canvasH;

    const trackRange = canvasH - thumbHeight;
    if (trackRange <= 0) return true;

    const deltaY = y - this.scrollbarDragStartY;
    const deltaScroll = (deltaY / trackRange) * maxScroll;
    const newScroll = Math.max(0, Math.min(maxScroll, this.scrollbarDragStartScroll + deltaScroll));
    this.options.onScroll?.(newScroll);

    return true;
  }

  /**
   * Handle scrollbar pointer up.
   */
  handleScrollbarPointerUp(): void {
    this.scrollbarDragging = false;
  }

  /**
   * Setup canvas-level pointer events for scrollbar drag interaction.
   */
  private setupScrollbarEvents(): void {
    const canvas = this.options.canvas;
    canvas.addEventListener('pointerup', this.boundScrollbarPointerUp);
    canvas.addEventListener('pointerleave', this.boundScrollbarPointerUp);
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (!this.initialized) return;
    const canvas = this.options.canvas;
    canvas.removeEventListener('pointerup', this.boundScrollbarPointerUp);
    canvas.removeEventListener('pointerleave', this.boundScrollbarPointerUp);
    this.initialized = false;
    this.app.destroy(true, { children: true });
  }
}
