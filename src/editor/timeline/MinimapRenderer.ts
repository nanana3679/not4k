/**
 * MinimapRenderer — TimelineRenderer의 미니맵 관련 로직을 담당하는 클래스.
 * Composition 패턴으로 TimelineRenderer에 포함된다.
 */

import { Container, Graphics, TextStyle } from "pixi.js";
import { beatToMs, measureStartBeat, isMainLane } from "../../shared";
import {
  LANE_COUNT,
  COLORS,
  MINIMAP_WIDTH,
  MEASURE_LABEL_WIDTH,
} from "./constants";
import { isRightRailX } from "./timelineViewport";
import { computeMinimapTrillZoneRects } from "./minimapTrillZone";
import { computeMinimapRestZoneRects } from "./minimapRestZone";
import { computeMinimapViolationRects, type MinimapViolationRect } from "./minimapViolation";
import type { Chart } from "../../shared";

/** MinimapRenderer가 TimelineRenderer에서 필요로 하는 인터페이스 */
export interface MinimapHost {
  readonly chart: Chart | null;
  readonly options: { canvas: HTMLCanvasElement; width: number; height: number; onScroll?: (scrollY: number) => void };
  readonly scrollY: number;
  readonly totalTimelineHeight: number;
  readonly waveformDurationMs: number;
  readonly zoom: number;
  readonly cachedBpmMarkers: import("../../shared").BpmMarker[];
  readonly cachedTimeSignatures: import("../../shared").TimeSignatureMarker[];
  getTotalTimelineMs(): number;
  timeToY(timeMs: number): number;
  readonly minimapLayer: Container;
  readonly minimapVisible: boolean;
  // 위반 지시자(RFD 0017 §7) — 낙관적 편집 위반 엔티티 인덱스
  readonly violatingNoteIndices: ReadonlySet<number>;
  readonly violatingTrillZoneIndices: ReadonlySet<number>;
  readonly violatingRestZoneIndices: ReadonlySet<number>;
  readonly violatingEventIndices: ReadonlySet<number>;
}

export class MinimapRenderer {
  // Drag state
  private _dragging: boolean = false;
  private _dragStartY: number = 0;
  private _dragStartScroll: number = 0;

  // Reusable viewport indicator Graphics (avoids 60fps destroy/create on scroll)
  private _viewport: Graphics | null = null;

  // Reusable violation tick Graphics (RFD 0017 §7). 전체 render 없이 위반만 경량 갱신
  // (낙관적 편집 드래그 중 setViolations가 매 pointer-move 호출되므로 O(N) 전체 render 회피).
  private _violationTicks: Graphics | null = null;

  // Reusable TextStyle cache
  private _timeLabelStyle: TextStyle | null = null;
  private _endTimeLabelStyle: TextStyle | null = null;

  // Bound handler for pointerup/pointerleave
  private _boundPointerUp = () => this.handlePointerUp();

  constructor(private host: MinimapHost) {}

  /**
   * Setup canvas-level pointer events for drag interaction.
   * Must be called once after canvas is available.
   */
  setupEvents(): void {
    const canvas = this.host.options.canvas;
    canvas.addEventListener("pointerup", this._boundPointerUp);
    canvas.addEventListener("pointerleave", this._boundPointerUp);
  }

  /**
   * Remove canvas-level pointer events. Call on dispose.
   */
  removeEvents(): void {
    const canvas = this.host.options.canvas;
    canvas.removeEventListener("pointerup", this._boundPointerUp);
    canvas.removeEventListener("pointerleave", this._boundPointerUp);
  }

  /**
   * Check if a screen-space x coordinate is within the minimap area.
   */
  isInMinimapArea(x: number): boolean {
    return isRightRailX({
      screenX: x,
      viewportWidth: this.host.options.width,
      railWidth: MEASURE_LABEL_WIDTH,
    });
  }

  /**
   * Handle minimap pointer down. Returns true if the event was consumed.
   */
  handlePointerDown(x: number, y: number): boolean {
    if (!this.host.minimapVisible) return false;
    if (!this.isInMinimapArea(x)) return false;

    const canvasH = this.host.options.height;
    const totalH = this.host.totalTimelineHeight;
    if (totalH <= canvasH) return false;

    const maxScroll = totalH - canvasH;
    const viewportTopY = (this.host.scrollY / totalH) * canvasH;
    const viewportHeight = (canvasH / totalH) * canvasH;

    if (y >= viewportTopY && y <= viewportTopY + viewportHeight) {
      // Start dragging viewport indicator
      this._dragging = true;
      this._dragStartY = y;
      this._dragStartScroll = this.host.scrollY;
    } else {
      // Click on minimap: jump to position (center the view at click point)
      const ratio = y / canvasH;
      const targetScroll = ratio * totalH - canvasH / 2;
      const newScroll = Math.max(0, Math.min(maxScroll, targetScroll));
      this.host.options.onScroll?.(newScroll);
      // Start dragging from the new position so user can fine-tune
      this._dragging = true;
      this._dragStartY = y;
      this._dragStartScroll = newScroll;
    }

    return true;
  }

