import { createEditorSong } from '../songState';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beat } from '../../shared';
import type { ChartAssetUpsert, ChartDocument, Lane, SongAssetPersistenceAdapter } from '../../shared';
import { showToast } from '../../shared/toast';
import type { PlaybackController } from '../playback/PlaybackController';
import { PAUSE_TO_EDIT_COPY, SAVE_IN_PROGRESS_COPY } from '../editorCopy';
import { isChartDirty, toSavedChartJson } from '../savedChart';
import { useEditorStore } from '../stores/editorStore';
import { emptySelection } from '../stores/selectionSlice';
import { EventEditModal } from '../components/EventEditModal';
import { SelectMode } from '../modes/SelectMode';
import { makeFakeSpace } from '../timeline/makeFakeSpace';
import { useGameStore } from '../../game/stores';
import { useFileOperations, type FileOperationHandlers } from './useFileOperations';

/** charts 행 upsert 하나. 테스트가 resolve·reject할 때까지 그 저장은 끝나지 않는다. */
interface PendingUpsert {
  row: ChartAssetUpsert;
  resolve: () => void;
  reject: (reason: Error) => void;
}

const harness = vi.hoisted(() => ({
  upserts: [] as PendingUpsert[], uploads: new Map<string, string>(),
  uploadAsset: vi.fn(async () => ({ error: null })),
  updateSong: vi.fn(async () => ({ error: null })),
}));

// 재킷·오디오 저장에서 쓰는 요청만 메모리에서 처리한다. 실제 Supabase에는 닿지 않는다.
vi.mock('../../supabase/client', () => ({
  supabase: {
    storage: { from: () => ({ upload: harness.uploadAsset }) },
    from: () => ({ update: () => ({ eq: harness.updateSong }) }),
  },
}));
// 실제 저장 함수(shared saveChartAsset)에 메모리 adapter를 꽂는다. 업로드는 바로 끝나고 charts 행 upsert만 기다리게 해
// "파일은 올렸지만 DB 응답이 늦은" 저장을 만든다.
vi.mock('../../supabase', async importOriginal => {
  const actual = await importOriginal<typeof import('../../supabase')>();
  const { saveChartAsset } = await import('../../shared');
  const adapter: SongAssetPersistenceAdapter = {
    uploadText: async ({ path, content }) => { harness.uploads.set(path, content); },
    remove: async () => {},
    upsertChartRow: row => new Promise<void>((resolve, reject) => { harness.upserts.push({ row, resolve, reject }); }),
    deleteChartRow: async () => {},
    listSongFiles: async () => [],
    deleteSongRow: async () => {},
  };
  return { ...actual, saveChartAsset: (input: Parameters<typeof saveChartAsset>[1]) => saveChartAsset(adapter, input) };
});
vi.mock('../../shared/toast', () => ({ showToast: vi.fn() }));
// 서버 렌더의 zustand 훅은 store 초기값을 읽는다. 훅이 테스트가 넣은 현재 store 값을 읽게 한다.
vi.mock('../stores', async importOriginal => {
  const actual = await importOriginal<typeof import('../stores')>();
  const store = actual.useEditorStore;
  const readCurrent = <T,>(selector: (state: ReturnType<typeof store.getState>) => T): T => selector(store.getState());
  return { ...actual, useEditorStore: Object.assign(readCurrent, store) };
});

const SAVE_FAILED_TOAST = '저장에 실패했습니다. 잠시 후 다시 시도해주세요.';
const current = () => useEditorStore.getState();
const single = (lane: number, at: number): ChartDocument['notes'][number] => ({ type: 'single', lane: lane as Lane, beat: beat(at) });
const chart = (notes: ChartDocument['notes'], difficultyLabel = 'NORMAL'): ChartDocument => ({
  meta: { title: '저장 진행', artist: '', difficultyLabel, difficultyLevel: 5, imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
  notes,
  trillZones: [],
  events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 }],
});
const dirty = () => isChartDirty(current().chart, current().extraLaneCount, current().savedChartJson);
/** App의 로드 경로처럼 차트를 열고 그 차트로 savedChartJson을 정한다. */
function open(document: ChartDocument) {
  current().loadChart(document);
  current().setSavedChartJson(toSavedChartJson(document, current().extraLaneCount));
}
/** 대기 중인 Promise 연쇄(업로드 → upsert → 결과 반영)가 다음 await까지 진행되게 한다. */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

