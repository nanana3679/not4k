/**
 * PixiJS v8 Game Renderer
 *
 * Renders notes, judgment line, effects, and UI for the rhythm game.
 * Uses object pooling for performance. Rendering is driven by external game loop.
 */

import { Application, Container, Graphics, Text, TextStyle, FillGradient, Sprite, NineSliceSprite, AnimatedSprite } from "pixi.js";
import type { FillInput } from "pixi.js";
import type { NoteEntity, TrillZone, BpmMarker, EventMarker } from "../../shared";
import { isGraceNote } from "../../shared";
import { beatToMs, extractBpmMarkers, extractTimeSignatures, measureStartBeat } from "../../shared";
import { JudgmentGrade, JUDGMENT_WINDOWS } from "../../shared";
import type { SkinManager } from "../skin";
import {
  LANE_COUNT,
  LANE_WIDTH,
  LANE_AREA_WIDTH,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  JUDGMENT_LINE_OFFSET,
  COLORS,
} from "./constants";
import { formatTimingDiff } from "./formatTimingDiff";

// Keyboard layout display constants
const KB_KEY_SIZE = 10;
const KB_KEY_GAP = 1;
const KB_KEY_STEP = KB_KEY_SIZE + KB_KEY_GAP;

interface KbKeyDef {
  code: string;
  label: string;
  x: number; // position in key-units
  y: number;
  w?: number; // width in key-units (default 1)
}

