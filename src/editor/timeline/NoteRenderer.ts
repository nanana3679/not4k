/**
 * NoteRenderer — 에디터용 노트 렌더링 담당
 * TimelineRenderer에서 Composition 패턴으로 사용된다.
 */

import { Container, Graphics, FillGradient } from "pixi.js";
import { beatToMs, beatEq, isGraceNote } from "../../shared";
import type { Chart, Beat, NoteEntity, PointNote, RangeNote, BpmMarker, ExtraNoteEntity } from "../../shared";
import {
  LANE_WIDTH,
  NOTE_HEIGHT,
  TIMELINE_WIDTH,
  EXTRA_LANE_WIDTH,
  COLORS,
  NOTE_Z_ORDER,
} from "./constants";

/** NoteRenderer가 TimelineRenderer에서 필요로 하는 인터페이스 */
export interface NoteHost {
  readonly chart: Chart | null;
  readonly extraNotes: ExtraNoteEntity[];
  readonly selectedNotes: Set<number>;
  readonly selectedExtraNotes: Set<number>;
  readonly cachedBpmMarkers: BpmMarker[];
  readonly bodyGradientCache: Map<number, FillGradient>;
  getVisibleTimeRange(): { minTimeMs: number; maxTimeMs: number };
  timeToY(timeMs: number): number;

  // Layer containers
  readonly longNoteBodyLayer: Container;
  readonly longNoteEndLayer: Container;
  readonly longNoteHeadLayer: Container;
  readonly noteLayer: Container;
  readonly selectedLongBodyLayer: Container;
  readonly selectedLongEndLayer: Container;
  readonly selectedLongHeadLayer: Container;
  readonly selectedNoteLayer: Container;
}

export class NoteRenderer {
  constructor(private host: NoteHost) {}

  /**
   * 그래디언트 캐시 조회/생성
   */
  getBodyGradient(color: number): FillGradient {
    let gradient = this.host.bodyGradientCache.get(color);
    if (!gradient) {
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
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
      this.host.bodyGradientCache.set(color, gradient);
    }
    return gradient;
  }

  /**
   * RangeNote의 같은 beat/lane에 매칭되는 헤드 PointNote가 있는지 확인
   */
  hasMatchingHead(note: RangeNote): boolean {
    const chart = this.host.chart;
    if (!chart) return false;
    for (const n of chart.notes) {
      if ("endBeat" in n) continue;
      if (n.lane === note.lane && beatEq(n.beat, note.beat)) return true;
    }
    return false;
  }

  /**
   * 롱노트 전체 범위를 하나의 rect 윤곽선으로 그린다.
   */
  drawRangeNoteOutline(
    topY: number, bottomY: number, x: number, laneWidth: number,
    w: number, h: number, color: number, lineWidth: number, layer: Container,
  ): void {
    const gfx = new Graphics();
    gfx.rect(x + (laneWidth - w) / 2, topY - h / 2, w, bottomY - topY + h);
    gfx.stroke({ width: lineWidth, color, alignment: 0 });
    layer.addChild(gfx);
  }

  /**
   * 포인트 노트 렌더링
   */
  renderPointNote(note: PointNote, isSelected: boolean): void {
    const chart = this.host.chart;
    if (!chart) return;

    const bpmMarkers = this.host.cachedBpmMarkers;
    const meta = chart.meta;
    const timeMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
    const y = this.host.timeToY(timeMs);
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

    const isGrace = isGraceNote(note);
    if (isGrace) {
      const glow = new Graphics();
      const w = NOTE_HEIGHT * 5 + COLORS.GRACE_GLOW_PAD * 2;
      const h = NOTE_HEIGHT + COLORS.GRACE_GLOW_PAD * 2;
      const glowX = x + (LANE_WIDTH - w) / 2;
      glow.roundRect(glowX, y - h / 2, w, h, 4);
      glow.fill({ color: COLORS.GRACE_GLOW, alpha: COLORS.GRACE_GLOW_ALPHA });
      this.host.noteLayer.addChild(glow);
    }

    const noteGfx = new Graphics();

    if (shape === "diamond") {
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
      const w = NOTE_HEIGHT * 5;
      const h = NOTE_HEIGHT;
      const rectX = x + (LANE_WIDTH - w) / 2;
      const rectY = y - h / 2;

      noteGfx.rect(rectX, rectY, w, h);
      noteGfx.fill(color);
    }

    if (isSelected) {
      noteGfx.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.host.selectedNoteLayer.addChild(noteGfx);
    } else {
      this.host.noteLayer.addChild(noteGfx);
    }
  }

