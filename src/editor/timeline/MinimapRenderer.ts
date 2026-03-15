/**
 * MinimapRenderer — TimelineRenderer의 미니맵 관련 로직을 담당하는 클래스.
 * Composition 패턴으로 TimelineRenderer에 포함된다.
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { beatToMs, measureStartBeat } from "../../shared";
import {
  LANE_COUNT,
  COLORS,
  MINIMAP_WIDTH,
} from "./constants";
import { computeMinimapTrillZoneRects } from "./minimapTrillZone";
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
}

export class MinimapRenderer {
  // Drag state
  private _dragging: boolean = false;
  private _dragStartY: number = 0;
  private _dragStartScroll: number = 0;

  // Reusable viewport indicator Graphics (avoids 60fps destroy/create on scroll)
  private _viewport: Graphics | null = null;

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
    return x >= this.host.options.width - MINIMAP_WIDTH;
  }

  /**
   * Handle minimap pointer down. Returns true if the event was consumed.
   */
  handlePointerDown(x: number, y: number): boolean {
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
      for (let m = 0; ; m++) {
        const mStartBeat = measureStartBeat(m, timeSignatures);
        const mStartMs = beatToMs(mStartBeat, bpmMarkers, meta.offsetMs);
        if (mStartMs > totalTimelineMs) break;

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

    // (4) Notes
    const { notes } = chart;
    for (const note of notes) {
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
        const longGfx = new Graphics();
        longGfx.rect(noteX, topY, laneW, height);
        longGfx.fill({ color: noteColor, alpha: 0.5 });
        minimapLayer.addChild(longGfx);
      } else {
        // Point note: 1px height horizontal line
        let noteColor: number;
        switch (note.type) {
          case "single": noteColor = COLORS.SINGLE_NOTE; break;
          case "double": noteColor = COLORS.DOUBLE_NOTE; break;
          case "trill": noteColor = COLORS.TRILL_NOTE; break;
          default: noteColor = COLORS.SINGLE_NOTE;
        }

        const noteGfx = new Graphics();
        noteGfx.rect(noteX, my, laneW, 1);
        noteGfx.fill(noteColor);
        minimapLayer.addChild(noteGfx);
      }
    }

    // (5) Time labels
    if (this.host.waveformDurationMs > 0) {
      const intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300];
      const minSpacingPx = 30;
      let intervalSec = intervals[intervals.length - 1];
      for (const iv of intervals) {
        if (iv * this.host.zoom * scale >= minSpacingPx) {
          intervalSec = iv;
          break;
        }
      }

      const durationSec = this.host.waveformDurationMs / 1000;
      const fmtTime = (s: number) => {
        const m = Math.floor(s / 60);
        const ss = Math.floor(s % 60);
        return `${m}:${String(ss).padStart(2, "0")}`;
      };

      if (!this._timeLabelStyle) {
        this._timeLabelStyle = new TextStyle({
          fontSize: 9,
          fill: 0x66aaff,
          fontFamily: "monospace",
        });
      }
      const timeLabelStyle = this._timeLabelStyle;

      for (let t = intervalSec; t <= durationSec; t += intervalSec) {
        const containerY = this.host.timeToY(t * 1000);
        const my = toMinimapY(containerY);
        if (my < 8 || my > canvasH - 4) continue;

        const label = new Text({ text: fmtTime(t), style: timeLabelStyle });
        label.x = trackX + 2;
        label.y = my;
        minimapLayer.addChild(label);
      }

      // End-of-audio time label
      const endContainerY = this.host.timeToY(this.host.waveformDurationMs);
      const endMy = toMinimapY(endContainerY);
      if (endMy >= 8 && endMy <= canvasH - 4) {
        if (!this._endTimeLabelStyle) {
          this._endTimeLabelStyle = new TextStyle({ fontSize: 9, fill: 0xff6644, fontFamily: "monospace" });
        }
        const endLabel = new Text({
          text: fmtTime(durationSec),
          style: this._endTimeLabelStyle,
        });
        endLabel.x = trackX + 2;
        endLabel.y = endMy;
        minimapLayer.addChild(endLabel);
      }
    }

    // (6) Viewport indicator (reusable)
    this.updateViewport();
  }

  /**
   * Lightweight viewport indicator update (no full minimap re-render).
   * Called on every scroll to avoid destroying/recreating all minimap content at 60fps.
   */
  updateViewport(): void {
    const canvasH = this.host.options.height;
    const totalH = this.host.totalTimelineHeight;
    const trackX = this.host.options.width - MINIMAP_WIDTH;

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
  }
}