  /**
   * Handle minimap pointer move. Returns true if dragging.
   */
  handlePointerMove(_x: number, y: number): boolean {
    if (!this._dragging) return false;

    const canvasH = this.host.options.height;
    const totalH = this.host.totalTimelineHeight;
    const maxScroll = totalH - canvasH;

    if (canvasH <= 0) return true;

    const deltaY = y - this._dragStartY;
    const deltaScroll = (deltaY / canvasH) * totalH;
    const newScroll = Math.max(0, Math.min(maxScroll, this._dragStartScroll + deltaScroll));
    this.host.options.onScroll?.(newScroll);

    return true;
  }

  /**
   * Handle minimap pointer up.
   */
  handlePointerUp(): void {
    this._dragging = false;
  }

  /**
   * Full minimap render. Called from TimelineRenderer.render().
   */
  render(): void {
    const { minimapLayer } = this.host;
    // destroyChildren equivalent
    for (const child of minimapLayer.children) {
      child.destroy();
    }
    minimapLayer.removeChildren();
    this._viewport = null; // destroyed above, will be recreated
    this._violationTicks = null; // destroyed above, will be recreated by renderViolationTicks()

    if (!this.host.minimapVisible) return;

    const chart = this.host.chart;
    if (!chart) return;

    const canvasH = this.host.options.height;
    const totalH = this.host.totalTimelineHeight;
    if (totalH <= 0) return;

    const trackX = this.host.options.width - MINIMAP_WIDTH;
    const minimapContentWidth = MINIMAP_WIDTH;
    const scale = canvasH / totalH;

    // (1) Semi-transparent dark background
    const bg = new Graphics();
    bg.rect(trackX, 0, MINIMAP_WIDTH, canvasH);
    bg.fill({ color: 0x000000, alpha: 0.5 });
    minimapLayer.addChild(bg);

    // (2) Lane backgrounds (scaled)
    const noteLaneWidth = minimapContentWidth;
    const laneW = noteLaneWidth / LANE_COUNT;
    for (let i = 0; i < LANE_COUNT; i++) {
      const color = i % 2 === 0 ? COLORS.LANE_BG_EVEN : COLORS.LANE_BG_ODD;
      const laneBg = new Graphics();
      laneBg.rect(trackX + i * laneW, 0, laneW, canvasH);
      laneBg.fill({ color, alpha: 0.4 });
      minimapLayer.addChild(laneBg);
    }

    // Helper: convert container-local Y to minimap Y
    const toMinimapY = (containerY: number): number => containerY * scale;

    // (3) Measure lines
    const bpmMarkers = this.host.cachedBpmMarkers;
    const timeSignatures = this.host.cachedTimeSignatures;
    const meta = chart.meta;
    if (bpmMarkers.length > 0 && timeSignatures.length > 0) {
      const totalTimelineMs = this.host.getTotalTimelineMs();
      let prevMStartMs = Number.NEGATIVE_INFINITY;
      for (let m = 0; ; m++) {
        const mStartBeat = measureStartBeat(m, timeSignatures);
        const mStartMs = beatToMs(mStartBeat, bpmMarkers, meta.offsetMs);
        if (mStartMs > totalTimelineMs) break;
        if (!(mStartMs > prevMStartMs)) break; // 마디 미전진(구조 위반: 분자 0 박자표) 방어 — continue보다 위
        prevMStartMs = mStartMs;

        const containerY = this.host.timeToY(mStartMs);
        const my = toMinimapY(containerY);
        if (my < 0 || my > canvasH) continue;

        const line = new Graphics();
        line.moveTo(trackX, my);
        line.lineTo(trackX + MINIMAP_WIDTH, my);
        line.stroke({ width: 1, color: 0xffffff, alpha: 0.2 });
        minimapLayer.addChild(line);
      }
    }

    // (3.5) Trill zones
    const trillRects = computeMinimapTrillZoneRects(
      chart.trillZones, bpmMarkers, meta.offsetMs,
      (ms) => this.host.timeToY(ms), toMinimapY, trackX, laneW,
    );
    for (const r of trillRects) {
      const zoneGfx = new Graphics();
      zoneGfx.rect(r.x, r.y, r.width, r.height);
      zoneGfx.fill({ color: COLORS.TRILL_ZONE, alpha: COLORS.TRILL_ZONE_ALPHA });
      minimapLayer.addChild(zoneGfx);
    }

    // (3.6) Rest zones (RFD 0019) — trillZone 밴드와 동일 레이어/z-order 취급.
    // 색·alpha는 타임라인 restZone 밴드 상수를 그대로 쓴다(trillZone 미니맵 렌더 관례).
    const restRects = computeMinimapRestZoneRects(
      chart.restZones ?? [], bpmMarkers, meta.offsetMs,
      (ms) => this.host.timeToY(ms), toMinimapY, trackX, laneW,
    );
    for (const r of restRects) {
      const zoneGfx = new Graphics();
      zoneGfx.rect(r.x, r.y, r.width, r.height);
      zoneGfx.fill({ color: COLORS.REST_ZONE, alpha: COLORS.REST_ZONE_ALPHA });
      minimapLayer.addChild(zoneGfx);
    }

    // (4) Notes: 대량 차트에서 노트마다 DisplayObject를 만들지 않도록 시각 스타일별로 묶는다.
    const { notes } = chart;
    const pointBatches = new Map<number, { gfx: Graphics; count: number }>();
    const rangeBatches = new Map<number, { gfx: Graphics; count: number }>();
    const getBatch = (
      batches: Map<number, { gfx: Graphics; count: number }>,
      color: number,
    ): { gfx: Graphics; count: number } => {
      let batch = batches.get(color);
      if (!batch) {
        batch = { gfx: new Graphics(), count: 0 };
        batches.set(color, batch);
      }
      return batch;
    };

    for (const note of notes) {
      // 보조 레인(5+)은 미니맵에 표시하지 않는다 (chart-editor 스펙 · RFD 0018 §6-6)
      if (!isMainLane(note.lane)) continue;
      const timeMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      const containerY = this.host.timeToY(timeMs);
      const my = toMinimapY(containerY);

      const laneIdx = note.lane - 1;
      const noteX = trackX + laneIdx * laneW;

      if ("endBeat" in note) {
        // Range note (long note): draw filled rect from start to end
        const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const endContainerY = this.host.timeToY(endMs);
        const endMy = toMinimapY(endContainerY);

        let noteColor: number;
        switch (note.type) {
          case "long": noteColor = COLORS.SINGLE_LONG; break;
          case "doubleLong": noteColor = COLORS.DOUBLE_LONG; break;
          case "trillLong": noteColor = COLORS.TRILL_LONG; break;
          default: noteColor = COLORS.SINGLE_LONG;
        }

        const topY = Math.min(my, endMy);
        const height = Math.max(1, Math.abs(endMy - my));
        const batch = getBatch(rangeBatches, noteColor);
        batch.gfx.rect(noteX, topY, laneW, height);
        batch.count++;
      } else {
        // Point note: 1px height horizontal line
        let noteColor: number;
        switch (note.type) {
          case "single": noteColor = COLORS.SINGLE_NOTE; break;
          case "double": noteColor = COLORS.DOUBLE_NOTE; break;
          case "trill": noteColor = COLORS.TRILL_NOTE; break;
          default: noteColor = COLORS.SINGLE_NOTE;
        }

        const batch = getBatch(pointBatches, noteColor);
        batch.gfx.rect(noteX, my, laneW, 1);
        batch.count++;
      }
    }

    for (const [color, batch] of rangeBatches) {
      if (batch.count === 0) continue;
      batch.gfx.fill({ color, alpha: 0.5 });
      minimapLayer.addChild(batch.gfx);
    }
    for (const [color, batch] of pointBatches) {
      if (batch.count === 0) continue;
      batch.gfx.fill(color);
      minimapLayer.addChild(batch.gfx);
    }

    // (4.5) Violation ticks — 미니맵 우측 경계 빨간 틱, 종류 무관 단일 채널 (RFD 0017 §7).
    // 전용 Graphics(_violationTicks)로 분리 — setViolations 경로에서 전체 render 없이 갱신.
    this.renderViolationTicks();

    // (5) Viewport indicator (reusable)
    this.updateViewport();
  }