  /**
   * 범위 노트 렌더링
   */
  renderRangeNote(note: RangeNote, isSelected: boolean): void {
    const chart = this.host.chart;
    if (!chart) return;

    const bpmMarkers = this.host.cachedBpmMarkers;
    const meta = chart.meta;
    const startMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
    const endMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
    const startY = this.host.timeToY(startMs);
    const endY = this.host.timeToY(endMs);

    const x = (note.lane - 1) * LANE_WIDTH;
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;

    let bodyColor: number;

    switch (note.type) {
      case "long":
        bodyColor = COLORS.SINGLE_LONG;
        break;
      case "doubleLong":
        bodyColor = COLORS.DOUBLE_LONG;
        break;
      case "trillLong":
        bodyColor = COLORS.TRILL_LONG;
        break;
    }

    const topY = Math.min(startY, endY);
    const bottomY = Math.max(startY, endY);
    const hasHead = this.hasMatchingHead(note);
    const bodyTopY = topY + h / 2;
    const bodyBottomY = hasHead ? (bottomY - h / 2) : bottomY;
    const bodyHeight = bodyBottomY - bodyTopY;

    if (bodyHeight > 0) {
      const body = new Graphics();
      const bodyX = x + (LANE_WIDTH - w) / 2;
      const bodyGradient = this.getBodyGradient(bodyColor);
      if (note.type === "trillLong") {
        const extTop = h / 2;
        const extBottom = hasHead ? h / 2 : 0;
        body.rect(bodyX, bodyTopY - extTop, w, bodyHeight + extTop + extBottom);
      } else {
        body.rect(bodyX, bodyTopY, w, bodyHeight);
      }
      body.fill(bodyGradient);

      if (isSelected) {
        this.host.selectedLongBodyLayer.addChild(body);
      } else {
        this.host.longNoteBodyLayer.addChild(body);
      }
    }

    const headGradient = this.getBodyGradient(bodyColor);
    const end = new Graphics();
    if (note.type === "trillLong") {
      const cx = x + LANE_WIDTH / 2;
      end.moveTo(cx, endY - h / 2);
      end.lineTo(cx + w / 2, endY);
      end.lineTo(cx, endY + h / 2);
      end.lineTo(cx - w / 2, endY);
      end.lineTo(cx, endY - h / 2);
      end.fill(0x888888);
    } else {
      const endX = x + (LANE_WIDTH - w) / 2;
      const endNoteY = endY - h / 2;
      end.rect(endX, endNoteY, w, h);
      end.fill({ fill: headGradient, alpha: 0.5 });
    }

    if (isSelected) {
      this.host.selectedLongEndLayer.addChild(end);
    } else {
      this.host.longNoteEndLayer.addChild(end);
    }

    if (!hasHead) {
      const startCap = new Graphics();
      if (note.type === "trillLong") {
        const cx = x + LANE_WIDTH / 2;
        startCap.moveTo(cx, startY - h / 2);
        startCap.lineTo(cx + w / 2, startY);
        startCap.lineTo(cx, startY + h / 2);
        startCap.lineTo(cx - w / 2, startY);
        startCap.lineTo(cx, startY - h / 2);
        startCap.fill(headGradient);
      } else {
        const capX = x + (LANE_WIDTH - w) / 2;
        startCap.rect(capX, startY - h / 2, w, h);
        startCap.fill(headGradient);
      }
      if (isSelected) {
        this.host.selectedLongHeadLayer.addChild(startCap);
      } else {
        this.host.longNoteHeadLayer.addChild(startCap);
      }
    }

    if (isSelected) {
      this.drawRangeNoteOutline(topY, bottomY, x, LANE_WIDTH, w, h, COLORS.SELECTED_OUTLINE, 2, this.host.selectedLongBodyLayer);
    }
  }

