/**
 * PixiJS v8 Game Renderer
 *
 * Renders notes, judgment line, effects, and UI for the rhythm game.
 * Uses object pooling for performance. Rendering is driven by external game loop.
 */

import { Application, Container, Graphics, Text, TextStyle, Sprite, AnimatedSprite, FillGradient } from "pixi.js";
import type { NoteEntity, TrillZone, BpmMarker, ChartEvent } from "../../shared";
import { beatToMs, extractBpmMarkers, extractTimeSignatures, measureStartBeat } from "../../shared";
import { JudgmentGrade } from "../../shared";
import type { SkinManager } from "../skin";
import {
  LANE_COUNT,
  LANE_WIDTH,
  LANE_AREA_WIDTH,
  NOTE_HEIGHT,
  JUDGMENT_LINE_OFFSET,
  COLORS,
} from "./constants";
import { KeyboardDisplay } from "./KeyboardDisplay";
import { JudgmentUI } from "./JudgmentUI";
import { GameNoteRenderer } from "./GameNoteRenderer";

export interface GameRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resolution?: number;
  skinManager: SkinManager;
}

interface NoteRenderData {
  entity: NoteEntity;
  index: number;
  timeMs: number;
  endTimeMs?: number; // for range notes
}

interface TextEventRenderData {
  text: string;
  startMs: number;
  endMs: number;
}

interface AutoEventRenderData {
  startMs: number;
  endMs: number;
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
  private maskGraphic: Graphics;
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
  private textEvents: TextEventRenderData[] = [];
  private autoEvents: AutoEventRenderData[] = [];

  // Skin
  private skinManager: SkinManager;

  // Object pools for dynamic graphics
  private measureLinePool: Graphics[] = [];
  private trillZonePool: Graphics[] = [];

  // Lane flash
  private keyBeamGraphics: Graphics[] = [];
  private keyBeamGradient: FillGradient | null = null;

  // Button sprites (per lane)
  private buttonSprites: Sprite[] = [];

  // UI elements
  private comboText: Text;
  private accuracyText: Text;
  private eventMessageText: Text;

  // Dimensions
  private width: number;
  private height: number;

  private canvas: HTMLCanvasElement;

  // Keyboard layout display
  private keyboardDisplay: KeyboardDisplay | null = null;

  private resolution: number;
  private laneAreaX: number;

  // Sub-renderers
  private judgmentUI!: JudgmentUI;
  private noteRenderer!: GameNoteRenderer;

