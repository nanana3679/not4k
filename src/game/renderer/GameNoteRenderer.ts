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
} from "pixi.js";
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
  // 노트 인덱스 → (texKey → Sprite) : 상태별 스프라이트를 모두 보유
  private noteSpritePool: Map<number, Map<string, Sprite>> = new Map();
  private bodySpritePool: Map<number, Map<string, NineSliceSprite>> = new Map();
  private terminalSpritePool: Map<number, Map<string, Sprite>> = new Map();

  // Object pools — Graphics (grace glow only)
  private graceGlowPool: Map<number, Graphics> = new Map();

  // Note state sets
  private failedBodies: Set<number> = new Set();
  private completedNotes: Set<number> = new Set();
  private doublePartialNotes: Set<number> = new Set();
  private missedNotes: Set<number> = new Set();
  /** 더블 롱노트 부분 실패 (1키만 실패) — side 정보 포함 */
  private partialFailedBodies: Map<number, 'left' | 'right'> = new Map();

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
    // 화면 아래로 벗어난 miss 노트는 완료 처리하여 렌더링 누적 방지
    if (y > this.height + NOTE_HEIGHT) {
      if (this.missedNotes.has(index)) {
        this.completedNotes.add(index);
      }
      return;
    }

    const laneX = this.getLaneX(entity.lane);
    const isPartial = this.doublePartialNotes.has(index);
    const isMissed = this.missedNotes.has(index);
    const isGrace = isGraceNote(entity);

    // Grace glow effect (miss 시에는 표시하지 않음)
    if (isGrace && !isMissed) {
      const glow = this.getOrCreateGraceGlow(index);
      glow.x = laneX - COLORS.GRACE_GLOW_PAD;
      glow.y = y - COLORS.GRACE_GLOW_PAD;
      this.noteLayer.addChild(glow);
    }

    if (entity.type === "trill") {
      const texKey = isMissed ? "noteTrillFailed" : "noteTrill";
      const sprite = this.getOrCreateNoteSprite(index, texKey);
      sprite.x = laneX;
      sprite.y = y;
      sprite.tint = 0xffffff;
      sprite.alpha = isMissed ? 1 : (isPartial ? 0.5 : 1);
      this.noteLayer.addChild(sprite);
    } else {
      const isDouble = entity.type === "double";
      let texKey: string;
      if (isMissed && isDouble) {
        texKey = "noteDoubleFailed";
      } else {
        texKey = isDouble ? "noteDouble" : "noteSingle";
      }
      const sprite = this.getOrCreateNoteSprite(index, texKey);
      sprite.x = laneX;
      sprite.y = y;
      sprite.tint = 0xffffff;
      sprite.alpha = isMissed ? 1 : (isPartial ? 0.7 : 1);
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

    // 화면 아래로 완전히 벗어난 miss 롱노트는 완료 처리
    if (endY > this.height + NOTE_HEIGHT && this.missedNotes.has(index)) {
      this.completedNotes.add(index);
      return;
    }

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
    const isMissed = this.missedNotes.has(index);
    const isPartial = this.doublePartialNotes.has(index);
    const partialSide = this.partialFailedBodies.get(index);
    const isPartialFailed = partialSide !== undefined;

    if (entity.type === "trillLong") {
      // Trill long: Sprite-based
      let bodyTexKey: string;
      let termTexKey: string;

      if (isFailed || isMissed) {
        bodyTexKey = "bodyTrillFailed";
        termTexKey = "terminalTrillFailed";
      } else {
        const isHeld = rawStartY >= this.judgmentLineY;
        bodyTexKey = isHeld ? "bodyTrillHeld" : "bodyTrill";
        termTexKey = "terminalTrill";
      }

      const bodySprite = this.getOrCreateBodySprite(index, bodyTexKey);
      bodySprite.x = laneX;
      bodySprite.y = adjustedEndY;
      bodySprite.width = LANE_WIDTH;
      bodySprite.height = bodyHeight;
      bodySprite.tint = 0xffffff;
      bodySprite.alpha = 1;
      this.longNoteBodyLayer.addChild(bodySprite);

      if (adjustedEndY >= -NOTE_HEIGHT && adjustedEndY <= this.height + NOTE_HEIGHT) {
        const termSprite = this.getOrCreateTerminalSprite(index, termTexKey);
        termSprite.x = laneX;
        termSprite.y = adjustedEndY;
        termSprite.tint = 0xffffff;
        termSprite.alpha = 1;
        this.longNoteEndLayer.addChild(termSprite);
      }

      const headY = rawStartY;
      if (headY >= -NOTE_HEIGHT && headY <= this.height + NOTE_HEIGHT) {
        const headTexKey = isMissed ? "noteTrillFailed" : "noteTrill";
        const headSprite = this.getOrCreateNoteSprite(index, headTexKey);
        headSprite.x = laneX;
        headSprite.y = headY;
        headSprite.tint = 0xffffff;
        headSprite.alpha = isPartial ? 0.5 : 1;
        this.longNoteHeadLayer.addChild(headSprite);
      }
    } else {
      // long / doubleLong: Sprite-based
      const isDouble = entity.type === "doubleLong";

      let bodyTexKey: string;
      let termTexKey: string;

      if (isFailed || isMissed) {
        bodyTexKey = isDouble ? "bodyDoubleFailed" : "bodySingleFailed";
        termTexKey = isDouble ? "terminalDoubleFailed" : "terminalSingleFailed";
      } else if (isDouble && isPartialFailed) {
        bodyTexKey = partialSide === 'left' ? 'bodyDoublePartialFailedLeft' : 'bodyDoublePartialFailedRight';
        termTexKey = partialSide === 'left' ? 'terminalDoublePartialFailedLeft' : 'terminalDoublePartialFailedRight';
      } else {
        const isHeld = rawStartY >= this.judgmentLineY;
        if (isHeld) {
          bodyTexKey = isDouble ? "bodyDoubleHeld" : "bodySingleHeld";
        } else {
          bodyTexKey = isDouble ? "bodyDouble" : "bodySingle";
        }
        termTexKey = isDouble ? "terminalDouble" : "terminalSingle";
      }

      const bodySprite = this.getOrCreateBodySprite(index, bodyTexKey);
      bodySprite.x = laneX;
      bodySprite.y = adjustedEndY;
      bodySprite.width = LANE_WIDTH;
      bodySprite.height = bodyHeight;
      bodySprite.tint = 0xffffff;
      bodySprite.alpha = (isPartial && !isPartialFailed) ? 0.7 : 1;
      this.longNoteBodyLayer.addChild(bodySprite);

      if (adjustedEndY >= -NOTE_HEIGHT && adjustedEndY <= this.height + NOTE_HEIGHT) {
        const termSprite = this.getOrCreateTerminalSprite(index, termTexKey);
        termSprite.x = laneX;
        termSprite.y = adjustedEndY;
        termSprite.tint = 0xffffff;
        termSprite.alpha = 1;
        this.longNoteEndLayer.addChild(termSprite);
      }
    }
  }

  // ── 노트 상태 마킹 ────────────────────────────────────────

  markBodyFailed(noteIndex: number): void {
    this.failedBodies.add(noteIndex);
  }

  markBodyPartialFailed(noteIndex: number, side: 'left' | 'right'): void {
    this.partialFailedBodies.set(noteIndex, side);
  }

  markNoteProcessed(noteIndex: number): void {
    this.completedNotes.add(noteIndex);
    this.doublePartialNotes.delete(noteIndex);
  }

  markDoublePartial(noteIndex: number): void {
    this.doublePartialNotes.add(noteIndex);
  }

  markNoteMissed(noteIndex: number): void {
    this.missedNotes.add(noteIndex);
    this.failedBodies.add(noteIndex);
  }

  // ── 풀/상태 초기화 ────────────────────────────────────────

  clearPools(): void {
    this.noteSpritePool.clear();
    this.bodySpritePool.clear();
    this.terminalSpritePool.clear();
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();
    this.missedNotes.clear();
    this.partialFailedBodies.clear();
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

  // ── 오브젝트 풀 ───────────────────────────────────────────

  private getOrCreateNoteSprite(index: number, texKey: string): Sprite {
    let pool = this.noteSpritePool.get(index);
    if (!pool) {
      pool = new Map();
      this.noteSpritePool.set(index, pool);
    }
    let sprite = pool.get(texKey);
    if (!sprite) {
      sprite = new Sprite(this.skinManager.getTexture(texKey));
      pool.set(texKey, sprite);
    }
    return sprite;
  }

  private getOrCreateBodySprite(index: number, texKey: string): NineSliceSprite {
    let pool = this.bodySpritePool.get(index);
    if (!pool) {
      pool = new Map();
      this.bodySpritePool.set(index, pool);
    }
    let sprite = pool.get(texKey);
    if (!sprite) {
      sprite = new NineSliceSprite({
        texture: this.skinManager.getTexture(texKey),
        leftWidth: 4,
        rightWidth: 4,
        topHeight: 4,
        bottomHeight: 4,
      });
      pool.set(texKey, sprite);
    }
    return sprite;
  }

  private getOrCreateTerminalSprite(index: number, texKey: string): Sprite {
    let pool = this.terminalSpritePool.get(index);
    if (!pool) {
      pool = new Map();
      this.terminalSpritePool.set(index, pool);
    }
    let sprite = pool.get(texKey);
    if (!sprite) {
      sprite = new Sprite(this.skinManager.getTexture(texKey));
      pool.set(texKey, sprite);
    }
    return sprite;
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
    const baseAlpha = COLORS.GRACE_GLOW_ALPHA;
    const steps = 4;
    // 안쪽→바깥쪽 겹쳐 그려 중심에서 멀어질수록 약해지는 글로우
    for (let i = 0; i < steps; i++) {
      const stepPad = pad * (i + 1) / steps;
      glow.roundRect(
        pad - stepPad, pad - stepPad,
        NOTE_WIDTH + stepPad * 2, NOTE_HEIGHT + stepPad * 2,
        4 + stepPad * 0.3,
      );
      glow.fill({ color: COLORS.GRACE_GLOW, alpha: baseAlpha / steps });
    }
    // 노트 내부 윤곽선 (흰색)
    glow.rect(pad, pad, NOTE_WIDTH, NOTE_HEIGHT);
    glow.stroke({ width: COLORS.GRACE_OUTLINE_WIDTH, color: COLORS.GRACE_OUTLINE, alignment: 0 });
    return glow;
  }

  dispose(): void {
    this.noteSpritePool.clear();
    this.bodySpritePool.clear();
    this.terminalSpritePool.clear();
    this.graceGlowPool.clear();
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();
    this.missedNotes.clear();
    this.partialFailedBodies.clear();
  }
}
