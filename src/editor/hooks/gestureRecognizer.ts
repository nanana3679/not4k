/**
 * GestureRecognizer — raw pointer 샘플을 편집/뷰포트 제스처로 인식하는 순수 상태머신.
 *
 * 도메인(히트테스트/스냅)을 전혀 모른다(형태 A: 입력층/도메인층 2층 분리). 시간은
 * `sample.timeMs`와 `tick(nowMs)`로만 주입받는다(Time-A) — `Date.now()`/`setTimeout`을
 * 쓰지 않아 `(샘플들 + tick들)`에 대한 순수 reducer로서 시퀀스 단위로 테스트 가능하다.
 *
 * 슬라이스 1a: 터치 포인트 추적 + 두 손가락 내비게이션(pinch/pan) 인식만 담는다.
 * 편집 제스처(tap/longPress/drag/box)와 롱프레스 타이머는 후속 슬라이스(1c)에서 이 모듈로
 * 이관된다 — 그때 `tick`이 채워지고 `EditGesture`가 확장된다.
 */
import {
  advanceTouchNavigationSession,
  beginTouchNavigationSession,
  didTouchMoveBeyondTapSlop,
  isTouchNavigationGesture,
  TOUCH_MOVE_CANCEL_PX,
  type TouchGesturePoint,
  type TouchNavigationSession,
} from './touchGesture';

/** 롱프레스 발화까지의 유지 시간(ms). useCanvasEvents의 LONG_PRESS_MS와 동일해야 한다. */
const LONG_PRESS_MS = 450;

/** 정규화된 포인터 입력 한 건. 어댑터(훅)가 DOM PointerEvent에서 만들어 넣는다. */
export interface PointerSample {
  pointerId: number;
  pointerType: 'mouse' | 'touch' | 'pen';
  phase: 'down' | 'move' | 'up' | 'cancel';
  /** 타임라인 공간 x — 방출되는 편집 제스처에 실려 모드로 전달된다(인식기는 운반만, 해석 안 함). */
  x: number;
  /** 캔버스 공간 y. */
  y: number;
  /** raw client 좌표 — tap-slop·멀티터치 거리/중심 계산용(내비는 이 좌표만 쓴다). */
  clientX: number;
  clientY: number;
  /** 주입된 시각(ms). 벽시계 대신 이 값으로 롱프레스 등을 판정한다. */
  timeMs: number;
  /** e.button (0=주버튼, 2=보조버튼). */
  button: number;
  /** e.buttons 비트마스크. */
  buttons: number;
}

/** 뷰포트를 움직이는 제스처(차트를 건드리지 않음). zoom/가로/세로는 서로 배타적으로 잠긴다. */
export type ViewportGesture =
  | { kind: 'viewportScroll'; axis: 'horizontal'; deltaX: number }
  | { kind: 'viewportScroll'; axis: 'vertical'; deltaY: number }
  | {
      kind: 'viewportZoom';
      previousDistance: number;
      currentDistance: number;
      /** 두 손가락 중심의 raw clientY. 어댑터가 `- rect.top`으로 캔버스 좌표화한다. */
      centerClientY: number;
    };

/**
 * 차트를 편집하는 의미를 갖는 제스처.
 * - `editCancel`: 두 손가락 내비가 편집을 가로챌 때 진행 중 편집을 폐기하라는 신호.
 * - `longPress`: 단일 터치를 tap-slop 안에서 LONG_PRESS_MS 유지했을 때(좌표는 down 시점 위치).
 *   무엇을 뜻하는지(이동/리사이즈/범위생성/삭제)는 모드·히트테스트를 아는 어댑터가 정한다.
 * tap/drag/box 트랜잭션은 후속 슬라이스에서 추가된다.
 */
export type EditGesture =
  | { kind: 'editCancel' }
  | { kind: 'longPress'; x: number; y: number };

export type Gesture = EditGesture | ViewportGesture;

export class GestureRecognizer {
  private activePoints = new Map<number, TouchGesturePoint>();
  private navSession: TouchNavigationSession | null = null;
  /** 진행 중인 롱프레스 후보(단일 터치). down 좌표와 시작 시각을 기억한다. */
  private hold:
    | {
        pointerId: number;
        x: number;
        y: number;
        startClientX: number;
        startClientY: number;
        downTimeMs: number;
        fired: boolean;
      }
    | null = null;

  /** 현재 화면에 닿아 있는 터치 포인트 수. */
  get activeTouchCount(): number {
    return this.activePoints.size;
  }

  /** 두 손가락 내비게이션 세션이 진행 중인지. */
  get isNavigating(): boolean {
    return this.navSession !== null;
  }

  /** 특정 포인터가 현재 닿아 있는지(터치 후보 타이머의 단일 터치 확인용). */
  hasTouch(pointerId: number): boolean {
    return this.activePoints.has(pointerId);
  }