  constructor(options: GameRendererOptions) {
    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.resolution = options.resolution ?? 1;
    this.laneAreaX = (this.width - LANE_AREA_WIDTH) / 2;
    this._judgmentLineY = options.height - JUDGMENT_LINE_OFFSET;
    this.skinManager = options.skinManager;

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
    this.maskGraphic = new Graphics();
    this.judgmentLineGraphic = new Graphics();
    this.effectLayer = new Container();
    this.uiLayer = new Container();

    // Create combo / accuracy text (owned by GameRenderer)
    const comboStyle = new TextStyle({
      fontFamily: "'Alumni Sans Collegiate One'",
      fontSize: 120,
      fill: COLORS.COMBO_TEXT,
      align: "center",
    });
    this.comboText = new Text({ text: "", style: comboStyle });
    this.comboText.anchor.set(0.5, 0.5);
    this.comboText.alpha = 0.5;
    this.comboText.x = this.width / 2;
    this.comboText.y = this.height / 2 - 80;

    const accuracyStyle = new TextStyle({
      fontFamily: "'Zen Dots'",
      fontSize: 20,
      fill: 0xaaaaaa,
      align: "center",
    });
    this.accuracyText = new Text({ text: "00.00%", style: accuracyStyle });
    this.accuracyText.anchor.set(0.5, 0.5);
    this.accuracyText.alpha = 0.5;
    this.accuracyText.x = this.width / 2;
    this.accuracyText.y = this.height / 2 + 20;

    // Event message text (right side)
    const msgStyle = new TextStyle({
      fontFamily: "sans-serif",
      fontSize: 22,
      fill: 0xffffff,
      align: "right",
      wordWrap: true,
      wordWrapWidth: Math.max(120, (this.width - LANE_AREA_WIDTH) / 2 - 40),
    });
    this.eventMessageText = new Text({ text: "", style: msgStyle });
    this.eventMessageText.anchor.set(1, 0);
    this.eventMessageText.x = this.width - 20;
    this.eventMessageText.y = 40;
    this.eventMessageText.alpha = 0.9;
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      resolution: this.resolution,
      backgroundColor: this.skinManager.getTheme().bg,
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
    this.app.stage.addChild(this.maskGraphic);
    this.app.stage.addChild(this.judgmentLineGraphic);
    this.app.stage.addChild(this.effectLayer);
    this.app.stage.addChild(this.uiLayer);

    this.uiLayer.addChild(this.comboText);
    this.uiLayer.addChild(this.accuracyText);
    this.uiLayer.addChild(this.eventMessageText);

    // Create sub-renderers (after uiLayer is ready)
    this.judgmentUI = new JudgmentUI(this.uiLayer, this._judgmentLineY, this.width, this.height);
    this.noteRenderer = new GameNoteRenderer(
      this.longNoteBodyLayer,
      this.longNoteEndLayer,
      this.longNoteHeadLayer,
      this.noteLayer,
      this.skinManager,
      this._judgmentLineY,
      this._scrollSpeed,
      this.laneAreaX,
      this.height,
    );

    // Draw static elements
    this.drawBackground();
    this.drawJudgmentLine();
    this.drawMask();
    this.buildKeyBeams();
    this.buildButtons();
    this.initialized = true;
  }

  private drawBackground(): void {
    const bg = new Graphics();

    for (let i = 0; i < LANE_COUNT; i++) {
      const x = this.laneAreaX + i * LANE_WIDTH;
      const color = i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
      bg.rect(x, 0, LANE_WIDTH, this.height);
      bg.fill(color);
    }

    for (let i = 1; i < LANE_COUNT; i++) {
      const x = this.laneAreaX + i * LANE_WIDTH;
      bg.rect(x - 1, 0, 2, this.height);
      bg.fill(COLORS.LANE_SEPARATOR);
    }

    this.backgroundLayer.addChild(bg);
  }

  private buildKeyBeams(): void {
    const bc = this.skinManager.getTheme().beamColor;
    const br = (bc >> 16) & 0xff;
    const bg = (bc >> 8) & 0xff;
    const bb = bc & 0xff;
    this.keyBeamGradient = new FillGradient({
      type: "linear",
      start: { x: 0.5, y: 0 },
      end: { x: 0.5, y: 1 },
      colorStops: [
        { offset: 0, color: `rgba(${br},${bg},${bb},0)` },
        { offset: 1, color: `rgba(${br},${bg},${bb},1)` },
      ],
      textureSpace: "local",
    });

    for (let i = 0; i < LANE_COUNT; i++) {
      const flash = new Graphics();
      const laneX = this.laneAreaX + i * LANE_WIDTH;

      flash.rect(laneX, 0, LANE_WIDTH, this.height);
      flash.fill({ fill: this.keyBeamGradient, alpha: 0.5 });

      flash.visible = false;
      this.keyBeamGraphics.push(flash);
      this.keyBeamLayer.addChild(flash);
    }
  }

  private buildButtons(): void {
    const BTN_SIZE = 40;
    for (let i = 0; i < LANE_COUNT; i++) {
      const texKey = `buttonIdle${i}`;
      let tex;
      try { tex = this.skinManager.getTexture(texKey); } catch { continue; }
      const sprite = new Sprite(tex);
      sprite.width = BTN_SIZE;
      sprite.height = BTN_SIZE;
      sprite.anchor.set(0.5, 0);
      sprite.x = this.laneAreaX + i * LANE_WIDTH + LANE_WIDTH / 2;
      sprite.y = this._judgmentLineY + 4;
      sprite.alpha = 0.8;
      this.buttonSprites.push(sprite);
      this.backgroundLayer.addChild(sprite);
    }
  }