let navigateTo = vi.fn<(path: string) => void>();
/** App처럼 현재 store를 읽는 훅을 렌더한다. 다시 부르면 테스트 플레이 복귀의 재마운트에 해당한다. */
function renderFileOperations(): FileOperationHandlers {
  return mountFileOperations().handlers;
}

function mountFileOperations({ audioBufferData = {} as AudioBuffer }: { audioBufferData?: AudioBuffer | null } = {}) {
  const playback = { audioBufferData, isPlaying: false, pause: vi.fn() } as unknown as PlaybackController;
  const playbackRef: RefObject<PlaybackController | null> = { current: playback };
  const rendererRef: RefObject<{ setChart: (c: unknown) => void } | null> = { current: null };
  let handlers: FileOperationHandlers | undefined;
  function Probe({ onRender }: { onRender: (handlers: FileOperationHandlers) => void }) {
    onRender(useFileOperations(playbackRef, rendererRef, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), navigateTo));
    return null;
  }
  renderToStaticMarkup(createElement(Probe, { onRender: value => { handlers = value; } }));
  return { handlers: handlers! };
}

function attachSong() {
  current().setSong(createEditorSong({ title: current().chart.meta.title, artist: '', jacketUrl: null, audioUrl: '', duration: null,
    previewUrl: null, previewStart: null, previewEnd: null, gameplayStart: null, gameplayEnd: null,
    gameplayFadeIn: null, gameplayFadeOut: null, timing: null, revision: 42 }, current().chart));
}

