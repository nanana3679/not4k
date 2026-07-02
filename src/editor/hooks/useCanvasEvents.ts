/**
 * useCanvasEvents — 캔버스 포인터 이벤트 핸들러들
 */

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { PlaybackController } from '../playback/PlaybackController';
import type { CreateMode, SelectMode, EntityType, EditResult } from '../modes';
import { DeleteMode, isEventEntityType, activeEditorMode } from '../modes';
import { MEASURE_LABEL_WIDTH, TIMELINE_WIDTH } from '../timeline/constants';
import { isPlaybackCursorSeekArea } from '../timeline/timelineViewport';
import { noteExistsAtSnap, extraNoteExistsAtSnap } from '../timeline/hitTest';
import { beatToMs } from '../../shared';
import { useEditorStore } from '../stores';
import {
  deleteChartNoteAtLaneBeat,
  deleteEmptyTrillZoneAtIndex,
  deleteExtraNoteAtIndex,
  deleteExtraNoteAtLaneBeat,
} from '../editing/editApplication';
import type { CoordinateHelpers } from './useCoordinateHelpers';
import {
  TOUCH_MOVE_CANCEL_PX,
  didTouchMoveBeyondTapSlop,
  shouldRunTouchBoxSelectDrag,
} from './touchGesture';
import { GestureRecognizer, type Gesture, type PointerSample } from './gestureRecognizer';
import {
  resolveSelectTouchDownSchedule,
  resolveTouchCreateUpAction,
  shouldDeleteOnUp,
  shouldFireTapToggle,
} from './touchEditRouting';

export interface CanvasEventHandlers {
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerLeave: () => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  rightDragDeletedRef: RefObject<boolean>;
}

const LONG_PRESS_MS = 450;

// 노트·엑스트라 탭 토글은 up에서 동일 처리되므로 후보는 한 형태다(kind 구분 불필요).
type TouchTapToggleCandidate = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  startClientX: number;
  startClientY: number;
};

type TouchCreateCandidate = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  fired: boolean;
  startClientX: number;
  startClientY: number;
  rangeType: "long" | "doubleLong";
};

type TouchEmptySelectCandidate = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  startClientX: number;
  startClientY: number;
};

type TouchDeleteCandidate = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  fired: boolean;
  startClientX: number;
  startClientY: number;
};

function getLongPressRangeType(type: EntityType): "long" | "doubleLong" | null {
  if (type === "single") return "long";
  if (type === "double") return "doubleLong";
  return null;
}

