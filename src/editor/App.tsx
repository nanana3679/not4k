/**
 * not4k Chart Editor — Main App Component
 */

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TimelineRenderer } from './timeline/TimelineRenderer';
import { getWaveformPeaks } from './timeline/waveform';
import { PlaybackController } from './playback/PlaybackController';
import { CreateMode, SelectMode, DeleteMode, activeEditorMode } from './modes';
import { useEditorStore } from './stores';
import { viewportSourceFromStore } from './stores/viewportSlice';
import { useGameStore } from '../game/stores';
import { useAuth } from '../shared/hooks/useAuth';
import { deserializeChart, normalizePlaybackRange, serializeChart, STORAGE_BUCKET, songChartPath, songChartExtraPath } from '../shared';
import { serializeExtraNotes, parseExtraNotes } from '../shared';
import { chartViolationIndices } from '../shared';
import { hiddenViolationLanes } from './stores/unifiedNotes';
import { toAuxIndex, mainNotes, maxAuxLane, auxNotesAsExtra, withAuxNotes } from '../shared';
import type { Chart, ExtraNoteEntity } from '../shared';
import { supabase } from '../supabase';
import type { PlaybackRange, ValidationError } from '../shared';
import { OverlayLoading, PageLoading } from '../shared/components/LoadingSpinner';
import { MarkerEditModal } from './components/MarkerEditModal';
import { MetaEditModal } from './components/MetaEditModal';
import { CustomSnapModal } from './components/CustomSnapModal';
import { SaveAsModal } from './components/SaveAsModal';
import { modalStyles } from './components/modalStyles';
import { EditorToolbar } from './components/EditorToolbar';
import { useCoordinateHelpers } from './hooks/useCoordinateHelpers';
import { useCanvasEvents } from './hooks/useCanvasEvents';
import { useEditorKeyboard } from './hooks/useEditorKeyboard';
import { useFileOperations } from './hooks/useFileOperations';
import { getEditorAudioLoadingSurface } from './editorLoading';
import { LEAVE_CONFIRM_COPY } from './editorCopy';

