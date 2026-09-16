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
  TilingSprite,
  Mesh,
  MeshGeometry,
  type Texture,
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

/** Core 타입에 의존하지 않는 unit별 body 표시 조회 계약. */
export interface JudgmentBodyUnitView {
  readonly unitIndex: number;
  readonly active: boolean;
  readonly failed: boolean;
  readonly complete: boolean;
  readonly registeredKeys: readonly string[];
}

export interface JudgmentBodyStateView {
  readonly units: readonly JudgmentBodyUnitView[];
  readonly successorIndex?: number;
}

export type JudgmentBodyStateQuery =
  (noteIndex: number, timeMs: number) => JudgmentBodyStateView | null;

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
  private bodySpritePool: Map<number, Map<string, NineSliceSprite | TilingSprite>> = new Map();
  private endCapSpritePool: Map<number, Map<string, Sprite>> = new Map();
  // 롱노트 시작 캡 (끝 캡 텍스처를 상하반전해 재사용)
  private startCapSpritePool: Map<number, Map<string, Sprite>> = new Map();

  // Object pools — Graphics (grace glow only)
  private graceGlowPool: Map<number, Graphics> = new Map();
  private graceOverlayPool: Map<number, Sprite> = new Map();
  private pointShadowPool: Map<number, Sprite> = new Map();
  private trillPointShadowPool: Map<number, Mesh> = new Map();
  private trillPointShadowGeometry: MeshGeometry | null = null;

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
  /** Trill 구간은 연결 켜짐 표시를 보내거나 이어받지 않는다. */
  private trillLongIndices: Set<number> = new Set();

  /**
   * 헤드없는 롱노트의 held 충족 조회 (엔진 주입, 이슈 #85). null이면 미주입(튜토리얼 프리뷰 등)이라
   * 기존 기하 held 경로로 폴백한다. 반환 null = 조회 대상 아님·소비 윈도우 밖.
   */
  private headlessHeldFillQuery:
    | ((index: number, timeMs: number) => { filled: number; required: number } | null)
    | null = null;
  private judgmentBodyStateQuery: JudgmentBodyStateQuery | null = null;

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
    // Trill diamonds share the body's width; the mechanical point overhang is separate.
    const pointOverhang = entity.type === "trill" ? 0 : Math.max(0, this.skinManager.getTheme().pointNoteOverhangPx ?? 0);
    const pointX = laneX - pointOverhang;
    const pointWidth = NOTE_WIDTH + pointOverhang * 2;

    // Grace glow effect (miss 시에는 표시하지 않음)
    if (isGrace && !isMissed) {
      this.addGraceGlow(index, this.noteLayer, pointX, y, pointWidth, 'point');
    }

    const shadowGeometry = this.skinManager.getTheme().pointShadow;
    if (shadowGeometry && this.skinManager.hasTexture('pointShadow')) {
      if (entity.type === 'trill') {
        // 직사각형 그림자는 마름모 하단과 떨어져 가로 절단선처럼 보인다.
        // 같은 그림자 텍스처를 아래 두 변에 맞춰 흰 바디 위에서도 윤곽을 유지한다.
        let shadow = this.trillPointShadowPool.get(index);
        if (!shadow) {
          if (!this.trillPointShadowGeometry) {
            const tipY = shadowGeometry.offsetY;
            const sideY = tipY - NOTE_HEIGHT / 2;
            // 얇은 접촉선보다 넓게 퍼지는 낮은 농도의 그림자로 바디와 포인트를 구분한다.
            const bottom = shadowGeometry.height * 2;
            this.trillPointShadowGeometry = new MeshGeometry({
              positions: new Float32Array([
                0, sideY, NOTE_WIDTH / 2, tipY, NOTE_WIDTH, sideY,
                0, sideY + bottom, NOTE_WIDTH / 2, tipY + bottom, NOTE_WIDTH, sideY + bottom,
              ]),
              uvs: new Float32Array([0, 0, .5, 0, 1, 0, 0, 1, .5, 1, 1, 1]),
              indices: new Uint32Array([0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4]),
            });
          }
          shadow = new Mesh({
            geometry: this.trillPointShadowGeometry,
            texture: this.skinManager.getTexture('pointShadow'),
          });
          shadow.alpha = .75;
          this.trillPointShadowPool.set(index, shadow);
        }
        shadow.x = pointX;
        shadow.y = y;
        this.noteLayer.addChild(shadow);
      } else {
        let shadow = this.pointShadowPool.get(index);
        if (!shadow) {
          shadow = new Sprite(this.skinManager.getTexture('pointShadow'));
          this.pointShadowPool.set(index, shadow);
        }
        shadow.x = laneX;
        shadow.y = y + shadowGeometry.offsetY;
        shadow.width = LANE_WIDTH;
        shadow.height = shadowGeometry.height;
        this.noteLayer.addChild(shadow);
      }
    }

    if (entity.type === "trill") {
      const texKey = isMissed ? "noteTrillFailed" : "noteTrill";
      const sprite = this.getOrCreateNoteSprite(index, texKey);
      sprite.x = pointX;
      sprite.y = y;
      sprite.width = pointWidth;
      sprite.height = NOTE_HEIGHT;
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
      sprite.x = pointX;
      sprite.y = y;
      sprite.width = pointWidth;
      sprite.height = NOTE_HEIGHT;
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

    const bodyState = this.judgmentBodyStateQuery?.(index, songTimeMs) ?? null;
    const queryUnits = bodyState?.units ?? [];
    const queryFailedCount = queryUnits.filter((unit) => unit.failed).length;
    const queryCompleted = queryUnits.length > 0 && queryUnits.every((unit) => unit.complete);
    const heldUnitCount = bodyState
      ? entity.type === 'trillLong'
        ? queryUnits.filter(unit => unit.active && !unit.failed && !unit.complete && unit.registeredKeys.length > 0).length
        : this.getJudgmentHeldUnitCount(index, bodyState, songTimeMs)
      : 0;
    const requiredUnitCount = queryUnits.length;
    // terminal 성공은 즉시 숨긴다. 연결 body의 성공은 자기 E까지 geometry를 유지한다.
    // 실패 unit은 끝 시각 이후에도 실패색으로 남아 core body state를 표시한다.
    if (bodyState && queryCompleted && bodyState.successorIndex === undefined) {
      this.completedNotes.add(index);
      return;
    }

    // 헤드없는 롱노트의 홀드 충족 조회 (이슈 #85) — 텍스처 선택 + "빈 구간 채움"에 공용.
    const headlessFill = this.headlessHeldFillQuery?.(index, songTimeMs) ?? null;
    // 미리 홀드로 충족 중(filled>0)이고 길이가 있는 롱이면 body 하단을 판정선까지 당겨 빈 구간을
    // 채운다 — "내 홀드가 이 롱을 맡고 있다"를 판정선 위 작은 텍스처 변화가 아니라 채워진 body로 보인다.
    // 길이 0 슬라이드/릴리즈 노트는 body가 없어 당기지 않는다.
    const pullToLine = headlessFill !== null && headlessFill.filled > 0 && endMs > startMs;

    // 바디 시작 Y를 판정선으로 클램프 (머리 박스 상단이 판정선에 고정되도록 +NOTE_HEIGHT).
    // 당김 중이면 노트가 아직 판정선에 안 닿았어도 하단을 판정선에 고정한다.
    const startY = pullToLine
      ? this.judgmentLineY + NOTE_HEIGHT
      : Math.min(rawStartY, this.judgmentLineY + NOTE_HEIGHT);

    const laneX = this.getLaneX(entity.lane);
    let bodyHeight = startY - endY;

    if (bodyHeight < 0) return;

    let adjustedEndY = endY;
    if (bodyHeight < NOTE_HEIGHT) {
      bodyHeight = NOTE_HEIGHT;
      adjustedEndY = startY - NOTE_HEIGHT;
    }

    if (adjustedEndY < -NOTE_HEIGHT && startY < -NOTE_HEIGHT) return;

    const isFailed = bodyState ? queryUnits.length > 0 && queryFailedCount === queryUnits.length : this.failedBodies.has(index);
    const isMissed = this.missedNotes.has(index);
    const queryPartialFailed = bodyState ? queryFailedCount > 0 && queryFailedCount < queryUnits.length : false;
    const isPartial = bodyState ? queryPartialFailed : this.doublePartialNotes.has(index);
    const partialSide = this.partialFailedBodies.get(index);
    const isPartialFailed = partialSide !== undefined;
    const theme = this.skinManager.getTheme();
    const fullHeightTerminal = theme.longNoteTerminalMode === "full-height";
    const terminalFrameOverhang = fullHeightTerminal
      ? Math.max(0, theme.longNoteTerminalFrameOverhangPx ?? 0)
      : 0;
    const terminalX = laneX - terminalFrameOverhang;
    const terminalWidth = LANE_WIDTH + terminalFrameOverhang * 2;

    if (entity.type === "trillLong") {
      // Trill long: Sprite-based
      let bodyTexKey: string;
      let endCapTexKey: string;

      if (isFailed || isMissed) {
        bodyTexKey = "bodyTrillFailed";
        endCapTexKey = "terminalTrillFailed";
      } else {
        const isHeld = bodyState
          ? heldUnitCount >= requiredUnitCount && requiredUnitCount > 0
          : rawStartY >= this.judgmentLineY + NOTE_HEIGHT;
        bodyTexKey = isHeld ? "bodyTrillHeld" : "bodyTrill";
        endCapTexKey = !isHeld && this.skinManager.hasTexture("terminalTrillIdle")
          ? "terminalTrillIdle"
          : "terminalTrill";
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

      if ((!fullHeightTerminal || songTimeMs <= endMs)
        && adjustedEndY >= -NOTE_HEIGHT
        && adjustedEndY <= this.height + NOTE_HEIGHT) {
        if (isHoldOnlyNote(entity) && !isFailed && !isMissed) {
          const terminalY = fullHeightTerminal ? Math.min(adjustedEndY, this.judgmentLineY - NOTE_HEIGHT) : adjustedEndY;
          this.addGraceGlow(index, this.longNoteEndLayer, terminalX, terminalY, terminalWidth, 'terminal');
        }
        const endCapSprite = this.getOrCreateEndCapSprite(index, endCapTexKey);
        endCapSprite.x = fullHeightTerminal ? terminalX : laneX;
        endCapSprite.y = fullHeightTerminal
          ? Math.min(adjustedEndY, this.judgmentLineY - NOTE_HEIGHT)
          : adjustedEndY;
        if (fullHeightTerminal) {
          endCapSprite.width = terminalWidth;
          endCapSprite.height = NOTE_HEIGHT;
        }
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
      } else if (isDouble && (isPartialFailed || queryPartialFailed)) {
        const failedUnit = queryUnits.find((unit) => unit.failed);
        const failedSide = failedUnit ? (failedUnit.unitIndex === 0 ? 'left' : 'right') : partialSide;
        bodyTexKey = failedSide === 'left' ? 'bodyDoublePartialFailedLeft' : 'bodyDoublePartialFailedRight';
        endCapTexKey = failedSide === 'left' ? 'terminalDoublePartialFailedLeft' : 'terminalDoublePartialFailedRight';
      } else {
        // 헤드없는 롱노트가 홀드로 consume 충족 중이면 엔진 술어를 그대로 조회해 body를 켠다
        // (이슈 #85 — 시각·판정 단일 진실). null이면(조회 대상 아님·윈도우 밖·미주입) 기하 held로 폴백.
        const fill = headlessFill;
        let terminalActivated: boolean;
        if (bodyState && isDouble && heldUnitCount > 0 && heldUnitCount < requiredUnitCount) {
          bodyTexKey = entity.lane <= 2 ? "bodyDoublePartialHeldLeft" : "bodyDoublePartialHeldRight";
          terminalActivated = true;
        } else if (bodyState && heldUnitCount > 0 && heldUnitCount === requiredUnitCount) {
          bodyTexKey = isDouble ? "bodyDoubleHeld" : "bodySingleHeld";
          terminalActivated = true;
        } else if (fill && isDouble && fill.filled > 0 && fill.filled < fill.required) {
          // 부분 충족(1/2): 레인 위치로 대기 쪽 결정 (레인 1·2=왼쪽 대기, 3·4=오른쪽 대기)
          bodyTexKey = entity.lane <= 2 ? "bodyDoublePartialHeldLeft" : "bodyDoublePartialHeldRight";
          terminalActivated = true;
        } else {
          const isHeld = bodyState
            ? heldUnitCount >= requiredUnitCount && requiredUnitCount > 0
            : fill
              ? fill.filled >= fill.required
              : rawStartY >= this.judgmentLineY + NOTE_HEIGHT ||
                this.hasConnectedHeldPredecessor(index, songTimeMs);
          bodyTexKey = isHeld
            ? (isDouble ? "bodyDoubleHeld" : "bodySingleHeld")
            : (isDouble ? "bodyDouble" : "bodySingle");
          terminalActivated = isHeld;
        }
        const activeTerminalTexKey = isDouble ? "terminalDouble" : "terminalSingle";
        const idleTerminalTexKey = isDouble ? "terminalDoubleIdle" : "terminalSingleIdle";
        // 전체 높이 terminal의 부분 유지는 부분 실패와 같은 중앙광 도안을 쓴다.
        // 반쪽 cap 스킨은 기존 terminal 선택을 유지한다.
        if (fullHeightTerminal && bodyTexKey === "bodyDoublePartialHeldLeft") {
          endCapTexKey = "terminalDoublePartialFailedLeft";
        } else if (fullHeightTerminal && bodyTexKey === "bodyDoublePartialHeldRight") {
          endCapTexKey = "terminalDoublePartialFailedRight";
        } else {
          endCapTexKey = !terminalActivated && this.skinManager.hasTexture(idleTerminalTexKey)
            ? idleTerminalTexKey
            : activeTerminalTexKey;
        }
      }

      const bodySprite = this.getOrCreateBodySprite(index, bodyTexKey);
      bodySprite.x = laneX;
      bodySprite.y = adjustedEndY;
      bodySprite.width = LANE_WIDTH;
      bodySprite.height = bodyHeight;
      bodySprite.tint = 0xffffff;
      bodySprite.alpha = (isPartial && !isPartialFailed) ? 0.7 : 1;
      this.longNoteBodyLayer.addChild(bodySprite);

      // 기본 스킨은 terminal의 윗부분을 반쪽 cap으로 사용한다. full-height 스킨은 terminal
      // 전체를 노트 한 칸 높이로 사용하며, 길이 0에서는 시작 terminal 하나만 남긴다.
      const isZeroLength = endMs === startMs;
      const WIRE_MIN_PX = 5;
      const capHeight = fullHeightTerminal
        ? NOTE_HEIGHT
        : Math.min(NOTE_HEIGHT / 2, (bodyHeight - WIRE_MIN_PX) / 2);
      const capTexture = fullHeightTerminal
        ? this.skinManager.getTexture(endCapTexKey)
        : this.skinManager.getHalfCapTexture(endCapTexKey);
      const fullHeightTerminalsOverlap = fullHeightTerminal && bodyHeight < capHeight * 2;
      const showFullHeightStartTerminal = !fullHeightTerminal || songTimeMs <= startMs;
      const showFullHeightEndTerminal = !fullHeightTerminal || (
        songTimeMs <= endMs
        && !(fullHeightTerminalsOverlap && songTimeMs <= startMs)
      );

      if ((!fullHeightTerminal || !isZeroLength)
        && showFullHeightEndTerminal
        && adjustedEndY >= -NOTE_HEIGHT
        && adjustedEndY <= this.height + NOTE_HEIGHT) {
        // hold-only(싱글·더블 롱) 끝점에 면제 글로우 — 유지 실패 시에는 표시하지 않음
        if ((entity.type === "long" || entity.type === "doubleLong") && isHoldOnlyNote(entity) && !isFailed && !isMissed) {
          const terminalY = fullHeightTerminal ? Math.min(adjustedEndY, this.judgmentLineY - capHeight) : adjustedEndY;
          this.addGraceGlow(index, this.longNoteEndLayer, terminalX, terminalY, terminalWidth, 'terminal');
        }
        // 끝 terminal — 스킨 설정에 따라 전체 또는 윗부분 절반을 그린다.
        const endCapSprite = this.getOrCreateEndCapSprite(index, endCapTexKey);
        endCapSprite.texture = capTexture;
        endCapSprite.x = terminalX;
        endCapSprite.y = fullHeightTerminal
          ? Math.min(adjustedEndY, this.judgmentLineY - capHeight)
          : adjustedEndY;
        endCapSprite.width = terminalWidth;
        endCapSprite.height = capHeight;
        endCapSprite.tint = 0xffffff;
        endCapSprite.alpha = 1;
        this.longNoteEndLayer.addChild(endCapSprite);
      }

      // 시작 terminal — 같은 텍스처를 상하반전(scale.y<0)해 머리 끝(startY)에 그린다.
      if (showFullHeightStartTerminal
        && startY >= -NOTE_HEIGHT
        && startY <= this.height + NOTE_HEIGHT) {
        if (fullHeightTerminal && isZeroLength && isHoldOnlyNote(entity) && !isFailed && !isMissed) {
          this.addGraceGlow(index, this.longNoteHeadLayer, terminalX, Math.min(startY, this.judgmentLineY) - capHeight, terminalWidth, 'terminal');
        }
        const startCap = this.getOrCreateStartCapSprite(index, endCapTexKey, capTexture);
        startCap.texture = capTexture;
        startCap.x = terminalX;
        startCap.y = fullHeightTerminal
          ? Math.min(startY, this.judgmentLineY)
          : startY;
        startCap.width = terminalWidth;
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
    this.trillLongIndices.clear();
  }

  // ── 설정 업데이트 ─────────────────────────────────────────

  /**
   * 이어진 롱노트 연결 정보를 설정한다. setChart에서 차트별로 1회 호출.
   * @param connectedPredecessor 롱노트 인덱스 → 이어진 선행 롱노트 인덱스
   * @param noteStartMsByIndex 노트 인덱스 → 시작 시간(ms)
   * @param trillLongIndices 연결 켜짐 표시에서 제외할 Trill 구간
   */
  setLongNoteConnections(
    connectedPredecessor: ReadonlyMap<number, number>,
    noteStartMsByIndex: ReadonlyMap<number, number>,
    trillLongIndices: ReadonlySet<number> = new Set(),
  ): void {
    this.connectedPredecessor = new Map(connectedPredecessor);
    this.noteStartMsByIndex = new Map(noteStartMsByIndex);
    this.trillLongIndices = new Set(trillLongIndices);
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

  /** 새 core의 unit별 body 상태를 주입한다. 미주입 시 기존 표시 경로를 유지한다. */
  setJudgmentBodyStateQuery(query: JudgmentBodyStateQuery | null): void {
    this.judgmentBodyStateQuery = query;
  }

  setJudgmentLineY(y: number): void {
    this.judgmentLineY = y;
  }

  setScrollSpeed(speed: number): void {
    this.scrollSpeed = speed;
  }

  // ── 계산 헬퍼 ────────────────────────────────────────────

  /**
   * 아직 시작하지 않은 연결 구간은 앞 구간의 유지 중인 unit 수만큼 미리 켠다.
   * 각 구간의 건강한 unit 수를 상한으로 삼아 single을 거친 double을 전부 켜지 않는다.
   * 판정 unit을 활성화하지 않으며, 시작한 구간의 해제·실패·완료 상태는 건너뛰지 않는다.
   */
  private getJudgmentHeldUnitCount(
    index: number,
    bodyState: JudgmentBodyStateView,
    songTimeMs: number,
  ): number {
    let current = index;
    let state = bodyState;
    let capacity = state.units.length;
    const visited = new Set<number>();

    while (!visited.has(current)) {
      visited.add(current);
      const available = state.units.filter((unit) => !unit.failed && !unit.complete);
      capacity = Math.min(capacity, available.length);
      if (capacity === 0) return 0;

      const held = available.filter((unit) => unit.active && unit.registeredKeys.length > 0).length;
      if (held > 0) return Math.min(capacity, held);
      if (state.units.some((unit) => unit.active)) return 0;

      const predecessor = this.connectedPredecessor.get(current);
      if (predecessor === undefined || this.trillLongIndices.has(predecessor)) return 0;
      const previous = this.judgmentBodyStateQuery?.(predecessor, songTimeMs);
      // 표시용 연결도 현재 판정 세션에 포함된 연결만 따른다.
      if (!previous || previous.successorIndex !== current) return 0;
      current = predecessor;
      state = previous;
    }
    return 0;
  }

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
    if (this.trillLongIndices.has(index) || this.failedBodies.has(index) || this.missedNotes.has(index)) return false;
    if (this.judgmentBodyStateQuery) {
      const state = this.judgmentBodyStateQuery(index, songTimeMs);
      return state !== null && this.getJudgmentHeldUnitCount(index, state, songTimeMs) > 0;
    }

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

  private getOrCreateBodySprite(index: number, texKey: string): NineSliceSprite | TilingSprite {
    let pool = this.bodySpritePool.get(index);
    if (!pool) {
      pool = new Map();
      this.bodySpritePool.set(index, pool);
    }
    let sprite = pool.get(texKey);
    if (!sprite) {
      const texture = this.skinManager.getTexture(texKey);
      if (this.skinManager.getTheme().longNoteBodyMode === 'repeat') {
        const tile = new TilingSprite({ texture, width: LANE_WIDTH, height: NOTE_HEIGHT });
        tile.tileScale.set(LANE_WIDTH / texture.width);
        sprite = tile;
      } else {
        sprite = new NineSliceSprite({ texture, leftWidth: 4, rightWidth: 4, topHeight: 4, bottomHeight: 4 });
      }
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

  private getOrCreateStartCapSprite(index: number, texKey: string, texture?: Texture): Sprite {
    let pool = this.startCapSpritePool.get(index);
    if (!pool) {
      pool = new Map();
      this.startCapSpritePool.set(index, pool);
    }
    let sprite = pool.get(texKey);
    if (!sprite) {
      sprite = new Sprite(texture ?? this.skinManager.getHalfCapTexture(texKey));
      pool.set(texKey, sprite);
    }
    return sprite;
  }

  private addGraceGlow(index: number, layer: Container, x: number, y: number, width: number, kind: 'point' | 'terminal'): void {
    const key = kind === 'point' ? 'pointGraceOverlay' : 'terminalGraceOverlay';
    if (this.skinManager.hasTexture(key)) {
      let overlay = this.graceOverlayPool.get(index);
      if (!overlay) {
        overlay = new Sprite(this.skinManager.getTexture(key));
        this.graceOverlayPool.set(index, overlay);
      }
      const pad = this.skinManager.getTheme().graceOverlayPaddingPx ?? 0;
      overlay.x = x - pad;
      overlay.y = y - pad;
      overlay.width = width + pad * 2;
      overlay.height = NOTE_HEIGHT + pad * 2;
      layer.addChild(overlay);
      return;
    }
    const glow = this.getOrCreateGraceGlow(index);
    glow.x = x - COLORS.GRACE_GLOW_PAD;
    glow.y = y - COLORS.GRACE_GLOW_PAD;
    layer.addChild(glow);
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
    this.graceOverlayPool.clear();
    this.pointShadowPool.clear();
    this.trillPointShadowPool.clear();
    this.trillPointShadowGeometry?.destroy();
    this.trillPointShadowGeometry = null;
    this.failedBodies.clear();
    this.completedNotes.clear();
    this.doublePartialNotes.clear();
    this.missedNotes.clear();
    this.partialFailedBodies.clear();
  }
}
