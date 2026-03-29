/**
 * OverlayRenderer — 오버레이/고스트 렌더링 담당
 * TimelineRenderer에서 Composition 패턴으로 사용된다.
 */

import { Container, Graphics } from "pixi.js";
import { beatToMs } from "../../shared";
import type { Chart, Beat, NoteEntity, BpmMarker, ExtraNoteEntity, Lane } from "../../shared";
import {
  LANE_WIDTH,
  NOTE_HEIGHT,
  TIMELINE_WIDTH,
  EXTRA_LANE_WIDTH,
  COLORS,
} from "./constants";
import type { NoteRenderer } from "./NoteRenderer";
import { destroyChildren } from "./utils";

/** OverlayRenderer가 TimelineRenderer에서 필요로 하는 인터페이스 */
export interface OverlayHost {
  readonly chart: Chart | null;
  readonly extraNotes: ExtraNoteEntity[];
  readonly violatingNoteIndices: Set<number>;
  readonly moveOrigins: { note: NoteEntity; beat: Beat; endBeat?: Beat; lane: Lane }[] | null;
  readonly boxSelectRect: { startY: number; startLane: Lane | null; endY: number; endLane: Lane | null; startExtraLane?: number; endExtraLane?: number } | null;
  readonly scrollY: number;
  readonly contentOffsetX: number;
  readonly cachedBpmMarkers: BpmMarker[];
  getVisibleTimeRange(): { minTimeMs: number; maxTimeMs: number };
  timeToY(timeMs: number): number;

  // Layer containers
  readonly ghostLayer: Container;
  readonly hoverLayer: Container;
  readonly violationLayer: Container;
  readonly moveOriginLayer: Container;
  readonly boxSelectLayer: Container;

  // NoteRenderer reference for shared drawing utilities
  readonly noteRenderer: NoteRenderer;
}

export class OverlayRenderer {
  constructor(private host: OverlayHost) {}

  /**
   * 이동 중인 노트의 원본 위치에 반투명 고스트 렌더링
   */
  renderMoveOrigins(): void {
    if (!this.host.moveOrigins || !this.host.chart) return;

    const bpmMarkers = this.host.cachedBpmMarkers;
    const meta = this.host.chart.meta;
    const ORIGIN_ALPHA = 0.3;
    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();

    for (const origin of this.host.moveOrigins) {
      const { note, beat: origBeat, endBeat: origEndBeat, lane } = origin;
      const x = (lane - 1) * LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;

      if (!origEndBeat) {
        const timeMs = beatToMs(origBeat, bpmMarkers, meta.offsetMs);
        if (timeMs < minTimeMs || timeMs > maxTimeMs) continue;
        const y = this.host.timeToY(timeMs);

        let color: number;
        switch (note.type) {
          case "single": color = COLORS.SINGLE_NOTE; break;
          case "double": color = COLORS.DOUBLE_NOTE; break;
          case "trill": color = COLORS.TRILL_NOTE; break;
          default: color = COLORS.SINGLE_NOTE;
        }

        const gfx = new Graphics();
        if (note.type === "trill") {
          const cx = x + LANE_WIDTH / 2;
          gfx.moveTo(cx, y - h / 2);
          gfx.lineTo(cx + w / 2, y);
          gfx.lineTo(cx, y + h / 2);
          gfx.lineTo(cx - w / 2, y);
          gfx.lineTo(cx, y - h / 2);
        } else {
          const rectX = x + (LANE_WIDTH - w) / 2;
          gfx.rect(rectX, y - h / 2, w, h);
        }
        gfx.fill({ color, alpha: ORIGIN_ALPHA });
        this.host.moveOriginLayer.addChild(gfx);
      } else {
        const startMs = beatToMs(origBeat, bpmMarkers, meta.offsetMs);
        const endMs = beatToMs(origEndBeat, bpmMarkers, meta.offsetMs);
        const lo = Math.min(startMs, endMs);
        const hi = Math.max(startMs, endMs);
        if (hi < minTimeMs || lo > maxTimeMs) continue;
        const startY = this.host.timeToY(startMs);
        const endY = this.host.timeToY(endMs);

        let bodyColor: number;
        switch (note.type) {
          case "long": bodyColor = COLORS.SINGLE_LONG; break;
          case "doubleLong": bodyColor = COLORS.DOUBLE_LONG; break;
          case "trillLong": bodyColor = COLORS.TRILL_LONG; break;
          default: bodyColor = COLORS.SINGLE_LONG;
        }

        const topY = Math.min(startY, endY);
        const bottomY = Math.max(startY, endY);
        const bodyTopY = topY + h / 2;
        const bodyBottomY = bottomY - h / 2;
        const bodyHeight = bodyBottomY - bodyTopY;

        if (bodyHeight > 0) {
          const body = new Graphics();
          body.rect(x + (LANE_WIDTH - w) / 2, bodyTopY, w, bodyHeight);
          body.fill({ color: bodyColor, alpha: ORIGIN_ALPHA });
          this.host.moveOriginLayer.addChild(body);
        }

        const end = new Graphics();
        const endX = x + (LANE_WIDTH - w) / 2;
        end.rect(endX, endY - h / 2, w, h);
        end.fill({ color: bodyColor, alpha: ORIGIN_ALPHA * 0.5 });
        this.host.moveOriginLayer.addChild(end);
      }
    }
  }

