/**
 * PixiJS v8 Game Renderer
 *
 * Renders notes, judgment line, effects, and UI for the rhythm game.
 * Uses object pooling for performance. Rendering is driven by external game loop.
 */

import { Application, Container, Graphics, Text, TextStyle, Sprite, AnimatedSprite, FillGradient, type Texture, type TextureSource } from "pixi.js";
import type { NoteEntity, TrillZone, RestZone, ChartEvent, ChartTiming } from "../../shared";
import { JudgmentGrade } from "../../shared";
import type { SkinManager } from "../skin";
import {
  LANE_COUNT,
  LANE_WIDTH,
  LANE_AREA_WIDTH,
  NOTE_HEIGHT,
  JUDGMENT_LINE_OFFSET,
  JUDGMENT_LINE_THICKNESS,
  KEY_BOMB_SIZE,
  TUTORIAL_KB_SIDE_PAD,
  TUTORIAL_KB_VPAD,
  COLORS,
  playfieldPx,
} from "./constants";
import { KeyboardDisplay } from "./KeyboardDisplay";
import { GEAR_GEOMETRY, GEAR_CLEARANCE, layoutGear, type GearLayout } from "./gearLayout";
import { acquireGearMotionAssets } from "./gearMotionAssets";
import { GearMotionController, type GearMotionControls } from "./GearMotionController";
import { GearGauge } from "./gearGauge";
import { JudgmentUI } from "./JudgmentUI";
import { GameNoteRenderer, type JudgmentBodyStateQuery } from "./GameNoteRenderer";
import type { NoteDisplayEffect } from "../judgment/judgmentEffects";
import { computeConnectedLongNotePredecessors } from "../judgment/longNoteConnection";
import {
  applyFlightJudgment,
  clampFlightAltitude,
  createFlightAltitudeState,
  resolveFlightAltitude,
  stepFlightAltitude,
  type FlightAltitudeState,
} from "./flightAltitude";
import { FlightBackground } from "./flight/FlightBackground";
import { resolveFlightScenario } from "../../shared/chartDifficulty";

