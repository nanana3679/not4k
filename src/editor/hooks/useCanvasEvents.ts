/**
 * useCanvasEvents — 캔버스 포인터 이벤트 핸들러들
 */

import { useCallback, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { PlaybackController } from '../playback/PlaybackController';
import type { CreateMode, SelectMode, EntityType, EditResult } from '../modes';
import { DeleteMode, isEventEntityType, activeEditorMode } from '../modes';
import { MEASURE_LABEL_WIDTH, TIMELINE_WIDTH } from '../timeline/constants';
import { isPlaybackCursorSeekArea } from '../timeline/timelineViewport';
import { noteExistsAtSnap } from '../timeline/hitTest';
import { beatToMs, fromAuxIndex } from '../../shared';
import { useEditorStore } from '../stores';
import { EraseGesture } from '../editing/EraseGesture';
import {
  deleteEmptyTrillZoneAtIndex,
} from '../editing/editApplication';
import type { TimelineSpace } from '../timeline/TimelineSpace';
import {
  TOUCH_MOVE_CANCEL_PX,
  didTouchMoveBeyondClickSlop,
  shouldPromoteClickToggleToBox,
  shouldRunTouchBoxSelectDrag,
} from './touchGesture';
import { GestureRecognizer, type Gesture, type PointerSample } from './gestureRecognizer';
import {
  nextTouchMultiSelectLatch,
  resolveHoldFireAction,
  resolveTouchCreateUpAction,
  scheduleFromGrabTarget,
  shouldArmHoldTimer,
  shouldDeleteOnUp,
  shouldFireClickToggle,
  type EditorTouchMode,
  type HoldHits,
} from './touchEditRouting';
import { resolveContextMenuDelete } from './contextMenuRouting';
import { PAUSE_TO_EDIT_COPY } from '../editorCopy';

export interface CanvasEventHandlers {
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerLeave: () => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  rightPressPendingRef: RefObject<boolean>;
}

const LONG_PRESS_MS = 450;

// React 포인터 핸들러와 native lostpointercapture가 같은 취소 경로를 사용한다.
type CanvasPointerInput = Pick<PointerEvent, 'pointerId' | 'pointerType' | 'clientX' | 'clientY' | 'button' | 'buttons'>;

// 노트·엑스트라 클릭 토글은 up에서 동일 처리되므로 후보는 한 형태다(kind 구분 불필요).
type TouchClickToggleCandidate = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  startClientX: number;
  startClientY: number;
};

type TouchEmptySelectCandidate = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  startClientX: number;
  startClientY: number;
};

function getLongPressRangeType(type: EntityType): "long" | "doubleLong" | null {
  if (type === "single") return "long";
  if (type === "double") return "doubleLong";
  return null;
}

/** 재생 중이라 차트 편집이 잠겼는가(RFD 0099). 이벤트가 온 순간의 store 값을 읽는다. */
const isEditLockedByPlayback = () => useEditorStore.getState().isPlaying;

