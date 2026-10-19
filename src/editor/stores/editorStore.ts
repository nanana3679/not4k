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
  type Selection,
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

/**
 * 진행 중 select 드래그(이동·박스 선택·끝점 리사이즈)를 store 액션이 끝낼 때 쓰는 `selectDragControl`.
 * 드래그 상태는 SelectMode가 소유하므로 캔버스 훅이 SelectMode·렌더러 프리뷰·터치 후보 정리를 묶어
 * 등록한다(`createSelectDragControl`).
 */
export interface SelectDragControl {
  /** 드래그 직전 상태로 되돌리고 커밋 없이 끝낸다. 끝낸 드래그가 있었으면 true. */
  cancelDrag: () => boolean;
  /** 차트·선택에 쓰지 않고 드래그 상태만 버린다 — 차트를 통째로 바꾸기 직전 전용. */
  discardDrag: () => void;
  /**
   * 삭제·잘라내기 직전에 드래그를 끝낸다 — 박스는 강조된 선택을 확정하고, 이동·리사이즈는 드래그 직전
   * 상태로 되돌린다. 박스 확정이 §3-5 게이트에 거부되면 false(지우지 않는다).
   */
  endDragBeforeDelete: () => boolean;
  /** 붙여넣기 대기 중인지 — 대기 중에는 undo/redo가 차트를 바꾸지 않는다. */
  hasPendingPaste: () => boolean;
}

/**
 * select 드래그가 첫 프레임을 차트에 쓰기 직전의 차트와 history. 프레임마다 setChart가 history를
 * 쌓고(600ms 병합창) redo 스택을 비우며 lastValidSnapshot을 옮기므로, 드래그를 취소하면 이 값으로
 * 한 번에 되돌린다. 드롭하면 프레임의 history를 그대로 두고 버린다.
 */
type DragCheckpoint = {
  chart: Chart;
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];
  historyLastCaptureAt: number;
  lastValidSnapshot: HistorySnapshot | null;
};

const HISTORY_LIMIT = 100;
const HISTORY_COALESCE_MS = 600;

// 뷰포트 상태(zoom·snapDivision·scrollY·horizontalPanX)는 ViewportSlice가 단독 소유한다.
// 선택 상태(selection: notes·zones·restZones)는 SelectionSlice가 단독 소유한다(RFD 0016·0019).
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

  // 캔버스 훅이 등록하는 selectDragControl(없으면 null). 모드 전환·undo/redo·차트 교체 액션이
  // selectDragControl로 드래그를 먼저 끝낸다 — 드래그가 열린 채 다른 모드·다른 차트로 넘어가면
  // 이후 포인터 이동이 옛 원본 인덱스로 차트를 옮긴다.
  selectDragControl: SelectDragControl | null;

  // 진행 중 select 드래그의 첫 프레임 직전 상태(없으면 null) — 취소가 이리로 되돌린다.
  dragCheckpoint: DragCheckpoint | null;

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
  /**
   * history 한 단계를 되돌린다. 진행 중 select 드래그가 있으면 그 드래그만 취소하고 되돌리지 않는다
   * (아직 드롭하지 않은 드래그를 두고 이전 편집을 되돌리지 않는다). 붙여넣기 대기 중이면 아무것도 하지
   * 않는다(Enter 확정·Esc 취소가 먼저다). 되돌렸으면 true.
   */
  undo: () => boolean;
  /**
   * history 한 단계를 다시 적용한다. 드래그 중이면 undo와 같이 드래그만 취소하고, 붙여넣기 대기 중이면
   * 아무것도 하지 않는다. 다시 적용했으면 true.
   */
  redo: () => boolean;
  /**
   * 막다른 상태 탈출(RFD 0017 §7) — lastValidSnapshot으로 O(1) 점프.
   * 현재(위반) 상태를 병합창(600ms) 무시하고 historyPast에 강제 push하므로
   * 이 복귀 자체를 undo(Ctrl+Z)로 취소할 수 있다. lastValidSnapshot이 null이면 no-op.
   */
  revertToLastValid: () => void;
  resetHistory: () => void;
  addToast: (message: string, type?: ToastType) => void;
  setEditingMarker: (marker: EditingMarker) => void;
  setSelectDragControl: (control: SelectDragControl | null) => void;
  /** 진행 중 select 드래그를 드래그 직전 상태로 되돌리며 끝낸다(Esc 등). 끝낸 드래그가 있었으면 true. */
  cancelSelectDrag: () => boolean;
  /**
   * 삭제·잘라내기(Delete·Backspace·Ctrl+X·툴바 삭제) 직전에 진행 중 select 드래그를 끝낸다 — 박스는 강조된
   * 선택을 확정하고 이동·리사이즈는 드래그 직전 상태로 되돌린다. 지워도 되면 true, 박스 확정이 거부되면 false.
   */
  endSelectDragBeforeDelete: () => boolean;
  /** select 드래그가 첫 프레임을 쓰기 직전에 SelectMode가 부른다 — 지금 차트·history를 dragCheckpoint로 잡는다. */
  captureDragCheckpoint: () => void;
  /**
   * dragCheckpoint의 차트·history·lastValidSnapshot을 captureHistory 없이 set 한 번으로 되돌리고
   * 그 차트를 돌려준다. dragCheckpoint가 없으면 null.
   */
  restoreDragCheckpoint: () => Chart | null;
  /** 드롭·폐기로 끝난 드래그의 dragCheckpoint를 버린다(프레임의 history는 그대로 남는다). */
  discardDragCheckpoint: () => void;
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

