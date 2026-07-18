/**
 * PixiJS v8 Game Renderer
 *
 * Renders notes, judgment line, effects, and UI for the rhythm game.
 * Uses object pooling for performance. Rendering is driven by external game loop.
 */

import { Application, Container, Graphics, Text, TextStyle, Sprite, AnimatedSprite, FillGradient, Rectangle, RenderTexture, Mesh, MeshGeometry, Texture } from "pixi.js";
import type { NoteEntity, TrillZone, RestZone, ChartTiming, ChartTimingSource } from "../../shared";
import { JudgmentGrade, createChartTiming } from "../../shared";
import type { SkinManager } from "../skin";
import {
  LANE_COUNT,
  LANE_WIDTH,
  LANE_AREA_WIDTH,
  NOTE_HEIGHT,
  JUDGMENT_LINE_OFFSET,
  TUTORIAL_KB_SIDE_PAD,
  TUTORIAL_KB_VPAD,
  COLORS,
} from "./constants";
import { KeyboardDisplay, KB_SECTIONS } from "./KeyboardDisplay";
import { JudgmentUI } from "./JudgmentUI";
import { GameNoteRenderer } from "./GameNoteRenderer";
import type { NoteDisplayEffect } from "../judgment/judgmentEffects";
import { computeConnectedLongNotePredecessors } from "../judgment/longNoteConnection";
import {
  applyPerspectiveSurfaceJudgment,
  createPerspectiveSurfaceAltitudeState,
  resolvePerspectiveSurfaceAltitude,
  stepPerspectiveSurfaceAltitude,
  type PerspectiveSurfaceAltitudeState,
} from "./perspectiveSurfaceAltitude";
import {
  buildPerspectiveSurfaceGrid,
  getPerspectiveGridObjectConnectionSegment,
  getPerspectiveGridObjectTrail,
  projectPerspectiveGridObjectSurfaceShape,
  resolvePerspectiveSurfaceGridParamsFromAltitude,
  type PerspectiveSurfaceGridLine,
  type PerspectiveSurfaceGridObjectAppearance,
  type PerspectiveSurfaceGridParams,
  type ProjectedGroundPoint,
} from "../../lab/perspectiveSurfaceGrid";
import { DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET } from "./perspectiveSurfaceGridPreset";
import {
  GEAR_GAUGE_METADATA,
  getGaugeSpritePlacement,
  getGaugeTextureFrame,
} from "./gearGauge";

/** 튜토리얼 프리뷰 키보드 strip 스펙 — 레이아웃/매핑 계산은 React가 하고 렌더러는 그리기만 한다.
 *  (순환 import 방지를 위해 player 쪽 타입을 import하지 않고 자체 선언) */
interface TutorialKeyboardSpec {
  widthUnits: number;
  heightUnits: number;
  keys: { code: string; x: number; y: number; w: number; h: number; label: string; mapped: boolean }[];
}

interface TutorialKeyboardKeyEntry {
  code: string;
  cap: Graphics;
  text: Text;
  mapped: boolean;
  pressed: boolean;
  baseX: number;
  baseY: number;
  kw: number;
  kh: number;
}

