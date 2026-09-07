/**
 * PixiJS v8 Timeline Renderer — chart-editor.md §Timeline Layout 기준
 *
 * 7 lanes: 4 note lanes (L1~L4) + BPM + time signature + message
 * 14 z-order layers (back to front)
 * Vertical timeline (time flows bottom-to-top)
 */

import { Application, Container, Graphics, TextStyle, FillGradient } from "pixi.js";
import type { ViewportSource } from "../stores/viewportSlice";
import type {
  Chart,
  Beat,
  NoteEntity,
  BpmMarker,
  TimeSignatureMarker,
} from "../../shared";
import { beatToMs, measureStartBeat, extractBpmMarkers, extractTimeSignatures } from "../../shared";
import {
  TIMELINE_WIDTH,
  DEFAULT_MEASURES,
  TIMELINE_PADDING,
  EXTRA_LANE_WIDTH,
  MEASURE_LABEL_WIDTH,
  MINIMAP_WIDTH,
} from "./constants";
import {
  getTimelineContentHeight,
  getTimelineTotalHeight,
  getVisibleTimelineTimeRange,
  screenYToTimelineTime,
  timeToTimelineY,
} from "./timelineProjection";
import {
  clampHorizontalPan,
  getContentCenterShiftX,
  getFixedTimelineOverlayOffsetX,
  getMeasureLabelLayerOffsetX,
  getPlaybackCursorLineEndX,
  getTimelineContentViewportRect,
  getTimelineContentOffsetX,
  screenXToTimelineX as mapScreenXToTimelineX,
  shouldRenderPlaybackCursorHandle,
} from "./timelineViewport";
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
  /**
   * 뷰포트 상태(zoom·snapDivision·scrollY)의 읽기 전용 소스.
   * 렌더러는 구독만 하며 쓰기 표면(setter)이 없다 — 쓰기는 뷰포트 슬라이스 액션만.
   */
  viewport: ViewportSource;
  /** 미니맵 드래그의 스크롤 의도를 소유자(뷰포트 슬라이스 액션)로 전달한다. */
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
  private restZoneLayer!: Container;
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
  private measureLabelBackground!: Graphics;
  private measureLabels!: Container;
  private playbackCursorLayer!: Container;
  private minimapLayer!: Container;
  private scrollableContentMask!: Graphics;

  // Sub-renderers (composition)
  private minimapRenderer!: MinimapRenderer;
  private gridRenderer!: GridRenderer;
  private noteRenderer!: NoteRenderer;
  private overlayRenderer!: OverlayRenderer;

  // State
  private _zoom: number = 200; // pixelPerSecond
  private _scrollY: number = 0;
  private _horizontalPanX: number = 0;
  private _minimapVisible: boolean = true;
  private _snap: number = 4; // 1/4 beat snap
  private _selectedNotes: Set<number> = new Set();
  private _selectedTrillZones: Set<number> = new Set();
  private _selectedRestZones: Set<number> = new Set();
  private _moveOrigins: { note: NoteEntity; beat: Beat; endBeat?: Beat; lane: number }[] | null = null;
  private _boxSelectRect: { startY: number; startLane: number; endY: number; endLane: number } | null = null;

  // Extra lane state
  private _extraLaneCount: number = 0;
  private _hoveredNoteIndex: number | null = null;
  private _hoveredTrillZoneIndex: number | null = null;
  private _hoveredRestZoneIndex: number | null = null;
  // 롱노트 리사이즈 캡을 hover로 표시할 노트 인덱스(= select 모드에서 hover 중인 노트). 캡 표시 게이팅용.
  private _resizeHoverNoteIndex: number | null = null;

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

  // Violation overlay state — 낙관적 편집 위반 표시(RFD 0017 §3-3·§7). 노트·트릴존·restZone·이벤트 각각.
  private _violatingNoteIndices: Set<number> = new Set();
  private _violatingTrillZoneIndices: Set<number> = new Set();
  private _violatingRestZoneIndices: Set<number> = new Set();
  private _violatingEventIndices: Set<number> = new Set();

  // Chart data
  private chart: Chart | null = null;

  // Waveform data
  private waveformPeaks: Float32Array | null = null;
  private waveformDurationMs: number = 0;

  // BPM/TimeSignature extraction cache
  private _cachedBpmMarkers: BpmMarker[] | null = null;
  private _cachedTimeSignatures: TimeSignatureMarker[] | null = null;
  private _cachedEventsRef: readonly import("../../shared").ChartEvent[] | null = null;

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
    // 뷰포트 초기값은 소유자(뷰포트 슬라이스)에서 온다.
    const viewport = options.viewport.get();
    this._zoom = viewport.zoom;
    this._snap = viewport.snapDivision;
    this._scrollY = viewport.scrollY;
  }

  private unsubscribeViewport: (() => void) | null = null;
  private viewportDrawHandle: number | null = null;
  private pendingViewportDraw: "scroll" | "full" | null = null;

  /**
   * 뷰포트 변경 반영 — 캐시(_zoom/_snap/_scrollY)는 동기로 갱신해 후속 yToTime 등이
   * 즉시 새 좌표계를 쓰게 하고, **그리기는 rAF로 코얼레싱**한다: 한 프레임에 몰린
   * 휠 틱 N개 → 렌더 1회. (구 useEffect 경유 시절 React 배칭이 하던 코얼레싱을 명시적으로 수행.)
   * zoom·snap은 전체 재렌더, scrollY는 임계값(뷰포트 30%) 기반 부분/전체 렌더.
   */
  private onViewportChanged(): void {
    const viewport = this.options.viewport.get();
    const zoomOrSnapChanged = viewport.zoom !== this._zoom || viewport.snapDivision !== this._snap;
    const scrollChanged = viewport.scrollY !== this._scrollY;
    this._zoom = viewport.zoom;
    this._snap = viewport.snapDivision;
    this._scrollY = viewport.scrollY;
    if (!zoomOrSnapChanged && !scrollChanged) return;

    // 'full'은 'scroll'을 포함 — 에스컬레이션만 하고 다운그레이드하지 않는다.
    this.pendingViewportDraw =
      zoomOrSnapChanged || this.pendingViewportDraw === "full" ? "full" : "scroll";
    if (this.viewportDrawHandle !== null) return;

    this.viewportDrawHandle = requestAnimationFrame(() => {
      this.viewportDrawHandle = null;
      const mode = this.pendingViewportDraw;
      this.pendingViewportDraw = null;
      if (!this.initialized || mode === null) return;

      if (mode === "full") {
        this.render(); // render()가 updateScroll까지 수행한다
        return;
      }
      this.updateScroll();
      const threshold = this.options.height * 0.3;
      if (Math.abs(this._scrollY - this._lastRenderScrollY) > threshold) {
        this.render();
      } else {
        this.minimapRenderer.updateViewport();
        this.app?.render();
      }
    });
  }

  /**
   * Initialize PixiJS Application (v8 API: create then init)
   */
  async init(): Promise<void> {
    this.app = new Application();
    await import("pixi.js/unsafe-eval");
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
    this.restZoneLayer = new Container();
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
    this.measureLabelBackground = new Graphics();
    this.measureLabels = new Container();
    this.playbackCursorLayer = new Container();

    this.app.stage.addChild(this.laneBackgrounds);
    this.app.stage.addChild(this.waveformLayer);
    this.app.stage.addChild(this.measureLines);
    this.app.stage.addChild(this.beatLines);
    this.app.stage.addChild(this.snapLines);
    // restZone 밴드는 "쉬는 레인" 배경 dim이므로 trillZone보다 뒤(아래), 노트보다 아래에 둔다 (RFD 0019).
    this.app.stage.addChild(this.restZoneLayer);
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
    this.app.stage.addChild(this.playbackCursorLayer);
    this.app.stage.addChild(this.measureLabelBackground);
    this.app.stage.addChild(this.measureLabels);

    this.scrollableContentMask = new Graphics();
    this.app.stage.addChild(this.scrollableContentMask);
    this.applyScrollableContentMask();
    this.updateScrollableContentMask();
    this.updateMeasureLabelBackground();

    // Minimap layer (topmost, not affected by scroll)
    this.minimapLayer = new Container();
    this.app.stage.addChild(this.minimapLayer);

    // Build sub-renderers via host interfaces
    this._initSubRenderers();

    this.minimapRenderer.setupEvents();

    this.initialized = true;
    // 레이어가 모두 준비된 뒤에만 뷰포트 변경을 반영한다.
    this.unsubscribeViewport = this.options.viewport.subscribe(() => this.onViewportChanged());
  }

  private _initSubRenderers(): void {
    // Host getter objects below need a stable reference to the renderer instance.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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
      get minimapVisible() { return self._minimapVisible; },
      get violatingNoteIndices() { return self._violatingNoteIndices; },
      get violatingTrillZoneIndices() { return self._violatingTrillZoneIndices; },
      get violatingRestZoneIndices() { return self._violatingRestZoneIndices; },
      get violatingEventIndices() { return self._violatingEventIndices; },
    });

    // GridRenderer host
    const gridHost: GridHost = {
      get chart() { return self.chart; },
      get zoom() { return self._zoom; },
      get snap() { return self._snap; },
      get extraLaneCount() { return self._extraLaneCount; },
      get selectedTrillZones() { return self._selectedTrillZones; },
      get selectedRestZones() { return self._selectedRestZones; },
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
      get restZoneLayer() { return self.restZoneLayer; },
      get measureLabels() { return self.measureLabels; },
    };
    this.gridRenderer = new GridRenderer(gridHost);

    // NoteRenderer host
    const noteHost: NoteHost = {
      get chart() { return self.chart; },
      get selectedNotes() { return self._selectedNotes; },
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
      get selectedNotes() { return self._selectedNotes; },
      get selectedTrillZones() { return self._selectedTrillZones; },
      get selectedRestZones() { return self._selectedRestZones; },
      get resizeHoverNoteIndex() { return self._resizeHoverNoteIndex; },
      get violatingNoteIndices() { return self._violatingNoteIndices; },
      get violatingTrillZoneIndices() { return self._violatingTrillZoneIndices; },
      get violatingRestZoneIndices() { return self._violatingRestZoneIndices; },
      get violatingEventIndices() { return self._violatingEventIndices; },
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
   * 뷰포트 읽기 getter — 쓰기는 뷰포트 슬라이스 액션만 (setter 없음, ViewportSource 구독으로 반영).
   */
  get zoom(): number {
    return this._zoom;
  }

  get scrollY(): number {
    return this._scrollY;
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

  /** Set trill zone indices that are selected alongside notes (for highlight) */
  setSelectedTrillZones(indices: Set<number>): void {
    this._selectedTrillZones = indices;
    this.render();
  }

  /** 유닛으로 선택된 restZone 인덱스 설정 (선택 outline·리사이즈 캡 게이팅, RFD 0019) */
  setSelectedRestZones(indices: Set<number>): void {
    this._selectedRestZones = indices;
    this.render();
  }

  /** Set extra lane count */
  setExtraLaneCount(count: number): void {
    this._extraLaneCount = count;
    this._horizontalPanX = clampHorizontalPan({
      requestedPanX: this._horizontalPanX,
      timelineWidth: this.currentTimelineWidth,
      viewportWidth: this.options.width,
      leftRailWidth: MEASURE_LABEL_WIDTH,
      rightRailWidth: this.rightRailWidth,
    });
    this.render();
    this.updatePlaybackCursor(this._lastCursorTimeMs);
  }

  get extraLaneCount(): number {
    return this._extraLaneCount;
  }


  /** Set hovered note index (or null to clear) — lightweight overlay update */
  setHoveredNote(index: number | null): void {
    if (this._hoveredNoteIndex === index) return;
    this._hoveredNoteIndex = index;
    this.updateHoverOverlay();
  }


  /** Set hovered trill zone index (or null to clear) — 핸들을 hover 시에만 표시 */
  setHoveredTrillZone(index: number | null): void {
    if (this._hoveredTrillZoneIndex === index) return;
    this._hoveredTrillZoneIndex = index;
    this.updateHoverOverlay();
  }

  /** Set hovered rest zone index (or null to clear) — 캡을 hover 시에만 표시 (RFD 0019) */
  setHoveredRestZone(index: number | null): void {
    if (this._hoveredRestZoneIndex === index) return;
    this._hoveredRestZoneIndex = index;
    this.updateHoverOverlay();
  }

  /** 롱노트 리사이즈 캡을 hover로 표시할 노트 인덱스 설정 (select 모드 게이팅은 호출부에서) */
  setResizeHoverNote(index: number | null): void {
    if (this._resizeHoverNoteIndex === index) return;
    this._resizeHoverNoteIndex = index;
    this.updateHoverOverlay();
  }

  /** Dynamic timeline width including extra lanes */
  get currentTimelineWidth(): number {
    return TIMELINE_WIDTH + this._extraLaneCount * EXTRA_LANE_WIDTH;
  }

  private get rightRailWidth(): number {
    return this._minimapVisible ? MINIMAP_WIDTH : 0;
  }

  set horizontalPanX(value: number) {
    const next = clampHorizontalPan({
      requestedPanX: value,
      timelineWidth: this.currentTimelineWidth,
      viewportWidth: this.options.width,
      leftRailWidth: MEASURE_LABEL_WIDTH,
      rightRailWidth: this.rightRailWidth,
    });
    if (next === this._horizontalPanX) return;
    this._horizontalPanX = next;
    this.updateScroll();
    this.updatePlaybackCursor(this._lastCursorTimeMs);
    this.app?.render();
  }

  get horizontalPanX(): number {
    return this._horizontalPanX;
  }

  panHorizontally(deltaX: number): void {
    this.horizontalPanX = this._horizontalPanX + deltaX;
  }

  /**
   * Set move origin ghost data (shown during note drag move).
   * Pass original note entities with their original positions.
   */
  setMoveOrigins(origins: { note: NoteEntity; beat: Beat; endBeat?: Beat; lane: number }[]): void {
    this._moveOrigins = origins;
  }

  /** Clear move origin ghosts */
  clearMoveOrigins(): void {
    this._moveOrigins = null;
  }

  /** Set box select rectangle for visual feedback (pixel Y coords) */
  setBoxSelectRect(rect: { startY: number; startLane: number; endY: number; endLane: number }): void {
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
    return getTimelineContentHeight({
      totalTimelineHeight: this.totalTimelineHeight,
      viewportHeight: this.options.height,
    });
  }

  /**
   * 콘텐츠 블록(마디 레일 + 레인)을 가로 중앙 정렬하기 위한 추가 오프셋(px).
   * 미니맵(우측 레일)은 이 정렬에서 제외되어 항상 우측 끝에 고정된다.
   */
  get contentCenterShiftX(): number {
    return getContentCenterShiftX({
      viewportWidth: this.options.width,
      leftRailWidth: MEASURE_LABEL_WIDTH,
      timelineWidth: this.currentTimelineWidth,
      rightRailWidth: this.rightRailWidth,
    });
  }

  /**
   * Horizontal offset that anchors the timeline content right after the fixed
   * left rail, plus the center-shift, minus the horizontal pan.
   */
  get contentOffsetX(): number {
    return getTimelineContentOffsetX({
      leftRailWidth: MEASURE_LABEL_WIDTH,
      horizontalPanX: this._horizontalPanX,
      centerShiftX: this.contentCenterShiftX,
    });
  }

  screenXToTimelineX(screenX: number): number {
    return mapScreenXToTimelineX({
      screenX,
      contentOffsetX: this.contentOffsetX,
    });
  }

  private getScrollableContentLayers(): Container[] {
    return [
      this.laneBackgrounds,
      this.waveformLayer,
      this.measureLines,
      this.beatLines,
      this.snapLines,
      this.restZoneLayer,
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
    ];
  }

  private applyScrollableContentMask(): void {
    for (const layer of this.getScrollableContentLayers()) {
      layer.mask = this.scrollableContentMask;
    }
  }

  private updateScrollableContentMask(): void {
    const rect = getTimelineContentViewportRect({
      viewportWidth: this.options.width,
      viewportHeight: this.options.height,
      leftRailWidth: MEASURE_LABEL_WIDTH,
      rightRailWidth: this.rightRailWidth,
    });

    this.scrollableContentMask.clear();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.scrollableContentMask.rect(rect.x, rect.y, rect.width, rect.height);
    this.scrollableContentMask.fill(0xffffff);
  }

  private updateMeasureLabelBackground(): void {
    // 마디 번호 레일에는 별도 배경을 그리지 않는다.
    // 캔버스 배경이 이미 검정이고, 불투명 배경이 재생 커서를 가렸으며,
    // 스크롤 콘텐츠는 마스크 때문에 레일 영역으로 들어오지 않는다.
    this.measureLabelBackground.clear();
  }

  /**
   * Convert time (ms) to Y pixel position (container-local space).
   * Time flows bottom-to-top: minTime = near bottom (with padding below), later time = higher (lower Y).
   */
  timeToY(timeMs: number): number {
    return timeToTimelineY({
      timeMs,
      contentHeight: this.contentHeight,
      padding: TIMELINE_PADDING,
      zoom: this._zoom,
      minTimeMs: this.getMinTimeMs(),
    });
  }

  /**
   * Convert screen Y pixel position to time (ms).
   * Accounts for scroll offset, bottom-to-top layout, and bottom padding.
   */
  yToTime(y: number): number {
    return screenYToTimelineTime({
      screenY: y,
      scrollY: this._scrollY,
      contentHeight: this.contentHeight,
      padding: TIMELINE_PADDING,
      zoom: this._zoom,
      minTimeMs: this.getMinTimeMs(),
    });
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
    return getTimelineTotalHeight({
      totalTimelineMs: this.getTotalTimelineMs(),
      minTimeMs: this.getMinTimeMs(),
      zoom: this._zoom,
      padding: TIMELINE_PADDING,
    });
  }

  /**
   * Update scroll position for all layers (except minimap layer which stays fixed)
   */
  private updateScroll(): void {
    const offsetX = this.contentOffsetX;
    for (const layer of this.getScrollableContentLayers()) {
      layer.x = offsetX;
      layer.y = -this._scrollY;
    }
    this.measureLabels.x = getMeasureLabelLayerOffsetX({
      leftRailWidth: MEASURE_LABEL_WIDTH,
      horizontalPanX: this._horizontalPanX,
      centerShiftX: this.contentCenterShiftX,
    });
    this.measureLabels.y = -this._scrollY;
    this.playbackCursorLayer.x = getFixedTimelineOverlayOffsetX({
      horizontalPanX: this._horizontalPanX,
    });
    this.playbackCursorLayer.y = -this._scrollY;
    // minimapLayer is NOT scrolled/offset — stays fixed on screen
  }

  /**
   * Calculate the visible time range (ms) for viewport culling.
   * Returns the min/max time values visible on screen, with margin to prevent
   * pop-in during scrolling.
   */
  private getVisibleTimeRange(): { minTimeMs: number; maxTimeMs: number } {
    return getVisibleTimelineTimeRange({
      scrollY: this._scrollY,
      viewportHeight: this.options.height,
      contentHeight: this.contentHeight,
      padding: TIMELINE_PADDING,
      zoom: this._zoom,
      minTimeMs: this.getMinTimeMs(),
      marginRatio: 0.5,
    });
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
    this.gridRenderer.renderRestZones();
    this.gridRenderer.renderTrillZones();
    this.overlayRenderer.renderMoveOrigins();
    this.overlayRenderer.renderBoxSelectRect();
    this.noteRenderer.beginRender();
    this.noteRenderer.renderNotes();
    this.gridRenderer.renderMarkers(this.noteLayer, this._eventLabelStyle, (style) => { this._eventLabelStyle = style; });
    this.overlayRenderer.renderViolationOverlay();
    this.updateHoverOverlay();
    this.updateScroll();
    // center-shift가 바뀌면(추가 레인 로드 등) 마디 레일 배경도 같은 위치로 다시 그린다
    this.updateMeasureLabelBackground();
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
    destroyChildren(this.restZoneLayer);
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

    // Cursor line (bright green, full width)
    this._cursorLine.clear();
    this._cursorLine.moveTo(0, y);
    this._cursorLine.lineTo(getPlaybackCursorLineEndX({
      viewportWidth: this.options.width,
      horizontalPanX: this._horizontalPanX,
    }), y);
    this._cursorLine.stroke({ width: 2, color: 0x00ff88 });

    if (!shouldRenderPlaybackCursorHandle()) {
      this._cursorHandle?.clear();
      return;
    }

    // Draggable handle fixed inside the left rail.
    if (!this._cursorHandle) {
      this._cursorHandle = new Graphics();
      this.playbackCursorLayer.addChild(this._cursorHandle);
    }

    const hs = 8; // half-size of handle
    const hx = MEASURE_LABEL_WIDTH - hs;
    this._cursorHandle.clear();
    this._cursorHandle.moveTo(hx, y - hs);
    this._cursorHandle.lineTo(hx + hs * 2, y);
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
    this.overlayRenderer.updateHoverOverlay(
      this._hoveredNoteIndex,
      this._hoveredTrillZoneIndex,
      this._hoveredRestZoneIndex,
    );
  }

  /**
   * 제약을 위반하는 노트·트릴존·restZone·이벤트 인덱스를 설정한다(빨간 해칭 오버레이).
   * 낙관적 편집에서 차트 변경 시마다 App이 validateChart 파생 인덱스로 호출한다(RFD 0017 §3-3·§7, RFD 0019).
   */
  setViolations(noteIndices: Set<number>, trillZoneIndices: Set<number>, restZoneIndices: Set<number>, eventIndices: Set<number>): void {
    this._violatingNoteIndices = noteIndices;
    this._violatingTrillZoneIndices = trillZoneIndices;
    this._violatingRestZoneIndices = restZoneIndices;
    this._violatingEventIndices = eventIndices;
    this.overlayRenderer.renderViolationOverlay();
    // 미니맵 위반 틱(RFD 0017 §7)만 경량 갱신 — 전체 render는 O(N) 노트 순회+자식 재생성이라
    // 낙관적 편집 드래그 중 매 프레임 2회 돌면 비싸다(fable 리뷰 MEDIUM). 전용 틱 Graphics만 갱신.
    this.minimapRenderer.renderViolationTicks();
    this.app?.render();
  }


  /**
   * Resize the renderer to new dimensions.
   */
  resize(width: number, height: number): void {
    this.options.width = width;
    this.options.height = height;
    this._horizontalPanX = clampHorizontalPan({
      requestedPanX: this._horizontalPanX,
      timelineWidth: this.currentTimelineWidth,
      viewportWidth: this.options.width,
      leftRailWidth: MEASURE_LABEL_WIDTH,
      rightRailWidth: this.rightRailWidth,
    });
    if (this.initialized) {
      this.app.renderer.resize(width, height);
      this.updateScrollableContentMask();
      this.updateMeasureLabelBackground();
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
    this.unsubscribeViewport?.();
    this.unsubscribeViewport = null;
    if (this.viewportDrawHandle !== null) {
      cancelAnimationFrame(this.viewportDrawHandle);
      this.viewportDrawHandle = null;
    }
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