/**
 * 차트를 바꿀 때 함께 커밋할 선택 — "선택 인덱스는 차트 범위 안"이라는 관계 불변을 차트 변이와
 * 같은 트랜잭션에서 지킨다(순서 의존 제거). 엔티티가 줄면(노트·구간 개수 감소) 인덱스가 밀려 기존
 * 선택이 다른 엔티티를 가리키게 되므로 비우고, 아니면 재정규화한다. 그대로면 기존 참조를 돌려준다.
 */
function selectionForChart(state: Pick<EditorState, 'chart' | 'selection'>, chart: Chart): Selection {
  const entityRemoved =
    chart.notes.length < state.chart.notes.length ||
    chart.trillZones.length < state.chart.trillZones.length ||
    (chart.restZones?.length ?? 0) < (state.chart.restZones?.length ?? 0);
  const normalized = entityRemoved
    ? emptySelection()
    : normalizeSelection(state.selection, chart);
  return selectionEquals(normalized, state.selection) ? state.selection : normalized;
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
  selectDragControl: null,
  dragCheckpoint: null,

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
    const fullyValid = validateChart({
      notes: chart.notes,
      trillZones: chart.trillZones,
      restZones: chart.restZones,
      events: chart.events,
    }).length === 0;
    set((state) => {
      // 선택 보정(selectionForChart) — 엔티티가 삭제된 커밋은 선택을 원자적으로 비운다.
      // 삭제·잘라내기·붙여넣기 취소가 §3-5 해제 게이트를 지나지 않는 "차트와 함께 바뀌는 전이"가
      // 되는 지점.
      return {
        ...captureHistory(state),
        chart,
        selection: selectionForChart(state, chart),
        // 전체 valid일 때만 갱신 — 위반 커밋이면 이전 valid 스냅샷 유지(탈출 목적지 보존)
        ...(fullyValid ? { lastValidSnapshot: { chart, extraLaneCount: state.extraLaneCount } } : {}),
      };
    });
  },
  loadChart: (chart) => {
    // 진행 중 select 드래그는 원위치를 쓰지 않고 버린다 — 곧 통째로 바뀔 차트라 되돌려 쓸 이유가 없다.
    get().selectDragControl?.discardDrag();
    const errors = validateChart({
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
  setMode: (mode) => {
    // 다른 모드로 바꾸면 진행 중 select 드래그를 먼저 원위치로 되돌린다 — 안 그러면 up이 새 모드로 가서
    // 드래그가 열린 채 남고, select로 돌아온 뒤 버튼 없이 움직여도 드래그가 이어진다.
    if (mode !== get().mode) get().cancelSelectDrag();
    set({ mode });
  },
  setEntityType: (entityType) => set({ entityType }),
  setGraceMode: (graceMode) => set({ graceMode }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setExtraLaneCount: (extraLaneCount) => set((state) => {
    // 막다른 탈출 씨앗 재페어링(RFD 0017 §7): 씨앗은 "chart 커밋 순간의 extraLaneCount"를
    // 캡처하지만, chart 커밋과 별개로 extraLaneCount만 바뀌는 복합 연산(loadChart→setExtraLaneCount,
    // paste 확장/취소)에서 (chart, extraLaneCount) 페어가 어긋나면 revert 시 보조 노트가 숨는다.
    // 현재 chart가 전체 valid면 같은 chart에 새 count로 씨앗을 다시 묶는다(validateChart는 참조 memo라 hit면 공짜).
    const fullyValid = validateChart({
      notes: state.chart.notes,
      trillZones: state.chart.trillZones,
      restZones: state.chart.restZones,
      events: state.chart.events,
    }).length === 0;
    return {
      ...captureHistory(state),
      extraLaneCount,
      ...(fullyValid ? { lastValidSnapshot: { chart: state.chart, extraLaneCount } } : {}),
    };
  }),
  undo: () => {
    // 드래그 중이면 드래그만 취소하고 이 입력으로는 되돌리지 않는다.
    if (get().cancelSelectDrag()) return false;
    // 붙여넣기 대기 중에도 되돌리지 않는다 — 차트를 바꾸면 붙여넣은 인덱스·붙여넣기 직전 스냅샷이 새 차트와
    // 어긋나 방향키 이동이 throw하고 Esc가 옛 차트를 되살린다. Enter로 확정하거나 Esc로 취소한 뒤 되돌린다.
    if (get().selectDragControl?.hasPendingPaste()) return false;
    if (get().historyPast.length === 0) return false;
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
    return true;
  },
  redo: () => {
    if (get().cancelSelectDrag()) return false;
    if (get().selectDragControl?.hasPendingPaste()) return false;
    if (get().historyFuture.length === 0) return false;
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
    return true;
  },
  // 막다른 상태 탈출(RFD 0017 §7) — undo와 동형의 스냅샷 1회 교체(O(1) 점프).
  // 차이: 목적지가 past 꼭대기가 아니라 lastValidSnapshot이고, 현재(위반) 상태를
  // 병합창(600ms) 무시하고 past에 **강제 push**한다 — 이 복귀 자체가 undo로 취소 가능해야
  // 하는 안전망이므로 captureHistory(병합)를 쓰지 않는다.
  revertToLastValid: () => {
    // 진행 중 select 드래그는 먼저 원위치로 되돌린다 — 복귀 직전 상태(undo 목적지)가 드래그 중간
    // 위치가 아니라 드래그 전 위치가 된다.
    get().cancelSelectDrag();
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
  resetHistory: () => set({ historyPast: [], historyFuture: [], historyLastCaptureAt: 0 }),
  addToast: (message, type = 'warn') => showToast(message, type),
  setEditingMarker: (marker) => set({ editingMarker: marker }),
  setSelectDragControl: (selectDragControl) => set({ selectDragControl }),
  cancelSelectDrag: () => get().selectDragControl?.cancelDrag() ?? false,
  endSelectDragBeforeDelete: () => get().selectDragControl?.endDragBeforeDelete() ?? true,
  captureDragCheckpoint: () => set((state) => ({
    dragCheckpoint: {
      chart: state.chart,
      historyPast: state.historyPast,
      historyFuture: state.historyFuture,
      historyLastCaptureAt: state.historyLastCaptureAt,
      lastValidSnapshot: state.lastValidSnapshot,
    },
  })),
  restoreDragCheckpoint: () => {
    const checkpoint = get().dragCheckpoint;
    if (!checkpoint) return null;
    // captureHistory를 거치지 않는다 — 프레임이 쌓은 history·비운 redo 스택·옮긴 lastValidSnapshot을
    // 드래그 직전 값으로 되돌려야 취소한 드래그가 undo에 남지 않는다.
    set((state) => ({
      chart: checkpoint.chart,
      selection: selectionForChart(state, checkpoint.chart),
      historyPast: checkpoint.historyPast,
      historyFuture: checkpoint.historyFuture,
      historyLastCaptureAt: checkpoint.historyLastCaptureAt,
      lastValidSnapshot: checkpoint.lastValidSnapshot,
      dragCheckpoint: null,
    }));
    return checkpoint.chart;
  },
  discardDragCheckpoint: () => {
    if (get().dragCheckpoint !== null) set({ dragCheckpoint: null });
  },
}));