  /**
   * 박스 선택 사각형 렌더링
   */
  renderBoxSelectRect(): void {
    destroyChildren(this.host.boxSelectLayer);
    if (!this.host.boxSelectRect || !this.host.chart) return;

    const { startY, startLane, endY, endLane, startExtraLane, endExtraLane } = this.host.boxSelectRect;

    const y1 = startY + this.host.scrollY;
    const y2 = endY + this.host.scrollY;
    const topY = Math.min(y1, y2);
    const height = Math.max(y1, y2) - topY;

    let x1 = Infinity;
    let x2 = -Infinity;

    if (startLane !== null || endLane !== null) {
      const effectiveStart = startLane ?? endLane!;
      const effectiveEnd = endLane ?? startLane!;
      const minLane = Math.min(effectiveStart, effectiveEnd);
      const maxLane = Math.max(effectiveStart, effectiveEnd);
      x1 = Math.min(x1, (minLane - 1) * LANE_WIDTH);
      x2 = Math.max(x2, maxLane * LANE_WIDTH);
    }

    if (startExtraLane !== undefined || endExtraLane !== undefined) {
      const effectiveStart = startExtraLane ?? endExtraLane!;
      const effectiveEnd = endExtraLane ?? startExtraLane!;
      const minExtra = Math.min(effectiveStart, effectiveEnd);
      const maxExtra = Math.max(effectiveStart, effectiveEnd);
      const extraStartX = TIMELINE_WIDTH;
      x1 = Math.min(x1, extraStartX + (minExtra - 1) * EXTRA_LANE_WIDTH);
      x2 = Math.max(x2, extraStartX + maxExtra * EXTRA_LANE_WIDTH);
    }

    if (x1 >= x2) return;

    const gfx = new Graphics();
    gfx.rect(x1, topY, x2 - x1, height);
    gfx.fill({ color: COLORS.BOX_SELECT_FILL, alpha: COLORS.BOX_SELECT_FILL_ALPHA });
    gfx.stroke({ width: COLORS.BOX_SELECT_STROKE_WIDTH, color: COLORS.BOX_SELECT_STROKE, alpha: COLORS.BOX_SELECT_STROKE_ALPHA });
    this.host.boxSelectLayer.addChild(gfx);
  }

