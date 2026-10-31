import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beat, songAudioPath, songJacketPath } from '../../shared';
import type { ChartAssetUpsert, ChartDocument, Lane, SongAssetPersistenceAdapter } from '../../shared';
import { showToast } from '../../shared/toast';
import type { PlaybackController } from '../playback/PlaybackController';
import { PAUSE_TO_EDIT_COPY, SAVE_IN_PROGRESS_COPY } from '../editorCopy';
import { isChartDirty, toSavedChartJson } from '../savedChart';
import { useEditorStore } from '../stores/editorStore';
import { emptySelection } from '../stores/selectionSlice';
import { EventEditModal } from '../components/EventEditModal';
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
/**
 * ChartEditorPage처럼 훅을 한 번 렌더해 핸들러를 돌려준다. 다시 부르면 새 훅 인스턴스라 페이지가 다시 마운트된 것과 같다
 * (테스트 플레이에서 돌아올 때). 페이지 지역 상태(구간·재킷·오디오 대기)는 비어 있다.
 */
function renderFileOperations(files: { jacket?: File; audio?: File } = {}): FileOperationHandlers {
  const playback = { audioBufferData: {} as AudioBuffer, isPlaying: false, pause: vi.fn() } as unknown as PlaybackController;
  const playbackRef: RefObject<PlaybackController | null> = { current: playback };
  const rendererRef: RefObject<{ setChart: (c: unknown) => void } | null> = { current: null };
  function FileOperationsProbe({ onRender }: { onRender: (handlers: FileOperationHandlers) => void }) {
    onRender(useFileOperations(
      playbackRef, rendererRef, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(),
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), null, null, files.jacket ?? null, vi.fn(), files.audio ?? null, navigateTo,
    ));
    return null;
  }
  let handlers: FileOperationHandlers | undefined;
  renderToStaticMarkup(createElement(FileOperationsProbe, { onRender: rendered => { handlers = rendered; } }));
  return handlers!;
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
  it.each([
    { asset: 'jacket', isPlaying: false }, { asset: 'jacket', isPlaying: true },
    { asset: 'audio', isPlaying: false }, { asset: 'audio', isPlaying: true },
  ] as const)('Save $asset 업로드 중 2박 노트와 제목을 수정하고 isPlaying=$isPlaying에서 완료하면 경로만 반영하고 편집과 dirty를 보존한다', async ({ asset, isPlaying }) => {
    const uploaded = chart([single(1, 0)]);
    open(uploaded);
    const file = new File(['asset'], asset === 'jacket' ? 'new.png' : 'new.ogg');
    const saving = renderFileOperations({ [asset]: file }).handleSaveChart();
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

    const pathKey = asset === 'jacket' ? 'imageFile' : 'audioFile';
    const path = asset === 'jacket' ? songJacketPath('song', 'png') : songAudioPath('song', 'ogg');
    expect(current().chart).toEqual({ ...edited, meta: { ...edited.meta, [pathKey]: path } });
    expect(current().savedChartJson).toEqual(toSavedChartJson({
      ...uploaded, meta: { ...uploaded.meta, [pathKey]: path },
    }, 2));
    expect(harness.uploadAsset).toHaveBeenCalledWith(path, file, { upsert: true });
    expect(dirty()).toBe(true);
    expect(current().isPlaying).toBe(isPlaying);
    expect(showToast).toHaveBeenCalledExactlyOnceWith('Chart saved', 'info');
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
        editingEvent, chart: current().chart, isBeatZero: true, extraLaneCount: 2, editLocked,
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

    renderFileOperations().handleEventSave({ eventBpm: '90', editorLane: '1' });

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
