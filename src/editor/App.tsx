/**
 * not4k Chart Editor — Main App Component
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { TimelineRenderer } from './timeline/TimelineRenderer';
import { SnapZoomController } from './timeline/SnapZoomController';
import { getWaveformPeaks } from './timeline/waveform';
import { PlaybackController } from './playback/PlaybackController';
import { CreateMode, SelectMode, DeleteMode } from './modes';
import type { EntityType } from './modes';
import { useEditorStore } from './stores';
import { useGameStore } from '../game/stores';
import { useAuth } from '../shared/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { deserializeChart, serializeChart, STORAGE_BUCKET, songChartPath, songChartExtraPath, songPreviewPath, songJacketPath, encodeWavBlob } from '../shared';
import { serializeExtraNotes, parseExtraNotes } from '../shared';
import { supabase } from '../supabase';
import { LANE_WIDTH, AUX_LANE_WIDTH, LANE_COUNT, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from './timeline/constants';
import { msToBeat, beatToMs, extractBpmMarkers, beatEq } from '../shared';
import type { Beat, Lane, Chart, ChartMeta, RangeNote } from '../shared';
import type { EditingMarker } from './stores';
import { PreviewRangeSelector } from './components/PreviewRangeSelector';
import type { PreviewRangeState } from './components/PreviewRangeSelector';


function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export default function EditorApp() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const setChart = useEditorStore((s) => s.setChart);
  const setActiveSongId = useEditorStore((s) => s.setActiveSongId);
  const setPendingAudioUrl = useEditorStore((s) => s.setPendingAudioUrl);

  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  // Parse URL parameters
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const songId = params.get('songId');
  const difficulty = params.get('difficulty');

  // Load chart from URL params
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (!songId || !difficulty) {
      // No params — redirect to game song select
      window.location.href = '/game';
      return;
    }

    // Skip chart fetch if already loaded for this song (e.g., returning from test play)
    const existingStore = useEditorStore.getState();
    if (existingStore.activeSongId === songId) {
      // Re-fetch audio URL so PlaybackController reloads audio
      supabase.from('songs').select('audio_url').eq('id', songId).single().then((result) => {
        if (result?.data?.audio_url) {
          setPendingAudioUrl(getPublicUrl(result.data.audio_url));
        }
        setChartLoading(false);
      });
      return;
    }

    // Fetch chart + extra data in parallel
    const chartUrl = getPublicUrl(songChartPath(songId, difficulty));
    const extraUrl = getPublicUrl(songChartExtraPath(songId, difficulty));
    const chartFetch = fetch(chartUrl, { cache: 'no-store' }).then((res) => {
      if (!res.ok) throw new Error(`Chart fetch failed: ${res.status}`);
      return res.text();
    });
    const extraFetch = fetch(extraUrl, { cache: 'no-store' })
      .then((res) => res.ok ? res.text() : null)
      .catch(() => null);

    Promise.all([chartFetch, extraFetch])
      .then(([chartText, extraText]) => {
        const chart = deserializeChart(chartText);
        setChart(chart);
        // Parse extra lane data: separate file first, fallback to legacy embedded data
        try {
          const extraJson = extraText
            ? JSON.parse(extraText)
            : JSON.parse(chartText); // legacy: extra was embedded in chart JSON
          const extra = parseExtraNotes(extraJson);
          if (extra.extraNotes.length > 0 || extra.extraLaneCount > 0) {
            useEditorStore.getState().setExtraNotes(extra.extraNotes);
            useEditorStore.getState().setExtraLaneCount(extra.extraLaneCount);
          }
        } catch { /* ignore parse errors for extra data */ }
        setActiveSongId(songId);

        // Fetch audio URL from songs table
        return supabase.from('songs').select('audio_url').eq('id', songId).single();
      })
      .then((result) => {
        if (result && result.data?.audio_url) {
          setPendingAudioUrl(getPublicUrl(result.data.audio_url));
        }
        setChartLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setChartLoading(false);
      });
  }, [songId, difficulty, setChart, setActiveSongId, setPendingAudioUrl]);

  if (loading || chartLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#1a1a1a', color: '#888' }}>Loading...</div>;
  }

  if (!user || !isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#1a1a1a', color: '#e0e0e0', fontFamily: 'system-ui, sans-serif', gap: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Access Denied</h2>
        <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>관리자 권한이 필요합니다.</p>
        {user && <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>{user.email}</p>}
        <div style={{ display: 'flex', gap: '8px' }}>
          {user ? (
            <button onClick={signOut} style={{ padding: '8px 20px', backgroundColor: '#3a3a3a', color: '#e0e0e0', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              Sign Out
            </button>
          ) : null}
          <button onClick={() => { window.location.href = '/game'; }} style={{ padding: '8px 20px', backgroundColor: '#3a3a3a', color: '#e0e0e0', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            Back to Songs
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#1a1a1a', color: '#e0e0e0', fontFamily: 'system-ui, sans-serif', gap: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#f88' }}>Error</h2>
        <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>{error}</p>
        <button onClick={() => { window.location.href = '/game'; }} style={{ padding: '8px 20px', backgroundColor: '#3a3a3a', color: '#e0e0e0', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
          Back to Songs
        </button>
      </div>
    );
  }

  return <ChartEditorPage />;
}

// ---------------------------------------------------------------------------
// Chart Editor Page (original App logic)
// ---------------------------------------------------------------------------

function ChartEditorPage() {
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
  const rightDragDeletedRef = useRef(false);
  const cKeyHeldRef = useRef(false);
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [volume, setVolume] = useState(1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showCustomSnapModal, setShowCustomSnapModal] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPlayTestMenu, setShowPlayTestMenu] = useState(false);
  const editorNavigate = useNavigate();
  const activeSongId = useEditorStore((s) => s.activeSongId);
  const [savedChartSnapshot, setSavedChartSnapshot] = useState<string>('');
  const [savedExtraSnapshot, setSavedExtraSnapshot] = useState<string>('');
  // Pending preview range: set when preview range was changed in meta modal (saved with chart)
  const [pendingPreviewRange, setPendingPreviewRange] = useState<{
    startTime: number;
    endTime: number;
  } | null>(null);
  const [pendingJacketFile, setPendingJacketFile] = useState<File | null>(null);

  // Inject spinner keyframes once
  useEffect(() => {
    const id = 'editor-spin-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }, []);

  // Get state from store
  const chart = useEditorStore((s) => s.chart);
  const mode = useEditorStore((s) => s.mode);
  const entityType = useEditorStore((s) => s.entityType);
  const zoom = useEditorStore((s) => s.zoom);
  const snapDivision = useEditorStore((s) => s.snapDivision);
  const scrollY = useEditorStore((s) => s.scrollY);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const selectedNotes = useEditorStore((s) => s.selectedNotes);
  const pendingAudioUrl = useEditorStore((s) => s.pendingAudioUrl);
  const setPendingAudioUrl = useEditorStore((s) => s.setPendingAudioUrl);
  const setChart = useEditorStore((s) => s.setChart);
  const setMode = useEditorStore((s) => s.setMode);
  const setEntityType = useEditorStore((s) => s.setEntityType);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setSnapDivision = useEditorStore((s) => s.setSnapDivision);
  const setScrollY = useEditorStore((s) => s.setScrollY);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setCurrentTimeMs = useEditorStore((s) => s.setCurrentTimeMs);
  const setSelectedNotes = useEditorStore((s) => s.setSelectedNotes);
  const extraNotes = useEditorStore((s) => s.extraNotes);
  const extraLaneCount = useEditorStore((s) => s.extraLaneCount);
  const selectedExtraNotes = useEditorStore((s) => s.selectedExtraNotes);
  const setExtraNotes = useEditorStore((s) => s.setExtraNotes);
  const setExtraLaneCount = useEditorStore((s) => s.setExtraLaneCount);
  const setSelectedExtraNotes = useEditorStore((s) => s.setSelectedExtraNotes);
  const toasts = useEditorStore((s) => s.toasts);
  const addToast = useEditorStore((s) => s.addToast);
  const editingMarker = useEditorStore((s) => s.editingMarker);
  const setEditingMarker = useEditorStore((s) => s.setEditingMarker);

  // Helper: X to Lane (1-4 for note lanes, null otherwise)
  const xToLane = useCallback((x: number): Lane | null => {
    const lane = Math.floor(x / LANE_WIDTH) + 1;
    if (lane >= 1 && lane <= LANE_COUNT) {
      return lane as Lane;
    }
    return null;
  }, []);

  // Helper: X to Aux Lane ('event' | null)
  const xToAuxLane = useCallback((x: number): 'event' | null => {
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    if (x < auxStartX) return null;

    const auxIndex = Math.floor((x - auxStartX) / AUX_LANE_WIDTH);
    if (auxIndex === 0) return 'event';
    return null;
  }, []);

  // Helper: X to Extra Lane (1~N, or null)
  const xToExtraLane = useCallback((x: number): number | null => {
    const currentExtraLaneCount = useEditorStore.getState().extraLaneCount;
    if (currentExtraLaneCount === 0) return null;
    const extraStartX = TIMELINE_WIDTH;
    if (x < extraStartX) return null;
    const lane = Math.floor((x - extraStartX) / EXTRA_LANE_WIDTH) + 1;
    if (lane >= 1 && lane <= currentExtraLaneCount) return lane;
    return null;
  }, []);

  // Helper: Y to Beat (snap division N = N-th note, grid = 4/N beats)
  const bpmMarkers = useMemo(() => extractBpmMarkers(chart.events), [chart.events]);

  const yToBeat = useCallback((y: number): Beat => {
    if (!rendererRef.current) return { n: 0, d: 1 };
    const timeMs = rendererRef.current.yToTime(y);
    const beatFloat = msToBeat(timeMs, bpmMarkers, chart.meta.offsetMs);
    // Grid = 4/snapDivision beats (e.g., snap=16 → 0.25 beats = sixteenth note)
    const grid = 4 / snapDivision;
    const k = Math.round(beatFloat / grid);
    return { n: k * 4, d: snapDivision };
  }, [bpmMarkers, chart.meta.offsetMs, snapDivision]);

  // Raw y-to-beat without snap (for box select)
  const yToBeatRaw = useCallback((y: number): Beat => {
    if (!rendererRef.current) return { n: 0, d: 1 };
    const timeMs = rendererRef.current.yToTime(y);
    const beatFloat = msToBeat(timeMs, bpmMarkers, chart.meta.offsetMs);
    // High-precision beat without grid snapping
    const d = 960;
    const n = Math.round(beatFloat * d);
    return { n, d };
  }, [bpmMarkers, chart.meta.offsetMs]);

  // Helper: Snap Beat
  const snapBeat = useCallback((beat: Beat): Beat => {
    if (!snapZoomRef.current) return beat;
    return snapZoomRef.current.snapBeat(beat);
  }, []);

  // Helper: Get max beat (float) of the timeline
  const getMaxBeatFloat = useCallback((): number => {
    if (!rendererRef.current) return 0;
    const totalMs = rendererRef.current.getTotalTimelineMs();
    return msToBeat(totalMs, bpmMarkers, chart.meta.offsetMs);
  }, [bpmMarkers, chart.meta.offsetMs]);

  // Callback refs to avoid stale closures in mode handlers
  const yToBeatRef = useRef(yToBeat);
  const yToBeatRawRef = useRef(yToBeatRaw);
  const getMaxBeatFloatRef = useRef(getMaxBeatFloat);
  const hitTestNoteRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestNoteEndRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestEventEndRef = useRef<(x: number, y: number) => number | null>(() => null);
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

  // Helper: Hit test event end (for endpoint resize)
  const hitTestEventEnd = useCallback((x: number, y: number): number | null => {
    const auxLane = xToAuxLane(x);
    if (auxLane !== 'event') return null;

    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 8;

    for (let i = 0; i < chart.events.length; i++) {
      const evt = chart.events[i];
      const endBeatFloat = evt.endBeat.n / evt.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) {
        return i;
      }
    }
    return null;
  }, [chart.events, xToAuxLane, yToBeat]);

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

  // Helper: Hit test extra note
  const hitTestExtraNote = useCallback((x: number, y: number): number | null => {
    const extraLane = xToExtraLane(x);
    if (extraLane === null) return null;

    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;

    const currentExtraNotes = useEditorStore.getState().extraNotes;
    for (let i = 0; i < currentExtraNotes.length; i++) {
      const note = currentExtraNotes[i];
      if (note.extraLane !== extraLane) continue;

      const noteBeatFloat = note.beat.n / note.beat.d;
      if ('endBeat' in note) {
        const endBeatFloat = note.endBeat.n / note.endBeat.d;
        if (testBeatFloat >= noteBeatFloat && testBeatFloat <= endBeatFloat) return i;
      } else {
        if (Math.abs(testBeatFloat - noteBeatFloat) < 1 / 16) return i;
      }
    }
    return null;
  }, [xToExtraLane, yToBeat]);

  const hitTestExtraNoteRef = useRef<(x: number, y: number) => number | null>(() => null);

  // Sync callback refs (avoids stale closures in mode handlers)
  useEffect(() => {
    yToBeatRef.current = yToBeat;
    yToBeatRawRef.current = yToBeatRaw;
    getMaxBeatFloatRef.current = getMaxBeatFloat;
    hitTestNoteRef.current = hitTestNote;
    hitTestNoteEndRef.current = hitTestNoteEnd;
    hitTestEventEndRef.current = hitTestEventEnd;
    hitTestTrillZoneEndRef.current = hitTestTrillZoneEnd;
    hitTestTrillZoneRef.current = hitTestTrillZone;
    hitTestExtraNoteRef.current = hitTestExtraNote;
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
      xToExtraLane: (x) => xToExtraLane(x),
      onExtraNotesUpdate: (notes) => setExtraNotes(notes),
      getExtraNotes: () => useEditorStore.getState().extraNotes,
      onWarn: (msg) => addToast(msg, 'warn'),
    });
    createModeRef.current = createMode;

    const selectMode = new SelectMode(chart, {
      onChartUpdate: setChart,
      onSelectionChange: setSelectedNotes,
      yToBeat: (y) => yToBeatRef.current(y),
      yToBeatRaw: (y) => yToBeatRawRef.current(y),
      snapBeat,
      getSnapStep: () => {
        const sd = snapZoomRef.current?.snapDivision ?? 4;
        return { n: 4, d: sd };
      },
      getMaxBeatFloat: () => getMaxBeatFloatRef.current(),
      xToLane,
      hitTestNote: (x, y) => hitTestNoteRef.current(x, y),
      hitTestNoteEnd: (x, y) => hitTestNoteEndRef.current(x, y),
      hitTestEventEnd: (x, y) => hitTestEventEndRef.current(x, y),
      hitTestTrillZoneEnd: (x, y) => hitTestTrillZoneEndRef.current(x, y),
      xToExtraLane: (x) => xToExtraLane(x),
      hitTestExtraNote: (x, y) => hitTestExtraNoteRef.current(x, y),
      onExtraNotesUpdate: (notes) => setExtraNotes(notes),
      onExtraSelectionChange: (indices) => setSelectedExtraNotes(indices),
      getExtraNotes: () => useEditorStore.getState().extraNotes,
      getExtraLaneCount: () => useEditorStore.getState().extraLaneCount,
    });
    selectModeRef.current = selectMode;

    const deleteMode = new DeleteMode(chart, {
      onChartUpdate: setChart,
      hitTestNote: (x, y) => hitTestNoteRef.current(x, y),
      hitTestTrillZone: (x, y) => hitTestTrillZoneRef.current(x, y),
      hitTestExtraNote: (x, y) => hitTestExtraNoteRef.current(x, y),
      onExtraNotesUpdate: (notes) => setExtraNotes(notes),
      onExtraSelectionChange: (indices) => setSelectedExtraNotes(indices),
      getExtraNotes: () => useEditorStore.getState().extraNotes,
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

  // Load audio from pendingAudioUrl (set by SongListPage before navigating here)
  useEffect(() => {
    if (!pendingAudioUrl) return;
    const playback = playbackRef.current;
    if (!playback) return;

    const url = pendingAudioUrl;
    setPendingAudioUrl(null);
    setAudioLoading(true);
    setSavedChartSnapshot(serializeChart(chart));
    setSavedExtraSnapshot(serializeExtraNotes(useEditorStore.getState().extraNotes, useEditorStore.getState().extraLaneCount));

    playback.loadAudioUrl(url).then(() => {
      const audioBuffer = playback.audioBufferData;
      if (audioBuffer && rendererRef.current) {
        const samplesPerPeak = Math.ceil(audioBuffer.sampleRate / 50);
        const peaks = getWaveformPeaks(audioBuffer, samplesPerPeak);
        const durationMs = audioBuffer.duration * 1000;
        rendererRef.current.setWaveformData(peaks, durationMs);
      }
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      addToast(`Audio load failed: ${message}`, 'error');
    }).finally(() => {
      setAudioLoading(false);
    });
  }, [pendingAudioUrl, setPendingAudioUrl, addToast]);

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

  // Sync extra lane state to renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setExtraLaneCount(extraLaneCount);
    }
  }, [extraLaneCount]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setExtraNotes(extraNotes);
    }
  }, [extraNotes]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setSelectedExtraNotes(selectedExtraNotes);
    }
  }, [selectedExtraNotes]);

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

    // Check for minimap interaction first (uses raw canvas coords)
    if (rendererRef.current?.handleMinimapPointerDown(rawX, y)) {
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    // Content-relative x (offset-adjusted)
    const x = rawX - (rendererRef.current?.contentOffsetX ?? 0);

    // Check for cursor handle drag (right edge area)
    const curTimelineWidth = rendererRef.current?.currentTimelineWidth ?? TIMELINE_WIDTH;
    if (x >= curTimelineWidth && rendererRef.current) {
      isDraggingCursorRef.current = true;
      const timeMs = rendererRef.current.yToTime(y);
      playbackRef.current?.seekTo(Math.max(0, timeMs));
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    // Right-click (button 2) should not trigger entity creation or selection
    if (e.button === 2) {
      rightDragDeletedRef.current = false;
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

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

    // Handle minimap drag (uses raw canvas coords)
    if (rendererRef.current?.handleMinimapPointerMove(rawX, y)) {
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

    // Right-click drag delete
    if (e.buttons & 2) {
      const beat = yToBeat(y);
      const beatFloat = beat.n / beat.d;

      // Try extra lane first
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

      // Regular lane notes
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
        const timeMs = beatToMs(snapped, bpmMarkers, chart.meta.offsetMs);

        if (createModeRef.current?.dragging && createModeRef.current.dragBeat) {
          if (createModeRef.current.dragType === 'event') {
            // Event drag: show ghost marker in event aux lane
            rendererRef.current.showGhostMarker(0, timeMs);
          } else if (createModeRef.current.dragType === 'extraRangeNote' && createModeRef.current.dragExtraLane) {
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, bpmMarkers, chart.meta.offsetMs);
            rendererRef.current.showGhostExtraRange(createModeRef.current.dragExtraLane, startTimeMs, timeMs);
          } else if (createModeRef.current.dragLane) {
            // Note lane range drag: show range ghost
            const startTimeMs = beatToMs(createModeRef.current.dragBeat, bpmMarkers, chart.meta.offsetMs);
            rendererRef.current.showGhostRange(createModeRef.current.dragLane, startTimeMs, timeMs);
          }
        } else {
          // Not dragging: show ghost based on hovered lane
          const extraLane = xToExtraLane(x);
          if (extraLane) {
            rendererRef.current.showGhostExtraNote(extraLane, timeMs);
          } else {
            const auxLane = xToAuxLane(x);
            if (auxLane) {
              rendererRef.current.showGhostMarker(0, timeMs);
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
      }
    } else if (mode === 'select' && selectModeRef.current) {
      selectModeRef.current.onPointerMove(x, y);

      // Box select rectangle
      if (selectModeRef.current.isBoxSelecting && rendererRef.current) {
        const rect = selectModeRef.current.boxSelectPixelRect;
        if (rect) {
          rendererRef.current.setBoxSelectRect(rect);
          rendererRef.current.render();
        }
      }

      // Show move origin ghosts during drag
      if (selectModeRef.current.isMoveDragging && rendererRef.current) {
        const origins = selectModeRef.current.moveOrigins;
        if (origins.size > 0) {
          const originData: { note: import('../shared').NoteEntity; beat: import('../shared').Beat; endBeat?: import('../shared').Beat; lane: import('../shared').Lane }[] = [];
          for (const [idx, pos] of origins) {
            originData.push({ note: chart.notes[idx], beat: pos.beat, endBeat: pos.endBeat, lane: pos.lane });
          }
          rendererRef.current.setMoveOrigins(originData);
        }
      }
    }
  }, [mode, entityType, xToLane, yToBeat, snapBeat, bpmMarkers, chart.meta.offsetMs]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    rendererRef.current?.handleMinimapPointerUp();

    if (isDraggingCursorRef.current) {
      isDraggingCursorRef.current = false;
      return;
    }

    if (e.button === 2) {
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
      rendererRef.current?.clearBoxSelectRect();
    }
  }, [mode, isTimeInBounds]);

  // Wheel handler as native event (needs { passive: false } to allow preventDefault)
  const handleWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault();

    // Ctrl+wheel = zoom (via SnapZoomController), keep cursor position stable
    if (e.ctrlKey && snapZoomRef.current) {
      const renderer = rendererRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (renderer && rect) {
        const cursorCanvasY = e.clientY - rect.top;
        const cursorTimeMs = renderer.yToTime(cursorCanvasY);

        snapZoomRef.current.handleWheel(e);
        renderer.zoom = snapZoomRef.current.zoom;

        const newContentY = renderer.timeToY(cursorTimeMs);
        const newScrollY = newContentY - cursorCanvasY;
        const maxScroll = Math.max(0, renderer.totalTimelineHeight - canvasSize.height);
        setScrollY(Math.max(0, Math.min(maxScroll, newScrollY)));
      } else {
        snapZoomRef.current.handleWheel(e);
      }
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

    for (let i = 0; i < chart.events.length; i++) {
      const evt = chart.events[i];
      const startFloat = evt.beat.n / evt.beat.d;
      const endFloat = evt.endBeat.n / evt.endBeat.d;
      if (testBeatFloat >= startFloat - tolerance && testBeatFloat <= endFloat + tolerance) {
        return { type: 'event' as const, index: i };
      }
    }
    return null;
  }, [chart.events, xToAuxLane, yToBeat]);

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

    // Suppress context menu after right-drag delete
    if (rightDragDeletedRef.current) {
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) - (rendererRef.current?.contentOffsetX ?? 0);
    const y = e.clientY - rect.top;

    // Right-click delete — try extra note first
    const extraHitIdx = hitTestExtraNote(x, y);
    if (extraHitIdx !== null) {
      const currentExtra = useEditorStore.getState().extraNotes;
      setExtraNotes(currentExtra.filter((_n, i) => i !== extraHitIdx));
      setSelectedExtraNotes(new Set());
      return;
    }

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

    // Try event marker
    const markerHit = hitTestMarker(x, y);
    if (markerHit) {
      // Protect first event marker (beat 0)
      if (chart.events[markerHit.index]?.beat.n === 0) {
        addToast('Cannot delete initial event marker');
        return;
      }

      setChart({
        ...chart,
        events: chart.events.filter((_, i) => i !== markerHit.index),
      });
    }
  }, [chart, hitTestNote, hitTestTrillZone, hitTestMarker, setChart, addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip all shortcuts when any modal is open
      if (editingMarker || showMetaModal || showCustomSnapModal || showDeleteConfirm || showLeaveConfirm) return;

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
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          selectModeRef.current.moveByLane('left');
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          selectModeRef.current.moveByLane('right');
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
  }, [mode, setMode, editingMarker, showMetaModal, showCustomSnapModal, showDeleteConfirm, showLeaveConfirm]);

  // File handlers

  const handleSaveChart = useCallback(async () => {
    if (!activeSongId) {
      addToast('No song selected — cannot save to server', 'error');
      return;
    }
    const difficulty = chart.meta.difficultyLabel.toLowerCase();
    if (!difficulty) {
      addToast('Difficulty label is empty', 'error');
      return;
    }

    setSaving(true);
    try {
      // 1. Upload chart JSON (clean, no extra data) + extra JSON in parallel
      const chartJson = serializeChart(chart);
      const chartPath = songChartPath(activeSongId, difficulty);
      const chartBlob = new Blob([chartJson], { type: 'application/json' });
      const chartUpload = supabase.storage
        .from(STORAGE_BUCKET)
        .upload(chartPath, chartBlob, { upsert: true });

      const extraPath = songChartExtraPath(activeSongId, difficulty);
      const hasExtra = extraLaneCount > 0 || extraNotes.length > 0;
      const extraUpload = hasExtra
        ? supabase.storage
            .from(STORAGE_BUCKET)
            .upload(extraPath, new Blob([serializeExtraNotes(extraNotes, extraLaneCount)], { type: 'application/json' }), { upsert: true })
        : supabase.storage
            .from(STORAGE_BUCKET)
            .remove([extraPath]);

      const [chartResult, extraResult] = await Promise.all([chartUpload, extraUpload]);
      if (chartResult.error) throw new Error(`Upload failed: ${chartResult.error.message}`);
      if (hasExtra && extraResult.error) throw new Error(`Extra upload failed: ${extraResult.error.message}`);

      // 2. Upsert charts table row
      const { error: dbError } = await supabase.from('charts').upsert({
        song_id: activeSongId,
        difficulty_label: difficulty,
        difficulty_level: chart.meta.difficultyLevel,
        offset_ms: chart.meta.offsetMs,
      }, { onConflict: 'song_id,difficulty_label' });
      if (dbError) throw new Error(`DB save failed: ${dbError.message}`);

      // 3. Upload jacket image if changed
      if (pendingJacketFile) {
        const ext = pendingJacketFile.name.split('.').pop() || 'jpg';
        const jacketPath = songJacketPath(activeSongId, ext);
        const { error: jacketUpErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(jacketPath, pendingJacketFile, { upsert: true });
        if (jacketUpErr) throw new Error(`Jacket upload failed: ${jacketUpErr.message}`);
        // Update meta with correct storage path
        const updatedMeta = { ...chart.meta, imageFile: jacketPath };
        setChart({ ...chart, meta: updatedMeta });
        setPendingJacketFile(null);
      }

      // 4. Update songs table if preview range changed
      if (pendingPreviewRange) {
        const songUpdate: Record<string, unknown> = {
          preview_start: pendingPreviewRange.startTime,
          preview_end: pendingPreviewRange.endTime,
        };

        // Generate and upload preview WAV
        const ab = playbackRef.current?.audioBufferData;
        if (ab) {
          const wavBlob = encodeWavBlob(ab, pendingPreviewRange.startTime, pendingPreviewRange.endTime);
          const previewPath = songPreviewPath(activeSongId);
          const { error: prevUpErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(previewPath, wavBlob, { upsert: true });
          if (prevUpErr) throw new Error(`Preview upload failed: ${prevUpErr.message}`);
          songUpdate.preview_url = previewPath;
        }

        const { error: songUpdateError } = await supabase
          .from('songs')
          .update(songUpdate)
          .eq('id', activeSongId);
        if (songUpdateError) throw new Error(`Song preview update failed: ${songUpdateError.message}`);

        setPendingPreviewRange(null);
      }

      setSavedChartSnapshot(chartJson);
      setSavedExtraSnapshot(serializeExtraNotes(extraNotes, extraLaneCount));
      addToast('Chart saved', 'info');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [chart, activeSongId, addToast, pendingPreviewRange, pendingJacketFile, extraNotes, extraLaneCount]);

  const handlePlayTest = useCallback((fromCursor: boolean) => {
    const audioBuffer = playbackRef.current?.audioBufferData;
    if (!audioBuffer) {
      addToast('오디오가 로딩되지 않았습니다', 'error');
      return;
    }

    // Pause editor playback
    if (playbackRef.current?.isPlaying) {
      playbackRef.current.pause();
    }

    const gameStore = useGameStore.getState();
    gameStore.setChartData(chart);
    gameStore.setAudioBuffer(audioBuffer);
    gameStore.setStartTimeMs(fromCursor ? currentTimeMs : 0);
    gameStore.setEditorReturnUrl(window.location.pathname + window.location.search);
    gameStore.setScreen('play');

    setShowPlayTestMenu(false);
    editorNavigate('/game');
  }, [chart, currentTimeMs, editorNavigate, addToast]);

  const handleDeleteChart = useCallback(async () => {
    if (!activeSongId) {
      addToast('No song selected — cannot delete', 'error');
      return;
    }
    const difficulty = chart.meta.difficultyLabel.toLowerCase();
    if (!difficulty) {
      addToast('Difficulty label is empty', 'error');
      return;
    }

    setDeleting(true);
    setShowDeleteConfirm(false);
    try {
      // 1. charts 테이블에서 행 삭제 (먼저 수행 — 실패 시 롤백 용이)
      const { error: dbError } = await supabase
        .from('charts')
        .delete()
        .eq('song_id', activeSongId)
        .eq('difficulty_label', difficulty);
      if (dbError) throw new Error(`DB delete failed: ${dbError.message}`);

      // 2. Storage에서 차트 JSON + extra JSON 삭제
      const path = songChartPath(activeSongId, difficulty);
      const extraPath = songChartExtraPath(activeSongId, difficulty);
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([path, extraPath]);
      if (storageError) throw new Error(`Storage delete failed: ${storageError.message}`);

      addToast('Chart deleted', 'info');
      window.location.href = '/game';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(message, 'error');
    } finally {
      setDeleting(false);
    }
  }, [chart, activeSongId, addToast]);

  // Marker edit handlers
  const isEditingBeatZero = editingMarker && chart.events[editingMarker.index]?.beat.n === 0;

  const handleMarkerSave = useCallback((values: Record<string, string>) => {
    if (!editingMarker) return;

    const updated = { ...chart };
    updated.events = [...chart.events];
    const evt = updated.events[editingMarker.index];
    const isBeatZeroEvent = evt.beat.n === 0;
    const patch: Partial<typeof evt> = {};
    // text
    if (values.text !== undefined && values.text !== '') {
      patch.text = values.text;
    }
    // bpm
    if (values.eventBpm !== undefined && values.eventBpm !== '') {
      const bpmVal = parseFloat(values.eventBpm);
      if (!isNaN(bpmVal) && bpmVal > 0) patch.bpm = bpmVal;
    }
    // beatPerMeasure
    if (values.tsNumerator !== undefined && values.tsDenominator !== undefined
        && values.tsNumerator !== '' && values.tsDenominator !== '') {
      const tsN = parseInt(values.tsNumerator);
      const tsD = parseInt(values.tsDenominator);
      if (!isNaN(tsN) && !isNaN(tsD) && tsN > 0 && tsD > 0) {
        patch.beatPerMeasure = { n: tsN, d: tsD };
      }
    }
    // beat-0 event: bpm and beatPerMeasure are required
    if (isBeatZeroEvent) {
      if (patch.bpm === undefined) { addToast('Initial event requires BPM'); return; }
      if (patch.beatPerMeasure === undefined) { addToast('Initial event requires time signature'); return; }
    }
    // stop
    if (values.stop === 'true') {
      patch.stop = true;
    }
    // Build updated event: remove cleared optional fields
    const { text: _t, bpm: _b, beatPerMeasure: _bp, stop: _s, ...base } = evt;
    updated.events[editingMarker.index] = { ...base, ...patch };

    setChart(updated);
    // Directly update renderer to bypass React async useEffect timing
    rendererRef.current?.setChart(updated);
    setEditingMarker(null);
  }, [editingMarker, chart, setChart, setEditingMarker, addToast]);

  const handleMarkerDelete = useCallback(() => {
    if (!editingMarker) return;

    if (isEditingBeatZero) {
      addToast('Cannot delete initial event marker');
      return;
    }

    setChart({
      ...chart,
      events: chart.events.filter((_, i) => i !== editingMarker.index),
    });
    setEditingMarker(null);
  }, [editingMarker, isEditingBeatZero, chart, setChart, setEditingMarker, addToast]);

  const entityTypeOptions: EntityType[] = [
    'single',
    'double',
    'long',
    'doubleLong',
    'trillZone',
  ];

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        {/* Back to song list */}
        <button
          style={styles.button}
          onClick={() => {
            const isDirty = (savedChartSnapshot && (serializeChart(chart) !== savedChartSnapshot || serializeExtraNotes(extraNotes, extraLaneCount) !== savedExtraSnapshot)) || pendingPreviewRange != null;
            if (isDirty) {
              setShowLeaveConfirm(true);
            } else {
              window.location.href = '/game';
            }
          }}
          title="Back to song list"
        >
          &larr; Songs
        </button>

        <div style={styles.separator} />

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

        {/* Extra Lane selector */}
        <span style={styles.label}>Extra:</span>
        <select
          style={styles.select}
          value={extraLaneCount}
          onChange={(e) => {
            const newCount = parseInt(e.target.value);
            setExtraLaneCount(newCount);
            if (newCount < extraLaneCount) {
              setSelectedExtraNotes(new Set());
            }
          }}
        >
          {[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
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

        <div style={styles.separator} />

        {/* Test Play */}
        <div style={{ position: 'relative' }}>
          <button
            style={{ ...styles.button, backgroundColor: '#2d6b3a', borderColor: '#3a8f4e' }}
            onClick={() => setShowPlayTestMenu((v) => !v)}
            title="Test play this chart"
          >
            Test Play
          </button>
          {showPlayTestMenu && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                onClick={() => setShowPlayTestMenu(false)}
              />
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #555',
                borderRadius: '4px',
                zIndex: 1000,
                minWidth: '160px',
                overflow: 'hidden',
              }}>
                <button
                  style={{ display: 'block', width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: '#e0e0e0', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = '#3a3a3a'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  onClick={() => handlePlayTest(false)}
                >
                  처음부터 시작
                </button>
                <button
                  style={{ display: 'block', width: '100%', padding: '8px 12px', backgroundColor: 'transparent', color: '#e0e0e0', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left', borderTop: '1px solid #444' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = '#3a3a3a'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
                  onClick={() => handlePlayTest(true)}
                >
                  커서부터 시작
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* File operations */}
        <button style={styles.button} onClick={() => setShowMetaModal(true)}>
          Meta
        </button>

        <button style={styles.button} onClick={handleSaveChart} disabled={saving || deleting}>
          {saving ? 'Saving...' : 'Save Chart'}
        </button>

        <button
          style={{ ...styles.button, backgroundColor: '#7b2d26', borderColor: '#a33b32' }}
          onClick={() => setShowDeleteConfirm(true)}
          disabled={saving || deleting || !activeSongId}
        >
          {deleting ? 'Deleting...' : 'Delete Chart'}
        </button>
      </div>

      {/* Canvas */}
      <div ref={canvasContainerRef} style={styles.canvasContainer}>
        {audioLoading && (
          <div style={styles.loadingOverlay}>
            <div style={styles.spinner} />
            <span>Loading audio...</span>
          </div>
        )}
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
          audioBuffer={playbackRef.current?.audioBufferData ?? null}
          onSave={async (meta, previewRange, jacketFile) => {
            const prevStart = chart.meta.previewStart;
            const prevEnd = chart.meta.previewEnd;
            const rangeChanged = previewRange != null && (
              previewRange.startTime !== prevStart || previewRange.endTime !== prevEnd
            );

            setChart({ ...chart, meta });

            if (rangeChanged && previewRange) {
              setPendingPreviewRange({ startTime: previewRange.startTime, endTime: previewRange.endTime });
            }
            if (jacketFile) {
              setPendingJacketFile(jacketFile);
            }

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

      {/* Leave confirm modal */}
      {showLeaveConfirm && (
        <div style={modalStyles.overlay} onClick={() => setShowLeaveConfirm(false)}>
          <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={modalStyles.title}>Unsaved Changes</h3>
            <p style={{ fontSize: '14px', margin: '0 0 16px', color: '#ccc' }}>
              저장되지 않은 변경사항이 있습니다. 나가시겠습니까?
            </p>
            <div style={modalStyles.buttons}>
              <button style={modalStyles.deleteBtn} onClick={() => { setShowLeaveConfirm(false); window.location.href = '/game'; }}>
                Leave
              </button>
              <button style={modalStyles.cancelBtn} onClick={() => setShowLeaveConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div style={modalStyles.overlay} onClick={() => setShowDeleteConfirm(false)}>
          <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={modalStyles.title}>Delete Chart</h3>
            <p style={{ fontSize: '14px', margin: '0 0 16px', color: '#ccc' }}>
              <strong>{chart.meta.difficultyLabel.toUpperCase()}</strong> 차트를 삭제하시겠습니까?<br />
              <span style={{ color: '#999', fontSize: '13px' }}>Storage 파일과 DB 행이 모두 삭제됩니다.</span>
            </p>
            <div style={modalStyles.buttons}>
              <button style={modalStyles.deleteBtn} onClick={handleDeleteChart}>Delete</button>
              <button style={modalStyles.cancelBtn} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
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
          Selected: {selectedNotes.size + selectedExtraNotes.size} notes
        </span>
        <span style={{ marginLeft: '20px' }}>
          Total: {chart.notes.length} notes
        </span>
        {extraNotes.length > 0 && (
          <span style={{ marginLeft: '20px' }}>
            Extra: {extraNotes.length} notes
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marker Edit Modal
// ---------------------------------------------------------------------------

function MarkerEditModal({ editingMarker, chart, isBeatZero, onSave, onDelete, onClose }: {
  editingMarker: NonNullable<EditingMarker>;
  chart: Chart;
  isBeatZero: boolean;
  onSave: (values: Record<string, string>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const getInitialValues = (): Record<string, string> => {
    const evt = chart.events[editingMarker.index];
    return {
      text: evt?.text ?? '',
      eventBpm: evt?.bpm !== undefined ? String(evt.bpm) : '',
      tsNumerator: evt?.beatPerMeasure !== undefined ? String(evt.beatPerMeasure.n) : '',
      tsDenominator: evt?.beatPerMeasure !== undefined ? String(evt.beatPerMeasure.d) : '',
      stop: evt?.stop ? 'true' : 'false',
    };
  };

  const [values, setValues] = useState<Record<string, string>>(getInitialValues);

  const title = 'Edit Event';

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={modalStyles.title}>{title}</h3>

        <EventTabFields values={values} setValues={setValues} />

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
// Event Tab Fields (BPM / TimeSig / Message tabs)
// ---------------------------------------------------------------------------

type EventTab = 'message' | 'bpm' | 'timeSig' | 'stop';

function EventTabFields({ values, setValues }: {
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  const [activeTab, setActiveTab] = useState<EventTab>('message');

  const hasMessage = !!values.text;
  const hasBpm = !!values.eventBpm;
  const hasTimeSig = !!values.tsNumerator || !!values.tsDenominator;
  const hasStop = values.stop === 'true';

  const tabs: { key: EventTab; label: string; hasValue: boolean }[] = [
    { key: 'message', label: 'Message', hasValue: hasMessage },
    { key: 'bpm', label: 'BPM', hasValue: hasBpm },
    { key: 'timeSig', label: 'TimeSig', hasValue: hasTimeSig },
    { key: 'stop', label: 'Stop', hasValue: hasStop },
  ];

  return (
    <>
      <div style={eventTabStyles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...eventTabStyles.tab,
              ...(activeTab === tab.key ? eventTabStyles.tabActive : {}),
              ...(tab.hasValue && activeTab !== tab.key ? eventTabStyles.tabFilled : {}),
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.hasValue && <span style={eventTabStyles.dot} />}
            {tab.label}
          </button>
        ))}
      </div>

      <div style={eventTabStyles.tabContent}>
        {activeTab === 'message' && (
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

        {activeTab === 'bpm' && (
          <label style={modalStyles.field}>
            <span>BPM</span>
            <input
              style={modalStyles.input}
              type="number"
              value={values.eventBpm}
              onChange={(e) => setValues({ ...values, eventBpm: e.target.value })}
              autoFocus
            />
          </label>
        )}

        {activeTab === 'timeSig' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <label style={modalStyles.field}>
              <span>Numerator</span>
              <input
                style={modalStyles.input}
                type="number"
                value={values.tsNumerator}
                onChange={(e) => setValues({ ...values, tsNumerator: e.target.value })}
                autoFocus
              />
            </label>
            <label style={modalStyles.field}>
              <span>Denominator</span>
              <input
                style={modalStyles.input}
                type="number"
                value={values.tsDenominator}
                onChange={(e) => setValues({ ...values, tsDenominator: e.target.value })}
              />
            </label>
          </div>
        )}

        {activeTab === 'stop' && (
          <label style={{ ...modalStyles.field, flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={values.stop === 'true'}
              onChange={(e) => setValues({ ...values, stop: e.target.checked ? 'true' : 'false' })}
              style={{ width: '16px', height: '16px', accentColor: '#4488ff' }}
            />
            <span>Stop (구간 내 싱글/더블/롱노트 배치 금지)</span>
          </label>
        )}
      </div>
    </>
  );
}

const eventTabStyles = {
  tabBar: {
    display: 'flex',
    gap: '4px',
    marginBottom: '12px',
    borderBottom: '1px solid #444',
    paddingBottom: '8px',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 12px',
    backgroundColor: '#333',
    color: '#888',
    border: '1px solid #444',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  tabActive: {
    backgroundColor: '#4488ff',
    color: '#fff',
    borderColor: '#4488ff',
  },
  tabFilled: {
    color: '#ccc',
    borderColor: '#668',
    backgroundColor: '#3a3a4a',
  },
  dot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#6cf',
    flexShrink: 0,
  } as React.CSSProperties,
  tabContent: {
    minHeight: '60px',
  },
};

// ---------------------------------------------------------------------------
// Meta Edit Modal
// ---------------------------------------------------------------------------

function MetaEditModal({ meta, audioBuffer, onSave, onClose, onLoadAudio }: {
  meta: ChartMeta;
  audioBuffer: AudioBuffer | null;
  onSave: (meta: ChartMeta, previewRange: PreviewRangeState | null, jacketFile: File | null) => void;
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
  const [previewRange, setPreviewRange] = useState<PreviewRangeState | null>(null);
  const [jacketError, setJacketError] = useState(false);
  const [jacketLocalUrl, setJacketLocalUrl] = useState<string | null>(null);
  const [jacketFile, setJacketFile] = useState<File | null>(null);

  const set = (key: string, val: string) => setValues({ ...values, [key]: val });

  const jacketUrl = jacketLocalUrl
    ?? (values.imageFile ? getPublicUrl(values.imageFile) : null);

  const handleSave = () => {
    const level = parseInt(values.difficultyLevel);
    const offset = parseFloat(values.offsetMs);
    const updatedMeta: ChartMeta = {
      ...meta,
      title: values.title,
      artist: values.artist,
      difficultyLabel: values.difficultyLabel,
      difficultyLevel: isNaN(level) ? meta.difficultyLevel : level,
      offsetMs: isNaN(offset) ? meta.offsetMs : offset,
      audioFile: values.audioFile,
      imageFile: values.imageFile,
      previewAudioFile: values.previewAudioFile,
    };
    if (previewRange) {
      updatedMeta.previewStart = previewRange.startTime;
      updatedMeta.previewEnd = previewRange.endTime;
    }
    onSave(updatedMeta, previewRange, jacketFile);
  };

  const fields: { label: string; key: string; type: string }[] = [
    { label: 'Title', key: 'title', type: 'text' },
    { label: 'Artist', key: 'artist', type: 'text' },
    { label: 'Difficulty Label', key: 'difficultyLabel', type: 'text' },
    { label: 'Difficulty Level', key: 'difficultyLevel', type: 'number' },
    { label: 'Offset (ms)', key: 'offsetMs', type: 'number' },
  ];

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, width: '520px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
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

        {/* Audio section */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px' }}>Audio</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#3a3a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                fontSize: '12px',
              }}>
                {audioBuffer ? 'Replace Audio' : 'Upload Audio'}
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
            </label>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#222', borderRadius: '6px', border: '1px solid #3a3a3a' }}>
            {audioBuffer ? (
              <PreviewRangeSelector
                audioBuffer={audioBuffer}
                onChange={setPreviewRange}
                initialStart={meta.previewStart}
                initialEnd={meta.previewEnd}
              />
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                No file
              </div>
            )}
          </div>
        </div>

        {/* Jacket section */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px' }}>Jacket</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#3a3a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                fontSize: '12px',
              }}>
                {jacketUrl && !jacketError ? 'Replace Jacket' : 'Upload Jacket'}
              </span>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    set('imageFile', file.name);
                    setJacketFile(file);
                    setJacketLocalUrl(URL.createObjectURL(file));
                    setJacketError(false);
                  }
                }}
              />
            </label>
          </div>
          <div style={{ padding: '12px', backgroundColor: '#222', borderRadius: '6px', border: '1px solid #3a3a3a' }}>
            {jacketUrl && !jacketError ? (
              <img
                src={jacketUrl}
                alt="Jacket"
                style={{
                  width: '100%',
                  maxHeight: '120px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                }}
                onError={() => setJacketError(true)}
              />
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                No file
              </div>
            )}
          </div>
        </div>

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
  canvasContainer: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  canvas: {
    display: 'block',
  },
  loadingOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#ccc',
    fontSize: '14px',
    zIndex: 1500,
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #555',
    borderTop: '3px solid #4488ff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  toastContainer: {
    position: 'absolute' as const,
    bottom: '48px',
    right: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    zIndex: 3000,
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
