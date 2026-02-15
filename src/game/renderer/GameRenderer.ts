/**
 * PixiJS v8 Game Renderer
 *
 * Renders notes, judgment line, effects, and UI for the rhythm game.
 * Uses object pooling for performance. Rendering is driven by external game loop.
 */

import { Application, Container, Graphics, Text, TextStyle, FillGradient } from "pixi.js";
import type { FillInput } from "pixi.js";
import type { NoteEntity, TrillZone, BpmMarker, EventMarker } from "../../shared";
import { beatToMs, extractBpmMarkers, extractTimeSignatures, measureStartBeat } from "../../shared";
import { JudgmentGrade } from "../../shared";
import {
  LANE_COUNT,
  LANE_WIDTH,
  LANE_AREA_WIDTH,
  LANE_AREA_X,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  JUDGMENT_LINE_OFFSET,
  COLORS,
} from "./constants";

export interface GameRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

interface NoteRenderData {
  entity: NoteEntity;
  index: number;
  timeMs: number;
  endTimeMs?: number; // for range notes
}

export class GameRenderer {
  private app: Application;
  private initialized: boolean = false;

  // Layers (bottom to top)
  private backgroundLayer: Container;
  private keyBeamLayer: Container;
  private measureLineLayer: Container;
  private trillZoneLayer: Container;
  private longNoteBodyLayer: Container;
  private longNoteEndLayer: Container;
  private longNoteHeadLayer: Container;
  private noteLayer: Container;
  private judgmentLineGraphic: Graphics;
  private effectLayer: Container;
  private uiLayer: Container;

  // Rendering state
  private _scrollSpeed: number = 800; // pixels per second
  private _judgmentLineY: number;
  // Chart data
  private noteRenderData: NoteRenderData[] = [];
  private trillZones: readonly TrillZone[] = [];
  private bpmMarkers: readonly BpmMarker[] = [];
  private measureTimesMs: number[] = [];
  private offsetMs: number = 0;

  // Visual state
  private judgmentTimer: number = 0;

  // Object pools
  private noteGraphicsPool: Map<number, Graphics> = new Map();
  private bodyGraphicsPool: Map<number, Graphics> = new Map();
  private failedBodies: Set<number> = new Set();

  // Lane flash
  private keyBeamGraphics: Graphics[] = [];

  // Gradient cache
  private bodyGradientCache = new Map<number, FillGradient>();
  private keyBeamGradient: FillGradient | null = null;

  // UI elements
  private comboText: Text;
  private accuracyText: Text;
  private judgmentText: Text;

  // Dimensions
  private width: number;
  private height: number;

  private canvas: HTMLCanvasElement;