const COMPACT_EDITOR_QUERY = '(max-width: 767px), (pointer: coarse)';

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function useCompactEditorLayout(): boolean {
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(COMPACT_EDITOR_QUERY).matches
  ));

  useEffect(() => {
    const media = window.matchMedia(COMPACT_EDITOR_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return compact;
}

interface SongGameplayRow {
  duration: number | null;
  gameplay_start: number | null;
  gameplay_end: number | null;
  gameplay_fade_in: number | null;
  gameplay_fade_out: number | null;
}

function songRowToPlaybackRange(row: SongGameplayRow | null | undefined): PlaybackRange | null {
  if (!row || row.gameplay_start == null || row.gameplay_end == null) return null;
  const duration = row.duration != null && Number.isFinite(row.duration) && row.duration > 0
    ? row.duration
    : row.gameplay_end;
  return normalizePlaybackRange({
    startTime: row.gameplay_start,
    endTime: row.gameplay_end,
    fadeInTime: row.gameplay_fade_in ?? 0,
    fadeOutTime: row.gameplay_fade_out ?? 0,
  }, duration);
}

function samePlaybackRange(a: PlaybackRange | null, b: PlaybackRange | null): boolean {
  if (a === null || b === null) return a === b;
  return a.startTime === b.startTime
    && a.endTime === b.endTime
    && a.fadeInTime === b.fadeInTime
    && a.fadeOutTime === b.fadeOutTime;
}

export default function EditorApp() {
  const { user, isAdmin, loading, signInWithGoogle, signOut } = useAuth();
  const setChart = useEditorStore((s) => s.setChart);
  const setActiveSongId = useEditorStore((s) => s.setActiveSongId);
  const setPendingAudioUrl = useEditorStore((s) => s.setPendingAudioUrl);
  const resetHistory = useEditorStore((s) => s.resetHistory);

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
        // 보조 노트를 lane 5+로 chart.notes에 병합한 뒤 로드한다 (RFD 0018 ③ 로드 병합).
        // Parse extra lane data: separate file first, fallback to legacy embedded data
        let merged = chart;
        let mergedExtraLaneCount = 0;
        try {
          const extraJson = extraText
            ? JSON.parse(extraText)
            : JSON.parse(chartText); // legacy: extra was embedded in chart JSON
          const extra = parseExtraNotes(extraJson);
          if (extra.extraNotes.length > 0 || extra.extraLaneCount > 0) {
            // withAuxNotes가 [...main, ...aux] 정규형으로 병합해 aux 상대 순서를 보존한다
            // — 재저장 바이트 동일성(§6-3a)이 이 순서 보존에 의존한다.
            merged = { ...chart, notes: withAuxNotes(chart.notes, extra.extraNotes) };
            // 노트가 존재하는 최대 보조 레인 이상으로 extraLaneCount 보장(숨김 예방, §8-7 계승)
            mergedExtraLaneCount = Math.max(extra.extraLaneCount, toAuxIndex(maxAuxLane(merged.notes)));
          }
        } catch { /* ignore parse errors for extra data */ }
        // 로드는 게이트의 유일한 예외 통로 — 위반 차트도 열어 수리를 허용한다.
        useEditorStore.getState().loadChart(merged);
        if (mergedExtraLaneCount > 0) useEditorStore.getState().setExtraLaneCount(mergedExtraLaneCount);
        setActiveSongId(songId);
        resetHistory();

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
  }, [songId, difficulty, setChart, setActiveSongId, setPendingAudioUrl, resetHistory]);

  if (loading || chartLoading) {
    return <PageLoading message="Loading editor..." />;
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
          ) : (
            <button onClick={() => signInWithGoogle().catch(() => {})} style={{ padding: '8px 20px', backgroundColor: '#4a7cff', color: '#fff', border: '1px solid #6f96ff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
              Login
            </button>
          )}
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
// Chart Editor Page — 추출된 훅/컴포넌트로 조합
// ---------------------------------------------------------------------------

function ChartEditorPage() {
  const playTestNavigate = useNavigate();
  // Imperative refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TimelineRenderer | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const playbackRef = useRef<PlaybackController | null>(null);
  const createModeRef = useRef<CreateMode | null>(null);
  const selectModeRef = useRef<SelectMode | null>(null);
  const deleteModeRef = useRef<DeleteMode | null>(null);
  const isDraggingCursorRef = useRef(false);
  const cKeyHeldRef = useRef(false);
  const compactEditor = useCompactEditorLayout();

  // UI 상태
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showCustomSnapModal, setShowCustomSnapModal] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [initialAudioPending, setInitialAudioPending] = useState(() => Boolean(useEditorStore.getState().pendingAudioUrl));
  const hasCompletedInitialAudioLoadRef = useRef(!useEditorStore.getState().pendingAudioUrl);
  const [loadedAudioBuffer, setLoadedAudioBuffer] = useState<AudioBuffer | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsOverwriteTarget, setSaveAsOverwriteTarget] = useState<{ difficulty: string; level: number } | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPlayTestMenu, setShowPlayTestMenu] = useState(false);
  const [showOffsetToolbar, setShowOffsetToolbar] = useState(false);
  const [savedChartSnapshot, setSavedChartSnapshot] = useState<string>('');
  const [savedExtraSnapshot, setSavedExtraSnapshot] = useState<string>('');
  const [pendingPreviewRange, setPendingPreviewRange] = useState<PlaybackRange | null>(null);
  const [pendingGameplayRange, setPendingGameplayRange] = useState<PlaybackRange | null>(null);
  const [songGameplayRange, setSongGameplayRange] = useState<PlaybackRange | null>(null);
  const [pendingJacketFile, setPendingJacketFile] = useState<File | null>(null);
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null);
  const [jacketCacheBust, setJacketCacheBust] = useState(0);

  // Store 상태
  const chart = useEditorStore((s) => s.chart);
  const scrollY = useEditorStore((s) => s.scrollY);
  const snapDivision = useEditorStore((s) => s.snapDivision);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const selectedNotes = useEditorStore((s) => s.selection.notes);
  const pendingAudioUrl = useEditorStore((s) => s.pendingAudioUrl);
  const setPendingAudioUrl = useEditorStore((s) => s.setPendingAudioUrl);
  const setChart = useEditorStore((s) => s.setChart);
  const setSnapDivision = useEditorStore((s) => s.setSnapDivision);
  const setScrollY = useEditorStore((s) => s.setScrollY);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setCurrentTimeMs = useEditorStore((s) => s.setCurrentTimeMs);
  const extraLaneCount = useEditorStore((s) => s.extraLaneCount);
  const addToast = useEditorStore((s) => s.addToast);
  const editingMarker = useEditorStore((s) => s.editingMarker);
  const setEditingMarker = useEditorStore((s) => s.setEditingMarker);
  const activeSongId = useEditorStore((s) => s.activeSongId);
  const mode = useEditorStore((s) => s.mode);
  const audioLoadingSurface = getEditorAudioLoadingSurface({ audioLoading, initialAudioPending });

  // 좌표 변환 / 히트테스트 훅
  const coords = useCoordinateHelpers(rendererRef);
  const { bpmMarkers, xToLane, xToExtraLane, snapBeat, yToBeatRef, hitTestNoteRef, hitTestUnifiedNoteRef, hitTestExtraNoteRef } = coords;

  // isTimeInBounds 헬퍼
  const isTimeInBounds = useCallback((y: number): boolean => {
    if (!rendererRef.current) return false;
    const timeMs = rendererRef.current.yToTime(y);
    const totalMs = rendererRef.current.getTotalTimelineMs();
    const minMs = Math.min(0, chart.meta.offsetMs);
    return timeMs >= minMs && timeMs <= totalMs;
  }, [chart.meta.offsetMs]);

  // 모드 콜백에서 최신 isTimeInBounds를 참조하기 위한 ref (모드는 1회 생성 후 재사용).
  const isTimeInBoundsRef = useRef(isTimeInBounds);
  useEffect(() => { isTimeInBoundsRef.current = isTimeInBounds; }, [isTimeInBounds]);

  const handlePinchZoom = useCallback((previousDistance: number, currentDistance: number, centerCanvasY: number) => {
    // 앵커 시간은 줌 변경 "전" 좌표계로 계산해야 핀치 중심이 고정된다.
    const anchorTimeMs = rendererRef.current?.yToTime(centerCanvasY) ?? null;
    const store = useEditorStore.getState();
    if (anchorTimeMs === null) {
      store.zoomByPinch(previousDistance, currentDistance);
      return;
    }
    // 줌+앵커 보정 스크롤을 단일 set으로 커밋 — 구독 통지·렌더 1회.
    store.zoomByPinchAnchored(previousDistance, currentDistance, {
      timeMs: anchorTimeMs,
      canvasY: centerCanvasY,
    });
  }, []);

  const handleHorizontalPan = useCallback((deltaX: number) => {
    if (Math.abs(deltaX) < 0.5) return;
    rendererRef.current?.panHorizontally(deltaX);
  }, []);

  const handleVerticalPan = useCallback((deltaY: number) => {
    if (Math.abs(deltaY) < 0.5) return;
    const store = useEditorStore.getState();
    store.setScrollY(store.scrollY + deltaY); // 클램프는 액션 내장, 렌더러는 구독으로 따라온다
  }, []);

  const handleDeleteSelected = useCallback(() => {
    // 선택은 통합 축(sel.notes) 하나 — 보조 노트도 chart.notes 통합 인덱스로 포함된다 (RFD 0018 ④).
    const total = selectedNotes.size;
    if (total === 0) {
      addToast('삭제할 노트를 선택하세요', 'warn');
      return;
    }
    selectModeRef.current?.deleteSelected();
    addToast(`${total}개 선택 항목 삭제됨`, 'info');
  }, [addToast, selectedNotes.size]);

  // 캔버스 이벤트 훅
  const canvasEvents = useCanvasEvents(
    canvasRef, rendererRef, playbackRef,
    createModeRef, selectModeRef, deleteModeRef,
    isDraggingCursorRef, coords, isTimeInBounds,
    handlePinchZoom,
    handleHorizontalPan,
    handleVerticalPan,
  );

  // 파일 오퍼레이션 훅
  const fileOps = useFileOperations(
    playbackRef,
    rendererRef as React.RefObject<{ setChart: (c: unknown) => void } | null>,
    setSaving, setDeleting, setValidationErrors,
    setShowSaveAsModal, setSaveAsOverwriteTarget, setShowDeleteConfirm, setShowPlayTestMenu,
    setSavedChartSnapshot, setSavedExtraSnapshot,
    setPendingPreviewRange, setPendingGameplayRange, setPendingJacketFile, setJacketCacheBust,
    pendingPreviewRange, pendingGameplayRange, pendingJacketFile,
    setPendingAudioFile, pendingAudioFile,
    playTestNavigate,
  );

  useEffect(() => {
    if (!activeSongId) {
      setSongGameplayRange(null);
      return;
    }
    let mounted = true;
    supabase
      .from('songs')
      .select('duration,gameplay_start,gameplay_end,gameplay_fade_in,gameplay_fade_out')
      .eq('id', activeSongId)
      .single()
      .then(({ data }) => {
        if (!mounted) return;
        setSongGameplayRange(songRowToPlaybackRange(data as SongGameplayRow | null));
      });
    return () => {
      mounted = false;
    };
  }, [activeSongId]);

  // 키보드 단축키 훅
  useEditorKeyboard(
    playbackRef, selectModeRef, bpmMarkers,
    editingMarker, showMetaModal, showCustomSnapModal,
    showDeleteConfirm, showLeaveConfirm, showSaveAsModal, showOffsetToolbar,
    validationErrors.length,
  );

  // C 키 홀드 추적
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

  // Leave 요청 이벤트 처리 (EditorToolbar에서 발행)
  useEffect(() => {
    const handler = () => setShowLeaveConfirm(true);
    window.addEventListener('editor:requestLeave', handler);
    return () => window.removeEventListener('editor:requestLeave', handler);
  }, []);

  // 초기화
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;

    const container = canvasContainerRef.current;
    const initWidth = container?.clientWidth ?? 800;
    const initHeight = container?.clientHeight ?? 600;
    setCanvasSize({ width: initWidth, height: initHeight });

    const renderer = new TimelineRenderer({
      canvas,
      width: initWidth,
      height: initHeight,
      // 렌더러는 뷰포트 소유자(뷰포트 슬라이스)를 구독만 한다 — setter 없음.
      viewport: viewportSourceFromStore(useEditorStore),
      onScroll: (newScrollY) => setScrollY(newScrollY),
    });

    renderer.init().then(() => {
      if (!mounted) return;

      rendererRef.current = renderer;

      const { extraLaneCount: storedExtraLaneCount } = useEditorStore.getState();
      renderer.setExtraLaneCount(storedExtraLaneCount);
      // chart.notes가 곧 통합 배열이다 (RFD 0018 ③) — 보조 노트도 lane 5+로 한 배열에서 그린다.
      renderer.setChart(chart);

      // init()이 async라 [chart] 반응형 effect가 렌더러 생성 전에 이미 지나갔을 수 있다.
      // 생성 직후 여기서 위반을 한 번 세팅해, 로드된 차트에 위반이 있어도 첫 편집 전에 표시되게 한다.
      const initViolations = chartViolationIndices({
        notes: chart.notes,
        trillZones: chart.trillZones,
        events: chart.events,
      });
      renderer.setViolations(initViolations.notes, initViolations.trillZones);

      // 세로 스크롤 클램프 입력을 소유자에 입주시킨다 (setScrollY가 이후 자체 클램프).
      const store = useEditorStore.getState();
      store.setViewportHeightPx(initHeight);
      store.setTimelineRangeMs({
        minTimeMs: Math.min(0, chart.meta.offsetMs),
        totalTimelineMs: renderer.getTotalTimelineMs(),
      });

      const initScroll = Math.max(0, renderer.totalTimelineHeight - initHeight);
      setScrollY(initScroll);
    });


    const playback = new PlaybackController({
      onTimeUpdate: setCurrentTimeMs,
      onPlayStateChange: setIsPlaying,
    });
    playback.volume = useGameStore.getState().settings.masterVolume ?? 1;
    playbackRef.current = playback;

    // ③ 병합 어댑터 (RFD 0018): 편집 모드는 아직 ExtraNoteEntity 축을 쓴다(이원축은 ④ 흡수).
    // 데이터는 chart.notes 한 배열(정규형 [...main, ...aux])에 살므로, 모드 콜백을 그 위 병합
    // 어댑터로 배선한다 — 모드는 메인-only 차트를 보고, 보조는 별도 축으로 읽고 쓴다.
    //  - applyMainChart(메인 차트): 새 메인 + 현재 보조 병합 (meta·events·zones는 c 것 유지)
    //  - applyExtraNotes(보조): 현재 메인 + 새 보조 병합
    // 두 병합은 순서 독립이라 조합 이동(메인+보조 동시 라이브 커밋)도 올바르게 합쳐진다.
    const applyMainChart = (c: Chart) =>
      setChart({ ...c, notes: withAuxNotes(c.notes, auxNotesAsExtra(useEditorStore.getState().chart.notes)) });
    const applyExtraNotes = (extra: ExtraNoteEntity[]) => {
      const cur = useEditorStore.getState().chart;
      setChart({ ...cur, notes: withAuxNotes(cur.notes, extra) });
    };
    const getAuxNotes = () => auxNotesAsExtra(useEditorStore.getState().chart.notes);

    const createMode = new CreateMode(chart, {
      onChartUpdate: applyMainChart,
      yToBeat: (y) => yToBeatRef.current(y),
      snapBeat,
      xToLane,
      isTimeInBounds: (y) => isTimeInBoundsRef.current(y),
      yToBeatRaw: (y) => coords.yToBeatRawRef.current(y),
      hitTestNote: (x, y) => hitTestNoteRef.current(x, y),
      hitTestExtraNote: (x, y) => hitTestExtraNoteRef.current(x, y),
      xToExtraLane: (x) => xToExtraLane(x),
      onExtraNotesUpdate: (notes) => applyExtraNotes(notes),
      getExtraNotes: getAuxNotes,
      onWarn: (msg) => addToast(msg, 'warn'),
    });
    createModeRef.current = createMode;

    const selectMode = new SelectMode(chart, {
      // RFD 0018 ④: SelectMode는 통합 차트 하나만 다룬다 — onChartUpdate가 chart.notes를
      // 그대로(메인·보조 통합) 쓴다. 이원 축(getExtraNotes/onExtraNotesUpdate/xToExtraLane/
      // hitTestExtraNote)은 소멸했고, 히트테스트는 통합(hitTestUnifiedNote)이다.
      onChartUpdate: (c) => setChart(c),
      // 선택의 소유자는 SelectionSlice — SelectMode는 사본 없이 getter/setter로만 읽고 쓴다 (RFD 0016)
      getSelection: () => useEditorStore.getState().selection,
      setSelection: (sel) => useEditorStore.getState().setSelection(sel),
      setSelectionTransient: (sel) => useEditorStore.getState().setSelectionTransient(sel),
      yToBeat: (y) => yToBeatRef.current(y),
      yToBeatRaw: (y) => coords.yToBeatRawRef.current(y),
      snapBeat,
      getSnapStep: () => {
        return { n: 4, d: useEditorStore.getState().snapDivision };
      },
      getMaxBeatFloat: () => coords.getMaxBeatFloatRef.current(),
      xToUnifiedLane: (x) => coords.xToUnifiedLane(x),
      hitTestNote: (x, y) => hitTestUnifiedNoteRef.current(x, y),
      hitTestNoteEnd: (x, y) => coords.hitTestNoteEndRef.current(x, y),
      hitTestEventEnd: (x, y) => coords.hitTestEventEndRef.current(x, y),
      hitTestTrillZoneEnd: (x, y) => coords.hitTestTrillZoneEndRef.current(x, y),
      hitTestTrillZoneHandle: (x, y) => coords.hitTestTrillZoneHandleRef.current(x, y),
      hitTestTrillZone: (x, y) => coords.hitTestTrillZoneRef.current(x, y),
      getExtraLaneCount: () => useEditorStore.getState().extraLaneCount,
      // 붙여넣기 보조 레인 자동 확장 (RFD 0018 §8-6 D3) — 붙여넣은 보조 노트가 숨지 않도록.
      setExtraLaneCount: (count) => useEditorStore.getState().setExtraLaneCount(count),
      onWarn: (msg) => addToast(msg, 'warn'),
    });
    selectModeRef.current = selectMode;

    const deleteMode = new DeleteMode(chart, {
      onChartUpdate: applyMainChart,
      hitTestNote: (x, y) => hitTestNoteRef.current(x, y),
      hitTestTrillZone: (x, y) => coords.hitTestTrillZoneRef.current(x, y),
      hitTestExtraNote: (x, y) => hitTestExtraNoteRef.current(x, y),
      onExtraNotesUpdate: (notes) => applyExtraNotes(notes),
      // 보조 노트 삭제는 chart.notes 축소 커밋이 선택을 원자적으로 비운다(§3-5 면제) — 별도 clear 불필요.
      getExtraNotes: getAuxNotes,
      onWarn: (msg) => addToast(msg, 'warn'),
    });
    deleteModeRef.current = deleteMode;

    return () => {
      mounted = false;
      renderer.dispose();
      playback.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // masterVolume 변경 시 PlaybackController에 반영
  const masterVolume = useGameStore((s) => s.settings.masterVolume ?? 1);
  useEffect(() => {
    if (playbackRef.current) {
      playbackRef.current.volume = masterVolume;
    }
  }, [masterVolume]);

  // 오디오 로드
  useEffect(() => {
    if (!pendingAudioUrl) return;
    const playback = playbackRef.current;
    if (!playback) return;

    const url = pendingAudioUrl;
    if (!hasCompletedInitialAudioLoadRef.current) {
      setInitialAudioPending(true);
    }
    setPendingAudioUrl(null);
    setAudioLoading(true);
    // dirty 스냅샷은 저장 분리(buildChartAsset)와 동일하게 직렬화한다 — 메인/보조 분리 후 비교.
    setSavedChartSnapshot(serializeChart({ ...chart, notes: mainNotes(chart.notes) }));
    setSavedExtraSnapshot(serializeExtraNotes(auxNotesAsExtra(chart.notes), useEditorStore.getState().extraLaneCount));

    playback.loadAudioUrl(url).then(() => {
      const audioBuffer = playback.audioBufferData;
      setLoadedAudioBuffer(audioBuffer ?? null);
      if (audioBuffer && rendererRef.current) {
        const samplesPerPeak = Math.ceil(audioBuffer.sampleRate / 50);
        const peaks = getWaveformPeaks(audioBuffer, samplesPerPeak);
        const durationMs = audioBuffer.duration * 1000;
        rendererRef.current.setWaveformData(peaks, durationMs);
        // Update playback end boundary after waveform changes total timeline
        playback.setEndTimeMs(rendererRef.current.getTotalTimelineMs());
        // 스크롤 클램프 입력(타임라인 범위)도 음원 길이를 따라간다
        useEditorStore.getState().setTimelineRangeMs({
          minTimeMs: Math.min(0, useEditorStore.getState().chart.meta.offsetMs),
          totalTimelineMs: rendererRef.current.getTotalTimelineMs(),
        });
      }
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setLoadedAudioBuffer(null);
      addToast(`Audio load failed: ${message}`, 'error');
    }).finally(() => {
      setAudioLoading(false);
      hasCompletedInitialAudioLoadRef.current = true;
      setInitialAudioPending(false);
    });
  }, [pendingAudioUrl, setPendingAudioUrl, addToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ResizeObserver
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const w = Math.floor(width);
        const h = Math.floor(height);
        if (w > 0 && h > 0) setCanvasSize({ width: w, height: h });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // canvasSize → renderer + 스크롤 클램프 입력(뷰포트 높이)
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.resize(canvasSize.width, canvasSize.height);
    useEditorStore.getState().setViewportHeightPx(canvasSize.height);
  }, [canvasSize]);

  // chart → renderer(통합 차트) + modes(메인-only 차트) — RFD 0018 ③.
  // chart.notes가 곧 통합 배열(정규형 [...main, ...aux])이라 렌더러·해칭이 chart.notes를 직접 소비한다.
  // 편집 모드는 메인 레인만 다루므로(이원축은 ④ 흡수) 메인-only 차트를 준다.
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setChart(chart);
      const violations = chartViolationIndices({
        notes: chart.notes,
        trillZones: chart.trillZones,
        events: chart.events,
      });
      rendererRef.current.setViolations(violations.notes, violations.trillZones);
    }
    // SelectMode는 통합 차트(메인+보조)를 본다 (RFD 0018 ④). Create/Delete는 아직 메인-only
    // 차트 + 보조 축 어댑터를 쓰므로(이원 축 계승) 메인-only 차트를 준다.
    const mainChart = { ...chart, notes: mainNotes(chart.notes) };
    if (createModeRef.current) createModeRef.current.setChart(mainChart);
    if (selectModeRef.current) selectModeRef.current.setChart(chart);
    if (deleteModeRef.current) deleteModeRef.current.setChart(mainChart);
    // Update playback end boundary when chart changes (measure count may change)
    if (rendererRef.current && playbackRef.current) {
      playbackRef.current.setEndTimeMs(rendererRef.current.getTotalTimelineMs());
    }
    // 스크롤 클램프 입력(타임라인 범위)도 차트 변경을 따라간다
    if (rendererRef.current) {
      useEditorStore.getState().setTimelineRangeMs({
        minTimeMs: Math.min(0, chart.meta.offsetMs),
        totalTimelineMs: rendererRef.current.getTotalTimelineMs(),
      });
    }
  }, [chart]);

  // extraLaneCount → renderer
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setExtraLaneCount(extraLaneCount);
  }, [extraLaneCount]);

  // zoom·snapDivision·scrollY → renderer 동기화 useEffect는 삭제됨:
  // 렌더러가 ViewportSource(뷰포트 슬라이스)를 직접 구독한다.

  // 선택 표시 → renderer: 선택은 통합 축(sel.notes) 하나 — chart.notes 인덱스 공간을 그대로 피드.
  // 메인·보조 노트가 chart.notes 한 배열에 살고 선택도 통합 인덱스라 union 어댑터가 사라졌다 (RFD 0018 ④).
  useEffect(() => {
    rendererRef.current?.setSelectedNotes(selectedNotes);
  }, [selectedNotes]);

  // selection.zones → renderer (notes·extraNotes는 위의 두 effect가 push)
  const selectedZones = useEditorStore((s) => s.selection.zones);
  useEffect(() => {
    rendererRef.current?.setSelectedTrillZones(selectedZones);
  }, [selectedZones]);

  // entityType → createMode
  const entityType = useEditorStore((s) => s.entityType);
  useEffect(() => {
    if (createModeRef.current) createModeRef.current.entityType = entityType;
  }, [entityType]);

  // graceMode → createMode
  const graceMode = useEditorStore((s) => s.graceMode);
  useEffect(() => {
    if (createModeRef.current) createModeRef.current.graceMode = graceMode;
  }, [graceMode]);

  // create 모드 이탈 시 ghost 숨기기
  useEffect(() => {
    if (mode !== 'create') rendererRef.current?.hideGhostNote();
  }, [mode]);

  // 재생 커서 + 자동 스크롤
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.updatePlaybackCursor(currentTimeMs);
    if (autoScroll && isPlaying) {
      const cursorY = renderer.timeToY(currentTimeMs);
      setScrollY(cursorY - canvasSize.height / 2); // 클램프는 setScrollY 내장
    }
  }, [currentTimeMs, autoScroll, isPlaying, canvasSize.height, setScrollY]);

  // 휠 핸들러 (passive: false 필요)
  const handleWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey) {
      const renderer = rendererRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (renderer && rect) {
        const cursorCanvasY = e.clientY - rect.top;
        // 커서 아래 시간은 줌 변경 "전" 좌표계로 계산한다. 줌+앵커 보정 스크롤은
        // 단일 set으로 커밋해 구독 통지·렌더가 1회만 일어난다(휠 연타 성능).
        const cursorTimeMs = renderer.yToTime(cursorCanvasY);
        useEditorStore.getState().zoomByWheelAnchored(e.deltaY, {
          timeMs: cursorTimeMs,
          canvasY: cursorCanvasY,
        });
      } else {
        useEditorStore.getState().zoomByWheel(e.deltaY);
      }
      return;
    }

    const horizontalDelta = e.shiftKey
      ? e.deltaY
      : Math.abs(e.deltaX) > Math.abs(e.deltaY)
        ? e.deltaX
        : 0;
    if (horizontalDelta !== 0) {
      rendererRef.current?.panHorizontally(horizontalDelta);
      return;
    }

    const active = activeEditorMode(mode, createModeRef.current, selectModeRef.current, deleteModeRef.current);
    const wheeledEntityType = active?.onWheel(e.deltaY, cKeyHeldRef.current);
    if (wheeledEntityType != null) {
      useEditorStore.getState().setEntityType(wheeledEntityType);
      return;
    }

    setScrollY(scrollY + e.deltaY); // 클램프는 setScrollY 내장
  }, [mode, scrollY, setScrollY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheelNative);
  }, [handleWheelNative]);

  useEffect(() => {
    const preventBrowserZoom = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    document.addEventListener('wheel', preventBrowserZoom, { passive: false });
    return () => document.removeEventListener('wheel', preventBrowserZoom);
  }, []);

  const editingEvt = editingMarker ? chart.events[editingMarker.index] : null;
  const isEditingInitial = editingEvt && editingEvt.beat.n === 0 && (editingEvt.type === 'bpm' || editingEvt.type === 'timeSignature');

  return (
    <div style={styles.container}>
      {/* 툴바 */}
      {audioLoadingSurface === 'transparentPage' && (
        <PageLoading message="Loading audio..." background="transparent" />
      )}
      <EditorToolbar
        compact={compactEditor}
        playbackRef={playbackRef}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
        showOffsetToolbar={showOffsetToolbar}
        setShowOffsetToolbar={setShowOffsetToolbar}
        showPlayTestMenu={showPlayTestMenu}
        setShowPlayTestMenu={setShowPlayTestMenu}
        saving={saving}
        deleting={deleting}
        savedChartSnapshot={savedChartSnapshot}
        savedExtraSnapshot={savedExtraSnapshot}
        pendingPreviewRange={pendingPreviewRange}
        pendingGameplayRange={pendingGameplayRange}
        onPlayTest={fileOps.handlePlayTest}
        onSaveChart={fileOps.handleSaveChart}
        onSaveAs={() => setShowSaveAsModal(true)}
        onDeleteChart={() => setShowDeleteConfirm(true)}
        onDeleteSelected={handleDeleteSelected}
        onOpenMeta={() => setShowMetaModal(true)}
        onOpenCustomSnap={() => setShowCustomSnapModal(true)}
      />

      {/* 캔버스 */}
      <div ref={canvasContainerRef} style={styles.canvasContainer}>
        {audioLoadingSurface === 'overlay' && <OverlayLoading message="Loading audio..." />}
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onPointerDown={canvasEvents.handlePointerDown}
          onPointerMove={canvasEvents.handlePointerMove}
          onPointerUp={canvasEvents.handlePointerUp}
          onPointerCancel={canvasEvents.handlePointerCancel}
          onPointerLeave={canvasEvents.handlePointerLeave}
          onDoubleClick={canvasEvents.handleDoubleClick}
          onContextMenu={canvasEvents.handleContextMenu}
        />
      </div>

      {/* 마커 편집 모달 */}
      {editingMarker && (
        <MarkerEditModal
          editingMarker={editingMarker}
          chart={chart}
          isBeatZero={!!isEditingInitial}
          onSave={fileOps.handleMarkerSave}
          onDelete={fileOps.handleMarkerDelete}
          onClose={() => setEditingMarker(null)}
        />
      )}

      {/* 메타 편집 모달 */}
      {showMetaModal && (
        <MetaEditModal
          meta={chart.meta}
          audioBuffer={loadedAudioBuffer}
          initialJacketFile={pendingJacketFile}
          jacketCacheBust={jacketCacheBust}
          initialGameplayRange={songGameplayRange}
          onSave={async (meta, previewRange, jacketFile, gameplayRange, audioFile) => {
            const prevStart = chart.meta.previewStart;
            const prevEnd = chart.meta.previewEnd;
            const rangeChanged = previewRange != null && (
              previewRange.startTime !== prevStart || previewRange.endTime !== prevEnd
            );
            setChart({ ...chart, meta });
            if (rangeChanged && previewRange) {
              setPendingPreviewRange({
                startTime: previewRange.startTime,
                endTime: previewRange.endTime,
                fadeInTime: previewRange.fadeInTime,
                fadeOutTime: previewRange.fadeOutTime,
              });
            }
            const nextGameplayRange = gameplayRange
              ? {
                startTime: gameplayRange.startTime,
                endTime: gameplayRange.endTime,
                fadeInTime: gameplayRange.fadeInTime,
                fadeOutTime: gameplayRange.fadeOutTime,
              }
              : null;
            if (!samePlaybackRange(nextGameplayRange, songGameplayRange)) {
              setSongGameplayRange(nextGameplayRange);
              setPendingGameplayRange(nextGameplayRange);
            }
            if (jacketFile) setPendingJacketFile(jacketFile);
            if (audioFile) setPendingAudioFile(audioFile);
            setShowMetaModal(false);
          }}
          onClose={() => setShowMetaModal(false)}
          onLoadAudio={(file) => {
            if (playbackRef.current) {
              playbackRef.current.loadAudioFile(file).then(() => {
                const audioBuffer = playbackRef.current?.audioBufferData;
                setLoadedAudioBuffer(audioBuffer ?? null);
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

      {/* 커스텀 스냅 모달 */}
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

      {/* Leave 확인 모달 */}
      {showLeaveConfirm && (
        <div style={modalStyles.overlay} onMouseDown={() => setShowLeaveConfirm(false)}>
          <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={modalStyles.title}>{LEAVE_CONFIRM_COPY.title}</h3>
            <p style={{ fontSize: '14px', margin: '0 0 16px', color: '#ccc' }}>
              {LEAVE_CONFIRM_COPY.body}
            </p>
            <div style={modalStyles.buttons}>
              <button style={modalStyles.deleteBtn} onClick={() => { setShowLeaveConfirm(false); window.location.href = '/game'; }}>
                {LEAVE_CONFIRM_COPY.confirm}
              </button>
              <button style={modalStyles.cancelBtn} onClick={() => setShowLeaveConfirm(false)}>
                {LEAVE_CONFIRM_COPY.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save As 모달 */}
      {showSaveAsModal && (
        <SaveAsModal
          currentDifficulty={chart.meta.difficultyLabel}
          title={chart.meta.title}
          level={chart.meta.difficultyLevel}
          isDirty={!!(savedChartSnapshot && (serializeChart({ ...chart, notes: mainNotes(chart.notes) }) !== savedChartSnapshot || serializeExtraNotes(auxNotesAsExtra(chart.notes), extraLaneCount) !== savedExtraSnapshot))}
          onSave={async (targetDifficulty, targetLevel) => {
            const { data: existing } = await supabase
              .from('charts')
              .select('song_id')
              .eq('song_id', activeSongId!)
              .eq('difficulty_label', targetDifficulty.toLowerCase())
              .maybeSingle();
            if (existing) {
              setSaveAsOverwriteTarget({ difficulty: targetDifficulty, level: targetLevel });
              setShowSaveAsModal(false);
            } else {
              fileOps.handleSaveAs(targetDifficulty, targetLevel);
            }
          }}
          onClose={() => setShowSaveAsModal(false)}
        />
      )}

      {/* 덮어쓰기 확인 모달 */}
      {saveAsOverwriteTarget && (
        <div style={modalStyles.overlay} onMouseDown={() => setSaveAsOverwriteTarget(null)}>
          <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={modalStyles.title}>Overwrite Existing Chart</h3>
            <p style={{ fontSize: '14px', margin: '0 0 16px', color: '#ccc' }}>
              <strong>{saveAsOverwriteTarget.difficulty.toUpperCase()}</strong> 난이도에 이미 차트가 존재합니다.<br />
              <span style={{ color: '#ff9966', fontSize: '13px' }}>덮어쓰시겠습니까? 이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div style={modalStyles.buttons}>
              <button style={modalStyles.deleteBtn} onClick={() => fileOps.handleSaveAs(saveAsOverwriteTarget.difficulty, saveAsOverwriteTarget.level)}>Overwrite</button>
              <button style={modalStyles.cancelBtn} onClick={() => setSaveAsOverwriteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div style={modalStyles.overlay} onMouseDown={() => setShowDeleteConfirm(false)}>
          <div style={modalStyles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={modalStyles.title}>Delete Chart</h3>
            <p style={{ fontSize: '14px', margin: '0 0 16px', color: '#ccc' }}>
              <strong>{chart.meta.difficultyLabel.toUpperCase()}</strong> 차트를 삭제하시겠습니까?<br />
              <span style={{ color: '#999', fontSize: '13px' }}>Storage 파일과 DB 행이 모두 삭제됩니다.</span>
            </p>
            <div style={modalStyles.buttons}>
              <button style={modalStyles.deleteBtn} onClick={fileOps.handleDeleteChart}>Delete</button>
              <button style={modalStyles.cancelBtn} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* 유효성 검사 오류 모달 */}
      {validationErrors.length > 0 && (
        <div style={modalStyles.overlay} onMouseDown={() => setValidationErrors([])}>
          <div style={{ ...modalStyles.modal, maxWidth: '480px', maxHeight: '60vh', display: 'flex', flexDirection: 'column' as const }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={modalStyles.title}>배치 제약 조건 위반</h3>
            <p style={{ fontSize: '13px', margin: '0 0 12px', color: '#ccc' }}>
              차트에 {validationErrors.length}건의 제약 조건 위반이 발견되어 저장할 수 없습니다.
            </p>
            {(() => {
              // 숨은 보조 레인 위반 안내 (RFD 0018 §8-7): 레인 수 축소로 화면에 없는
              // 노트가 저장을 막을 때, 그 사실과 필요한 보조 레인 수를 명시한다.
              const hidden = hiddenViolationLanes(
                validationErrors,
                chart.notes,
                extraLaneCount,
              );
              if (hidden.length === 0) return null;
              const needed = toAuxIndex(Math.max(...hidden));
              return (
                <p style={{ fontSize: '13px', margin: '0 0 12px', color: '#e8a33d' }}>
                  숨은 보조 레인({hidden.map((l) => toAuxIndex(l)).join(', ')})의 위반이 포함되어
                  있습니다 — 보조 레인 수를 {needed} 이상으로 늘리면 보입니다.
                </p>
              );
            })()}
            <div style={{ overflow: 'auto', flex: 1, marginBottom: '16px' }}>
              {validationErrors.map((err, i) => (
                <div key={i} style={{ padding: '6px 8px', marginBottom: '4px', backgroundColor: '#1a1a1a', borderRadius: '4px', fontSize: '12px', borderLeft: '3px solid #cc3333' }}>
                  <span style={{ color: '#ff6666', fontWeight: 'bold' }}>[{err.rule}]</span>{' '}
                  <span style={{ color: '#ddd' }}>{err.message}</span>
                </div>
              ))}
            </div>
            <div style={modalStyles.buttons}>
              <button style={modalStyles.cancelBtn} onClick={() => setValidationErrors([])}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100dvh',
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
    minHeight: 0,
    position: 'relative' as const,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
    touchAction: 'none',
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
  },
};
