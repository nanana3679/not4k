/**
 * Editor Store — Zustand state management for not4k chart editor
 */

import { create } from 'zustand';
import type { ChartDocument, LegacyConversionItem, LegacyConversionReport } from '../../shared';
import { beat, convertLegacyChart, validateChartDocumentStructural } from '../../shared';
import { showToast, type ToastType } from '../../shared/toast';
import type { EntityType } from '../modes';
import { editorChartErrors } from '../documentValidation';
import { isPlaybackLockedChange } from '../editing/playbackEditLock';
import type { EditorSong } from '../songState';
import type { SavedChartJson } from '../savedChart';
import type { CursorBeatKeeperState } from '../playback/cursorBeatKeeper';
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
/** 편집 transaction의 소유 조작. erase = 우클릭·Delete 모드 삭제 gesture, selectModeEdit = Select 모드의 이동·리사이즈·붙여넣기. */
type EditTransactionKind = "erase" | "selectModeEdit";
type EditTransaction = {
  token: symbol;
  kind: EditTransactionKind;
  before: HistorySnapshot;
  /** transaction을 연 순간의 선택. 소유자의 취소(pointercancel·두 손가락 탐색 등)는 이 선택으로 되돌린다. */
  selection: Selection;
  /** 이 gesture를 시작한 누름이 선택을 바꾸기 전의 선택. 재생 시작 취소만 이 선택으로 되돌린다(RFD 0099). */
  selectionBeforePress: Selection;
  lastValidSnapshot: HistorySnapshot | null;
  /** 소유자 token 없이 다른 명령이 이 transaction을 끝냈을 때 소유자에게 알린다. */
  onInterrupt?: () => void;
};

type HistorySnapshot = {
  chart: ChartDocument;
  extraLaneCount: number;
};

