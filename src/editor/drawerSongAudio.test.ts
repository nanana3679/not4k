import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../shared';
import { showToast } from '../shared/toast';
import { loadEditorChartAsset } from './chartAssetLoad';
import { createDrawerSongAudio, type DrawerSongAudioPlayback } from './drawerSongAudio';
import type { MetaAudioPick } from './metaAudioSession';
import { openEditorChart } from './openEditorChart';
import { toSavedChartJson } from './savedChart';
import { editSongAudio } from './songInfoEditing';
import { songValues } from './songState';
import { useEditorStore } from './stores/editorStore';

vi.mock('../shared/toast', () => ({ showToast: vi.fn() }));

const store = () => useEditorStore.getState();
const base = useEditorStore.getInitialState().chart;
/** 저장된 곡: 120초 음원 audio.ogg. */
const loadedSong = { title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: 'audio.ogg',
  previewUrl: null, previewStart: 10, previewEnd: 20, duration: 120,
  gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null,
  timing: null, revision: 42 };
const savedBuffer = { duration: 120 } as AudioBuffer;
const bufferOf = (file: File) => ({ duration: file.name === 'next.ogg' ? 5 : 30 }) as AudioBuffer;

/**
 * 재생기처럼 로드에 성공하면 버퍼를 바꾸고, restoreAudioBuffer·cancelAudioLoad·clearAudio는 진행 중인 로드를 버린다.
 * 실제 재생기의 onAudioLoaded처럼 로드 성공·복원은 표시 음원(state.shown)도 바꾼다. clearAudio는 표시 음원을 건드리지 않는다.
 */
function harness(initialBuffer: AudioBuffer | null = savedBuffer) {
  const loads = new Map<string, () => Promise<void>>();
  let generation = 0;
  const state = { pick: null as MetaAudioPick | null, shown: initialBuffer as AudioBuffer | null };
  const decoded = new Map<string, AudioBuffer>();
  const playback: DrawerSongAudioPlayback & { buffer: AudioBuffer | null } = {
    buffer: initialBuffer,
    get audioBufferData() { return this.buffer; },
    loadAudioFile: vi.fn((file: File) => new Promise<void>(resolve => {
      const started = ++generation;
      loads.set(file.name, async () => {
        if (started === generation) {
          const buffer = decoded.get(file.name) ?? bufferOf(file);
          decoded.set(file.name, buffer);
          playback.buffer = buffer;
          state.shown = buffer;
        }
        resolve();
      });
    })),
    restoreAudioBuffer: vi.fn((buffer: AudioBuffer) => { generation++; playback.buffer = buffer; state.shown = buffer; }),
    cancelAudioLoad: vi.fn(() => { generation++; }),
    clearAudio: vi.fn(() => { generation++; playback.buffer = null; }),
  };
  const reloadSavedAudio = vi.fn();
  const audio = createDrawerSongAudio({
    setPick: pick => { state.pick = pick; },
    setAudioLoading: () => {},
    setLoadedAudioBuffer: buffer => { state.shown = buffer; },
    onLoadFailed: vi.fn(),
    reloadSavedAudio,
  });
  /** 파일을 골라 불러오기를 끝까지 마친다. */
  const pickAndLoad = async (name: string) => {
    const file = new File(['a'], name);
    const picking = audio.pick(playback, file);
    await loads.get(name)!();
    await picking;
    return file;
  };
  return { audio, playback, loads, state, reloadSavedAudio, pickAndLoad };
}

/** 곡 정보 변경 취소를 실행하고 막히지 않았는지 확인한다. */
function discard(audio: ReturnType<typeof harness>['audio'], playback: DrawerSongAudioPlayback) {
  expect(audio.discard(playback)).toBe(true);
}

beforeEach(() => {
  vi.mocked(showToast).mockClear();
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, loadedSong), loadedSong);
});

afterEach(() => { vi.restoreAllMocks(); });