// Full TKL keyboard layout (ANSI)
const KB_TKL_KEYS: KbKeyDef[] = [
  // Function row (y=0)
  { code: 'Escape', label: 'Es', x: 0, y: 0 },
  { code: 'F1', label: 'F1', x: 2, y: 0 },
  { code: 'F2', label: 'F2', x: 3, y: 0 },
  { code: 'F3', label: 'F3', x: 4, y: 0 },
  { code: 'F4', label: 'F4', x: 5, y: 0 },
  { code: 'F5', label: 'F5', x: 6.5, y: 0 },
  { code: 'F6', label: 'F6', x: 7.5, y: 0 },
  { code: 'F7', label: 'F7', x: 8.5, y: 0 },
  { code: 'F8', label: 'F8', x: 9.5, y: 0 },
  { code: 'F9', label: 'F9', x: 11, y: 0 },
  { code: 'F10', label: 'F10', x: 12, y: 0 },
  { code: 'F11', label: 'F11', x: 13, y: 0 },
  { code: 'F12', label: 'F12', x: 14, y: 0 },
  { code: 'PrintScreen', label: 'Pr', x: 15.5, y: 0 },
  { code: 'ScrollLock', label: 'SL', x: 16.5, y: 0 },
  { code: 'Pause', label: 'Pa', x: 17.5, y: 0 },
  // Number row (y=1.5)
  { code: 'Backquote', label: '`', x: 0, y: 1.5 },
  { code: 'Digit1', label: '1', x: 1, y: 1.5 },
  { code: 'Digit2', label: '2', x: 2, y: 1.5 },
  { code: 'Digit3', label: '3', x: 3, y: 1.5 },
  { code: 'Digit4', label: '4', x: 4, y: 1.5 },
  { code: 'Digit5', label: '5', x: 5, y: 1.5 },
  { code: 'Digit6', label: '6', x: 6, y: 1.5 },
  { code: 'Digit7', label: '7', x: 7, y: 1.5 },
  { code: 'Digit8', label: '8', x: 8, y: 1.5 },
  { code: 'Digit9', label: '9', x: 9, y: 1.5 },
  { code: 'Digit0', label: '0', x: 10, y: 1.5 },
  { code: 'Minus', label: '-', x: 11, y: 1.5 },
  { code: 'Equal', label: '=', x: 12, y: 1.5 },
  { code: 'Backspace', label: 'Bk', x: 13, y: 1.5, w: 2 },
  { code: 'Insert', label: 'In', x: 15.5, y: 1.5 },
  { code: 'Home', label: 'Hm', x: 16.5, y: 1.5 },
  { code: 'PageUp', label: 'PU', x: 17.5, y: 1.5 },
  // QWERTY row (y=2.5)
  { code: 'Tab', label: 'Tab', x: 0, y: 2.5, w: 1.5 },
  { code: 'KeyQ', label: 'Q', x: 1.5, y: 2.5 },
  { code: 'KeyW', label: 'W', x: 2.5, y: 2.5 },
  { code: 'KeyE', label: 'E', x: 3.5, y: 2.5 },
  { code: 'KeyR', label: 'R', x: 4.5, y: 2.5 },
  { code: 'KeyT', label: 'T', x: 5.5, y: 2.5 },
  { code: 'KeyY', label: 'Y', x: 6.5, y: 2.5 },
  { code: 'KeyU', label: 'U', x: 7.5, y: 2.5 },
  { code: 'KeyI', label: 'I', x: 8.5, y: 2.5 },
  { code: 'KeyO', label: 'O', x: 9.5, y: 2.5 },
  { code: 'KeyP', label: 'P', x: 10.5, y: 2.5 },
  { code: 'BracketLeft', label: '[', x: 11.5, y: 2.5 },
  { code: 'BracketRight', label: ']', x: 12.5, y: 2.5 },
  { code: 'Backslash', label: '\\', x: 13.5, y: 2.5, w: 1.5 },
  { code: 'Delete', label: 'De', x: 15.5, y: 2.5 },
  { code: 'End', label: 'En', x: 16.5, y: 2.5 },
  { code: 'PageDown', label: 'PD', x: 17.5, y: 2.5 },
  // Home row (y=3.5)
  { code: 'CapsLock', label: 'Cap', x: 0, y: 3.5, w: 1.75 },
  { code: 'KeyA', label: 'A', x: 1.75, y: 3.5 },
  { code: 'KeyS', label: 'S', x: 2.75, y: 3.5 },
  { code: 'KeyD', label: 'D', x: 3.75, y: 3.5 },
  { code: 'KeyF', label: 'F', x: 4.75, y: 3.5 },
  { code: 'KeyG', label: 'G', x: 5.75, y: 3.5 },
  { code: 'KeyH', label: 'H', x: 6.75, y: 3.5 },
  { code: 'KeyJ', label: 'J', x: 7.75, y: 3.5 },
  { code: 'KeyK', label: 'K', x: 8.75, y: 3.5 },
  { code: 'KeyL', label: 'L', x: 9.75, y: 3.5 },
  { code: 'Semicolon', label: ';', x: 10.75, y: 3.5 },
  { code: 'Quote', label: "'", x: 11.75, y: 3.5 },
  { code: 'Enter', label: 'Ent', x: 12.75, y: 3.5, w: 2.25 },
  // Z row (y=4.5)
  { code: 'ShiftLeft', label: 'Sh', x: 0, y: 4.5, w: 2.25 },
  { code: 'KeyZ', label: 'Z', x: 2.25, y: 4.5 },
  { code: 'KeyX', label: 'X', x: 3.25, y: 4.5 },
  { code: 'KeyC', label: 'C', x: 4.25, y: 4.5 },
  { code: 'KeyV', label: 'V', x: 5.25, y: 4.5 },
  { code: 'KeyB', label: 'B', x: 6.25, y: 4.5 },
  { code: 'KeyN', label: 'N', x: 7.25, y: 4.5 },
  { code: 'KeyM', label: 'M', x: 8.25, y: 4.5 },
  { code: 'Comma', label: ',', x: 9.25, y: 4.5 },
  { code: 'Period', label: '.', x: 10.25, y: 4.5 },
  { code: 'Slash', label: '/', x: 11.25, y: 4.5 },
  { code: 'ShiftRight', label: 'Sh', x: 12.25, y: 4.5, w: 2.75 },
  { code: 'ArrowUp', label: '↑', x: 16.5, y: 4.5 },
  // Bottom row (y=5.5)
  { code: 'ControlLeft', label: 'Ct', x: 0, y: 5.5, w: 1.25 },
  { code: 'MetaLeft', label: 'Wi', x: 1.25, y: 5.5, w: 1.25 },
  { code: 'AltLeft', label: 'Alt', x: 2.5, y: 5.5, w: 1.25 },
  { code: 'Space', label: '', x: 3.75, y: 5.5, w: 6.25 },
  { code: 'AltRight', label: 'Alt', x: 10, y: 5.5, w: 1.25 },
  { code: 'MetaRight', label: 'Wi', x: 11.25, y: 5.5, w: 1.25 },
  { code: 'ContextMenu', label: 'Mn', x: 12.5, y: 5.5, w: 1.25 },
  { code: 'ControlRight', label: 'Ct', x: 13.75, y: 5.5, w: 1.25 },
  { code: 'ArrowLeft', label: '←', x: 15.5, y: 5.5 },
  { code: 'ArrowDown', label: '↓', x: 16.5, y: 5.5 },
  { code: 'ArrowRight', label: '→', x: 17.5, y: 5.5 },
];