export type EditingEvent =
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
  graceMode: boolean; // Create 배치 시 탭·Release에만 Grace 적용

  // Playback
  isPlaying: boolean;
  currentTimeMs: number;
  /** seek·재생 tick마다 증가한다. 같은 시각을 다시 알려도 커서 박 유지의 기준을 갱신한다. */
  cursorMoveCount: number;
  /** 페이지 재마운트에도 타이밍과 커서의 원래 박을 유지한다. loadChart에서만 초기화한다. */
  cursorBeatKeeperState: CursorBeatKeeperState | null;

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

  // 마지막으로 불러오거나 저장한 차트를 Save가 쓰는 방식(메인·보조 JSON)으로 직렬화한 값(src/editor/savedChart.ts).
  // dirty 표시·나가기 확인이 이것과 현재 차트를 비교한다. 차트를 새로 불러올 때와 저장(Save·Save As) 성공 때만 정한다.
  // 편집·Undo·테스트 플레이는 바꾸지 않는다. 페이지 컴포넌트가 아니라 store가 소유해, 테스트 플레이에서 돌아와 페이지가 다시 마운트돼도 유지된다.
  savedChartJson: SavedChartJson | null;
  song: EditorSong | null;
  isSavingSong: boolean;
  setSong: (song: EditorSong | null) => void;

  // 저장(Save·Save As)이 진행 중인가. 페이지 지역 상태가 아니라 store가 소유해, 페이지가 다시 마운트돼도
  // 진행 중인 저장을 잊지 않는다. 진행 중에는 두 번째 저장과 테스트 플레이를 시작하지 않는다.
  isSavingChart: boolean;
  // 저장을 시작할 때와 차트를 새로 불러올 때 1씩 오른다. 저장은 시작할 때 받은 값으로 끝을 알리고,
  // 그 사이 값이 바뀌었으면(차트를 새로 불러옴) 늦게 끝난 그 저장은 savedChartJson·isSavingChart를 바꾸지 않는다.
  chartSaveGeneration: number;
  // loadChart로 차트를 새로 열 때만 1씩 오른다. 편집·Undo·Redo·저장은 바꾸지 않는다.
  // 차트 교체를 보는 쪽이 새로 불러온 차트를 편집과 구별할 때 쓴다(타이밍 값 수정 뒤 커서 박 유지, RFD 0099).
  // 지금은 loadChart가 에디터 페이지(ChartEditorPage)가 마운트되기 전에만 불리고, 다른 차트로 바꾸면 페이지를
  // 다시 마운트하므로 이 값이 페이지 안에서 바뀌는 일은 없다. 페이지 안에서 차트를 바꾸는 기능이 생길 때를 위한 가드다.
  chartLoadGeneration: number;

  // Event editing
  editingEvent: EditingEvent;

  // 구형 차트 변환 검토(RFD 0037 §8-1) — 이번 세션에 승인한 변환의 보고 항목과 목록 열림.
  // 테스트 플레이에서 돌아와도 남고, loadChart로 차트를 새로 열면 비운다. 변환하지 않았으면 null.
  legacyConversionReview: readonly LegacyConversionItem[] | null;
  legacyConversionReviewOpen: boolean;

  // Actions
  setActivePage: (page: EditorPage) => void;
  setActiveSongId: (songId: string | null) => void;
  setPendingAudioUrl: (url: string | null) => void;
  setChart: (chart: ChartDocument, options?: { separateHistory?: boolean; transaction?: symbol }) => void;
  /** 업로드 결과의 미디어 경로만 반영한다. 편집·Undo 이력·열린 transaction은 만들거나 끝내지 않는다. */
  reconcileSongMedia: (media: Pick<ChartDocument['meta'], 'audioFile' | 'imageFile' | 'previewAudioFile'>) => void;
  /**
   * 로드 전용 통로 — 위반 차트도 수용해 열람·수리를 허용한다(경고만 표시).
   * 재저장은 저장 게이트(useFileOperations의 editorChartErrors)가 차단하므로
   * 위반 상태가 저장·전파되지는 않는다. 로드 외의 경로에서 쓰지 말 것.
   * 다른 차트를 여는 것이므로 이전 차트의 savedChartJson을 지운다. 불러온 쪽이 setSavedChartJson으로 불러온 차트의 값을 정한다.
   * 진행 중이던 저장은 이전 차트의 것이므로 chartSaveGeneration을 올려 그 결과가 새 차트에 닿지 않게 하고 isSavingChart를 끈다.
   * 이전 차트의 변환 검토 목록(legacyConversionReview)도 비우고 닫는다.
   * chartLoadGeneration을 1 올리고 cursorBeatKeeperState를 비워 새 차트에 이전 커서 박을 적용하지 않는다.
   */
  loadChart: (chart: ChartDocument) => void;
  /** 불러온 차트의 savedChartJson을 정한다. loadChart 직후에만 부른다. 저장 결과는 finishChartSave로 정한다. */
  setSavedChartJson: (saved: SavedChartJson) => void;
  /**
   * 저장을 시작한다. 이미 저장 중이면 null을 돌려주고 아무것도 바꾸지 않는다(저장을 겹쳐 시작하지 않는다).
   * 시작하면 isSavingChart를 켜고 이 저장의 세대 번호(chartSaveGeneration)를 돌려준다.
   */
  beginChartSave: () => number | null;
  /**
   * beginChartSave가 준 세대 번호로 저장을 끝낸다. 성공이면 업로드한 메인·보조 JSON을, 실패면 null을 넘긴다.
   * 세대 번호가 지금 값과 같을 때만 isSavingChart를 끄고, 성공이면 savedChartJson을 넘긴 JSON으로 바꾼다.
   * 다르면(그 사이 차트를 새로 불러옴) 늦게 끝난 저장이므로 아무것도 바꾸지 않는다.
   */
  finishChartSave: (generation: number, saved: SavedChartJson | null) => void;
  setMode: (mode: EditorModeName) => void;
  setEntityType: (entityType: EntityType) => void;
  setGraceMode: (graceMode: boolean) => void;
  /**
   * 재생 상태 미러(PlaybackController.onPlayStateChange). 재생을 시작하면 cancelEditTransactionForPlaybackStart를
   * 한 번 더 부른다. 재생기는 시작 직전에 이미 취소하므로 보통은 취소할 transaction이 없다.
   */
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  setExtraLaneCount: (count: number, transaction?: symbol) => void;
  /** 재생 중이면 no-op(RFD 0099). */
  undo: () => void;
  /** 재생 중이면 no-op(RFD 0099). */
  redo: () => void;
  /**
   * 막다른 상태 탈출(RFD 0017 §7) — lastValidSnapshot으로 O(1) 점프.
   * 현재(위반) 상태를 병합창(600ms) 무시하고 historyPast에 강제 push하므로
   * 이 복귀 자체를 undo(Ctrl+Z)로 취소할 수 있다. lastValidSnapshot이 null이거나 재생 중이면 no-op.
   */
  revertToLastValid: () => void;
  resetHistory: () => void;
  /**
   * 한 gesture의 편집을 Undo 1개로 묶는다. 소유자 token 없는 편집·모드 전환·Undo 등
   * 독립 명령이 transaction을 먼저 확정하거나 재생 시작이 취소하면 onInterrupt로 소유자에게 알린다.
   * 소유자는 그 뒤 옛 token으로 쓰지 말고 진행 중 조작을 정리해야 한다.
   * 누름이 선택을 먼저 바꿨다면 selectionBefore를 넘긴다. 재생 시작 취소만 그 선택 변경까지 되돌린다.
   */
  beginEditTransaction: (kind: EditTransactionKind, onInterrupt?: () => void, selectionBefore?: Selection) => symbol | null;
  commitEditTransaction: (transaction?: symbol) => void;
  /** 차트·보조 레인 수를 gesture 시작 전으로, 선택을 transaction을 연 순간으로 되돌리고 history를 남기지 않는다. */
  cancelEditTransaction: (transaction?: symbol) => void;
  /**
   * 재생 시작이 열린 편집 transaction(이동·리사이즈 드래그·붙여넣기 대기·우클릭 삭제)을 Esc처럼 취소한다(RFD 0099).
   * 차트·보조 레인 수는 gesture 시작 전으로, 선택은 그 gesture를 시작한 누름 전으로 되돌리고 history를 남기지 않으며
   * onInterrupt로 소유자에게 알린다. 재생기는 정지 상태에서 시작 위치를 읽기 전에 부른다(createEditorPlayback).
   */
  cancelEditTransactionForPlaybackStart: () => void;
  addToast: (message: string, type?: ToastType) => void;
  setEditingEvent: (event: EditingEvent) => void;
  /**
   * 사용자가 모달에서 승인한 구형 차트 1차 기계 변환(RFD 0037 §8-1)을 지금 차트에 Undo 한 단위의 편집으로 적용하고
   * 보고 항목을 변환 검토 목록으로 남긴다(목록은 닫힌 채). 저장은 하지 않는다.
   * 구형 노트가 없거나 구조 위반으로 setChart가 거부하면 아무것도 바꾸지 않고 null을 돌려준다.
   */
  applyLegacyConversion: () => LegacyConversionReport | null;
  setLegacyConversionReviewOpen: (open: boolean) => void;
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

