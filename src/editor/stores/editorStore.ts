/**
 * Editor Store — Zustand state management for not4k chart editor
 */

import { create } from 'zustand';
import type { Chart } from '../../shared';
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
  extraLaneCount: number;
};

export type EditingMarker =
  | { type: 'event'; index: number }
  | null;

const HISTORY_LIMIT = 100;
const HISTORY_COALESCE_MS = 600;

// 뷰포트 상태(zoom·snapDivision·scrollY·horizontalPanX)는 ViewportSlice가 단독 소유한다.
// 선택 상태(selection: notes·zones)는 SelectionSlice가 단독 소유한다(RFD 0016).
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

  // Extra lanes — 보조 노트는 chart.notes(lane 5+)로 이주(RFD 0018 ③), extraLaneCount만 순수 설정으로 유지(§8-3)
  extraLaneCount: number;

  // Undo/redo history
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];
  historyLastCaptureAt: number;

  // 막다른 상태 탈출(RFD 0017 §7) — 마지막으로 차트 전체가 valid였던 스냅샷.
  // setChart·loadChart 커밋 직후 validateChart 전체 통과 시에만 갱신(위반이면 이전 값 유지).
  // chart는 항상 불변 새 객체로 교체되므로 참조 저장으로 충분(clone 불필요).
  // 로드가 invalid 차트도 수용하므로 "로드=valid"를 가정하지 않는다 — 씨앗도 검증 통과가 조건.
  lastValidSnapshot: HistorySnapshot | null;

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
  setExtraLaneCount: (count: number) => void;
  undo: () => void;
  redo: () => void;
  /**
   * 막다른 상태 탈출(RFD 0017 §7) — lastValidSnapshot으로 O(1) 점프.
   * 현재(위반) 상태를 병합창(600ms) 무시하고 historyPast에 강제 push하므로
   * 이 복귀 자체를 undo(Ctrl+Z)로 취소할 수 있다. lastValidSnapshot이 null이면 no-op.
   */
  revertToLastValid: () => void;
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

function createHistorySnapshot(state: Pick<EditorState, 'chart' | 'extraLaneCount'>): HistorySnapshot {
  return {
    chart: cloneJson(state.chart),
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
  extraLaneCount: 2,
  historyPast: [],
  historyFuture: [],
  historyLastCaptureAt: 0,
  lastValidSnapshot: null,
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
    // 막다른 탈출 씨앗(RFD 0017 §7): 커밋될 차트가 **전체 검증**(semantic 포함)까지
    // 통과하면 lastValidSnapshot을 갱신한다. validateChart는 배열 참조 memo라 저렴.
    const fullyValid = validateChart({
      notes: chart.notes,
      trillZones: chart.trillZones,
      events: chart.events,
    }).length === 0;
    set((state) => {
      // 선택 보정 — "선택 인덱스는 차트 범위 안"이라는 관계 불변은
      // 차트 변이와 같은 트랜잭션에서 지킨다(순서 의존 제거).
      // 엔티티가 삭제된 커밋(노트·구간 개수 감소)은 인덱스가 밀려 기존 선택이 다른
      // 엔티티를 가리키게 되므로 선택을 원자적으로 비운다 — 삭제·잘라내기·붙여넣기
      // 취소가 §3-5 해제 게이트를 지나지 않는 "차트와 함께 바뀌는 전이"가 되는 지점.
      const entityRemoved =
        chart.notes.length < state.chart.notes.length ||
        chart.trillZones.length < state.chart.trillZones.length;
      const normalized = entityRemoved
        ? emptySelection()
        : normalizeSelection(state.selection, chart);
      return {
        ...captureHistory(state),
        chart,
        selection: selectionEquals(normalized, state.selection) ? state.selection : normalized,
        // 전체 valid일 때만 갱신 — 위반 커밋이면 이전 valid 스냅샷 유지(탈출 목적지 보존)
        ...(fullyValid ? { lastValidSnapshot: { chart, extraLaneCount: state.extraLaneCount } } : {}),
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
    // 다른 차트를 여는 것이므로 기존 선택은 무의미 — 전체 clear.
    // 로드 차트가 전체 valid면 막다른 탈출 씨앗(lastValidSnapshot)으로 삼는다(RFD 0017 §7).
    // invalid 로드는 씨앗이 아니다 — 이전 값(null 포함)을 그대로 유지.
    set((state) => ({
      chart,
      selection: emptySelection(),
      ...(errors.length === 0
        ? { lastValidSnapshot: { chart, extraLaneCount: state.extraLaneCount } }
        : {}),
    }));
  },
  setMode: (mode) => set({ mode }),
  setEntityType: (entityType) => set({ entityType }),
  setGraceMode: (graceMode) => set({ graceMode }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setExtraLaneCount: (extraLaneCount) => set((state) => ({ ...captureHistory(state), extraLaneCount })),
  undo: () => set((state) => {
    const previous = state.historyPast.at(-1);
    if (!previous) return {};
    const current = createHistorySnapshot(state);
    return {
      chart: previous.chart,
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
      extraLaneCount: next.extraLaneCount,
      selection: emptySelection(),
      historyPast: [...state.historyPast, current].slice(-HISTORY_LIMIT),
      historyFuture: state.historyFuture.slice(1),
      historyLastCaptureAt: 0,
    };
  }),
  // 막다른 상태 탈출(RFD 0017 §7) — undo와 동형의 스냅샷 1회 교체(O(1) 점프).
  // 차이: 목적지가 past 꼭대기가 아니라 lastValidSnapshot이고, 현재(위반) 상태를
  // 병합창(600ms) 무시하고 past에 **강제 push**한다 — 이 복귀 자체가 undo로 취소 가능해야
  // 하는 안전망이므로 captureHistory(병합)를 쓰지 않는다.
  revertToLastValid: () => set((state) => {
    const target = state.lastValidSnapshot;
    if (!target) return {};
    const current = createHistorySnapshot(state);
    return {
      chart: target.chart,
      extraLaneCount: target.extraLaneCount,
      // 복원된 차트에 대해 기존 선택은 무의미 — 전체 clear(undo/redo와 동일)
      selection: emptySelection(),
      historyPast: [...state.historyPast, current].slice(-HISTORY_LIMIT),
      historyFuture: [],
      historyLastCaptureAt: 0,
    };
  }),
  resetHistory: () => set({ historyPast: [], historyFuture: [], historyLastCaptureAt: 0 }),
  addToast: (message, type = 'warn') => showToast(message, type),
  setEditingMarker: (marker) => set({ editingMarker: marker }),
}));
