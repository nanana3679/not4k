/**
 * useCanvasEvents — 캔버스 포인터 이벤트 핸들러들
 */

import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { PlaybackController } from '../playback/PlaybackController';
import type { CreateMode, SelectMode } from '../modes';
import { DeleteMode, isEventEntityType } from '../modes';
import { TIMELINE_WIDTH } from '../timeline/constants';
import { shouldRevealMinimapFromEdgeSwipe } from '../timeline/timelineViewport';
import { hitTestRangeNoteRegion, noteExistsAtSnap, extraNoteExistsAtSnap, SNAP_POSITION_TOLERANCE } from '../timeline/hitTest';
import { beatToMs, beatEq } from '../../shared';
import type { Beat, Lane, RangeNote } from '../../shared';
import { useEditorStore } from '../stores';
import type { CoordinateHelpers } from './useCoordinateHelpers';

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
const TOUCH_MOVE_CANCEL_PX = 10;
const MINIMAP_EDGE_SWIPE_START_PX = 16;
const MINIMAP_EDGE_SWIPE_REVEAL_PX = 24;

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
    hitTestNoteRef, hitTestExtraNoteRef,
    yToBeatRawRef,
    hitTestNote, hitTestTrillZone, hitTestExtraNote,
  } = coords;

  const rightDragDeletedRef = useRef(false);
  const activeTouchPointsRef = useRef<Map<number, TouchPoint>>(new Map());
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
    extraHit: number | null;
    fired: boolean;
  } | null>(null);
  const touchMultiSelectRef = useRef(false);
  const touchTapToggleRef = useRef<TouchTapToggleCandidate | null>(null);
  const suppressContextMenuUntilRef = useRef(0);
  const minimapEdgeSwipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    revealed: boolean;
  } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressRef.current = null;
  }, []);

  const updateTouchPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'touch') return;
    activeTouchPointsRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }, []);

  const removeTouchPoint = useCallback((pointerId: number) => {
    activeTouchPointsRef.current.delete(pointerId);
    if (activeTouchPointsRef.current.size < 2) {
      pinchPreviousDistanceRef.current = null;
      pinchPreviousCenterRef.current = null;
    }
  }, []);

  const startPinchIfNeeded = useCallback((): boolean => {
    const points = [...activeTouchPointsRef.current.values()];
    if (points.length < 2) return false;

    const distance = getTouchDistance(points);
    if (distance <= 0) return true;

    pinchPreviousDistanceRef.current = distance;
    pinchPreviousCenterRef.current = getTouchCenter(points);
    clearLongPress();
    createModeRef.current?.cancelDrag();
    rendererRef.current?.hideGhostNote();
    return true;
  }, [clearLongPress, createModeRef, rendererRef]);

  const handlePinchMove = useCallback((rect: DOMRect): boolean => {
    const points = [...activeTouchPointsRef.current.values()];
    if (points.length < 2) return false;

    const previousDistance = pinchPreviousDistanceRef.current;
    const previousCenter = pinchPreviousCenterRef.current;
    const currentDistance = getTouchDistance(points);
    const center = getTouchCenter(points);
    if (previousCenter) {
      onHorizontalPan?.(previousCenter.clientX - center.clientX);
    }
    if (previousDistance !== null && currentDistance > 0) {
      onPinchZoom?.(previousDistance, currentDistance, center.clientY - rect.top);
      pinchPreviousDistanceRef.current = currentDistance;
    } else if (currentDistance > 0) {
      pinchPreviousDistanceRef.current = currentDistance;
    }
    pinchPreviousCenterRef.current = center;

    return true;
  }, [onHorizontalPan, onPinchZoom]);

  const scheduleLongPress = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    x: number,
    y: number,
    noteHit: number | null,
    extraHit: number | null,
  ) => {
    if (e.pointerType !== 'touch' || mode === 'delete') return;
    if (noteHit === null && extraHit === null) return;

    clearLongPress();
    longPressRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      x,
      y,
      noteHit,
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
      if (pending.noteHit !== null) {
        selectModeRef.current?.selectNote(pending.noteHit);
        selectModeRef.current?.beginMoveDrag(pending.x, pending.y);
      } else if (pending.extraHit !== null) {
        selectModeRef.current?.selectExtraNote(pending.extraHit);
        selectModeRef.current?.beginMoveDrag(pending.x, pending.y);
      }
      rendererRef.current?.hideGhostNote();
    }, LONG_PRESS_MS);
  }, [clearLongPress, mode, rendererRef, selectModeRef]);

  const updateTouchMovement = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const pendingLongPress = longPressRef.current;
    if (pendingLongPress?.pointerId === e.pointerId && !pendingLongPress.fired) {
      const moved = Math.hypot(e.clientX - pendingLongPress.startClientX, e.clientY - pendingLongPress.startClientY);
      if (moved > TOUCH_MOVE_CANCEL_PX) {
        clearLongPress();
      }
    }

    const tapToggle = touchTapToggleRef.current;
    if (tapToggle?.pointerId === e.pointerId && !tapToggle.moved) {
      const moved = Math.hypot(e.clientX - tapToggle.startClientX, e.clientY - tapToggle.startClientY);
      if (moved > TOUCH_MOVE_CANCEL_PX) {
        tapToggle.moved = true;
      }
    }
  }, [clearLongPress]);

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

    if (e.pointerType === 'touch' && rawX <= MINIMAP_EDGE_SWIPE_START_PX) {
      minimapEdgeSwipeRef.current = {
        pointerId: e.pointerId,
        startX: rawX,
        startY: y,
        revealed: false,
      };
      clearLongPress();
      return;
    }

    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;
    const touchNoteHit = e.pointerType === 'touch' ? hitTestNoteRef.current(x, y) : null;
    const touchExtraHit = e.pointerType === 'touch' ? hitTestExtraNoteRef.current(x, y) : null;

    scheduleLongPress(e, x, y, touchNoteHit, touchExtraHit);

    const curTimelineWidth = rendererRef.current?.currentTimelineWidth ?? TIMELINE_WIDTH;
    if (x >= curTimelineWidth && rendererRef.current) {
      isDraggingCursorRef.current = true;
      const timeMs = rendererRef.current.clampToMeasureRange(rendererRef.current.yToTime(y));
      playbackRef.current?.seekTo(timeMs);
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

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
      selectModeRef.current.onPointerDown(x, y, e.shiftKey, e.altKey);
    } else if (mode === 'delete' && deleteModeRef.current) {
      deleteModeRef.current.onPointerDown(x, y);
    }
  }, [
    mode, isTimeInBounds, chart.notes, xToLane, yToBeatRaw,
    updateTouchPoint, startPinchIfNeeded, scheduleLongPress,
    canvasRef, createModeRef, deleteModeRef, hitTestExtraNoteRef,
    hitTestNoteRef, isDraggingCursorRef, playbackRef, rendererRef,
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

    const edgeSwipe = minimapEdgeSwipeRef.current;
    if (e.pointerType === 'touch' && edgeSwipe?.pointerId === e.pointerId) {
      if (!edgeSwipe.revealed && shouldRevealMinimapFromEdgeSwipe({
        startX: edgeSwipe.startX,
        startY: edgeSwipe.startY,
        currentX: rawX,
        currentY: y,
        edgeWidth: MINIMAP_EDGE_SWIPE_START_PX,
        revealDistance: MINIMAP_EDGE_SWIPE_REVEAL_PX,
      })) {
        edgeSwipe.revealed = true;
        onNavigationInteraction?.();
      }
      return;
    }

    if (rendererRef.current?.handleMinimapPointerMove(rawX, y)) {
      onNavigationInteraction?.();
      return;
    }

    const x = rendererRef.current?.screenXToTimelineX(rawX) ?? rawX;

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
    selectModeRef, yToBeatRawRef, onNavigationInteraction,
  ]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    let wasPinching = false;
    let longPressFired = false;
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
      if (minimapEdgeSwipeRef.current?.pointerId === e.pointerId) {
        minimapEdgeSwipeRef.current = null;
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
    rendererRef, selectModeRef,
  ]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      removeTouchPoint(e.pointerId);
      clearLongPress();
      touchTapToggleRef.current = null;
      if (minimapEdgeSwipeRef.current?.pointerId === e.pointerId) {
        minimapEdgeSwipeRef.current = null;
      }
    }
    rendererRef.current?.handleMinimapPointerUp();
    rendererRef.current?.clearMoveOrigins();
    rendererRef.current?.clearBoxSelectRect();
    createModeRef.current?.cancelDrag();
  }, [clearLongPress, createModeRef, removeTouchPoint, rendererRef]);

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
