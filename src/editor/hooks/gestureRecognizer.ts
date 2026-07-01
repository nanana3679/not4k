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
  isTouchNavigationGesture,
  type TouchGesturePoint,
  type TouchNavigationSession,
} from './touchGesture';

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
 * 차트를 편집하는 제스처. 슬라이스 1a에서는 "진행 중 편집을 폐기하라"는 `editCancel`만 존재한다
 * (두 손가락 내비가 편집을 가로챌 때). tap/longPress/drag/box는 후속 슬라이스에서 추가된다.
 */
export type EditGesture = { kind: 'editCancel' };

export type Gesture = EditGesture | ViewportGesture;

export class GestureRecognizer {
  private activePoints = new Map<number, TouchGesturePoint>();
  private navSession: TouchNavigationSession | null = null;

  /** 현재 화면에 닿아 있는 터치 포인트 수. */
  get activeTouchCount(): number {
    return this.activePoints.size;
  }

  /** 두 손가락 내비게이션 세션이 진행 중인지. */
  get isNavigating(): boolean {
    return this.navSession !== null;
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

  /** 시간 기반 제스처(롱프레스) 발화용. 슬라이스 1c에서 채워진다. */
  tick(_nowMs: number): Gesture[] {
    return [];
  }

  private onTouchDown(sample: PointerSample): Gesture[] {
    this.activePoints.set(sample.pointerId, { clientX: sample.clientX, clientY: sample.clientY });
    if (!isTouchNavigationGesture(this.activePoints.size)) return [];

    // 두 손가락 이상 → 내비게이션이 편집을 가로챈다. 진행 중이던 편집 후보를 폐기하라고 알린다.
    const session = beginTouchNavigationSession([...this.activePoints.values()]);
    if (session) this.navSession = session;
    return [{ kind: 'editCancel' }];
  }

  private onTouchMove(sample: PointerSample): Gesture[] {
    if (this.activePoints.has(sample.pointerId)) {
      this.activePoints.set(sample.pointerId, { clientX: sample.clientX, clientY: sample.clientY });
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
    if (this.activePoints.size < 2) {
      this.navSession = null;
    }
    return [];
  }
}
