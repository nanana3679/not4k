/**
 * Editor Store — Zustand state management for not4k chart editor
 */

import { create } from 'zustand';
import type { Chart, ExtraNoteEntity } from '../../shared';
import { beat } from '../../shared';
import type { EntityType } from '../modes';

type EditorMode = 'create' | 'select' | 'delete';
type EditorPage = 'songList' | 'chartEditor';

export interface Toast {
  id: number;
  message: string;
  type: 'warn' | 'error' | 'info';
}

export type EditingMarker =
  | { type: 'event'; index: number }
  | null;

let toastId = 0;

interface EditorState {
  // Page navigation
  activePage: EditorPage;
  activeSongId: string | null;
  pendingAudioUrl: string | null;

  // Chart data
  chart: Chart;

  // Editor mode
  mode: EditorMode;
  entityType: EntityType;

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

  // Toasts
  toasts: Toast[];

  // Marker editing
  editingMarker: EditingMarker;

  // Actions
  setActivePage: (page: EditorPage) => void;
  setActiveSongId: (songId: string | null) => void;
  setPendingAudioUrl: (url: string | null) => void;
  setChart: (chart: Chart) => void;
  setMode: (mode: EditorMode) => void;
  setEntityType: (entityType: EntityType) => void;
  setZoom: (zoom: number) => void;
  setSnapDivision: (snap: number) => void;
  setScrollY: (scrollY: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  setSelectedNotes: (indices: Set<number>) => void;
  setExtraNotes: (notes: ExtraNoteEntity[]) => void;
  setExtraLaneCount: (count: number) => void;
  setSelectedExtraNotes: (indices: Set<number>) => void;
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: number) => void;
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

export const useEditorStore = create<EditorState>((set) => ({
  // Initial state
  activePage: 'songList',
  activeSongId: null,
  pendingAudioUrl: null,
  chart: createDefaultChart(),
  mode: 'create',
  entityType: 'single',
  zoom: 200,
  snapDivision: 4,
  scrollY: 0,
  isPlaying: false,
  currentTimeMs: 0,
  selectedNotes: new Set(),
  extraNotes: [],
  extraLaneCount: 2,
  selectedExtraNotes: new Set(),
  toasts: [],
  editingMarker: null,

  // Actions
  setActivePage: (activePage) => set({ activePage }),
  setActiveSongId: (activeSongId) => set({ activeSongId }),
  setPendingAudioUrl: (pendingAudioUrl) => set({ pendingAudioUrl }),
  setChart: (chart) => set({ chart }),
  setMode: (mode) => set({ mode }),
  setEntityType: (entityType) => set({ entityType }),
  setZoom: (zoom) => set({ zoom }),
  setSnapDivision: (snapDivision) => set({ snapDivision }),
  setScrollY: (scrollY) => set({ scrollY }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setSelectedNotes: (selectedNotes) => set({ selectedNotes }),
  setExtraNotes: (extraNotes) => set({ extraNotes }),
  setExtraLaneCount: (extraLaneCount) => set({ extraLaneCount }),
  setSelectedExtraNotes: (selectedExtraNotes) => set({ selectedExtraNotes }),
  addToast: (message, type = 'warn') => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setEditingMarker: (marker) => set({ editingMarker: marker }),
}));
