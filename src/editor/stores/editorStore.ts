/**
 * Editor Store — Zustand state management for not4k chart editor
 */

import { create } from 'zustand';
import type { Chart, ExtraNoteEntity } from '../../shared';
import { beat } from '../../shared';
import { showToast, type ToastType } from '../../shared/toast';
import type { EntityType } from '../modes';
import { createViewportSlice, type ViewportSlice } from './viewportSlice';

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

// 뷰포트 상태(zoom·snapDivision·scrollY·horizontalPanX)는 ViewportSlice가 단독 소유한다.
interface EditorState extends ViewportSlice {
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
  setMode: (mode: EditorModeName) => void;
  setEntityType: (entityType: EntityType) => void;
  setGraceMode: (graceMode: boolean) => void;
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

export const useEditorStore = create<EditorState>((set, get) => ({
  // 뷰포트 슬라이스 (상태 + 클램프 내장 액션)
  ...createViewportSlice(set, get),

  // Initial state
  activePage: 'songList',
  activeSongId: null,
  pendingAudioUrl: null,
  chart: createDefaultChart(),
  mode: 'create',
  entityType: 'single',
  graceMode: false,
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
  setChart: (chart) => set((state) => ({ ...captureHistory(state), chart })),
  setMode: (mode) => set({ mode }),
  setEntityType: (entityType) => set({ entityType }),
  setGraceMode: (graceMode) => set({ graceMode }),
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
