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
import { isGraceNote, isHoldOnlyNote } from "../../shared";
import type { SkinManager } from "../skin";
import type { NoteDisplayEffect } from "../judgment/judgmentEffects";
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
  private endCapSpritePool: Map<number, Map<string, Sprite>> = new Map();
  // 롱노트 시작 캡 (끝 캡 텍스처를 상하반전해 재사용)
  private startCapSpritePool: Map<number, Map<string, Sprite>> = new Map();

  // Object pools — Graphics (grace glow only)
  private graceGlowPool: Map<number, Graphics> = new Map();

  // Note state sets
  private failedBodies: Set<number> = new Set();
  private completedNotes: Set<number> = new Set();
  private doublePartialNotes: Set<number> = new Set();
  private missedNotes: Set<number> = new Set();
  /** 더블 롱노트 부분 실패 (1키만 실패) — side 정보 포함 */
  private partialFailedBodies: Map<number, 'left' | 'right'> = new Map();

  // 이어진 롱노트(connected long note) 정보 — 앞 롱노트가 held면 뒤 롱노트도 불이 들어오게 한다
  /** 롱노트 인덱스 → 이어진 선행 롱노트 인덱스 */
  private connectedPredecessor: Map<number, number> = new Map();
  /** 노트 인덱스 → 시작 시간(ms) — 선행 노트의 held 여부 계산용 */
  private noteStartMsByIndex: Map<number, number> = new Map();

  /**
   * 헤드없는 롱노트의 held 충족 조회 (엔진 주입, 이슈 #85). null이면 미주입(튜토리얼 프리뷰 등)이라
   * 기존 기하 held 경로로 폴백한다. 반환 null = 조회 대상 아님·소비 윈도우 밖.
   */
  private headlessHeldFillQuery:
    | ((index: number, timeMs: number) => { filled: number; required: number } | null)
    | null = null;

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

    // 포인트 노트는 시간 위치를 박스 상단 기준으로 그린다(박스 = [y, y+NOTE_HEIGHT]).
    // 롱노트도 같은 기준으로 맞춘다:
    //  - 머리: 시작 시간 위치가 머리 박스 상단이 되도록 +NOTE_HEIGHT 내린다
    //    (body 하단 = 시작 시간 + NOTE_HEIGHT → 포인트 노트 박스 하단과 일치).
    //  - 끝점: 끝 시간 위치가 끝 박스 상단(terminal.y)이 되도록 보정 없이 그대로 쓴다.
    // 이러면 길이 0 롱노트는 bodyHeight가 정확히 NOTE_HEIGHT가 되어 포인트 노트와 같은 칸에 온다.
    const rawStartY = this.calculateNoteY(startMs, songTimeMs) + NOTE_HEIGHT;
    const endY = this.calculateNoteY(endMs, songTimeMs);

    // 화면 아래로 완전히 벗어난 miss 롱노트는 완료 처리
    if (endY > this.height + NOTE_HEIGHT && this.missedNotes.has(index)) {
      this.completedNotes.add(index);
      return;
    }

    // 바디 시작 Y를 판정선으로 클램프 (머리 박스 상단이 판정선에 고정되도록 +NOTE_HEIGHT)
    const startY = Math.min(rawStartY, this.judgmentLineY + NOTE_HEIGHT);

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
      let endCapTexKey: string;

      if (isFailed || isMissed) {
        bodyTexKey = "bodyTrillFailed";
        endCapTexKey = "terminalTrillFailed";
      } else {
        const isHeld =
          rawStartY >= this.judgmentLineY + NOTE_HEIGHT ||
          this.hasConnectedHeldPredecessor(index, songTimeMs);
        bodyTexKey = isHeld ? "bodyTrillHeld" : "bodyTrill";
        endCapTexKey = "terminalTrill";
      }

      // 바디는 처음(끝점 쪽)·끝(머리 쪽) 각각 10px 줄여, 헤드/끝 다이아몬드가
      // 캡처럼 드러나게 한다. 줄인 높이가 0 이하면(아주 짧은 트릴 롱) 바디는 생략.
      const TRILL_BODY_END_INSET = 10;
      const insetBodyY = adjustedEndY + TRILL_BODY_END_INSET;
      const insetBodyHeight = bodyHeight - TRILL_BODY_END_INSET * 2;
      if (insetBodyHeight > 0) {
        const bodySprite = this.getOrCreateBodySprite(index, bodyTexKey);
        bodySprite.x = laneX;
        bodySprite.y = insetBodyY;
        bodySprite.width = LANE_WIDTH;
        bodySprite.height = insetBodyHeight;
        bodySprite.tint = 0xffffff;
        bodySprite.alpha = 1;
        this.longNoteBodyLayer.addChild(bodySprite);
      }

      if (adjustedEndY >= -NOTE_HEIGHT && adjustedEndY <= this.height + NOTE_HEIGHT) {
        const endCapSprite = this.getOrCreateEndCapSprite(index, endCapTexKey);
        endCapSprite.x = laneX;
        endCapSprite.y = adjustedEndY;
        endCapSprite.tint = 0xffffff;
        endCapSprite.alpha = 1;
        this.longNoteEndLayer.addChild(endCapSprite);
      }

      // 헤드 다이아몬드는 그리지 않는다. trillLong은 검증 규칙상 항상 같은 레인·같은
      // 시작 박에 별도의 trill 포인트 노트(헤드)를 가지며(validateTrillLong, RFD 0009),
      // 그 노트가 renderPointNote에서 올바른 위치·올바른 헤드 판정 상태로 다이아몬드를 그린다.
      // 여기서 또 그리면 헤드가 중복 렌더되고, body 정렬용 +NOTE_HEIGHT 보정 때문에
      // NOTE_HEIGHT만큼 어긋난 두 번째 다이아몬드가 보인다.
    } else {
      // long / doubleLong: Sprite-based
      const isDouble = entity.type === "doubleLong";

      let bodyTexKey: string;
      let endCapTexKey: string;

      if (isFailed || isMissed) {
        bodyTexKey = isDouble ? "bodyDoubleFailed" : "bodySingleFailed";
        endCapTexKey = isDouble ? "terminalDoubleFailed" : "terminalSingleFailed";
      } else if (isDouble && isPartialFailed) {
        bodyTexKey = partialSide === 'left' ? 'bodyDoublePartialFailedLeft' : 'bodyDoublePartialFailedRight';
        endCapTexKey = partialSide === 'left' ? 'terminalDoublePartialFailedLeft' : 'terminalDoublePartialFailedRight';
      } else {
        // 헤드없는 롱노트가 홀드로 consume 충족 중이면 엔진 술어를 그대로 조회해 body를 켠다
        // (이슈 #85 — 시각·판정 단일 진실). null이면(조회 대상 아님·윈도우 밖·미주입) 기하 held로 폴백.
        const fill = this.headlessHeldFillQuery?.(index, songTimeMs) ?? null;
        if (fill && isDouble && fill.filled > 0 && fill.filled < fill.required) {
          // 부분 충족(1/2): 레인 위치로 대기 쪽 결정 (레인 1·2=왼쪽 대기, 3·4=오른쪽 대기)
          bodyTexKey = entity.lane <= 2 ? "bodyDoublePartialHeldLeft" : "bodyDoublePartialHeldRight";
        } else {
          const isHeld = fill
            ? fill.filled >= fill.required
            : rawStartY >= this.judgmentLineY + NOTE_HEIGHT ||
              this.hasConnectedHeldPredecessor(index, songTimeMs);
          bodyTexKey = isHeld
            ? (isDouble ? "bodyDoubleHeld" : "bodySingleHeld")
            : (isDouble ? "bodyDouble" : "bodySingle");
        }
        endCapTexKey = isDouble ? "terminalDouble" : "terminalSingle";
      }

      const bodySprite = this.getOrCreateBodySprite(index, bodyTexKey);
      bodySprite.x = laneX;
      bodySprite.y = adjustedEndY;
      bodySprite.width = LANE_WIDTH;
      bodySprite.height = bodyHeight;
      bodySprite.tint = 0xffffff;
      bodySprite.alpha = (isPartial && !isPartialFailed) ? 0.7 : 1;
      this.longNoteBodyLayer.addChild(bodySprite);

      // 끝 캡·시작 캡은 기본적으로 노트 높이의 절반(10px)으로 양 끝을 마감한다.
      // 단, 길이가 짧은 롱노트(특히 길이 0)에서는 두 캡이 body를 꽉 덮어 가운데 심지(wire)가
      // 가려지므로, 캡 사이에 최소 WIRE_MIN_PX의 심지가 남도록 캡 높이를 제한한다.
      const WIRE_MIN_PX = 5;
      const capHeight = Math.min(NOTE_HEIGHT / 2, (bodyHeight - WIRE_MIN_PX) / 2);

      if (adjustedEndY >= -NOTE_HEIGHT && adjustedEndY <= this.height + NOTE_HEIGHT) {
        // hold-only(싱글·더블 롱) 끝점에 면제 글로우 — 유지 실패 시에는 표시하지 않음
        if ((entity.type === "long" || entity.type === "doubleLong") && isHoldOnlyNote(entity) && !isFailed && !isMissed) {
          const glow = this.getOrCreateGraceGlow(index);
          glow.x = laneX - COLORS.GRACE_GLOW_PAD;
          glow.y = adjustedEndY - COLORS.GRACE_GLOW_PAD;
          this.longNoteEndLayer.addChild(glow);
        }
        // 끝 캡 — terminal 텍스처 윗부분 절반을 끝점에 그린다
        const endCapSprite = this.getOrCreateEndCapSprite(index, endCapTexKey);
        endCapSprite.texture = this.skinManager.getHalfCapTexture(endCapTexKey);
        endCapSprite.x = laneX;
        endCapSprite.y = adjustedEndY;
        endCapSprite.width = LANE_WIDTH;
        endCapSprite.height = capHeight;
        endCapSprite.tint = 0xffffff;
        endCapSprite.alpha = 1;
        this.longNoteEndLayer.addChild(endCapSprite);
      }

      // 시작 캡 — 같은 캡 텍스처를 상하반전(scale.y<0)해 머리 끝(startY)에 그린다
      if (startY >= -NOTE_HEIGHT && startY <= this.height + NOTE_HEIGHT) {
        const startCap = this.getOrCreateStartCapSprite(index, endCapTexKey);
        startCap.texture = this.skinManager.getHalfCapTexture(endCapTexKey);
        startCap.x = laneX;
        startCap.y = startY;
        startCap.width = LANE_WIDTH;
        startCap.height = capHeight;
        startCap.scale.y = -Math.abs(startCap.scale.y); // 상하반전 → [startY-capHeight, startY]
        startCap.tint = 0xffffff;
        startCap.alpha = (isPartial && !isPartialFailed) ? 0.7 : 1;
        this.longNoteHeadLayer.addChild(startCap);
      }
    }
  }

  // ── 노트 상태 마킹 ────────────────────────────────────────

  /**
   * 판정 결과에서 유도된 표시 상태(`noteDisplayEffect`)를 노트별 캐시에 적용한다.
   * 이전의 5개 mark* 를 대체 — "무엇을 켤지" 결정은 순수 함수가, 적용·저장은 여기가 담당.
   */
  applyNoteDisplayEffect(noteIndex: number, effect: NoteDisplayEffect): void {
    if (effect.body === 'failed') {
      this.failedBodies.add(noteIndex);
    } else if (effect.body) {
      const newSide = effect.body.partialFailed;
      const existing = this.partialFailedBodies.get(noteIndex);
      if (existing !== undefined && existing !== newSide) {
        // 반대쪽까지 실패 = 더블롱 두 키 모두 실패 → 완전 실패(bodyDoubleFailed)로 승격.
        // 그대로 두면 두 번째 partialFailed가 첫 번째를 덮어써 "반대 한쪽만 실패"로 오표시된다.
        this.failedBodies.add(noteIndex);
        this.partialFailedBodies.delete(noteIndex);
      } else {
        this.partialFailedBodies.set(noteIndex, newSide);
      }
    }

    switch (effect.visibility) {
      case 'processed':
        this.completedNotes.add(noteIndex);
        this.doublePartialNotes.delete(noteIndex);
        break;
      case 'missed':
        this.missedNotes.add(noteIndex);
        this.failedBodies.add(noteIndex);
        break;
      case 'doublePartial':
        this.doublePartialNotes.add(noteIndex);
        break;
      case 'unchanged':
        break;
    }
  }

  // ── 풀/상태 초기화 ────────────────────────────────────────

  clearPools(): void {
    this.noteSpritePool.clear();
    this.bodySpritePool.clear();
    this.endCapSpritePool.clear();
    this.startCapSpritePool.clear();
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();
    this.missedNotes.clear();
    this.partialFailedBodies.clear();
    this.connectedPredecessor.clear();
    this.noteStartMsByIndex.clear();
  }

  // ── 설정 업데이트 ─────────────────────────────────────────

  /**
   * 이어진 롱노트 연결 정보를 설정한다. setChart에서 차트별로 1회 호출.
   * @param connectedPredecessor 롱노트 인덱스 → 이어진 선행 롱노트 인덱스
   * @param noteStartMsByIndex 노트 인덱스 → 시작 시간(ms)
   */
  setLongNoteConnections(
    connectedPredecessor: ReadonlyMap<number, number>,
    noteStartMsByIndex: ReadonlyMap<number, number>,
  ): void {
    this.connectedPredecessor = new Map(connectedPredecessor);
    this.noteStartMsByIndex = new Map(noteStartMsByIndex);
  }

  /**
   * 헤드없는 롱노트 held 충족 조회를 주입한다 (이슈 #85). 플레이 화면은 JudgmentEngine을
   * 연결하고, 튜토리얼 프리뷰처럼 미주입이면 기존 기하 held 경로로 폴백한다.
   */
  setHeadlessHeldFillQuery(
    query: (index: number, timeMs: number) => { filled: number; required: number } | null,
  ): void {
    this.headlessHeldFillQuery = query;
  }

  setJudgmentLineY(y: number): void {
    this.judgmentLineY = y;
  }

  setScrollSpeed(speed: number): void {
    this.scrollSpeed = speed;
  }

  // ── 계산 헬퍼 ────────────────────────────────────────────

  /**
   * 이어진 선행 롱노트가 현재 held(불 들어옴) 상태인지 — 그러면 이 롱노트에도 불을 켠다.
   * `o-o-`에서 앞 롱노트가 held면 뒤 롱노트도 held로 보이게 하는 전파.
   */
  private hasConnectedHeldPredecessor(index: number, songTimeMs: number): boolean {
    const pred = this.connectedPredecessor.get(index);
    if (pred === undefined) return false;
    return this.isLongNoteHeldVisually(pred, songTimeMs);
  }

  /**
   * 롱노트가 시각적으로 held 상태인지 (자기 머리가 판정선에 닿았거나,
   * 이어진 선행 롱노트가 held). 실패/미스한 롱노트는 연속 홀드가 끊긴 것이므로 전파하지 않는다.
   */
  private isLongNoteHeldVisually(index: number, songTimeMs: number): boolean {
    if (this.failedBodies.has(index) || this.missedNotes.has(index)) return false;

    const startMs = this.noteStartMsByIndex.get(index);
    if (startMs !== undefined) {
      const rawStartY = this.calculateNoteY(startMs, songTimeMs) + NOTE_HEIGHT;
      if (rawStartY >= this.judgmentLineY + NOTE_HEIGHT) return true;
    }

    const pred = this.connectedPredecessor.get(index);
    if (pred !== undefined) return this.isLongNoteHeldVisually(pred, songTimeMs);
    return false;
  }

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

  private getOrCreateEndCapSprite(index: number, texKey: string): Sprite {
    let pool = this.endCapSpritePool.get(index);
    if (!pool) {
      pool = new Map();
      this.endCapSpritePool.set(index, pool);
    }
    let sprite = pool.get(texKey);
    if (!sprite) {
      sprite = new Sprite(this.skinManager.getTexture(texKey));
      pool.set(texKey, sprite);
    }
    return sprite;
  }

  private getOrCreateStartCapSprite(index: number, texKey: string): Sprite {
    let pool = this.startCapSpritePool.get(index);
    if (!pool) {
      pool = new Map();
      this.startCapSpritePool.set(index, pool);
    }
    let sprite = pool.get(texKey);
    if (!sprite) {
      sprite = new Sprite(this.skinManager.getHalfCapTexture(texKey));
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
    this.endCapSpritePool.clear();
    this.startCapSpritePool.clear();
    this.graceGlowPool.clear();
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();
    this.missedNotes.clear();
    this.partialFailedBodies.clear();
  }
}
