/**
 * not4k Chart Editor — Main App Component
 */

import { useEffect, useRef, useCallback } from 'react';
import { TimelineRenderer } from './timeline/TimelineRenderer';
import { SnapZoomController } from './timeline/SnapZoomController';
import { getWaveformPeaks } from './timeline/waveform';
import { PlaybackController } from './playback/PlaybackController';
import { CreateMode, SelectMode, DeleteMode } from './modes';
import type { EntityType } from './modes';
import { useEditorStore } from './stores';
import { saveChartToFile, loadChartFromFile } from './io/ChartIO';
import { LANE_WIDTH, AUX_LANE_WIDTH, LANE_COUNT, TIMELINE_WIDTH } from './timeline/constants';
import { msToBeat } from '@not4k/shared';
import type { Beat, Lane } from '@not4k/shared';

const CANVAS_WIDTH = TIMELINE_WIDTH;
const CANVAS_HEIGHT = 800;

export function App() {
  // Refs for imperative objects
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TimelineRenderer | null>(null);
  const snapZoomRef = useRef<SnapZoomController | null>(null);
  const playbackRef = useRef<PlaybackController | null>(null);
  const createModeRef = useRef<CreateMode | null>(null);
  const selectModeRef = useRef<SelectMode | null>(null);
  const deleteModeRef = useRef<DeleteMode | null>(null);

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

  // Helper: Y to Beat
  const yToBeat = useCallback((y: number): Beat => {
    if (!rendererRef.current) return { n: 0, d: 1 };
    const timeMs = rendererRef.current.yToTime(y);
    const beatFloat = msToBeat(timeMs, chart.bpmMarkers, chart.meta.offsetMs);
    // Convert float to Beat with snapDivision denominator
    return { n: Math.round(beatFloat * snapDivision), d: snapDivision };
  }, [chart.bpmMarkers, chart.meta.offsetMs, snapDivision]);

  // Helper: Snap Beat
  const snapBeat = useCallback((beat: Beat): Beat => {
    if (!snapZoomRef.current) return beat;
    return snapZoomRef.current.snapBeat(beat);
  }, []);

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

  // Initialize on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;

    // Create TimelineRenderer
    const renderer = new TimelineRenderer({
      canvas,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });

    renderer.init().then(() => {
      if (!mounted) return;

      rendererRef.current = renderer;
      renderer.setChart(chart);
      renderer.zoom = zoom;
      renderer.snap = snapDivision;
      renderer.scrollY = scrollY;
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

    // Create mode handlers
    const createMode = new CreateMode(chart, {
      onChartUpdate: setChart,
      yToBeat,
      snapBeat,
      xToLane,
      xToAuxLane,
    });
    createModeRef.current = createMode;

    const selectMode = new SelectMode(chart, {
      onChartUpdate: setChart,
      onSelectionChange: setSelectedNotes,
      yToBeat,
      snapBeat,
      xToLane,
      hitTestNote,
    });
    selectModeRef.current = selectMode;

    const deleteMode = new DeleteMode(chart, {
      onChartUpdate: setChart,
      hitTestNote,
    });
    deleteModeRef.current = deleteMode;

    return () => {
      mounted = false;
      renderer.dispose();
      snapZoom.dispose();
      playback.dispose();
    };
  }, []); // Only run once on mount

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

  // Sync snap to renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.snap = snapDivision;
    }
  }, [snapDivision]);

  // Sync scrollY to renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.scrollY = scrollY;
    }
  }, [scrollY]);

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

  // Canvas event handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'create' && createModeRef.current) {
      createModeRef.current.onPointerDown(x, y);
    } else if (mode === 'select' && selectModeRef.current) {
      selectModeRef.current.onPointerDown(x, y, e.shiftKey, e.altKey);
    } else if (mode === 'delete' && deleteModeRef.current) {
      deleteModeRef.current.onPointerDown(x, y);
    }
  }, [mode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'create' && createModeRef.current) {
      createModeRef.current.onPointerMove(x, y);
    } else if (mode === 'select' && selectModeRef.current) {
      selectModeRef.current.onPointerMove(x, y);
    }
  }, [mode]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'create' && createModeRef.current) {
      createModeRef.current.onPointerUp(x, y);
    } else if (mode === 'select' && selectModeRef.current) {
      selectModeRef.current.onPointerUp(x, y);
    }
  }, [mode]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // Ctrl+wheel = zoom (via SnapZoomController)
    if (e.ctrlKey && snapZoomRef.current) {
      snapZoomRef.current.handleWheel(e.nativeEvent);
      return;
    }

    // C+wheel = entity type cycling (create mode only)
    if (mode === 'create' && createModeRef.current) {
      const cKeyHeld = e.nativeEvent.getModifierState('c') || e.nativeEvent.getModifierState('C');
      if (createModeRef.current.onWheel(e.deltaY, cKeyHeld)) {
        setEntityType(createModeRef.current.entityType);
        return;
      }
    }

    // Default: scroll
    setScrollY(Math.max(0, scrollY + e.deltaY));
  }, [mode, scrollY, setScrollY, setEntityType]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Right-click delete (mode-independent)
    const result = DeleteMode.deleteNoteAtPoint(chart, hitTestNote, x, y);
    if (result) {
      setChart(result);
    }
  }, [chart, hitTestNote, setChart]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [mode, setMode]);

  // File handlers
  const handleLoadAudio = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && playbackRef.current) {
      playbackRef.current.loadAudioFile(file).then(() => {
        // Extract waveform data after audio loads
        const audioBuffer = playbackRef.current?.audioBufferData;
        if (audioBuffer && rendererRef.current) {
          // Sample at ~1 peak per pixel of height at default zoom
          const samplesPerPeak = Math.ceil(audioBuffer.sampleRate / 50);
          const peaks = getWaveformPeaks(audioBuffer, samplesPerPeak);
          const durationMs = audioBuffer.duration * 1000;
          rendererRef.current.setWaveformData(peaks, durationMs);
        }
      });
    }
  }, []);

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

  const entityTypeOptions: EntityType[] = [
    'single',
    'double',
    'trill',
    'singleLongBody',
    'doubleLongBody',
    'trillLongBody',
    'trillZone',
    'bpmMarker',
    'timeSignatureMarker',
    'message',
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
        <button style={styles.button} onClick={() => setSnapDivision(4)}>1/4</button>
        <button style={styles.button} onClick={() => setSnapDivision(8)}>1/8</button>
        <button style={styles.button} onClick={() => setSnapDivision(16)}>1/16</button>

        {/* Zoom display */}
        <span style={styles.label}>Zoom: {zoom.toFixed(0)}px/s</span>

        <div style={styles.separator} />

        {/* Play/Pause */}
        <button style={styles.button} onClick={() => playbackRef.current?.togglePlay()}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        <div style={{ flex: 1 }} />

        {/* File operations */}
        <label style={styles.fileLabel}>
          Load Audio
          <input
            type="file"
            accept="audio/*"
            style={styles.fileInput}
            onChange={handleLoadAudio}
          />
        </label>

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
      <div style={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
        />
      </div>

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
    overflow: 'auto',
    backgroundColor: '#000',
  },
  canvas: {
    display: 'block',
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
