import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEditorChartAsset } from './chartAssetLoad';
import { createDrawerSongAudio, type DrawerSongAudioPlayback } from './drawerSongAudio';
import type { MetaAudioPick } from './metaAudioSession';
import { openEditorChart } from './openEditorChart';
import { toSavedChartJson } from './savedChart';
import { discardSongInfoChanges, editSongAudio } from './songInfoEditing';
import { createSongAudioId, songDraftOf, songValues } from './songState';
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

/** 재생기처럼 로드에 성공하면 버퍼를 바꾸고, restoreAudioBuffer·cancelAudioLoad·clearAudio는 진행 중인 로드를 버린다. */
function harness(initialBuffer: AudioBuffer | null = savedBuffer) {
  const loads = new Map<string, () => Promise<void>>();
  let generation = 0;
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
        }
        resolve();
      });
    })),
    restoreAudioBuffer: vi.fn((buffer: AudioBuffer) => { generation++; playback.buffer = buffer; }),
    cancelAudioLoad: vi.fn(() => { generation++; }),
    clearAudio: vi.fn(() => { generation++; playback.buffer = null; }),
  };
  const state = { pick: null as MetaAudioPick | null, shown: initialBuffer as AudioBuffer | null };
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

/** 곡 정보 변경 취소를 실행하고 드로어 음원에 그 결과를 넘긴다(에디터 페이지의 변경 취소와 같은 순서). */
function discard(audio: ReturnType<typeof harness>['audio'], playback: DrawerSongAudioPlayback) {
  const result = discardSongInfoChanges();
  expect(result.discarded).toBe(true);
  void audio.sync(playback, store());
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, loadedSong), loadedSong);
});

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
});