export function useCanvasEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rendererRef: RefObject<TimelineRenderer | null>,
  playbackRef: RefObject<PlaybackController | null>,
  createModeRef: RefObject<CreateMode | null>,
  selectModeRef: RefObject<SelectMode | null>,
  deleteModeRef: RefObject<DeleteMode | null>,
  isDraggingCursorRef: RefObject<boolean>,
  space: TimelineSpace,
  isTimeInBounds: (y: number) => boolean,
  onPinchZoom?: (previousDistance: number, currentDistance: number, centerCanvasY: number) => void,
  onHorizontalPan?: (deltaX: number) => void,
  onVerticalPan?: (deltaY: number) => void,
  onNavigationInteraction?: () => void,
): CanvasEventHandlers {
  const mode = useEditorStore((s) => s.mode);
  const entityType = useEditorStore((s) => s.entityType);
  const setChart = useEditorStore((s) => s.setChart);
  const setEditingEvent = useEditorStore((s) => s.setEditingEvent);
  const addToast = useEditorStore((s) => s.addToast);

  const rightPressPendingRef = useRef(false);
  const eraseGestureRef = useRef(new EraseGesture({
    getChart: () => useEditorStore.getState().chart,
    getSelectedNotes: () => useEditorStore.getState().selection.notes,
    onChartUpdate: (chart, transaction) => useEditorStore.getState().setChart(chart, { transaction }),
    beginTransaction: onInterrupt => useEditorStore.getState().beginEditTransaction("erase", onInterrupt),
    commitTransaction: token => useEditorStore.getState().commitEditTransaction(token),
    cancelTransaction: token => useEditorStore.getState().cancelEditTransaction(token),
    onWarn: message => useEditorStore.getState().addToast(message),
  }));
  const recognizerRef = useRef(new GestureRecognizer());
  // 재생을 겪은 누름은 정지해도 up/cancel까지 편집 자격을 되찾지 않는다. 내비게이션 추적은 유지한다.
  const activePointerIdsRef = useRef(new Set<number>());
  const playbackLockedPointerIdsRef = useRef(new Set<number>());
  // 재생 중 누른 터치의 안내는 뗄 때로 미룬다. 두 번째 손가락이 닿으면 탐색이라 편집 시도가 아니다.
  const deferredPauseToastPointerIdsRef = useRef(new Set<number>());
  // 롱프레스 hold 생명주기(arm/moved/발화/결말)는 recognizer가 소유한다.
  // 훅은 advanceTo를 ~450ms 시점에 한 번 poke하는 타이머만 붙든다(Time-A 스케줄러).
  const holdTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const touchEmptySelectCandidateRef = useRef<TouchEmptySelectCandidate | null>(null);
  const touchMultiSelectRef = useRef(false);
  const touchClickToggleRef = useRef<TouchClickToggleCandidate | null>(null);
  const suppressContextMenuUntilRef = useRef(0);
  // 한 손가락 터치 누름과 그 시작 때 SelectMode가 센 끊긴 드래그 수. 누르는 동안 수가 늘면
  // Undo·모드 전환 같은 독립 명령이 이 누름의 드래그를 끊은 것이다(onInterrupt).
  const touchContactRef = useRef<{ pointerId: number; interruptedDragCount: number } | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const startTouchEmptySelectCandidate = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    x: number,
    y: number,
  ) => {
    touchEmptySelectCandidateRef.current = {
      pointerId: e.pointerId,
      x,
      y,
      moved: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  }, []);

  const clearTouchEmptySelectCandidate = useCallback(() => {
    touchEmptySelectCandidateRef.current = null;
  }, []);

  // 끊긴 누름은 손을 뗄 때까지 남은 후보(지연 박스·클릭 토글·롱프레스)로 새 편집을 다시 열지 않는다.
  const isTouchContactInterrupted = useCallback((pointerId: number) => {
    const contact = touchContactRef.current;
    return contact !== null && contact.pointerId === pointerId
      && (selectModeRef.current?.interruptedDragCount ?? 0) !== contact.interruptedDragCount;
  }, [selectModeRef]);

  // Delete 모드 터치 삭제. 노트가 없으면 빈 trillZone·restZone을 같은 transaction에서 지운다.
  const deleteAtPoint = useCallback((x: number, y: number) => {
    if (eraseGestureRef.current.isActive) {
      const lane = space.xToUnifiedLane(x);
      if (lane !== null) {
        const beat = space.yToBeatRaw(y);
        eraseGestureRef.current.eraseNoteOrZoneAt(lane, beat.n / beat.d);
      }
    } else deleteModeRef.current?.onPointerDown(x, y);
  }, [deleteModeRef, space]);

  // 터치 down에서 롱프레스 hold 타이머를 무장한다. arm 여부는 (mode, rangeType, 히트)로 결정한다.
  // 발화(~450ms)하면 recognizer.advanceTo를 poke해 longPress를 확인하고, 발화 좌표를 다시 히트테스트해
  // 액션(범위 생성/선택 드래그/삭제)을 재도출한다 — 후보 payload를 훅에 두지 않아 form A를 지킨다.
  // mode·entityType은 arm 시점 값을 클로저로 고정한다(수동 hold 동안 불변).
  const armHoldTimer = useCallback((
    x: number,
    y: number,
    hits: HoldHits,
    mode: EditorTouchMode,
    entityType: EntityType,
  ) => {
    const rangeType = getLongPressRangeType(entityType);
    const placementBlocked = mode === 'create'
      ? (createModeRef.current?.isPlacementBlocked(x, y) ?? false)
      : false;
    if (!shouldArmHoldTimer({ mode, rangeType, placementBlocked, hits })) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      const fired = recognizerRef.current
        .advanceTo(performance.now())
        .find((g): g is Extract<Gesture, { kind: 'longPress' }> => g.kind === 'longPress');
      if (!fired) return;
      // 재생 중이면(누른 뒤 재생이 시작된 경우 포함) 범위 생성·선택 드래그·드래그 삭제를 시작하지 않고 한 번 안내한다(RFD 0099).
      // 이 누름에 남은 선택 후보(지연 박스·클릭 토글)는 재생 중 이동·뗌이 버린다.
      if (isEditLockedByPlayback()) {
        suppressContextMenuUntilRef.current = Date.now() + 1200;
        addToast(PAUSE_TO_EDIT_COPY, 'warn');
        return;
      }
      const { x: fx, y: fy } = fired;
      const fireHits: HoldHits = {
        noteHit: space.hitTestUnifiedNote(fx, fy),
        noteEndHit: space.hitTestNoteEnd(fx, fy),
        extraHit: space.hitTestExtraNote(fx, fy),
        zoneHit: space.hitTestTrillZone(fx, fy),
        eventHit: space.hitTestEvent(fx, fy),
        eventEndHit: space.hitTestEventEnd(fx, fy),
      };
      const firePlacementBlocked = mode === 'create'
        ? (createModeRef.current?.isPlacementBlocked(fx, fy) ?? false)
        : false;
      const action = resolveHoldFireAction({ mode, rangeType, placementBlocked: firePlacementBlocked, hits: fireHits });
      if (action === 'none') return;
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      if (action === 'delete') {
        eraseGestureRef.current.begin();
        deleteAtPoint(fx, fy);
      } else if (action === 'createRange' && rangeType) {
        createModeRef.current?.beginTapToolDragAt(fx, fy, entityType === "double" ? "double" : "single");
        rendererRef.current?.hideGhostNote();
      } else if (action === 'selectDrag') {
        touchMultiSelectRef.current = true;
        useEditorStore.getState().setMode('select');
        selectModeRef.current?.beginLongPressDrag(fx, fy, {
          noteEndHit: fireHits.noteEndHit,
          noteHit: fireHits.noteHit,
          zoneHit: fireHits.zoneHit,
          eventHit: fireHits.eventHit,
          eventEndHit: fireHits.eventEndHit,
        });
        rendererRef.current?.hideGhostNote();
      }
    }, LONG_PRESS_MS);
  }, [
    clearHoldTimer, deleteAtPoint, createModeRef, selectModeRef, rendererRef, space, addToast,
  ]);

  const toSample = useCallback((
    e: CanvasPointerInput,
    phase: PointerSample['phase'],
  ): PointerSample => {
    // x/y는 편집 제스처(longPress/holdEnd)에 실려 모드로 전달되는 타임라인/캔버스 좌표다.
    // 발화 시 이 좌표로 히트테스트·생성·이동을 하므로 반드시 down 핸들러와 같은 변환이어야 한다.
    // (내비게이션은 clientX/clientY만 쓰므로 x/y 변경에 영향받지 않는다.)
    const rect = canvasRef.current?.getBoundingClientRect();
    const rawX = e.clientX - (rect?.left ?? 0);
    const canvasY = e.clientY - (rect?.top ?? 0);
    const timelineX = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    return {
      pointerId: e.pointerId,
      pointerType: e.pointerType as PointerSample['pointerType'],
      phase,
      x: timelineX,
      y: canvasY,
      clientX: e.clientX,
      clientY: e.clientY,
      // advanceTo(performance.now())와 반드시 같은 시계여야 경과 계산이 맞다(Time-A).
      timeMs: performance.now(),
      button: e.button,
      buttons: e.buttons,
    };
  }, [canvasRef, rendererRef]);

  // 두 손가락 내비가 편집을 가로챌 때(editCancel) 진행 중이던 편집 후보를 폐기한다.
  // recognizer는 2번째 손가락 down에서 자기 hold를 이미 버렸다(editCancel 방출). 훅은 타이머와
  // 남은 후보(empty-select/click-toggle)만 정리하고, 발화했을 수 있는 create 드래그를 취소한다.
  const handleEditCancel = useCallback(() => {
    clearHoldTimer();
    eraseGestureRef.current.finish();
    touchEmptySelectCandidateRef.current = null;
    touchClickToggleRef.current = null;
    touchContactRef.current = null;
    createModeRef.current?.cancelDrag();
    // 발화했을 수 있는 select 드래그(이동/리사이즈/박스)도 폐기하고 프리뷰를 걷는다.
    const selectResult = selectModeRef.current?.cancel();
    if (selectResult?.clearDragPreview) {
      rendererRef.current?.clearMoveOrigins();
      rendererRef.current?.clearBoxSelectRect();
    }
    rendererRef.current?.hideGhostNote();
  }, [clearHoldTimer, createModeRef, selectModeRef, rendererRef]);

  useEffect(() => {
    const cancelCreate = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mode === 'create') {
        event.preventDefault();
        handleEditCancel();
      }
    };
    window.addEventListener('keydown', cancelCreate);
    return () => window.removeEventListener('keydown', cancelCreate);
  }, [mode, handleEditCancel]);

  useEffect(() => {
    const cancelErase = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !eraseGestureRef.current.isActive) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearHoldTimer();
      eraseGestureRef.current.cancel();
    };
    const finishErase = () => eraseGestureRef.current.finish();
    // blur는 삭제를 확정한다. 정지 중 이동·리사이즈·생성 드래그와 롱프레스는 그대로 이어 간다.
    // 재생을 겪은 접촉(RFD 0099)은 release를 놓치면 봉인이 풀리지 않으므로 그 접촉의 기록만 지운다.
    const finishEraseAndReleaseLockedContacts = () => {
      finishErase();
      const lockedPointerIds = playbackLockedPointerIdsRef.current;
      if (lockedPointerIds.size === 0) return;
      for (const pointerId of lockedPointerIds) {
        activePointerIdsRef.current.delete(pointerId);
        deferredPauseToastPointerIdsRef.current.delete(pointerId);
        if (recognizerRef.current.hasTouch(pointerId)) {
          recognizerRef.current.feed({
            pointerId, pointerType: 'touch', phase: 'cancel', x: 0, y: 0, clientX: 0, clientY: 0,
            timeMs: performance.now(), button: 0, buttons: 0,
          });
        }
        if (touchContactRef.current?.pointerId === pointerId) touchContactRef.current = null;
      }
      lockedPointerIds.clear();
      // 남은 접촉이 없으면 봉인된 접촉이 걸어 둔 contextmenu 대기와 레일·미니맵 드래그도 끝낸다.
      if (activePointerIdsRef.current.size > 0) return;
      rightPressPendingRef.current = false;
      suppressContextMenuUntilRef.current = 0;
      isDraggingCursorRef.current = false;
      rendererRef.current?.handleMinimapPointerUp();
    };
    window.addEventListener('keydown', cancelErase, true);
    window.addEventListener('blur', finishEraseAndReleaseLockedContacts);
    return () => {
      window.removeEventListener('keydown', cancelErase, true);
      window.removeEventListener('blur', finishEraseAndReleaseLockedContacts);
      finishErase();
    };
  }, [clearHoldTimer, isDraggingCursorRef, rendererRef]);

  // 재생 중 편집 제한(RFD 0099): 누름에 남은 편집·선택 조작을 버리고 미리보기를 걷는다.
  // 이동·리사이즈 드래그·붙여넣기 대기·우클릭 삭제는 재생기가 시작 직전에 store로 이미 취소했다
  // (cancelEditTransactionForPlaybackStart). 여기서는 편집
  // transaction이 없는 조작 — 생성 드래그, 박스 선택(시작 전 선택으로 되돌린다), 롱프레스 대기, 터치 선택 후보 — 를 버린다.
  // 재생이 시작될 때와 재생 중 캔버스 이동·뗌마다 부른다. 버릴 조작이 없으면 아무것도 바꾸지 않는다.
  const abandonInteractionForPlayback = useCallback(() => {
    for (const pointerId of activePointerIdsRef.current) {
      playbackLockedPointerIdsRef.current.add(pointerId);
    }
    clearHoldTimer();
    eraseGestureRef.current.finish();
    createModeRef.current?.cancelDrag();
    selectModeRef.current?.cancel();
    touchEmptySelectCandidateRef.current = null;
    touchClickToggleRef.current = null;
    rendererRef.current?.clearMoveOrigins();
    rendererRef.current?.clearBoxSelectRect();
    rendererRef.current?.hideGhostNote();
  }, [clearHoldTimer, createModeRef, selectModeRef, rendererRef]);

  useEffect(() => {
    if (useEditorStore.getState().isPlaying) abandonInteractionForPlayback();
    // React가 재생→정지를 한 렌더로 합쳐도 시작 순간의 접촉·미리보기는 즉시 취소한다.
    return useEditorStore.subscribe((state, previous) => {
      if (state.isPlaying && !previous.isPlaying) abandonInteractionForPlayback();
    });
  }, [abandonInteractionForPlayback]);

  const routeViewportGestures = useCallback((gestures: Gesture[], rect: DOMRect) => {
    for (const g of gestures) {
      if (g.kind === "viewportScroll" && g.axis === "horizontal") {
        onHorizontalPan?.(g.deltaX);
      } else if (g.kind === "viewportScroll" && g.axis === "vertical") {
        onVerticalPan?.(g.deltaY);
      } else if (g.kind === "viewportZoom") {
        onPinchZoom?.(g.previousDistance, g.currentDistance, g.centerClientY - rect.top);
      }
    }
  }, [onHorizontalPan, onPinchZoom, onVerticalPan]);

  // hold 후보(롱프레스/create/delete)의 click-slop·moved 추적은 recognizer.feed(move)가 소유한다.
  // 훅은 아직 recognizer로 옮기지 않은 후보(empty-select/click-toggle)의 moved만 여기서 갱신한다.
  const updateTouchMovement = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const emptySelectCandidate = touchEmptySelectCandidateRef.current;
    if (emptySelectCandidate?.pointerId === e.pointerId && !emptySelectCandidate.moved) {
      if (didTouchMoveBeyondClickSlop({
        startClientX: emptySelectCandidate.startClientX,
        startClientY: emptySelectCandidate.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        clickSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        emptySelectCandidate.moved = true;
        rendererRef.current?.hideGhostNote();
      }
    }

    const clickToggle = touchClickToggleRef.current;
    if (clickToggle?.pointerId === e.pointerId && !clickToggle.moved) {
      if (didTouchMoveBeyondClickSlop({
        startClientX: clickToggle.startClientX,
        startClientY: clickToggle.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        clickSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        clickToggle.moved = true;
      }
    }
  }, [rendererRef]);

  const hitTestEvent = useCallback((x: number, y: number) => {
    const index = space.hitTestEvent(x, y);
    return index === null ? null : { type: 'event' as const, index };
  }, [space]);

  const handlePointerCancel = useCallback((e: CanvasPointerInput) => {
    // 정상 up 뒤의 암시적 capture 해제는 이미 끝난 접촉의 후속 contextmenu 처리를 바꾸지 않는다.
    if (!activePointerIdsRef.current.delete(e.pointerId)) return;
    playbackLockedPointerIdsRef.current.delete(e.pointerId);
    deferredPauseToastPointerIdsRef.current.delete(e.pointerId);
    if (activePointerIdsRef.current.size === 0) {
      rightPressPendingRef.current = false;
      suppressContextMenuUntilRef.current = 0;
    }
    eraseGestureRef.current.finish();
    if (e.pointerType === 'touch') {
      // recognizer.feed(cancel)이 hold를 버린다(holdEnd 반환은 무시 — 취소 경로는 결말을 쓰지 않는다).
      recognizerRef.current.feed(toSample(e, 'cancel'));
      recognizerRef.current.clearNavigation();
      clearHoldTimer();
      clearTouchEmptySelectCandidate();
      touchClickToggleRef.current = null;
      if (touchContactRef.current?.pointerId === e.pointerId) touchContactRef.current = null;
    }
    rendererRef.current?.handleMinimapPointerUp();
    isDraggingCursorRef.current = false;
    rendererRef.current?.clearMoveOrigins();
    rendererRef.current?.clearBoxSelectRect();
    createModeRef.current?.cancelDrag();
    selectModeRef.current?.cancel();
  }, [clearHoldTimer, clearTouchEmptySelectCandidate, createModeRef, selectModeRef, toSample, rendererRef, isDraggingCursorRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas?.addEventListener('lostpointercapture', handlePointerCancel);
    return () => canvas?.removeEventListener('lostpointercapture', handlePointerCancel);
  }, [canvasRef, handlePointerCancel]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointerIdsRef.current.add(e.pointerId);
    deferredPauseToastPointerIdsRef.current.delete(e.pointerId);
    // 캔버스 밖에서 뗀 우클릭은 Windows에서 그 contextmenu가 뗀 자리의 다른 요소로 가 대기가 남는다.
    // 우클릭이 아닌 새 누름 시점에는 그 메뉴가 더 오지 않으므로 대기를 풀어, 뒤의 키보드 메뉴 키 삭제를 삼키지 않는다.
    if (e.button !== 2) rightPressPendingRef.current = false;
    if (isEditLockedByPlayback()) {
      playbackLockedPointerIdsRef.current.add(e.pointerId);
      // 재생 중 우클릭은 미니맵·커서 레일에서 눌러도 이 누름이 만들 contextmenu를 삭제·안내로 해석하지 않게 대기를 건다.
      // 뗌 뒤에 오는 메뉴(Windows)가 이 대기를 쓰고, 뗌 전에 온 메뉴(macOS)는 handleContextMenu가 대기를 푼다.
      if (e.button === 2) rightPressPendingRef.current = true;
    }
    // 새 down은 새 접촉이다. 이전 up/cancel이 유실돼 같은 id가 남아 있어도 봉인을 이어받지 않는다.
    else playbackLockedPointerIdsRef.current.delete(e.pointerId);
    // 캔버스 밖에서 떼어도 같은 접촉의 봉인을 해제할 수 있어야 한다(마우스 포함).
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      e.preventDefault();
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      const navGestures = recognizerRef.current.feed(toSample(e, 'down'));
      if (navGestures.some((g) => g.kind === 'editCancel')) {
        // 두 손가락 탐색이 된 접촉은 편집 시도가 아니므로 미뤄 둔 재생 중 안내를 띄우지 않는다.
        deferredPauseToastPointerIdsRef.current.clear();
        handleEditCancel();
        return;
      }
      touchContactRef.current = {
        pointerId: e.pointerId,
        interruptedDragCount: selectModeRef.current?.interruptedDragCount ?? 0,
      };
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current?.handleMinimapPointerDown(rawX, y)) {
      onNavigationInteraction?.();
      return;
    }

    const renderer = rendererRef.current;
    const x = renderer?.screenXToTimelineX(rawX) ?? rawX;
    const curTimelineWidth = rendererRef.current?.currentTimelineWidth ?? TIMELINE_WIDTH;
    if (renderer && isPlaybackCursorSeekArea({
      screenX: rawX,
      timelineX: x,
      timelineWidth: curTimelineWidth,
      leftRailWidth: MEASURE_LABEL_WIDTH,
      railStartX: renderer.contentCenterShiftX,
    })) {
      isDraggingCursorRef.current = true;
      const timeMs = renderer.clampToMeasureRange(renderer.yToTime(y));
      playbackRef.current?.seekTo(timeMs);
      return;
    }

    // 재생 중 편집 제한(RFD 0099): 미니맵·커서 레일 seek 뒤, 편집·선택을 시작하기 전에 막고 누름마다 한 번 안내한다.
    // Select 모드의 클릭·Shift/Alt 클릭·박스 선택·터치 토글도 선택을 바꾸므로 함께 막는다.
    if (isEditLockedByPlayback() || playbackLockedPointerIdsRef.current.has(e.pointerId)) {
      // 우클릭 누름의 contextmenu 대기는 위에서 미니맵·커서 레일보다 먼저 걸었다.
      // 마우스·펜은 누를 때 안내한다. 터치는 두 번째 손가락이 닿으면 탐색이 되므로 뗄 때 안내한다.
      if (e.pointerType === 'touch') deferredPauseToastPointerIdsRef.current.add(e.pointerId);
      else addToast(PAUSE_TO_EDIT_COPY, 'warn');
      return;
    }

    const touchNoteHit = e.pointerType === 'touch' ? space.hitTestUnifiedNote(x, y) : null;
    const touchNoteEndHit = e.pointerType === 'touch' ? space.hitTestNoteEnd(x, y) : null;
    const touchExtraHit = e.pointerType === 'touch' ? space.hitTestExtraNote(x, y) : null;

    if (e.button === 2) {
      // 삭제는 여기서 시작한다. 이 누름이 만들 contextmenu 한 번은 삭제하지 않는다.
      rightPressPendingRef.current = true;
      // 붙여넣기 대기처럼 다른 조작의 transaction이 열려 있으면 키보드 명령처럼 먼저 확정한다.
      // 소유 모드는 onInterrupt로 붙여넣기를 확정하고, 삭제 gesture가 새 transaction을 연다.
      const openTransaction = useEditorStore.getState().editTransaction;
      if (openTransaction && openTransaction.kind !== 'erase') useEditorStore.getState().commitEditTransaction();
      eraseGestureRef.current.begin();
      const lane = space.xToUnifiedLane(x);
      const hit = space.hitTestUnifiedNote(x, y);
      if (hit !== null && lane !== null) {
        const beat = space.yToBeatRaw(y);
        eraseGestureRef.current.erase(lane, beat.n / beat.d);
      } else {
        const current = useEditorStore.getState().chart;
        const zone = space.hitTestTrillZone(x, y);
        if (zone !== null) {
          const result = deleteEmptyTrillZoneAtIndex(current, zone);
          if (result.blockedReason) addToast(result.blockedReason);
          if (result.chart) setChart(result.chart, { transaction: eraseGestureRef.current.transaction });
        } else {
          if (lane !== null) {
            const beat = space.yToBeatRaw(y);
            eraseGestureRef.current.erase(lane, beat.n / beat.d);
          }
        }
      }
      return;
    }

    if (e.pointerType === 'touch') {
      // 롱프레스 hold(범위 생성/선택 드래그/드래그 삭제) 타이머를 무장한다.
      // arm 여부·발화 액션은 순수함수가 (mode, rangeType, 히트)로 정한다(recognizer가 hold 생명주기 소유).
      armHoldTimer(
        x,
        y,
        {
          noteHit: touchNoteHit,
          noteEndHit: touchNoteEndHit,
          extraHit: touchExtraHit,
          zoneHit: space.hitTestTrillZone(x, y),
          eventHit: space.hitTestEvent(x, y),
          eventEndHit: space.hitTestEventEnd(x, y),
        },
        mode,
        entityType as EntityType,
      );

      if (mode === 'create' && createModeRef.current) {
        // 범위 엔티티(single/double 롱프레스)는 hold가 처리 — down에서 점노트를 배치하지 않는다.
        if (getLongPressRangeType(entityType as EntityType)) return;
        // 점노트·BPM·박자는 아래 다형 디스패치로 폴스루(down 즉시 배치). 배치 제약과 초기 설정 중복 안내는
        // 마우스와 같이 CreateMode.handlePointerDown이 검사한다.
      } else if (mode === 'select' && selectModeRef.current) {
        // grab 우선순위 사다리는 SelectMode.resolveGrabAt(마우스 down과 공유)이 단독 소유한다(#143).
        // 터치는 그 GrabTarget을 2택 스케줄로 접기만 한다 — 존끝 선택게이트(RFD 0016 §6-6)를
        // 포함해 마우스와 글자 그대로 같은 사다리라, 우선순위가 두 경로로 갈라질 곳이 없다.
        const schedule = scheduleFromGrabTarget(selectModeRef.current.resolveGrabAt(x, y));
        if (schedule === 'clickToggle') {
          touchClickToggleRef.current = {
            pointerId: e.pointerId,
            x,
            y,
            moved: false,
            startClientX: e.clientX,
            startClientY: e.clientY,
          };
        } else {
          startTouchEmptySelectCandidate(e, x, y);
        }
        return;
      } else if (mode === 'delete' && deleteModeRef.current) {
        // 드래그 삭제(hold 발화)와 클릭 삭제(up)는 hold + holdEnd 경로가 처리한다.
        return;
      }
    }

    // 마우스 down(및 레인지 타입 아닌 터치 create)은 모드 다형 디스패치로 통합한다.
    activeEditorMode(mode, createModeRef.current, selectModeRef.current, deleteModeRef.current)
      ?.handlePointerDown({ x, y, shiftKey: e.shiftKey, altKey: e.altKey, toggleSelection: false });
  }, [
    mode, entityType,
    toSample, handleEditCancel, armHoldTimer, space,
    startTouchEmptySelectCandidate,
    canvasRef, createModeRef, deleteModeRef,
    isDraggingCursorRef, playbackRef, rendererRef,
    selectModeRef, onNavigationInteraction, addToast, setChart,
  ]);

  // 모드가 반환한 EditResult를 렌더러에 PUSH한다(훅이 모드 내부 getter를 PULL하던 것을 대체).
  const applyEditResult = useCallback((result?: EditResult) => {
    const renderer = rendererRef.current;
    if (!renderer || !result) return;
    const preview = result.preview;
    if (preview?.boxSelectRect) {
      renderer.setBoxSelectRect(preview.boxSelectRect);
      renderer.render();
    }
    if (preview?.moveOrigins) {
      renderer.setMoveOrigins(preview.moveOrigins);
    }
    if (result.clearDragPreview) {
      renderer.clearMoveOrigins();
      renderer.clearBoxSelectRect();
    }
    if (result.hideGhost) {
      renderer.hideGhostNote();
    }
  }, [rendererRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // up이 유실돼도 버튼 없는 마우스 이동은 이전 접촉이 끝났다는 증거다.
    if (e.pointerType === 'mouse' && e.buttons === 0) handlePointerCancel(e);
    let navGestures: Gesture[] = [];
    if (e.pointerType === 'touch') {
      e.preventDefault();
      navGestures = recognizerRef.current.feed(toSample(e, 'move'));
      updateTouchMovement(e);
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.pointerType === 'touch' && recognizerRef.current.activeTouchCount >= 2) {
      routeViewportGestures(navGestures, rect);
      return;
    }

    if (e.pointerType === 'touch' && isTouchContactInterrupted(e.pointerId)) {
      clearHoldTimer();
      touchEmptySelectCandidateRef.current = null;
      touchClickToggleRef.current = null;
      return;
    }

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current?.handleMinimapPointerMove(rawX, y)) {
      onNavigationInteraction?.();
      return;
    }

    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;

    // 재생 중(RFD 0099)에는 이 누름에 남은 편집·선택 조작을 버리고, hover 표시와 커서 레일 seek 드래그만 이어 간다.
    if (isEditLockedByPlayback()) abandonInteractionForPlayback();
    const editLocked = isEditLockedByPlayback() || playbackLockedPointerIdsRef.current.has(e.pointerId);

    // hold 생명주기는 recognizer가 소유 — 이 pointer의 발화/이동 상태를 조회해 연속 처리를 가른다.
    const holdState = e.pointerType === 'touch'
      ? recognizerRef.current.holdState(e.pointerId)
      : null;

    // 드래그 삭제: 발화한 delete hold는 이동마다 히트 지점을 삭제한다. 재생 중에는 발화해도 지우지 않는다.
    if (mode === 'delete' && holdState?.fired) {
      if (!editLocked) deleteAtPoint(x, y);
      return;
    }

    // create 범위 후보가 발화 전 click-slop을 넘으면(스크롤성) 고스트를 숨기고 만다.
    // (범위 엔티티일 때만 — 점노트 모드에서 노트를 롱프레스한 hold는 select-drag 의도라 여기서 걸지 않는다.)
    if (
      mode === 'create' &&
      getLongPressRangeType(entityType as EntityType) &&
      holdState &&
      holdState.moved &&
      !holdState.fired
    ) {
      rendererRef.current?.hideGhostNote();
      return;
    }

    // 노트/엑스트라 위에서 시작한 clickToggle 후보도 slop을 넘으면 박스로 승격한다 (RFD 0016 §4.4).
    // 승격은 후보를 empty-select 후보로 전환해 기존 박스 재생·up 경로를 그대로 태운다
    // (beginBoxSelect가 드래그를 시작하므로 재생 onPointerDown은 idempotency 가드에 걸려 no-op).
    const clickCand = touchClickToggleRef.current;
    if (
      clickCand &&
      shouldPromoteClickToggleToBox({
        pointerType: e.pointerType,
        editorMode: mode,
        candidatePointerId: clickCand.pointerId,
        pointerId: e.pointerId,
        moved: clickCand.moved,
        activeTouchCount: recognizerRef.current.activeTouchCount,
        holdFired: holdState?.fired ?? false,
      }) &&
      selectModeRef.current
    ) {
      selectModeRef.current.beginBoxSelect(clickCand.x, clickCand.y);
      touchEmptySelectCandidateRef.current = {
        pointerId: clickCand.pointerId,
        x: clickCand.x,
        y: clickCand.y,
        moved: true,
        startClientX: clickCand.startClientX,
        startClientY: clickCand.startClientY,
      };
      touchClickToggleRef.current = null;
    }

    const emptySelectCandidate = touchEmptySelectCandidateRef.current;
    if (
      emptySelectCandidate &&
      shouldRunTouchBoxSelectDrag({
        pointerType: e.pointerType,
        editorMode: mode,
        candidatePointerId: emptySelectCandidate.pointerId,
        pointerId: e.pointerId,
        moved: emptySelectCandidate.moved,
        activeTouchCount: recognizerRef.current.activeTouchCount,
      }) &&
      selectModeRef.current
    ) {
      // 박스 시작은 SelectMode.onPointerDown이 idempotent하게 처리한다(진행 중이면 no-op).
      selectModeRef.current.onPointerDown(
        emptySelectCandidate.x,
        emptySelectCandidate.y,
        false,
        false,
      );
      const boxResult = selectModeRef.current.onPointerMove(x, y);
      applyEditResult(boxResult);
      return;
    }

    // hover 히트는 통합 히트테스트 하나 — 메인·보조 모두 chart.notes 통합 인덱스라
    // 파티션 전제 산술(mainCount + auxIdx)이 필요 없다 (RFD 0018 ④d).
    const hoverNoteHit = space.hitTestUnifiedNote(x, y);
    // trillZone hover는 select 모드에서만. 드래그(리사이즈/구간 이동) 중이면 SelectMode가
    // 그 구간을 래치해 커서가 밖으로 나가도 계속 표시한다(래치 결정을 모드가 소유 = PUSH).
    const hoveredTrillZone = mode === 'select'
      ? selectModeRef.current?.computeHoveredTrillZone(x, y) ?? null
      : null;
    // restZone hover도 select 모드에서만 — 리사이즈 캡은 선택된 restZone에만 표시된다 (RFD 0019)
    const hoveredRestZone = mode === 'select'
      ? selectModeRef.current?.computeHoveredRestZone(x, y) ?? null
      : null;
    if (rendererRef.current) {
      rendererRef.current.setHoveredNote(hoverNoteHit);
      rendererRef.current.setHoveredTrillZone(hoveredTrillZone);
      rendererRef.current.setHoveredRestZone(hoveredRestZone);
      // 롱노트 리사이즈 캡은 select 모드에서 노트에 hover했을 때만 표시한다. 끝을 점수 노트가
      // 덮은 바디는 노트 hit 밖의 끝 핸들 띠에 hover해도 캡을 보여 준다.
      rendererRef.current.setResizeHoverNote(mode === 'select' ? (hoverNoteHit ?? space.hitTestNoteEnd(x, y)) : null);
    }

    // 트릴존 위 커서: 리사이즈 캡(끝)=ns-resize(↕), 선택된 존 몸통=move(선택 후 드래그=이동,
    // RFD 0016 §6-6 — 제거된 이동 필 커서를 대체). select 모드에서만.
    const canvasEl = canvasRef.current;
    if (canvasEl) {
      let cursor = '';
      if (mode === 'select') {
        const eventHit = space.hitTestEvent(x, y);
        if (eventHit !== null && selectModeRef.current?.selectedEvents.has(eventHit)) cursor = space.hitTestEventEnd(x, y) === eventHit ? 'ns-resize' : 'move';
        const zoneBody = space.hitTestTrillZone(x, y);
        const zoneEnd = space.hitTestTrillZoneEnd(x, y);
        // 끝 리사이즈 커서·move 커서 모두 그 구간이 **선택됐을 때만** — 미선택 구간의 끝 노트
        // 클릭을 가로채지 않도록(RFD 0016 §6-6). 리사이즈 캡 렌더·down hit도 동일 게이트.
        // restZone도 같은 게이트(선택된 것만) — trillZone이 위 레이어라 트릴 히트가 우선한다 (RFD 0019).
        const restBody = space.hitTestRestZone(x, y);
        const restEnd = space.hitTestRestZoneEnd(x, y);
        if (cursor) { /* 이벤트 선택 커서가 우선한다. */ } else if (zoneEnd !== null && (selectModeRef.current?.selectedZones.has(zoneEnd) ?? false)) {
          cursor = 'ns-resize';
        } else if (zoneBody !== null && (selectModeRef.current?.selectedZones.has(zoneBody) ?? false)) {
          cursor = 'move';
        } else if (restEnd !== null && (selectModeRef.current?.selectedRestZones.has(restEnd) ?? false)) {
          cursor = 'ns-resize';
        } else if (restBody !== null && (selectModeRef.current?.selectedRestZones.has(restBody) ?? false)) {
          cursor = 'move';
        } else {
          // 롱노트 끝 캡 위: down이 실제로 끝 리사이즈를 잡는 자리에서만 리사이즈 커서를 쓴다.
          if (selectModeRef.current?.resolveGrabAt(x, y).kind === 'noteEndCap') cursor = 'ns-resize';
        }
      }
      if (canvasEl.style.cursor !== cursor) canvasEl.style.cursor = cursor;
    }
    const isHoveringEntity = hoverNoteHit !== null;

    if (isDraggingCursorRef.current && rendererRef.current) {
      const timeMs = rendererRef.current.clampToMeasureRange(rendererRef.current.yToTime(y));
      playbackRef.current?.seekTo(timeMs);
      return;
    }

    if (editLocked) return;

    // 선택 드래그: 발화한 select hold(롱프레스 이동/리사이즈)는 이동을 모드로 흘려보낸다.
    if (mode === 'select' && holdState?.fired && selectModeRef.current) {
      const longPressResult = selectModeRef.current.onPointerMove(x, y);
      applyEditResult(longPressResult);
      return;
    }

    // 우클릭 드래그 삭제 — 메인·보조 모두 통합 lane으로 chart.notes에서 제자리 삭제 (RFD 0018 ④d)
    if (e.buttons & 2) {
      const lane = space.xToUnifiedLane(x);
      if (lane !== null) {
        const beat = space.yToBeatRaw(y);
        eraseGestureRef.current.erase(lane, beat.n / beat.d);
      }
      return;
    }

    if (mode === 'create' && createModeRef.current) {
      if (!isTimeInBounds(y) || isHoveringEntity) {
        rendererRef.current?.hideGhostNote();
        return;
      }

      createModeRef.current.onPointerMove(x, y);

      if (rendererRef.current) {
        const beat = space.yToBeat(y);
        const bpmChanges = space.getBpmChanges();
        const snapped = space.snapBeat(beat);
        const timeMs = beatToMs(snapped, bpmChanges, useEditorStore.getState().chart.meta.offsetMs);

        if (createModeRef.current?.dragging && createModeRef.current.dragBeat) {
          if (createModeRef.current.dragType === 'event') {
            rendererRef.current.showGhostEvent(createModeRef.current.dragExtraLane ?? 1, timeMs);
          } else if (createModeRef.current.dragType === 'extraRangeNote' && createModeRef.current.dragExtraLane) {
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, bpmChanges, useEditorStore.getState().chart.meta.offsetMs);
            rendererRef.current.showGhostExtraRange(createModeRef.current.dragExtraLane, startTimeMs, timeMs);
          } else if (createModeRef.current.dragLane) {
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, bpmChanges, useEditorStore.getState().chart.meta.offsetMs);
            rendererRef.current.showGhostRange(createModeRef.current.dragLane, startTimeMs, timeMs);
          }
        } else {
          const snappedBeatFloat = snapped.n / snapped.d;
          const extraLane = space.xToExtraLane(x);
          if (extraLane) {
            if (isEventEntityType(entityType as import('../modes').EntityType)) {
              // Show ghost event for event entity types on extra lanes
              rendererRef.current.showGhostEvent(extraLane, timeMs);
            } else {
              // 보조 노트도 chart.notes(lane 5+)에 살아 통합 인덱스로 직접 히트한다 (RFD 0018 ④d)
              const existingAux = noteExistsAtSnap(useEditorStore.getState().chart.notes, fromAuxIndex(extraLane), snappedBeatFloat);
              if (existingAux === null) {
                rendererRef.current.showGhostExtraNote(extraLane, timeMs);
              } else {
                rendererRef.current.hideGhostNote();
                rendererRef.current.setHoveredNote(existingAux);
              }
            }
          } else {
            const lane = space.xToLane(x);
            if (lane) {
              const existingNote = noteExistsAtSnap(useEditorStore.getState().chart.notes, lane, snappedBeatFloat);
              if (existingNote === null) {
                rendererRef.current.showGhostNote(lane, timeMs);
              } else {
                rendererRef.current.hideGhostNote();
                rendererRef.current.setHoveredNote(existingNote);
              }
            } else {
              rendererRef.current.hideGhostNote();
            }
          }
        }
      }
    } else if (mode === 'select' && selectModeRef.current) {
      const selectResult = selectModeRef.current.onPointerMove(x, y);
      applyEditResult(selectResult);
    }
  }, [
    mode, entityType, space,
    isTimeInBounds,
    toSample, updateTouchMovement,
    routeViewportGestures, canvasRef, createModeRef,
    isDraggingCursorRef, playbackRef, rendererRef,
    selectModeRef, deleteAtPoint, clearHoldTimer, isTouchContactInterrupted,
    onNavigationInteraction, applyEditResult, abandonInteractionForPlayback, handlePointerCancel,
  ]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointerIdsRef.current.delete(e.pointerId);
    const playbackLocked = playbackLockedPointerIdsRef.current.delete(e.pointerId);
    const deferredPauseToast = deferredPauseToastPointerIdsRef.current.delete(e.pointerId);
    if (playbackLocked && e.pointerType === 'touch') suppressContextMenuUntilRef.current = Date.now() + 1200;
    // 우클릭 누름의 contextmenu 대기는 여기서 다시 걸지 않는다. 누를 때 건 대기를 뗌 뒤에 오는 메뉴(Windows)가 쓰고,
    // 뗌 전에 온 메뉴(macOS)는 handleContextMenu가 이미 대기를 풀었다.
    let wasPinching = false;
    // hold 결말은 recognizer가 feed(up)에서 holdEnd로 알려준다(fired·moved·down 좌표).
    let holdFired = false;
    let holdMoved = false;
    let holdDown: { x: number; y: number } | null = null; // 있으면 = 이 pointer에 hold가 있었음
    let touchEmptySelectCandidate: TouchEmptySelectCandidate | null = null;
    let interruptedTouchContact = false;
    if (e.pointerType === 'touch') {
      e.preventDefault();
      updateTouchMovement(e);
      wasPinching = recognizerRef.current.isNavigating || recognizerRef.current.activeTouchCount >= 2;
      const holdEnd = recognizerRef.current
        .feed(toSample(e, 'up'))
        .find((g): g is Extract<Gesture, { kind: 'holdEnd' }> => g.kind === 'holdEnd');
      if (holdEnd) {
        holdFired = holdEnd.fired;
        holdMoved = holdEnd.moved;
        holdDown = { x: holdEnd.x, y: holdEnd.y };
      }
      clearHoldTimer();
      const pendingEmptySelect = touchEmptySelectCandidateRef.current;
      if (pendingEmptySelect?.pointerId === e.pointerId) {
        touchEmptySelectCandidate = pendingEmptySelect;
        touchEmptySelectCandidateRef.current = null;
      }
      interruptedTouchContact = isTouchContactInterrupted(e.pointerId);
      if (touchContactRef.current?.pointerId === e.pointerId) touchContactRef.current = null;
    }

    rendererRef.current?.handleMinimapPointerUp();

    if (isDraggingCursorRef.current) {
      isDraggingCursorRef.current = false;
      return;
    }

    if (wasPinching) {
      return;
    }

    // 재생 중 누른 뒤 뗄 때까지 한 손가락이었던 터치는 편집 시도였으므로 여기서 한 번 안내한다.
    // 떼기 전에 정지했으면 지금은 편집할 수 있으므로 "정지하라"는 안내를 띄우지 않는다(이 누름은 여전히 편집하지 않는다).
    if (deferredPauseToast && isEditLockedByPlayback()) addToast(PAUSE_TO_EDIT_COPY, 'warn');

    // recognizer에는 up을 전달해 접촉을 닫되, 재생을 겪은 holdEnd·클릭·마우스 up은 편집에 쓰지 않는다.
    if (playbackLocked) return;

    // 끊긴 누름의 up은 지연 박스 재생·클릭 토글을 하지 않는다. 다중선택 래치만 남은 선택에 맞춘다.
    if (interruptedTouchContact) {
      if (touchClickToggleRef.current?.pointerId === e.pointerId) touchClickToggleRef.current = null;
      const sel = useEditorStore.getState().selection;
      touchMultiSelectRef.current = nextTouchMultiSelectLatch(
        touchMultiSelectRef.current,
        sel.notes.size + sel.zones.size + sel.restZones.size,
      );
      rendererRef.current?.hideGhostNote();
      return;
    }

    if (e.button === 2) {
      eraseGestureRef.current.finish();
      return;
    }

    // 재생 중(RFD 0099)의 뗌은 배치·삭제·선택을 확정하지 않고, 재생 전에 시작한 생성 드래그·박스 선택도 버린다.
    if (isEditLockedByPlayback()) {
      abandonInteractionForPlayback();
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    // 드래그 삭제(발화) / 클릭 삭제(무이동). delete 모드에서 hold가 있었을 때만.
    if (mode === 'delete' && holdDown) {
      if (shouldDeleteOnUp({ fired: holdFired, moved: holdMoved })) {
        if (!eraseGestureRef.current.isActive) eraseGestureRef.current.begin();
        deleteAtPoint(x, y);
      }
      eraseGestureRef.current.finish();
      rendererRef.current?.hideGhostNote();
      return;
    }

    if (touchEmptySelectCandidate) {
      if (mode === 'select' && selectModeRef.current) {
        // 박스 시작은 SelectMode.onPointerDown이 idempotent하게 처리한다(진행 중이면 no-op).
        selectModeRef.current.onPointerDown(touchEmptySelectCandidate.x, touchEmptySelectCandidate.y, false, false);
        selectModeRef.current.onPointerUp(
          touchEmptySelectCandidate.moved ? x : touchEmptySelectCandidate.x,
          touchEmptySelectCandidate.moved ? y : touchEmptySelectCandidate.y,
        );
        rendererRef.current?.clearMoveOrigins();
        rendererRef.current?.clearBoxSelectRect();
        const sel = useEditorStore.getState();
        const selectionSize =
          sel.selection.notes.size + sel.selection.zones.size + sel.selection.restZones.size + sel.selection.events.size;
        // 박스 드래그(moved)가 비어있지 않게 끝나면 래치 on — 이후 클릭이 토글이 된다 (RFD 0016 §4.4).
        // 클릭(빈 곳 클릭·핸들 클릭)은 기존 규칙 유지: 선택이 비면 off, 아니면 현 상태 유지.
        touchMultiSelectRef.current = touchEmptySelectCandidate.moved
          ? selectionSize > 0
          : nextTouchMultiSelectLatch(touchMultiSelectRef.current, selectionSize);
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    // 범위 노트 후보의 up: create 모드 + 범위 엔티티(single/double)에서 hold가 있었을 때만.
    // (점노트 모드에서 노트를 롱프레스한 hold는 select-drag 의도라 발화 시 select 모드로 넘어가 있다.)
    if (mode === 'create' && getLongPressRangeType(entityType as EntityType) && holdDown && createModeRef.current) {
      const createAction = resolveTouchCreateUpAction({
        fired: holdFired,
        moved: holdMoved,
        endInBounds: isTimeInBounds(y),
        candidateStartInBounds: isTimeInBounds(holdDown.y),
      });
      if (createAction === 'commitDrag') {
        createModeRef.current.onPointerUp(x, y);
      } else if (createAction === 'cancelDrag') {
        createModeRef.current.cancelDrag();
      } else if (createAction === 'createPointClick') {
        // 클릭 = 길이 0 드래그 → 단노트. CreateMode가 down→up을 길이로 판정하므로 둘 다 호출한다.
        createModeRef.current.onPointerDown(holdDown.x, holdDown.y);
        createModeRef.current.onPointerUp(holdDown.x, holdDown.y);
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    // 마우스 up(및 롱프레스 이동 커밋)은 모드 다형 디스패치로 통합한다.
    const upGesture = { x, y, shiftKey: e.shiftKey, altKey: e.altKey, toggleSelection: false };
    if (holdFired && mode === 'select' && selectModeRef.current) {
      applyEditResult(selectModeRef.current.handlePointerUp(upGesture));
    } else {
      applyEditResult(
        activeEditorMode(mode, createModeRef.current, selectModeRef.current, deleteModeRef.current)
          ?.handlePointerUp(upGesture),
      );
    }

    // 노트·엑스트라 클릭 토글은 동일 처리 — 하나로 합친다.
    const clickToggle = touchClickToggleRef.current;
    if (
      e.pointerType === 'touch' &&
      clickToggle?.pointerId === e.pointerId &&
      selectModeRef.current &&
      shouldFireClickToggle({ moved: clickToggle.moved, longPressFired: holdFired })
    ) {
      // 짧은 터치는 down+up 한 쌍(마우스 클릭과 동일) — down만 보내면 이동 드래그가 열린 채 남는다(#154).
      selectModeRef.current.clickAt(clickToggle.x, clickToggle.y, touchMultiSelectRef.current);
      // 토글로 마지막 선택까지 해제됐으면 다중선택 래치를 끈다(누적 토글 모드 종료).
      const sel = useEditorStore.getState();
      touchMultiSelectRef.current = nextTouchMultiSelectLatch(
        touchMultiSelectRef.current,
        sel.selection.notes.size + sel.selection.zones.size + sel.selection.restZones.size + sel.selection.events.size,
      );
    }
    if (clickToggle?.pointerId === e.pointerId) {
      touchClickToggleRef.current = null;
    }
  }, [
    mode, entityType, isTimeInBounds, toSample, clearHoldTimer,
    updateTouchMovement, canvasRef, createModeRef, deleteModeRef, isDraggingCursorRef,
    deleteAtPoint, rendererRef, selectModeRef, applyEditResult, isTouchContactInterrupted,
    abandonInteractionForPlayback, addToast,
  ]);

  const handlePointerLeave = useCallback(() => {
    rendererRef.current?.hideGhostNote();
  }, [rendererRef]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    const hit = hitTestEvent(x, y);
    if (hit) {
      setEditingEvent(hit);
    }
  }, [canvasRef, hitTestEvent, rendererRef, setEditingEvent]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // 오래 누른 접촉의 네이티브 메뉴도 정지 후 삭제로 해석하지 않는다. macOS처럼 뗌 전에 온 우클릭 메뉴면
    // 그 누름의 contextmenu가 이미 왔으므로 대기를 풀어, 정지 뒤 키보드 메뉴 키를 삼키지 않게 한다.
    if (playbackLockedPointerIdsRef.current.size > 0) {
      rightPressPendingRef.current = false;
      return;
    }

    const decision = resolveContextMenuDelete({
      now: Date.now(),
      suppressUntil: suppressContextMenuUntilRef.current,
      rightPressPending: rightPressPendingRef.current,
    });
    rightPressPendingRef.current = decision.rightPressPending;
    if (!decision.shouldDelete) return;
    if (isEditLockedByPlayback()) {
      addToast(PAUSE_TO_EDIT_COPY, 'warn');
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    deleteModeRef.current?.onPointerDown(x, y);
  }, [canvasRef, rendererRef, deleteModeRef, addToast]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    handleDoubleClick,
    handleContextMenu,
    rightPressPendingRef,
  };
}