  setKeyBeam(lane: number, pressed: boolean): void {
    const idx = lane - 1;
    if (idx >= 0 && idx < this.keyBeamGraphics.length) {
      this.keyBeamGraphics[idx].visible = pressed;
    }
    if (idx >= 0 && idx < this.buttonSprites.length) {
      const texKey = pressed ? `buttonPressed${idx}` : `buttonIdle${idx}`;
      try {
        this.buttonSprites[idx].texture = this.skinManager.getTexture(texKey);
        this.buttonSprites[idx].alpha = pressed ? 1 : 0.8;
      } catch { /* 텍스처 미로드 시 무시 */ }
    }
  }

  private drawJudgmentLine(): void {
    this.judgmentLineGraphic.clear();
    this.judgmentLineGraphic.rect(
      this.laneAreaX,
      this._judgmentLineY - 2,
      LANE_AREA_WIDTH,
      4
    );
    this.judgmentLineGraphic.fill(COLORS.JUDGMENT_LINE);
  }

  private drawMask(): void {
    this.maskGraphic.clear();
    const maskY = this._judgmentLineY + 2; // just below the judgment line
    const maskHeight = this.height - maskY;
    if (maskHeight <= 0) return;
    this.maskGraphic.rect(this.laneAreaX, maskY, LANE_AREA_WIDTH, maskHeight);
    this.maskGraphic.fill(COLORS.MASK_BELOW_JUDGMENT);
  }

  setChart(
    notes: readonly NoteEntity[],
    trillZones: readonly TrillZone[],
    events: readonly ChartEvent[],
    offsetMs: number,
    durationMs: number = 0,
  ): void {
    const bpmMarkers = extractBpmMarkers(events);
    const timeSignatures = extractTimeSignatures(events);

    this.bpmMarkers = bpmMarkers;
    this.offsetMs = offsetMs;
    this.trillZones = trillZones;

    this.noteRenderData = notes.map((entity, index) => {
      const timeMs = beatToMs(entity.beat, bpmMarkers, offsetMs);
      const endTimeMs =
        "endBeat" in entity
          ? beatToMs(entity.endBeat, bpmMarkers, offsetMs)
          : undefined;

      return { entity, index, timeMs, endTimeMs };
    });

    this.measureTimesMs = [];
    if (bpmMarkers.length > 0 && timeSignatures.length > 0 && durationMs > 0) {
      for (let m = 0; ; m++) {
        const mBeat = measureStartBeat(m, timeSignatures);
        const mMs = beatToMs(mBeat, bpmMarkers, offsetMs);
        if (mMs > durationMs) break;
        this.measureTimesMs.push(mMs);
      }
    }

    // Extract text/auto events with time ranges
    this.textEvents = [];
    this.autoEvents = [];
    for (const evt of events) {
      if (evt.type === "text") {
        this.textEvents.push({
          text: evt.text,
          startMs: beatToMs(evt.beat, bpmMarkers, offsetMs),
          endMs: beatToMs(evt.endBeat, bpmMarkers, offsetMs),
        });
      } else if (evt.type === "auto") {
        this.autoEvents.push({
          startMs: beatToMs(evt.beat, bpmMarkers, offsetMs),
          endMs: beatToMs(evt.endBeat, bpmMarkers, offsetMs),
        });
      }
    }

    this.noteRenderer.clearPools();
  }

