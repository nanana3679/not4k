/**
 * Editor Store — Zustand state management for not4k chart editor
 */

import { create } from 'zustand';
import type { Chart, ExtraNoteEntity } from '../../shared';
import { beat, validateChart } from '../../shared';
import { showToast, type ToastType } from '../../shared/toast';
import type { EntityType } from '../modes';

export type EditorModeName = 'create' | 'select' | 'delete';
type EditorPage = 'songList' | 'chartEditor';
type HistorySnapshot = {
  chart: Chart;
  extraNotes: ExtraNoteEntity[];
  extraLaneCount: number;
};

export type EditingMarker =
  | { type: 'event'; index: number }
  | null;

const HISTORY_LIMIT = 100;
const HISTORY_COALESCE_MS = 600;

interface EditorState {
  // Page navigation
  activePage: EditorPage;
  activeSongId: string | null;
  pendingAudioUrl: string | null;

  // Chart data
  chart: Chart;

  // Editor mode
  mode: EditorModeName;
  entityType: EntityType;
  graceMode: boolean; // Create 배치 시 면제 플래그 부여 (포인트→grace, 싱글롱→holdOnly)

  // Timeline state
  zoom: number;
  snapDivision: number;
  scrollY: number;

  // Playback
  isPlaying: boolean;
  currentTimeMs: number;

  // Selection
  selectedNotes: Set<number>;

  // Extra lanes (editor-only)
  extraNotes: ExtraNoteEntity[];
  extraLaneCount: number;
  selectedExtraNotes: Set<number>;

  // Undo/redo history
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];
  historyLastCaptureAt: number;

  // Marker editing
  editingMarker: EditingMarker;

  // Actions
  setActivePage: (page: EditorPage) => void;
  setActiveSongId: (songId: string | null) => void;
  setPendingAudioUrl: (url: string | null) => void;
  setChart: (chart: Chart) => void;
  /**
   * 로드 전용 통로 — 위반 차트도 수용해 열람·수리를 허용한다(경고만 표시).
   * 재저장은 저장 게이트(useFileOperations의 validateChart)가 차단하므로
   * 위반 상태가 저장·전파되지는 않는다. 로드 외의 경로에서 쓰지 말 것.
   */
  loadChart: (chart: Chart) => void;
  setMode: (mode: EditorModeName) => void;
  setEntityType: (entityType: EntityType) => void;
  setGraceMode: (graceMode: boolean) => void;
  setZoom: (zoom: number) => void;
  setSnapDivision: (snap: number) => void;
  setScrollY: (scrollY: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  setSelectedNotes: (indices: Set<number>) => void;
  setExtraNotes: (notes: ExtraNoteEntity[]) => void;
  setExtraLaneCount: (count: number) => void;
  setSelectedExtraNotes: (indices: Set<number>) => void;
  undo: () => void;
  redo: () => void;
  resetHistory: () => void;
  addToast: (message: string, type?: ToastType) => void;
  setEditingMarker: (marker: EditingMarker) => void;
}

const createDefaultChart = (): Chart => ({
  meta: {
    title: 'Untitled',
    artist: '',
    difficultyLabel: 'NORMAL',
    difficultyLevel: 1,
    imageFile: '',
    audioFile: '',
    previewAudioFile: '',
    offsetMs: 0,
  },
  notes: [],
  trillZones: [],
  events: [{ type: "bpm" as const, beat: beat(0, 1), bpm: 120, editorLane: 1 }, { type: "timeSignature" as const, beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 }],
});

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function createHistorySnapshot(state: Pick<EditorState, 'chart' | 'extraNotes' | 'extraLaneCount'>): HistorySnapshot {
  return {
    chart: cloneJson(state.chart),
    extraNotes: cloneJson(state.extraNotes),
    extraLaneCount: state.extraLaneCount,
  };
}

function captureHistory(state: EditorState): Partial<EditorState> {
  const now = Date.now();
  if (state.historyPast.length > 0 && now - state.historyLastCaptureAt < HISTORY_COALESCE_MS) {
    return {
      historyFuture: [],
    };
  }

  return {
    historyPast: [...state.historyPast, createHistorySnapshot(state)].slice(-HISTORY_LIMIT),
    historyFuture: [],
    historyLastCaptureAt: now,
  };
}

