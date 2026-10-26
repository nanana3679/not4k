import { editorChartErrors } from '../documentValidation';
/**
 * Editor Store — Zustand state management for not4k chart editor
 */

import { create } from 'zustand';
import type { ChartDocument } from '../../shared';
import {beat,  validateChartDocumentStructural} from '../../shared';
import { showToast, type ToastType } from '../../shared/toast';
import type { EntityType } from '../modes';
import { createViewportSlice, type ViewportSlice } from './viewportSlice';
import {
  createSelectionSlice,
  emptySelection,
  normalizeSelection,
  selectionEquals,
  type SelectionSlice,
  type Selection,
} from './selectionSlice';

export type EditorModeName = 'create' | 'select' | 'delete';
type EditorPage = 'songList' | 'chartEditor';
type EditTransaction = {
  token: symbol;
  kind: "erase" | "selection";
  before: HistorySnapshot;
  selection: Selection;
  lastValidSnapshot: HistorySnapshot | null;
};

type HistorySnapshot = {
  chart: ChartDocument;
  extraLaneCount: number;
};

export type EditingMarker =
  | { type: 'event'; index: number }
  | null;

const HISTORY_LIMIT = 100;
const HISTORY_COALESCE_MS = 600;

// 뷰포트 상태(zoom·snapDivision·scrollY·horizontalPanX)는 ViewportSlice가 단독 소유한다.
// 선택 상태(selection: notes·zones·restZones)는 SelectionSlice가 단독 소유한다(RFD 0016·0019).
interface EditorState extends ViewportSlice, SelectionSlice {
  // Page navigation
  activePage: EditorPage;
  activeSongId: string | null;
  pendingAudioUrl: string | null;

  // ChartDocument data
  chart: ChartDocument;

  // Editor mode
  mode: EditorModeName;
  entityType: EntityType;
  graceMode: boolean; // Create 배치 시 Point·Release에만 Grace 적용

  // Playback
  isPlaying: boolean;
  currentTimeMs: number;

  // Extra lanes — 보조 노트는 chart.notes(lane 5+)로 이주(RFD 0018 ③), extraLaneCount만 순수 설정으로 유지(§8-3)
  extraLaneCount: number;

  // Undo/redo history
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];
  historyLastCaptureAt: number;
  editTransaction: EditTransaction | null;

  // 막다른 상태 탈출(RFD 0017 §7) — 마지막으로 차트 전체가 valid였던 스냅샷.
  // setChart·loadChart 커밋 직후 editorChartErrors 전체 통과 시에만 갱신(위반이면 이전 값 유지).
  // chart는 항상 불변 새 객체로 교체되므로 참조 저장으로 충분(clone 불필요).
  // 로드가 invalid 차트도 수용하므로 "로드=valid"를 가정하지 않는다 — 씨앗도 검증 통과가 조건.
  lastValidSnapshot: HistorySnapshot | null;

  // Marker editing
  editingMarker: EditingMarker;

  // Actions
  setActivePage: (page: EditorPage) => void;
  setActiveSongId: (songId: string | null) => void;
  setPendingAudioUrl: (url: string | null) => void;
  setChart: (chart: ChartDocument, options?: { separateHistory?: boolean; transaction?: symbol }) => void;
  /**
   * 로드 전용 통로 — 위반 차트도 수용해 열람·수리를 허용한다(경고만 표시).
   * 재저장은 저장 게이트(useFileOperations의 editorChartErrors)가 차단하므로
   * 위반 상태가 저장·전파되지는 않는다. 로드 외의 경로에서 쓰지 말 것.
   */
  loadChart: (chart: ChartDocument) => void;
  setMode: (mode: EditorModeName) => void;
  setEntityType: (entityType: EntityType) => void;
  setGraceMode: (graceMode: boolean) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  setExtraLaneCount: (count: number, transaction?: symbol) => void;
  undo: () => void;
  redo: () => void;
  /**
   * 막다른 상태 탈출(RFD 0017 §7) — lastValidSnapshot으로 O(1) 점프.
   * 현재(위반) 상태를 병합창(600ms) 무시하고 historyPast에 강제 push하므로
   * 이 복귀 자체를 undo(Ctrl+Z)로 취소할 수 있다. lastValidSnapshot이 null이면 no-op.
   */
  revertToLastValid: () => void;
  resetHistory: () => void;
  beginEditTransaction: (kind?: "erase" | "selection") => symbol | null;
  commitEditTransaction: (transaction?: symbol) => void;
  cancelEditTransaction: (transaction?: symbol) => void;
  addToast: (message: string, type?: ToastType) => void;
  setEditingMarker: (marker: EditingMarker) => void;
}