/** 대기 파일과 미디어 경로는 곡 세션 소유다. 차트 이력만 복원해 파일과 경로가 분리되지 않게 한다(PR6 전). */
function restoreChartSnapshot(state: EditorState, chart: ChartDocument): ChartDocument {
  if (!state.song) return chart;
  const { audioFile, imageFile, previewAudioFile } = state.chart.meta;
  if (chart.meta.audioFile === audioFile && chart.meta.imageFile === imageFile
    && chart.meta.previewAudioFile === previewAudioFile) return chart;
  return { ...chart, meta: { ...chart.meta, audioFile, imageFile, previewAudioFile } };
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

/**
 * 열린 편집 transaction이 아직 history에 넣지 않은 변경을 가졌는가. 참조만 비교하므로
 * 버튼 상태처럼 store가 바뀔 때마다 계산해도 된다.
 */
export function hasUncommittedEdit(state: Pick<EditorState, 'editTransaction' | 'chart' | 'extraLaneCount'>): boolean {
  const transaction = state.editTransaction;
  return transaction !== null
    && (transaction.before.chart !== state.chart || transaction.before.extraLaneCount !== state.extraLaneCount);
}

/**
 * Undo 가능 여부. 불러온 직후 첫 붙여넣기처럼 transaction 안에만 있는 편집도 되돌릴 수 있다.
 * 재생 중에는 Undo하지 않는다(RFD 0099).
 */
export function selectCanUndo(state: Pick<EditorState, 'historyPast' | 'editTransaction' | 'chart' | 'extraLaneCount' | 'isPlaying'>): boolean {
  return !state.isPlaying && (state.historyPast.length > 0 || hasUncommittedEdit(state));
}

/**
 * Redo 가능 여부. 변경이 있는 transaction을 확정하면 Redo 기록이 사라지므로 그동안은 불가다.
 * 재생 중에는 Redo하지 않는다(RFD 0099).
 */
export function selectCanRedo(state: Pick<EditorState, 'historyFuture' | 'editTransaction' | 'chart' | 'extraLaneCount' | 'isPlaying'>): boolean {
  return !state.isPlaying && state.historyFuture.length > 0 && !hasUncommittedEdit(state);
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
  cursorMoveCount: 0,
  cursorBeatKeeperState: null,
  extraLaneCount: 2,
  historyPast: [],
  historyFuture: [],
  historyLastCaptureAt: 0,
  editTransaction: null,
  lastValidSnapshot: null,
  savedChartJson: null,
  song: null,
  isSavingSong: false,
  isSavingChart: false,
  chartSaveGeneration: 0,
  chartLoadGeneration: 0,
  editingEvent: null,
  legacyConversionReview: null,
  legacyConversionReviewOpen: false,

  // Actions
  setActivePage: (activePage) => set({ activePage }),
  setActiveSongId: (activeSongId) => set({ activeSongId }),
  setPendingAudioUrl: (pendingAudioUrl) => set({ pendingAudioUrl }),
  setChart: (chart, options) => {
    if (options?.transaction && get().editTransaction?.token !== options.transaction) return;
    // 재생 중 편집 제한(RFD 0099)의 마지막 방어선. 입력 경로(캔버스·키보드·툴바·모달)가 먼저 막고 안내하므로
    // 여기까지 온 쓰기는 조용히 버린다. 열린 transaction도 확정하지 않아 차트·history·재생 상태가 그대로다.
    // 저장처럼 다른 meta만 바꾼 쓰기는 isPlaybackLockedChange가 통과시킨다.
    if (get().isPlaying && isPlaybackLockedChange(get().chart, chart)) {
      console.warn('재생 중 차트 편집 거부 (RFD 0099)');
      return;
    }
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
        events: remap(state.selection.events, state.chart.events, chart.events),
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
  reconcileSongMedia: (media) => set(state => {
    const chart = { ...state.chart, meta: { ...state.chart.meta, ...media } };
    // 저장 응답이 빈 gesture를 편집으로 만들거나 마지막 유효 상태의 경로를 되돌리지 않게 한다.
    const reconcileSnapshot = (snapshot: HistorySnapshot): HistorySnapshot => ({ ...snapshot,
      chart: snapshot.chart === state.chart ? chart : restoreChartSnapshot({ ...state, chart }, snapshot.chart),
    });
    const transaction = state.editTransaction;
    return { chart,
      lastValidSnapshot: state.lastValidSnapshot ? reconcileSnapshot(state.lastValidSnapshot) : null,
      editTransaction: transaction ? { ...transaction,
        before: reconcileSnapshot(transaction.before),
        lastValidSnapshot: transaction.lastValidSnapshot ? reconcileSnapshot(transaction.lastValidSnapshot) : null,
      } : null,
    };
  }),
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
    // 다른 차트를 여는 것이므로 기존 선택과 이전 차트의 변환 검토 목록은 무의미 — 전체 clear.
    // 로드 차트가 전체 valid면 막다른 탈출 씨앗(lastValidSnapshot)으로 삼는다(RFD 0017 §7).
    // invalid 로드는 씨앗이 아니다 — 이전 값(null 포함)을 그대로 유지.
    set((state) => ({
      chart,
      selection: emptySelection(),
      savedChartJson: null,
      song: null,
      isSavingSong: false,
      isSavingChart: false,
      chartSaveGeneration: state.chartSaveGeneration + 1,
      chartLoadGeneration: state.chartLoadGeneration + 1,
      // 새 차트의 0박에서 시작한다. keeper 기억을 비우므로 사용자 커서 이동으로 세지 않는다.
      currentTimeMs: chart.meta.offsetMs,
      cursorBeatKeeperState: null,
      legacyConversionReview: null,
      legacyConversionReviewOpen: false,
      ...(errors.length === 0
        ? { lastValidSnapshot: { chart, extraLaneCount: state.extraLaneCount } }
        : {}),
    }));
  },
  setSong: (song) => set({ song }),
  setSavedChartJson: (savedChartJson) => set({ savedChartJson }),
  beginChartSave: () => {
    const { isSavingChart, chartSaveGeneration } = get();
    if (isSavingChart || get().isSavingSong) return null;
    const generation = chartSaveGeneration + 1;
    set({ isSavingChart: true, chartSaveGeneration: generation });
    return generation;
  },
  finishChartSave: (generation, saved) => {
    if (get().chartSaveGeneration !== generation) return;
    set(saved === null ? { isSavingChart: false } : { isSavingChart: false, savedChartJson: saved });
  },
  setMode: (mode) => { get().commitEditTransaction(); set({ mode }); },
  setEntityType: (entityType) => { get().commitEditTransaction(); set({ entityType }); },
  setGraceMode: (graceMode) => set({ graceMode }),
  setIsPlaying: (isPlaying) => {
    // 재생기 밖에서 재생 상태를 켜도 열린 편집이 재생 중에 남지 않게 한다(RFD 0099).
    if (isPlaying) get().cancelEditTransactionForPlaybackStart();
    set({ isPlaying });
  },
  setCurrentTimeMs: (currentTimeMs) => set((state) => ({
    currentTimeMs,
    cursorMoveCount: state.cursorMoveCount + 1,
  })),
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
    if (get().isPlaying) return; // 재생 중 Undo 금지(RFD 0099)
    get().commitEditTransaction();
    set((state) => {
      const previous = state.historyPast.at(-1);
      if (!previous) return {};
      const current = createHistorySnapshot(state);
      return {
        chart: restoreChartSnapshot(state, previous.chart),
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
    if (get().isPlaying) return; // 재생 중 Redo 금지(RFD 0099)
    get().commitEditTransaction();
    set((state) => {
      const next = state.historyFuture[0];
      if (!next) return {};
      const current = createHistorySnapshot(state);
      return {
        chart: restoreChartSnapshot(state, next.chart),
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
    if (get().isPlaying) return; // 차트를 되돌리는 편집이라 재생 중에는 막는다(RFD 0099)
    get().commitEditTransaction();
    set((state) => {
      const target = state.lastValidSnapshot;
      // 이미 그 스냅샷 위에 있으면(동일 참조) no-op — 무의미한 history entry 방지.
      // UI로는 도달 불가(버튼은 위반 팝오버에만)나 프로그래매틱 이중 호출 방어.
      if (!target || state.chart === target.chart) return {};
      const current = createHistorySnapshot(state);
      return {
        chart: restoreChartSnapshot(state, target.chart),
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
  resetHistory: () => {
    const transaction = get().editTransaction;
    set({ historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null });
    transaction?.onInterrupt?.();
  },
  beginEditTransaction: (kind, onInterrupt, selectionBefore) => {
    const state = get();
    // 재생 중에는 새 편집 gesture를 열지 않는다(RFD 0099). null을 받은 삭제 gesture는 아무것도 지우지 않는다.
    if (state.editTransaction || state.isPlaying) return null;
    const token = Symbol("editor transaction");
    set({ editTransaction: {
      token, kind, before: { chart: state.chart, extraLaneCount: state.extraLaneCount },
      selection: state.selection, selectionBeforePress: selectionBefore ?? state.selection,
      lastValidSnapshot: state.lastValidSnapshot, onInterrupt,
    } });
    return token;
  },
  commitEditTransaction: token => {
    const transaction = get().editTransaction;
    if (!transaction || (token && transaction.token !== token)) return;
    set(state => {
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
    });
    // token 없는 확정은 독립 명령이 끼어든 것이다. 소유자가 옛 token으로 쓰지 않게 알린다.
    if (!token) transaction.onInterrupt?.();
  },
  cancelEditTransaction: token => {
    const transaction = get().editTransaction;
    if (!transaction || (token && transaction.token !== token)) return;
    set({ ...transaction.before, chart: restoreChartSnapshot(get(), transaction.before.chart), selection: transaction.selection,
      lastValidSnapshot: transaction.lastValidSnapshot, editTransaction: null });
    if (!token) transaction.onInterrupt?.();
  },
  cancelEditTransactionForPlaybackStart: () => {
    const transaction = get().editTransaction;
    if (!transaction) return;
    // token 없는 취소라 소유 조작은 onInterrupt로 그 누름의 조작을 끝내, 같은 누름을 더 끌어도 아무것도 바꾸지 않는다.
    set({ ...transaction.before, chart: restoreChartSnapshot(get(), transaction.before.chart), selection: transaction.selectionBeforePress,
      lastValidSnapshot: transaction.lastValidSnapshot, editTransaction: null });
    transaction.onInterrupt?.();
  },
  addToast: (message, type = 'warn') => showToast(message, type),
  setEditingEvent: (event) => set({ editingEvent: event }),
  applyLegacyConversion: () => {
    const before = get().chart;
    const result = convertLegacyChart(before);
    if (result.chart === before) return null;
    // 변환 하나가 Undo 한 단위다. savedChartJson은 바꾸지 않는다 — 불러온 구형 차트의 직렬화와 비교해
    // 변환 뒤 dirty, Undo로 구형 차트에 돌아가면 clean이 된다.
    get().setChart(result.chart, { separateHistory: true });
    if (get().chart !== result.chart) return null;
    set({ legacyConversionReview: result.report.items, legacyConversionReviewOpen: false });
    return result.report;
  },
  setLegacyConversionReviewOpen: (legacyConversionReviewOpen) => set({ legacyConversionReviewOpen }),
}));