  /**
   * 위반 노트·트릴존·이벤트를 미니맵 우측 경계 좌표로 변환하는 재료를 host에서 재계산한다
   * (render()의 (4.5) 공식과 동일). 뷰포트 클리핑 없이 타임라인 전체를 대상으로 계산해
   * 화면 밖 위반도 조기에 경고한다.
   */
  private computeViolationRects(): MinimapViolationRect[] {
    const chart = this.host.chart;
    if (!chart) return [];
    const canvasH = this.host.options.height;
    const totalH = this.host.totalTimelineHeight;
    if (totalH <= 0) return [];

    const trackX = this.host.options.width - MINIMAP_WIDTH;
    const scale = canvasH / totalH;
    return computeMinimapViolationRects({
      violatingNoteIndices: this.host.violatingNoteIndices,
      violatingTrillZoneIndices: this.host.violatingTrillZoneIndices,
      violatingRestZoneIndices: this.host.violatingRestZoneIndices,
      violatingEventIndices: this.host.violatingEventIndices,
      notes: chart.notes,
      trillZones: chart.trillZones,
      restZones: chart.restZones ?? [],
      events: chart.events,
      bpmMarkers: this.host.cachedBpmMarkers,
      offsetMs: chart.meta.offsetMs,
      timeToY: (ms) => this.host.timeToY(ms),
      toMinimapY: (containerY) => containerY * scale,
      trackX,
      minimapWidth: MINIMAP_WIDTH,
    });
  }