const createDefaultChart = (): ChartDocument => ({
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

function captureHistory(state: EditorState, separateHistory = false, transaction?: symbol): Partial<EditorState> {
  if (transaction && state.editTransaction?.token === transaction) return {};
  const now = Date.now();
  if (!separateHistory && state.historyPast.length > 0 && now - state.historyLastCaptureAt < HISTORY_COALESCE_MS) {
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
  editTransaction: null,
  lastValidSnapshot: null,
  editingMarker: null,

  // Actions
  setActivePage: (activePage) => set({ activePage }),
  setActiveSongId: (activeSongId) => set({ activeSongId }),
  setPendingAudioUrl: (pendingAudioUrl) => set({ pendingAudioUrl }),
  setChart: (chart, options) => {
    if (options?.transaction && get().editTransaction?.token !== options.transaction) return;
    if (!options?.transaction) get().commitEditTransaction();
    // 차트 변이 게이트 — 낙관적 편집(RFD 0017). 여기서는 **구조 위반만** 하드 거부한다:
    // malformed 데이터(구간 역전)·크래시 유발(분자 0 박자표)은 편집 중에도 절대 불가.
    // 의미 위반(겹침·중복·트릴 헤드 등)은 transient로 **허용해 커밋**한다 — "일단 옮기고
    // 나중에 고치기"를 위해. 의미 제약은 저장·플레이/프리뷰 진입 게이트가 강제한다.
    // 거부 시 차트·히스토리 무변. 커밋 시 의미 위반 상태도 히스토리에 남아 undo로 복귀 가능.
    const errors = validateChartDocumentStructural({
      notes: chart.notes,
      trillZones: chart.trillZones,
      restZones: chart.restZones,
      events: chart.events,
    });
    if (errors.length > 0) {
      console.error('차트 변이 거부 (구조 위반):', errors);
      showToast(`구조 위반으로 변경이 취소되었습니다: ${errors[0].message}`, 'warn');
      return;
    }
    // 막다른 탈출 씨앗(RFD 0017 §7): 커밋될 차트가 **전체 검증**(semantic 포함)까지
    // 통과하면 lastValidSnapshot을 갱신한다. validateChart는 배열 참조 memo라 저렴.
    const fullyValid = editorChartErrors({
      notes: chart.notes,
      trillZones: chart.trillZones,
      restZones: chart.restZones,
      events: chart.events,
    }).length === 0;
    set((state) => {
      // 삭제 후에도 남은 선택은 같은 엔티티를 가리킨다. 다른 바디 선택을 지우지 않는다.
      const remap = <T>(indices: ReadonlySet<number>, before: readonly T[], after: readonly T[]) => {
        if (after.length >= before.length) return new Set(indices);
        const indexByEntity = new Map(after.map((entity, index) => [entity, index]));
        return new Set([...indices].flatMap(index => {
          const next = indexByEntity.get(before[index]);
          return next === undefined ? [] : [next];
        }));
      };
      const normalized = normalizeSelection({
        notes: remap(state.selection.notes, state.chart.notes, chart.notes),
        zones: remap(state.selection.zones, state.chart.trillZones, chart.trillZones),
        restZones: remap(state.selection.restZones, state.chart.restZones ?? [], chart.restZones ?? []),
      }, chart);
      return {
        ...captureHistory(state, options?.separateHistory, options?.transaction),
        chart,
        selection: selectionEquals(normalized, state.selection) ? state.selection : normalized,
        // 전체 valid일 때만 갱신 — 위반 커밋이면 이전 valid 스냅샷 유지(탈출 목적지 보존)
        ...(fullyValid ? { lastValidSnapshot: { chart, extraLaneCount: state.extraLaneCount } } : {}),
      };
    });
  },
  loadChart: (chart) => {
    get().commitEditTransaction();
    const errors = editorChartErrors({
      notes: chart.notes,
      trillZones: chart.trillZones,
      restZones: chart.restZones,
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
  setMode: (mode) => { get().commitEditTransaction(); set({ mode }); },
  setEntityType: (entityType) => { get().commitEditTransaction(); set({ entityType }); },
  setGraceMode: (graceMode) => set({ graceMode }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setExtraLaneCount: (extraLaneCount, transaction) => {
    if (transaction && get().editTransaction?.token !== transaction) return;
    if (!transaction) get().commitEditTransaction();
    set((state) => {
      // 막다른 탈출 씨앗 재페어링(RFD 0017 §7): 씨앗은 "chart 커밋 순간의 extraLaneCount"를
      // 캡처하지만, chart 커밋과 별개로 extraLaneCount만 바뀌는 복합 연산(loadChart→setExtraLaneCount,
      // paste 확장/취소)에서 (chart, extraLaneCount) 페어가 어긋나면 revert 시 보조 노트가 숨는다.
      // 현재 chart가 전체 valid면 같은 chart에 새 count로 씨앗을 다시 묶는다(validateChart는 참조 memo라 hit면 공짜).
      const fullyValid = editorChartErrors({
        notes: state.chart.notes,
        trillZones: state.chart.trillZones,
        restZones: state.chart.restZones,
        events: state.chart.events,
      }).length === 0;
      return {
        ...captureHistory(state, false, transaction),
        extraLaneCount,
        ...(fullyValid ? { lastValidSnapshot: { chart: state.chart, extraLaneCount } } : {}),
      };
    });
  },
  undo: () => {
    get().commitEditTransaction();
    set((state) => {
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
    });
  },
  redo: () => {
    get().commitEditTransaction();
    set((state) => {
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
    });
  },
  // 막다른 상태 탈출(RFD 0017 §7) — undo와 동형의 스냅샷 1회 교체(O(1) 점프).
  // 차이: 목적지가 past 꼭대기가 아니라 lastValidSnapshot이고, 현재(위반) 상태를
  // 병합창(600ms) 무시하고 past에 **강제 push**한다 — 이 복귀 자체가 undo로 취소 가능해야
  // 하는 안전망이므로 captureHistory(병합)를 쓰지 않는다.
  revertToLastValid: () => {
    get().commitEditTransaction();
    set((state) => {
      const target = state.lastValidSnapshot;
      // 이미 그 스냅샷 위에 있으면(동일 참조) no-op — 무의미한 history entry 방지.
      // UI로는 도달 불가(버튼은 위반 팝오버에만)나 프로그래매틱 이중 호출 방어.
      if (!target || state.chart === target.chart) return {};
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
    });
  },
  // lastValidSnapshot은 의도적으로 유지한다 — 씨앗은 loadChart가 검증 통과 시 세팅하고
  // resetHistory는 그 직후 호출되므로 여기서 밀면 씨앗이 날아간다. 현재 곡 전환은 전체 페이지
  // 내비게이션이라 크로스-곡 잔존 경로가 없다. SPA 내 곡 전환을 도입하면 이 계약을 재검토할 것.
  resetHistory: () => set({ historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null }),
  beginEditTransaction: (kind = "selection") => {
    const state = get();
    if (state.editTransaction) return null;
    const token = Symbol("editor transaction");
    set({ editTransaction: {
      token, kind, before: { chart: state.chart, extraLaneCount: state.extraLaneCount },
      selection: state.selection, lastValidSnapshot: state.lastValidSnapshot,
    } });
    return token;
  },
  commitEditTransaction: token => set(state => {
    const transaction = state.editTransaction;
    if (!transaction || (token && transaction.token !== token)) return {};
    const changed = transaction.before.extraLaneCount !== state.extraLaneCount
      || JSON.stringify(transaction.before.chart) !== JSON.stringify(state.chart);
    return {
      editTransaction: null,
      ...(changed ? {
        historyPast: [...state.historyPast, transaction.before].slice(-HISTORY_LIMIT),
        historyFuture: [],
        // 독립 command 뒤의 일반 편집도 이 gesture에 합쳐지지 않는다.
        historyLastCaptureAt: 0,
      } : {}),
    };
  }),
  cancelEditTransaction: token => set(state => {
    const transaction = state.editTransaction;
    if (!transaction || (token && transaction.token !== token)) return {};
    return { ...transaction.before, selection: transaction.selection,
      lastValidSnapshot: transaction.lastValidSnapshot, editTransaction: null };
  }),
  addToast: (message, type = 'warn') => showToast(message, type),
  setEditingMarker: (marker) => set({ editingMarker: marker }),
}));