  /** 내비게이션 세션을 강제 종료한다(pointercancel 등 전면 teardown용). 터치 포인트는 건드리지 않는다. */
  clearNavigation(): void {
    this.navSession = null;
  }

  /** 포인터 샘플 하나를 먹여 방출되는 제스처들을 받는다(없으면 빈 배열). */
  feed(sample: PointerSample): Gesture[] {
    // 슬라이스 1a는 터치 내비게이션만 인식한다. 마우스/펜은 아직 어댑터가 직접 처리한다.
    if (sample.pointerType !== 'touch') return [];

    switch (sample.phase) {
      case 'down':
        return this.onTouchDown(sample);
      case 'move':
        return this.onTouchMove(sample);
      case 'up':
      case 'cancel':
        return this.onTouchEnd(sample);
      default:
        return [];
    }
  }

  /**
   * 주입된 시각으로 시간 기반 제스처(롱프레스)를 발화한다. 어댑터가 down 이후 적절한 시점에 부른다.
   * 단일 터치가 tap-slop 안에서 LONG_PRESS_MS 이상 유지되면 longPress를 한 번 방출한다.
   */
  tick(nowMs: number): Gesture[] {
    const hold = this.hold;
    if (
      hold &&
      !hold.fired &&
      this.activePoints.size === 1 &&
      this.activePoints.has(hold.pointerId) &&
      nowMs - hold.downTimeMs >= LONG_PRESS_MS
    ) {
      hold.fired = true;
      return [{ kind: 'longPress', x: hold.x, y: hold.y }];
    }
    return [];
  }

  private onTouchDown(sample: PointerSample): Gesture[] {
    this.activePoints.set(sample.pointerId, { clientX: sample.clientX, clientY: sample.clientY });

    if (isTouchNavigationGesture(this.activePoints.size)) {
      // 두 손가락 이상 → 내비게이션이 편집을 가로챈다. 롱프레스 후보를 버리고 편집 폐기를 알린다.
      this.hold = null;
      const session = beginTouchNavigationSession([...this.activePoints.values()]);
      if (session) this.navSession = session;
      return [{ kind: 'editCancel' }];
    }

    // 단일 터치 → 롱프레스 후보를 무장한다(down 좌표·시각 기억). 실제 의미는 어댑터가 정한다.
    this.hold = {
      pointerId: sample.pointerId,
      x: sample.x,
      y: sample.y,
      startClientX: sample.clientX,
      startClientY: sample.clientY,
      downTimeMs: sample.timeMs,
      fired: false,
    };
    return [];
  }

  private onTouchMove(sample: PointerSample): Gesture[] {
    // legacy updateTouchPoint와 동일하게 무조건 add-or-update 한다.
    this.activePoints.set(sample.pointerId, { clientX: sample.clientX, clientY: sample.clientY });

    // tap-slop을 넘어가면 롱프레스 후보를 취소한다(발화 전에만).
    const hold = this.hold;
    if (
      hold &&
      !hold.fired &&
      hold.pointerId === sample.pointerId &&
      didTouchMoveBeyondTapSlop({
        startClientX: hold.startClientX,
        startClientY: hold.startClientY,
        clientX: sample.clientX,
        clientY: sample.clientY,
        tapSlopPx: TOUCH_MOVE_CANCEL_PX,
      })
    ) {
      this.hold = null;
    }

    const points = [...this.activePoints.values()];
    if (!isTouchNavigationGesture(points.length)) return [];

    const session = this.navSession ?? beginTouchNavigationSession(points);
    if (!session) return [];

    const update = advanceTouchNavigationSession(session, points);
    if (!update) return [];
    this.navSession = update.session;

    if (update.mode === 'horizontalScroll' && update.deltaX !== undefined) {
      return [{ kind: 'viewportScroll', axis: 'horizontal', deltaX: update.deltaX }];
    }
    if (update.mode === 'verticalScroll' && update.deltaY !== undefined) {
      return [{ kind: 'viewportScroll', axis: 'vertical', deltaY: update.deltaY }];
    }
    if (
      update.mode === 'resize' &&
      update.previousDistance !== undefined &&
      update.currentDistance !== undefined
    ) {
      return [{
        kind: 'viewportZoom',
        previousDistance: update.previousDistance,
        currentDistance: update.currentDistance,
        centerClientY: update.center.clientY,
      }];
    }
    return [];
  }

  private onTouchEnd(sample: PointerSample): Gesture[] {
    this.activePoints.delete(sample.pointerId);
    if (this.hold?.pointerId === sample.pointerId) {
      this.hold = null;
    }
    if (this.activePoints.size < 2) {
      this.navSession = null;
    }
    return [];
  }
}
