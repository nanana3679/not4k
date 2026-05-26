/**
 * useCanvasEvents — 캔버스 포인터 이벤트 핸들러들
 */

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { PlaybackController } from '../playback/PlaybackController';
import type { CreateMode, SelectMode, EntityType } from '../modes';
import { DeleteMode, isEventEntityType } from '../modes';
import { MEASURE_LABEL_WIDTH, TIMELINE_WIDTH } from '../timeline/constants';
import { isPlaybackCursorSeekArea } from '../timeline/timelineViewport';
import { hitTestRangeNoteRegion, noteExistsAtSnap, extraNoteExistsAtSnap, SNAP_POSITION_TOLERANCE } from '../timeline/hitTest';
import { beatToMs, beatEq } from '../../shared';
import type { Beat, Lane, RangeNote } from '../../shared';
import { useEditorStore } from '../stores';
import type { CoordinateHelpers } from './useCoordinateHelpers';
import {
  TOUCH_MOVE_CANCEL_PX,
  type TouchGesturePoint,
  type TouchNavigationMode,
  didTouchMoveBeyondTapSlop,
  isTouchNavigationGesture,
  resolveTouchNavigationMode,
  shouldRunTouchBoxSelectDrag,
} from './touchGesture';

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

interface TouchPoint {
  clientX: number;
  clientY: number;
}

type TouchTapToggleCandidate =
  | {
      pointerId: number;
      kind: 'note';
      x: number;
      y: number;
      moved: boolean;
      startClientX: number;
      startClientY: number;
    }
  | {
      pointerId: number;
      kind: 'extra';
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

function getTouchDistance(points: TouchPoint[]): number {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY);
}