  /**
   * 위반 틱만 경량 갱신한다(전체 render 없이). setViolations에서 매 변경마다 호출되므로
   * 노트 등 다른 자식을 재생성하지 않고 전용 _violationTicks Graphics만 clear·재그린다
   * (뷰포트 인디케이터의 updateViewport 패턴과 동일, RFD 0017 §7 fable 리뷰 MEDIUM).
   *
   * z-order 불변: 뷰포트 인디케이터가 항상 틱 위에 오도록, 그린 뒤 _viewport를 최상위로 재정렬한다
   * (render 경로·setViolations 경로 모두 "뷰포트가 틱 위" 유지).
   */
  renderViolationTicks(): void {
    if (!this.host.minimapVisible) return;

    const rects = this.computeViolationRects();
    if (rects.length === 0) {
      // 위반 없음: 기존 틱이 있으면 비우고, 없으면 자식을 추가하지 않는다(자식 수 예산 유지).
      this._violationTicks?.clear();
      return;
    }

    if (!this._violationTicks) {
      this._violationTicks = new Graphics();
    }
    const g = this._violationTicks;
    // render()의 removeChildren로 떼어졌거나 최초 생성 시 붙인다.
    if (g.parent !== this.host.minimapLayer) {
      this.host.minimapLayer.addChild(g);
    }

    // 자식 수 예산 준수: 틱 전부를 단일 Graphics로 batch.
    g.clear();
    for (const r of rects) {
      g.rect(r.x, r.y, r.width, r.height);
    }
    g.fill({ color: COLORS.VIOLATION_HATCH, alpha: COLORS.MINIMAP_VIOLATION_TICK_ALPHA });

    // 뷰포트를 항상 틱 위로 재정렬(addChild가 기존 자식을 최상위로 이동).
    if (this._viewport && this._viewport.parent === this.host.minimapLayer) {
      this.host.minimapLayer.addChild(this._viewport);
    }
  }

  /**
   * Lightweight viewport indicator update (no full minimap re-render).
   * Called on every scroll to avoid destroying/recreating all minimap content at 60fps.
   */
  updateViewport(): void {
    const canvasH = this.host.options.height;
    const totalH = this.host.totalTimelineHeight;
    const trackX = this.host.options.width - MINIMAP_WIDTH;

    if (!this.host.minimapVisible) return;

    if (!this._viewport) {
      this._viewport = new Graphics();
      this.host.minimapLayer.addChild(this._viewport);
    }

    this._viewport.clear();

    if (totalH > canvasH) {
      const viewportTopY = (this.host.scrollY / totalH) * canvasH;
      const viewportHeight = (canvasH / totalH) * canvasH;

      this._viewport.rect(trackX, viewportTopY, MINIMAP_WIDTH, viewportHeight);
      this._viewport.fill({ color: 0xffffff, alpha: 0.15 });
      this._viewport.stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
    }
  }

  /**
   * Cleanup text styles. Call on dispose.
   */
  dispose(): void {
    this._timeLabelStyle?.destroy();
    this._timeLabelStyle = null;
    this._endTimeLabelStyle?.destroy();
    this._endTimeLabelStyle = null;
    this._viewport = null;
    this._violationTicks = null;
  }
}
