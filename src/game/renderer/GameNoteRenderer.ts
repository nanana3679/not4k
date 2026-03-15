/**
 * GameNoteRenderer — 게임 플레이 중 노트 렌더링을 담당한다.
 *
 * 포인트 노트, 롱노트(body / head / end)를 렌더링하며
 * 오브젝트 풀로 Sprite·Graphics를 재사용한다.
 * GameRenderer가 소유하고 renderFrame() 내에서 renderNote()를 호출한다.
 */

import {
  Container,
  Graphics,
  Sprite,
  NineSliceSprite,
  FillGradient,
} from "pixi.js";
import type { FillInput } from "pixi.js";
import type { NoteEntity } from "../../shared";
import { isGraceNote } from "../../shared";
import type { SkinManager } from "../skin";
import {
  LANE_WIDTH,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  COLORS,
} from "./constants";

export class GameNoteRenderer {
  private longNoteBodyLayer: Container;
  private longNoteEndLayer: Container;
  private longNoteHeadLayer: Container;
  private noteLayer: Container;

  private skinManager: SkinManager;
  private judgmentLineY: number;
  private scrollSpeed: number;
  private laneAreaX: number;
  private height: number;

  // Object pools — Sprite-based (single/double/long/doubleLong)
  private noteSpritePool: Map<number, Sprite> = new Map();
  private bodySpritePool: Map<number, NineSliceSprite> = new Map();
  private terminalSpritePool: Map<number, Sprite> = new Map();

  // Object pools — Graphics fallback (trill/trillLong)
  private noteGraphicsPool: Map<number, Graphics> = new Map();
  private bodyGraphicsPool: Map<number, Graphics> = new Map();
  private graceGlowPool: Map<number, Graphics> = new Map();

  // Gradient cache (trill fallback only)
  private bodyGradientCache = new Map<number, FillGradient>();

  // Note state sets
  private failedBodies: Set<number> = new Set();
  private completedNotes: Set<number> = new Set();
  private doublePartialNotes: Set<number> = new Set();

  constructor(
    longNoteBodyLayer: Container,
    longNoteEndLayer: Container,
    longNoteHeadLayer: Container,
    noteLayer: Container,
    skinManager: SkinManager,
    judgmentLineY: number,
    scrollSpeed: number,
    laneAreaX: number,
    height: number,
  ) {
    this.longNoteBodyLayer = longNoteBodyLayer;
    this.longNoteEndLayer = longNoteEndLayer;
    this.longNoteHeadLayer = longNoteHeadLayer;
    this.noteLayer = noteLayer;
    this.skinManager = skinManager;
    this.judgmentLineY = judgmentLineY;
    this.scrollSpeed = scrollSpeed;
    this.laneAreaX = laneAreaX;
    this.height = height;
  }

  // ── 렌더링 ───────────────────────────────────────────────

  renderPointNote(
    entity: NoteEntity,
    index: number,
    timeMs: number,
    songTimeMs: number,
  ): void {
    if (this.completedNotes.has(index)) return;

    const y = this.calculateNoteY(timeMs, songTimeMs);
    if (y < -NOTE_HEIGHT) return;

    const laneX = this.getLaneX(entity.lane);
    const isPartial = this.doublePartialNotes.has(index);
    const isGrace = isGraceNote(entity);

    // Grace glow effect
    if (isGrace) {
      const glow = this.getOrCreateGraceGlow(index);
      glow.x = laneX - COLORS.GRACE_GLOW_PAD;
      glow.y = y - COLORS.GRACE_GLOW_PAD;
      this.noteLayer.addChild(glow);
    }

    if (entity.type === "trill") {
      const graphic = this.getOrCreateNoteGraphic(index);
      graphic.x = laneX;
      graphic.y = y;
      this.drawNoteShape(graphic, entity.type, isPartial ? { alpha: 0.5 } : undefined);
      this.noteLayer.addChild(graphic);
    } else {
      const texKey = entity.type === "double" ? "noteDouble" : "noteSingle";
      const sprite = this.getOrCreateNoteSprite(index, texKey);
      sprite.x = laneX;
      sprite.y = y;
      sprite.alpha = isPartial ? 0.5 : 1;
      this.noteLayer.addChild(sprite);
    }
  }