  renderFrame(songTimeMs: number, deltaMs: number = 16): void {
    this.judgmentUI.updateFade(deltaMs);

    // Hide all pooled graphics
    for (const g of this.measureLinePool) g.visible = false;
    for (const g of this.trillZonePool) g.visible = false;
    this.longNoteBodyLayer.removeChildren();
    this.longNoteEndLayer.removeChildren();
    this.longNoteHeadLayer.removeChildren();
    this.noteLayer.removeChildren();

    const visibleWindowMs = (this.height / this._scrollSpeed) * 1000 + 500;
    const minTime = songTimeMs - 500;
    const maxTime = songTimeMs + visibleWindowMs;

    this.renderMeasureLines(songTimeMs);
    this.renderTrillZones(songTimeMs);

    for (const data of this.noteRenderData) {
      const { entity, index, timeMs, endTimeMs } = data;

      if (endTimeMs !== undefined) {
        if (endTimeMs < minTime || timeMs > maxTime) continue;
      } else {
        if (timeMs < minTime || timeMs > maxTime) continue;
      }

      if ("endBeat" in entity) {
        this.noteRenderer.renderLongNote(entity, index, timeMs, endTimeMs!, songTimeMs);
      } else {
        this.noteRenderer.renderPointNote(entity, index, timeMs, songTimeMs);
      }
    }

    // Render active text events on the right side
    this.renderTextEvents(songTimeMs);
  }

  private getMeasureLineFromPool(index: number): Graphics {
    if (index < this.measureLinePool.length) {
      return this.measureLinePool[index];
    }
    const g = new Graphics();
    this.measureLinePool.push(g);
    this.measureLineLayer.addChild(g);
    return g;
  }

  private getTrillZoneFromPool(index: number): Graphics {
    if (index < this.trillZonePool.length) {
      return this.trillZonePool[index];
    }
    const g = new Graphics();
    this.trillZonePool.push(g);
    this.trillZoneLayer.addChild(g);
    return g;
  }

  private renderMeasureLines(songTimeMs: number): void {
    let poolIdx = 0;
    for (const mMs of this.measureTimesMs) {
      const y = this.noteRenderer.calculateNoteY(mMs, songTimeMs);
      if (y < -2 || y > this.height + 2) continue;

      const line = this.getMeasureLineFromPool(poolIdx++);
      line.clear();
      line.rect(this.laneAreaX, y - 1, LANE_AREA_WIDTH, 1);
      line.fill({ color: COLORS.MEASURE_LINE, alpha: COLORS.MEASURE_LINE_ALPHA });
      line.visible = true;
    }
  }

  private renderTrillZones(songTimeMs: number): void {
    let poolIdx = 0;
    for (const zone of this.trillZones) {
      const startMs = beatToMs(zone.beat, this.bpmMarkers, this.offsetMs);
      const endMs = beatToMs(zone.endBeat, this.bpmMarkers, this.offsetMs);

      const startY = this.noteRenderer.calculateNoteY(startMs, songTimeMs);
      const endY = this.noteRenderer.calculateNoteY(endMs, songTimeMs);

      if (startY < -50 || endY > this.height + 50) continue;

      const zoneGraphic = this.getTrillZoneFromPool(poolIdx++);
      zoneGraphic.clear();
      const laneX = this.noteRenderer.getLaneX(zone.lane);

      const hh = NOTE_HEIGHT / 2;
      const rawHeight = startY - endY;
      const height = (rawHeight > 0 ? rawHeight : NOTE_HEIGHT) + NOTE_HEIGHT; // 위아래 hh씩 확장
      const adjustedEndY = (rawHeight > 0 ? endY : endY - hh) - hh;
      zoneGraphic.rect(laneX, adjustedEndY, LANE_WIDTH, height);
      zoneGraphic.fill({ color: COLORS.TRILL_ZONE_BG, alpha: COLORS.TRILL_ZONE_ALPHA });
      zoneGraphic.visible = true;
    }
  }

  private renderTextEvents(songTimeMs: number): void {
    // 현재 시간에 활성화된 텍스트 이벤트 중 마지막 것을 표시
    let activeText = "";
    for (const evt of this.textEvents) {
      if (songTimeMs >= evt.startMs && songTimeMs <= evt.endMs) {
        activeText = evt.text;
      }
    }
    this.eventMessageText.text = activeText;
  }

  /** 현재 시간이 auto 구간 내인지 반환 */
  isAutoSection(songTimeMs: number): boolean {
    for (const evt of this.autoEvents) {
      if (songTimeMs >= evt.startMs && songTimeMs <= evt.endMs) {
        return true;
      }
    }
    return false;
  }

