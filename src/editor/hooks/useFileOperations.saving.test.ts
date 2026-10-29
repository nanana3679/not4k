import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beat } from '../../shared';
import type { ChartAssetUpsert, ChartDocument, Lane, SongAssetPersistenceAdapter } from '../../shared';
import { showToast } from '../../shared/toast';
import type { PlaybackController } from '../playback/PlaybackController';
import { SAVE_IN_PROGRESS_COPY } from '../editorCopy';
import { isChartDirty, toSavedChartJson } from '../savedChart';
import { useEditorStore } from '../stores/editorStore';
import { emptySelection } from '../stores/selectionSlice';
import { useFileOperations, type FileOperationHandlers } from './useFileOperations';

/** charts 행 upsert 하나. 테스트가 resolve·reject할 때까지 그 저장은 끝나지 않는다. */
interface PendingUpsert {
  row: ChartAssetUpsert;
  resolve: () => void;
  reject: (reason: Error) => void;
}

const harness = vi.hoisted(() => ({ upserts: [] as PendingUpsert[], uploads: new Map<string, string>() }));

// 이 테스트는 네트워크에 닿으면 안 된다. Supabase 클라이언트를 쓰는 순간 던져, 재킷·오디오 경로 같은 실제 요청을 막는다.
vi.mock('../../supabase/client', () => ({
  supabase: new Proxy({}, { get: (_target, key) => { throw new Error(`테스트에서 Supabase 클라이언트(${String(key)})를 쓰면 안 된다`); } }),
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
  events: [{ type: 'bpm', beat: beat(0), bpm: 120 }, { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) }],
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
function renderFileOperations(): FileOperationHandlers {
  const playback = { audioBufferData: {} as AudioBuffer, isPlaying: false, pause: vi.fn() } as unknown as PlaybackController;
  const playbackRef: RefObject<PlaybackController | null> = { current: playback };
  const rendererRef: RefObject<{ setChart: (c: unknown) => void } | null> = { current: null };
  function FileOperationsProbe({ onRender }: { onRender: (handlers: FileOperationHandlers) => void }) {
    onRender(useFileOperations(
      playbackRef, rendererRef, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(),
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), null, null, null, vi.fn(), null, navigateTo,
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
  navigateTo = vi.fn<(path: string) => void>();
  vi.mocked(showToast).mockClear();
  vi.stubGlobal('window', {
    location: { pathname: '/editor', search: '?songId=song&difficulty=normal' },
    history: { replaceState: vi.fn() },
  });
  useEditorStore.setState({
    chart: chart([]), extraLaneCount: 2, selection: emptySelection(), savedChartJson: null,
    isSavingChart: false, chartSaveGeneration: 0, activeSongId: 'song', currentTimeMs: 0, editingMarker: null,
    historyPast: [], historyFuture: [], historyLastCaptureAt: 0, editTransaction: null, lastValidSnapshot: null,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFileOperations 저장 진행', () => {
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