export const useEditorStore = create<EditorState>((set) => ({
  // Initial state
  activePage: 'songList',
  activeSongId: null,
  pendingAudioUrl: null,
  chart: createDefaultChart(),
  mode: 'create',
  entityType: 'single',
  graceMode: false,
  zoom: 200,
  snapDivision: 4,
  scrollY: 0,
  isPlaying: false,
  currentTimeMs: 0,
  selectedNotes: new Set(),
  extraNotes: [],
  extraLaneCount: 2,
  selectedExtraNotes: new Set(),
  historyPast: [],
  historyFuture: [],
  historyLastCaptureAt: 0,
  editingMarker: null,

  // Actions
  setActivePage: (activePage) => set({ activePage }),
  setActiveSongId: (activeSongId) => set({ activeSongId }),
  setPendingAudioUrl: (pendingAudioUrl) => set({ pendingAudioUrl }),
  setChart: (chart) => {
    // 차트 변이 게이트 — 모델 불변(배치 제약, 층1)은 이 한 곳에서 강제된다.
    // 정상 편집 경로는 모드의 사전검증에서 이미 걸리므로, 여기 도달한 위반은
    // 무검증 경로(삭제·토글 등)의 버그 신호다. 거부 시 차트·히스토리 무변.
    const errors = validateChart({
      notes: chart.notes,
      trillZones: chart.trillZones,
      events: chart.events,
    });
    if (errors.length > 0) {
      console.error('차트 변이 거부 (배치 제약 위반):', errors);
      showToast(`배치 제약 위반으로 변경이 취소되었습니다: ${errors[0].message}`, 'warn');
      return;
    }
    set((state) => ({ ...captureHistory(state), chart }));
  },
  loadChart: (chart) => {
    const errors = validateChart({
      notes: chart.notes,
      trillZones: chart.trillZones,
      events: chart.events,
    });
    if (errors.length > 0) {
      console.error('로드된 차트에 배치 제약 위반:', errors);
      showToast(`이 차트에 배치 제약 위반 ${errors.length}건이 있습니다 — 수리 후 저장할 수 있습니다`, 'warn');
    }
    set({ chart });
  },
  setMode: (mode) => set({ mode }),
  setEntityType: (entityType) => set({ entityType }),
  setGraceMode: (graceMode) => set({ graceMode }),
  setZoom: (zoom) => set({ zoom }),
  setSnapDivision: (snapDivision) => set({ snapDivision }),
  setScrollY: (scrollY) => set({ scrollY }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setSelectedNotes: (selectedNotes) => set({ selectedNotes }),
  setExtraNotes: (extraNotes) => set((state) => ({ ...captureHistory(state), extraNotes })),
  setExtraLaneCount: (extraLaneCount) => set((state) => ({ ...captureHistory(state), extraLaneCount })),
  setSelectedExtraNotes: (selectedExtraNotes) => set({ selectedExtraNotes }),
  undo: () => set((state) => {
    const previous = state.historyPast.at(-1);
    if (!previous) return {};
    const current = createHistorySnapshot(state);
    return {
      chart: previous.chart,
      extraNotes: previous.extraNotes,
      extraLaneCount: previous.extraLaneCount,
      selectedNotes: new Set(),
      selectedExtraNotes: new Set(),
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [current, ...state.historyFuture].slice(0, HISTORY_LIMIT),
      historyLastCaptureAt: 0,
    };
  }),
  redo: () => set((state) => {
    const next = state.historyFuture[0];
    if (!next) return {};
    const current = createHistorySnapshot(state);
    return {
      chart: next.chart,
      extraNotes: next.extraNotes,
      extraLaneCount: next.extraLaneCount,
      selectedNotes: new Set(),
      selectedExtraNotes: new Set(),
      historyPast: [...state.historyPast, current].slice(-HISTORY_LIMIT),
      historyFuture: state.historyFuture.slice(1),
      historyLastCaptureAt: 0,
    };
  }),
  resetHistory: () => set({ historyPast: [], historyFuture: [], historyLastCaptureAt: 0 }),
  addToast: (message, type = 'warn') => showToast(message, type),
  setEditingMarker: (marker) => set({ editingMarker: marker }),
}));