function getTouchCenter(points: TouchPoint[]): TouchPoint {
  return {
    clientX: (points[0].clientX + points[1].clientX) / 2,
    clientY: (points[0].clientY + points[1].clientY) / 2,
  };
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
    yToBeat, yToBeatRaw, snapBeat,
    bpmMarkers,
    hitTestNoteRef, hitTestNoteEndRef, hitTestExtraNoteRef,
    yToBeatRawRef,
    hitTestNote, hitTestTrillZone, hitTestExtraNote,
  } = coords;

  const rightDragDeletedRef = useRef(false);
  const activeTouchPointsRef = useRef<Map<number, TouchPoint>>(new Map());
  const touchNavigationModeRef = useRef<TouchNavigationMode | null>(null);
  const touchNavigationStartDistanceRef = useRef<number | null>(null);
  const touchNavigationStartCenterRef = useRef<TouchGesturePoint | null>(null);
  const pinchPreviousDistanceRef = useRef<number | null>(null);
  const pinchPreviousCenterRef = useRef<TouchPoint | null>(null);
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

  const updateTouchPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'touch') return;
    activeTouchPointsRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }, []);

  const removeTouchPoint = useCallback((pointerId: number) => {
    activeTouchPointsRef.current.delete(pointerId);
    if (activeTouchPointsRef.current.size < 2) {
      touchNavigationModeRef.current = null;
      touchNavigationStartDistanceRef.current = null;
      touchNavigationStartCenterRef.current = null;
      pinchPreviousDistanceRef.current = null;
      pinchPreviousCenterRef.current = null;
    }
  }, []);

  const startPinchIfNeeded = useCallback((): boolean => {
    const points = [...activeTouchPointsRef.current.values()];
    if (!isTouchNavigationGesture(points.length)) return false;

    const distance = getTouchDistance(points);
    if (distance <= 0) return true;

    const center = getTouchCenter(points);
    touchNavigationModeRef.current = null;
    touchNavigationStartDistanceRef.current = distance;
    touchNavigationStartCenterRef.current = center;
    pinchPreviousDistanceRef.current = distance;
    pinchPreviousCenterRef.current = center;
    clearLongPress();
    cancelTouchCreateCandidate();
    touchEmptySelectCandidateRef.current = null;
    touchDeleteCandidateRef.current = null;
    touchTapToggleRef.current = null;
    createModeRef.current?.cancelDrag();
    rendererRef.current?.hideGhostNote();
    return true;
  }, [cancelTouchCreateCandidate, clearLongPress, createModeRef, rendererRef]);

  const handlePinchMove = useCallback((rect: DOMRect): boolean => {
    const points = [...activeTouchPointsRef.current.values()];
    if (!isTouchNavigationGesture(points.length)) return false;

    const previousDistance = pinchPreviousDistanceRef.current;
    const previousCenter = pinchPreviousCenterRef.current;
    const currentDistance = getTouchDistance(points);
    const center = getTouchCenter(points);

    if (touchNavigationStartDistanceRef.current === null || touchNavigationStartCenterRef.current === null) {
      touchNavigationStartDistanceRef.current = currentDistance;
      touchNavigationStartCenterRef.current = center;
    }

    const mode = resolveTouchNavigationMode({
      currentMode: touchNavigationModeRef.current,
      startCenter: touchNavigationStartCenterRef.current,
      currentCenter: center,
      startDistance: touchNavigationStartDistanceRef.current,
      currentDistance,
    });
    touchNavigationModeRef.current = mode;

    if (mode === "horizontalScroll" && previousCenter) {
      onHorizontalPan?.(previousCenter.clientX - center.clientX);
    } else if (mode === "verticalScroll" && previousCenter) {
      onVerticalPan?.(previousCenter.clientY - center.clientY);
    } else if (mode === "resize" && previousDistance !== null && currentDistance > 0) {
      onPinchZoom?.(previousDistance, currentDistance, center.clientY - rect.top);
    }

    if (currentDistance > 0) {
      pinchPreviousDistanceRef.current = currentDistance;
    }
    pinchPreviousCenterRef.current = center;

    return true;
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
      if (!activeTouchPointsRef.current.has(e.pointerId) || activeTouchPointsRef.current.size !== 1) return;

      pending.fired = true;
      suppressContextMenuUntilRef.current = Date.now() + 1200;
      touchMultiSelectRef.current = true;
      useEditorStore.getState().setMode('select');
      if (pending.noteEndHit !== null) {
        selectModeRef.current?.beginNoteEndResizeDrag(pending.noteEndHit);
      } else if (pending.noteHit !== null) {
        selectModeRef.current?.beginTouchMoveDragFromNote(pending.noteHit, pending.x, pending.y);
      } else if (pending.extraHit !== null) {
        selectModeRef.current?.beginTouchMoveDragFromExtraNote(pending.extraHit, pending.x, pending.y);
      }
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
      if (!activeTouchPointsRef.current.has(e.pointerId) || activeTouchPointsRef.current.size !== 1) return;

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
      if (!activeTouchPointsRef.current.has(e.pointerId) || activeTouchPointsRef.current.size !== 1) return;

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
      updateTouchPoint(e);
      canvasRef.current?.setPointerCapture(e.pointerId);
      if (activeTouchPointsRef.current.size >= 2 && startPinchIfNeeded()) {
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

    if (mode === 'create' && createModeRef.current) {
      if (!isTimeInBounds(y)) return;
      const hitIdx = hitTestNoteRef.current(x, y);
      if (hitIdx !== null) {
        const hitNote = chart.notes[hitIdx];
        if ('endBeat' in hitNote) {
          const lane = xToLane(x);
          if (lane === null) return;
          const rawBeat = yToBeatRaw(y);
          const beatFloat = rawBeat.n / rawBeat.d;
          const region = hitTestRangeNoteRegion(hitNote as RangeNote, beatFloat);
          if (region === null || region === 'body') return;
          if (region === 'head' || region === 'end') {
            const targetBeat = region === 'head'
              ? hitNote.beat.n / hitNote.beat.d
              : (hitNote as RangeNote).endBeat.n / (hitNote as RangeNote).endBeat.d;
            const pointExists = chart.notes.some(
              n => !('endBeat' in n) && n.lane === lane && Math.abs(n.beat.n / n.beat.d - targetBeat) <= SNAP_POSITION_TOLERANCE
            );
            if (pointExists) return;
          }
        } else {
          return;
        }
      }
      if (hitTestExtraNoteRef.current(x, y) !== null) return;
      const touchRangeType = e.pointerType === 'touch' ? getLongPressRangeType(entityType as EntityType) : null;
      if (touchRangeType) {
        scheduleTouchCreateRange(e, x, y, touchRangeType);
        return;
      }
      createModeRef.current.onPointerDown(x, y);
    } else if (mode === 'select' && selectModeRef.current) {
      if (e.pointerType === 'touch' && (touchNoteHit !== null || touchExtraHit !== null)) {
        if (touchExtraHit !== null) {
          touchTapToggleRef.current = {
            pointerId: e.pointerId,
            kind: 'extra',
            x,
            y,
            moved: false,
            startClientX: e.clientX,
            startClientY: e.clientY,
          };
          return;
        }

        if (touchNoteHit !== null) {
          touchTapToggleRef.current = {
            pointerId: e.pointerId,
            kind: 'note',
            x,
            y,
            moved: false,
            startClientX: e.clientX,
            startClientY: e.clientY,
          };
          return;
        }
      }
      if (e.pointerType === 'touch') {
        startTouchEmptySelectCandidate(e, x, y);
        return;
      }
      selectModeRef.current.onPointerDown(x, y, e.shiftKey, e.altKey);
    } else if (mode === 'delete' && deleteModeRef.current) {
      if (e.pointerType === 'touch') {
        scheduleTouchDeleteDrag(e, x, y);
        return;
      }
      deleteModeRef.current.onPointerDown(x, y);
    }
  }, [
    mode, entityType, isTimeInBounds, chart.notes, xToLane, yToBeatRaw,
    updateTouchPoint, startPinchIfNeeded, scheduleLongPress, scheduleTouchCreateRange,
    scheduleTouchDeleteDrag, startTouchEmptySelectCandidate,
    canvasRef, createModeRef, deleteModeRef, hitTestExtraNoteRef,
    hitTestNoteEndRef, hitTestNoteRef, isDraggingCursorRef, playbackRef, rendererRef,
    selectModeRef, onNavigationInteraction,
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      updateTouchPoint(e);
      updateTouchMovement(e);
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.pointerType === 'touch' && handlePinchMove(rect)) return;

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
        activeTouchCount: activeTouchPointsRef.current.size,
      }) &&
      selectModeRef.current
    ) {
      if (!selectModeRef.current.isBoxSelecting) {
        selectModeRef.current.onPointerDown(
          emptySelectCandidate.x,
          emptySelectCandidate.y,
          false,
          false,
        );
      }
      selectModeRef.current.onPointerMove(x, y);

      if (rendererRef.current) {
        const boxRect = selectModeRef.current.boxSelectPixelRect;
        if (boxRect) {
          rendererRef.current.setBoxSelectRect(boxRect);
          rendererRef.current.render();
        }
      }
      return;
    }

    const hoverNoteHit = hitTestNoteRef.current(x, y);
    const hoverExtraHit = hitTestExtraNoteRef.current(x, y);
    if (rendererRef.current) {
      rendererRef.current.setHoveredNote(hoverNoteHit);
      rendererRef.current.setHoveredExtraNote(hoverExtraHit);
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
      selectModeRef.current.onPointerMove(x, y);

      if (selectModeRef.current.isMoveDragging && rendererRef.current) {
        const origins = selectModeRef.current.moveOrigins;
        if (origins.size > 0) {
          const originData: { note: import('../../shared').NoteEntity; beat: import('../../shared').Beat; endBeat?: import('../../shared').Beat; lane: import('../../shared').Lane }[] = [];
          for (const [idx, pos] of origins) {
            originData.push({ note: useEditorStore.getState().chart.notes[idx], beat: pos.beat, endBeat: pos.endBeat, lane: pos.lane });
          }
          rendererRef.current.setMoveOrigins(originData);
        }
      }
      return;
    }

    // 우클릭 드래그 삭제
    if (e.buttons & 2) {
      const rawBeatDel = yToBeatRawRef.current(y);
      const beatFloat = rawBeatDel.n / rawBeatDel.d;

      const extraLane = xToExtraLane(x);
      if (extraLane !== null) {
        const currentExtra = useEditorStore.getState().extraNotes;
        for (let i = 0; i < currentExtra.length; i++) {
          const en = currentExtra[i];
          if (en.extraLane !== extraLane) continue;
          const nb = en.beat.n / en.beat.d;
          if ('endBeat' in en) {
            const eb = en.endBeat.n / en.endBeat.d;
            if (beatFloat >= nb && beatFloat <= eb) {
              rightDragDeletedRef.current = true;
              setExtraNotes(currentExtra.filter((_: unknown, idx: number) => idx !== i));
              setSelectedExtraNotes(new Set());
              return;
            }
          } else {
            if (Math.abs(beatFloat - nb) < 1 / 16) {
              rightDragDeletedRef.current = true;
              setExtraNotes(currentExtra.filter((_: unknown, idx: number) => idx !== i));
              setSelectedExtraNotes(new Set());
              return;
            }
          }
        }
        return;
      }

      const lane = xToLane(x);
      if (!lane) return;

      const current = useEditorStore.getState().chart;
      for (let i = 0; i < current.notes.length; i++) {
        const note = current.notes[i];
        if (note.lane !== lane) continue;
        const nb = note.beat.n / note.beat.d;
        if ('endBeat' in note) {
          const eb = note.endBeat.n / note.endBeat.d;
          if (beatFloat >= nb && beatFloat <= eb) {
            rightDragDeletedRef.current = true;
            const newNotes = current.notes.filter((_: unknown, idx: number) => idx !== i);
            let newTrillZones = current.trillZones;
            if (note.type === 'long' || note.type === 'doubleLong' || note.type === 'trillLong') {
              const rangeNote = note as RangeNote;
              newTrillZones = current.trillZones.filter((zone: { lane: Lane; beat: Beat; endBeat: Beat }) =>
                !(zone.lane === rangeNote.lane && beatEq(zone.beat, rangeNote.beat) && beatEq(zone.endBeat, rangeNote.endBeat))
              );
            }
            setChart({ ...current, notes: newNotes, trillZones: newTrillZones });
            return;
          }
        } else {
          if (Math.abs(beatFloat - nb) < 1 / 16) {
            rightDragDeletedRef.current = true;
            setChart({ ...current, notes: current.notes.filter((_: unknown, idx: number) => idx !== i) });
            return;
          }
        }
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
      selectModeRef.current.onPointerMove(x, y);

      if (selectModeRef.current.isBoxSelecting && rendererRef.current) {
        const boxRect = selectModeRef.current.boxSelectPixelRect;
        if (boxRect) {
          rendererRef.current.setBoxSelectRect(boxRect);
          rendererRef.current.render();
        }
      }

      if (selectModeRef.current.isMoveDragging && rendererRef.current) {
        const origins = selectModeRef.current.moveOrigins;
        if (origins.size > 0) {
          const originData: { note: import('../../shared').NoteEntity; beat: import('../../shared').Beat; endBeat?: import('../../shared').Beat; lane: import('../../shared').Lane }[] = [];
          for (const [idx, pos] of origins) {
            originData.push({ note: useEditorStore.getState().chart.notes[idx], beat: pos.beat, endBeat: pos.endBeat, lane: pos.lane });
          }
          rendererRef.current.setMoveOrigins(originData);
        }
      }
    }
  }, [
    mode, entityType, xToLane, xToExtraLane, yToBeat, snapBeat,
    bpmMarkers, isTimeInBounds, setChart, setExtraNotes,
    setSelectedExtraNotes, updateTouchPoint, updateTouchMovement,
    handlePinchMove, canvasRef, createModeRef, hitTestExtraNoteRef,
    hitTestNoteRef, isDraggingCursorRef, playbackRef, rendererRef,
    selectModeRef, yToBeatRawRef, deleteAtPoint,
    onNavigationInteraction,
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
      wasPinching = pinchPreviousDistanceRef.current !== null || activeTouchPointsRef.current.size >= 2;
      removeTouchPoint(e.pointerId);
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
      if (touchDeleteCandidate.fired || !touchDeleteCandidate.moved) {
        deleteAtPoint(x, y);
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    if (touchEmptySelectCandidate) {
      if (mode === 'select' && selectModeRef.current) {
        if (!selectModeRef.current.isBoxSelecting) {
          selectModeRef.current.onPointerDown(touchEmptySelectCandidate.x, touchEmptySelectCandidate.y, false, false);
        }
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
      if (touchCreateCandidate.fired) {
        if (!isTimeInBounds(y)) {
          createModeRef.current.cancelDrag();
        } else {
          createModeRef.current.onPointerUp(x, y);
        }
      } else if (!touchCreateCandidate.moved && isTimeInBounds(touchCreateCandidate.y)) {
        createModeRef.current.onPointerDown(touchCreateCandidate.x, touchCreateCandidate.y);
      }
      rendererRef.current?.hideGhostNote();
      return;
    }

    if (longPressFired && selectModeRef.current) {
      selectModeRef.current.onPointerUp(x, y);
      rendererRef.current?.clearMoveOrigins();
      rendererRef.current?.clearBoxSelectRect();
    } else if (mode === 'create' && createModeRef.current) {
      if (!isTimeInBounds(y)) {
        createModeRef.current.cancelDrag();
        rendererRef.current?.hideGhostNote();
      } else {
        createModeRef.current.onPointerUp(x, y);
      }
    } else if (mode === 'select' && selectModeRef.current) {
      selectModeRef.current.onPointerUp(x, y);
      rendererRef.current?.clearMoveOrigins();
      rendererRef.current?.clearBoxSelectRect();
    }

    const tapToggle = touchTapToggleRef.current;
    if (
      e.pointerType === 'touch' &&
      tapToggle?.pointerId === e.pointerId &&
      tapToggle.kind === 'note' &&
      !tapToggle.moved &&
      !longPressFired &&
      selectModeRef.current
    ) {
      selectModeRef.current.onPointerDown(
        tapToggle.x,
        tapToggle.y,
        false,
        false,
        touchMultiSelectRef.current,
      );
    }
    if (
      e.pointerType === 'touch' &&
      tapToggle?.pointerId === e.pointerId &&
      tapToggle.kind === 'extra' &&
      !tapToggle.moved &&
      !longPressFired &&
      selectModeRef.current
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
    mode, isTimeInBounds, removeTouchPoint, clearLongPress,
    updateTouchMovement, canvasRef, createModeRef, isDraggingCursorRef,
    deleteAtPoint, rendererRef, selectModeRef,
  ]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      removeTouchPoint(e.pointerId);
      clearLongPress();
      cancelTouchCreateCandidate();
      clearTouchEmptySelectCandidate();
      touchDeleteCandidateRef.current = null;
      touchTapToggleRef.current = null;
      touchNavigationModeRef.current = null;
      touchNavigationStartDistanceRef.current = null;
      touchNavigationStartCenterRef.current = null;
    }
    rendererRef.current?.handleMinimapPointerUp();
    rendererRef.current?.clearMoveOrigins();
    rendererRef.current?.clearBoxSelectRect();
    createModeRef.current?.cancelDrag();
  }, [cancelTouchCreateCandidate, clearLongPress, clearTouchEmptySelectCandidate, createModeRef, removeTouchPoint, rendererRef]);

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
      setExtraNotes(currentExtra.filter((_n, i) => i !== extraHitIdx));
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
      const zone = currentChart.trillZones[zoneIdx];
      const hasNotes = currentChart.notes.some((n) =>
        n.lane === zone.lane &&
        n.beat.n / n.beat.d >= zone.beat.n / zone.beat.d &&
        n.beat.n / n.beat.d <= zone.endBeat.n / zone.endBeat.d
      );
      if (hasNotes) {
        addToast('Zone contains notes — remove them first');
      } else {
        setChart({
          ...currentChart,
          trillZones: currentChart.trillZones.filter((_, i) => i !== zoneIdx),
        });
      }
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
