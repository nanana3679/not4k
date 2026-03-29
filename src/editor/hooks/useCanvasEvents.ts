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
import { hitTestRangeNoteRegion, noteExistsAtSnap, extraNoteExistsAtSnap, SNAP_POSITION_TOLERANCE } from '../timeline/hitTest';
import { beatToMs, beatEq } from '../../shared';
import type { Beat, Lane, RangeNote } from '../../shared';
import { useEditorStore } from '../stores';
import type { CoordinateHelpers } from './useCoordinateHelpers';

export interface CanvasEventHandlers {
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerLeave: () => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  rightDragDeletedRef: RefObject<boolean>;
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
    xToLane, xToAuxLane, xToExtraLane,
    yToBeat, yToBeatRaw, snapBeat,
    bpmMarkers,
    hitTestNoteRef, hitTestExtraNoteRef,
    yToBeatRawRef,
    hitTestNote, hitTestTrillZone, hitTestExtraNote,
  } = coords;

  const rightDragDeletedRef = useRef(false);

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
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current?.handleMinimapPointerDown(rawX, y)) {
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const x = rawX - (rendererRef.current?.contentOffsetX ?? 0);

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
      selectModeRef.current.onPointerDown(x, y, e.shiftKey, e.altKey);
    } else if (mode === 'delete' && deleteModeRef.current) {
      deleteModeRef.current.onPointerDown(x, y);
    }
  }, [mode, isTimeInBounds, chart.notes, xToLane, yToBeatRaw]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current?.handleMinimapPointerMove(rawX, y)) return;

    const x = rawX - (rendererRef.current?.contentOffsetX ?? 0);

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
  }, [mode, entityType, xToLane, xToAuxLane, xToExtraLane, yToBeat, snapBeat, bpmMarkers, isTimeInBounds, setChart, setExtraNotes, setSelectedExtraNotes]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    rendererRef.current?.handleMinimapPointerUp();

    if (isDraggingCursorRef.current) {
      isDraggingCursorRef.current = false;
      return;
    }

    if (e.button === 2) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) - (rendererRef.current?.contentOffsetX ?? 0);
    const y = e.clientY - rect.top;

    if (mode === 'create' && createModeRef.current) {
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
  }, [mode, isTimeInBounds]);

  const handlePointerLeave = useCallback(() => {
    rendererRef.current?.hideGhostNote();
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) - (rendererRef.current?.contentOffsetX ?? 0);
    const y = e.clientY - rect.top;

    const hit = hitTestMarker(x, y);
    if (hit) {
      setEditingMarker(hit);
    }
  }, [hitTestMarker, setEditingMarker]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (rightDragDeletedRef.current) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) - (rendererRef.current?.contentOffsetX ?? 0);
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
      if (currentChart.events[markerHit.index]?.beat.n === 0) {
        addToast('Cannot delete initial event marker');
        return;
      }
      setChart({
        ...currentChart,
        events: currentChart.events.filter((_, i) => i !== markerHit.index),
      });
    }
  }, [hitTestNote, hitTestTrillZone, hitTestMarker, hitTestExtraNote, setChart, setExtraNotes, setSelectedExtraNotes, addToast]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handleDoubleClick,
    handleContextMenu,
    rightDragDeletedRef,
  };
}
