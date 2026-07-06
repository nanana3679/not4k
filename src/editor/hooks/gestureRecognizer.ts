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
 * - `holdEnd`: hold 후보를 가진 단일 터치가 떨어질(up/cancel) 때, 그 결말(`fired`·`moved`)과
 *   down 좌표(`x`·`y`)를 실어 방출한다. 어댑터는 이 입력층 사실만으로 커밋/취소/탭을 판정한다
 *   (범위·스냅 같은 도메인은 여전히 어댑터가 합친다 — 인식기는 도메인을 모른다). 발화·이동이
 *   없었으면 탭, 이동만 했으면 스크롤성, 발화했으면 드래그 결말로 어댑터가 해석한다. down 좌표는
 *   탭 폴백(범위 엔티티를 탭하면 점노트 생성)이 시작 지점을 그대로 쓰도록 실어 보낸다.
 */
export type EditGesture =
  | { kind: 'editCancel' }
  | { kind: 'longPress'; x: number; y: number }
  | { kind: 'holdEnd'; pointerId: number; x: number; y: number; fired: boolean; moved: boolean };

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
        /** LONG_PRESS_MS 유지로 longPress가 발화했는지. */
        fired: boolean;
        /** tap-slop을 넘게 움직였는지(발화 봉인). up까지 존속시켜 holdEnd에 실어 보낸다. */
        moved: boolean;
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

  /**
   * 진행 중인 hold의 결말 상태(fired·moved)를 조회한다. 해당 pointer의 hold가 없으면 null.
   * move 중 어댑터가 "발화한 드래그가 진행 중인가/이동으로 봉인됐나"를 읽는 데 쓴다(holdEnd는 up 전용).
   */
  holdState(pointerId: number): { fired: boolean; moved: boolean } | null {
    if (!this.hold || this.hold.pointerId !== pointerId) return null;
    return { fired: this.hold.fired, moved: this.hold.moved };
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
      !hold.moved &&
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
      moved: false,
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
      // 발화만 봉인하고 hold는 up까지 존속시킨다 — moved 사실을 holdEnd에 실어 보내
      // 어댑터가 "이동(스크롤성) vs 무이동(탭)"을 구분할 수 있게 한다.
      hold.moved = true;
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
    const gestures: Gesture[] = [];
    // hold를 가진 그 손가락이 떨어지면 결말(fired·moved)을 holdEnd로 방출한다.
    // (두 손가락 내비로 이미 취소된 hold는 null이므로 방출하지 않는다 — editCancel이 그 신호였다.)
    if (this.hold?.pointerId === sample.pointerId) {
      gestures.push({
        kind: 'holdEnd',
        pointerId: sample.pointerId,
        x: this.hold.x,
        y: this.hold.y,
        fired: this.hold.fired,
        moved: this.hold.moved,
      });
      this.hold = null;
    }
    if (this.activePoints.size < 2) {
      this.navSession = null;
    }
    return gestures;
  }
}