  /**
   * 일반 레인에 고스트 노트 표시
   */
  showGhostNote(lane: Lane, timeMs: number): void {
    destroyChildren(this.host.ghostLayer);

    const y = this.host.timeToY(timeMs);
    const x = (lane - 1) * LANE_WIDTH;
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;
    const rectX = x + (LANE_WIDTH - w) / 2;
    const rectY = y - h / 2;

    const ghost = new Graphics();
    ghost.rect(rectX, rectY, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    this.host.ghostLayer.addChild(ghost);
  }

  /**
   * 엑스트라 레인에 고스트 마커 표시 (이벤트용)
   */
  showGhostMarker(extraLane: number, timeMs: number): void {
    destroyChildren(this.host.ghostLayer);

    const y = this.host.timeToY(timeMs);
    // extraLane is 1-based, convert to 0-based column
    const col = Math.max(0, extraLane - 1);
    const x = TIMELINE_WIDTH + col * EXTRA_LANE_WIDTH;

    const ghost = new Graphics();
    ghost.rect(x, y - NOTE_HEIGHT / 2, EXTRA_LANE_WIDTH, NOTE_HEIGHT);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    this.host.ghostLayer.addChild(ghost);
  }

  /**
   * 일반 레인에 고스트 범위 노트 표시
   */
  showGhostRange(lane: Lane, startTimeMs: number, endTimeMs: number): void {
    destroyChildren(this.host.ghostLayer);

    const startY = this.host.timeToY(startTimeMs);
    const endY = this.host.timeToY(endTimeMs);
    const x = (lane - 1) * LANE_WIDTH;
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;
    const rectX = x + (LANE_WIDTH - w) / 2;

    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);

    const ghost = new Graphics();
    ghost.rect(rectX, startY - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    ghost.rect(rectX, endY - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    const bodyTop = topY + h / 2;
    const bodyBottom = bottomY - h / 2;
    if (bodyBottom > bodyTop) {
      ghost.rect(rectX, bodyTop, w, bodyBottom - bodyTop);
      ghost.fill({ color: 0xffffff, alpha: 0.15 });
    }
    this.host.ghostLayer.addChild(ghost);
  }

  /**
   * 엑스트라 레인에 고스트 노트 표시
   */
  showGhostExtraNote(extraLane: number, timeMs: number): void {
    destroyChildren(this.host.ghostLayer);
    const x = TIMELINE_WIDTH + (extraLane - 1) * EXTRA_LANE_WIDTH;
    const y = this.host.timeToY(timeMs);
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;
    const rectX = x + (EXTRA_LANE_WIDTH - w) / 2;

    const ghost = new Graphics();
    ghost.rect(rectX, y - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    this.host.ghostLayer.addChild(ghost);
  }

  /**
   * 엑스트라 레인에 고스트 범위 노트 표시
   */
  showGhostExtraRange(extraLane: number, startTimeMs: number, endTimeMs: number): void {
    destroyChildren(this.host.ghostLayer);
    const x = TIMELINE_WIDTH + (extraLane - 1) * EXTRA_LANE_WIDTH;
    const startY = this.host.timeToY(startTimeMs);
    const endY = this.host.timeToY(endTimeMs);
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;
    const rectX = x + (EXTRA_LANE_WIDTH - w) / 2;
    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);

    const ghost = new Graphics();
    ghost.rect(rectX, startY - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    ghost.rect(rectX, endY - h / 2, w, h);
    ghost.fill({ color: 0xffffff, alpha: 0.3 });
    const bodyTop = topY + h / 2;
    const bodyBottom = bottomY - h / 2;
    if (bodyBottom > bodyTop) {
      ghost.rect(rectX, bodyTop, w, bodyBottom - bodyTop);
      ghost.fill({ color: 0xffffff, alpha: 0.15 });
    }
    this.host.ghostLayer.addChild(ghost);
  }

  /**
   * 고스트 노트/마커 숨기기
   */
  hideGhostNote(): void {
    destroyChildren(this.host.ghostLayer);
  }

  /**
   * 호버 오버레이 업데이트 (경량, 풀 리렌더 없음)
   */
  updateHoverOverlay(hoveredNoteIndex: number | null, hoveredExtraNoteIndex: number | null): void {
    destroyChildren(this.host.hoverLayer);
    if (!this.host.chart) return;

    this.host.hoverLayer.x = this.host.contentOffsetX;
    this.host.hoverLayer.y = -this.host.scrollY;

    const bpmMarkers = this.host.cachedBpmMarkers;
    const meta = this.host.chart.meta;

    if (hoveredNoteIndex !== null && hoveredNoteIndex < this.host.chart.notes.length) {
      const note = this.host.chart.notes[hoveredNoteIndex];
      const x = (note.lane - 1) * LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      const startY = this.host.timeToY(startMs);

      if ("endBeat" in note) {
        const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const endY = this.host.timeToY(endMs);
        const topY = Math.min(startY, endY);
        const bottomY = Math.max(startY, endY);
        this.host.noteRenderer.drawRangeNoteOutline(topY, bottomY, x, LANE_WIDTH, w, h, COLORS.HOVERED_OUTLINE, 1.5, this.host.hoverLayer);
      } else {
        const gfx = new Graphics();
        if (note.type === "trill") {
          const cx = x + LANE_WIDTH / 2;
          gfx.moveTo(cx, startY - h / 2);
          gfx.lineTo(cx + w / 2, startY);
          gfx.lineTo(cx, startY + h / 2);
          gfx.lineTo(cx - w / 2, startY);
          gfx.lineTo(cx, startY - h / 2);
        } else {
          gfx.rect(x + (LANE_WIDTH - w) / 2, startY - h / 2, w, h);
        }
        gfx.stroke({ width: 1.5, color: COLORS.HOVERED_OUTLINE, alignment: 0 });
        this.host.hoverLayer.addChild(gfx);
      }
    }

    if (hoveredExtraNoteIndex !== null && hoveredExtraNoteIndex < this.host.extraNotes.length) {
      const note = this.host.extraNotes[hoveredExtraNoteIndex];
      const x = TIMELINE_WIDTH + (note.extraLane - 1) * EXTRA_LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      const startY = this.host.timeToY(startMs);

      if ("endBeat" in note) {
        const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const endY = this.host.timeToY(endMs);
        const topY = Math.min(startY, endY);
        const bottomY = Math.max(startY, endY);
        this.host.noteRenderer.drawRangeNoteOutline(topY, bottomY, x, EXTRA_LANE_WIDTH, w, h, COLORS.HOVERED_OUTLINE, 1.5, this.host.hoverLayer);
      } else {
        const gfx = new Graphics();
        gfx.rect(x + (EXTRA_LANE_WIDTH - w) / 2, startY - h / 2, w, h);
        gfx.stroke({ width: 1.5, color: COLORS.HOVERED_OUTLINE, alignment: 0 });
        this.host.hoverLayer.addChild(gfx);
      }
    }
  }

  /**
   * 위반 노트 오버레이 렌더링 (빨간 해칭)
   */
  renderViolationOverlay(): void {
    destroyChildren(this.host.violationLayer);
    if (!this.host.chart || this.host.violatingNoteIndices.size === 0) return;

    const bpmMarkers = this.host.cachedBpmMarkers;
    const meta = this.host.chart.meta;
    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();

    for (const idx of this.host.violatingNoteIndices) {
      if (idx >= this.host.chart.notes.length) continue;
      const note = this.host.chart.notes[idx];
      const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);

      const x = (note.lane - 1) * LANE_WIDTH;
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const rectX = x + (LANE_WIDTH - w) / 2;

      let topY: number;
      let height: number;

      if ("endBeat" in note) {
        const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const lo = Math.min(startMs, endMs);
        const hi = Math.max(startMs, endMs);
        if (hi < minTimeMs || lo > maxTimeMs) continue;
        const startY = this.host.timeToY(startMs);
        const endY = this.host.timeToY(endMs);
        topY = Math.min(startY, endY) - h / 2;
        height = Math.abs(endY - startY) + h;
      } else {
        if (startMs < minTimeMs || startMs > maxTimeMs) continue;
        const y = this.host.timeToY(startMs);
        topY = y - h / 2;
        height = h;
      }

      const gfx = new Graphics();

      gfx.rect(rectX, topY, w, height);
      gfx.fill({ color: COLORS.VIOLATION_HATCH, alpha: COLORS.VIOLATION_HATCH_ALPHA * 0.5 });

      const spacing = Math.max(4, Math.min(8, height * 0.6));
      gfx.setStrokeStyle({ width: 1, color: COLORS.VIOLATION_HATCH, alpha: COLORS.VIOLATION_HATCH_ALPHA });
      for (let d = -height; d < w; d += spacing) {
        const x1 = Math.max(0, d);
        const y1 = Math.max(0, -d);
        const x2 = Math.min(w, d + height);
        const y2 = Math.min(height, w - d);
        if (x1 < w && x2 > 0 && y1 < height && y2 > 0) {
          gfx.moveTo(rectX + x1, topY + y1);
          gfx.lineTo(rectX + x2, topY + y2);
        }
      }
      gfx.stroke();

      this.host.violationLayer.addChild(gfx);
    }
  }

}