  constructor(options: GameRendererOptions) {
    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this._judgmentLineY = options.height - JUDGMENT_LINE_OFFSET;

    this.app = new Application();

    // Pre-create layers
    this.backgroundLayer = new Container();
    this.keyBeamLayer = new Container();
    this.measureLineLayer = new Container();
    this.trillZoneLayer = new Container();
    this.longNoteBodyLayer = new Container();
    this.longNoteEndLayer = new Container();
    this.longNoteHeadLayer = new Container();
    this.noteLayer = new Container();
    this.judgmentLineGraphic = new Graphics();
    this.effectLayer = new Container();
    this.uiLayer = new Container();

    // Create UI text objects (top→bottom: combo, accuracy, judgment)
    const comboStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 48,
      fontWeight: "bold",
      fill: COLORS.COMBO_TEXT,
      align: "center",
    });
    this.comboText = new Text({ text: "", style: comboStyle });
    this.comboText.anchor.set(0.5, 0.5);
    this.comboText.x = this.width / 2;
    this.comboText.y = this._judgmentLineY - 130;

    const accuracyStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 20,
      fill: 0xaaaaaa,
      align: "center",
    });
    this.accuracyText = new Text({ text: "", style: accuracyStyle });
    this.accuracyText.anchor.set(0.5, 0.5);
    this.accuracyText.x = this.width / 2;
    this.accuracyText.y = this._judgmentLineY - 85;

    const judgmentStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 36,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
    });
    this.judgmentText = new Text({ text: "", style: judgmentStyle });
    this.judgmentText.anchor.set(0.5, 0.5);
    this.judgmentText.x = this.width / 2;
    this.judgmentText.y = this._judgmentLineY - 45;
    this.judgmentText.alpha = 0;
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      backgroundColor: COLORS.BG,
    });

    // Build scene graph
    this.app.stage.addChild(this.backgroundLayer);
    this.app.stage.addChild(this.keyBeamLayer);
    this.app.stage.addChild(this.measureLineLayer);
    this.app.stage.addChild(this.trillZoneLayer);
    this.app.stage.addChild(this.longNoteBodyLayer);
    this.app.stage.addChild(this.longNoteEndLayer);
    this.app.stage.addChild(this.longNoteHeadLayer);
    this.app.stage.addChild(this.noteLayer);
    this.app.stage.addChild(this.judgmentLineGraphic);
    this.app.stage.addChild(this.effectLayer);
    this.app.stage.addChild(this.uiLayer);

    this.uiLayer.addChild(this.comboText);
    this.uiLayer.addChild(this.accuracyText);
    this.uiLayer.addChild(this.judgmentText);

    // Draw static elements
    this.drawBackground();
    this.drawJudgmentLine();
    this.buildKeyBeams();
    this.initialized = true;
  }

  private drawBackground(): void {
    const bg = new Graphics();

    // Draw lane backgrounds
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = LANE_AREA_X + i * LANE_WIDTH;
      const color = i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
      bg.rect(x, 0, LANE_WIDTH, this.height);
      bg.fill(color);
    }

    // Draw lane separators
    for (let i = 1; i < LANE_COUNT; i++) {
      const x = LANE_AREA_X + i * LANE_WIDTH;
      bg.rect(x - 1, 0, 2, this.height);
      bg.fill(COLORS.LANE_SEPARATOR);
    }

    this.backgroundLayer.addChild(bg);
  }

  private buildKeyBeams(): void {
    this.keyBeamGradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0.5 },
      end: { x: 1, y: 0.5 },
      colorStops: [
        { offset: 0, color: 'rgba(255,255,255,0)' },
        { offset: 0.5, color: 'rgba(255,255,255,1)' },
        { offset: 1, color: 'rgba(255,255,255,0)' },
      ],
      textureSpace: 'local',
    });

    const segments = 24;
    const segmentHeight = Math.ceil(this.height / segments);

    for (let i = 0; i < LANE_COUNT; i++) {
      const flash = new Graphics();
      const laneX = LANE_AREA_X + i * LANE_WIDTH;

      for (let s = 0; s < segments; s++) {
        const t = s / (segments - 1); // 0 at top, 1 at bottom
        const alpha = 0.5 * t;
        flash.rect(laneX, s * segmentHeight, LANE_WIDTH, segmentHeight + 1);
        flash.fill({ fill: this.keyBeamGradient, alpha });
      }

      flash.visible = false;
      this.keyBeamGraphics.push(flash);
      this.keyBeamLayer.addChild(flash);
    }
  }

  setKeyBeam(lane: number, pressed: boolean): void {
    const idx = lane - 1;
    if (idx >= 0 && idx < this.keyBeamGraphics.length) {
      this.keyBeamGraphics[idx].visible = pressed;
    }
  }

  private drawJudgmentLine(): void {
    this.judgmentLineGraphic.clear();
    this.judgmentLineGraphic.rect(
      LANE_AREA_X,
      this._judgmentLineY - 2,
      LANE_AREA_WIDTH,
      4
    );
    this.judgmentLineGraphic.fill(COLORS.JUDGMENT_LINE);
  }

  setChart(
    notes: readonly NoteEntity[],
    trillZones: readonly TrillZone[],
    events: readonly EventMarker[],
    offsetMs: number,
    durationMs: number = 0,
  ): void {
    const bpmMarkers = extractBpmMarkers(events);
    const timeSignatures = extractTimeSignatures(events);

    this.bpmMarkers = bpmMarkers;
    this.offsetMs = offsetMs;
    this.trillZones = trillZones;

    // Pre-compute note times
    this.noteRenderData = notes.map((entity, index) => {
      const timeMs = beatToMs(entity.beat, bpmMarkers, offsetMs);
      const endTimeMs =
        "endBeat" in entity
          ? beatToMs(entity.endBeat, bpmMarkers, offsetMs)
          : undefined;

      return {
        entity,
        index,
        timeMs,
        endTimeMs,
      };
    });

    // Pre-compute measure start times up to audio duration
    this.measureTimesMs = [];
    if (bpmMarkers.length > 0 && timeSignatures.length > 0 && durationMs > 0) {
      for (let m = 0; ; m++) {
        const mBeat = measureStartBeat(m, timeSignatures);
        const mMs = beatToMs(mBeat, bpmMarkers, offsetMs);
        if (mMs > durationMs) break;
        this.measureTimesMs.push(mMs);
      }
    }

    // Clear pools
    this.noteGraphicsPool.clear();
    this.bodyGraphicsPool.clear();
    this.failedBodies.clear();

  }

  renderFrame(songTimeMs: number): void {
    // Update judgment text fade
    if (this.judgmentTimer > 0) {
      this.judgmentTimer -= 16; // ~16ms per frame (60fps assumption)
      this.judgmentText.alpha = Math.max(0, this.judgmentTimer / 500);
    }

    // Clear dynamic layers
    this.measureLineLayer.removeChildren();
    this.trillZoneLayer.removeChildren();
    this.longNoteBodyLayer.removeChildren();
    this.longNoteEndLayer.removeChildren();
    this.longNoteHeadLayer.removeChildren();
    this.noteLayer.removeChildren();

    // Calculate visible time window
    const visibleWindowMs = (this.height / this._scrollSpeed) * 1000 + 500;
    const minTime = songTimeMs - 500;
    const maxTime = songTimeMs + visibleWindowMs;

    // Render measure lines
    this.renderMeasureLines(songTimeMs);

    // Render trill zones
    this.renderTrillZones(songTimeMs);

    // Render notes
    for (const data of this.noteRenderData) {
      const { entity, index, timeMs, endTimeMs } = data;

      // Skip notes outside visible window
      if (endTimeMs !== undefined) {
        if (endTimeMs < minTime || timeMs > maxTime) continue;
      } else {
        if (timeMs < minTime || timeMs > maxTime) continue;
      }

      if ("endBeat" in entity) {
        // Range note (long body)
        this.renderLongNote(entity, index, timeMs, endTimeMs!, songTimeMs);
      } else {
        // Point note
        this.renderPointNote(entity, index, timeMs, songTimeMs);
      }
    }
  }

  private renderMeasureLines(songTimeMs: number): void {
    for (const mMs of this.measureTimesMs) {
      const y = this.calculateNoteY(mMs, songTimeMs);
      if (y < -2 || y > this.height + 2) continue;

      const line = new Graphics();
      line.rect(LANE_AREA_X, y - 1, LANE_AREA_WIDTH, 1);
      line.fill({ color: COLORS.MEASURE_LINE, alpha: COLORS.MEASURE_LINE_ALPHA });
      this.measureLineLayer.addChild(line);
    }
  }

  private renderTrillZones(songTimeMs: number): void {
    for (const zone of this.trillZones) {
      const startMs = beatToMs(zone.beat, this.bpmMarkers, this.offsetMs);
      const endMs = beatToMs(zone.endBeat, this.bpmMarkers, this.offsetMs);

      const startY = this.calculateNoteY(startMs, songTimeMs);
      const endY = this.calculateNoteY(endMs, songTimeMs);

      // Only render if visible
      if (startY < -50 || endY > this.height + 50) continue;

      const zoneGraphic = new Graphics();
      const laneX = this.getLaneX(zone.lane);

      const rawHeight = startY - endY;
      const height = rawHeight > 0 ? rawHeight : NOTE_HEIGHT;
      const adjustedEndY = rawHeight > 0 ? endY : endY - NOTE_HEIGHT / 2;
      zoneGraphic.rect(laneX, adjustedEndY, LANE_WIDTH, height);
      zoneGraphic.fill({ color: COLORS.TRILL_ZONE_BG, alpha: COLORS.TRILL_ZONE_ALPHA });

      this.trillZoneLayer.addChild(zoneGraphic);
    }
  }

  private renderPointNote(
    entity: NoteEntity,
    index: number,
    timeMs: number,
    songTimeMs: number
  ): void {
    const y = this.calculateNoteY(timeMs, songTimeMs);

    // Skip if above screen
    if (y < -NOTE_HEIGHT) return;

    const graphic = this.getOrCreateNoteGraphic(index);
    const laneX = this.getLaneX(entity.lane);

    graphic.x = laneX;
    graphic.y = y;

    // Draw note shape
    this.drawNoteShape(graphic, entity.type);

    this.noteLayer.addChild(graphic);
  }

  private renderLongNote(
    entity: NoteEntity & { endBeat: unknown },
    index: number,
    startMs: number,
    endMs: number,
    songTimeMs: number
  ): void {
    const startY = this.calculateNoteY(startMs, songTimeMs);
    const endY = this.calculateNoteY(endMs, songTimeMs);

    const laneX = this.getLaneX(entity.lane);
    const bodyHeight = startY - endY;

    // Skip if completely above screen
    if (endY < -NOTE_HEIGHT && startY < -NOTE_HEIGHT) return;

    const isFailed = this.failedBodies.has(index);

    // Draw body
    const bodyGraphic = this.getOrCreateBodyGraphic(index);
    bodyGraphic.clear();
    bodyGraphic.x = laneX;
    bodyGraphic.y = endY;

    const bodyColor = isFailed
      ? COLORS.LONG_BODY_FAILED
      : this.getLongBodyColor(entity.type);

    // Draw rectangular body for all long note types (horizontal gradient)
    const bodyGradient = this.getBodyGradient(bodyColor);
    bodyGraphic.rect(0, 0, LANE_WIDTH, bodyHeight);
    bodyGraphic.fill(bodyGradient);

    // trillLong: fill diamond corner gaps with body color
    if (entity.type === "trillLong" && bodyHeight > 0) {
      const hw = NOTE_WIDTH / 2;
      const hh = NOTE_HEIGHT / 2;
      // Head upper corners (body bottom = bodyHeight)
      bodyGraphic.poly([0, bodyHeight, hw, bodyHeight, 0, bodyHeight + hh]);
      bodyGraphic.fill(bodyColor);
      bodyGraphic.poly([hw, bodyHeight, NOTE_WIDTH, bodyHeight, NOTE_WIDTH, bodyHeight + hh]);
      bodyGraphic.fill(bodyColor);
      // End lower corners (body top = 0, end diamond bottom = NOTE_HEIGHT)
      bodyGraphic.poly([0, hh, hw, NOTE_HEIGHT, 0, NOTE_HEIGHT]);
      bodyGraphic.fill(bodyColor);
      bodyGraphic.poly([NOTE_WIDTH, hh, NOTE_WIDTH, NOTE_HEIGHT, hw, NOTE_HEIGHT]);
      bodyGraphic.fill(bodyColor);
    }

    this.longNoteBodyLayer.addChild(bodyGraphic);

    // Draw end
    if (endY >= -NOTE_HEIGHT && endY <= this.height + NOTE_HEIGHT) {
      const endGraphic = new Graphics();
      endGraphic.x = laneX;
      endGraphic.y = endY;
      this.drawNoteShape(endGraphic, entity.type, { color: bodyColor, alpha: 0.5, gradient: true });
      this.longNoteEndLayer.addChild(endGraphic);
    }

    // Draw head
    if (startY >= -NOTE_HEIGHT && startY <= this.height + NOTE_HEIGHT) {
      const headGraphic = new Graphics();
      headGraphic.x = laneX;
      headGraphic.y = startY;
      this.drawNoteShape(headGraphic, entity.type, { color: bodyColor, gradient: true });
      this.longNoteHeadLayer.addChild(headGraphic);
    }
  }

  private drawNoteShape(
    graphic: Graphics,
    type: string,
    override?: { color?: number; alpha?: number; gradient?: boolean },
  ): void {
    graphic.clear();

    const color = override?.color ?? this.getNoteColor(type);

    // Build fill input
    let fillInput: FillInput;
    if (override?.gradient) {
      const grad = this.getBodyGradient(color);
      fillInput = override?.alpha != null
        ? { fill: grad, alpha: override.alpha }
        : grad;
    } else {
      fillInput = override?.alpha != null
        ? { color, alpha: override.alpha }
        : color;
    }

    if (type === "trill" || type === "trillLong") {
      // Draw diamond (rotated square)
      this.drawDiamond(graphic, fillInput);
    } else {
      // Draw rectangle
      graphic.rect(0, 0, NOTE_WIDTH, NOTE_HEIGHT);
      graphic.fill(fillInput);
    }
  }

  private drawDiamond(graphic: Graphics, fillStyle: FillInput): void {
    const centerX = NOTE_WIDTH / 2;
    const centerY = NOTE_HEIGHT / 2;

    graphic.poly([
      centerX, 0, // top
      NOTE_WIDTH, centerY, // right
      centerX, NOTE_HEIGHT, // bottom
      0, centerY, // left
    ]);
    graphic.fill(fillStyle);
  }

  private getNoteColor(type: string): number {
    switch (type) {
      case "single":
      case "singleLong":
        return COLORS.SINGLE_NOTE;
      case "double":
      case "doubleLong":
        return COLORS.DOUBLE_NOTE;
      case "trill":
      case "trillLong":
        return COLORS.TRILL_NOTE;
      default:
        return COLORS.SINGLE_NOTE;
    }
  }

  private getLongBodyColor(type: string): number {
    switch (type) {
      case "singleLong":
        return COLORS.SINGLE_LONG;
      case "doubleLong":
        return COLORS.DOUBLE_LONG;
      case "trillLong":
        return COLORS.TRILL_LONG;
      default:
        return COLORS.SINGLE_LONG;
    }
  }

  private calculateNoteY(noteTimeMs: number, songTimeMs: number): number {
    return (
      this._judgmentLineY - ((noteTimeMs - songTimeMs) * this._scrollSpeed) / 1000
    );
  }

  private getLaneX(lane: number): number {
    return LANE_AREA_X + (lane - 1) * LANE_WIDTH;
  }

  private getOrCreateNoteGraphic(index: number): Graphics {
    let graphic = this.noteGraphicsPool.get(index);
    if (!graphic) {
      graphic = new Graphics();
      this.noteGraphicsPool.set(index, graphic);
    }
    return graphic;
  }

  private getOrCreateBodyGraphic(index: number): Graphics {
    let graphic = this.bodyGraphicsPool.get(index);
    if (!graphic) {
      graphic = new Graphics();
      this.bodyGraphicsPool.set(index, graphic);
    }
    return graphic;
  }

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

  showJudgment(grade: JudgmentGrade): void {
    this.judgmentTimer = 500; // 500ms fade duration

    // Update text
    const gradeText = grade === "goodTrill" ? "GOOD◇" : grade.toUpperCase();
    this.judgmentText.text = gradeText;

    // Update color
    const color = this.getJudgmentColor(grade);
    this.judgmentText.style.fill = color;

    // Reset alpha
    this.judgmentText.alpha = 1;
  }

  private getJudgmentColor(grade: JudgmentGrade): number {
    switch (grade) {
      case "perfect":
        return COLORS.JUDGMENT_PERFECT;
      case "great":
        return COLORS.JUDGMENT_GREAT;
      case "good":
      case "goodTrill":
        return COLORS.JUDGMENT_GOOD;
      case "bad":
        return COLORS.JUDGMENT_BAD;
      case "miss":
        return COLORS.JUDGMENT_MISS;
      default:
        return COLORS.COMBO_TEXT;
    }
  }

  updateCombo(combo: number): void {
    if (combo > 0) {
      this.comboText.text = `${combo}`;
    } else {
      this.comboText.text = "";
    }
  }

  updateAccuracy(rate: number): void {
    this.accuracyText.text = `${rate.toFixed(2)}%`;
  }

  set scrollSpeed(value: number) {
    this._scrollSpeed = value;
  }

  get scrollSpeed(): number {
    return this._scrollSpeed;
  }

  setLift(y: number): void {
    this._judgmentLineY = this.height - JUDGMENT_LINE_OFFSET - y;
    this.drawJudgmentLine();
    // Update UI positions (top→bottom: combo, accuracy, judgment)
    this.comboText.y = this._judgmentLineY - 130;
    this.accuracyText.y = this._judgmentLineY - 85;
    this.judgmentText.y = this._judgmentLineY - 45;
  }

  setSudden(y: number): void {
    // TODO: Implement sudden cover mask
    void y;
  }

  markBodyFailed(noteIndex: number): void {
    this.failedBodies.add(noteIndex);
  }

  dispose(): void {
    if (!this.initialized) return;
    this.initialized = false;
    this.app.destroy(true, { children: true, texture: true });
    this.noteGraphicsPool.clear();
    this.bodyGraphicsPool.clear();
    this.failedBodies.clear();
    this.keyBeamGraphics = [];
    for (const g of this.bodyGradientCache.values()) g.destroy();
    this.bodyGradientCache.clear();
    if (this.keyBeamGradient) {
      this.keyBeamGradient.destroy();
      this.keyBeamGradient = null;
    }
  }
}
