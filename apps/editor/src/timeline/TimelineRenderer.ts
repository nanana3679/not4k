/**
 * PixiJS v8 Timeline Renderer — chart-editor.md §Timeline Layout 기준
 *
 * 7 lanes: 4 note lanes (L1~L4) + BPM + time signature + message
 * 14 z-order layers (back to front)
 * Vertical timeline (time flows top-to-bottom)
 */

import { Application, Container, Graphics } from "pixi.js";
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
  COLORS,
} from "./constants";

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

  // State
  private _zoom: number = 200; // pixelPerSecond
  private _scrollY: number = 0;
  private _snap: number = 4; // 1/4 beat snap
  private _selectedNotes: Set<number> = new Set();

  // Chart data
  private chart: Chart | null = null;

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

    this.renderLaneBackgrounds();
  }

  /**
   * Set the chart data to render
   */
  setChart(chart: Chart): void {
    this.chart = chart;
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
   * Convert time (ms) to Y pixel position
   * Formula: ms * zoom / 1000 - scrollY
   */
  timeToY(timeMs: number): number {
    return (timeMs * this._zoom) / 1000 - this._scrollY;
  }

  /**
   * Convert Y pixel position to time (ms)
   * Formula: (y + scrollY) * 1000 / zoom
   */
  yToTime(y: number): number {
    return ((y + this._scrollY) * 1000) / this._zoom;
  }

  /**
   * Render lane backgrounds (static, no scroll dependency)
   */
  private renderLaneBackgrounds(): void {
    this.laneBackgrounds.removeChildren();

    // Note lanes (L1~L4)
    for (let i = 0; i < LANE_COUNT; i++) {
      const bg = new Graphics();
      const color = i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
      bg.rect(i * LANE_WIDTH, 0, LANE_WIDTH, this.options.height);
      bg.fill(color);
      this.laneBackgrounds.addChild(bg);
    }

    // Auxiliary lanes (BPM, time sig, message)
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    for (let i = 0; i < 3; i++) {
      const bg = new Graphics();
      bg.rect(auxStartX + i * AUX_LANE_WIDTH, 0, AUX_LANE_WIDTH, this.options.height);
      bg.fill(COLORS.AUX_LANE_BG);
      this.laneBackgrounds.addChild(bg);
    }
  }

  /**
   * Update scroll position for all layers
   */
  private updateScroll(): void {
    const layers = [
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
    this.renderGridLines();
    this.renderTrillZones();
    this.renderNotes();
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
  }

  /**
   * Render grid lines (measure, beat, snap)
   */
  private renderGridLines(): void {
    if (!this.chart) return;

    const { bpmMarkers, timeSignatures, meta } = this.chart;
    if (bpmMarkers.length === 0 || timeSignatures.length === 0) return;

    // Calculate visible range
    const endTime = this.yToTime(this.options.height);

    // Render measure lines, beat lines, snap lines
    // For MVP: render from beat 0 to a reasonable upper bound
    const maxBeat = 1000; // Arbitrary upper bound for MVP
    let currentBeat = 0;

    while (currentBeat <= maxBeat) {
      const timeMs = beatToMs({ n: currentBeat, d: 1 }, bpmMarkers, meta.offsetMs);
      if (timeMs > endTime) break;

      const y = this.timeToY(timeMs);

      // Measure lines (every beatPerMeasure beats)
      if (currentBeat % 4 === 0) {
        // Simplified: assume 4/4 time for MVP
        const line = new Graphics();
        line.moveTo(0, y);
        line.lineTo(TIMELINE_WIDTH, y);
        line.stroke({ width: 2, color: COLORS.MEASURE_LINE });
        this.measureLines.addChild(line);
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
      const height = endY - startY;

      const bg = new Graphics();
      bg.rect(x, startY, width, height);
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
      noteGfx.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE });
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

    // Long note body (center strip between start+h/2 and end-h/2)
    const bodyStartY = startY + h / 2;
    const bodyEndY = endY - h / 2;
    const bodyHeight = bodyEndY - bodyStartY;

    if (bodyHeight > 0) {
      const body = new Graphics();
      const bodyX = x + (LANE_WIDTH - w) / 2;
      body.rect(bodyX, bodyStartY, w, bodyHeight);
      body.fill(bodyColor);

      if (isSelected) {
        body.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE });
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
      head.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE });
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
      end.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE });
      this.selectedLongEndLayer.addChild(end);
    } else {
      this.longNoteEndLayer.addChild(end);
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.app.destroy(true, { children: true });
  }
}