  /**
   * 특정 X 위치에 포인트 노트 렌더링 (일반 노트와 엑스트라 노트 공용)
   */
  renderPointNoteAt(
    x: number, laneWidth: number, noteBeat: Beat, noteType: string,
    isSelected: boolean, bpmMarkers: BpmMarker[], meta: { offsetMs: number },
  ): void {
    const timeMs = beatToMs(noteBeat, bpmMarkers, meta.offsetMs);
    const y = this.host.timeToY(timeMs);
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;

    let color: number;
    let shape: "rect" | "diamond" = "rect";
    switch (noteType) {
      case "single": color = COLORS.SINGLE_NOTE; break;
      case "double": color = COLORS.DOUBLE_NOTE; break;
      case "trill": color = COLORS.TRILL_NOTE; shape = "diamond"; break;
      default: color = COLORS.SINGLE_NOTE;
    }

    const noteGfx = new Graphics();
    if (shape === "diamond") {
      const cx = x + laneWidth / 2;
      noteGfx.moveTo(cx, y - h / 2);
      noteGfx.lineTo(cx + w / 2, y);
      noteGfx.lineTo(cx, y + h / 2);
      noteGfx.lineTo(cx - w / 2, y);
      noteGfx.lineTo(cx, y - h / 2);
      noteGfx.fill(color);
    } else {
      const rectX = x + (laneWidth - w) / 2;
      noteGfx.rect(rectX, y - h / 2, w, h);
      noteGfx.fill(color);
    }

    if (isSelected) {
      noteGfx.stroke({ width: 2, color: COLORS.SELECTED_OUTLINE, alignment: 0 });
      this.host.selectedNoteLayer.addChild(noteGfx);
    } else {
      this.host.noteLayer.addChild(noteGfx);
    }
  }

