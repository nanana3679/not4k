/**
 * Editor Store — Zustand state management for not4k chart editor
 */

import { create } from 'zustand';
import type { Chart } from '@not4k/shared';
import { beat } from '@not4k/shared';
import type { EntityType } from '../modes';

type EditorMode = 'create' | 'select' | 'delete';

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

  // Toasts
  toasts: Toast[];

  // Marker editing
  editingMarker: EditingMarker;

  // Actions
  setChart: (chart: Chart) => void;
  setMode: (mode: EditorMode) => void;
  setEntityType: (entityType: EntityType) => void;
  setZoom: (zoom: number) => void;
  setSnapDivision: (snap: number) => void;
  setScrollY: (scrollY: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  setSelectedNotes: (indices: Set<number>) => void;
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
  events: [{ beat: beat(0, 1), endBeat: beat(0, 1), bpm: 120, beatPerMeasure: { n: 4, d: 1 } }],
});

export const useEditorStore = create<EditorState>((set) => ({
  // Initial state
  chart: createDefaultChart(),
  mode: 'create',
  entityType: 'single',
  zoom: 200,
  snapDivision: 4,
  scrollY: 0,
  isPlaying: false,
  currentTimeMs: 0,
  selectedNotes: new Set(),
  toasts: [],
  editingMarker: null,

  // Actions
  setChart: (chart) => set({ chart }),
  setMode: (mode) => set({ mode }),
  setEntityType: (entityType) => set({ entityType }),
  setZoom: (zoom) => set({ zoom }),
  setSnapDivision: (snapDivision) => set({ snapDivision }),
  setScrollY: (scrollY) => set({ scrollY }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setSelectedNotes: (selectedNotes) => set({ selectedNotes }),
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
