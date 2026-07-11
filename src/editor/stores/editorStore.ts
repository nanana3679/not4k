/**
 * Editor Store — Zustand state management for not4k chart editor
 */

import { create } from 'zustand';
import type { Chart, ExtraNoteEntity } from '../../shared';
import { beat, validateChart, validateChartStructural } from '../../shared';
import { showToast, type ToastType } from '../../shared/toast';
import type { EntityType } from '../modes';
import { createViewportSlice, type ViewportSlice } from './viewportSlice';
import {
  createSelectionSlice,
  emptySelection,
  normalizeSelection,
  selectionEquals,
  type SelectionSlice,
} from './selectionSlice';

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
// 선택 상태(selection: notes·extraNotes·zones)는 SelectionSlice가 단독 소유한다(RFD 0016).
interface EditorState extends ViewportSlice, SelectionSlice {
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

  // Extra lanes (editor-only)
  extraNotes: ExtraNoteEntity[];
  extraLaneCount: number;

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
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  setExtraNotes: (notes: ExtraNoteEntity[]) => void;
  setExtraLaneCount: (count: number) => void;
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
  // 선택 슬라이스 (상태 + 정규화 게이트 내장 액션)
  ...createSelectionSlice(set, get),

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
  extraNotes: [],
  extraLaneCount: 2,
  historyPast: [],
  historyFuture: [],
  historyLastCaptureAt: 0,
  editingMarker: null,

  // Actions
  setActivePage: (activePage) => set({ activePage }),
  setActiveSongId: (activeSongId) => set({ activeSongId }),
  setPendingAudioUrl: (pendingAudioUrl) => set({ pendingAudioUrl }),
  setChart: (chart) => {
    // 차트 변이 게이트 — 낙관적 편집(RFD 0017). 여기서는 **구조 위반만** 하드 거부한다:
    // malformed 데이터(구간 역전)·크래시 유발(분자 0 박자표)은 편집 중에도 절대 불가.
    // 의미 위반(겹침·중복·트릴 헤드 등)은 transient로 **허용해 커밋**한다 — "일단 옮기고
    // 나중에 고치기"를 위해. 의미 제약은 저장·플레이/프리뷰 진입 게이트가 강제한다.
    // 거부 시 차트·히스토리 무변. 커밋 시 의미 위반 상태도 히스토리에 남아 undo로 복귀 가능.
    const errors = validateChartStructural({
      notes: chart.notes,
      trillZones: chart.trillZones,
      events: chart.events,
    });
    if (errors.length > 0) {
      console.error('차트 변이 거부 (구조 위반):', errors);
      showToast(`구조 위반으로 변경이 취소되었습니다: ${errors[0].message}`, 'warn');
      return;
    }
    set((state) => {
      // 선택 보정 — "선택 인덱스는 차트 범위 안"이라는 관계 불변은
      // 차트 변이와 같은 트랜잭션에서 지킨다(순서 의존 제거)
      const normalized = normalizeSelection(state.selection, chart, state.extraNotes);
      return {
        ...captureHistory(state),
        chart,
        selection: selectionEquals(normalized, state.selection) ? state.selection : normalized,
      };
    });
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
    // 다른 차트를 여는 것이므로 기존 선택은 무의미 — 전체 clear
    set({ chart, selection: emptySelection() });
  },
  setMode: (mode) => set({ mode }),
  setEntityType: (entityType) => set({ entityType }),
  setGraceMode: (graceMode) => set({ graceMode }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setExtraNotes: (extraNotes) => set((state) => {
    // 엑스트라 배열이 줄면 범위 밖 선택을 같은 트랜잭션에서 보정한다
    const normalized = normalizeSelection(state.selection, state.chart, extraNotes);
    return {
      ...captureHistory(state),
      extraNotes,
      selection: selectionEquals(normalized, state.selection) ? state.selection : normalized,
    };
  }),
  setExtraLaneCount: (extraLaneCount) => set((state) => ({ ...captureHistory(state), extraLaneCount })),
  undo: () => set((state) => {
    const previous = state.historyPast.at(-1);
    if (!previous) return {};
    const current = createHistorySnapshot(state);
    return {
      chart: previous.chart,
      extraNotes: previous.extraNotes,
      extraLaneCount: previous.extraLaneCount,
      // 선택은 복원된 차트에 대해 무의미하므로 전체 clear(zones 포함) — 같은 set()에서 원자적으로
      selection: emptySelection(),
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
      selection: emptySelection(),
      historyPast: [...state.historyPast, current].slice(-HISTORY_LIMIT),
      historyFuture: state.historyFuture.slice(1),
      historyLastCaptureAt: 0,
    };
  }),
  resetHistory: () => set({ historyPast: [], historyFuture: [], historyLastCaptureAt: 0 }),
  addToast: (message, type = 'warn') => showToast(message, type),
  setEditingMarker: (marker) => set({ editingMarker: marker }),
}));