  /**
   * 특정 X 위치에 범위 노트 렌더링 (일반 노트와 엑스트라 노트 공용)
   */
  renderRangeNoteAt(
    x: number, laneWidth: number, startBeat: Beat, endBeat: Beat, noteType: string,
    isSelected: boolean, bpmMarkers: BpmMarker[], meta: { offsetMs: number },
  ): void {
    const startMs = beatToMs(startBeat, bpmMarkers, meta.offsetMs);
    const endMs = beatToMs(endBeat, bpmMarkers, meta.offsetMs);
    const startY = this.host.timeToY(startMs);
    const endY = this.host.timeToY(endMs);
    const w = NOTE_HEIGHT * 5;
    const h = NOTE_HEIGHT;

    let bodyColor: number;
    switch (noteType) {
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

    const bodyGradient = this.getBodyGradient(bodyColor);
    const bodyX = x + (laneWidth - w) / 2;
    const cx = x + laneWidth / 2;

    if (bodyHeight > 0) {
      const body = new Graphics();
      if (noteType === "trillLong") {
        body.rect(bodyX, bodyTopY - h / 2, w, bodyHeight + h);
      } else {
        body.rect(bodyX, bodyTopY, w, bodyHeight);
      }
      body.fill(bodyGradient);

      if (isSelected) {
        this.host.selectedLongBodyLayer.addChild(body);
      } else {
        this.host.longNoteBodyLayer.addChild(body);
      }
    }

    const end = new Graphics();
    if (noteType === "trillLong") {
      end.moveTo(cx, endY - h / 2);
      end.lineTo(cx + w / 2, endY);
      end.lineTo(cx, endY + h / 2);
      end.lineTo(cx - w / 2, endY);
      end.lineTo(cx, endY - h / 2);
      end.fill(0x888888);
    } else {
      end.rect(bodyX, endY - h / 2, w, h);
      end.fill({ fill: bodyGradient, alpha: 0.5 });
    }
    if (isSelected) {
      this.host.selectedLongEndLayer.addChild(end);
    } else {
      this.host.longNoteEndLayer.addChild(end);
    }

    const head = new Graphics();
    if (noteType === "trillLong") {
      head.moveTo(cx, startY - h / 2);
      head.lineTo(cx + w / 2, startY);
      head.lineTo(cx, startY + h / 2);
      head.lineTo(cx - w / 2, startY);
      head.lineTo(cx, startY - h / 2);
      head.fill(bodyGradient);
    } else {
      head.rect(bodyX, startY - h / 2, w, h);
      head.fill(bodyGradient);
    }
    if (isSelected) {
      this.host.selectedLongHeadLayer.addChild(head);
    } else {
      this.host.longNoteHeadLayer.addChild(head);
    }

    if (isSelected) {
      this.drawRangeNoteOutline(topY, bottomY, x, laneWidth, w, h, COLORS.SELECTED_OUTLINE, 2, this.host.selectedLongBodyLayer);
    }
  }

  /**
   * 전체 노트 렌더링 오케스트레이션
   */
  renderNotes(): void {
    const chart = this.host.chart;
    if (!chart) return;

    const { notes } = chart;
    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();
    const bpmMarkers = this.host.cachedBpmMarkers;
    const meta = chart.meta;

    const sortedIndices = notes.map((_, i) => i).sort((a, b) =>
      (NOTE_Z_ORDER[notes[a].type] ?? 0) - (NOTE_Z_ORDER[notes[b].type] ?? 0)
    );

    for (const index of sortedIndices) {
      const note = notes[index];
      const noteStartMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      if (this.isPointNote(note)) {
        if (noteStartMs < minTimeMs || noteStartMs > maxTimeMs) continue;
      } else {
        const noteEndMs = beatToMs((note as RangeNote).endBeat, bpmMarkers, meta.offsetMs);
        const lo = Math.min(noteStartMs, noteEndMs);
        const hi = Math.max(noteStartMs, noteEndMs);
        if (hi < minTimeMs || lo > maxTimeMs) continue;
      }

      const isSelected = this.host.selectedNotes.has(index);

      if (this.isPointNote(note)) {
        this.renderPointNote(note, isSelected);
      } else {
        this.renderRangeNote(note as RangeNote, isSelected);
      }
    }

    this.renderExtraNotes();
  }

  /**
   * 엑스트라 레인 노트 렌더링
   */
  renderExtraNotes(): void {
    const chart = this.host.chart;
    if (!chart || this.host.extraNotes.length === 0) return;

    const bpmMarkers = this.host.cachedBpmMarkers;
    const meta = chart.meta;
    const extraStartX = TIMELINE_WIDTH;
    const { minTimeMs, maxTimeMs } = this.host.getVisibleTimeRange();

    this.host.extraNotes.forEach((note, index) => {
      const noteStartMs = beatToMs(note.beat, bpmMarkers, meta.offsetMs);
      if ("endBeat" in note) {
        const noteEndMs = beatToMs(note.endBeat, bpmMarkers, meta.offsetMs);
        const lo = Math.min(noteStartMs, noteEndMs);
        const hi = Math.max(noteStartMs, noteEndMs);
        if (hi < minTimeMs || lo > maxTimeMs) return;
      } else {
        if (noteStartMs < minTimeMs || noteStartMs > maxTimeMs) return;
      }

      const isSelected = this.host.selectedExtraNotes.has(index);
      const x = extraStartX + (note.extraLane - 1) * EXTRA_LANE_WIDTH;

      if ("endBeat" in note) {
        this.renderRangeNoteAt(x, EXTRA_LANE_WIDTH, note.beat, note.endBeat, note.type, isSelected, bpmMarkers, meta);
      } else {
        this.renderPointNoteAt(x, EXTRA_LANE_WIDTH, note.beat, note.type, isSelected, bpmMarkers, meta);
      }
    });
  }

  /**
   * Type guard for PointNote
   */
  isPointNote(note: NoteEntity): note is PointNote {
    return "type" in note && !("endBeat" in note);
  }
}