beforeEach(() => {
  harness.upserts.length = 0;
  harness.uploads.clear();
  harness.uploadAsset.mockClear();
  harness.updateSong.mockClear();
  navigateTo = vi.fn<(path: string) => void>();
  vi.mocked(showToast).mockClear();
  vi.stubGlobal('window', {
    location: { pathname: '/editor', search: '?songId=song&difficulty=normal' },
    history: { replaceState: vi.fn() },
  });
  useEditorStore.setState({
    chart: chart([]), extraLaneCount: 2, selection: emptySelection(), savedChartJson: null,
    isSavingChart: false, chartSaveGeneration: 0, activeSongId: 'song', currentTimeMs: 0, editingEvent: null, isPlaying: false,
    historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null, lastValidSnapshot: null,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFileOperations 저장 진행', () => {
  it('자켓·음원 교체가 대기 중이어도 Save Chart는 곡 업로드·UPDATE 없이 차트만 저장한다', async () => {
    open(chart([single(1, 0)]));
    attachSong();
    const draft = { ...current().song!, pendingJacketFile: new File(['A'], 'A.png'), pendingAudioFile: new File(['A'], 'A.ogg') };
    current().setSong(draft);
    const page = mountFileOperations();
    const saving = page.handlers.handleSaveChart();
    await flush();
    harness.upserts[0].resolve();
    await saving;
    expect(harness.uploadAsset).not.toHaveBeenCalled();
    expect(harness.updateSong).not.toHaveBeenCalled();
    expect(current().song).toBe(draft);
  });

  it.each([false, true])('Save As LIFTOFF Lv.3 업로드 중 2박 노트와 제목을 수정하고 isPlaying=%s에서 완료하면 편집을 보존하고 난이도만 반영하며 dirty로 남는다', async isPlaying => {
    const uploaded = chart([single(1, 0)]);
    open(uploaded);
    const saving = renderFileOperations().handleSaveAs('LIFTOFF', 3);
    await flush();

    const edited = {
      ...current().chart,
      meta: { ...current().chart.meta, title: '업로드 중 수정', offsetMs: 25 },
      notes: [...current().chart.notes, single(2, 2)],
    };
    current().setChart(edited);
    current().setIsPlaying(isPlaying);
    harness.upserts[0].resolve();
    await saving;

    expect(current().chart.notes).toEqual(edited.notes);
    expect(current().chart.meta).toMatchObject({
      title: '업로드 중 수정', offsetMs: 25, difficultyLabel: 'LIFTOFF', difficultyLevel: 3,
    });
    expect(current().savedChartJson).toEqual(toSavedChartJson({
      ...uploaded, meta: { ...uploaded.meta, difficultyLabel: 'LIFTOFF', difficultyLevel: 3 },
    }, 2));
    expect(dirty()).toBe(true);
    expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '?songId=song&difficulty=liftoff');
    expect(showToast).toHaveBeenCalledExactlyOnceWith('Chart saved as LIFTOFF Lv.3', 'info');
    expect(current().isPlaying).toBe(isPlaying);
  });

  it('저장 A의 charts 행 응답을 기다리는 동안 페이지를 다시 렌더해도 두 번째 Save·Save As·테스트 플레이가 시작되지 않고, A가 끝나면 savedChartJson이 A의 업로드가 되며 그 뒤 테스트 플레이는 /game으로 간다', async () => {
    open(chart([single(1, 0)]));
    const savedA = chart([single(1, 0), single(2, 1)]);
    current().setChart(savedA);
    const saveA = renderFileOperations().handleSaveChart();
    await flush();
    expect(harness.upserts).toHaveLength(1);
    expect(current().isSavingChart).toBe(true);

    current().setChart(chart([single(1, 0), single(2, 1), single(3, 2)]));
    const remounted = renderFileOperations();
    await remounted.handleSaveChart();
    await remounted.handleSaveAs('LIFTOFF', 3);
    remounted.handlePlayTest(false);
    await flush();

    expect(harness.upserts).toHaveLength(1);
    expect(navigateTo).not.toHaveBeenCalled();
    expect(vi.mocked(showToast).mock.calls).toEqual([
      [SAVE_IN_PROGRESS_COPY.secondSave, 'error'],
      [SAVE_IN_PROGRESS_COPY.secondSave, 'error'],
      [SAVE_IN_PROGRESS_COPY.playTest, 'error'],
    ]);

    harness.upserts[0].resolve();
    await saveA;

    expect(current().isSavingChart).toBe(false);
    expect(current().savedChartJson).toEqual(toSavedChartJson(savedA, 2));
    // A 이후에 더한 노트(3레인 2박)는 저장되지 않았으므로 dirty다.
    expect(dirty()).toBe(true);
    renderFileOperations().handlePlayTest(false);
    expect(navigateTo).toHaveBeenCalledExactlyOnceWith('/game');
  });

  it('저장 A 중 다른 차트를 새로 열고 시작한 저장 B가 먼저 끝난 뒤 A가 늦게 끝나도 savedChartJson은 B의 업로드로 남아 dirty가 아니다', async () => {
    open(chart([single(1, 0)]));
    current().setChart(chart([single(1, 0), single(2, 1)]));
    const saveA = renderFileOperations().handleSaveChart();
    await flush();

    open(chart([single(4, 0)]));
    const savedB = chart([single(4, 0), single(3, 1)]);
    current().setChart(savedB);
    const saveB = renderFileOperations().handleSaveChart();
    await flush();
    expect(harness.upserts).toHaveLength(2);

    harness.upserts[1].resolve();
    await saveB;
    expect(current().savedChartJson).toEqual(toSavedChartJson(savedB, 2));
    expect(current().isSavingChart).toBe(false);

    harness.upserts[0].resolve();
    await saveA;

    expect(current().savedChartJson).toEqual(toSavedChartJson(savedB, 2));
    expect(current().isSavingChart).toBe(false);
    expect(dirty()).toBe(false);
  });

  it('노트 1개를 더한 뒤 charts 행 upsert가 실패하면 실패 토스트를 띄우고 savedChartJson을 불러온 차트 값 그대로 두어 dirty로 남으며, 다시 Save하면 저장이 시작된다', async () => {
    const loaded = chart([single(1, 0)]);
    open(loaded);
    current().setChart(chart([single(1, 0), single(2, 1)]));
    const failed = renderFileOperations().handleSaveChart();
    await flush();

    harness.upserts[0].reject(new Error('charts upsert failed'));
    await failed;

    expect(showToast).toHaveBeenCalledWith(SAVE_FAILED_TOAST, 'error');
    expect(current().savedChartJson).toEqual(toSavedChartJson(loaded, 2));
    expect(current().isSavingChart).toBe(false);
    expect(dirty()).toBe(true);

    const retry = renderFileOperations().handleSaveChart();
    await flush();
    expect(harness.upserts).toHaveLength(2);
    harness.upserts[1].resolve();
    await retry;
    expect(dirty()).toBe(false);
  });
});

describe('초기 설정 편집 창 저장(RFD 0082)', () => {
  const fixedLanes = (): ChartDocument => ({
    ...chart([single(1, 0)]),
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ],
  });

  it('0박 BPM 창 Save에 editorLane 2가 섞여 와도 BPM만 120 → 90으로 바꾸고 보조 레인1을 유지한다', () => {
    open(fixedLanes());
    useEditorStore.setState({ editingEvent: { type: 'event', index: 0 } });

    renderFileOperations().handleEventSave({ eventBpm: '90', editorLane: '2' });

    expect(current().chart.events[0]).toEqual({ type: 'bpm', beat: beat(0), bpm: 90, editorLane: 1 });
    expect(current().editingEvent).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('0박 박자 창 Save에 보조 레인 수 2를 넘는 editorLane 9가 와도 토스트 없이 박자만 4/4 → 3/4로 바꾸고 보조 레인2를 유지한다', () => {
    open(fixedLanes());
    useEditorStore.setState({ editingEvent: { type: 'event', index: 1 } });

    renderFileOperations().handleEventSave({ tsNumerator: '3', tsDenominator: '1', editorLane: '9' });

    expect(current().chart.events[1]).toEqual({ type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(3), editorLane: 2 });
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('재생 중 이벤트 편집과 저장(RFD 0099)', () => {
  const withText = (): ChartDocument => ({
    ...chart([single(1, 0)]),
    events: [...chart([]).events, { type: 'text', beat: beat(4), endBeat: beat(6), text: '안내', editorLane: 1 }],
  });

  it.each([false, true])('editLocked=%s로 렌더한 EventEditModal Save 콜백도 재생 중 실행하면 BPM 120과 열린 모달을 보존한다', editLocked => {
    open(chart([single(1, 0)]));
    const editingEvent = { type: 'event' as const, index: 0 };
    current().setEditingEvent(editingEvent);
    const handlers = renderFileOperations();
    let save: (() => void) | undefined;
    function findSave(node: ReactNode): void {
      Children.forEach(node, child => {
        if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) return;
        if (child.type === 'button' && child.props.children === 'Save') save = child.props.onClick;
        else findSave(child.props.children);
      });
    }
    function ModalProbe() {
      const tree = EventEditModal({
        editingEvent, chart: current().chart, isBeatZero: true, editLocked,
        onSave: handlers.handleEventSave, onDelete: handlers.handleEventDelete, onClose() {},
      });
      findSave(tree);
      return tree;
    }
    renderToStaticMarkup(createElement(ModalProbe));
    current().setIsPlaying(true);
    save!();

    expect(current().chart.events[0]).toMatchObject({ type: 'bpm', bpm: 120 });
    expect(current().editingEvent).toEqual(editingEvent);
    expect(showToast).toHaveBeenCalledExactlyOnceWith(PAUSE_TO_EDIT_COPY, 'warn');
  });

  it('재생 중 0박 BPM 이벤트를 120에서 90으로 저장하면 BPM 120이 남고 편집 창은 열린 채 안내 토스트를 띄운다', () => {
    open(chart([single(1, 0)]));
    useEditorStore.setState({ editingEvent: { type: 'event', index: 0 }, isPlaying: true });

    renderFileOperations().handleEventSave({ eventBpm: '90' });

    expect(current().chart.events[0]).toMatchObject({ type: 'bpm', bpm: 120 });
    expect(current().editingEvent).toEqual({ type: 'event', index: 0 });
    expect(showToast).toHaveBeenCalledWith(PAUSE_TO_EDIT_COPY, 'warn');
  });

  it('재생 중 4박 text 이벤트를 편집 창에서 삭제하면 이벤트 3개가 그대로 남는다', () => {
    open(withText());
    useEditorStore.setState({ editingEvent: { type: 'event', index: 2 }, isPlaying: true });

    renderFileOperations().handleEventDelete();

    expect(current().chart.events).toHaveLength(3);
    expect(showToast).toHaveBeenCalledWith(PAUSE_TO_EDIT_COPY, 'warn');
  });

  it('재생 중 Save As LIFTOFF Lv.3은 업로드가 끝나면 노트는 그대로 두고 난이도 meta만 차트에 반영한다', async () => {
    open(chart([single(1, 0)]));
    useEditorStore.setState({ isPlaying: true });
    const notesBefore = current().chart.notes;

    const saving = renderFileOperations().handleSaveAs('LIFTOFF', 3);
    await flush();
    harness.upserts[0].resolve();
    await saving;

    expect(current().chart.meta).toMatchObject({ difficultyLabel: 'LIFTOFF', difficultyLevel: 3 });
    expect(current().chart.notes).toBe(notesBefore);
    expect(current().isPlaying).toBe(true);
  });
});

describe('테스트 플레이 진입과 열린 편집(RFD 0099)', () => {
  let unsubscribe = () => {};
  afterEach(() => unsubscribe());

  /** App처럼 store 콜백으로 SelectMode를 만들고 store 차트를 모드에 넘긴다. 다시 부르면 페이지가 다시 마운트된 것과 같다. */
  function mountSelectMode(): SelectMode {
    unsubscribe();
    const mode = new SelectMode(current().chart, {
      space: makeFakeSpace(),
      getSelection: () => current().selection,
      setSelection: value => current().setSelection(value),
      setSelectionTransient: value => current().setSelectionTransient(value),
      onChartUpdate: (value, transaction) => current().setChart(value, { transaction }),
      getExtraLaneCount: () => current().extraLaneCount,
      setExtraLaneCount: (count, transaction) => current().setExtraLaneCount(count, transaction),
      beginTransaction: (onInterrupt, selectionBefore) => current().beginEditTransaction('selectModeEdit', onInterrupt, selectionBefore),
      commitTransaction: token => current().commitEditTransaction(token),
      cancelTransaction: token => current().cancelEditTransaction(token),
    });
    unsubscribe = useEditorStore.subscribe(state => mode.setChart(state.chart));
    return mode;
  }

  /** 레인 1의 0박 노트를 복사해 8박에 붙여넣고 배치를 확정하지 않는다. notes의 첫 노트가 복사할 0박 노트다. */
  function pasteWithoutConfirmAt8(notes = [single(1, 0)]): SelectMode {
    open(chart(notes));
    const mode = mountSelectMode();
    mode.selectNote(0); mode.copy(); mode.paste(beat(8));
    expect(mode.isPendingPaste).toBe(true);
    expect(current().editTransaction).not.toBeNull();
    return mode;
  }

  it('8박 붙여넣기 대기 중 처음부터 테스트 플레이하면 붙여넣기를 확정해 게임이 0박·8박 노트 2개를 받고 에디터는 노트 2개·history 1개·열린 편집 없음이다', () => {
    const mode = pasteWithoutConfirmAt8();

    renderFileOperations().handlePlayTest(false);

    expect(navigateTo).toHaveBeenCalledExactlyOnceWith('/game');
    expect(useGameStore.getState().chartData?.notes.map(note => note.beat)).toEqual([beat(0), beat(8)]);
    expect(current().chart.notes.map(note => note.beat)).toEqual([beat(0), beat(8)]);
    expect(current().historyPast).toHaveLength(1);
    expect(current().editTransaction).toBeNull();
    expect(mode.isPendingPaste).toBe(false);
  });

  it('8박 붙여넣기 대기 중 테스트 플레이에서 돌아와 재생을 시작해도 8박 노트가 남아 노트 2개이고, 정지 뒤 Undo 1번에 0박 노트 1개가 된다', () => {
    pasteWithoutConfirmAt8();
    renderFileOperations().handlePlayTest(false);

    // 테스트 플레이에서 돌아오면 App이 모드와 페이지 훅을 새로 만든다.
    mountSelectMode();
    renderFileOperations();
    // Space: PlaybackController.play()의 beforePlay가 열린 편집을 취소하고 onPlayStateChange가 재생 상태를 켠다.
    current().cancelEditTransactionForPlaybackStart();
    current().setIsPlaying(true);

    expect(current().chart.notes.map(note => note.beat)).toEqual([beat(0), beat(8)]);
    expect(current().historyPast).toHaveLength(1);

    current().setIsPlaying(false);
    current().undo();

    expect(current().chart.notes.map(note => note.beat)).toEqual([beat(0)]);
  });

  it('8박 붙여넣기 대기 중 오디오가 로딩되지 않아 테스트 플레이가 거절되면 붙여넣기 대기·열린 편집이 남고 Escape(cancelPaste)로 0박 노트 1개·history 0개로 돌아간다', () => {
    const mode = pasteWithoutConfirmAt8();
    const page = mountFileOperations({ audioBufferData: null });

    page.handlers.handlePlayTest(false);

    expect(showToast).toHaveBeenCalledWith('오디오가 로딩되지 않았습니다', 'error');
    expect(navigateTo).not.toHaveBeenCalled();
    expect(mode.isPendingPaste).toBe(true);
    expect(current().editTransaction).not.toBeNull();
    expect(current().historyPast).toHaveLength(0);

    mode.cancelPaste();

    expect(current().chart.notes.map(note => note.beat)).toEqual([beat(0)]);
    expect(current().historyPast).toHaveLength(0);
    expect(current().editTransaction).toBeNull();
  });

  it('레인 1 8박 노트 위에 붙여넣기 대기 중 배치 제약 위반으로 테스트 플레이가 거절되면 열린 편집이 남아 방향키(movePasteByLane)로 레인 2에 옮기고, 다시 테스트 플레이하면 게임이 노트 3개를 받고 history 1개다', () => {
    const mode = pasteWithoutConfirmAt8([single(1, 0), single(1, 8)]);
    const page = mountFileOperations();

    page.handlers.handlePlayTest(false);

    expect(showToast).toHaveBeenCalledWith('배치 제약 위반 1건이 남아 있어 플레이할 수 없습니다', 'error');
    expect(navigateTo).not.toHaveBeenCalled();
    expect(mode.isPendingPaste).toBe(true);
    expect(current().editTransaction).not.toBeNull();
    expect(current().historyPast).toHaveLength(0);

    mode.movePasteByLane('right');
    page.handlers.handlePlayTest(false);

    const placed = (notes: ChartDocument['notes'] | undefined) => notes?.map(note => [note.lane, note.beat]);
    const expected = [[1, beat(0)], [1, beat(8)], [2, beat(8)]];
    expect(navigateTo).toHaveBeenCalledExactlyOnceWith('/game');
    expect(placed(useGameStore.getState().chartData?.notes)).toEqual(expected);
    expect(placed(current().chart.notes)).toEqual(expected);
    expect(current().historyPast).toHaveLength(1);
    expect(current().editTransaction).toBeNull();
    expect(mode.isPendingPaste).toBe(false);
  });
});


describe('곡 타이밍 저장 선행 조건', () => {
  it.each(['Save Chart', 'Save As'])('Offset 0→25가 미저장인 곡에서 %s를 실행하면 업로드 0회와 곡 저장 안내가 남는다', async action => {
    open(chart([single(1, 0)]));
    attachSong();
    current().setChart({ ...current().chart, meta: { ...current().chart.meta, offsetMs: 25 } });
    const handlers = renderFileOperations();
    await (action === 'Save Chart' ? handlers.handleSaveChart() : handlers.handleSaveAs('hard', 8));
    expect(harness.upserts).toHaveLength(0);
    expect(harness.uploads.size).toBe(0);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Save Song'), 'warn');
  });
});


it('제목만 새 제목으로 바꾼 곡의 Save Chart는 허용되고 곡 기준 제목은 저장 전 값으로 남는다', async () => {
  open(chart([single(1, 0)])); attachSong();
  const baseline = current().song!.baseline;
  current().setChart({ ...current().chart, meta: { ...current().chart.meta, title: '새 제목' } });
  const saving = renderFileOperations().handleSaveChart();
  await flush();
  expect(harness.upserts).toHaveLength(1);
  harness.upserts[0].resolve(); await saving;
  expect(current().song!.baseline).toBe(baseline);
  expect(harness.updateSong).not.toHaveBeenCalled();
});

it('timing NULL 곡을 NORMAL에서 HARD로 Save As하면 이행 비교에서 제외할 열린 차트만 HARD로 바뀌고 곡 기준·리비전 42는 유지된다', async () => {
  open(chart([single(1, 0)])); attachSong();
  const baseline = current().song!.baseline;
  const saving = renderFileOperations().handleSaveAs('HARD', 8);
  await flush(); harness.upserts[0].resolve(); await saving;
  expect(current().song).toMatchObject({ sourceDifficulty: 'HARD', revision: 42, needsTimingMigration: true });
  expect(current().song!.baseline).toBe(baseline);
});