// 플레이필드에 딸린 크기(레인 100 기준 설계값 × PLAYFIELD_SCALE, RFD 0029)
const LANE_SEPARATOR_WIDTH = playfieldPx(2);
/** 마디선 설계 두께. 화면 1px보다 얇아지는 낮은 렌더 높이에서는 1px로 그려 깜빡이지 않게 한다(`measureLineThickness`). */
const MEASURE_LINE_THICKNESS = playfieldPx(1);
/** 오른쪽 위 이벤트 문구의 화면 오른쪽 여백·최소 줄바꿈 폭 */
const EVENT_MESSAGE_MARGIN = 20;
const EVENT_MESSAGE_MIN_WRAP = 120;
/** 판정선을 지난 노트를 그리는 최소 시간. 판정선 아래로 보이는 틈이 더 길면 그만큼 늘린다(`lateNoteWindowMs`). */
const LATE_NOTE_MIN_WINDOW_MS = 500;
const COMBO_FONT_SIZE = playfieldPx(120);
const COMBO_OFFSET = playfieldPx(280); // 판정선 위
const ACCURACY_FONT_SIZE = playfieldPx(20);
const ACCURACY_OFFSET = playfieldPx(180); // 판정선 위
// 튜토리얼 레인 키캡(판정선 아래 밴드)과 키보드 strip
const LANE_KEY_CAP_HEIGHT = playfieldPx(42);
const LANE_KEY_CAP_INSET = playfieldPx(8);
const LANE_KEY_FONT_SIZE = playfieldPx(14);
const LANE_KEY_PRESS_DROP = playfieldPx(4);
const KEY_CAP_RADIUS = playfieldPx(4);
const KEY_CAP_STROKE = playfieldPx(1);
const TUTORIAL_KEY_FONT_SIZE = playfieldPx(10);
const TUTORIAL_KEY_GAP = playfieldPx(2);
const TUTORIAL_KEY_PRESS_DROP = playfieldPx(3);
const TUTORIAL_BOARD_INSET = playfieldPx(2);
const TUTORIAL_BOARD_RADIUS = playfieldPx(7);
/** 스킨의 기어 그림·빈 유리 텍스처 키. buildGear·buildGearGauge가 이 키로 읽고, 곡 시작 전 준비는 이 키를 건너뛰고 실제로 만든 것만 GPU 업로드한다. */
const GEAR_IMAGE_KEY = "gearImage";
const GEAR_GAUGE_EMPTY_KEY = "gearGaugeEmpty";

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
  /** 스킨 기본 키봄 크기의 배율(0~3). 0이면 표시하지 않는다. */
  bombScale?: number;
  /**
   * 새 기어(스킨 공통 `gearImage`)와 양옆 유리관 고도 게이지(`gearGaugeEmpty`)를 그린다.
   * 끄면(튜토리얼 미니 렌더러) 둘 다 없고, 레인 가림막이 판정 순간 노트 칸 아래끝(판정선 + 노트 반 칸)부터 덮는다.
   */
  showGear?: boolean;
  /**
   * `gearMotion`(기어 위 장식 애니메이션: 큰 광원 띠·게이지 액체 흐름과 기포·발광선 호흡·하단 바 빛, RFD 0029). 기본 켬이며 기어를 그릴 때만 만든다.
   * 끄면(게임 설정 `gearMotion` 끔) `gearMotion` 객체·텍스처를 만들지도 읽지도 않고 매 프레임 비용도 없다.
   */
  gearMotion?: boolean;
  showFlightBackground?: boolean;
  difficultyLabel?: string;
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
  private flightBackground: FlightBackground | null = null;
  private readonly difficultyLabel: string;
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
  private readonly bombScale: number;

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
  private flightAltitudeState: FlightAltitudeState = createFlightAltitudeState();
  /** Lab 미리보기가 고정한 고도(setAltitudeOverride). null이면 고도 모델을 따른다. */
  private altitudeOverride: number | null = null;

  // Skin
  private skinManager: SkinManager;

  // Object pools for dynamic graphics
  private measureLinePool: Graphics[] = [];
  private restZonePool: Graphics[] = [];
  private trillZonePool: Graphics[] = [];

  // Lane flash
  private keyBeamGraphics: Graphics[] = [];
  private keyBeamGradient: FillGradient | null = null;

  // Gear (새 기어, RFD 0029) — 판정선·레인 키 라벨 위, 키봄·UI 아래. 리프트로 움직이지 않는다.
  private gearLayer: Container;
  private _gearLayout: Readonly<GearLayout> | null = null;
  // `gearMotion` — 기어 레이어에서 기어 스프라이트 바로 위. 애니메이션 경과 시간은 renderFrame의 deltaMs로만 나아간다.
  private readonly gearMotionEnabled: boolean;
  private gearMotionController: GearMotionController | null = null;
  // 고도 게이지 — 기어 레이어 맨 위(`gearMotion` 위). 빈 유리 덮개가 빈 부분의 `gearMotion` 액체·기포를 함께 가린다.
  private gearGauge: GearGauge | null = null;
  /** 이 렌더러가 기어·게이지를 만들 때 쓴 스킨 텍스처(기어 그림·빈 유리 아틀라스). 기어를 그리지 않으면 비어 있다. */
  private gearTextures: Texture[] = [];
  /**
   * 곡 시작 전 준비가 Pixi 자동 GC에서 뺀 소스와 그 전의 `autoGarbageCollect` 값. dispose가 되돌린다.
   * 소스는 SkinManager·공유 로더 소유라 렌더러보다 오래 남을 수 있어, 렌더러가 끝나면 원래 동작으로 돌려준다.
   */
  private readonly autoGarbageCollectBeforePlayback = new Map<TextureSource, boolean>();

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
  /** 마디선 두께: 설계 두께와 화면 1px(1 ÷ 해상도) 중 큰 값 */
  private readonly measureLineThickness: number;
  private laneAreaX: number;
  private showGear: boolean;
  private showFlightBackground: boolean;
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
    this.measureLineThickness = Math.max(MEASURE_LINE_THICKNESS, 1 / this.resolution);
    this.laneAreaX = (this.width - LANE_AREA_WIDTH) / 2;
    this.judgmentLineOffset = options.judgmentLineOffset ?? JUDGMENT_LINE_OFFSET;
    this._judgmentLineY = options.height - this.judgmentLineOffset;
    this.skinManager = options.skinManager;
    const bombScale = options.bombScale ?? 1;
    this.bombScale = Number.isFinite(bombScale) ? Math.max(0, Math.min(3, bombScale)) : 1;
    this.showGear = options.showGear ?? true;
    this.gearMotionEnabled = options.gearMotion ?? true;
    this.showFlightBackground = options.showFlightBackground ?? true;
    this.difficultyLabel = options.difficultyLabel ?? 'INFILTRATION';
    this.showComboAndAccuracy = options.showComboAndAccuracy ?? true;
    this.showLaneKeyLabels = options.showLaneKeyLabels ?? false;
    this.keyboardAreaHeight = options.keyboardAreaHeight ?? 0;
    this.tutorialKeyboardSpec = options.tutorialKeyboard ?? null;

    this.app = new Application();

    // Pre-create layers
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
    this.gearLayer = new Container();
    this.laneKeyLabelLayer = new Container();
    this.tutorialKeyboardLayer = new Container();
    this.uiLayer = new Container();

    // Create combo / accuracy text (owned by GameRenderer)
    const comboStyle = new TextStyle({
      fontFamily: "'Alumni Sans Collegiate One'",
      fontSize: COMBO_FONT_SIZE,
      fill: COLORS.COMBO_TEXT,
      align: "center",
    });
    this.comboText = new Text({ text: "", style: comboStyle });
    this.comboText.anchor.set(0.5, 0.5);
    this.comboText.alpha = 0.5;
    this.comboText.x = this.width / 2;
    this.comboText.y = this._judgmentLineY - COMBO_OFFSET;
    this.comboText.visible = this.showComboAndAccuracy;

    const accuracyStyle = new TextStyle({
      fontFamily: "'Zen Dots'",
      fontSize: ACCURACY_FONT_SIZE,
      fill: 0xaaaaaa,
      align: "center",
    });
    this.accuracyText = new Text({ text: "00.00%", style: accuracyStyle });
    this.accuracyText.anchor.set(0.5, 0.5);
    this.accuracyText.alpha = 0.5;
    this.accuracyText.x = this.width / 2;
    this.accuracyText.y = this._judgmentLineY - ACCURACY_OFFSET;
    this.accuracyText.visible = this.showComboAndAccuracy;

    // Event message text (right side)
    const msgStyle = new TextStyle({
      fontFamily: "sans-serif",
      fontSize: 22,
      fill: 0xffffff,
      align: "right",
      wordWrap: true,
      wordWrapWidth: this.eventMessageWrapWidth(),
    });
    this.eventMessageText = new Text({ text: "", style: msgStyle });
    this.eventMessageText.anchor.set(1, 0);
    this.eventMessageText.x = this.width - EVENT_MESSAGE_MARGIN;
    this.eventMessageText.y = 40;
    this.eventMessageText.alpha = 0.9;
  }

  /**
   * 오른쪽 위 이벤트 문구의 줄바꿈 폭. 문구는 화면 오른쪽에 붙으므로 기어 실루엣(없으면 레인 영역) 오른쪽 끝 + 여백까지만 쓴다.
   * 기어 배치는 렌더러 논리 크기만으로 정해지므로 텍스처를 읽기 전(생성자)에도 계산할 수 있다.
   */
  private eventMessageWrapWidth(): number {
    const obstacleRight = this.showGear
      ? layoutGear(GEAR_GEOMETRY, { laneAreaX: this.laneAreaX, laneAreaWidth: LANE_AREA_WIDTH, height: this.height }).silhouetteRightX
      : this.laneAreaX + LANE_AREA_WIDTH;
    return Math.max(EVENT_MESSAGE_MIN_WRAP, this.width - EVENT_MESSAGE_MARGIN - (obstacleRight + GEAR_CLEARANCE));
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
      backgroundAlpha: this.showFlightBackground ? 0 : 1,
    });

    // Build scene graph
    this.app.stage.addChild(this.backgroundLayer);
    // 휴지 밴드는 레인 배경 바로 위(빔/노트 아래)에 깔아 레인을 가라앉힌다.
    this.app.stage.addChild(this.restZoneLayer);
    this.app.stage.addChild(this.keyBeamLayer);
    this.app.stage.addChild(this.measureLineLayer);
    this.app.stage.addChild(this.trillZoneLayer);
    this.app.stage.addChild(this.longNoteBodyLayer);
    this.app.stage.addChild(this.longNoteEndLayer);
    this.app.stage.addChild(this.longNoteHeadLayer);
    // 노트 배열의 순서와 무관하게 포인트·그림자·Grace는 바디와 시작/끝 터미널 위에 그린다.
    this.app.stage.addChild(this.noteLayer);
    this.app.stage.addChild(this.maskGraphic);
    this.app.stage.addChild(this.judgmentLineGraphic);
    // 레인 키 라벨은 마스크 위에 보이되, bomb 등 이펙트(effectLayer)보다는 아래에 둔다.
    this.app.stage.addChild(this.laneKeyLabelLayer);
    // 키보드 strip은 y >= this.height 별도 영역이라 다른 레이어와 z순서 영향 없음.
    this.app.stage.addChild(this.tutorialKeyboardLayer);
    this.app.stage.addChild(this.gearLayer);
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

    // Draw static elements. 기어 배치가 레인 가림막의 시작 높이를 정하므로 기어를 먼저 놓는다.
    if (this.showGear) {
      this.buildGear();
    }
    this.drawBackground();
    this.drawJudgmentLine();
    this.drawMask();
    this.buildKeyBeams();
    if (this.showLaneKeyLabels) {
      this.buildLaneKeyLabels();
    }
    if (this.tutorialKeyboardSpec) {
      this.buildTutorialKeyboard();
    }
    this.initialized = true;
    // 임대는 dispose가 놓을 수 있는 시점(초기화 뒤)에 빌린다. `holder`는 그래도 기어 레이어의 기어 스프라이트 바로 위에 붙는다.
    this.buildGearMotion();
    // 비행 배경과 `gearMotion` 에셋은 렌더러 준비에 필요하다. 함께 기다리고, 어느 쪽이든 실패하면 스스로 정리한 뒤 그 오류로 실패한다.
    const required: Promise<unknown>[] = [];
    if (this.showFlightBackground) {
      this.flightBackground = new FlightBackground({
        canvas: this.canvas, width: this.width, height: this.height,
        resolution: this.resolution, scenario: resolveFlightScenario(this.difficultyLabel),
      });
      required.push(this.flightBackground.init());
    }
    if (this.gearMotionController) required.push(this.gearMotionController.ready);
    try { await Promise.all(required); }
    // 오류 화면으로 전환할 때 React가 소유한 캔버스는 React가 제거한다.
    catch (error) { this.dispose(false); throw error; }
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
      bg.rect(x - LANE_SEPARATOR_WIDTH / 2, 0, LANE_SEPARATOR_WIDTH, this.height);
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

  /**
   * 새 기어(RFD 0029). 그림을 비율 그대로 줄여 레인 창(236~787열)을 레인 영역에 정확히 겹치고,
   * 실루엣 아래 가장자리를 화면 아래에 붙인다. 리프트와 무관하게 고정이며, 배치는 렌더러 논리 크기에서 정해진다
   * (화면 비율이 바뀌면 새 렌더러가 다시 계산한다). 텍스처는 SkinManager가 밉맵·삼선형으로 읽는다.
   */
  private buildGear(): void {
    let texture;
    try { texture = this.skinManager.getTexture(GEAR_IMAGE_KEY); } catch { return; }
    const layout = layoutGear(GEAR_GEOMETRY, {
      laneAreaX: this.laneAreaX,
      laneAreaWidth: LANE_AREA_WIDTH,
      height: this.height,
    });
    const sprite = new Sprite({ texture, label: "gear" });
    sprite.position.set(layout.x, layout.y);
    sprite.width = layout.width;
    sprite.height = layout.height;
    // 바깥(접근자)에서 고쳐도 가림막·키보드 배치가 어긋나지 않게 얼려 둔다.
    this._gearLayout = Object.freeze(layout);
    this.gearLayer.addChild(sprite);
    this.gearTextures.push(texture);
    this.buildGearGauge(layout);
  }

  /**
   * 양옆 유리관 고도 게이지. 기어와 같은 변환으로 기어 레이어 맨 위에 붙여, `gearMotion`을 켜든 끄든 같은 모습이다.
   * 나중에 붙는 `gearMotion`의 `holder`(addGearOverlay)는 이 아래에 들어가므로, 빈 부분에서는 덮개가 `gearMotion`의 액체·기포를 가린다(유리 안쪽에 그리는
   * `gearMotion` 레이어는 게이지 액체·기포뿐이다). 빈 유리 텍스처는 스킨 필수 에셋이지만, 없으면(테스트용 부분 스킨) 게이지 없이 기어만 그린다.
   * 운영체제의 `prefers-reduced-motion`은 읽지 않고 늘 이징으로 따라간다(RFD 0030).
   * 채움 1에서는 덮개를 숨겨 두어 Pixi가 아틀라스를 그리지도 GPU 업로드하지도 않으므로, 곡 시작 전 준비(prepareForPlayback)가 미리 GPU 업로드한다.
   */
  private buildGearGauge(layout: Readonly<GearLayout>): void {
    let texture;
    try { texture = this.skinManager.getTexture(GEAR_GAUGE_EMPTY_KEY); } catch { return; }
    const gauge = new GearGauge({ texture, geometry: GEAR_GEOMETRY.gauge });
    gauge.container.position.set(layout.x, layout.y);
    gauge.container.scale.set(layout.scale);
    this.gearLayer.addChild(gauge.container);
    this.gearGauge = gauge;
    this.gearTextures.push(texture);
  }

  /**
   * `gearMotion`(RFD 0029). 기어 레이어에 기어와 같은 변환의 `holder`를 붙이고 공유 로더에서 `gearMotion` 에셋 lease를 acquire한다. `gearMotion` 에셋은 스킨 텍스처처럼
   * 필수라 init이 준비를 기다린다. 준비되면 `holder`에 `gearMotion`을 추가하고(텍스처 GPU 업로드는 곡 시작 전 준비가 한다), 읽지 못하면 init이 그 오류로 실패한다.
   * 만들지 여부는 옵션 `gearMotion`(게임 설정 `Gear Motion`)만 정한다. 운영체제의 `prefers-reduced-motion`은 읽지 않는다(RFD 0030).
   */
  private buildGearMotion(): void {
    if (!this.gearMotionEnabled || !this._gearLayout) return;
    const holder = new Container({ label: "gear-motion-holder" });
    if (!this.addGearOverlay(holder)) {
      holder.destroy();
      return;
    }
    this.gearMotionController = new GearMotionController({ holder, lease: acquireGearMotionAssets() });
  }

  /**
   * 곡 시작 전 준비. init이 끝난(resolve된) 뒤, 플레이 화면이 audio 재생 직전에 한 번 부른다. init 전이나 dispose 뒤에 부르면 아무것도 하지 않는다.
   * 튜토리얼 재생기·Lab 미리보기는 부르지 않아 텍스처를 처음 그릴 때 GPU 업로드한다.
   * 곡 중 프레임이 GPU 준비 비용(텍스처 업로드·밉맵 생성, 셰이더·마스크 준비)을 치르지 않도록 재생 전에 두 단계로 끝낸다.
   * 1. uploadPlaybackTextures: 곡 중 그릴 수 있는 텍스처를 보이든 말든 전부 GPU 업로드하고 곡 중 Pixi 자동 GC에서 뺀다(첫 판정 키봄·첫 MISS 실패 노트 등).
   * 2. renderFirstFrame: songTimeMs의 첫 프레임을 그려 셰이더·마스크를 준비한다.
   */
  prepareForPlayback(songTimeMs: number): void {
    if (!this.initialized || !this.app.renderer) return;
    this.uploadPlaybackTextures();
    this.renderFirstFrame(songTimeMs);
  }

  /**
   * 곡 중 그릴 수 있는 텍스처 소스를 한 번씩 GPU 업로드한다(밉맵을 쓰는 기어·`gearMotion` 텍스처는 밉맵 생성까지). 이미 업로드된 소스는 Pixi가 건너뛴다.
   * 목록은 화면이 넘기지 않고 렌더러가 스스로 모은다(collectPlaybackTextureSources).
   * 업로드한 소스는 렌더러를 dispose할 때까지 Pixi 자동 GC에서 뺀다(`autoGarbageCollect` false). 불러온 이미지는 자동 GC 대상이라
   * 기본 설정에서 60초 넘게 그리지 않으면 GPU 텍스처가 해제되고, 곡 중 다시 쓰는 프레임에 GPU 업로드가 다시 일어나기 때문이다.
   */
  private uploadPlaybackTextures(): void {
    const textureSystem = this.app.renderer.texture;
    for (const source of this.collectPlaybackTextureSources()) {
      // 같은 소스를 두 번 준비해도(두 번째에는 이미 false) 처음 값을 기록한다.
      if (!this.autoGarbageCollectBeforePlayback.has(source)) {
        this.autoGarbageCollectBeforePlayback.set(source, source.autoGarbageCollect);
      }
      source.autoGarbageCollect = false;
      textureSystem.initSource(source);
    }
  }

  /**
   * 곡 중 이 렌더러가 그릴 수 있는 텍스처 소스(중복 없음). 여러 텍스처가 나눠 쓰는 소스(터미널에서 잘라 쓴 롱노트 캡, 게이지 행 등)는 한 번만 담는다.
   * - SkinManager가 불러온 텍스처 전부: 노트·바디·터미널과 실패·켜짐·부분 실패·idle 변형, Grace·그림자, 키봄 16프레임 등.
   *   켜짐 효과 없는 스킨은 켜짐 에셋을 불러오지 않으므로 담기지 않는다. 기어 그림·빈 유리는 이 렌더러가 실제로 만든 것(gearTextures)만 담는다.
   * - `gearMotion` 텍스처 9개: `gearMotion`이 재생 중일 때만(`running`. 설정 끔이면 `gearMotion`을 만들지 않는다).
   * - 키빔 그라데이션: 레인 키를 처음 누르는 프레임에 GPU 업로드되지 않게.
   */
  private collectPlaybackTextureSources(): Set<TextureSource> {
    const sources = new Set<TextureSource>();
    for (const [key, texture] of this.skinManager.getLoadedTextures()) {
      if (key === GEAR_IMAGE_KEY || key === GEAR_GAUGE_EMPTY_KEY) continue;
      sources.add(texture.source);
    }
    for (const texture of this.gearTextures) sources.add(texture.source);
    for (const texture of this.gearMotionController?.textures ?? []) sources.add(texture.source);
    // Pixi의 Graphics.fill()이 그라데이션 텍스처를 동기로 만들므로(buildKeyBeams 안) init 뒤에는 이미 있다.
    if (this.keyBeamGradient?.texture) sources.add(this.keyBeamGradient.texture.source);
    return sources;
  }

  /**
   * 곡을 시작하기 전에 songTimeMs의 첫 프레임을 그린다(deltaMs 0이라 애니메이션 경과 시간·게이지 이징은 나아가지 않는다). 셰이더·마스크 준비를 재생 시작 전에 끝낸다.
   * `gearMotion`의 하단 바 알파 마스크는 빛이 보일 때만 그려지므로 이 첫 프레임 동안만 함께 그려 준비한다(빛이 투명해 화면은 같다).
   */
  private renderFirstFrame(songTimeMs: number): void {
    // 곡 중간에서 시작해도(편집기 시험 재생) 게이지가 가득 찬 데서 내려오지 않게, 첫 프레임에서 곡 시작 시각의 고도로 바로 맞춘다.
    this.gearGauge?.snapNext();
    const render = () => this.renderFrame(songTimeMs, 0);
    if (this.gearMotionController) this.gearMotionController.warmUp(render);
    else render();
  }

  setKeyBeam(lane: number, pressed: boolean): void {
    const idx = lane - 1;
    if (idx >= 0 && idx < this.keyBeamGraphics.length) {
      this.keyBeamGraphics[idx].visible = pressed;
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
          fontSize: LANE_KEY_FONT_SIZE,
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
    const capH = LANE_KEY_CAP_HEIGHT;
    const capW = LANE_WIDTH - LANE_KEY_CAP_INSET;
    const cy = this._judgmentLineY + this.judgmentLineOffset / 2;

    entry.cap.clear();
    entry.cap.roundRect(-capW / 2, -capH / 2, capW, capH, KEY_CAP_RADIUS);
    if (entry.empty) {
      entry.cap.fill({ color: 0x0a0d0f, alpha: 0.54 });
      entry.cap.stroke({ width: KEY_CAP_STROKE, color: 0xffffff, alpha: 0.14 });
      entry.text.style.fill = 0x6f767a;
    } else if (pressed) {
      entry.cap.fill(0x355f66);
      entry.cap.stroke({ width: KEY_CAP_STROKE, color: 0x76d6df });
      entry.text.style.fill = 0xffffff;
    } else {
      entry.cap.fill(0x303538);
      entry.cap.stroke({ width: KEY_CAP_STROKE, color: 0x6b7b80 });
      entry.text.style.fill = 0xe5ecef;
    }

    const y = pressed && !entry.empty ? cy + LANE_KEY_PRESS_DROP : cy;
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
    box.roundRect(
      this.laneAreaX + TUTORIAL_BOARD_INSET,
      this.height + TUTORIAL_BOARD_INSET,
      LANE_AREA_WIDTH - TUTORIAL_BOARD_INSET * 2,
      this.keyboardAreaHeight - TUTORIAL_BOARD_INSET * 2,
      TUTORIAL_BOARD_RADIUS,
    );
    box.fill(0x191919);
    box.stroke({ width: KEY_CAP_STROKE, color: 0x3f3f3f });
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
        style: new TextStyle({ fontFamily: 'sans-serif', fontSize: TUTORIAL_KEY_FONT_SIZE, fontWeight: '800', fill: 0xe5ecef, align: 'center' }),
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
    const gap = TUTORIAL_KEY_GAP;
    entry.cap.clear();
    entry.cap.roundRect(gap, gap, entry.kw - gap * 2, entry.kh - gap * 2, KEY_CAP_RADIUS);
    if (!entry.mapped) {
      entry.cap.fill(0x121415);
      entry.cap.stroke({ width: KEY_CAP_STROKE, color: 0x24282a });
      entry.cap.alpha = 0.68;
      entry.text.alpha = 0.68;
      entry.text.style.fill = 0x343a3d;
    } else if (pressed) {
      entry.cap.fill(0x355f66);
      entry.cap.stroke({ width: KEY_CAP_STROKE, color: 0x76d6df });
      entry.cap.alpha = 1;
      entry.text.alpha = 1;
      entry.text.style.fill = 0xffffff;
    } else {
      entry.cap.fill(0x303538);
      entry.cap.stroke({ width: KEY_CAP_STROKE, color: 0x6b7b80 });
      entry.cap.alpha = 1;
      entry.text.alpha = 1;
      entry.text.style.fill = 0xe5ecef;
    }
    // 눌리면 살짝 내려감 — cap 로컬 좌표가 (gap,gap)부터라 x는 그대로 두고 y만 dy 반영.
    const dy = pressed && entry.mapped ? TUTORIAL_KEY_PRESS_DROP : 0;
    entry.cap.y = entry.baseY + dy;
    entry.text.y = entry.baseY + entry.kh / 2 + dy;
  }

  /**
   * 튜토리얼 키보드 strip의 라벨·매핑만 바꾼다 — 키캡 배치(프리셋 레이아웃)는 init 때 만든 것을 그대로 쓴다.
   * 같은 렌더러로 다른 튜토리얼 차트를 그릴 때 차트마다 달라지는 키 표시만 교체하고, 눌림은 해제한다.
   */
  updateTutorialKeyboardKeys(keys: readonly { code: string; label: string; mapped: boolean }[]): void {
    for (const { code, label, mapped } of keys) {
      const entry = this.tutorialKeyboardKeyByCode.get(code);
      if (!entry) continue;
      // 바뀐 게 없는 키캡은 Graphics를 다시 만들지 않는다.
      if (entry.text.text === label && entry.mapped === mapped && !entry.pressed) continue;
      entry.mapped = mapped;
      entry.pressed = false;
      entry.text.text = label;
      this.drawTutorialKey(entry, false);
    }
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
      this._judgmentLineY - JUDGMENT_LINE_THICKNESS / 2,
      LANE_AREA_WIDTH,
      JUDGMENT_LINE_THICKNESS,
    );
    this.judgmentLineGraphic.fill(COLORS.JUDGMENT_LINE);
  }

  /**
   * 판정선을 지난 노트를 그리는 시간. 기어가 있으면 가림막이 키 윗면에 고정이라 판정 전·놓친 노트는 판정선 아래 틈을 다 지나야 사라진다.
   * 노트 시각은 박스 가운데라(#224) 박스 윗변이 가림막 위끝에 닿는 때는 시각 위치가 (가림막 위끝 − 판정선) + 노트 반 칸 내려갔을 때다.
   * 놓친 노트는 박스 위에 접촉 그림자(스킨 `pointContactShadow.above`)를 깔므로, 그 띠까지 가림막 아래로 내려간 뒤 지운다.
   * Grace 오버레이는 놓친 노트에 그리지 않아 더하지 않는다. 리프트가 크거나 스크롤이 느리면 그 시간이 500ms보다 길다(RFD 0029).
   */
  private lateNoteWindowMs(): number {
    const overlayAbove = playfieldPx(this.skinManager.getTheme().pointContactShadow?.above ?? 0);
    const visibleBelowLine = this.laneMaskTop() - this._judgmentLineY + NOTE_HEIGHT / 2 + overlayAbove;
    return Math.max(LATE_NOTE_MIN_WINDOW_MS, (visibleBelowLine / this._scrollSpeed) * 1000);
  }

  /**
   * 레인 가림막. 기어가 있으면 판정선이 아니라 키 윗면(열린 덱 바닥 바로 아래)부터 덮는다(RFD 0029).
   * 판정선 아래 틈과 꺾인 덱 사이로 실제 레인이 이어지고, 판정 전·놓친 노트는 그곳을 지나 키 밑으로 사라진다.
   * 이 높이는 기어와 함께 고정이라 리프트로 움직이지 않는다. 기어가 없는 미니 렌더러(튜토리얼 재생기)는 판정 순간 노트 칸
   * 아래끝(판정선 + 노트 반 칸, #224)부터 덮어, 판정선에 가운데가 걸친 노트·터미널이 게임처럼 한 칸 전부 보인다.
   */
  private laneMaskTop(): number {
    return this._gearLayout
      ? this._gearLayout.keyRimY
      : this._judgmentLineY + Math.max(NOTE_HEIGHT, JUDGMENT_LINE_THICKNESS) / 2;
  }

  private drawMask(): void {
    this.maskGraphic.clear();
    const maskY = this.laneMaskTop();
    const maskHeight = this.height - maskY;
    if (maskHeight <= 0) return;
    this.maskGraphic.rect(this.laneAreaX, maskY, LANE_AREA_WIDTH, maskHeight);
    this.maskGraphic.fill(COLORS.MASK_BELOW_JUDGMENT);
  }

  /**
   * 이번 프레임의 고도(0~1). 고도 상태를 deltaMs만큼 나아가게 한 뒤(같은 객체에 쓴다) 곡 진행과 판정에 따른 임시 모델 값을 돌려준다.
   * 고도 계산도 위치 인자로 불러 프레임마다 객체를 만들지 않는다.
   * Lab 미리보기가 고정값을 걸었으면 그 값이다(고도 상태는 그래도 계속 나아간다). renderFrame이 프레임마다 한 번 부른다.
   */
  private advanceFlightAltitude(songTimeMs: number, deltaMs: number): number {
    stepFlightAltitude(this.flightAltitudeState, deltaMs, this.flightAltitudeState);
    if (this.altitudeOverride !== null) return this.altitudeOverride;
    return resolveFlightAltitude(this.flightAltitudeState, songTimeMs, this.chartDurationMs);
  }

  // 불변: timing은 여기 넘기는 notes/trillZones/events와 **같은 차트**에서 파생돼야 한다.
  // noteRenderData가 timing.noteTimesMs.get(index)!로 인덱스 정합을 전제하므로, 어긋나면
  // 조용히 undefined timeMs가 흐른다. 현재 콜러(PlayScreen·TutorialPreviewPlayer)는 모두
  // 같은 차트로 createChartTiming한다. (후속 deepening: setChart가 ChartTimingSource를
  // 받아 내부에서 파생 — #142 리뷰 MEDIUM / #141 PlaySession 소재)
  setChart(
    notes: readonly NoteEntity[],
    trillZones: readonly TrillZone[],
    restZones: readonly RestZone[],
    events: readonly ChartEvent[],
    timing: ChartTiming,
    durationMs: number = 0,
  ): void {
    this.timing = timing;
    this.trillZones = trillZones;
    this.restZones = restZones;
    this.chartDurationMs = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
    this.flightBackground?.reset();
    this.flightAltitudeState = createFlightAltitudeState();
    // 차트를 (다시) 걸면(되감기·새 차트) 게이지는 이징 없이 새 고도로 바로 맞춘다.
    this.gearGauge?.snapNext();

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
    const trillLongIndices = new Set(this.noteRenderData
      .filter(data => data.entity.type === 'trillLong')
      .map(data => data.index));
    this.noteRenderer.setLongNoteConnections(connectedPredecessor, startMsByIndex, trillLongIndices);
  }

  renderFrame(songTimeMs: number, deltaMs: number = 16): void {
    // 초기화가 끝나기 전(로딩 지연)이나 dispose 직후에 렌더가 들어오면 PIXI 내부 렌더러가
    // null이라 this.app.render()가 alphaMode를 null에서 읽어 크래시한다. 준비 전에는 조용히 건너뛴다.
    if (!this.initialized || !this.app.renderer) return;

    this.judgmentUI.updateFade(deltaMs);
    // 고도는 프레임마다 한 번 계산해 보여 주는 곳(비행 배경·기어 게이지)에 같은 값을 준다. 둘 다 없으면(튜토리얼 재생기) 계산하지 않는다.
    if (this.flightBackground || this.gearGauge) {
      const altitude = this.advanceFlightAltitude(songTimeMs, deltaMs);
      this.flightBackground?.render(altitude, deltaMs);
      // 게이지 이징도 렌더 프레임 간격 `deltaMs`로만 나아가 일시정지 중에는 멈춘다(최대 50ms).
      this.gearGauge?.update(altitude, deltaMs);
    }
    // `gearMotion`의 애니메이션 경과 시간은 곡 시간이 아니라 렌더 프레임 간격으로만 나아간다(일시정지 중에는 이 함수가 불리지 않아 멈춘다).
    this.gearMotionController?.advance(deltaMs);

    // Hide all pooled graphics
    for (const g of this.measureLinePool) g.visible = false;
    for (const g of this.restZonePool) g.visible = false;
    for (const g of this.trillZonePool) g.visible = false;
    this.longNoteBodyLayer.removeChildren();
    this.longNoteEndLayer.removeChildren();
    this.longNoteHeadLayer.removeChildren();
    this.noteLayer.removeChildren();

    const visibleWindowMs = (this.height / this._scrollSpeed) * 1000 + 500;
    const minTime = songTimeMs - this.lateNoteWindowMs();
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

  recordFlightJudgment(grade: JudgmentGrade): void {
    this.flightAltitudeState = applyFlightJudgment(
      this.flightAltitudeState,
      grade,
    );
  }

  // 마디선·구간 밴드는 풀에 넣을 때 한 번만 그리고 프레임마다 위치·세로 배율만 바꾼다(매 프레임 Graphics를 다시 만들지 않는다).
  private getMeasureLineFromPool(index: number): Graphics {
    if (index < this.measureLinePool.length) {
      return this.measureLinePool[index];
    }
    // 판정선처럼 선 두께의 가운데가 g.y(마디 시각 위치)에 오도록 그린다. 노트 가운데와 같은 기준이다(#224).
    const g = new Graphics()
      .rect(this.laneAreaX, -this.measureLineThickness / 2, LANE_AREA_WIDTH, this.measureLineThickness)
      .fill({ color: COLORS.MEASURE_LINE, alpha: COLORS.MEASURE_LINE_ALPHA });
    this.measureLinePool.push(g);
    this.measureLineLayer.addChild(g);
    return g;
  }

  /** 레인 폭 × 높이 1 밴드. 놓을 때 위끝을 y, 높이를 scale.y로 정한다. */
  private static createLaneBand(color: number, alpha: number): Graphics {
    return new Graphics().rect(0, 0, LANE_WIDTH, 1).fill({ color, alpha });
  }

  private getTrillZoneFromPool(index: number): Graphics {
    if (index < this.trillZonePool.length) {
      return this.trillZonePool[index];
    }
    const g = GameRenderer.createLaneBand(COLORS.TRILL_ZONE_BG, COLORS.TRILL_ZONE_ALPHA);
    this.trillZonePool.push(g);
    this.trillZoneLayer.addChild(g);
    return g;
  }

  private getRestZoneFromPool(index: number): Graphics {
    if (index < this.restZonePool.length) {
      return this.restZonePool[index];
    }
    const g = GameRenderer.createLaneBand(COLORS.REST_ZONE_DIM, COLORS.REST_ZONE_ALPHA);
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
      const laneX = this.noteRenderer.getLaneX(zone.lane);

      // endY(구간 끝, 위) → startY(구간 시작, 아래) 사이를 레인 폭으로 채운다. 노트 칸이 아니라 시각 구간 자체를 그리므로
      // 경계 박의 노트(허용)는 가운데가 밴드 경계에 걸친다 — 에디터 타임라인과 같다.
      zoneGraphic.position.set(laneX, endY);
      zoneGraphic.scale.y = Math.max(startY - endY, 1);
      zoneGraphic.visible = true;
    }
  }

  private renderMeasureLines(songTimeMs: number): void {
    let poolIdx = 0;
    for (const mMs of this.measureTimesMs) {
      const y = this.noteRenderer.calculateNoteY(mMs, songTimeMs);
      if (y < -2 || y > this.height + 2) continue;

      const line = this.getMeasureLineFromPool(poolIdx++);
      line.y = y;
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
      const laneX = this.noteRenderer.getLaneX(zone.lane);

      // trillZone은 같은 시작/끝 박의 롱노트 body와 같은 길이·위치로 그린다.
      // startY/endY는 시각 위치(노트 박스 가운데, #224)라 롱노트 body는 top = endY − 노트 반 칸(끝 칸 윗변),
      // bottom = startY + 노트 반 칸(머리 칸 아랫변)이다. 트릴 노트 바운딩 박스 폭 = LANE_WIDTH와도 일치.
      zoneGraphic.position.set(laneX, endY - NOTE_HEIGHT / 2);
      zoneGraphic.scale.y = Math.max(startY - endY + NOTE_HEIGHT, NOTE_HEIGHT); // 최소 한 칸(길이 0)
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

  /** 노트 판정 시 봄 이펙트 재생 */
  showBombEffect(lane: number): void {
    if (this.bombScale === 0) return;
    const textures = this.skinManager.getBombTextures();
    if (textures.length === 0) return;

    const anim = new AnimatedSprite(textures);
    anim.anchor.set(0.5, 0.5);
    anim.x = this.noteRenderer.getLaneX(lane) + LANE_WIDTH / 2;
    anim.y = this._judgmentLineY;
    anim.width = KEY_BOMB_SIZE * this.bombScale;
    anim.height = KEY_BOMB_SIZE * this.bombScale;
    const durationMs = this.skinManager.getTheme().bombDurationMs;
    anim.animationSpeed = durationMs ? textures.length * 1000 / (60 * durationMs) : 1;
    anim.loop = false;
    anim.onComplete = () => { anim.destroy(); };
    anim.play();
    this.effectLayer.addChild(anim);
  }

  /**
   * 같은 렌더러로 다른 차트를 이어 그릴 때(튜토리얼 프리뷰 슬롯 재사용) 이전 차트가 남긴 일시 표시를 지운다.
   * 재생 중인 봄, 판정 텍스트, 키빔·레인 키캡·키보드 눌림, 이벤트 문구, 이전 판정 세션의 body 조회가 대상이다.
   * 노트 풀과 노트 표시 상태는 setChart가 비운다.
   */
  resetTransientState(): void {
    if (!this.initialized) return;
    // 봄은 Ticker.shared로 재생하다 끝나면 스스로 파괴된다. 끝나기 전에 떼어 내 새 차트 위에 남지 않게 한다.
    for (const bomb of this.effectLayer.removeChildren()) bomb.destroy();
    this.judgmentUI.reset();
    for (let lane = 1; lane <= LANE_COUNT; lane++) this.setKeyBeam(lane, false);
    for (const entry of this.tutorialKeyboardKeys) {
      if (!entry.pressed) continue;
      entry.pressed = false;
      this.drawTutorialKey(entry, false);
    }
    this.eventMessageText.text = "";
    this.noteRenderer.setJudgmentBodyStateQuery(null);
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

  /** 지금 판정선 y(논리 단위, 리프트 반영). 노트 판정 위치·키봄·디버그 기록이 같은 값을 쓴다. */
  get judgmentLineY(): number {
    return this._judgmentLineY;
  }

  /** 기어 배치(논리 단위). 기어를 그리지 않으면(showGear false·텍스처 없음) null. */
  get gearLayout(): Readonly<GearLayout> | null {
    return this._gearLayout;
  }

  /**
   * 기어 유리관 고도 게이지에 지금 보이는 채움(0~1, 이징 반영). 두 유리관은 같은 값이다.
   * 게이지를 그리지 않으면(showGear false·빈 유리 텍스처 없음·dispose 뒤) null. Lab 무대와 E2E가 읽는다.
   */
  get gearGaugeLevel(): number | null {
    return this.gearGauge?.level ?? null;
  }

  /**
   * 미리보기(Lab `/lab/gear`) 전용: 비행 배경과 기어 게이지가 보여 줄 고도를 altitude(0~1로 자름, NaN은 0)로 고정한다.
   * null이면 곡 진행·판정에 따른 고도 모델로 돌아간다. 게임은 부르지 않는다. 게이지는 바뀐 값으로 이징하고,
   * 고도 모델의 상태는 고정하는 동안에도 그대로 나아간다.
   */
  setAltitudeOverride(altitude: number | null): void {
    this.altitudeOverride = altitude === null ? null : clampFlightAltitude(altitude);
  }

  /**
   * `gearMotion` 조절(RFD 0029). init이 끝나면 `gearMotion`은 `holder`에 추가돼 있다(status ready). 애니메이션 경과 시간(`timeMs`)을 읽고, Lab 미리보기가 켜기·레이어·
   * 처음부터 재생을 부른다. `gearMotion`을 만들지 않으면(gearMotion false·기어 없음·dispose 뒤) null.
   */
  get gearMotion(): GearMotionControls | null {
    return this.gearMotionController;
  }

  /**
   * 기어 그림 좌표(1024×1536)로 그린 레이어를 기어 위, 같은 깊이(판정선·레인 키 라벨 위, 키봄·UI 아래)에
   * 기어와 같은 변환으로 붙인다. 내장 `gearMotion`이 쓴다. 고도 게이지가 있으면 그 아래에 넣어 게이지가 늘 맨 위에 남는다
   * (빈 유리 덮개가 빈 부분의 `gearMotion` 액체·기포를 가린다).
   * 기어가 없으면 붙이지 않고 null을 돌려준다. 붙인 레이어의 정리는 호출자가 한다(기어 레이어와 함께 파괴된다).
   */
  addGearOverlay(overlay: Container): Readonly<GearLayout> | null {
    const layout = this._gearLayout;
    if (!layout || this.gearLayer.destroyed) return null;
    overlay.position.set(layout.x, layout.y);
    overlay.scale.set(layout.scale);
    const gauge = this.gearGauge?.container;
    if (gauge && gauge.parent === this.gearLayer) this.gearLayer.addChildAt(overlay, this.gearLayer.getChildIndex(gauge));
    else this.gearLayer.addChild(overlay);
    return layout;
  }

  /**
   * 판정선을 기본 위치(y 416)에서 y만큼 올린다. 판정선과 딸린 표시(노트 판정 위치·판정 글자·콤보와 정확도 글자·
   * 이후 키봄)만 움직이고, 기어와 레인 가림막은 고정이다(RFD 0029). 기어가 없는 미니 렌더러는 가림막도 따라온다.
   */
  setLift(y: number): void {
    this._judgmentLineY = this.height - this.judgmentLineOffset - y;
    this.drawJudgmentLine();
    if (!this._gearLayout) this.drawMask();
    this.comboText.y = this._judgmentLineY - COMBO_OFFSET;
    this.accuracyText.y = this._judgmentLineY - ACCURACY_OFFSET;
    this.judgmentUI.setPosition(this._judgmentLineY);
    this.noteRenderer.setJudgmentLineY(this._judgmentLineY);
  }

  setSudden(y: number): void {
    // TODO: Implement sudden cover mask
    void y;
  }

  /**
   * 플레이 영역(높이 600) 오른쪽 아래에 키보드 배치를 직접 그린다. 레인·기어와 무관하게 화면 구석에 붙고,
   * 기어 실루엣(없으면 레인 영역) 오른쪽 빈 곳이 좁으면 줄이거나 숨긴다(KeyboardDisplay.placeKeyboardDisplay).
   */
  setupKeyboardDisplay(laneBindings: Map<string, number>): void {
    this.keyboardDisplay?.dispose();
    const obstacleRight = this._gearLayout?.silhouetteRightX ?? this.laneAreaX + LANE_AREA_WIDTH;
    this.keyboardDisplay = new KeyboardDisplay(this.uiLayer);
    this.keyboardDisplay.setup(laneBindings, {
      width: this.width,
      height: this.height,
      freeLeft: obstacleRight + GEAR_CLEARANCE,
    });
  }

  setKeyState(keyCode: string, pressed: boolean): void {
    this.keyboardDisplay?.setKeyState(keyCode, pressed);
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

  /** 새 core의 unit별 body 상태를 전달한다. 실제 live 연결은 통합 gate 이후에 수행한다. */
  setJudgmentBodyStateQuery(query: JudgmentBodyStateQuery | null): void {
    this.noteRenderer.setJudgmentBodyStateQuery(query);
  }

  dispose(removeView = true): void {
    if (!this.initialized) return;
    this.initialized = false;
    // 곡 시작 전 준비가 끈 autoGarbageCollect를 원래 값으로 되돌린다. 스킨이 먼저 해제되어 파괴된 소스는 건너뛴다.
    for (const [source, autoGarbageCollect] of this.autoGarbageCollectBeforePlayback) {
      if (!source.destroyed) source.autoGarbageCollect = autoGarbageCollect;
    }
    this.autoGarbageCollectBeforePlayback.clear();
    this.flightBackground?.dispose();
    this.flightBackground = null;
    // `gearMotion` 텍스처는 공유 로더 소유라 lease만 release한다(마지막 lease면 로더가 unload한다).
    this.gearMotionController?.destroy();
    this.gearMotionController = null;
    // 게이지가 만든 행 텍스처만 정리한다(빈 유리 아틀라스는 SkinManager 소유).
    this.gearGauge?.destroy();
    this.gearGauge = null;
    this.gearTextures = [];
    this.noteRenderer.dispose();
    // Boolean true also clears Pixi's global pools in v8. Other tutorial
    // slots still own pooled text textures and bounds, so release only this app.
    this.app.destroy({ removeView, releaseGlobalResources: false }, { children: true, texture: false });
    this.keyBeamGraphics = [];
    // Text/Graphics/기어 스프라이트 자체는 app.destroy(children: true)가 파괴한다 — 참조만 비운다.
    // 기어·빈 유리 텍스처는 SkinManager 소유라 파괴하지 않는다(texture: false).
    this.laneKeyLabels = [];
    this.tutorialKeyboardKeys = [];
    this.tutorialKeyboardKeyByCode = new Map();
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