describe('곡 정보 드로어의 음원 교체', () => {
  it('next.ogg를 고르면 불러오는 동안 store의 isLoadingSongAudio가 true이고, 불러오면 false가 되며 5초 곡 음원으로 적용한다', async () => {
    const { audio, playback, loads } = harness();
    const picking = audio.pick(playback, new File(['a'], 'next.ogg'));
    expect(store().isLoadingSongAudio).toBe(true);

    await loads.get('next.ogg')!();
    await picking;

    expect(store().isLoadingSongAudio).toBe(false);
    expect(store().song).toMatchObject({ duration: 5, pendingAudioFile: { name: 'next.ogg' } });
  });

  it('next.ogg를 불러오는 중 드로어를 닫으면 isLoadingSongAudio가 false가 되고 재생기를 저장된 120초 음원으로 되돌린다', () => {
    const { audio, playback } = harness();
    void audio.pick(playback, new File(['a'], 'next.ogg'));

    audio.close(playback);

    expect(store().isLoadingSongAudio).toBe(false);
    expect(playback.restoreAudioBuffer).toHaveBeenCalledExactlyOnceWith(savedBuffer);
  });

  it('1박→0박 역전 restZone이 남은 차트에서도 30초 F.ogg를 고르면 곡 음원으로 적용하고 재생기는 F 버퍼를 유지한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useEditorStore.setState({ chart: { ...store().chart, restZones: [{ lane: 1, beat: beat(1), endBeat: beat(0) }] } });
    const { playback, pickAndLoad } = harness();

    await pickAndLoad('F.ogg');

    expect(store().song).toMatchObject({ duration: 30, pendingAudioFile: { name: 'F.ogg' } });
    expect(playback.audioBufferData?.duration).toBe(30);
    expect(store().historyPast).toHaveLength(0);
  });
});

describe('Undo·Redo와 재생기 음원(음원은 이력 밖, 2026-11-08)', () => {
  it('1레인 2박 노트를 놓고 next.ogg(5초)를 고른 뒤 Undo·Redo해도 재생기는 next의 5초 버퍼를 유지하고 다시 불러오거나 비우지 않는다', async () => {
    const { playback, pickAndLoad, reloadSavedAudio } = harness();
    store().setChart({ ...store().chart, notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(2) }] });
    await pickAndLoad('next.ogg');
    const next = playback.audioBufferData;

    store().undo();
    store().redo();

    expect(playback.audioBufferData).toBe(next);
    expect(playback.loadAudioFile).toHaveBeenCalledOnce();
    expect(playback.restoreAudioBuffer).not.toHaveBeenCalled();
    expect(playback.clearAudio).not.toHaveBeenCalled();
    expect(reloadSavedAudio).not.toHaveBeenCalled();
  });

  it('제목과 next.ogg를 바꾸고 변경 취소한 뒤 Undo하면 제목만 돌아오고 재생기 요청은 변경 취소 때의 audio.ogg 다시 불러오기 1번뿐이다', async () => {
    const { audio, playback, pickAndLoad, reloadSavedAudio } = harness();
    store().applyMetaEdit({ title: '새 제목' });
    await pickAndLoad('next.ogg');
    discard(audio, playback);

    store().undo();

    expect(store().chart.meta).toMatchObject({ title: '새 제목', audioFile: 'audio.ogg' });
    expect(reloadSavedAudio).toHaveBeenCalledExactlyOnceWith('audio.ogg');
    expect(playback.clearAudio).toHaveBeenCalledOnce();
    expect(playback.loadAudioFile).toHaveBeenCalledOnce();
  });
});

