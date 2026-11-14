import { describe, expect, it, vi } from 'vitest';
import type { SongChartList } from './components/SongInfoDrawer';
import { loadEditorChartAsset } from './chartAssetLoad';
import { openEditorChart } from './openEditorChart';
import { toChartSaveJson } from './savedChart';
import { discardSongInfoChanges } from './songInfoEditing';
import { createSongInfoDrawerControl, subscribeSongInfoReopen } from './songInfoDrawerControl';
import { useEditorStore } from './stores/editorStore';
import type { StoredChartRow } from '../supabase/chartRows';

vi.mock('../shared/toast', () => ({ showToast: vi.fn() }));

const row = (difficultyLabel: string): StoredChartRow => ({ id: difficultyLabel, difficultyLabel, revision: 1, chartPath: null, chartExtraPath: null });

function harness(songId: string | null = 'song') {
  const fetches: { songId: string; resolve: (rows: StoredChartRow[]) => void; reject: (error: Error) => void }[] = [];
  const opened: boolean[] = [];
  const lists: SongChartList[] = [];
  const control = createSongInfoDrawerControl({
    setOpen: open => opened.push(open),
    setCharts: charts => lists.push(charts),
    getSongId: () => songId,
    fetchRows: requested => new Promise((resolve, reject) => { fetches.push({ songId: requested, resolve, reject }); }),
  });
  return { control, fetches, opened, lists };
}

describe('곡 정보 드로어 열기', () => {
  it('열면 드로어를 열고 목록을 loading으로 둔 뒤 song의 행 normal·hard를 loaded로 보인다', async () => {
    const { control, fetches, opened, lists } = harness();

    control.open();

    expect(opened).toEqual([true]);
    expect(lists).toEqual([{ status: 'loading' }]);
    expect(fetches.map(fetch => fetch.songId)).toEqual(['song']);
    fetches[0].resolve([row('normal'), row('hard')]);
    await vi.waitFor(() => expect(lists.at(-1)).toEqual({ status: 'loaded', rows: [row('normal'), row('hard')] }));
  });

  it('이미 열려 있으면 다시 여는 요청은 목록을 다시 읽지 않고 loading으로 깜빡이지도 않는다', () => {
    const { control, fetches, lists } = harness();
    control.open();

    control.open();

    expect(fetches).toHaveLength(1);
    expect(lists).toEqual([{ status: 'loading' }]);
  });

  it('닫았다 다시 열면 목록을 다시 읽고 늦게 온 첫 응답은 버린다', async () => {
    const { control, fetches, opened, lists } = harness();
    control.open();
    control.close();
    control.open();
    expect(opened).toEqual([true, false, true]);

    fetches[0].resolve([row('old')]);
    fetches[1].resolve([row('new')]);

    await vi.waitFor(() => expect(lists.at(-1)).toEqual({ status: 'loaded', rows: [row('new')] }));
    expect(lists).not.toContainEqual({ status: 'loaded', rows: [row('old')] });
  });

  it('목록 조회가 실패하면 failed를 보이고 늦게 온 이전 실패는 새 목록을 덮지 않는다', async () => {
    const { control, fetches, lists } = harness();
    control.open();
    control.close();
    control.open();

    fetches[1].reject(new Error('read failed'));
    await vi.waitFor(() => expect(lists.at(-1)).toEqual({ status: 'failed' }));
    fetches[0].reject(new Error('stale'));
    await Promise.resolve();

    expect(lists.filter(list => list.status === 'failed')).toHaveLength(1);
  });

  it('열린 곡 id가 없으면 조회 없이 목록을 failed로 둔다', () => {
    const { control, fetches, lists } = harness(null);

    control.open();

    expect(fetches).toHaveLength(0);
    expect(lists).toEqual([{ status: 'failed' }]);
  });

  it('제목을 바꿔 변경 취소한 뒤 테스트 플레이에서 돌아와 Ctrl+Z로 드로어가 다시 열리면 차트 목록을 읽는다', () => {
    openSongChart();
    useEditorStore.getState().applyMetaEdit({ title: '새 제목' });
    expect(discardSongInfoChanges()).toEqual({ discarded: true });

    // 재마운트: 드로어 상태와 구독을 새로 만들며 목록은 아직 읽지 않았다.
    const { control, fetches } = harness();
    const stop = subscribeSongInfoReopen(control.open);
    useEditorStore.getState().undo();
    stop();

    expect(fetches.map(fetch => fetch.songId)).toEqual(['song']);
  });
});

describe('변경 취소의 Undo로 드로어 다시 열기(subscribeSongInfoReopen)', () => {
  it('제목을 바꿔 변경 취소한 뒤 Undo 1회는 드로어 열기를 1번 요청하고, 이어진 일반 편집의 Undo는 요청하지 않는다', () => {
    openSongChart();
    const reopen = vi.fn();
    const stop = subscribeSongInfoReopen(reopen);
    useEditorStore.getState().applyMetaEdit({ title: '새 제목' });
    discardSongInfoChanges();
    expect(reopen).not.toHaveBeenCalled();

    useEditorStore.getState().undo();
    expect(reopen).toHaveBeenCalledOnce();

    useEditorStore.getState().undo();
    expect(reopen).toHaveBeenCalledOnce();
    stop();
  });

  it('음원만 바꾼 변경 취소는 Undo 단위가 없어 이어진 Undo가 드로어 열기를 요청하지 않는다', () => {
    openSongChart();
    const reopen = vi.fn();
    const stop = subscribeSongInfoReopen(reopen);
    useEditorStore.getState().setChart({ ...useEditorStore.getState().chart,
      notes: [{ type: 'tap', kind: 'single', lane: 1, beat: { n: 2, d: 1 } }] });
    useEditorStore.getState().applySongMedia({ audioFile: 'next.ogg' }, { pendingAudioFile: new File(['a'], 'next.ogg') });
    discardSongInfoChanges();

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().chart.notes).toEqual([]);
    expect(reopen).not.toHaveBeenCalled();
    stop();
  });
});

/** 120초 음원 audio.ogg의 곡 행이 있는 차트를 새로 연다. */
function openSongChart() {
  const song = { title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: 'audio.ogg', previewUrl: null, previewStart: null, previewEnd: null,
    duration: 120, gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null, timing: null, revision: 42 };
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  const chart = useEditorStore.getInitialState().chart;
  openEditorChart(loadEditorChartAsset(toChartSaveJson(chart, 2).chartJson, null, song), song);
}