  showJudgment(grade: JudgmentGrade, deltaMs?: number): void {
    this.judgmentUI.showJudgment(grade, deltaMs);
  }

  /** 노트 판정 시 봄 이펙트 재생 */
  showBombEffect(lane: number): void {
    const textures = this.skinManager.getBombTextures();
    if (textures.length === 0) return;

    const anim = new AnimatedSprite(textures);
    anim.anchor.set(0.5, 0.5);
    anim.x = this.noteRenderer.getLaneX(lane) + LANE_WIDTH / 2;
    anim.y = this._judgmentLineY;
    anim.width = 120;
    anim.height = 120;
    anim.animationSpeed = 1;
    anim.loop = false;
    anim.onComplete = () => { anim.destroy(); };
    anim.play();
    this.effectLayer.addChild(anim);
  }

  setShowFastSlow(enabled: boolean): void {
    this.judgmentUI.setShowFastSlow(enabled);
  }

  setShowTimingDiff(enabled: boolean): void {
    this.judgmentUI.setShowTimingDiff(enabled);
  }

  setPerfectWindow(windowMs: number): void {
    this.judgmentUI.setPerfectWindow(windowMs);
  }

  updateCombo(combo: number): void {
    this.comboText.text = combo > 0 ? `${combo}` : "";
  }

  updateAccuracy(rate: number): void {
    this.accuracyText.text = `${rate.toFixed(2)}%`;
  }

  set scrollSpeed(value: number) {
    this._scrollSpeed = value;
    if (this.noteRenderer) {
      this.noteRenderer.setScrollSpeed(value);
    }
  }

  get scrollSpeed(): number {
    return this._scrollSpeed;
  }

  setLift(y: number): void {
    this._judgmentLineY = this.height - JUDGMENT_LINE_OFFSET - y;
    this.drawJudgmentLine();
    this.drawMask();
    this.comboText.y = this.height / 2 - 80;
    this.accuracyText.y = this.height / 2 + 20;
    this.judgmentUI.setPosition(this._judgmentLineY, this.height);
    this.noteRenderer.setJudgmentLineY(this._judgmentLineY);
    for (const btn of this.buttonSprites) {
      btn.y = this._judgmentLineY + 4;
    }
  }

  setSudden(y: number): void {
    // TODO: Implement sudden cover mask
    void y;
  }

  setupKeyboardDisplay(laneBindings: Map<string, number>): void {
    if (this.keyboardDisplay) {
      this.keyboardDisplay.dispose();
      this.keyboardDisplay = null;
    }

    this.keyboardDisplay = new KeyboardDisplay(this.uiLayer, this.width, this.height);
    this.keyboardDisplay.setup(laneBindings, []);
  }

  setKeyState(keyCode: string, pressed: boolean): void {
    this.keyboardDisplay?.setKeyState(keyCode, pressed);
  }

  markBodyFailed(noteIndex: number): void {
    this.noteRenderer.markBodyFailed(noteIndex);
  }

  markBodyPartialFailed(noteIndex: number, side: 'left' | 'right'): void {
    this.noteRenderer.markBodyPartialFailed(noteIndex, side);
  }

  markNoteProcessed(noteIndex: number): void {
    this.noteRenderer.markNoteProcessed(noteIndex);
  }

  markDoublePartial(noteIndex: number): void {
    this.noteRenderer.markDoublePartial(noteIndex);
  }

  markNoteMissed(noteIndex: number): void {
    this.noteRenderer.markNoteMissed(noteIndex);
  }

  dispose(): void {
    if (!this.initialized) return;
    this.initialized = false;
    this.app.destroy(true, { children: true, texture: true });
    this.noteRenderer.dispose();
    this.judgmentUI.dispose();
    this.keyBeamGraphics = [];
    this.buttonSprites = [];
    if (this.keyboardDisplay) {
      this.keyboardDisplay.dispose();
      this.keyboardDisplay = null;
    }
    if (this.keyBeamGradient) {
      this.keyBeamGradient.destroy();
      this.keyBeamGradient = null;
    }
  }
}