  renderLongNote(
    entity: NoteEntity & { endBeat: unknown },
    index: number,
    startMs: number,
    endMs: number,
    songTimeMs: number,
  ): void {
    if (this.completedNotes.has(index)) return;

    const rawStartY = this.calculateNoteY(startMs, songTimeMs);
    const endY = this.calculateNoteY(endMs, songTimeMs);

    // 바디 시작 Y를 항상 판정선으로 클램프
    const startY = Math.min(rawStartY, this.judgmentLineY);

    const laneX = this.getLaneX(entity.lane);
    let bodyHeight = startY - endY;

    if (bodyHeight < 0) return;

    let adjustedEndY = endY;
    if (bodyHeight < NOTE_HEIGHT) {
      bodyHeight = NOTE_HEIGHT;
      adjustedEndY = startY - NOTE_HEIGHT;
    }

    if (adjustedEndY < -NOTE_HEIGHT && startY < -NOTE_HEIGHT) return;

    const isFailed = this.failedBodies.has(index);
    const isPartial = this.doublePartialNotes.has(index);

    if (entity.type === "trillLong") {
      // Trill long: Graphics fallback
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

      if (adjustedEndY >= -NOTE_HEIGHT && adjustedEndY <= this.height + NOTE_HEIGHT) {
        const endGraphic = new Graphics();
        endGraphic.x = laneX;
        endGraphic.y = adjustedEndY;
        this.drawNoteShape(endGraphic, entity.type, { color: 0x888888 });
        this.longNoteEndLayer.addChild(endGraphic);
      }

      const headY = rawStartY;
      if (headY >= -NOTE_HEIGHT && headY <= this.height + NOTE_HEIGHT) {
        const headGraphic = new Graphics();
        headGraphic.x = laneX;
        headGraphic.y = headY;
        this.drawNoteShape(headGraphic, entity.type, isPartial ? { alpha: 0.5 } : undefined);
        this.longNoteHeadLayer.addChild(headGraphic);
      }
    } else {
      // long / doubleLong: Sprite-based
      const isDouble = entity.type === "doubleLong";
      const bodyTexKey = isDouble ? "bodyDouble" : "bodySingle";
      const termTexKey = isDouble ? "terminalDouble" : "terminalSingle";

      const bodySprite = this.getOrCreateBodySprite(index, bodyTexKey);
      bodySprite.x = laneX;
      bodySprite.y = adjustedEndY;
      bodySprite.width = LANE_WIDTH;
      bodySprite.height = bodyHeight;
      bodySprite.tint = isFailed ? COLORS.LONG_BODY_FAILED : 0xffffff;
      bodySprite.alpha = isPartial ? 0.5 : 1;
      this.longNoteBodyLayer.addChild(bodySprite);

      if (adjustedEndY >= -NOTE_HEIGHT && adjustedEndY <= this.height + NOTE_HEIGHT) {
        const termSprite = this.getOrCreateTerminalSprite(index, termTexKey);
        termSprite.x = laneX;
        termSprite.y = adjustedEndY;
        termSprite.alpha = isFailed ? 0.5 : 1;
        this.longNoteEndLayer.addChild(termSprite);
      }
    }
  }

  // ── 노트 상태 마킹 ────────────────────────────────────────

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

  // ── 풀/상태 초기화 ────────────────────────────────────────

  clearPools(): void {
    this.noteSpritePool.clear();
    this.bodySpritePool.clear();
    this.terminalSpritePool.clear();
    this.noteGraphicsPool.clear();
    this.bodyGraphicsPool.clear();
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();
  }

  // ── 설정 업데이트 ─────────────────────────────────────────

  setJudgmentLineY(y: number): void {
    this.judgmentLineY = y;
  }

  setScrollSpeed(speed: number): void {
    this.scrollSpeed = speed;
  }

  // ── 계산 헬퍼 ────────────────────────────────────────────

  calculateNoteY(noteTimeMs: number, songTimeMs: number): number {
    return (
      this.judgmentLineY - ((noteTimeMs - songTimeMs) * this.scrollSpeed) / 1000
    );
  }

  getLaneX(lane: number): number {
    return this.laneAreaX + (lane - 1) * LANE_WIDTH;
  }

  // ── 도형 그리기 ───────────────────────────────────────────

  private drawNoteShape(
    graphic: Graphics,
    type: string,
    override?: { color?: number; alpha?: number; gradient?: boolean },
  ): void {
    graphic.clear();

    const color = override?.color ?? this.getNoteColor(type);

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
      this.drawDiamond(graphic, fillInput);
    } else {
      graphic.rect(0, 0, NOTE_WIDTH, NOTE_HEIGHT);
      graphic.fill(fillInput);
    }
  }

  private drawDiamond(graphic: Graphics, fillStyle: FillInput): void {
    const centerX = NOTE_WIDTH / 2;
    const centerY = NOTE_HEIGHT / 2;

    graphic.poly([
      centerX, 0,
      NOTE_WIDTH, centerY,
      centerX, NOTE_HEIGHT,
      0, centerY,
    ]);
    graphic.fill(fillStyle);
  }

  // ── 색상 ─────────────────────────────────────────────────

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

  // ── 그라디언트 캐시 ───────────────────────────────────────

  private getBodyGradient(color: number): FillGradient {
    let gradient = this.bodyGradientCache.get(color);
    if (!gradient) {
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      const lr = Math.round(r + (255 - r) * 0.7);
      const lg = Math.round(g + (255 - g) * 0.7);
      const lb = Math.round(b + (255 - b) * 0.7);
      gradient = new FillGradient({
        type: "linear",
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 },
        colorStops: [
          { offset: 0, color: `rgb(${lr},${lg},${lb})` },
          { offset: 0.5, color: `rgb(${r},${g},${b})` },
          { offset: 1, color: `rgb(${lr},${lg},${lb})` },
        ],
        textureSpace: "local",
      });
      this.bodyGradientCache.set(color, gradient);
    }
    return gradient;
  }

  // ── 오브젝트 풀 ───────────────────────────────────────────

  private getOrCreateNoteSprite(index: number, texKey: string): Sprite {
    let sprite = this.noteSpritePool.get(index);
    if (!sprite) {
      sprite = new Sprite(this.skinManager.getTexture(texKey));
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

  /** Grace 노트 글로우 이펙트 */
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

  dispose(): void {
    this.noteSpritePool.clear();
    this.bodySpritePool.clear();
    this.terminalSpritePool.clear();
    this.noteGraphicsPool.clear();
    this.bodyGraphicsPool.clear();
    this.graceGlowPool.clear();
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();
    for (const g of this.bodyGradientCache.values()) g.destroy();
    this.bodyGradientCache.clear();
  }
}