describe('곡 정보 변경 취소 뒤 재생기 음원', () => {
  it('저장된 120초 audio.ogg 위에서 next.ogg(5초)를 적용하고 변경 취소하면 다시 받지 않고 재생기를 120초 버퍼로 되돌린다', async () => {
    const { audio, playback, reloadSavedAudio, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    expect(playback.audioBufferData?.duration).toBe(5);

    discard(audio, playback);

    expect(playback.restoreAudioBuffer).toHaveBeenCalledExactlyOnceWith(savedBuffer);
    expect(playback.audioBufferData).toBe(savedBuffer);
    expect(reloadSavedAudio).not.toHaveBeenCalled();
    expect(playback.clearAudio).not.toHaveBeenCalled();
  });

  it('next.ogg를 적용한 뒤 other.ogg로 다시 바꾸고 변경 취소해도 처음 저장된 120초 버퍼로 되돌린다', async () => {
    const { audio, playback, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    await pickAndLoad('other.ogg');

    discard(audio, playback);

    expect(playback.audioBufferData).toBe(savedBuffer);
  });

  it('next.ogg를 적용하고 other.ogg를 불러오는 중에 변경 취소하면 늦게 끝난 other도 반영하지 않고 120초 버퍼로 되돌린다', async () => {
    const { audio, playback, loads, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    const picking = audio.pick(playback, new File(['a'], 'other.ogg'));

    discard(audio, playback);
    await loads.get('other.ogg')!();
    await picking;

    expect(playback.audioBufferData).toBe(savedBuffer);
    expect(store().isLoadingSongAudio).toBe(false);
    expect(store().song?.pendingAudioFile).toBeNull();
  });

  it('바꾸기 전 재생기에 음원이 없었으면(저장된 audio.ogg를 못 불러옴) 변경 취소가 재생기 음원을 비워 next로 재생할 수 없게 하고 audio.ogg를 다시 불러온다', async () => {
    const { audio, playback, state, reloadSavedAudio, pickAndLoad } = harness(null);
    await pickAndLoad('next.ogg');

    discard(audio, playback);

    expect(playback.clearAudio).toHaveBeenCalledOnce();
    expect(playback.audioBufferData).toBeNull();
    expect(state.shown).toBeNull();
    expect(reloadSavedAudio).toHaveBeenCalledExactlyOnceWith('audio.ogg');
  });

  it('대기 음원 next.ogg가 남은 채 페이지를 다시 열어(새 세션) 변경 취소하면 재생기의 next를 비우고 audio.ogg를 다시 불러온다', () => {
    const next = new File(['a'], 'next.ogg');
    editSongAudio(next, 5, createSongAudioId());
    const { audio, playback, reloadSavedAudio } = harness(bufferOf(next));

    discard(audio, playback);

    expect(playback.audioBufferData).toBeNull();
    expect(reloadSavedAudio).toHaveBeenCalledExactlyOnceWith('audio.ogg');
  });

  it('저장된 곡에 음원이 없고 next.ogg를 적용한 뒤 변경 취소하면 재생기 음원을 비우고 다시 불러올 음원은 없다', async () => {
    const silent = { ...loadedSong, audioUrl: '', duration: null };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, silent), silent);
    const { audio, playback, reloadSavedAudio, pickAndLoad } = harness(null);
    await pickAndLoad('next.ogg');

    discard(audio, playback);

    expect(playback.audioBufferData).toBeNull();
    expect(reloadSavedAudio).not.toHaveBeenCalled();
  });

  it('곡 저장으로 next.ogg가 저장된 음원 songs/x/audio-2.ogg가 된 뒤 other.ogg로 바꾸고 변경 취소하면 next의 5초 버퍼로 되돌린다', async () => {
    const { audio, playback, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    const nextBuffer = playback.audioBufferData;
    savedAudioBecomes('songs/x/audio-2.ogg');
    await pickAndLoad('other.ogg');

    discard(audio, playback);

    expect(playback.audioBufferData).toBe(nextBuffer);
    expect(store().chart.meta.audioFile).toBe('songs/x/audio-2.ogg');
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
  store().completeSongSave(songDraftOf(song), { ...songValues(store().chart, song), audioUrl }, 43);
}

describe('음원 id를 따르는 Undo·Redo 재생기 동기화', () => {
  it('5초 B를 고른 뒤 Undo하면 120초 A 버퍼를 디코딩 없이 복원하고 Redo하면 B 버퍼를 복원한다', async () => {
    const { audio, playback, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    const next = playback.audioBufferData;
    store().undo();
    await audio.sync(playback, store());
    expect(playback.audioBufferData).toBe(savedBuffer);
    store().redo();
    await audio.sync(playback, store());
    expect(playback.audioBufferData).toBe(next);
    expect(playback.loadAudioFile).toHaveBeenCalledTimes(1);
  });

  it('B 적용 후 C 로드 중 Undo로 A를 복원하면 늦게 끝난 C 로드가 A의 120초 길이로 적용되지 않는다', async () => {
    const { audio, playback, loads, pickAndLoad } = harness();
    await pickAndLoad('next.ogg');
    const picking = audio.pick(playback, new File(['C'], 'C.ogg'));
    store().undo();
    await audio.sync(playback, store());
    const restored = store().song;
    await loads.get('C.ogg')!();
    await picking;
    expect(playback.audioBufferData).toBe(savedBuffer);
    expect(store().song).toBe(restored);
    expect(store().song?.pendingAudioFile).toBeNull();
    expect(store().isLoadingSongAudio).toBe(false);
  });
});

it('B.ogg→C.ogg 뒤 재마운트하고 Undo하면 캐시 없는 B의 대기 File을 로드하는 동안 Save 잠금이 켜진다', async () => {
  const fileB = new File(['B'], 'B.ogg');
  editSongAudio(fileB, 30, createSongAudioId());
  editSongAudio(new File(['C'], 'C.ogg'), 30, createSongAudioId());
  const { audio, playback, loads } = harness({ duration: 30 } as AudioBuffer);
  store().undo();
  const syncing = audio.sync(playback, store());
  expect(store().isLoadingSongAudio).toBe(true);
  expect(playback.loadAudioFile).toHaveBeenCalledExactlyOnceWith(fileB);
  await loads.get('B.ogg')!();
  await syncing;
  expect(store().isLoadingSongAudio).toBe(false);
  expect(playback.audioBufferData?.duration).toBe(30);
  expect(store().song?.pendingAudioFile).toBe(fileB);
});

it('A→B→C→D의 4개 버퍼 중 최근 3개만 유지해 C·B는 바로 복원하고 A는 URL로 요청하며 현재 B 버퍼도 다시 쓸 수 있다', async () => {
  const { audio, playback, pickAndLoad, reloadSavedAudio } = harness();
  await pickAndLoad('B.ogg');
  const b = playback.audioBufferData;
  await pickAndLoad('C.ogg');
  const c = playback.audioBufferData;
  await pickAndLoad('D.ogg');
  store().undo(); await audio.sync(playback, store());
  expect(playback.audioBufferData).toBe(c);
  store().undo(); await audio.sync(playback, store());
  expect(playback.audioBufferData).toBe(b);
  expect(playback.loadAudioFile).toHaveBeenCalledTimes(3);
  store().undo(); await audio.sync(playback, store());
  expect(playback.audioBufferData).toBeNull();
  expect(reloadSavedAudio).toHaveBeenCalledExactlyOnceWith('audio.ogg');
  store().redo(); await audio.sync(playback, store());
  expect(playback.audioBufferData).toBe(b);
  expect(playback.loadAudioFile).toHaveBeenCalledTimes(3);
});

it('차트 로드 세대가 바뀌면 캐시를 비우고 새 곡 id를 채택하되 음원 로드·복원·비우기는 0회다', async () => {
  const { audio, playback, pickAndLoad } = harness();
  await pickAndLoad('B.ogg');
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, loadedSong), loadedSong);
  await audio.sync(playback, store());
  expect(playback.loadAudioFile).toHaveBeenCalledTimes(1);
  expect(playback.restoreAudioBuffer).not.toHaveBeenCalled();
  expect(playback.clearAudio).not.toHaveBeenCalled();
});

it('캐시에 B·C·D가 있고 URL로 A를 불러온 뒤 가장 오래된 B로 복원하면 A를 기억하면서도 B는 다시 디코딩하지 않는다', async () => {
  const a = store();
  const { audio, playback, pickAndLoad } = harness();
  await pickAndLoad('B.ogg');
  const b = store();
  const bBuffer = playback.audioBufferData;
  await pickAndLoad('C.ogg');
  await pickAndLoad('D.ogg');
  // 마지막 유효 상태 복원처럼 중간 음원을 거치지 않고 A로 돌아온다.
  useEditorStore.setState({ chart: a.chart, song: a.song });
  await audio.sync(playback, store());
  playback.buffer = savedBuffer;
  useEditorStore.setState({ chart: b.chart, song: b.song });
  const syncing = audio.sync(playback, store());
  expect(playback.loadAudioFile).toHaveBeenCalledTimes(3);
  expect(playback.audioBufferData).toBe(bBuffer);
  await syncing;
});