describe('곡 정보 변경 취소 뒤 재생기 음원', () => {
  it('저장된 120초 audio.ogg 위에서 next.ogg(5초)를 적용하고 변경 취소하면 이전 버퍼를 보관하지 않으므로 재생기·표시 음원을 비우고 audio.ogg를 다시 불러온다', async () => {
    const { audio, playback, state, reloadSavedAudio, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    expect(playback.audioBufferData?.duration).toBe(5);

    discard(audio, playback);

    expect(playback.clearAudio).toHaveBeenCalledOnce();
    expect(playback.audioBufferData).toBeNull();
    expect(state.shown).toBeNull();
    expect(playback.restoreAudioBuffer).not.toHaveBeenCalled();
    expect(reloadSavedAudio).toHaveBeenCalledExactlyOnceWith('audio.ogg');
  });

  it('next.ogg를 적용하고 other.ogg를 불러오는 중에 변경 취소하면 늦게 끝난 other도 반영하지 않고 audio.ogg를 다시 불러온다', async () => {
    const { audio, playback, loads, reloadSavedAudio, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    const picking = audio.pick(playback, new File(['a'], 'other.ogg'));

    discard(audio, playback);
    await loads.get('other.ogg')!();
    await picking;

    expect(playback.audioBufferData).toBeNull();
    expect(reloadSavedAudio).toHaveBeenCalledExactlyOnceWith('audio.ogg');
    expect(store().isLoadingSongAudio).toBe(false);
    expect(store().song?.pendingAudioFile).toBeNull();
  });

  it('대기 음원 next.ogg가 남은 채 페이지를 다시 열어(새 세션) 변경 취소하면 재생기의 next를 비우고 audio.ogg를 다시 불러온다', () => {
    const next = new File(['a'], 'next.ogg');
    editSongAudio(next, 5);
    const { audio, playback, reloadSavedAudio } = harness(bufferOf(next));

    discard(audio, playback);

    expect(playback.audioBufferData).toBeNull();
    expect(reloadSavedAudio).toHaveBeenCalledExactlyOnceWith('audio.ogg');
  });

  it('저장된 곡에 음원이 없고 next.ogg를 적용한 뒤 변경 취소하면 재생기·표시 음원을 비우고 다시 불러올 음원은 없다', async () => {
    const silent = { ...loadedSong, audioUrl: '', duration: null };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, silent), silent);
    const { audio, playback, state, reloadSavedAudio, pickAndLoad } = harness(null);
    await pickAndLoad('next.ogg');
    expect(state.shown?.duration).toBe(5);

    discard(audio, playback);

    expect(playback.audioBufferData).toBeNull();
    expect(state.shown).toBeNull();
    expect(reloadSavedAudio).not.toHaveBeenCalled();
  });

  it('곡 저장으로 next.ogg가 저장된 음원 songs/x/audio-2.ogg가 된 뒤 other.ogg로 바꾸고 변경 취소하면 songs/x/audio-2.ogg를 다시 불러온다', async () => {
    const { audio, playback, reloadSavedAudio, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    savedAudioBecomes('songs/x/audio-2.ogg');
    await pickAndLoad('other.ogg');

    discard(audio, playback);

    expect(store().chart.meta.audioFile).toBe('songs/x/audio-2.ogg');
    expect(reloadSavedAudio).toHaveBeenCalledExactlyOnceWith('songs/x/audio-2.ogg');
  });

  it('제목만 바꾼 채 next.ogg를 불러오는 중 변경 취소하면 로드를 버려 늦게 끝나도 적용하지 않고 120초 버퍼에 머문다', async () => {
    const { audio, playback, loads } = harness();
    store().applyMetaEdit({ title: '새 제목' });
    const picking = audio.pick(playback, new File(['a'], 'next.ogg'));

    expect(audio.discard(playback)).toBe(true);
    await loads.get('next.ogg')!();
    await picking;

    expect(store().song?.pendingAudioFile).toBeNull();
    expect(playback.audioBufferData).toBe(savedBuffer);
    expect(store().isLoadingSongAudio).toBe(false);
  });

  it('오프셋을 바꾼 채 재생 중이라 변경 취소가 막히면 false를 돌려주고 불러오는 중인 next.ogg 선택은 그대로 적용한다', async () => {
    const { audio, playback, loads } = harness();
    store().setChart({ ...store().chart, meta: { ...store().chart.meta, offsetMs: 45 } });
    const picking = audio.pick(playback, new File(['a'], 'next.ogg'));
    useEditorStore.setState({ isPlaying: true });

    expect(audio.discard(playback)).toBe(false);
    await loads.get('next.ogg')!();
    await picking;

    expect(store().song).toMatchObject({ duration: 5, pendingAudioFile: { name: 'next.ogg' } });
  });

  it('음원을 바꾸지 않고 제목만 바꾼 변경 취소는 재생기 음원을 건드리지 않는다', () => {
    const { audio, playback, reloadSavedAudio } = harness();
    store().applyMetaEdit({ title: '새 제목' });

    discard(audio, playback);

    expect(playback.audioBufferData).toBe(savedBuffer);
    expect(playback.restoreAudioBuffer).not.toHaveBeenCalled();
    expect(playback.clearAudio).not.toHaveBeenCalled();
    expect(reloadSavedAudio).not.toHaveBeenCalled();
  });
});

/** 곡 저장이 끝난 상태를 흉내 낸다: 대기 음원을 올린 경로가 저장된 음원이 되고 대기 파일이 비워진다. */
function savedAudioBecomes(audioUrl: string) {
  const song = store().song!;
  store().completeSongSave(song, { ...songValues(store().chart, song), audioUrl }, 43);
}
