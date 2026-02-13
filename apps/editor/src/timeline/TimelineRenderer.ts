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
  NoteEntity,
  PointNote,
  RangeNote,
} from "@not4k/shared";
import { beatToMs } from "@not4k/shared";
import {
  LANE_COUNT,
  LANE_WIDTH,
  AUX_LANE_WIDTH,
  NOTE_HEIGHT,
  TIMELINE_WIDTH,
  DEFAULT_MEASURES,
  TIMELINE_PADDING,
  COLORS,
} from "./constants";
import type { Lane } from "@not4k/shared";

export interface TimelineRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
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

  // State
  private _zoom: number = 200; // pixelPerSecond
  private _scrollY: number = 0;
  private _snap: number = 4; // 1/4 beat snap
  private _selectedNotes: Set<number> = new Set();

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
   * Content height: total timeline or canvas height, whichever is larger.
   */
  private get contentHeight(): number {
    return Math.max(this.totalTimelineHeight, this.options.height);
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
    const { bpmMarkers, meta } = this.chart;
    if (bpmMarkers.length === 0) return 0;

    // ms for one measure (4 beats in 4/4)
    const oneMeasureMs = beatToMs({ n: 4, d: 1 }, bpmMarkers, meta.offsetMs);
    if (oneMeasureMs <= 0) return 0;

    const totalMeasures =
      this.waveformDurationMs > 0
        ? Math.ceil(this.waveformDurationMs / oneMeasureMs)
        : DEFAULT_MEASURES;

    return beatToMs({ n: totalMeasures * 4, d: 1 }, bpmMarkers, meta.offsetMs);
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

    // Auxiliary lanes (BPM, time sig, message)
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    for (let i = 0; i < 3; i++) {
      const bg = new Graphics();
      bg.rect(auxStartX + i * AUX_LANE_WIDTH, topY, AUX_LANE_WIDTH, laneHeight);
      bg.fill(COLORS.AUX_LANE_BG);
      this.laneBackgrounds.addChild(bg);
    }
  }

  /**
   * Update scroll position for all layers
   */
  private updateScroll(): void {
    const layers = [
      this.laneBackgrounds,
      this.waveformLayer,
      this.measureLines,
      this.beatLines,
      this.snapLines,
      this.trillZoneLayer,
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

    for (const layer of layers) {
      layer.y = -this._scrollY;
    }
  }

  /**
   * Full re-render
   */
  render(): void {
    if (!this.chart) return;

    this.clearDynamicLayers();
    this.renderLaneBackgrounds();
    this.renderWaveform();
    this.renderGridLines();
    this.renderTrillZones();
    this.renderNotes();
    this.renderMarkers();
    this.updateScroll();
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

    const waveformWidth = LANE_COUNT * LANE_WIDTH;
    const peaks = this.waveformPeaks;
    const peakCount = peaks.length;

    // Calculate time per peak
    const msPerPeak = this.waveformDurationMs / peakCount;

    const waveform = new Graphics();

    // Draw waveform as a filled shape
    // Start at center line, go up for positive peaks, then back down for negative
    const centerX = waveformWidth / 2;

    // Build the waveform shape
    waveform.moveTo(centerX, this.timeToY(0));

    // Draw upper half (positive peaks)
    for (let i = 0; i < peakCount; i++) {
      const timeMs = i * msPerPeak;
      const y = this.timeToY(timeMs);
      const amplitude = peaks[i];
      const x = centerX + (amplitude * waveformWidth) / 2;
      waveform.lineTo(x, y);
    }

    // Draw lower half (negative peaks) - go back in reverse
    for (let i = peakCount - 1; i >= 0; i--) {
      const timeMs = i * msPerPeak;
      const y = this.timeToY(timeMs);
      const amplitude = peaks[i];
      const x = centerX - (amplitude * waveformWidth) / 2;
      waveform.lineTo(x, y);
    }

    // Close the shape
    waveform.lineTo(centerX, this.timeToY(0));

    // Fill with semi-transparent blue
    waveform.fill({ color: 0x0078ff, alpha: 0.3 });

    this.waveformLayer.addChild(waveform);
  }

  /**
   * Render grid lines (measure, beat, snap)
   */
  private renderGridLines(): void {
    if (!this.chart) return;

    const { bpmMarkers, timeSignatures, meta } = this.chart;
    if (bpmMarkers.length === 0 || timeSignatures.length === 0) return;

    // Calculate total measures from timeline duration
    const totalTimelineMs = this.getTotalTimelineMs();
    const oneMeasureMs = beatToMs({ n: 4, d: 1 }, bpmMarkers, meta.offsetMs);
    const totalMeasures =
      oneMeasureMs > 0 ? Math.ceil(totalTimelineMs / oneMeasureMs) : DEFAULT_MEASURES;
    const maxBeat = totalMeasures * 4;
    let currentBeat = 0;

    while (currentBeat <= maxBeat) {
      const timeMs = beatToMs({ n: currentBeat, d: 1 }, bpmMarkers, meta.offsetMs);

      const y = this.timeToY(timeMs);

      // Measure lines (every beatPerMeasure beats)
      if (currentBeat % 4 === 0) {
        // Simplified: assume 4/4 time for MVP
        const line = new Graphics();
        line.moveTo(0, y);
        line.lineTo(TIMELINE_WIDTH, y);
        line.stroke({ width: 2, color: COLORS.MEASURE_LINE });
        this.measureLines.addChild(line);

        // Measure number label
        const measureNum = currentBeat / 4 + 1;
        const label = new Text({
          text: String(measureNum),
          style: new TextStyle({
            fontSize: 11,
            fill: 0x999999,
            fontFamily: "monospace",
          }),
        });
        label.x = TIMELINE_WIDTH + 4;
        label.y = y - 14;
        this.measureLabels.addChild(label);
      }
      // Beat lines
      else {
        const line = new Graphics();
        line.moveTo(0, y);
        line.lineTo(TIMELINE_WIDTH, y);
        line.stroke({ width: 1, color: COLORS.BEAT_LINE });
        this.beatLines.addChild(line);
      }

      // Snap lines (subdivisions)
      for (let i = 1; i < this._snap; i++) {
        const snapBeat = currentBeat + i / this._snap;
        const snapTimeMs = beatToMs(
          { n: Math.round(snapBeat * this._snap), d: this._snap },
          bpmMarkers,
          meta.offsetMs
        );
        const snapY = this.timeToY(snapTimeMs);
        const snapLine = new Graphics();
        snapLine.moveTo(0, snapY);
        snapLine.lineTo(TIMELINE_WIDTH, snapY);
        snapLine.stroke({ width: 1, color: COLORS.SNAP_LINE, alpha: 0.3 });
        this.snapLines.addChild(snapLine);
      }

      currentBeat++;
    }
  }

  /**
   * Render trill zones
   */
  private renderTrillZones(): void {
    if (!this.chart) return;

    const { trillZones, bpmMarkers, meta } = this.chart;

    for (const zone of trillZones) {
      const startMs = beatToMs(zone.beat, bpmMarkers, meta.offsetMs);
      const endMs = beatToMs(zone.endBeat, bpmMarkers, meta.offsetMs);
      const startY = this.timeToY(startMs);
      const endY = this.timeToY(endMs);

      const x = (zone.lane - 1) * LANE_WIDTH;
      const width = LANE_WIDTH;
      const topY = Math.min(startY, endY);
      const height = Math.abs(endY - startY);

      const bg = new Graphics();
      bg.rect(x, topY, width, height);
      bg.fill({ color: COLORS.TRILL_ZONE, alpha: COLORS.TRILL_ZONE_ALPHA });
      this.trillZoneLayer.addChild(bg);
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

    const { bpmMarkers, meta } = this.chart;
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

    const { bpmMarkers, meta } = this.chart;
    const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
    const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
    const startY = this.timeToY(startMs);
    const endY = this.timeToY(endMs);

    const x = (note.lane - 1) * LANE_WIDTH;
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;

    let bodyColor: number;

    switch (note.type) {
      case "singleLongBody":
        bodyColor = COLORS.SINGLE_LONG_BODY;
        break;
      case "doubleLongBody":
        bodyColor = COLORS.DOUBLE_LONG_BODY;
        break;
      case "trillLongBody":
        bodyColor = COLORS.TRILL_LONG_BODY;
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

      if (isSelected) {
        body.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
        this.selectedLongBodyLayer.addChild(body);
      } else {
        this.longNoteBodyLayer.addChild(body);
      }
    }

    // Long note head (start point)
    const head = new Graphics();
    const headX = x + (LANE_WIDTH - w) / 2;
    const headY = startY - h / 2;
    head.rect(headX, headY, w, h);
    head.fill(bodyColor);

    if (isSelected) {
      head.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.selectedLongHeadLayer.addChild(head);
    } else {
      this.longNoteHeadLayer.addChild(head);
    }

    // Long note end (end point)
    const end = new Graphics();
    const endX = x + (LANE_WIDTH - w) / 2;
    const endNoteY = endY - h / 2;
    end.rect(endX, endNoteY, w, h);
    end.fill(bodyColor);

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

    const { bpmMarkers, timeSignatures, messages, meta } = this.chart;
    const auxStartX = LANE_COUNT * LANE_WIDTH;

    const markerTextStyle = new TextStyle({
      fontSize: 11,
      fill: 0xffffff,
      fontFamily: "monospace",
    });

    // BPM markers (purple, aux index 0)
    for (const marker of bpmMarkers) {
      const timeMs = beatToMs(marker.beat, bpmMarkers, meta.offsetMs);
      const y = this.timeToY(timeMs);
      const gfx = new Graphics();
      gfx.rect(auxStartX, y - NOTE_HEIGHT / 2, AUX_LANE_WIDTH, NOTE_HEIGHT);
      gfx.fill(COLORS.BPM_MARKER);
      this.noteLayer.addChild(gfx);

      const label = new Text({ text: String(marker.bpm), style: markerTextStyle });
      label.anchor.set(0.5, 0.5);
      label.x = auxStartX + AUX_LANE_WIDTH / 2;
      label.y = y;
      this.noteLayer.addChild(label);
    }

    // Time signature markers (red, aux index 1)
    for (const marker of timeSignatures) {
      const timeMs = beatToMs(marker.beat, bpmMarkers, meta.offsetMs);
      const y = this.timeToY(timeMs);
      const gfx = new Graphics();
      gfx.rect(auxStartX + AUX_LANE_WIDTH, y - NOTE_HEIGHT / 2, AUX_LANE_WIDTH, NOTE_HEIGHT);
      gfx.fill(COLORS.TIME_SIG_MARKER);
      this.noteLayer.addChild(gfx);

      const bpm = marker.beatPerMeasure;
      const label = new Text({ text: bpm.d === 1 ? String(bpm.n) : `${bpm.n}/${bpm.d}`, style: markerTextStyle });
      label.anchor.set(0.5, 0.5);
      label.x = auxStartX + AUX_LANE_WIDTH + AUX_LANE_WIDTH / 2;
      label.y = y;
      this.noteLayer.addChild(label);
    }

    // Messages (pink, aux index 2, range)
    for (const msg of messages) {
      const startMs = beatToMs(msg.beat, bpmMarkers, meta.offsetMs);
      const endMs = beatToMs(msg.endBeat, bpmMarkers, meta.offsetMs);
      const startY = this.timeToY(startMs);
      const endY = this.timeToY(endMs);
      const topY = Math.min(startY, endY);
      const height = Math.abs(endY - startY) || NOTE_HEIGHT;
      const gfx = new Graphics();
      gfx.rect(auxStartX + AUX_LANE_WIDTH * 2, topY, AUX_LANE_WIDTH, height);
      gfx.fill(COLORS.MESSAGE_MARKER);
      gfx.stroke({ width: 1.5, color: 0xffbbdd, alignment: 0 });
      this.noteLayer.addChild(gfx);

      const label = new Text({
        text: msg.text,
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
        const truncated = msg.text.length > maxChars ? msg.text.slice(0, maxChars) + '\u2026' : msg.text;
        label.text = truncated;
        label.style.wordWrap = false;
      }
      label.anchor.set(0.5, 0.5);
      label.x = auxStartX + AUX_LANE_WIDTH * 2 + AUX_LANE_WIDTH / 2;
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
   * @param auxIndex 0=BPM, 1=timeSig, 2=message
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
   * Cleanup
   */
  dispose(): void {
    if (!this.initialized) return;
    this.initialized = false;
    this.app.destroy(true, { children: true });
  }
}