// Numpad keys (shown only when numpad bindings exist)
const KB_NUMPAD_KEYS: KbKeyDef[] = [
  { code: 'NumLock', label: 'NL', x: 19, y: 1.5 },
  { code: 'NumpadDivide', label: '/', x: 20, y: 1.5 },
  { code: 'NumpadMultiply', label: '*', x: 21, y: 1.5 },
  { code: 'NumpadSubtract', label: '-', x: 22, y: 1.5 },
  { code: 'Numpad7', label: '7', x: 19, y: 2.5 },
  { code: 'Numpad8', label: '8', x: 20, y: 2.5 },
  { code: 'Numpad9', label: '9', x: 21, y: 2.5 },
  { code: 'NumpadAdd', label: '+', x: 22, y: 2.5 },
  { code: 'Numpad4', label: '4', x: 19, y: 3.5 },
  { code: 'Numpad5', label: '5', x: 20, y: 3.5 },
  { code: 'Numpad6', label: '6', x: 21, y: 3.5 },
  { code: 'Numpad1', label: '1', x: 19, y: 4.5 },
  { code: 'Numpad2', label: '2', x: 20, y: 4.5 },
  { code: 'Numpad3', label: '3', x: 21, y: 4.5 },
  { code: 'NumpadEnter', label: 'En', x: 22, y: 4.5 },
  { code: 'Numpad0', label: '0', x: 19, y: 5.5, w: 2 },
  { code: 'NumpadDecimal', label: '.', x: 21, y: 5.5 },
];

const KB_IDLE_COLORS: Record<number, number> = {
  1: 0x662222, 2: 0x663333, 3: 0x223366, 4: 0x222266,
};

