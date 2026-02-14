/**
 * not4k Chart Editor — Main App Component
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { TimelineRenderer } from './timeline/TimelineRenderer';
import { SnapZoomController } from './timeline/SnapZoomController';
import { getWaveformPeaks } from './timeline/waveform';
import { PlaybackController } from './playback/PlaybackController';
import { CreateMode, SelectMode, DeleteMode } from './modes';
import type { EntityType } from './modes';
import { useEditorStore } from './stores';
import { saveChartToFile, loadChartFromFile } from './io/ChartIO';
import { LANE_WIDTH, AUX_LANE_WIDTH, LANE_COUNT, TIMELINE_WIDTH } from './timeline/constants';
import { msToBeat, beatToMs, measureStartBeat } from '@not4k/shared';
import type { Beat, Lane } from '@not4k/shared';

export function App() {
  // Refs for imperative objects
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TimelineRenderer | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const snapZoomRef = useRef<SnapZoomController | null>(null);
  const playbackRef = useRef<PlaybackController | null>(null);
  const createModeRef = useRef<CreateMode | null>(null);
  const selectModeRef = useRef<SelectMode | null>(null);
  const deleteModeRef = useRef<DeleteMode | null>(null);
  const isDraggingCursorRef = useRef(false);
  const cKeyHeldRef = useRef(false);
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [volume, setVolume] = useState(1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showCustomSnapModal, setShowCustomSnapModal] = useState(false);

  // Get state from store
  const {
    chart,
    mode,
    entityType,
    zoom,
    snapDivision,
    scrollY,
    isPlaying,
    currentTimeMs,
    selectedNotes,
    setChart,
    setMode,
    setEntityType,
    setZoom,
    setSnapDivision,
    setScrollY,
    setIsPlaying,
    setCurrentTimeMs,
    setSelectedNotes,
    toasts,
    addToast,
    editingMarker,
    setEditingMarker,
  } = useEditorStore();

  // Helper: X to Lane (1-4 for note lanes, null otherwise)
  const xToLane = useCallback((x: number): Lane | null => {
    const lane = Math.floor(x / LANE_WIDTH) + 1;
    if (lane >= 1 && lane <= LANE_COUNT) {
      return lane as Lane;
    }
    return null;
  }, []);

  // Helper: X to Aux Lane ('bpm' | 'timeSig' | 'message' | null)
  const xToAuxLane = useCallback((x: number): 'bpm' | 'timeSig' | 'message' | null => {
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    if (x < auxStartX) return null;

    const auxIndex = Math.floor((x - auxStartX) / AUX_LANE_WIDTH);
    if (auxIndex === 0) return 'bpm';
    if (auxIndex === 1) return 'timeSig';
    if (auxIndex === 2) return 'message';
    return null;
  }, []);

  // Helper: Y to Beat (snap division N = N-th note, grid = 4/N beats)
  const yToBeat = useCallback((y: number): Beat => {
    if (!rendererRef.current) return { n: 0, d: 1 };
    const timeMs = rendererRef.current.yToTime(y);
    const beatFloat = msToBeat(timeMs, chart.bpmMarkers, chart.meta.offsetMs);
    // Grid = 4/snapDivision beats (e.g., snap=16 → 0.25 beats = sixteenth note)
    const grid = 4 / snapDivision;
    const k = Math.round(beatFloat / grid);
    return { n: k * 4, d: snapDivision };
  }, [chart.bpmMarkers, chart.meta.offsetMs, snapDivision]);

  // Helper: Snap Beat
  const snapBeat = useCallback((beat: Beat): Beat => {
    if (!snapZoomRef.current) return beat;
    return snapZoomRef.current.snapBeat(beat);
  }, []);

  // Helper: Get max beat (float) of the timeline
  const getMaxBeatFloat = useCallback((): number => {
    if (!rendererRef.current) return 0;
    const totalMs = rendererRef.current.getTotalTimelineMs();
    return msToBeat(totalMs, chart.bpmMarkers, chart.meta.offsetMs);
  }, [chart.bpmMarkers, chart.meta.offsetMs]);

  // Callback refs to avoid stale closures in mode handlers
  const yToBeatRef = useRef(yToBeat);
  const getMaxBeatFloatRef = useRef(getMaxBeatFloat);
  const hitTestNoteRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestNoteEndRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestMessageEndRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestTrillZoneEndRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestTrillZoneRef = useRef<(x: number, y: number) => number | null>(() => null);

  // Helper: Hit test note
  const hitTestNote = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;

    const beat = yToBeat(y);

    // Simple hit test: find note at lane and beat (within NOTE_HEIGHT/2)
    for (let i = 0; i < chart.notes.length; i++) {
      const note = chart.notes[i];
      if (note.lane !== lane) continue;

      // Check if beat is within note bounds
      const noteBeat = note.beat;
      const noteBeatFloat = noteBeat.n / noteBeat.d;
      const testBeatFloat = beat.n / beat.d;

      // For range notes, check if within range
      if ('endBeat' in note) {
        const endBeatFloat = note.endBeat.n / note.endBeat.d;
        if (testBeatFloat >= noteBeatFloat && testBeatFloat <= endBeatFloat) {
          return i;
        }
      } else {
        // For point notes, check if within 1/16 beat tolerance
        const tolerance = 1 / 16;
        if (Math.abs(testBeatFloat - noteBeatFloat) < tolerance) {
          return i;
        }
      }
    }

    return null;
  }, [chart.notes, xToLane, yToBeat]);

  // Helper: Hit test note end (for selected RangeNote endpoint resize)
  const hitTestNoteEnd = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;

    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 16;

    for (let i = 0; i < chart.notes.length; i++) {
      const note = chart.notes[i];
      if (note.lane !== lane) continue;
      if (!selectedNotes.has(i)) continue;
      if (!('endBeat' in note)) continue;

      const endBeatFloat = note.endBeat.n / note.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) {
        return i;
      }
    }
    return null;
  }, [chart.notes, selectedNotes, xToLane, yToBeat]);

  // Helper: Hit test message end (for endpoint resize)
  const hitTestMessageEnd = useCallback((x: number, y: number): number | null => {
    const auxLane = xToAuxLane(x);
    if (auxLane !== 'message') return null;

    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 8;

    for (let i = 0; i < chart.messages.length; i++) {
      const msg = chart.messages[i];
      const endBeatFloat = msg.endBeat.n / msg.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) {
        return i;
      }
    }
    return null;
  }, [chart.messages, xToAuxLane, yToBeat]);

  // Helper: Hit test trill zone end (for endpoint resize)
  const hitTestTrillZoneEnd = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;

    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 16;

    for (let i = 0; i < chart.trillZones.length; i++) {
      const zone = chart.trillZones[i];
      if (zone.lane !== lane) continue;

      const endBeatFloat = zone.endBeat.n / zone.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) {
        return i;
      }
    }
    return null;
  }, [chart.trillZones, xToLane, yToBeat]);

  // Helper: Hit test trill zone
  const hitTestTrillZone = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;

    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;

    for (let i = 0; i < chart.trillZones.length; i++) {
      const zone = chart.trillZones[i];
      if (zone.lane !== lane) continue;

      const startFloat = zone.beat.n / zone.beat.d;
      const endFloat = zone.endBeat.n / zone.endBeat.d;
      if (testBeatFloat >= startFloat && testBeatFloat <= endFloat) {
        return i;
      }
    }
    return null;
  }, [chart.trillZones, xToLane, yToBeat]);

  // Sync callback refs (avoids stale closures in mode handlers)
  useEffect(() => {
    yToBeatRef.current = yToBeat;
    getMaxBeatFloatRef.current = getMaxBeatFloat;
    hitTestNoteRef.current = hitTestNote;
    hitTestNoteEndRef.current = hitTestNoteEnd;
    hitTestMessageEndRef.current = hitTestMessageEnd;
    hitTestTrillZoneEndRef.current = hitTestTrillZoneEnd;
    hitTestTrillZoneRef.current = hitTestTrillZone;
  });

  // Track 'C' key state for entity type cycling (getModifierState doesn't work for letter keys)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.code === 'KeyC') cKeyHeldRef.current = true; };
    const onUp = (e: KeyboardEvent) => { if (e.code === 'KeyC') cKeyHeldRef.current = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Initialize on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;

    // Measure container for initial size
    const container = canvasContainerRef.current;
    const initWidth = container?.clientWidth ?? 800;
    const initHeight = container?.clientHeight ?? 600;
    setCanvasSize({ width: initWidth, height: initHeight });

    // Create TimelineRenderer
    const renderer = new TimelineRenderer({
      canvas,
      width: initWidth,
      height: initHeight,
      onScroll: (newScrollY) => setScrollY(newScrollY),
    });

    renderer.init().then(() => {
      if (!mounted) return;

      rendererRef.current = renderer;
      renderer.setChart(chart);
      renderer.zoom = zoom;
      renderer.snap = snapDivision;

      // Start scrolled to bottom (time 0 visible)
      const initScroll = Math.max(0, renderer.totalTimelineHeight - initHeight);
      setScrollY(initScroll);
      renderer.scrollY = initScroll;
    });

    // Create SnapZoomController
    const snapZoom = new SnapZoomController(
      {
        onZoomChange: setZoom,
        onSnapChange: setSnapDivision,
      },
      { zoom, snapDivision }
    );
    snapZoomRef.current = snapZoom;

    // Create PlaybackController
    const playback = new PlaybackController({
      onTimeUpdate: setCurrentTimeMs,
      onPlayStateChange: setIsPlaying,
    });
    playbackRef.current = playback;

    // Create mode handlers (use refs for callbacks to avoid stale closures)
    const createMode = new CreateMode(chart, {
      onChartUpdate: setChart,
      yToBeat: (y) => yToBeatRef.current(y),
      snapBeat,
      xToLane,
      xToAuxLane,
      onWarn: (msg) => addToast(msg, 'warn'),
    });
    createModeRef.current = createMode;

    const selectMode = new SelectMode(chart, {
      onChartUpdate: setChart,
      onSelectionChange: setSelectedNotes,
      yToBeat: (y) => yToBeatRef.current(y),
      snapBeat,
      getSnapStep: () => {
        const sd = snapZoomRef.current?.snapDivision ?? 4;
        return { n: 4, d: sd };
      },
      getMaxBeatFloat: () => getMaxBeatFloatRef.current(),
      xToLane,
      hitTestNote: (x, y) => hitTestNoteRef.current(x, y),
      hitTestNoteEnd: (x, y) => hitTestNoteEndRef.current(x, y),
      hitTestMessageEnd: (x, y) => hitTestMessageEndRef.current(x, y),
      hitTestTrillZoneEnd: (x, y) => hitTestTrillZoneEndRef.current(x, y),
    });
    selectModeRef.current = selectMode;

    const deleteMode = new DeleteMode(chart, {
      onChartUpdate: setChart,
      hitTestNote: (x, y) => hitTestNoteRef.current(x, y),
      hitTestTrillZone: (x, y) => hitTestTrillZoneRef.current(x, y),
      onWarn: (msg) => addToast(msg, 'warn'),
    });
    deleteModeRef.current = deleteMode;

    return () => {
      mounted = false;
      renderer.dispose();
      snapZoom.dispose();
      playback.dispose();
    };
  }, []); // Only run once on mount

  // ResizeObserver: track container size and resize canvas/renderer
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const w = Math.floor(width);
        const h = Math.floor(height);
        if (w > 0 && h > 0) {
          setCanvasSize({ width: w, height: h });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Sync canvasSize to renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.resize(canvasSize.width, canvasSize.height);
    }
  }, [canvasSize]);

  // Sync chart changes to renderer and mode handlers
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setChart(chart);
    }
    if (createModeRef.current) {
      createModeRef.current.setChart(chart);
    }
    if (selectModeRef.current) {
      selectModeRef.current.setChart(chart);
    }
    if (deleteModeRef.current) {
      deleteModeRef.current.setChart(chart);
    }
  }, [chart]);

  // Sync zoom to renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.zoom = zoom;
    }
  }, [zoom]);

  // Sync snap to renderer and SnapZoomController
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.snap = snapDivision;
    }
    if (snapZoomRef.current) {
      snapZoomRef.current.snapDivision = snapDivision;
    }
  }, [snapDivision]);

  // Sync scrollY to renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.scrollY = scrollY;
    }
  }, [scrollY, zoom, chart]);

  // Sync selected notes to renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setSelectedNotes(selectedNotes);
    }
  }, [selectedNotes]);

  // Sync entity type to create mode
  useEffect(() => {
    if (createModeRef.current) {
      createModeRef.current.entityType = entityType;
    }
  }, [entityType]);

  // Hide ghost note when leaving create mode
  useEffect(() => {
    if (mode !== 'create') {
      rendererRef.current?.hideGhostNote();
    }
  }, [mode]);

  // Update playback cursor position + auto-scroll
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.updatePlaybackCursor(currentTimeMs);

    if (autoScroll && isPlaying) {
      // Center the cursor in the viewport
      const cursorY = renderer.timeToY(currentTimeMs);
      const targetScroll = cursorY - canvasSize.height / 2;
      const maxScroll = Math.max(0, renderer.totalTimelineHeight - canvasSize.height);
      setScrollY(Math.max(0, Math.min(maxScroll, targetScroll)));
    }
  }, [currentTimeMs, autoScroll, isPlaying, canvasSize.height]);

  // Helper: Check if Y position is within the valid timeline range (beat 0 to last measure)
  const isTimeInBounds = useCallback((y: number): boolean => {
    if (!rendererRef.current) return false;
    const timeMs = rendererRef.current.yToTime(y);
    const totalMs = rendererRef.current.getTotalTimelineMs();
    return timeMs >= 0 && timeMs <= totalMs;
  }, []);

  // Canvas event handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for scrollbar interaction first (uses raw canvas coords)
    if (rendererRef.current?.handleScrollbarPointerDown(rawX, y)) {
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    // Content-relative x (offset-adjusted)
    const x = rawX - (rendererRef.current?.contentOffsetX ?? 0);

    // Check for cursor handle drag (right edge area)
    if (x >= TIMELINE_WIDTH && rendererRef.current) {
      isDraggingCursorRef.current = true;
      const timeMs = rendererRef.current.yToTime(y);
      playbackRef.current?.seekTo(Math.max(0, timeMs));
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    // Right-click (button 2) should not trigger entity creation or selection
    if (e.button === 2) return;

    if (mode === 'create' && createModeRef.current) {
      if (!isTimeInBounds(y)) return;
      createModeRef.current.onPointerDown(x, y);
    } else if (mode === 'select' && selectModeRef.current) {
      selectModeRef.current.onPointerDown(x, y, e.shiftKey, e.altKey);
    } else if (mode === 'delete' && deleteModeRef.current) {
      deleteModeRef.current.onPointerDown(x, y);
    }
  }, [mode, isTimeInBounds]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle scrollbar drag (uses raw canvas coords)
    if (rendererRef.current?.handleScrollbarPointerMove(rawX, y)) {
      return;
    }

    // Content-relative x (offset-adjusted)
    const x = rawX - (rendererRef.current?.contentOffsetX ?? 0);

    // Handle cursor drag
    if (isDraggingCursorRef.current && rendererRef.current) {
      const timeMs = rendererRef.current.yToTime(y);
      playbackRef.current?.seekTo(Math.max(0, timeMs));
      return;
    }

    if (mode === 'create' && createModeRef.current) {
      // Hide ghost and skip if outside timeline bounds
      if (!isTimeInBounds(y)) {
        rendererRef.current?.hideGhostNote();
        return;
      }

      createModeRef.current.onPointerMove(x, y);

      // Ghost preview
      if (rendererRef.current) {
        const beat = yToBeat(y);
        const snapped = snapBeat(beat);
        const timeMs = beatToMs(snapped, chart.bpmMarkers, chart.meta.offsetMs);

        if (createModeRef.current?.dragging && createModeRef.current.dragBeat) {
          if (createModeRef.current.dragType === 'message') {
            // Message drag: show ghost marker in message aux lane
            rendererRef.current.showGhostMarker(2, timeMs);
          } else if (createModeRef.current.dragLane) {
            // Note lane range drag: show range ghost
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, chart.bpmMarkers, chart.meta.offsetMs);
            rendererRef.current.showGhostRange(createModeRef.current.dragLane, startTimeMs, timeMs);
          }
        } else {
          // Not dragging: show ghost based on hovered lane
          const auxLane = xToAuxLane(x);
          const auxIndexMap = { bpm: 0, timeSig: 1, message: 2 } as const;
          if (auxLane) {
            rendererRef.current.showGhostMarker(auxIndexMap[auxLane], timeMs);
          } else {
            const lane = xToLane(x);
            if (lane) {
              rendererRef.current.showGhostNote(lane, timeMs);
            } else {
              rendererRef.current.hideGhostNote();
            }
          }
        }
      }
    } else if (mode === 'select' && selectModeRef.current) {
      selectModeRef.current.onPointerMove(x, y);

      // Show move origin ghosts during drag
      if (selectModeRef.current.isMoveDragging && rendererRef.current) {
        const origins = selectModeRef.current.moveOrigins;
        if (origins.size > 0) {
          const originData: { note: import('@not4k/shared').NoteEntity; beat: import('@not4k/shared').Beat; endBeat?: import('@not4k/shared').Beat; lane: import('@not4k/shared').Lane }[] = [];
          for (const [idx, pos] of origins) {
            originData.push({ note: chart.notes[idx], beat: pos.beat, endBeat: pos.endBeat, lane: pos.lane });
          }
          rendererRef.current.setMoveOrigins(originData);
        }
      }
    }
  }, [mode, entityType, xToLane, yToBeat, snapBeat, chart.bpmMarkers, chart.meta.offsetMs]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    rendererRef.current?.handleScrollbarPointerUp();

    if (isDraggingCursorRef.current) {
      isDraggingCursorRef.current = false;
      return;
    }

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
    }
  }, [mode, isTimeInBounds]);

  // Wheel handler as native event (needs { passive: false } to allow preventDefault)
  const handleWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault();

    // Ctrl+wheel = zoom (via SnapZoomController)
    if (e.ctrlKey && snapZoomRef.current) {
      snapZoomRef.current.handleWheel(e);
      return;
    }

    // C+wheel = entity type cycling (create mode only)
    if (mode === 'create' && createModeRef.current) {
      if (createModeRef.current.onWheel(e.deltaY, cKeyHeldRef.current)) {
        setEntityType(createModeRef.current.entityType);
        return;
      }
    }

    // Default: scroll (normal direction)
    const maxScroll = rendererRef.current
      ? Math.max(0, rendererRef.current.totalTimelineHeight - canvasSize.height)
      : Infinity;
    setScrollY(Math.min(maxScroll, Math.max(0, scrollY + e.deltaY)));
  }, [mode, scrollY, canvasSize.height, setScrollY, setEntityType]);

  // Register wheel listener with { passive: false }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheelNative);
  }, [handleWheelNative]);

  // Prevent browser Ctrl+wheel zoom globally while editor is mounted
  useEffect(() => {
    const preventBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener('wheel', preventBrowserZoom, { passive: false });
    return () => document.removeEventListener('wheel', preventBrowserZoom);
  }, []);

  const handlePointerLeave = useCallback(() => {
    rendererRef.current?.hideGhostNote();
  }, []);

  // Marker hit test for aux lanes
  const hitTestMarker = useCallback((x: number, y: number) => {
    const auxLane = xToAuxLane(x);
    if (!auxLane || !rendererRef.current) return null;

    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 8;

    if (auxLane === 'bpm') {
      for (let i = 0; i < chart.bpmMarkers.length; i++) {
        const b = chart.bpmMarkers[i].beat;
        if (Math.abs(b.n / b.d - testBeatFloat) < tolerance) {
          return { type: 'bpm' as const, index: i };
        }
      }
    } else if (auxLane === 'timeSig') {
      for (let i = 0; i < chart.timeSignatures.length; i++) {
        const markerBeat = measureStartBeat(chart.timeSignatures[i].measure, chart.timeSignatures);
        const markerBeatFloat = markerBeat.n / markerBeat.d;
        if (Math.abs(markerBeatFloat - testBeatFloat) < tolerance) {
          return { type: 'timeSig' as const, index: i };
        }
      }
    } else if (auxLane === 'message') {
      for (let i = 0; i < chart.messages.length; i++) {
        const msg = chart.messages[i];
        const startFloat = msg.beat.n / msg.beat.d;
        const endFloat = msg.endBeat.n / msg.endBeat.d;
        if (testBeatFloat >= startFloat - tolerance && testBeatFloat <= endFloat + tolerance) {
          return { type: 'message' as const, index: i };
        }
      }
    }
    return null;
  }, [chart.bpmMarkers, chart.timeSignatures, chart.messages, xToAuxLane, yToBeat]);

  // Double-click on canvas → open marker edit modal
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

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) - (rendererRef.current?.contentOffsetX ?? 0);
    const y = e.clientY - rect.top;

    // Right-click delete (mode-independent) — try note first, then trill zone
    const result = DeleteMode.deleteNoteAtPoint(chart, hitTestNote, x, y);
    if (result) {
      setChart(result);
      return;
    }
    // Try trill zone (only if no notes inside)
    const zoneIdx = hitTestTrillZone(x, y);
    if (zoneIdx !== null) {
      const zone = chart.trillZones[zoneIdx];
      const hasNotes = chart.notes.some((n) =>
        n.lane === zone.lane &&
        n.beat.n / n.beat.d >= zone.beat.n / zone.beat.d &&
        n.beat.n / n.beat.d <= zone.endBeat.n / zone.endBeat.d
      );
      if (hasNotes) {
        addToast('Zone contains notes — remove them first');
      } else {
        setChart({
          ...chart,
          trillZones: chart.trillZones.filter((_, i) => i !== zoneIdx),
        });
      }
      return;
    }

    // Try marker (bpm, timeSig, message)
    const markerHit = hitTestMarker(x, y);
    if (markerHit) {
      // Protect first markers (beat 0 / measure 0)
      if (markerHit.type === 'bpm' && chart.bpmMarkers[markerHit.index]?.beat.n === 0) {
        addToast('Cannot delete first BPM marker');
        return;
      }
      if (markerHit.type === 'timeSig' && chart.timeSignatures[markerHit.index]?.measure === 0) {
        addToast('Cannot delete first time signature marker');
        return;
      }

      const updated = { ...chart };
      if (markerHit.type === 'bpm') {
        updated.bpmMarkers = chart.bpmMarkers.filter((_, i) => i !== markerHit.index);
      } else if (markerHit.type === 'timeSig') {
        updated.timeSignatures = chart.timeSignatures.filter((_, i) => i !== markerHit.index);
      } else if (markerHit.type === 'message') {
        updated.messages = chart.messages.filter((_, i) => i !== markerHit.index);
      }
      setChart(updated);
    }
  }, [chart, hitTestNote, hitTestTrillZone, hitTestMarker, setChart, addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip all shortcuts when any modal is open
      if (editingMarker || showMetaModal || showCustomSnapModal) return;

      // Mode shortcuts
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          setMode('create');
          return;
        }
      }
      if (e.key === 's' || e.key === 'S') {
        if (!e.ctrlKey && !e.metaKey) {
          setMode('select');
          return;
        }
      }
      if (e.key === 'd' || e.key === 'D') {
        if (!e.ctrlKey && !e.metaKey) {
          setMode('delete');
          return;
        }
      }

      // Playback
      if (e.key === ' ') {
        e.preventDefault();
        playbackRef.current?.togglePlay();
        return;
      }

      // Select mode shortcuts
      if (mode === 'select' && selectModeRef.current) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (e.shiftKey) {
            selectModeRef.current.resizeEndBySnap('up');
          } else {
            selectModeRef.current.moveBySnap('up');
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (e.shiftKey) {
            selectModeRef.current.resizeEndBySnap('down');
          } else {
            selectModeRef.current.moveBySnap('down');
          }
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          selectModeRef.current.deleteSelected();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          selectModeRef.current.confirmPlacement();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, setMode, editingMarker, showMetaModal]);

  // File handlers

  const handleSaveChart = useCallback(() => {
    saveChartToFile(chart, chart.meta.title || 'chart.json');
  }, [chart]);

  const handleLoadChart = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadChartFromFile(file).then((loadedChart) => {
        setChart(loadedChart);
      });
    }
  }, [setChart]);

  // Marker edit handlers
  const isEditingBeatZero = editingMarker && (
    (editingMarker.type === 'bpm' && chart.bpmMarkers[editingMarker.index]?.beat.n === 0) ||
    (editingMarker.type === 'timeSig' && chart.timeSignatures[editingMarker.index]?.measure === 0)
  );

  const handleMarkerSave = useCallback((values: Record<string, string>) => {
    if (!editingMarker) return;

    const updated = { ...chart };
    if (editingMarker.type === 'bpm') {
      const bpm = parseFloat(values.bpm);
      if (isNaN(bpm) || bpm <= 0) { addToast('Invalid BPM value'); return; }
      updated.bpmMarkers = [...chart.bpmMarkers];
      updated.bpmMarkers[editingMarker.index] = { ...updated.bpmMarkers[editingMarker.index], bpm };
    } else if (editingMarker.type === 'timeSig') {
      const n = parseInt(values.numerator);
      const d = parseInt(values.denominator);
      if (isNaN(n) || isNaN(d) || n <= 0 || d <= 0) { addToast('Invalid time signature'); return; }
      updated.timeSignatures = [...chart.timeSignatures];
      updated.timeSignatures[editingMarker.index] = {
        ...updated.timeSignatures[editingMarker.index],
        beatPerMeasure: { n, d },
      };
    } else if (editingMarker.type === 'message') {
      updated.messages = [...chart.messages];
      updated.messages[editingMarker.index] = {
        ...updated.messages[editingMarker.index],
        text: values.text,
      };
    }

    setChart(updated);
    // Directly update renderer to bypass React async useEffect timing
    rendererRef.current?.setChart(updated);
    setEditingMarker(null);
  }, [editingMarker, chart, setChart, setEditingMarker, addToast]);

  const handleMarkerDelete = useCallback(() => {
    if (!editingMarker) return;

    if (isEditingBeatZero) {
      addToast('Cannot delete marker at measure 0');
      return;
    }

    const updated = { ...chart };
    if (editingMarker.type === 'bpm') {
      updated.bpmMarkers = chart.bpmMarkers.filter((_, i) => i !== editingMarker.index);
    } else if (editingMarker.type === 'timeSig') {
      updated.timeSignatures = chart.timeSignatures.filter((_, i) => i !== editingMarker.index);
    } else if (editingMarker.type === 'message') {
      updated.messages = chart.messages.filter((_, i) => i !== editingMarker.index);
    }

    setChart(updated);
    setEditingMarker(null);
  }, [editingMarker, isEditingBeatZero, chart, setChart, setEditingMarker, addToast]);

  const entityTypeOptions: EntityType[] = [
    'single',
    'double',
    'singleLong',
    'doubleLong',
    'trillZone',
  ];

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        {/* Mode buttons */}
        <button
          style={{ ...styles.button, ...(mode === 'create' ? styles.buttonActive : {}) }}
          onClick={() => setMode('create')}
        >
          Create
        </button>
        <button
          style={{ ...styles.button, ...(mode === 'select' ? styles.buttonActive : {}) }}
          onClick={() => setMode('select')}
        >
          Select
        </button>
        <button
          style={{ ...styles.button, ...(mode === 'delete' ? styles.buttonActive : {}) }}
          onClick={() => setMode('delete')}
        >
          Delete
        </button>

        {/* Entity type dropdown (create mode only) */}
        {mode === 'create' && (
          <select
            style={styles.select}
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
          >
            {entityTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        )}

        <div style={styles.separator} />

        {/* Snap selector */}
        <span style={styles.label}>Snap:</span>
        <select
          style={styles.select}
          value={[4, 8, 16, 32, 3, 6, 12, 24, 48].includes(snapDivision) ? String(snapDivision) : 'custom'}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'custom') {
              setShowCustomSnapModal(true);
            } else {
              setSnapDivision(parseInt(val));
            }
          }}
        >
          <optgroup label="2-beat">
            <option value="4">1/4</option>
            <option value="8">1/8</option>
            <option value="16">1/16</option>
            <option value="32">1/32</option>
          </optgroup>
          <optgroup label="3-beat">
            <option value="3">1/3</option>
            <option value="6">1/6</option>
            <option value="12">1/12</option>
            <option value="24">1/24</option>
            <option value="48">1/48</option>
          </optgroup>
          <option value="custom">Custom ({[4,8,16,32,3,6,12,24,48].includes(snapDivision) ? '...' : `1/${snapDivision}`})</option>
        </select>

        {/* Zoom display */}
        <span style={styles.label}>Zoom: {zoom.toFixed(0)}px/s</span>

        <div style={styles.separator} />

        {/* Play/Pause */}
        <button style={styles.button} onClick={() => playbackRef.current?.togglePlay()}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        {/* Volume */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setVolume(v);
            if (playbackRef.current) playbackRef.current.volume = v;
          }}
          style={styles.volumeSlider}
          title={`Volume: ${Math.round(volume * 100)}%`}
        />

        {/* Auto-scroll toggle */}
        <button
          style={{ ...styles.button, ...(autoScroll ? styles.buttonActive : {}) }}
          onClick={() => setAutoScroll(!autoScroll)}
          title="Auto-scroll: follow playback cursor"
        >
          Scroll
        </button>

        <div style={{ flex: 1 }} />

        {/* File operations */}
        <button style={styles.button} onClick={() => setShowMetaModal(true)}>
          Meta
        </button>

        <button style={styles.button} onClick={handleSaveChart}>
          Save Chart
        </button>

        <label style={styles.fileLabel}>
          Load Chart
          <input
            type="file"
            accept=".json"
            style={styles.fileInput}
            onChange={handleLoadChart}
          />
        </label>
      </div>

      {/* Canvas */}
      <div ref={canvasContainerRef} style={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* Marker Edit Modal */}
      {editingMarker && (
        <MarkerEditModal
          editingMarker={editingMarker}
          chart={chart}
          isBeatZero={!!isEditingBeatZero}
          onSave={handleMarkerSave}
          onDelete={handleMarkerDelete}
          onClose={() => setEditingMarker(null)}
        />
      )}

      {/* Meta Edit Modal */}
      {showMetaModal && (
        <MetaEditModal
          meta={chart.meta}
          onSave={(meta) => {
            setChart({ ...chart, meta });
            setShowMetaModal(false);
          }}
          onClose={() => setShowMetaModal(false)}
          onLoadAudio={(file) => {
            if (playbackRef.current) {
              playbackRef.current.loadAudioFile(file).then(() => {
                const audioBuffer = playbackRef.current?.audioBufferData;
                if (audioBuffer && rendererRef.current) {
                  const samplesPerPeak = Math.ceil(audioBuffer.sampleRate / 50);
                  const peaks = getWaveformPeaks(audioBuffer, samplesPerPeak);
                  const durationMs = audioBuffer.duration * 1000;
                  rendererRef.current.setWaveformData(peaks, durationMs);
                }
              });
            }
          }}
        />
      )}

      {/* Custom Snap Modal */}
      {showCustomSnapModal && (
        <CustomSnapModal
          currentSnap={snapDivision}
          onSave={(value) => {
            setSnapDivision(value);
            setShowCustomSnapModal(false);
          }}
          onClose={() => setShowCustomSnapModal(false)}
        />
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div style={styles.toastContainer}>
          {toasts.map((toast) => (
            <div key={toast.id} style={styles.toast}>
              {toast.message}
            </div>
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div style={styles.bottomBar}>
        <span>Time: {(currentTimeMs / 1000).toFixed(2)}s</span>
        <span style={{ marginLeft: '20px' }}>
          Selected: {selectedNotes.size} notes
        </span>
        <span style={{ marginLeft: '20px' }}>
          Total: {chart.notes.length} notes
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marker Edit Modal
// ---------------------------------------------------------------------------

import type { EditingMarker } from './stores';
import type { Chart } from '@not4k/shared';

function MarkerEditModal({ editingMarker, chart, isBeatZero, onSave, onDelete, onClose }: {
  editingMarker: NonNullable<EditingMarker>;
  chart: Chart;
  isBeatZero: boolean;
  onSave: (values: Record<string, string>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const getInitialValues = (): Record<string, string> => {
    if (editingMarker.type === 'bpm') {
      return { bpm: String(chart.bpmMarkers[editingMarker.index]?.bpm ?? 120) };
    } else if (editingMarker.type === 'timeSig') {
      const bpm = chart.timeSignatures[editingMarker.index]?.beatPerMeasure;
      return { numerator: String(bpm?.n ?? 4), denominator: String(bpm?.d ?? 1) };
    } else {
      return { text: chart.messages[editingMarker.index]?.text ?? '' };
    }
  };

  const [values, setValues] = useState<Record<string, string>>(getInitialValues);

  const title = editingMarker.type === 'bpm' ? 'Edit BPM Marker'
    : editingMarker.type === 'timeSig' ? 'Edit Time Signature'
    : 'Edit Message';

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>{title}</h3>

        {editingMarker.type === 'bpm' && (
          <label style={modalStyles.field}>
            <span>BPM</span>
            <input
              style={modalStyles.input}
              type="number"
              value={values.bpm}
              onChange={(e) => setValues({ ...values, bpm: e.target.value })}
              autoFocus
            />
          </label>
        )}

        {editingMarker.type === 'timeSig' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <label style={modalStyles.field}>
              <span>Numerator</span>
              <input
                style={modalStyles.input}
                type="number"
                value={values.numerator}
                onChange={(e) => setValues({ ...values, numerator: e.target.value })}
                autoFocus
              />
            </label>
            <label style={modalStyles.field}>
              <span>Denominator</span>
              <input
                style={modalStyles.input}
                type="number"
                value={values.denominator}
                onChange={(e) => setValues({ ...values, denominator: e.target.value })}
              />
            </label>
          </div>
        )}

        {editingMarker.type === 'message' && (
          <label style={modalStyles.field}>
            <span>Text</span>
            <input
              style={modalStyles.input}
              type="text"
              value={values.text}
              onChange={(e) => setValues({ ...values, text: e.target.value })}
              autoFocus
            />
          </label>
        )}

        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={() => onSave(values)}>Save</button>
          <button
            style={{ ...modalStyles.deleteBtn, opacity: isBeatZero ? 0.4 : 1 }}
            onClick={onDelete}
            disabled={isBeatZero}
            title={isBeatZero ? 'Cannot delete first marker' : 'Delete marker'}
          >
            Delete
          </button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta Edit Modal
// ---------------------------------------------------------------------------

import type { ChartMeta } from '@not4k/shared';

function MetaEditModal({ meta, onSave, onClose, onLoadAudio }: {
  meta: ChartMeta;
  onSave: (meta: ChartMeta) => void;
  onClose: () => void;
  onLoadAudio: (file: File) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    title: meta.title,
    artist: meta.artist,
    difficultyLabel: meta.difficultyLabel,
    difficultyLevel: String(meta.difficultyLevel),
    offsetMs: String(meta.offsetMs),
    audioFile: meta.audioFile,
    imageFile: meta.imageFile,
    previewAudioFile: meta.previewAudioFile,
  });

  const set = (key: string, val: string) => setValues({ ...values, [key]: val });

  const handleSave = () => {
    const level = parseInt(values.difficultyLevel);
    const offset = parseFloat(values.offsetMs);
    onSave({
      ...meta,
      title: values.title,
      artist: values.artist,
      difficultyLabel: values.difficultyLabel,
      difficultyLevel: isNaN(level) ? meta.difficultyLevel : level,
      offsetMs: isNaN(offset) ? meta.offsetMs : offset,
      audioFile: values.audioFile,
      imageFile: values.imageFile,
      previewAudioFile: values.previewAudioFile,
    });
  };

  const fields: { label: string; key: string; type: string }[] = [
    { label: 'Title', key: 'title', type: 'text' },
    { label: 'Artist', key: 'artist', type: 'text' },
    { label: 'Difficulty Label', key: 'difficultyLabel', type: 'text' },
    { label: 'Difficulty Level', key: 'difficultyLevel', type: 'number' },
    { label: 'Offset (ms)', key: 'offsetMs', type: 'number' },
    { label: 'Audio File', key: 'audioFile', type: 'text' },
    { label: 'Image File', key: 'imageFile', type: 'text' },
    { label: 'Preview Audio', key: 'previewAudioFile', type: 'text' },
  ];

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>Chart Metadata</h3>

        {fields.map((f) => (
          <label key={f.key} style={modalStyles.field}>
            <span>{f.label}</span>
            <input
              style={modalStyles.input}
              type={f.type}
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </label>
        ))}

        <label style={{ ...modalStyles.field, flexDirection: 'row' as const, alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span style={{ padding: '4px 12px', backgroundColor: '#3a3a3a', border: '1px solid #555', borderRadius: '4px', fontSize: '13px' }}>
            Load Audio
          </span>
          <input
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                set('audioFile', file.name);
                onLoadAudio(file);
              }
            }}
          />
          <span style={{ fontSize: '12px', color: '#999' }}>{values.audioFile || 'No file'}</span>
        </label>

        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={handleSave}>Save</button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Snap Modal
// ---------------------------------------------------------------------------

function CustomSnapModal({ currentSnap, onSave, onClose }: {
  currentSnap: number;
  onSave: (value: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(String(currentSnap));

  const handleSave = () => {
    const n = parseInt(value);
    if (isNaN(n) || n < 1 || n > 128) return;
    onSave(n);
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>Custom Snap Division</h3>
        <label style={modalStyles.field}>
          <span>1 / N (1~128)</span>
          <input
            style={modalStyles.input}
            type="number"
            min="1"
            max="128"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            autoFocus
          />
        </label>
        <div style={modalStyles.buttons}>
          <button style={modalStyles.saveBtn} onClick={handleSave}>Apply</button>
          <button style={modalStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const modalStyles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    backgroundColor: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '8px',
    padding: '20px',
    minWidth: '280px',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
  },
  title: {
    margin: '0 0 16px',
    fontSize: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    marginBottom: '12px',
    fontSize: '13px',
  },
  input: {
    padding: '6px 8px',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    fontSize: '14px',
  },
  buttons: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
  },
  saveBtn: {
    padding: '6px 16px',
    backgroundColor: '#4488ff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  deleteBtn: {
    padding: '6px 16px',
    backgroundColor: '#cc3333',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  cancelBtn: {
    padding: '6px 16px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    marginLeft: 'auto',
  },
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #333',
    height: '40px',
  },
  button: {
    padding: '4px 12px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  buttonActive: {
    backgroundColor: '#4488ff',
    borderColor: '#4488ff',
  },
  select: {
    padding: '4px 8px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    fontSize: '13px',
  },
  label: {
    fontSize: '13px',
    marginLeft: '8px',
  },
  separator: {
    width: '1px',
    height: '24px',
    backgroundColor: '#555',
    margin: '0 8px',
  },
  volumeSlider: {
    width: '60px',
    height: '4px',
    cursor: 'pointer',
    accentColor: '#4488ff',
  },
  fileLabel: {
    padding: '4px 12px',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  fileInput: {
    display: 'none',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  canvas: {
    display: 'block',
  },
  toastContainer: {
    position: 'absolute' as const,
    bottom: '48px',
    right: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    zIndex: 1000,
    pointerEvents: 'none' as const,
  },
  toast: {
    padding: '8px 16px',
    backgroundColor: 'rgba(180, 80, 0, 0.9)',
    color: '#fff',
    borderRadius: '6px',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  bottomBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 16px',
    backgroundColor: '#2a2a2a',
    borderTop: '1px solid #333',
    height: '30px',
    fontSize: '13px',
  },
};