export interface GameRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resolution?: number;
  skinManager: SkinManager;
  showGearFrame?: boolean;
  showPerspectiveSurface?: boolean;
  showComboAndAccuracy?: boolean;
  showLaneKeyLabels?: boolean;
  judgmentLineOffset?: number;
  /** 플레이 영역 아래에 덧붙는 키보드 strip 높이(px). 캔버스 총 높이 = height + keyboardAreaHeight */
  keyboardAreaHeight?: number;
  tutorialKeyboard?: TutorialKeyboardSpec;
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
  private surfaceLayer: Container;
  private surfaceGraphic: Graphics;
  private backgroundLayer: Container;
  private keyBeamLayer: Container;
  private measureLineLayer: Container;
  private restZoneLayer: Container;
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
  // 휴지 구간(RFD 0019) — 저작 데이터. 레인 구간을 dim해 손 파킹 창을 안내한다.
  private restZones: readonly RestZone[] = [];
  private timing: ChartTiming | null = null;
  private measureTimesMs: number[] = [];
  private textEvents: TextEventRenderData[] = [];
  private autoEvents: AutoEventRenderData[] = [];
  private chartDurationMs: number = 0;
  private surfaceScrollOffsetZ: number = 0;
  private perspectiveSurfaceAltitudeState: PerspectiveSurfaceAltitudeState = createPerspectiveSurfaceAltitudeState();

  // Skin
  private skinManager: SkinManager;

  // Object pools for dynamic graphics
  private measureLinePool: Graphics[] = [];
  private restZonePool: Graphics[] = [];
  private trillZonePool: Graphics[] = [];

  // Lane flash
  private keyBeamGraphics: Graphics[] = [];
  private keyBeamGradient: FillGradient | null = null;

  // Button sprites (per lane)
  private buttonSprites: Sprite[] = [];

  // Gear frame
  private gearFrameLayer: Container;
  private gearFrameSprite: Sprite | null = null;
  // 기둥 게이지 (분리된 발광 레이어, 게이지 값에 따라 아래 기준으로 클리핑)
  private gearGauges: {
    side: "left" | "right";
    sprite: Sprite;
    texture: Texture;
    fullWidth: number;
    fullHeight: number;
    lastFrameHeight: number;
    lastVisible: boolean;
  }[] = [];
  private gearAdjustMode = false;
  private gearOffsetX = 0;
  private gearOffsetY = 0;
  private gearScaleOverride: number | null = null;
  private judgmentLineAdjust = 0;
  private gearAdjustText: Text | null = null;
  private gearAdjustHandler: ((e: KeyboardEvent) => void) | null = null;
  private onAdjustModeChange: ((active: boolean) => void) | null = null;
  // 키보드 디스플레이 조정
  private adjustTarget: 'gear' | 'keyboard' = 'gear';
  private kbOffsetX = -418;
  private kbOffsetY = -44;
  private kbWidth = 416;
  private kbHeight = 107;
  private kbPerspective = 0.06;
  private kbSectionIdx = -1;  // -1 = 전체, 0-7 = 개별 섹션
  private kbGuide: Graphics | null = null;
  private kbMesh: Mesh<MeshGeometry> | null = null;
  private kbRenderTexture: RenderTexture | null = null;


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
  private showGearFrame: boolean;
  private showPerspectiveSurface: boolean;
  private showComboAndAccuracy: boolean;
  private showLaneKeyLabels: boolean;
  private judgmentLineOffset: number;

  // 튜토리얼 프리뷰용 레인 키 라벨 (판정선 아래 밴드에 키캡 + 텍스트)
  private laneKeyLabelLayer: Container;
  private laneKeyLabels: { cap: Graphics; text: Text; lane: number; label: string; empty: boolean; pressed: boolean }[] = [];

  // 튜토리얼 프리뷰용 키보드 strip (플레이 영역 아래 y >= this.height 별도 영역)
  private keyboardAreaHeight: number;
  private tutorialKeyboardSpec: TutorialKeyboardSpec | null;
  private tutorialKeyboardLayer: Container;
  private tutorialKeyboardKeys: TutorialKeyboardKeyEntry[] = [];
  private tutorialKeyboardKeyByCode: Map<string, TutorialKeyboardKeyEntry> = new Map();

  // Sub-renderers
  private judgmentUI!: JudgmentUI;
  private noteRenderer!: GameNoteRenderer;

  constructor(options: GameRendererOptions) {
    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.resolution = options.resolution ?? 1;
    this.laneAreaX = (this.width - LANE_AREA_WIDTH) / 2;
    this.judgmentLineOffset = options.judgmentLineOffset ?? JUDGMENT_LINE_OFFSET;
    this._judgmentLineY = options.height - this.judgmentLineOffset;
    this.skinManager = options.skinManager;
    this.showGearFrame = options.showGearFrame ?? true;
    this.showPerspectiveSurface = options.showPerspectiveSurface ?? true;
    this.showComboAndAccuracy = options.showComboAndAccuracy ?? true;
    this.showLaneKeyLabels = options.showLaneKeyLabels ?? false;
    this.keyboardAreaHeight = options.keyboardAreaHeight ?? 0;
    this.tutorialKeyboardSpec = options.tutorialKeyboard ?? null;

    this.app = new Application();

    // Pre-create layers
    this.surfaceLayer = new Container();
    this.surfaceGraphic = new Graphics();
    this.backgroundLayer = new Container();
    this.keyBeamLayer = new Container();
    this.measureLineLayer = new Container();
    this.restZoneLayer = new Container();
    this.trillZoneLayer = new Container();
    this.longNoteBodyLayer = new Container();
    this.longNoteEndLayer = new Container();
    this.longNoteHeadLayer = new Container();
    this.noteLayer = new Container();
    this.maskGraphic = new Graphics();
    this.judgmentLineGraphic = new Graphics();
    this.effectLayer = new Container();
    this.gearFrameLayer = new Container();
    this.laneKeyLabelLayer = new Container();
    this.tutorialKeyboardLayer = new Container();
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
    this.comboText.y = this._judgmentLineY - 280;
    this.comboText.visible = this.showComboAndAccuracy;

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
    this.accuracyText.y = this._judgmentLineY - 180;
    this.accuracyText.visible = this.showComboAndAccuracy;

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
    await import("pixi.js/unsafe-eval");
    await this.app.init({
      canvas: this.canvas,
      width: this.width,
      height: this.height + this.keyboardAreaHeight,
      resolution: this.resolution,
      autoStart: false,
      backgroundColor: this.skinManager.getTheme().bg,
    });

    // Build scene graph
    this.surfaceLayer.addChild(this.surfaceGraphic);
    this.app.stage.addChild(this.surfaceLayer);
    this.app.stage.addChild(this.backgroundLayer);
    // 휴지 밴드는 레인 배경 바로 위(빔/노트 아래)에 깔아 레인을 가라앉힌다.
    this.app.stage.addChild(this.restZoneLayer);
    this.app.stage.addChild(this.keyBeamLayer);
    this.app.stage.addChild(this.measureLineLayer);
    this.app.stage.addChild(this.trillZoneLayer);
    this.app.stage.addChild(this.longNoteBodyLayer);
    this.app.stage.addChild(this.longNoteEndLayer);
    this.app.stage.addChild(this.longNoteHeadLayer);
    this.app.stage.addChild(this.noteLayer);
    this.app.stage.addChild(this.maskGraphic);
    this.app.stage.addChild(this.judgmentLineGraphic);
    // 레인 키 라벨은 마스크 위에 보이되, bomb 등 이펙트(effectLayer)보다는 아래에 둔다.
    this.app.stage.addChild(this.laneKeyLabelLayer);
    // 키보드 strip은 y >= this.height 별도 영역이라 다른 레이어와 z순서 영향 없음.
    this.app.stage.addChild(this.tutorialKeyboardLayer);
    this.app.stage.addChild(this.gearFrameLayer);
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
    if (this.showLaneKeyLabels) {
      this.buildLaneKeyLabels();
    }
    if (this.tutorialKeyboardSpec) {
      this.buildTutorialKeyboard();
    }
    if (this.showGearFrame) {
      this.buildGearFrame();
    }
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

  // 기어 프레임 원본 이미지 내 빈 공간(기둥 사이) 치수
  private static readonly GEAR_INNER_WIDTH = 1710;
  private static readonly GEAR_INNER_LEFT = 972;
  private static readonly GEAR_INNER_TOP = 670;
  private static readonly GEAR_INNER_HEIGHT = 2630;

  private buildGearFrame(): void {
    let tex;
    try { tex = this.skinManager.getTexture("gearFrame"); } catch { return; }
    const sprite = new Sprite(tex);
    this.gearFrameSprite = sprite;
    this.gearFrameLayer.addChild(sprite);
    this.buildGearGauges();
    this.updateGearFrameTransform();

    // 조정 모드 HUD 텍스트
    const adjustStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 14,
      fill: 0x00ff00,
      stroke: { color: 0x000000, width: 3 },
    });
    this.gearAdjustText = new Text({ text: "", style: adjustStyle });
    this.gearAdjustText.x = 8;
    this.gearAdjustText.y = 8;
    this.gearAdjustText.visible = false;
    this.uiLayer.addChild(this.gearAdjustText);

    // 키 핸들러 등록
    this.gearAdjustHandler = (e: KeyboardEvent) => this.handleGearAdjustKey(e);
    window.addEventListener("keydown", this.gearAdjustHandler);
  }

  /** 기둥 게이지 스프라이트 생성 — Assets 캐시 텍스처를 변형하지 않도록 사이드별 서브 텍스처 사용 */
  private buildGearGauges(): void {
    for (const side of ["left", "right"] as const) {
      let base;
      try {
        base = this.skinManager.getTexture(side === "left" ? "gearGaugeLeft" : "gearGaugeRight");
      } catch { continue; }
      const texture = new Texture({
        source: base.source,
        frame: new Rectangle(0, 0, base.width, base.height),
        dynamic: true, // frame을 매 갱신마다 변형하므로 sprite가 update 이벤트를 구독하게 함
      });
      const sprite = new Sprite(texture);
      sprite.anchor.set(0, 1); // 좌하단 기준 — 게이지가 아래에서 차오름
      this.gearFrameLayer.addChild(sprite);
      this.gearGauges.push({
        side,
        sprite,
        texture,
        fullWidth: base.width,
        fullHeight: base.height,
        lastFrameHeight: -1,
        lastVisible: true,
      });
    }
  }

  private updateGearFrameTransform(): void {
    const sprite = this.gearFrameSprite;
    if (!sprite) return;
    const { GEAR_INNER_WIDTH, GEAR_INNER_LEFT, GEAR_INNER_TOP, GEAR_INNER_HEIGHT } = GameRenderer;
    // scale은 원본(gear.png) 픽셀→화면 배율. 텍스처는 outputScale로 다운스케일되어 있어 보정한다.
    const scale = this.gearScaleOverride ?? (LANE_AREA_WIDTH / GEAR_INNER_WIDTH);
    const { outputScale, columnBoxes } = GEAR_GAUGE_METADATA;
    sprite.scale.set(scale / outputScale);
    sprite.x = this.laneAreaX - GEAR_INNER_LEFT * scale + this.gearOffsetX;
    sprite.y = this._judgmentLineY - (GEAR_INNER_TOP + GEAR_INNER_HEIGHT) * scale + this.gearOffsetY;

    for (const gauge of this.gearGauges) {
      const placement = getGaugeSpritePlacement(
        columnBoxes[gauge.side],
        scale,
        sprite.x,
        sprite.y,
        outputScale,
      );
      gauge.sprite.scale.set(placement.scale);
      gauge.sprite.x = placement.x;
      gauge.sprite.y = placement.y;
    }
  }

  /** 게이지 값(0~1)에 따라 기둥 게이지의 보이는 높이를 갱신 (아래 기준) */
  private updateGearGauge(gaugeValue: number): void {
    for (const gauge of this.gearGauges) {
      const frame = getGaugeTextureFrame(
        { width: gauge.fullWidth, height: gauge.fullHeight },
        gaugeValue,
      );
      // 픽셀 행 단위로 변화 없으면 uv 갱신 스킵
      if (frame.height === gauge.lastFrameHeight && frame.visible === gauge.lastVisible) continue;
      gauge.lastFrameHeight = frame.height;
      gauge.lastVisible = frame.visible;
      gauge.sprite.visible = frame.visible;
      if (!frame.visible) continue;
      gauge.texture.frame.y = frame.y;
      gauge.texture.frame.height = frame.height;
      gauge.texture.update();
    }
  }

  private handleGearAdjustKey(e: KeyboardEvent): void {
    // G 키로 조정 모드 토글
    if (e.code === "KeyG" && !e.repeat) {
      this.gearAdjustMode = !this.gearAdjustMode;
      if (this.gearAdjustText) {
        this.gearAdjustText.visible = this.gearAdjustMode;
      }
      if (this.gearAdjustMode) {
        this.updateGearAdjustHUD();
      }
      this.applyKeyboardDisplayTransform();
      this.onAdjustModeChange?.(this.gearAdjustMode);
      return;
    }

    if (!this.gearAdjustMode) return;

    // K 키로 조정 대상 전환
    if (e.code === "KeyK" && !e.repeat) {
      this.adjustTarget = this.adjustTarget === 'gear' ? 'keyboard' : 'gear';
      this.applyKeyboardDisplayTransform();
      this.updateGearAdjustHUD();
      return;
    }

    const step = e.shiftKey ? 1 : 10;
    const scaleStep = e.shiftKey ? 0.001 : 0.01;

    if (this.adjustTarget === 'keyboard') {
      // Tab: 다음 섹션, Backspace: 이전/나가기
      if (e.code === 'Tab') {
        e.preventDefault();
        this.kbSectionIdx = this.kbSectionIdx >= KB_SECTIONS.length - 1 ? -1 : this.kbSectionIdx + 1;
        this.updateGearAdjustHUD();
        return;
      }
      if (e.code === 'Backspace') {
        e.preventDefault();
        this.kbSectionIdx = this.kbSectionIdx <= -1 ? KB_SECTIONS.length - 1 : this.kbSectionIdx - 1;
        this.updateGearAdjustHUD();
        return;
      }

      // 개별 섹션 모드
      if (this.kbSectionIdx >= 0) {
        const section = KB_SECTIONS[this.kbSectionIdx];
        const cur = this.keyboardDisplay?.getSectionOffset(section) ?? { x: 0, y: 0 };
        const curScale = this.keyboardDisplay?.getSectionScale(section) ?? { sx: 1, sy: 1 };
        switch (e.code) {
          case "ArrowLeft":  cur.x -= step; break;
          case "ArrowRight": cur.x += step; break;
          case "ArrowUp":    cur.y -= step; break;
          case "ArrowDown":  cur.y += step; break;
          case "Equal":
          case "NumpadAdd":
            curScale.sx += scaleStep; curScale.sy += scaleStep; break;
          case "Minus":
          case "NumpadSubtract":
            curScale.sx = Math.max(0.1, curScale.sx - scaleStep);
            curScale.sy = Math.max(0.1, curScale.sy - scaleStep); break;
          case "KeyR":       // X 간격만
            curScale.sx += scaleStep; break;
          case "KeyT":
            curScale.sx = Math.max(0.1, curScale.sx - scaleStep); break;
          case "KeyF":       // Y 간격만
            curScale.sy += scaleStep; break;
          case "KeyV":
            curScale.sy = Math.max(0.1, curScale.sy - scaleStep); break;
          case "Digit0":
            cur.x = 0; cur.y = 0; curScale.sx = 1; curScale.sy = 1; break;
          case "Enter":
          case "NumpadEnter": {
            const lines: string[] = [];
            for (const s of KB_SECTIONS) {
              const o = this.keyboardDisplay?.getSectionOffset(s) ?? { x: 0, y: 0 };
              const sc = this.keyboardDisplay?.getSectionScale(s) ?? { sx: 1, sy: 1 };
              const hasOffset = o.x !== 0 || o.y !== 0;
              const hasScale = sc.sx !== 1 || sc.sy !== 1;
              if (hasOffset || hasScale) {
                let info = `  ${s}: offset(${o.x}, ${o.y})`;
                if (hasScale) info += ` scale(${sc.sx.toFixed(3)}, ${sc.sy.toFixed(3)})`;
                lines.push(info);
              }
            }
            console.log(`[KeyboardDisplay Sections]\n${lines.join('\n') || '  (all default)'}`);
            break;
          }
          default: return;
        }
        e.preventDefault();
        this.keyboardDisplay?.setSectionOffset(section, cur.x, cur.y);
        this.keyboardDisplay?.setSectionScale(section, curScale.sx, curScale.sy);
        this.buildKeyboardMesh();
        this.updateGearAdjustHUD();
        return;
      }

      // 전체 모드 (기존)
      switch (e.code) {
        case "ArrowLeft":  this.kbOffsetX -= step; break;
        case "ArrowRight": this.kbOffsetX += step; break;
        case "ArrowUp":    this.kbOffsetY -= step; break;
        case "ArrowDown":  this.kbOffsetY += step; break;
        case "Equal":
        case "NumpadAdd":
          this.kbWidth += step; break;
        case "Minus":
        case "NumpadSubtract":
          this.kbWidth = Math.max(10, this.kbWidth - step); break;
        case "KeyR":
          this.kbHeight = Math.max(10, this.kbHeight - step); break;
        case "KeyT":
          this.kbHeight += step; break;
        case "KeyF":
          this.kbPerspective += (e.shiftKey ? 0.01 : 0.05); break;
        case "KeyV":
          this.kbPerspective -= (e.shiftKey ? 0.01 : 0.05); break;
        case "BracketLeft": {
          const sp = (this.keyboardDisplay?.getGlobalSpacing() ?? 0) - (e.shiftKey ? 0.1 : 0.5);
          this.keyboardDisplay?.setGlobalSpacing(sp);
          this.buildKeyboardMesh();
          break;
        }
        case "BracketRight": {
          const sp = (this.keyboardDisplay?.getGlobalSpacing() ?? 0) + (e.shiftKey ? 0.1 : 0.5);
          this.keyboardDisplay?.setGlobalSpacing(sp);
          this.buildKeyboardMesh();
          break;
        }
        case "Digit0":
          this.kbOffsetX = -418; this.kbOffsetY = -44;
          this.kbWidth = 416; this.kbHeight = 107;
          this.kbPerspective = 0.06;
          this.keyboardDisplay?.resetSectionOffsets();
          this.keyboardDisplay?.setGlobalSpacing(1.5);
          this.keyboardDisplay?.setSectionOffset('esc', 0, 1);
          this.keyboardDisplay?.setSectionOffset('fn1', -4, 1);
          this.keyboardDisplay?.setSectionOffset('fn2', -2, 1);
          this.keyboardDisplay?.setSectionOffset('fn3', 1, 1);
          this.keyboardDisplay?.setSectionOffset('main', 0, -3);
          this.keyboardDisplay?.setSectionOffset('navTop', 0, 1);
          this.keyboardDisplay?.setSectionOffset('navBottom', 0, -4);
          this.keyboardDisplay?.setSectionOffset('arrows', 0, -5);
          this.keyboardDisplay?.setSectionOffset('numpad', 0, -5);
          this.kbSectionIdx = -1;
          break;
        case "Enter":
        case "NumpadEnter": {
          const sectionLines: string[] = [];
          for (const s of KB_SECTIONS) {
            const o = this.keyboardDisplay?.getSectionOffset(s) ?? { x: 0, y: 0 };
            const sc = this.keyboardDisplay?.getSectionScale(s) ?? { sx: 1, sy: 1 };
            const hasOffset = o.x !== 0 || o.y !== 0;
            const hasScale = sc.sx !== 1 || sc.sy !== 1;
            if (hasOffset || hasScale) {
              let info = `  ${s}: offset(${o.x}, ${o.y})`;
              if (hasScale) info += ` scale(${sc.sx.toFixed(3)}, ${sc.sy.toFixed(3)})`;
              sectionLines.push(info);
            }
          }
          const spacing = this.keyboardDisplay?.getGlobalSpacing() ?? 0;
          console.log(
            `[KeyboardDisplay] 현재 값:\n` +
            `  offset: (${this.kbOffsetX}, ${this.kbOffsetY})  width: ${this.kbWidth}  height: ${this.kbHeight}  perspective: ${this.kbPerspective.toFixed(4)}  spacing: ${spacing.toFixed(1)}\n` +
            `  sections:\n${sectionLines.join('\n') || '    (all default)'}`
          );
          break;
        }
        default: return;
      }
      e.preventDefault();
      this.applyKeyboardDisplayTransform();
      this.updateKeyboardMesh();
      this.updateGearAdjustHUD();
      return;
    }

    // 기어 프레임 조정 (기존 로직)
    const { GEAR_INNER_WIDTH } = GameRenderer;
    const currentScale = this.gearScaleOverride ?? (LANE_AREA_WIDTH / GEAR_INNER_WIDTH);

    switch (e.code) {
      case "ArrowLeft":  this.gearOffsetX -= step; break;
      case "ArrowRight": this.gearOffsetX += step; break;
      case "ArrowUp":    this.gearOffsetY -= step; break;
      case "ArrowDown":  this.gearOffsetY += step; break;
      case "Equal":
      case "NumpadAdd":
        this.gearScaleOverride = currentScale + scaleStep; break;
      case "Minus":
      case "NumpadSubtract":
        this.gearScaleOverride = Math.max(0.01, currentScale - scaleStep); break;
      case "PageUp":
        this.judgmentLineAdjust += step;
        this.setLift(this.judgmentLineAdjust);
        this.updateGearFrameTransform();
        break;
      case "PageDown":
        this.judgmentLineAdjust -= step;
        this.setLift(this.judgmentLineAdjust);
        this.updateGearFrameTransform();
        break;
      case "Digit0":
        this.gearOffsetX = 0;
        this.gearOffsetY = 0;
        this.gearScaleOverride = null;
        this.judgmentLineAdjust = 0;
        this.setLift(0);
        this.updateGearFrameTransform();
        break;
      case "Enter":
      case "NumpadEnter": {
        const s = this.gearScaleOverride ?? LANE_AREA_WIDTH / GameRenderer.GEAR_INNER_WIDTH;
        console.log(
          `[GearFrame] 현재 값을 constants에 반영하세요:\n` +
          `  GEAR_INNER_LEFT = ${Math.round(GameRenderer.GEAR_INNER_LEFT - this.gearOffsetX / s)}\n` +
          `  GEAR_INNER_TOP = ${Math.round(GameRenderer.GEAR_INNER_TOP - this.gearOffsetY / s)}\n` +
          `  GEAR_INNER_WIDTH = ${this.gearScaleOverride ? Math.round(LANE_AREA_WIDTH / this.gearScaleOverride) : GameRenderer.GEAR_INNER_WIDTH}\n` +
          `  JUDGMENT_LINE_OFFSET = ${this.judgmentLineOffset + this.judgmentLineAdjust}\n` +
          `  offset: (${this.gearOffsetX}, ${this.gearOffsetY})  scale: ${s.toFixed(4)}  judgmentLineAdjust: ${this.judgmentLineAdjust}`
        );
        break;
      }
      default: return;
    }
    e.preventDefault();
    this.updateGearFrameTransform();
    this.updateGearAdjustHUD();
  }

  /** 키보드 영역 가이드 사다리꼴 그리기 (조정 모드용) */
  private applyKeyboardDisplayTransform(): void {
    if (!this.gearAdjustMode || this.adjustTarget !== 'keyboard') {
      if (this.kbGuide) this.kbGuide.visible = false;
      return;
    }

    if (!this.kbGuide) {
      this.kbGuide = new Graphics();
      this.uiLayer.addChild(this.kbGuide);
    }

    const baseW = this.kbWidth;
    const baseH = this.kbHeight;
    const p = this.kbPerspective;
    const topInset = baseW * p / 2;

    // 우하단 기준점
    const anchorX = this.width - baseW - 4 + this.kbOffsetX;
    const anchorY = this.height - baseH - 4 + this.kbOffsetY;

    this.kbGuide.clear();
    this.kbGuide.moveTo(anchorX + topInset, anchorY);
    this.kbGuide.lineTo(anchorX + baseW - topInset, anchorY);
    this.kbGuide.lineTo(anchorX + baseW, anchorY + baseH);
    this.kbGuide.lineTo(anchorX, anchorY + baseH);
    this.kbGuide.closePath();
    this.kbGuide.fill({ color: 0x00ff00, alpha: 0.15 });
    this.kbGuide.stroke({ width: 1, color: 0x00ff00, alpha: 0.8 });
    this.kbGuide.visible = true;
  }

  // 키보드 텍스처 캡처 해상도 배율
  private static readonly KB_RENDER_SCALE = 4;
  // 메시 세분화 수 (가로×세로 셀)
  private static readonly KB_MESH_COLS = 16;
  private static readonly KB_MESH_ROWS = 8;

  /** 키보드 디스플레이를 사다리꼴 Mesh로 렌더링 */
  private buildKeyboardMesh(): void {
    if (!this.keyboardDisplay || !this.app.renderer) return;
    const c = this.keyboardDisplay.container;
    const rs = GameRenderer.KB_RENDER_SCALE;

    // 원본 위치 저장 후 고해상도 캡처용으로 리셋
    const savedX = c.x, savedY = c.y, savedAlpha = c.alpha;
    c.x = 0; c.y = 0; c.alpha = 1;
    c.scale.set(rs); c.skew.set(0, 0); c.rotation = 0;

    const bounds = c.getLocalBounds();
    const tw = Math.ceil((bounds.width + bounds.x) * rs);
    const th = Math.ceil((bounds.height + bounds.y) * rs);
    if (tw <= 0 || th <= 0) { c.x = savedX; c.y = savedY; c.alpha = savedAlpha; return; }

    this.kbRenderTexture?.destroy();
    this.kbRenderTexture = RenderTexture.create({ width: tw, height: th });
    this.app.renderer.render({ container: c, target: this.kbRenderTexture, clear: true });

    c.x = savedX; c.y = savedY; c.alpha = 0;

    // 세분화된 메시 생성
    const { positions, uvs, indices } = this.buildSubdividedMesh();

    if (this.kbMesh) this.kbMesh.destroy();
    const geometry = new MeshGeometry({ positions, uvs, indices });
    this.kbMesh = new Mesh({ geometry, texture: this.kbRenderTexture });
    this.kbMesh.x = this.width - this.kbWidth - 4 + this.kbOffsetX;
    this.kbMesh.y = this.height - this.kbHeight - 4 + this.kbOffsetY;
    this.uiLayer.addChild(this.kbMesh);
  }

  /** 세분화된 사다리꼴 메시 꼭짓점 생성 */
  private buildSubdividedMesh(): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
    const cols = GameRenderer.KB_MESH_COLS;
    const rows = GameRenderer.KB_MESH_ROWS;
    const w = this.kbWidth;
    const h = this.kbHeight;
    const p = this.kbPerspective;
    const topInset = w * p / 2;

    const vCount = (cols + 1) * (rows + 1);
    const positions = new Float32Array(vCount * 2);
    const uvs = new Float32Array(vCount * 2);

    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      // 행별 좌우 경계 보간: 위(topInset) → 아래(0)
      const leftX = topInset * (1 - v);
      const rightX = w - topInset * (1 - v);
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const idx = (r * (cols + 1) + c) * 2;
        positions[idx] = leftX + (rightX - leftX) * u;
        positions[idx + 1] = h * v;
        uvs[idx] = u;
        uvs[idx + 1] = v;
      }
    }

    const iCount = cols * rows * 6;
    const indices = new Uint32Array(iCount);
    let ii = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tl = r * (cols + 1) + c;
        const tr = tl + 1;
        const bl = (r + 1) * (cols + 1) + c;
        const br = bl + 1;
        indices[ii++] = tl; indices[ii++] = tr; indices[ii++] = br;
        indices[ii++] = tl; indices[ii++] = br; indices[ii++] = bl;
      }
    }
    return { positions, uvs, indices };
  }

  /** 키 상태 변경 시 Mesh 텍스처 갱신 */
  private updateKeyboardMeshTexture(): void {
    if (!this.keyboardDisplay || !this.kbRenderTexture || !this.app.renderer) return;
    const c = this.keyboardDisplay.container;
    const rs = GameRenderer.KB_RENDER_SCALE;
    const savedX = c.x, savedY = c.y, savedAlpha = c.alpha;
    c.x = 0; c.y = 0; c.alpha = 1;
    c.scale.set(rs); c.skew.set(0, 0); c.rotation = 0;
    this.app.renderer.render({ container: c, target: this.kbRenderTexture, clear: true });
    c.x = savedX; c.y = savedY; c.alpha = savedAlpha;
  }

  /** G모드에서 가이드 변경 후 Mesh 갱신 */
  private updateKeyboardMesh(): void {
    if (!this.kbMesh) return;
    const { positions } = this.buildSubdividedMesh();
    this.kbMesh.geometry.positions = positions;
    this.kbMesh.x = this.width - this.kbWidth - 4 + this.kbOffsetX;
    this.kbMesh.y = this.height - this.kbHeight - 4 + this.kbOffsetY;
  }

  private updateGearAdjustHUD(): void {
    if (!this.gearAdjustText) return;
    const { GEAR_INNER_WIDTH } = GameRenderer;

    if (this.adjustTarget === 'keyboard') {
      if (this.kbSectionIdx >= 0) {
        const section = KB_SECTIONS[this.kbSectionIdx];
        const o = this.keyboardDisplay?.getSectionOffset(section) ?? { x: 0, y: 0 };
        const sc = this.keyboardDisplay?.getSectionScale(section) ?? { sx: 1, sy: 1 };
        this.gearAdjustText.text =
          `[Section: ${section}] Tab:next  Bksp:prev  Arrows:move  +/-:scale  R/T:scaleX  F/V:scaleY  0:reset  Enter:export\n` +
          `offset: (${o.x}, ${o.y})  scale: (${sc.sx.toFixed(3)}, ${sc.sy.toFixed(3)})`;
      } else {
        const sp = this.keyboardDisplay?.getGlobalSpacing() ?? 0;
        this.gearAdjustText.text =
          `[Keyboard ALL] Tab:section  K:→gear  Arrows:move  +/-:width  R/T:height  F/V:perspective  [/]:spacing  0:reset  Enter:export\n` +
          `offset: (${this.kbOffsetX}, ${this.kbOffsetY})  size: ${this.kbWidth}×${this.kbHeight}  perspective: ${this.kbPerspective.toFixed(3)}  spacing: ${sp.toFixed(1)}`;
      }
    } else {
      const scale = this.gearScaleOverride ?? (LANE_AREA_WIDTH / GEAR_INNER_WIDTH);
      const jlOffset = this.judgmentLineOffset + this.judgmentLineAdjust;
      this.gearAdjustText.text =
        `[Gear Adjust] G:close  K:switch to keyboard  Arrows:move  +/-:scale  PgUp/Dn:judgmentLine  Shift:fine  0:reset  Enter:export\n` +
        `offset: (${this.gearOffsetX}, ${this.gearOffsetY})  scale: ${scale.toFixed(4)}  JUDGMENT_LINE_OFFSET: ${jlOffset}`;
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
    if (idx >= 0 && idx < this.laneKeyLabels.length) {
      const entry = this.laneKeyLabels[idx];
      // 눌림 상태가 실제로 바뀔 때만 다시 그린다 — 매 프레임 Graphics 재구성 방지.
      if (entry.pressed !== pressed) {
        entry.pressed = pressed;
        this.drawLaneKeyCap(entry, pressed);
      }
    }
  }

  /** 레인 키 라벨 키캡+텍스트 생성 — 튜토리얼 프리뷰(showLaneKeyLabels)에서만 호출된다. */
  private buildLaneKeyLabels(): void {
    const cy = this._judgmentLineY + this.judgmentLineOffset / 2;

    for (let i = 0; i < LANE_COUNT; i++) {
      const cx = this.laneAreaX + i * LANE_WIDTH + LANE_WIDTH / 2;

      const cap = new Graphics();
      cap.x = cx;
      cap.y = cy;

      const text = new Text({
        text: '',
        style: new TextStyle({
          fontFamily: 'sans-serif',
          fontSize: 14,
          fontWeight: '800',
          fill: 0xe5ecef,
          align: 'center',
        }),
      });
      text.anchor.set(0.5);
      text.x = cx;
      text.y = cy;
      text.resolution = 2;

      this.laneKeyLabelLayer.addChild(cap);
      this.laneKeyLabelLayer.addChild(text);

      const entry = { cap, text, lane: i + 1, label: '', empty: true, pressed: false };
      this.drawLaneKeyCap(entry, false);
      this.laneKeyLabels.push(entry);
    }
  }

  /** 키캡 라운드렉트를 상태(empty/idle/pressed)에 맞는 색·위치로 다시 그린다. */
  private drawLaneKeyCap(
    entry: { cap: Graphics; text: Text; lane: number; label: string; empty: boolean; pressed: boolean },
    pressed: boolean,
  ): void {
    // dispose 경합 방어 — app.destroy로 이미 파괴된 Graphics에 clear()를 부르면
    // 내부 context가 null이라 크래시한다("Cannot read properties of null (reading 'clear')").
    if (entry.cap.destroyed) return;
    const capH = 42;
    const capW = LANE_WIDTH - 8;
    const cy = this._judgmentLineY + this.judgmentLineOffset / 2;

    entry.cap.clear();
    entry.cap.roundRect(-capW / 2, -capH / 2, capW, capH, 4);
    if (entry.empty) {
      entry.cap.fill({ color: 0x0a0d0f, alpha: 0.54 });
      entry.cap.stroke({ width: 1, color: 0xffffff, alpha: 0.14 });
      entry.text.style.fill = 0x6f767a;
    } else if (pressed) {
      entry.cap.fill(0x355f66);
      entry.cap.stroke({ width: 1, color: 0x76d6df });
      entry.text.style.fill = 0xffffff;
    } else {
      entry.cap.fill(0x303538);
      entry.cap.stroke({ width: 1, color: 0x6b7b80 });
      entry.text.style.fill = 0xe5ecef;
    }

    const y = pressed && !entry.empty ? cy + 4 : cy;
    entry.cap.y = y;
    entry.text.y = y;
  }

  /** 튜토리얼 키보드 strip 키캡+텍스트 생성 — tutorialKeyboard 스펙이 있을 때만 호출된다. */
  private buildTutorialKeyboard(): void {
    const spec = this.tutorialKeyboardSpec;
    // keyboardAreaHeight 없이 spec만 넘어오면 boardH가 음수가 된다 — 계약 명시.
    if (!spec || this.keyboardAreaHeight <= 0) return;
    const boardX = this.laneAreaX + TUTORIAL_KB_SIDE_PAD;
    const boardY = this.height + TUTORIAL_KB_VPAD;
    const boardW = LANE_AREA_WIDTH - TUTORIAL_KB_SIDE_PAD * 2;
    const boardH = this.keyboardAreaHeight - TUTORIAL_KB_VPAD * 2;

    // 배경 박스 (HTML miniKeyboard 톤)
    const box = new Graphics();
    box.roundRect(this.laneAreaX + 2, this.height + 2, LANE_AREA_WIDTH - 4, this.keyboardAreaHeight - 4, 7);
    box.fill(0x191919);
    box.stroke({ width: 1, color: 0x3f3f3f });
    this.tutorialKeyboardLayer.addChild(box);

    for (const kd of spec.keys) {
      const kw = (kd.w / spec.widthUnits) * boardW;
      const kh = (kd.h / spec.heightUnits) * boardH;
      const kx = boardX + (kd.x / spec.widthUnits) * boardW;
      const ky = boardY + (kd.y / spec.heightUnits) * boardH;

      const cap = new Graphics();
      cap.x = kx;
      cap.y = ky;
      const text = new Text({
        text: kd.label,
        style: new TextStyle({ fontFamily: 'sans-serif', fontSize: 10, fontWeight: '800', fill: 0xe5ecef, align: 'center' }),
      });
      text.anchor.set(0.5);
      text.x = kx + kw / 2;
      text.y = ky + kh / 2;
      text.resolution = 2;
      this.tutorialKeyboardLayer.addChild(cap);
      this.tutorialKeyboardLayer.addChild(text);

      const entry: TutorialKeyboardKeyEntry = {
        code: kd.code,
        cap,
        text,
        mapped: kd.mapped,
        pressed: false,
        baseX: kx,
        baseY: ky,
        kw,
        kh,
      };
      this.drawTutorialKey(entry, false);
      this.tutorialKeyboardKeys.push(entry);
      this.tutorialKeyboardKeyByCode.set(kd.code, entry);
    }
  }

  /** 키보드 strip 키캡을 상태(unmapped/idle/pressed)에 맞는 색·위치로 다시 그린다. */
  private drawTutorialKey(entry: TutorialKeyboardKeyEntry, pressed: boolean): void {
    // dispose 경합 방어 — 파괴된 Graphics에 clear()를 부르면 크래시한다.
    if (entry.cap.destroyed) return;
    const gap = 2;
    entry.cap.clear();
    entry.cap.roundRect(gap, gap, entry.kw - gap * 2, entry.kh - gap * 2, 4);
    if (!entry.mapped) {
      entry.cap.fill(0x121415);
      entry.cap.stroke({ width: 1, color: 0x24282a });
      entry.cap.alpha = 0.68;
      entry.text.alpha = 0.68;
      entry.text.style.fill = 0x343a3d;
    } else if (pressed) {
      entry.cap.fill(0x355f66);
      entry.cap.stroke({ width: 1, color: 0x76d6df });
      entry.cap.alpha = 1;
      entry.text.alpha = 1;
      entry.text.style.fill = 0xffffff;
    } else {
      entry.cap.fill(0x303538);
      entry.cap.stroke({ width: 1, color: 0x6b7b80 });
      entry.cap.alpha = 1;
      entry.text.alpha = 1;
      entry.text.style.fill = 0xe5ecef;
    }
    // 눌리면 살짝 내려감 — cap 로컬 좌표가 (gap,gap)부터라 x는 그대로 두고 y만 dy 반영.
    const dy = pressed && entry.mapped ? 3 : 0;
    entry.cap.y = entry.baseY + dy;
    entry.text.y = entry.baseY + entry.kh / 2 + dy;
  }

  /** 레인 키 라벨 텍스트·표시 여부 갱신 — 라벨 계산은 React가 하고 렌더러는 그리기만 한다. */
  setLaneKeyLabels(labels: { lane: number; label: string }[], visible: boolean): void {
    this.laneKeyLabelLayer.visible = visible;
    for (const { lane, label } of labels) {
      const idx = lane - 1;
      if (idx < 0 || idx >= this.laneKeyLabels.length) continue;
      const entry = this.laneKeyLabels[idx];
      entry.label = label;
      entry.empty = label.trim() === '';
      entry.text.text = label || '-';
      this.drawLaneKeyCap(entry, entry.pressed);
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

  private renderPerspectiveSurface(songTimeMs: number, deltaMs: number): void {
    this.perspectiveSurfaceAltitudeState = stepPerspectiveSurfaceAltitude(
      this.perspectiveSurfaceAltitudeState,
      deltaMs,
    );
    const altitude = resolvePerspectiveSurfaceAltitude({
      state: this.perspectiveSurfaceAltitudeState,
      songTimeMs,
      chartDurationMs: this.chartDurationMs,
    });
    this.updateGearGauge(altitude);

    const baseParams = resolvePerspectiveSurfaceGridParamsFromAltitude(
      altitude,
      DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.surfaceRanges,
      DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.params,
    );
    const deltaSeconds = Math.max(0, Math.min(0.05, deltaMs / 1000));
    this.surfaceScrollOffsetZ += baseParams.scrollSpeed * deltaSeconds;

    const params: PerspectiveSurfaceGridParams = {
      ...baseParams,
      scrollOffsetZ: this.surfaceScrollOffsetZ,
    };
    const grid = buildPerspectiveSurfaceGrid(params);
    const surface = this.surfaceGraphic;

    surface.clear();
    surface.rect(0, 0, this.width, this.height);
    surface.fill(0x05080d);
    this.drawPerspectiveSurfaceSky(surface, params);
    this.drawPerspectiveSurfaceForwardLight(surface, params);

    if (DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET.surfacePattern === "triangles") {
      grid.triangles.forEach((triangle, index) => {
        const color = index % 9 === 0 ? 0xffd27c : 0x52d4e6;
        this.strokePerspectiveSurfaceLine(surface, triangle.points, color, 0.16, 1);
      });
    } else {
      grid.rows.forEach((row, index) => {
        const alpha = this.getPerspectiveSurfaceRowAlpha(row, params);
        const color = index % 5 === 0 ? 0xffd27c : 0x5ee9ee;
        this.strokePerspectiveSurfaceLine(surface, row.points, color, alpha, 1);
      });

      grid.columns.forEach((column, index) => {
        const color = index % 7 === 0 ? 0xffd27c : 0x52d4e6;
        this.strokePerspectiveSurfaceLine(surface, column.points, color, 0.28, 1);
      });
    }

    this.drawPerspectiveSurfaceObjects(surface, params);
  }

  private drawPerspectiveSurfaceSky(surface: Graphics, params: PerspectiveSurfaceGridParams): void {
    const horizonY = this.toSurfaceY(params.horizonYPercent);
    const skyHeight = Math.max(0, Math.min(this.height, horizonY));
    if (skyHeight <= 0) return;

    surface.rect(0, 0, this.width, skyHeight);
    surface.fill({ color: 0x111a21, alpha: 0.58 });
  }

  private drawPerspectiveSurfaceForwardLight(surface: Graphics, params: PerspectiveSurfaceGridParams): void {
    if (params.forwardLightOpacity <= 0) return;

    const lightTopY = this.toSurfaceY(params.forwardLightHeightPercent);
    const clampedTopY = Math.max(0, Math.min(this.height, lightTopY));
    const alpha = Math.min(0.24, params.forwardLightOpacity * 0.24);
    if (alpha <= 0 || clampedTopY >= this.height) return;

    surface.rect(0, clampedTopY, this.width, this.height - clampedTopY);
    surface.fill({ color: 0xc6fff7, alpha });
  }

  private drawPerspectiveSurfaceObjects(surface: Graphics, params: PerspectiveSurfaceGridParams): void {
    const {
      objectConnections = [],
      objectPlacements,
      objectLightTrail,
    } = DEFAULT_GAME_PERSPECTIVE_SURFACE_GRID_PRESET;

    objectConnections.forEach((connection) => {
      const segment = getPerspectiveGridObjectConnectionSegment(connection, objectPlacements, params);
      if (segment === null) return;

      this.strokePerspectiveSurfaceLine(
        surface,
        [segment.from, segment.to],
        GameRenderer.parseHexColor(segment.color),
        0.42,
        1.2,
      );
    });

    objectPlacements.forEach((placement) => {
      const trail = getPerspectiveGridObjectTrail(placement, params, objectLightTrail.timeSeconds);
      const trailPoints = trail.points.slice(0, -1);
      trailPoints.forEach((point, index) => {
        const progress = (index + 1) / Math.max(1, trailPoints.length);
        this.fillPerspectiveSurfaceObjectShape(
          surface,
          point,
          placement.appearance,
          params,
          objectLightTrail.opacity * 0.5 * progress ** 1.45,
        );
      });

      this.fillPerspectiveSurfaceObjectShape(surface, trail.head, {
        ...placement.appearance,
        diameter: placement.appearance.diameter * 1.75,
      }, params, 0.16);
      this.fillPerspectiveSurfaceObjectShape(surface, trail.head, placement.appearance, params, 0.92);
    });
  }

  private fillPerspectiveSurfaceObjectShape(
    surface: Graphics,
    center: ProjectedGroundPoint,
    appearance: PerspectiveSurfaceGridObjectAppearance,
    params: PerspectiveSurfaceGridParams,
    alpha: number,
  ): void {
    if (alpha <= 0) return;

    const shape = projectPerspectiveGridObjectSurfaceShape(center, appearance, params);
    const first = shape.vertices[0];
    if (!first) return;
    const color = GameRenderer.parseHexColor(appearance.color);
    const renderMode = appearance.renderMode ?? "filled";
    const outlineWidth = GameRenderer.getPerspectiveSurfaceObjectOutlineWidth(appearance);

    if (appearance.shape === "point") {
      surface.circle(
        this.toSurfaceX(shape.center.screenXPercent),
        this.toSurfaceY(shape.center.screenYPercent),
        Math.max(1, appearance.diameter * shape.center.scale * 1.4),
      );
      if (renderMode === "outline") {
        surface.stroke({ width: outlineWidth, color, alpha });
      } else {
        surface.fill({ color, alpha });
      }
      return;
    }

    surface.moveTo(this.toSurfaceX(first.screenXPercent), this.toSurfaceY(first.screenYPercent));
    for (const vertex of shape.vertices.slice(1)) {
      surface.lineTo(this.toSurfaceX(vertex.screenXPercent), this.toSurfaceY(vertex.screenYPercent));
    }
    surface.closePath();
    if (renderMode === "outline") {
      surface.stroke({ width: outlineWidth, color, alpha, alignment: 0.5 });
    } else {
      surface.fill({ color, alpha });
    }
  }

  private static getPerspectiveSurfaceObjectOutlineWidth(appearance: PerspectiveSurfaceGridObjectAppearance): number {
    const outlineWidth = appearance.outlineWidth ?? 0.18;
    if (!Number.isFinite(outlineWidth)) return 1.2;

    return Math.max(0.25, Math.min(6, outlineWidth * 6.667));
  }

  private strokePerspectiveSurfaceLine(
    surface: Graphics,
    points: ProjectedGroundPoint[],
    color: number,
    alpha: number,
    width: number,
  ): void {
    const first = points[0];
    if (!first || alpha <= 0) return;

    surface.moveTo(this.toSurfaceX(first.screenXPercent), this.toSurfaceY(first.screenYPercent));
    for (const point of points.slice(1)) {
      surface.lineTo(this.toSurfaceX(point.screenXPercent), this.toSurfaceY(point.screenYPercent));
    }
    surface.stroke({ width, color, alpha, alignment: 0.5 });
  }

  private getPerspectiveSurfaceRowAlpha(
    row: PerspectiveSurfaceGridLine,
    params: PerspectiveSurfaceGridParams,
  ): number {
    if (row.z === undefined) return 0.18;

    const depth = (row.z - params.zNear) / Math.max(1, params.zFar - params.zNear);
    return Math.max(0.05, Math.min(0.38, 0.08 + (1 - depth) ** 1.2 * 0.3));
  }

  private toSurfaceX(percent: number): number {
    return (percent / 100) * this.width;
  }

  private toSurfaceY(percent: number): number {
    return (percent / 100) * this.height;
  }

  private static parseHexColor(value: string): number {
    const normalized = value.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 0xebfffb;

    return Number.parseInt(normalized, 16);
  }

  // 차트 하나를 받아 시간 뷰(ChartTiming)를 **내부에서** 파생한다. 인덱스 정합(noteRenderData가
  // timing.noteTimesMs.get(index)!를 전제)은 이제 이 메서드가 소유하므로 콜러가 timing을 별도로
  // 만들어 넘기며 어긋날 여지가 없다 (#142 리뷰 MEDIUM).
  setChart(
    chart: ChartTimingSource & { restZones?: readonly RestZone[] },
    durationMs: number = 0,
  ): void {
    const timing = createChartTiming(chart);
    const notes = chart.notes;
    const trillZones = chart.trillZones;
    const restZones = chart.restZones ?? [];
    const events = chart.events;

    this.timing = timing;
    this.trillZones = trillZones;
    this.restZones = restZones;
    this.chartDurationMs = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
    this.surfaceScrollOffsetZ = 0;
    this.perspectiveSurfaceAltitudeState = createPerspectiveSurfaceAltitudeState();

    this.noteRenderData = notes.map((entity, index) => {
      const timeMs = timing.noteTimesMs.get(index)!;
      const endTimeMs = timing.noteEndTimesMs.get(index);

      return { entity, index, timeMs, endTimeMs };
    });

    this.measureTimesMs = durationMs > 0 ? timing.measureStartsMs(durationMs) : [];

    // Extract text/auto events with time ranges
    this.textEvents = [];
    this.autoEvents = [];
    for (const evt of events) {
      if (evt.type === "text") {
        this.textEvents.push({
          text: evt.text,
          startMs: timing.beatToMs(evt.beat),
          endMs: timing.beatToMs(evt.endBeat),
        });
      } else if (evt.type === "auto") {
        this.autoEvents.push({
          startMs: timing.beatToMs(evt.beat),
          endMs: timing.beatToMs(evt.endBeat),
        });
      }
    }

    this.noteRenderer.clearPools();

    // 이어진 롱노트 연결 정보 계산 — 앞 롱노트가 held면 뒤 롱노트에도 불이 들어오게 한다
    const startMsByIndex = new Map<number, number>();
    const endMsByIndex = new Map<number, number>();
    for (const data of this.noteRenderData) {
      startMsByIndex.set(data.index, data.timeMs);
      if (data.endTimeMs !== undefined) endMsByIndex.set(data.index, data.endTimeMs);
    }
    const connectedPredecessor = computeConnectedLongNotePredecessors(
      notes,
      startMsByIndex,
      endMsByIndex,
    );
    this.noteRenderer.setLongNoteConnections(connectedPredecessor, startMsByIndex);
  }

  renderFrame(songTimeMs: number, deltaMs: number = 16): void {
    // 초기화가 끝나기 전(로딩 지연)이나 dispose 직후에 렌더가 들어오면 PIXI 내부 렌더러가
    // null이라 this.app.render()가 alphaMode를 null에서 읽어 크래시한다. 준비 전에는 조용히 건너뛴다.
    if (!this.initialized || !this.app.renderer) return;

    this.judgmentUI.updateFade(deltaMs);
    if (this.showPerspectiveSurface) {
      this.renderPerspectiveSurface(songTimeMs, deltaMs);
    }

    // Hide all pooled graphics
    for (const g of this.measureLinePool) g.visible = false;
    for (const g of this.restZonePool) g.visible = false;
    for (const g of this.trillZonePool) g.visible = false;
    this.longNoteBodyLayer.removeChildren();
    this.longNoteEndLayer.removeChildren();
    this.longNoteHeadLayer.removeChildren();
    this.noteLayer.removeChildren();

    const visibleWindowMs = (this.height / this._scrollSpeed) * 1000 + 500;
    const minTime = songTimeMs - 500;
    const maxTime = songTimeMs + visibleWindowMs;

    this.renderRestZones(songTimeMs);
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
    this.app.render();
  }

  recordPerspectiveSurfaceJudgment(grade: JudgmentGrade): void {
    this.perspectiveSurfaceAltitudeState = applyPerspectiveSurfaceJudgment(
      this.perspectiveSurfaceAltitudeState,
      grade,
    );
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

  private getRestZoneFromPool(index: number): Graphics {
    if (index < this.restZonePool.length) {
      return this.restZonePool[index];
    }
    const g = new Graphics();
    this.restZonePool.push(g);
    this.restZoneLayer.addChild(g);
    return g;
  }

  // 휴지 구간(RFD 0019)을 어두운 밴드로 그려 레인을 가라앉힌다.
  // 트릴존 렌더와 동일한 스크롤/컬링/풀 패턴, 색만 dim.
  private renderRestZones(songTimeMs: number): void {
    let poolIdx = 0;
    for (const zone of this.restZones) {
      const startMs = this.timing!.beatToMs(zone.beat);
      const endMs = this.timing!.beatToMs(zone.endBeat);

      const startY = this.noteRenderer.calculateNoteY(startMs, songTimeMs);
      const endY = this.noteRenderer.calculateNoteY(endMs, songTimeMs);

      if (startY < -50 || endY > this.height + 50) continue;

      const zoneGraphic = this.getRestZoneFromPool(poolIdx++);
      zoneGraphic.clear();
      const laneX = this.noteRenderer.getLaneX(zone.lane);

      // endY(구간 끝, 위) → startY(구간 시작, 아래) 사이를 레인 폭으로 채운다.
      const topY = endY;
      const height = Math.max(startY - endY, 1);
      zoneGraphic.rect(laneX, topY, LANE_WIDTH, height);
      zoneGraphic.fill({ color: COLORS.REST_ZONE_DIM, alpha: COLORS.REST_ZONE_ALPHA });
      zoneGraphic.visible = true;
    }
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
      const startMs = this.timing!.beatToMs(zone.beat);
      const endMs = this.timing!.beatToMs(zone.endBeat);

      const startY = this.noteRenderer.calculateNoteY(startMs, songTimeMs);
      const endY = this.noteRenderer.calculateNoteY(endMs, songTimeMs);

      if (startY < -50 || endY > this.height + 50) continue;

      const zoneGraphic = this.getTrillZoneFromPool(poolIdx++);
      zoneGraphic.clear();
      const laneX = this.noteRenderer.getLaneX(zone.lane);

      // trillZone은 같은 시작/끝 박의 롱노트 body와 같은 길이·위치로 그린다.
      // 롱노트 body: top = endY(끝 박스 상단), bottom = startY + NOTE_HEIGHT(시작 박스 하단).
      // (startY/endY는 박스 상단 기준. 트릴 노트 바운딩 박스 폭 = LANE_WIDTH와도 일치)
      const topY = endY;
      const height = Math.max(startY + NOTE_HEIGHT - endY, NOTE_HEIGHT); // 최소 한 칸(길이 0)
      zoneGraphic.rect(laneX, topY, LANE_WIDTH, height);
      zoneGraphic.fill({ color: COLORS.TRILL_ZONE_BG, alpha: COLORS.TRILL_ZONE_ALPHA });
      zoneGraphic.visible = true;
    }
  }

  private renderTextEvents(songTimeMs: number): void {
    // 현재 시간에 활성화된 TextEvent 중 마지막 것을 표시
    let activeText = "";
    for (const evt of this.textEvents) {
      if (songTimeMs >= evt.startMs && songTimeMs <= evt.endMs) {
        activeText = evt.text;
      }
    }
    this.eventMessageText.text = activeText;
  }

  showJudgment(grade: JudgmentGrade, deltaMs?: number): void {
    this.judgmentUI.showJudgment(grade, deltaMs);
  }

  /**
   * 스킨 텍스처를 게임 시작 전에 GPU로 업로드해, 첫 사용 시점(첫 판정의 bomb, 첫 실패의 failed
   * 텍스처 등)의 lazy 업로드 hitch를 없앤다. 오프스크린 RenderTexture에 1회 그려 결정적으로 업로드한다
   * — renderer.prepare.upload()는 시스템 티커에 의존해 autoStart:false에서 프로미스 resolve가
   * 불확실하므로, 이 코드베이스에 이미 쓰이는 오프스크린 렌더 패턴을 재사용한다.
   * @returns 프리웜에 걸린 시간(ms) — 첫 판정 프레임에 몰렸을 GPU 업로드 비용의 측정치.
   */
  prewarm(): number {
    if (!this.initialized) return 0;
    const start = performance.now();
    const warm = new Container();
    for (const tex of this.skinManager.getAllTextures()) {
      warm.addChild(new Sprite(tex));
    }
    const rt = RenderTexture.create({ width: 16, height: 16, resolution: this.resolution });
    this.app.renderer.render({ container: warm, target: rt, clear: true });
    rt.destroy(true);
    // 임시 Sprite만 파괴 — 텍스처는 SkinManager 소유라 보존한다.
    warm.destroy({ children: true, texture: false });
    return performance.now() - start;
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

  /** G 모드 토글 시 호출되는 콜백 설정 */
  setAdjustModeCallback(cb: (active: boolean) => void): void {
    this.onAdjustModeChange = cb;
  }

  setLift(y: number): void {
    this._judgmentLineY = this.height - this.judgmentLineOffset - y;
    this.drawJudgmentLine();
    this.drawMask();
    this.comboText.y = this._judgmentLineY - 280;
    this.accuracyText.y = this._judgmentLineY - 180;
    this.judgmentUI.setPosition(this._judgmentLineY);
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
    // 확정된 간격 및 섹션 오프셋 적용
    this.keyboardDisplay.setGlobalSpacing(1.5);
    this.keyboardDisplay.setSectionOffset('esc', 0, 1);
    this.keyboardDisplay.setSectionOffset('fn1', -4, 1);
    this.keyboardDisplay.setSectionOffset('fn2', -2, 1);
    this.keyboardDisplay.setSectionOffset('fn3', 1, 1);
    this.keyboardDisplay.setSectionOffset('main', 0, -3);
    this.keyboardDisplay.setSectionOffset('navTop', 0, 1);
    this.keyboardDisplay.setSectionOffset('navBottom', 0, -4);
    this.keyboardDisplay.setSectionOffset('arrows', 0, -5);
    this.keyboardDisplay.setSectionOffset('numpad', 0, -5);
    this.buildKeyboardMesh();
  }

  setKeyState(keyCode: string, pressed: boolean): void {
    this.keyboardDisplay?.setKeyState(keyCode, pressed);
    if (this.kbMesh && this.keyboardDisplay) this.updateKeyboardMeshTexture();
    const kbEntry = this.tutorialKeyboardKeyByCode.get(keyCode);
    // 눌림 상태가 실제로 바뀔 때만 다시 그린다 — 매 프레임 Graphics 재구성 방지.
    if (kbEntry && kbEntry.mapped && kbEntry.pressed !== pressed) {
      kbEntry.pressed = pressed;
      this.drawTutorialKey(kbEntry, pressed);
    }
  }

  applyNoteDisplayEffect(noteIndex: number, effect: NoteDisplayEffect): void {
    this.noteRenderer.applyNoteDisplayEffect(noteIndex, effect);
  }

  /** 헤드없는 롱노트 held 충족 조회 주입 — 플레이 화면이 JudgmentEngine을 연결한다 (이슈 #85). */
  setHeadlessHeldFillQuery(
    query: (index: number, timeMs: number) => { filled: number; required: number } | null,
  ): void {
    this.noteRenderer.setHeadlessHeldFillQuery(query);
  }

  dispose(): void {
    if (!this.initialized) return;
    this.initialized = false;
    this.noteRenderer.dispose();
    this.app.destroy(true, { children: true, texture: false });
    this.keyBeamGraphics = [];
    this.buttonSprites = [];
    // Text/Graphics 자체는 app.destroy(children: true)가 파괴한다 — 참조만 비운다.
    this.laneKeyLabels = [];
    this.tutorialKeyboardKeys = [];
    this.tutorialKeyboardKeyByCode = new Map();
    // 서브 텍스처만 정리 — source는 SkinManager 소유라 파괴하지 않음
    for (const gauge of this.gearGauges) {
      if (!gauge.texture.destroyed) gauge.texture.destroy(false);
    }
    this.gearGauges = [];
    if (this.keyboardDisplay) {
      this.keyboardDisplay.dispose();
      this.keyboardDisplay = null;
    }
    if (this.keyBeamGradient) {
      this.keyBeamGradient.destroy();
      this.keyBeamGradient = null;
    }
    if (this.gearAdjustHandler) {
      window.removeEventListener("keydown", this.gearAdjustHandler);
      this.gearAdjustHandler = null;
    }
    if (this.kbGuide) {
      this.kbGuide.destroy();
      this.kbGuide = null;
    }
    if (this.kbMesh) {
      this.kbMesh.destroy();
      this.kbMesh = null;
    }
    if (this.kbRenderTexture) {
      this.kbRenderTexture.destroy();
      this.kbRenderTexture = null;
    }
  }
}