const KB_PRESSED_COLORS: Record<number, number> = {
  1: 0xff4444, 2: 0xff6655, 3: 0x5588ff, 4: 0x4466ff,
};

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
  private laneCoverGraphic: Graphics;
  private buttonLayer: Container;
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
  private showFastSlow: boolean = true;
  private showTimingDiff: boolean = false;
  private perfectWindow: number = JUDGMENT_WINDOWS.PERFECT;

  // Skin
  private skinManager: SkinManager;

  // Object pools — Sprite-based (single/double/long/doubleLong)
  private noteSpritePool: Map<number, Sprite> = new Map();
  private bodySpritePool: Map<number, NineSliceSprite> = new Map();
  private terminalSpritePool: Map<number, Sprite> = new Map();

  // Object pools — Graphics fallback (trill/trillLong)
  private noteGraphicsPool: Map<number, Graphics> = new Map();
  private bodyGraphicsPool: Map<number, Graphics> = new Map();
  private failedBodies: Set<number> = new Set();

  // Note visibility state
  private completedNotes: Set<number> = new Set();
  private doublePartialNotes: Set<number> = new Set();

  // Lane flash
  private keyBeamGraphics: Graphics[] = [];

  // Button sprites (per lane)
  private buttonSprites: Sprite[] = [];

  // Gradient cache (trill fallback only)
  private bodyGradientCache = new Map<number, FillGradient>();
  private keyBeamGradient: FillGradient | null = null;

  // UI elements
  private comboText: Text;
  private accuracyText: Text;
  private judgmentText: Text;
  private fastSlowText: Text;
  private timingDiffText: Text;

  // Dimensions
  private width: number;
  private height: number;

  private canvas: HTMLCanvasElement;

  // Keyboard layout display
  private keyboardContainer: Container | null = null;
  private keyGraphicsMap: Map<string, Graphics> = new Map();
  private keyTextMap: Map<string, Text> = new Map();
  private keyLaneMap: Map<string, number> = new Map();
  private keyWidthMap: Map<string, number> = new Map();

  private resolution: number;
  private laneAreaX: number;

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
    this.judgmentLineGraphic = new Graphics();
    this.laneCoverGraphic = new Graphics();
    this.buttonLayer = new Container();
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
    this.comboText.y = this.height / 2 - 65;

    const accuracyStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 20,
      fill: 0xaaaaaa,
      align: "center",
    });
    this.accuracyText = new Text({ text: "", style: accuracyStyle });
    this.accuracyText.anchor.set(0.5, 0.5);
    this.accuracyText.x = this.width / 2;
    this.accuracyText.y = this.height / 2 - 20;

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
    this.judgmentText.y = this.height / 2 + 20;
    this.judgmentText.alpha = 0;

    const fastSlowStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 20,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
    });
    this.fastSlowText = new Text({ text: "", style: fastSlowStyle });
    this.fastSlowText.anchor.set(0.5, 0.5);
    this.fastSlowText.x = this.width / 2;
    this.fastSlowText.y = this.height / 2 + 50;
    this.fastSlowText.alpha = 0;

    const timingDiffStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 22,
      fontWeight: "bold",
      fill: 0xffffff,
      align: "center",
    });
    this.timingDiffText = new Text({ text: "", style: timingDiffStyle });
    this.timingDiffText.anchor.set(0.5, 0.5);
    this.timingDiffText.x = this.width / 2;
    this.timingDiffText.y = this.height / 2;
    this.timingDiffText.alpha = 0;
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
    this.app.stage.addChild(this.laneCoverGraphic);
    this.app.stage.addChild(this.buttonLayer);
    this.app.stage.addChild(this.judgmentLineGraphic);
    this.app.stage.addChild(this.effectLayer);
    this.app.stage.addChild(this.uiLayer);

    this.uiLayer.addChild(this.comboText);
    this.uiLayer.addChild(this.accuracyText);
    this.uiLayer.addChild(this.judgmentText);
    this.uiLayer.addChild(this.fastSlowText);
    this.uiLayer.addChild(this.timingDiffText);

    // Draw static elements
    this.drawBackground();
    this.drawJudgmentLine();
    this.drawLaneCover();
    this.buildKeyBeams();
    this.buildButtons();
    this.initialized = true;
  }

  private drawBackground(): void {
    const bg = new Graphics();

    // Draw lane backgrounds
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = this.laneAreaX + i * LANE_WIDTH;
      const color = i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
      bg.rect(x, 0, LANE_WIDTH, this.height);
      bg.fill(color);
    }

    // Draw lane separators
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
      type: 'linear',
      start: { x: 0.5, y: 0 },
      end: { x: 0.5, y: 1 },
      colorStops: [
        { offset: 0, color: `rgba(${br},${bg},${bb},0)` },
        { offset: 1, color: `rgba(${br},${bg},${bb},1)` },
      ],
      textureSpace: 'local',
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
    const BTN_SIZE = 70; // 에셋 원본 크기와 1:1 매칭
    for (let i = 0; i < LANE_COUNT; i++) {
      const texKey = `buttonIdle${i}`;
      let tex;
      try { tex = this.skinManager.getTexture(texKey); } catch { continue; }
      const sprite = new Sprite(tex);
      sprite.width = BTN_SIZE;
      sprite.height = BTN_SIZE;
      sprite.anchor.set(0.5, 0.5);
      sprite.x = this.laneAreaX + i * LANE_WIDTH + LANE_WIDTH / 2;
      sprite.alpha = 0.8;
      this.buttonSprites.push(sprite);
      this.buttonLayer.addChild(sprite);
    }
  }

  setKeyBeam(lane: number, pressed: boolean): void {
    const idx = lane - 1;
    if (idx >= 0 && idx < this.keyBeamGraphics.length) {
      this.keyBeamGraphics[idx].visible = pressed;
    }
    // 버튼 텍스처 전환
    if (idx >= 0 && idx < this.buttonSprites.length) {
      const texKey = pressed ? `buttonPressed${idx}` : `buttonIdle${idx}`;
      try {
        this.buttonSprites[idx].texture = this.skinManager.getTexture(texKey);
        this.buttonSprites[idx].alpha = pressed ? 1 : 0.8;
      } catch { /* 텍스처 미로드 시 무시 */ }
    }
  }

  private drawLaneCover(): void {
    this.laneCoverGraphic.clear();
    const coverY = this._judgmentLineY + 2;
    const coverHeight = this.height - coverY;
    if (coverHeight <= 0) return;

    // 전체 검은 배경
    this.laneCoverGraphic.rect(this.laneAreaX, coverY, LANE_AREA_WIDTH, coverHeight);
    this.laneCoverGraphic.fill(0x000000);

    // 레인별 셀 배경 + 구분선
    for (let i = 0; i < LANE_COUNT; i++) {
      const laneX = this.laneAreaX + i * LANE_WIDTH;
      // 짝수/홀수 레인 미세 톤 차이
      const cellColor = i % 2 === 0 ? 0x0a0a18 : 0x080814;
      this.laneCoverGraphic.rect(laneX, coverY, LANE_WIDTH, coverHeight);
      this.laneCoverGraphic.fill(cellColor);
    }

    // 레인 구분선
    for (let i = 1; i < LANE_COUNT; i++) {
      const sepX = this.laneAreaX + i * LANE_WIDTH;
      this.laneCoverGraphic.rect(sepX - 0.5, coverY, 1, coverHeight);
      this.laneCoverGraphic.fill({ color: 0x333355, alpha: 0.6 });
    }

    // 상단 하이라이트 라인 (판정선 바로 아래)
    this.laneCoverGraphic.rect(this.laneAreaX, coverY, LANE_AREA_WIDTH, 1);
    this.laneCoverGraphic.fill({ color: 0x444466, alpha: 0.5 });

    // 버튼 높이 기준 가운데 정렬
    const btnCenterY = coverY + coverHeight / 2;
    for (const btn of this.buttonSprites) {
      btn.y = btnCenterY;
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
    this.noteSpritePool.clear();
    this.bodySpritePool.clear();
    this.terminalSpritePool.clear();
    this.noteGraphicsPool.clear();
    this.bodyGraphicsPool.clear();
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();

  }

  renderFrame(songTimeMs: number): void {
    // Update judgment text fade
    if (this.judgmentTimer > 0) {
      this.judgmentTimer -= 16; // ~16ms per frame (60fps assumption)
      const alpha = Math.max(0, this.judgmentTimer / 500);
      this.judgmentText.alpha = alpha;
      this.fastSlowText.alpha = alpha;
      this.timingDiffText.alpha = alpha;
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
      line.rect(this.laneAreaX, y - 1, LANE_AREA_WIDTH, 1);
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
    if (this.completedNotes.has(index)) return;

    const y = this.calculateNoteY(timeMs, songTimeMs);
    if (y < -NOTE_HEIGHT) return;

    const laneX = this.getLaneX(entity.lane);
    const isPartial = this.doublePartialNotes.has(index);
    const isGrace = isGraceNote(entity);

    // Grace glow effect — 노트 뒤에 밝게 빛나는 배경
    if (isGrace) {
      const glow = this.getOrCreateGraceGlow(index);
      glow.x = laneX - COLORS.GRACE_GLOW_PAD;
      glow.y = y - COLORS.GRACE_GLOW_PAD;
      this.noteLayer.addChild(glow);
    }

    if (entity.type === "trill") {
      // Trill: Graphics diamond fallback
      const graphic = this.getOrCreateNoteGraphic(index);
      graphic.x = laneX;
      graphic.y = y;
      this.drawNoteShape(graphic, entity.type, isPartial ? { alpha: 0.5 } : undefined);
      this.noteLayer.addChild(graphic);
    } else {
      // Single/Double: Sprite from skin texture
      const texKey = entity.type === "double" ? "noteDouble" : "noteSingle";
      const sprite = this.getOrCreateNoteSprite(index, texKey);
      sprite.x = laneX;
      sprite.y = y;
      sprite.alpha = isPartial ? 0.5 : 1;
      this.noteLayer.addChild(sprite);
    }
  }

  private renderLongNote(
    entity: NoteEntity & { endBeat: unknown },
    index: number,
    startMs: number,
    endMs: number,
    songTimeMs: number
  ): void {
    if (this.completedNotes.has(index)) return;

    const rawStartY = this.calculateNoteY(startMs, songTimeMs);
    const endY = this.calculateNoteY(endMs, songTimeMs);

    // 바디 시작 Y를 항상 판정선으로 클램프
    const startY = Math.min(rawStartY, this._judgmentLineY);

    const laneX = this.getLaneX(entity.lane);
    let bodyHeight = startY - endY;

    // Skip if body has negative height (e.g. both ends past judgment line)
    if (bodyHeight < 0) return;

    // Enforce minimum body height so zero-length LNs show the end part
    let adjustedEndY = endY;
    if (bodyHeight < NOTE_HEIGHT) {
      bodyHeight = NOTE_HEIGHT;
      adjustedEndY = startY - NOTE_HEIGHT;
    }

    // Skip if completely above screen
    if (adjustedEndY < -NOTE_HEIGHT && startY < -NOTE_HEIGHT) return;

    const isFailed = this.failedBodies.has(index);
    const isPartial = this.doublePartialNotes.has(index);

    if (entity.type === "trillLong") {
      // ── Trill long: Graphics fallback (diamond head/terminal + gradient body) ──
      const bodyGraphic = this.getOrCreateBodyGraphic(index);
      bodyGraphic.clear();
      bodyGraphic.x = laneX;
      bodyGraphic.y = adjustedEndY;

      const bodyColor = isFailed ? COLORS.LONG_BODY_FAILED : this.getLongBodyColor(entity.type);
      const bodyGradient = this.getBodyGradient(bodyColor);
      const hh = NOTE_HEIGHT / 2;
      bodyGraphic.rect(0, hh, LANE_WIDTH, bodyHeight);
      bodyGraphic.fill(bodyGradient);
      this.longNoteBodyLayer.addChild(bodyGraphic);

      // End diamond
      if (adjustedEndY >= -NOTE_HEIGHT && adjustedEndY <= this.height + NOTE_HEIGHT) {
        const endGraphic = new Graphics();
        endGraphic.x = laneX;
        endGraphic.y = adjustedEndY;
        this.drawNoteShape(endGraphic, entity.type, { color: 0x888888 });
        this.longNoteEndLayer.addChild(endGraphic);
      }

      // Head diamond
      const headY = rawStartY;
      if (headY >= -NOTE_HEIGHT && headY <= this.height + NOTE_HEIGHT) {
        const headGraphic = new Graphics();
        headGraphic.x = laneX;
        headGraphic.y = headY;
        this.drawNoteShape(headGraphic, entity.type, isPartial ? { alpha: 0.5 } : undefined);
        this.longNoteHeadLayer.addChild(headGraphic);
      }
    } else {
      // ── long / doubleLong: Sprite-based ──
      const isDouble = entity.type === "doubleLong";
      const bodyTexKey = isDouble ? "bodyDouble" : "bodySingle";
      const termTexKey = isDouble ? "terminalDouble" : "terminalSingle";

      // Body (NineSliceSprite)
      const bodySprite = this.getOrCreateBodySprite(index, bodyTexKey);
      bodySprite.x = laneX;
      bodySprite.y = adjustedEndY;
      bodySprite.width = LANE_WIDTH;
      bodySprite.height = bodyHeight;
      bodySprite.tint = isFailed ? COLORS.LONG_BODY_FAILED : 0xffffff;
      bodySprite.alpha = isPartial ? 0.5 : 1;
      this.longNoteBodyLayer.addChild(bodySprite);

      // Terminal (end cap)
      if (adjustedEndY >= -NOTE_HEIGHT && adjustedEndY <= this.height + NOTE_HEIGHT) {
        const termSprite = this.getOrCreateTerminalSprite(index, termTexKey);
        termSprite.x = laneX;
        termSprite.y = adjustedEndY;
        termSprite.alpha = isFailed ? 0.5 : 1;
        this.longNoteEndLayer.addChild(termSprite);
      }
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
      case "long":
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
      case "long":
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
    return this.laneAreaX + (lane - 1) * LANE_WIDTH;
  }

  private getOrCreateNoteSprite(index: number, texKey: string): Sprite {
    let sprite = this.noteSpritePool.get(index);
    if (!sprite) {
      sprite = new Sprite(this.skinManager.getTexture(texKey));
      sprite.width = NOTE_WIDTH;
      sprite.height = NOTE_HEIGHT;
      this.noteSpritePool.set(index, sprite);
    }
    return sprite;
  }

  private getOrCreateBodySprite(index: number, texKey: string): NineSliceSprite {
    let sprite = this.bodySpritePool.get(index);
    if (!sprite) {
      sprite = new NineSliceSprite({
        texture: this.skinManager.getTexture(texKey),
        leftWidth: 4,
        rightWidth: 4,
        topHeight: 4,
        bottomHeight: 4,
      });
      this.bodySpritePool.set(index, sprite);
    }
    return sprite;
  }

  private getOrCreateTerminalSprite(index: number, texKey: string): Sprite {
    let sprite = this.terminalSpritePool.get(index);
    if (!sprite) {
      sprite = new Sprite(this.skinManager.getTexture(texKey));
      sprite.width = NOTE_WIDTH;
      sprite.height = NOTE_HEIGHT;
      this.terminalSpritePool.set(index, sprite);
    }
    return sprite;
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

  /** Grace 노트 글로우 이펙트 — 노트 뒤에 밝게 빛나는 직사각형 */
  private graceGlowPool: Map<number, Graphics> = new Map();
  private getOrCreateGraceGlow(index: number): Graphics {
    let glow = this.graceGlowPool.get(index);
    if (!glow) {
      glow = new Graphics();
      this.graceGlowPool.set(index, glow);
    }
    glow.clear();
    const pad = COLORS.GRACE_GLOW_PAD;
    glow.roundRect(0, 0, NOTE_WIDTH + pad * 2, NOTE_HEIGHT + pad * 2, 4);
    glow.fill({ color: COLORS.GRACE_GLOW, alpha: COLORS.GRACE_GLOW_ALPHA });
    return glow;
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

  showJudgment(grade: JudgmentGrade, deltaMs?: number): void {
    this.judgmentTimer = 500; // 500ms fade duration

    // Update text
    const gradeText = grade === "goodTrill" ? "GOOD◇" : grade.toUpperCase();
    this.judgmentText.text = gradeText;

    // Update color
    const color = this.getJudgmentColor(grade);
    this.judgmentText.style.fill = color;

    // Reset alpha
    this.judgmentText.alpha = 1;

    // Update FAST/SLOW text (hide within inner half of Perfect window)
    const fastSlowThreshold = this.perfectWindow / 2;
    if (this.showFastSlow && deltaMs != null && grade !== "miss" && Math.abs(deltaMs) > fastSlowThreshold) {
      if (deltaMs < 0) {
        this.fastSlowText.text = "FAST";
        this.fastSlowText.style.fill = COLORS.FAST_TEXT;
        this.fastSlowText.alpha = 1;
      } else if (deltaMs > 0) {
        this.fastSlowText.text = "SLOW";
        this.fastSlowText.style.fill = COLORS.SLOW_TEXT;
        this.fastSlowText.alpha = 1;
      } else {
        this.fastSlowText.text = "";
        this.fastSlowText.alpha = 0;
      }
    } else {
      this.fastSlowText.text = "";
      this.fastSlowText.alpha = 0;
    }

    // Update timing diff text
    const timingDiffStr = this.showTimingDiff
      ? formatTimingDiff(deltaMs, grade === "miss")
      : null;
    if (timingDiffStr) {
      this.timingDiffText.text = timingDiffStr;
      this.timingDiffText.alpha = 1;
    } else {
      this.timingDiffText.text = "";
      this.timingDiffText.alpha = 0;
    }
  }

  /** 노트 판정 시 봄 이펙트 재생 */
  showBombEffect(lane: number): void {
    const textures = this.skinManager.getBombTextures();
    if (textures.length === 0) return;

    const anim = new AnimatedSprite(textures);
    anim.anchor.set(0.5, 0.5);
    anim.x = this.getLaneX(lane) + LANE_WIDTH / 2;
    anim.y = this._judgmentLineY;
    anim.width = 120;  // 원본 80 × 1.5
    anim.height = 120;
    anim.animationSpeed = 1; // 1프레임/틱 → 60fps에서 16프레임 = 267ms
    anim.loop = false;
    anim.onComplete = () => {
      anim.destroy();
    };
    anim.play();
    this.effectLayer.addChild(anim);
  }

  setShowFastSlow(enabled: boolean): void {
    this.showFastSlow = enabled;
  }

  setShowTimingDiff(enabled: boolean): void {
    this.showTimingDiff = enabled;
  }

  setPerfectWindow(windowMs: number): void {
    this.perfectWindow = windowMs;
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
    this.drawLaneCover();
    // Update UI positions (top→bottom: combo, accuracy, judgment, fast/slow)
    this.comboText.y = this.height / 2 - 65;
    this.accuracyText.y = this.height / 2 - 20;
    this.judgmentText.y = this.height / 2 + 20;
    this.fastSlowText.y = this.height / 2 + 50;
    this.timingDiffText.y = this.height / 2;
    // 버튼 위치는 drawLaneCover에서 갱신됨
  }

  setSudden(y: number): void {
    // TODO: Implement sudden cover mask
    void y;
  }

  setupKeyboardDisplay(laneBindings: Map<string, number>): void {
    // Remove previous keyboard container if exists
    if (this.keyboardContainer) {
      this.keyboardContainer.destroy({ children: true });
      this.keyboardContainer = null;
    }

    this.keyLaneMap = new Map(laneBindings);
    this.keyGraphicsMap.clear();
    this.keyTextMap.clear();
    this.keyWidthMap.clear();

    const container = new Container();
    const hasNumpad = [...laneBindings.keys()].some(k => k.startsWith('Numpad'));
    const allKeys = hasNumpad ? [...KB_TKL_KEYS, ...KB_NUMPAD_KEYS] : KB_TKL_KEYS;

    for (const def of allKeys) {
      const w = def.w ?? 1;
      const px = def.x * KB_KEY_STEP;
      const py = def.y * KB_KEY_STEP;
      const pw = Math.round(w * KB_KEY_STEP - KB_KEY_GAP);
      this.createKeyDisplay(container, def.code, def.label, px, py, pw);
    }

    // Compute bounds and position at bottom-right
    let maxRight = 0, maxBottom = 0;
    for (const def of allKeys) {
      const w = def.w ?? 1;
      const right = (def.x + w) * KB_KEY_STEP;
      const bottom = (def.y + 1) * KB_KEY_STEP;
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    container.x = this.width - maxRight - 4;
    container.y = this.height - maxBottom - 4;
    container.alpha = 0.85;

    this.uiLayer.addChild(container);
    this.keyboardContainer = container;
  }

  private createKeyDisplay(
    container: Container,
    code: string,
    label: string,
    x: number,
    y: number,
    pixelWidth: number,
  ): void {
    const lane = this.keyLaneMap.get(code);
    const color = lane ? (KB_IDLE_COLORS[lane] ?? 0x222222) : 0x222222;

    const g = new Graphics();
    g.roundRect(0, 0, pixelWidth, KB_KEY_SIZE, 2);
    g.fill(color);
    g.x = x;
    g.y = y;

    const t = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'Arial',
        fontSize: 6,
        fill: lane ? 0xbbbbbb : 0x444444,
        align: 'center',
      }),
    });
    t.anchor.set(0.5, 0.5);
    t.x = pixelWidth / 2;
    t.y = KB_KEY_SIZE / 2;
    g.addChild(t);

    container.addChild(g);
    this.keyGraphicsMap.set(code, g);
    this.keyTextMap.set(code, t);
    this.keyWidthMap.set(code, pixelWidth);
  }

  setKeyState(keyCode: string, pressed: boolean): void {
    const g = this.keyGraphicsMap.get(keyCode);
    if (!g) return;

    const lane = this.keyLaneMap.get(keyCode);
    if (!lane) return;

    const w = this.keyWidthMap.get(keyCode) ?? KB_KEY_SIZE;

    g.clear();
    if (pressed) {
      const color = KB_PRESSED_COLORS[lane] ?? 0x888888;
      // Glow effect
      g.roundRect(-2, -2, w + 4, KB_KEY_SIZE + 4, 3);
      g.fill({ color, alpha: 0.3 });
      // Key body
      g.roundRect(0, 0, w, KB_KEY_SIZE, 2);
      g.fill(color);
    } else {
      const color = KB_IDLE_COLORS[lane] ?? 0x222222;
      g.roundRect(0, 0, w, KB_KEY_SIZE, 2);
      g.fill(color);
    }

    const t = this.keyTextMap.get(keyCode);
    if (t) {
      t.style.fill = pressed ? 0xffffff : 0xbbbbbb;
    }
  }

  markBodyFailed(noteIndex: number): void {
    this.failedBodies.add(noteIndex);
  }

  markNoteProcessed(noteIndex: number): void {
    this.completedNotes.add(noteIndex);
    this.doublePartialNotes.delete(noteIndex);
  }

  markDoublePartial(noteIndex: number): void {
    this.doublePartialNotes.add(noteIndex);
  }

  dispose(): void {
    if (!this.initialized) return;
    this.initialized = false;
    this.app.destroy(true, { children: true, texture: true });
    this.noteSpritePool.clear();
    this.bodySpritePool.clear();
    this.terminalSpritePool.clear();
    this.noteGraphicsPool.clear();
    this.bodyGraphicsPool.clear();
    this.graceGlowPool.clear();
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();
    this.keyBeamGraphics = [];
    this.buttonSprites = [];
    this.keyGraphicsMap.clear();
    this.keyTextMap.clear();
    this.keyLaneMap.clear();
    this.keyWidthMap.clear();
    if (this.keyboardContainer) {
      this.keyboardContainer.destroy({ children: true });
      this.keyboardContainer = null;
    }
    for (const g of this.bodyGradientCache.values()) g.destroy();
    this.bodyGradientCache.clear();
    if (this.keyBeamGradient) {
      this.keyBeamGradient.destroy();
      this.keyBeamGradient = null;
    }
  }
}