export function useCanvasEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rendererRef: RefObject<TimelineRenderer | null>,
  playbackRef: RefObject<PlaybackController | null>,
  createModeRef: RefObject<CreateMode | null>,
  selectModeRef: RefObject<SelectMode | null>,
  deleteModeRef: RefObject<DeleteMode | null>,
  isDraggingCursorRef: RefObject<boolean>,
  coords: CoordinateHelpers,
  isTimeInBounds: (y: number) => boolean,
  onPinchZoom?: (previousDistance: number, currentDistance: number, centerCanvasY: number) => void,
  onHorizontalPan?: (deltaX: number) => void,
  onVerticalPan?: (deltaY: number) => void,
  onNavigationInteraction?: () => void,
): CanvasEventHandlers {
  const mode = useEditorStore((s) => s.mode);
  const entityType = useEditorStore((s) => s.entityType);
  const chart = useEditorStore((s) => s.chart);
  const setChart = useEditorStore((s) => s.setChart);
  const setExtraNotes = useEditorStore((s) => s.setExtraNotes);
  const setSelectedExtraNotes = useEditorStore((s) => s.setSelectedExtraNotes);
  const setEditingMarker = useEditorStore((s) => s.setEditingMarker);
  const addToast = useEditorStore((s) => s.addToast);

  const {
    xToLane, xToExtraLane,
    yToBeat, snapBeat,
    bpmMarkers,
    hitTestNoteRef, hitTestNoteEndRef, hitTestExtraNoteRef, hitTestTrillZoneRef,
    hitTestTrillZoneEndRef, hitTestTrillZoneHandleRef,
    yToBeatRawRef,
    hitTestNote, hitTestTrillZone, hitTestExtraNote,
  } = coords;

  const rightDragDeletedRef = useRef(false);
  const recognizerRef = useRef(new GestureRecognizer());
  const longPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const longPressRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    x: number;
    y: number;
    noteHit: number | null;
    noteEndHit: number | null;
    extraHit: number | null;
    fired: boolean;
  } | null>(null);
  const touchCreateCandidateRef = useRef<TouchCreateCandidate | null>(null);
  const touchEmptySelectCandidateRef = useRef<TouchEmptySelectCandidate | null>(null);
  const touchDeleteCandidateRef = useRef<TouchDeleteCandidate | null>(null);
  const touchMultiSelectRef = useRef(false);
  const touchTapToggleRef = useRef<TouchTapToggleCandidate | null>(null);
  const suppressContextMenuUntilRef = useRef(0);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressRef.current = null;
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

  const cancelTouchCreateCandidate = useCallback(() => {
    const pending = touchCreateCandidateRef.current;
    touchCreateCandidateRef.current = null;
    clearLongPress();
    if (pending?.fired) {
      createModeRef.current?.cancelDrag();
      rendererRef.current?.hideGhostNote();
    }
  }, [clearLongPress, createModeRef, rendererRef]);

  const deleteAtPoint = useCallback((x: number, y: number) => {
    deleteModeRef.current?.onPointerDown(x, y);
  }, [deleteModeRef]);

  const toSample = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    phase: PointerSample['phase'],
  ): PointerSample => ({
    pointerId: e.pointerId,
    pointerType: e.pointerType as PointerSample['pointerType'],
    phase,
    // 1b: 내비게이션은 x/y를 쓰지 않는다(client 좌표만 사용). 편집 제스처 이관(1c) 시 캔버스 좌표로 채운다.
    x: e.clientX,
    y: e.clientY,
    clientX: e.clientX,
    clientY: e.clientY,
    // tick(performance.now())과 반드시 같은 시계여야 경과 계산이 맞다(Time-A).
    timeMs: performance.now(),
    button: e.button,
    buttons: e.buttons,
  }), []);

  // 두 손가락 내비가 편집을 가로챌 때(editCancel) 진행 중이던 편집 후보를 폐기한다.
  const handleEditCancel = useCallback(() => {
    clearLongPress();
    cancelTouchCreateCandidate();
    touchEmptySelectCandidateRef.current = null;
    touchDeleteCandidateRef.current = null;
    touchTapToggleRef.current = null;
    createModeRef.current?.cancelDrag();
    rendererRef.current?.hideGhostNote();
  }, [cancelTouchCreateCandidate, clearLongPress, createModeRef, rendererRef]);

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

  const scheduleLongPress = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    x: number,
    y: number,
    noteHit: number | null,
    noteEndHit: number | null,
    extraHit: number | null,
  ) => {
    if (e.pointerType !== 'touch' || mode === 'delete') return;
    if (noteHit === null && noteEndHit === null && extraHit === null) return;

    clearLongPress();
    touchCreateCandidateRef.current = null;
    longPressRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      x,
      y,
      noteHit,
      noteEndHit,
      extraHit,
      fired: false,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      const pending = longPressRef.current;
      if (!pending || pending.pointerId !== e.pointerId || pending.fired) return;
      // 발화 조건(경과 450ms·단일 터치·tap-slop 내)은 recognizer.tick이 판정한다(Time-A).
      // setTimeout은 ~450ms 시점에 tick을 한 번 poke하는 스케줄러 역할만 한다.
      const longPressFired = recognizerRef.current
        .tick(performance.now())
        .some((g) => g.kind === 'longPress');
      if (!longPressFired) return;

      pending.fired = true;
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      touchMultiSelectRef.current = true;
      useEditorStore.getState().setMode('select');
      selectModeRef.current?.beginLongPressDrag(pending.x, pending.y, {
        noteEndHit: pending.noteEndHit,
        noteHit: pending.noteHit,
        extraHit: pending.extraHit,
      });
      rendererRef.current?.hideGhostNote();
    }, LONG_PRESS_MS);
  }, [clearLongPress, mode, rendererRef, selectModeRef]);

  const scheduleTouchCreateRange = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    x: number,
    y: number,
    rangeType: "long" | "doubleLong",
  ) => {
    clearLongPress();
    touchCreateCandidateRef.current = {
      pointerId: e.pointerId,
      x,
      y,
      moved: false,
      fired: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      rangeType,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      const pending = touchCreateCandidateRef.current;
      if (!pending || pending.pointerId !== e.pointerId || pending.fired || pending.moved) return;
      // 발화 판정(경과 450ms·단일 터치·미이동)은 recognizer.tick에 위임(Time-A, 롱프레스와 통일).
      const longPressFired = recognizerRef.current
        .tick(performance.now())
        .some((g) => g.kind === 'longPress');
      if (!longPressFired) return;

      pending.fired = true;
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      createModeRef.current?.beginRangeNoteAt(pending.x, pending.y, pending.rangeType);
      rendererRef.current?.hideGhostNote();
    }, LONG_PRESS_MS);
  }, [clearLongPress, createModeRef, rendererRef]);

  const scheduleTouchDeleteDrag = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    x: number,
    y: number,
  ) => {
    clearLongPress();
    touchDeleteCandidateRef.current = {
      pointerId: e.pointerId,
      x,
      y,
      moved: false,
      fired: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      const pending = touchDeleteCandidateRef.current;
      if (!pending || pending.pointerId !== e.pointerId || pending.fired || pending.moved) return;
      // 발화 판정(경과 450ms·단일 터치·미이동)은 recognizer.tick에 위임(Time-A, 롱프레스와 통일).
      const longPressFired = recognizerRef.current
        .tick(performance.now())
        .some((g) => g.kind === 'longPress');
      if (!longPressFired) return;

      pending.fired = true;
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      deleteAtPoint(pending.x, pending.y);
    }, LONG_PRESS_MS);
  }, [clearLongPress, deleteAtPoint]);

  const updateTouchMovement = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const pendingLongPress = longPressRef.current;
    if (pendingLongPress?.pointerId === e.pointerId && !pendingLongPress.fired) {
      if (didTouchMoveBeyondTapSlop({
        startClientX: pendingLongPress.startClientX,
        startClientY: pendingLongPress.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        tapSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        clearLongPress();
        rendererRef.current?.hideGhostNote();
      }
    }

    const createCandidate = touchCreateCandidateRef.current;
    if (createCandidate?.pointerId === e.pointerId && !createCandidate.fired && !createCandidate.moved) {
      if (didTouchMoveBeyondTapSlop({
        startClientX: createCandidate.startClientX,
        startClientY: createCandidate.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        tapSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        createCandidate.moved = true;
        clearLongPress();
        rendererRef.current?.hideGhostNote();
      }
    }

    const deleteCandidate = touchDeleteCandidateRef.current;
    if (deleteCandidate?.pointerId === e.pointerId && !deleteCandidate.fired && !deleteCandidate.moved) {
      if (didTouchMoveBeyondTapSlop({
        startClientX: deleteCandidate.startClientX,
        startClientY: deleteCandidate.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        tapSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        deleteCandidate.moved = true;
        clearLongPress();
        rendererRef.current?.hideGhostNote();
      }
    }

    const emptySelectCandidate = touchEmptySelectCandidateRef.current;
    if (emptySelectCandidate?.pointerId === e.pointerId && !emptySelectCandidate.moved) {
      if (didTouchMoveBeyondTapSlop({
        startClientX: emptySelectCandidate.startClientX,
        startClientY: emptySelectCandidate.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        tapSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        emptySelectCandidate.moved = true;
        rendererRef.current?.hideGhostNote();
      }
    }

    const tapToggle = touchTapToggleRef.current;
    if (tapToggle?.pointerId === e.pointerId && !tapToggle.moved) {
      if (didTouchMoveBeyondTapSlop({
        startClientX: tapToggle.startClientX,
        startClientY: tapToggle.startClientY,
        clientX: e.clientX,
        clientY: e.clientY,
        tapSlopPx: TOUCH_MOVE_CANCEL_PX,
      })) {
        tapToggle.moved = true;
      }
    }
  }, [clearLongPress, rendererRef]);

  // 마커 히트테스트 (extra lane — editorLane 기반)
  const hitTestMarker = useCallback((x: number, y: number) => {
    const extraLane = xToExtraLane(x);
    if (!extraLane) return null;
    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 8;
    for (let i = 0; i < chart.events.length; i++) {
      const evt = chart.events[i];
      if ((evt.editorLane ?? 1) !== extraLane) continue;
      const startFloat = evt.beat.n / evt.beat.d;
      const endFloat = 'endBeat' in evt ? evt.endBeat.n / evt.endBeat.d : startFloat;
      if (testBeatFloat >= startFloat - tolerance && testBeatFloat <= endFloat + tolerance) {
        return { type: 'event' as const, index: i };
      }
    }
    return null;
  }, [chart.events, xToExtraLane, yToBeat]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      const navGestures = recognizerRef.current.feed(toSample(e, 'down'));
      canvasRef.current?.setPointerCapture(e.pointerId);
      if (navGestures.some((g) => g.kind === 'editCancel')) {
        handleEditCancel();
        return;
      }
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current?.handleMinimapPointerDown(rawX, y)) {
      onNavigationInteraction?.();
      canvasRef.current?.setPointerCapture(e.pointerId);
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
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const touchNoteHit = e.pointerType === 'touch' ? hitTestNoteRef.current(x, y) : null;
    const touchNoteEndHit = e.pointerType === 'touch' ? hitTestNoteEndRef.current(x, y) : null;
    const touchExtraHit = e.pointerType === 'touch' ? hitTestExtraNoteRef.current(x, y) : null;

    scheduleLongPress(e, x, y, touchNoteHit, touchNoteEndHit, touchExtraHit);

    if (e.button === 2) {
      rightDragDeletedRef.current = false;
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (e.pointerType === 'touch') {
      // 터치 down 예약은 모드별로 갈린다 (인식기/예약 글루 — 드래그 트랜잭션 슬라이스에서 통합).
      if (mode === 'create' && createModeRef.current) {
        if (createModeRef.current.isPlacementBlocked(x, y)) return;
        const touchRangeType = getLongPressRangeType(entityType as EntityType);
        if (touchRangeType) {
          scheduleTouchCreateRange(e, x, y, touchRangeType);
          return;
        }
        // 레인지 타입이 아니면 아래 통합 디스패치로 폴스루(점노트 배치).
      } else if (mode === 'select' && selectModeRef.current) {
        // 트릴존 핸들/끝은 경계에 겹친 노트보다 우선(마우스 onPointerDown 우선순위와 일치).
        const schedule = resolveSelectTouchDownSchedule({
          noteHit: touchNoteHit,
          extraHit: touchExtraHit,
          zoneHandleHit: hitTestTrillZoneHandleRef.current(x, y),
          zoneEndHit: hitTestTrillZoneEndRef.current(x, y),
        });
        if (schedule === 'tapToggle') {
          touchTapToggleRef.current = {
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
        scheduleTouchDeleteDrag(e, x, y);
        return;
      }
    }

    // 마우스 down(및 레인지 타입 아닌 터치 create)은 모드 다형 디스패치로 통합한다.
    activeEditorMode(mode, createModeRef.current, selectModeRef.current, deleteModeRef.current)
      ?.handlePointerDown({ x, y, shiftKey: e.shiftKey, altKey: e.altKey, toggleSelection: false });
  }, [
    mode, entityType,
    toSample, handleEditCancel, scheduleLongPress, scheduleTouchCreateRange,
    scheduleTouchDeleteDrag, startTouchEmptySelectCandidate,
    canvasRef, createModeRef, deleteModeRef, hitTestExtraNoteRef,
    hitTestNoteEndRef, hitTestNoteRef, hitTestTrillZoneHandleRef, hitTestTrillZoneEndRef,
    isDraggingCursorRef, playbackRef, rendererRef,
    selectModeRef, onNavigationInteraction,
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

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current?.handleMinimapPointerMove(rawX, y)) {
      onNavigationInteraction?.();
      return;
    }

    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const deleteCandidate = touchDeleteCandidateRef.current;
    if (
      e.pointerType === 'touch' &&
      deleteCandidate?.pointerId === e.pointerId &&
      deleteCandidate.fired
    ) {
      deleteAtPoint(x, y);
      return;
    }

    const pendingTouchCreate = touchCreateCandidateRef.current;
    if (
      e.pointerType === 'touch' &&
      pendingTouchCreate?.pointerId === e.pointerId &&
      pendingTouchCreate.moved &&
      !pendingTouchCreate.fired
    ) {
      rendererRef.current?.hideGhostNote();
      return;
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

    const hoverNoteHit = hitTestNoteRef.current(x, y);
    const hoverExtraHit = hitTestExtraNoteRef.current(x, y);
    // 트릴 구간 핸들은 select 모드에서만 표시한다.
    const hoverTrillZoneHit = mode === 'select' ? hitTestTrillZoneRef.current(x, y) : null;
    // 트릴 구간을 리사이즈/이동하는 동안엔 커서가 구간 밖으로 나가도 핸들을 계속 표시한다.
    const draggingTrillZone = selectModeRef.current?.draggingTrillZoneIndex ?? null;
    if (rendererRef.current) {
      rendererRef.current.setHoveredNote(hoverNoteHit);
      rendererRef.current.setHoveredExtraNote(hoverExtraHit);
      rendererRef.current.setHoveredTrillZone(draggingTrillZone !== null ? draggingTrillZone : hoverTrillZoneHit);
      // 롱노트 리사이즈 캡은 select 모드에서 노트에 hover했을 때만 표시한다.
      rendererRef.current.setResizeHoverNote(mode === 'select' ? hoverNoteHit : null);
    }

    // 트릴 핸들 위 커서: 이동 필=move, 리사이즈 캡=ns-resize(↕). select 모드에서만.
    const canvasEl = canvasRef.current;
    if (canvasEl) {
      let cursor = '';
      if (mode === 'select') {
        if (hitTestTrillZoneHandleRef.current(x, y) !== null) cursor = 'move';
        else if (hitTestTrillZoneEndRef.current(x, y) !== null) cursor = 'ns-resize';
        else {
          // 롱노트 끝 캡 위: z-order 최상위 노트일 때만 리사이즈 커서(겹친 끝점 가로채기 방지)
          const noteEnd = hitTestNoteEndRef.current(x, y);
          if (noteEnd !== null && hitTestNoteRef.current(x, y) === noteEnd) cursor = 'ns-resize';
        }
      }
      if (canvasEl.style.cursor !== cursor) canvasEl.style.cursor = cursor;
    }
    const isHoveringEntity = hoverNoteHit !== null || hoverExtraHit !== null;

    if (isDraggingCursorRef.current && rendererRef.current) {
      const timeMs = rendererRef.current.clampToMeasureRange(rendererRef.current.yToTime(y));
      playbackRef.current?.seekTo(timeMs);
      return;
    }

    const activeLongPress = longPressRef.current;
    if (
      e.pointerType === 'touch' &&
      activeLongPress?.pointerId === e.pointerId &&
      activeLongPress.fired &&
      selectModeRef.current
    ) {
      const longPressResult = selectModeRef.current.onPointerMove(x, y);
      applyEditResult(longPressResult);
      return;
    }

    // 우클릭 드래그 삭제
    if (e.buttons & 2) {
      const rawBeatDel = yToBeatRawRef.current(y);
      const beatFloat = rawBeatDel.n / rawBeatDel.d;

      const extraLane = xToExtraLane(x);
      if (extraLane !== null) {
        const currentExtra = useEditorStore.getState().extraNotes;
        const updatedExtra = deleteExtraNoteAtLaneBeat(currentExtra, { extraLane, beatFloat });
        if (updatedExtra !== null) {
          rightDragDeletedRef.current = true;
          setExtraNotes(updatedExtra);
          setSelectedExtraNotes(new Set());
        }
        return;
      }

      const lane = xToLane(x);
      if (!lane) return;

      const current = useEditorStore.getState().chart;
      const updatedChart = deleteChartNoteAtLaneBeat(current, { lane, beatFloat });
      if (updatedChart !== null) {
        rightDragDeletedRef.current = true;
        setChart(updatedChart);
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
        const beat = yToBeat(y);
        const snapped = snapBeat(beat);
        const timeMs = beatToMs(snapped, bpmMarkers, useEditorStore.getState().chart.meta.offsetMs);

        if (createModeRef.current?.dragging && createModeRef.current.dragBeat) {
          if (createModeRef.current.dragType === 'event') {
            rendererRef.current.showGhostMarker(createModeRef.current.dragExtraLane ?? 1, timeMs);
          } else if (createModeRef.current.dragType === 'extraRangeNote' && createModeRef.current.dragExtraLane) {
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, bpmMarkers, useEditorStore.getState().chart.meta.offsetMs);
            rendererRef.current.showGhostExtraRange(createModeRef.current.dragExtraLane, startTimeMs, timeMs);
          } else if (createModeRef.current.dragLane) {
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, bpmMarkers, useEditorStore.getState().chart.meta.offsetMs);
            rendererRef.current.showGhostRange(createModeRef.current.dragLane, startTimeMs, timeMs);
          }
        } else {
          const snappedBeatFloat = snapped.n / snapped.d;
          const extraLane = xToExtraLane(x);
          if (extraLane) {
            if (isEventEntityType(entityType as import('../modes').EntityType)) {
              // Show ghost marker for event entity types on extra lanes
              rendererRef.current.showGhostMarker(extraLane, timeMs);
            } else {
              const existingExtra = extraNoteExistsAtSnap(useEditorStore.getState().extraNotes, extraLane, snappedBeatFloat);
              if (existingExtra === null) {
                rendererRef.current.showGhostExtraNote(extraLane, timeMs);
              } else {
                rendererRef.current.hideGhostNote();
                rendererRef.current.setHoveredExtraNote(existingExtra);
              }
            }
          } else {
            const lane = xToLane(x);
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
    mode, entityType, xToLane, xToExtraLane, yToBeat, snapBeat,
    bpmMarkers, isTimeInBounds, setChart, setExtraNotes,
    setSelectedExtraNotes, toSample, updateTouchMovement,
    routeViewportGestures, canvasRef, createModeRef, hitTestExtraNoteRef,
    hitTestNoteRef, isDraggingCursorRef, playbackRef, rendererRef,
    selectModeRef, yToBeatRawRef, deleteAtPoint,
    onNavigationInteraction, applyEditResult,
  ]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    let wasPinching = false;
    let longPressFired = false;
    let touchCreateCandidate: TouchCreateCandidate | null = null;
    let touchEmptySelectCandidate: TouchEmptySelectCandidate | null = null;
    let touchDeleteCandidate: TouchDeleteCandidate | null = null;
    if (e.pointerType === 'touch') {
      e.preventDefault();
      updateTouchMovement(e);
      wasPinching = recognizerRef.current.isNavigating || recognizerRef.current.activeTouchCount >= 2;
      recognizerRef.current.feed(toSample(e, 'up'));
      const pendingLongPress = longPressRef.current;
      if (pendingLongPress?.pointerId === e.pointerId) {
        longPressFired = pendingLongPress.fired;
        clearLongPress();
      }
      const pendingCreate = touchCreateCandidateRef.current;
      if (pendingCreate?.pointerId === e.pointerId) {
        touchCreateCandidate = pendingCreate;
        touchCreateCandidateRef.current = null;
        clearLongPress();
      }
      const pendingEmptySelect = touchEmptySelectCandidateRef.current;
      if (pendingEmptySelect?.pointerId === e.pointerId) {
        touchEmptySelectCandidate = pendingEmptySelect;
        touchEmptySelectCandidateRef.current = null;
      }
      const pendingDelete = touchDeleteCandidateRef.current;
      if (pendingDelete?.pointerId === e.pointerId) {
        touchDeleteCandidate = pendingDelete;
        touchDeleteCandidateRef.current = null;
        clearLongPress();
      }
    }

    rendererRef.current?.handleMinimapPointerUp();

    if (isDraggingCursorRef.current) {
      isDraggingCursorRef.current = false;
      return;
    }

    if (wasPinching) {
      return;
    }

    if (e.button === 2) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    if (touchDeleteCandidate) {
      if (shouldDeleteOnUp({ fired: touchDeleteCandidate.fired, moved: touchDeleteCandidate.moved })) {
        deleteAtPoint(x, y);
      }
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
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    if (touchCreateCandidate && createModeRef.current) {
      const createAction = resolveTouchCreateUpAction({
        fired: touchCreateCandidate.fired,
        moved: touchCreateCandidate.moved,
        endInBounds: isTimeInBounds(y),
        candidateStartInBounds: isTimeInBounds(touchCreateCandidate.y),
      });
      if (createAction === 'commitDrag') {
        createModeRef.current.onPointerUp(x, y);
      } else if (createAction === 'cancelDrag') {
        createModeRef.current.cancelDrag();
      } else if (createAction === 'createPointTap') {
        // 탭 = 길이 0 드래그 → 단노트. CreateMode가 down→up을 길이로 판정하므로 둘 다 호출한다.
        createModeRef.current.onPointerDown(touchCreateCandidate.x, touchCreateCandidate.y);
        createModeRef.current.onPointerUp(touchCreateCandidate.x, touchCreateCandidate.y);
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    // 마우스 up(및 롱프레스 이동 커밋)은 모드 다형 디스패치로 통합한다.
    const upGesture = { x, y, shiftKey: e.shiftKey, altKey: e.altKey, toggleSelection: false };
    if (longPressFired && selectModeRef.current) {
      applyEditResult(selectModeRef.current.handlePointerUp(upGesture));
    } else {
      applyEditResult(
        activeEditorMode(mode, createModeRef.current, selectModeRef.current, deleteModeRef.current)
          ?.handlePointerUp(upGesture),
      );
    }

    // 노트·엑스트라 탭 토글은 동일 처리 — 하나로 합친다.
    const tapToggle = touchTapToggleRef.current;
    if (
      e.pointerType === 'touch' &&
      tapToggle?.pointerId === e.pointerId &&
      selectModeRef.current &&
      shouldFireTapToggle({ moved: tapToggle.moved, longPressFired })
    ) {
      selectModeRef.current.onPointerDown(
        tapToggle.x,
        tapToggle.y,
        false,
        false,
        touchMultiSelectRef.current,
      );
    }
    if (tapToggle?.pointerId === e.pointerId) {
      touchTapToggleRef.current = null;
    }
  }, [
    mode, isTimeInBounds, toSample, clearLongPress,
    updateTouchMovement, canvasRef, createModeRef, deleteModeRef, isDraggingCursorRef,
    deleteAtPoint, rendererRef, selectModeRef, applyEditResult,
  ]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      recognizerRef.current.feed(toSample(e, 'cancel'));
      recognizerRef.current.clearNavigation();
      clearLongPress();
      cancelTouchCreateCandidate();
      clearTouchEmptySelectCandidate();
      touchDeleteCandidateRef.current = null;
      touchTapToggleRef.current = null;
    }
    rendererRef.current?.handleMinimapPointerUp();
    rendererRef.current?.clearMoveOrigins();
    rendererRef.current?.clearBoxSelectRect();
    createModeRef.current?.cancelDrag();
  }, [cancelTouchCreateCandidate, clearLongPress, clearTouchEmptySelectCandidate, createModeRef, toSample, rendererRef]);

  const handlePointerLeave = useCallback(() => {
    rendererRef.current?.hideGhostNote();
  }, [rendererRef]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    const hit = hitTestMarker(x, y);
    if (hit) {
      setEditingMarker(hit);
    }
  }, [canvasRef, hitTestMarker, rendererRef, setEditingMarker]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (Date.now() < suppressContextMenuUntilRef.current) return;
    if (rightDragDeletedRef.current) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const y = e.clientY - rect.top;

    const extraHitIdx = hitTestExtraNote(x, y);
    if (extraHitIdx !== null) {
      const currentExtra = useEditorStore.getState().extraNotes;
      const updatedExtra = deleteExtraNoteAtIndex(currentExtra, extraHitIdx);
      if (updatedExtra === null) return;
      setExtraNotes(updatedExtra);
      setSelectedExtraNotes(new Set());
      return;
    }

    const currentChart = useEditorStore.getState().chart;
    const result = DeleteMode.deleteNoteAtPoint(currentChart, hitTestNote, x, y);
    if (result) {
      setChart(result);
      return;
    }

    const zoneIdx = hitTestTrillZone(x, y);
    if (zoneIdx !== null) {
      const zoneDelete = deleteEmptyTrillZoneAtIndex(currentChart, zoneIdx);
      if (zoneDelete.blockedReason) addToast(zoneDelete.blockedReason);
      if (zoneDelete.chart) setChart(zoneDelete.chart);
      return;
    }

    const markerHit = hitTestMarker(x, y);
    if (markerHit) {
      const evt = currentChart.events[markerHit.index];
      if (evt && evt.beat.n === 0 && (evt.type === 'bpm' || evt.type === 'timeSignature')) {
        addToast('Cannot delete initial event marker');
        return;
      }
      setChart({
        ...currentChart,
        events: currentChart.events.filter((_, i) => i !== markerHit.index),
      });
    }
  }, [canvasRef, hitTestNote, hitTestTrillZone, hitTestMarker, hitTestExtraNote, rendererRef, setChart, setExtraNotes, setSelectedExtraNotes, addToast]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handlePointerLeave,
    handleDoubleClick,
    handleContextMenu,
    rightDragDeletedRef,
  };
}
