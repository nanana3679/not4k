import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../shared';
import { loadEditorChartAsset } from './chartAssetLoad';
import { openEditorChart } from './openEditorChart';
import { isChartDirty, toSavedChartJson } from './savedChart';
import { createSongAudioId, isSongDirty, songValues } from './songState';
import type { ChartDocument } from '../shared';
import type { LoadedSongSharedData } from '../supabase/songSharedData';
import { useEditorStore } from './stores/editorStore';
import { AUDIO_RANGE_RESET_COPY, PAUSE_TO_EDIT_COPY } from './editorCopy';
import {
  discardSongInfoChanges,
  editAudioOffset,
  editGameplayRange,
  editPreviewRange,
  editSongArtist,
  editSongAudio,
  editSongJacket,
  editSongTitle,
  pickMetaAudio,
} from './songInfoEditing';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../shared/toast', () => ({ showToast }));

const store = () => useEditorStore.getState();
const base = useEditorStore.getInitialState().chart;
const loadedSong = { title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: 'audio.ogg',
  previewUrl: null, previewStart: 10, previewEnd: 20, duration: 120,
  gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null,
  timing: null, revision: 42 };
const songDirty = () => isSongDirty(store().chart, store().song);
const chartDirty = () => isChartDirty(store().chart, store().extraLaneCount, store().savedChartJson, store().song !== null);
const tap = { type: 'tap' as const, kind: 'single' as const, lane: 1, beat: beat(2) };

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  vi.restoreAllMocks();
  showToast.mockClear();
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, loadedSong), loadedSong);
});

describe('드로어의 곡 표시 정보 편집', () => {
  it('제목 곡→새 제목·아티스트 작곡가→새 작곡가를 적용하면 곡만 미저장이고 차트는 깨끗하다', () => {
    editSongTitle('새 제목');
    editSongArtist('새 작곡가');

    expect(store().chart.meta).toMatchObject({ title: '새 제목', artist: '새 작곡가' });
    expect(songDirty()).toBe(true);
    expect(chartDirty()).toBe(false);
  });

  it('같은 제목 곡을 다시 적용하면 이력을 남기지 않는다', () => {
    editSongTitle('곡');

    expect(store().historyPast).toHaveLength(0);
  });

  it('자켓 next.png를 고르면 대기 자켓 파일로 남아 곡이 미저장이다', () => {
    const jacket = new File(['j'], 'next.png');
    editSongJacket(jacket);

    expect(store().song?.pendingJacketFile).toBe(jacket);
    expect(songDirty()).toBe(true);
  });

  it('자켓 next.png 선택은 Undo 1회로 대기 파일을 비우고 Redo 1회로 같은 File을 복원한다', () => {
    const jacket = new File(['j'], 'next.png');
    editSongJacket(jacket);
    expect(store().historyPast).toHaveLength(1);
    store().undo();
    expect(store().song?.pendingJacketFile).toBeNull();
    store().redo();
    expect(store().song?.pendingJacketFile).toBe(jacket);
  });
});

describe('드로어의 오프셋 편집(재생 중 제한, RFD 0099)', () => {
  it('정지 중 오프셋 0→45를 적용하면 차트 오프셋이 45가 되고 true다', () => {
    expect(editAudioOffset(45)).toBe(true);

    expect(store().chart.meta.offsetMs).toBe(45);
    expect(songDirty()).toBe(true);
  });

  it('재생 중 오프셋 0→45는 바꾸지 않고 정지 안내를 한 번 띄우며 false다', () => {
    store().setIsPlaying(true);

    expect(editAudioOffset(45)).toBe(false);

    expect(store().chart.meta.offsetMs).toBe(0);
    expect(store().historyPast).toHaveLength(0);
    expect(showToast).toHaveBeenCalledExactlyOnceWith(PAUSE_TO_EDIT_COPY, 'warn');
  });

  it('재생 중 같은 오프셋 0을 다시 적용하면 안내 없이 true다', () => {
    store().setIsPlaying(true);

    expect(editAudioOffset(0)).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('드로어의 음원·구간 편집', () => {
  it('180초 A의 프리뷰 150～165초에서 120초 B로 교체하면 Undo 1회로 A의 음원·구간·id를 복원하고 Redo로 B를 복원한다', () => {
    const saved = { ...loadedSong, audioUrl: 'A.ogg', duration: 180, previewStart: 150, previewEnd: 165,
      gameplayStart: 2, gameplayEnd: 175, gameplayFadeIn: 1, gameplayFadeOut: 2 };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, saved), saved);
    const before = store().song;
    const file = new File(['B'], 'B.ogg');
    const audioId = createSongAudioId();
    editSongAudio(file, 120, audioId);
    const after = store().song;
    expect(store().historyPast).toHaveLength(1);
    expect(after).toMatchObject({ audioId, duration: 120, pendingAudioFile: file,
      gameplayRange: { startTime: 0, endTime: 120 }, pendingPreviewRange: { startTime: 30, endTime: 45 } });
    store().undo();
    expect(store().chart.meta).toMatchObject({ audioFile: 'A.ogg', previewStart: 150, previewEnd: 165 });
    expect(store().song).toEqual(before);
    store().redo();
    expect(store().chart.meta).toMatchObject({ audioFile: 'B.ogg', previewStart: 30, previewEnd: 45 });
    expect(store().song).toEqual(after);
    expect(store().song?.pendingAudioFile).toBe(file);
  });

  it('음원 B 교체 100ms 뒤 노트 1개를 놓으면 Undo 1회는 노트만 지우고 2회는 A로 돌아간다', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    editSongAudio(new File(['B'], 'B.ogg'), 120, createSongAudioId());
    now.mockReturnValue(1100);
    store().setChart({ ...store().chart, notes: [tap] });
    expect(store().historyPast).toHaveLength(2);
    store().undo();
    expect(store().chart.notes).toEqual([]);
    expect(store().chart.meta.audioFile).toBe('B.ogg');
    store().undo();
    expect(store().chart.meta.audioFile).toBe('audio.ogg');
    now.mockRestore();
  });

  it('120초 곡의 프리뷰 10～20초에서 5초 음원 next.ogg를 적용하면 경로·대기 파일·길이 5와 곡 전체인 프리뷰 0～5초·인게임 0～5초를 함께 적용한다', () => {
    const audio = new File(['a'], 'next.ogg');
    editSongAudio(audio, 5, createSongAudioId());

    expect(store().chart.meta).toMatchObject({ audioFile: 'next.ogg', previewStart: 0, previewEnd: 5 });
    expect(store().song).toMatchObject({ duration: 5, pendingAudioFile: audio,
      pendingPreviewRange: { startTime: 0, endTime: 5, fadeInTime: 0.5, fadeOutTime: 0.5 },
      gameplayRange: { startTime: 0, endTime: 5, fadeInTime: 0, fadeOutTime: 0 } });
  });

  it('프리뷰 30～40초·페이드 1초를 적용하면 차트 프리뷰 구간과 대기 구간의 페이드를 함께 바꾼다', () => {
    const range = { startTime: 30, endTime: 40, fadeInTime: 1, fadeOutTime: 1 };
    editPreviewRange(range);

    expect(store().chart.meta).toMatchObject({ previewStart: 30, previewEnd: 40 });
    expect(store().song?.pendingPreviewRange).toEqual(range);
    expect(songDirty()).toBe(true);
  });

  it.each([
    ['프리뷰 페이드 0→1초', editPreviewRange, 'pendingPreviewRange'],
    ['인게임 구간 10～20초', editGameplayRange, 'gameplayRange'],
  ] as const)('%s 변경은 Undo 1회로 null을 복원하고 Redo 1회로 구간을 다시 적용한다', (_, edit, key) => {
    const range = { startTime: 10, endTime: 20, fadeInTime: 1, fadeOutTime: 1 };
    edit(range);
    expect(store().historyPast).toHaveLength(1);
    expect(store().song?.[key]).toEqual(range);
    store().undo();
    expect(store().song?.[key]).toBeNull();
    store().redo();
    expect(store().song?.[key]).toEqual(range);
  });

  it('인게임 구간 2～110초·페이드 1초를 적용하면 곡의 플레이 구간이 바뀌어 미저장이다', () => {
    editGameplayRange({ startTime: 2, endTime: 110, fadeInTime: 1, fadeOutTime: 1 });

    expect(store().song?.gameplayRange).toEqual({ startTime: 2, endTime: 110, fadeInTime: 1, fadeOutTime: 1 });
    expect(songDirty()).toBe(true);
  });
});

describe('음원을 바꿀 때 구간마다 유지하거나 기본값으로 돌림', () => {
  /** 180초 음원에 프리뷰·인게임 구간을 저장한 곡을 연다. 기본은 프리뷰 60～75초·인게임 5～170초·페이드 1·2초다. */
  function openSong(row: Partial<LoadedSongSharedData> = {}) {
    const saved: LoadedSongSharedData = { ...loadedSong, audioUrl: 'A.ogg', duration: 180, previewStart: 60, previewEnd: 75,
      gameplayStart: 5, gameplayEnd: 170, gameplayFadeIn: 1, gameplayFadeOut: 2, ...row };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, saved), saved);
  }
  const replaceAudio = (duration: number) => editSongAudio(new File(['B'], 'B.ogg'), duration, createSongAudioId());
  const ranges = () => ({ previewStart: store().chart.meta.previewStart, previewEnd: store().chart.meta.previewEnd,
    pendingPreviewRange: store().song?.pendingPreviewRange, gameplayRange: store().song?.gameplayRange });

  it('프리뷰 60～75초·인게임 5～170초를 180초 음원으로 바꾸면 두 구간과 인게임 페이드 1·2초를 유지하고 알리지 않는다', () => {
    openSong();
    replaceAudio(180);

    expect(ranges()).toEqual({ previewStart: 60, previewEnd: 75,
      pendingPreviewRange: { startTime: 60, endTime: 75, fadeInTime: 0.5, fadeOutTime: 0.5 },
      gameplayRange: { startTime: 5, endTime: 170, fadeInTime: 1, fadeOutTime: 2 } });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('프리뷰 페이드 1·2초로 고른 프리뷰 60～75초를 180초 음원으로 바꾸면 고른 페이드까지 유지한다', () => {
    openSong();
    const range = { startTime: 60, endTime: 75, fadeInTime: 1, fadeOutTime: 2 };
    editPreviewRange(range);
    replaceAudio(180);

    expect(store().song?.pendingPreviewRange).toEqual(range);
  });

  it('프리뷰 60～75초·인게임 5～170초를 70초 음원으로 바꾸면 17.5～32.5초·0～70초로 돌리고 두 구간을 한 번에 알린다', () => {
    openSong();
    replaceAudio(70);

    expect(ranges()).toEqual({ previewStart: 17.5, previewEnd: 32.5,
      pendingPreviewRange: { startTime: 17.5, endTime: 32.5, fadeInTime: 0.5, fadeOutTime: 0.5 },
      gameplayRange: { startTime: 0, endTime: 70, fadeInTime: 0, fadeOutTime: 0 } });
    expect(showToast).toHaveBeenCalledExactlyOnceWith(AUDIO_RANGE_RESET_COPY.both, 'warn');
  });

  it('프리뷰 60～75초·인게임 5～170초를 50초 음원으로 바꾸면 12.5～27.5초·0～50초로 돌린다', () => {
    openSong();
    replaceAudio(50);

    expect(ranges()).toMatchObject({ previewStart: 12.5, previewEnd: 27.5,
      gameplayRange: { startTime: 0, endTime: 50, fadeInTime: 0, fadeOutTime: 0 } });
  });

  it('프리뷰 60～75초·인게임 5～60초를 70초 음원으로 바꾸면 프리뷰만 17.5～32.5초로 돌리고 프리뷰만 알린다', () => {
    openSong({ gameplayEnd: 60 });
    replaceAudio(70);

    expect(ranges()).toMatchObject({ previewStart: 17.5, previewEnd: 32.5,
      gameplayRange: { startTime: 5, endTime: 60, fadeInTime: 1, fadeOutTime: 2 } });
    expect(showToast).toHaveBeenCalledExactlyOnceWith(AUDIO_RANGE_RESET_COPY.preview, 'warn');
  });

  it('프리뷰 10～25초·인게임 5～170초를 70초 음원으로 바꾸면 인게임만 0～70초로 돌리고 인게임만 알린다', () => {
    openSong({ previewStart: 10, previewEnd: 25 });
    replaceAudio(70);

    expect(ranges()).toMatchObject({ previewStart: 10, previewEnd: 25,
      gameplayRange: { startTime: 0, endTime: 70, fadeInTime: 0, fadeOutTime: 0 } });
    expect(showToast).toHaveBeenCalledExactlyOnceWith(AUDIO_RANGE_RESET_COPY.gameplay, 'warn');
  });

  it('저장된 프리뷰·인게임 구간이 없는 곡에 120초 음원을 넣으면 기본값 30～45초·0～120초를 쓰고 알리지 않는다', () => {
    openSong({ previewStart: null, previewEnd: null, gameplayStart: null, gameplayEnd: null,
      gameplayFadeIn: null, gameplayFadeOut: null });
    replaceAudio(120);

    expect(ranges()).toMatchObject({ previewStart: 30, previewEnd: 45, gameplayRange: { startTime: 0, endTime: 120 } });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('프리뷰 60～75초·인게임 5～170초를 70초 음원으로 바꾼 뒤 Undo 1회면 음원 A·프리뷰·인게임·페이드를 한 번에 복원하고 Redo 1회면 B와 돌린 구간을 복원한다', () => {
    openSong();
    const beforeSong = store().song;
    const beforeRanges = ranges();
    replaceAudio(70);
    const afterSong = store().song;
    expect(store().historyPast).toHaveLength(1);

    store().undo();
    expect(store().chart.meta.audioFile).toBe('A.ogg');
    expect(ranges()).toEqual(beforeRanges);
    expect(store().song).toEqual(beforeSong);
    expect(store().historyPast).toHaveLength(0);

    store().redo();
    expect(store().chart.meta).toMatchObject({ audioFile: 'B.ogg', previewStart: 17.5, previewEnd: 32.5 });
    expect(store().song).toEqual(afterSong);
  });

  it('음원 교체가 Undo로 돌아와도 돌린 구간 안내는 교체 때 한 번뿐이다', () => {
    openSong();
    replaceAudio(70);
    store().undo();
    store().redo();

    expect(showToast).toHaveBeenCalledExactlyOnceWith(AUDIO_RANGE_RESET_COPY.both, 'warn');
  });

  it('역전 restZone이 남아 70초 음원 적용이 구조 위반으로 거부되면 구간·이력이 그대로이고 구간 안내를 띄우지 않는다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    openSong();
    useEditorStore.setState({ chart: { ...store().chart, restZones: [{ lane: 1, beat: beat(1), endBeat: beat(0) }] } });
    const before = ranges();

    replaceAudio(70);

    expect(ranges()).toEqual(before);
    expect(store().historyPast).toHaveLength(0);
    expect(showToast).toHaveBeenCalledOnce();
    expect(showToast).not.toHaveBeenCalledWith(AUDIO_RANGE_RESET_COPY.both, 'warn');
  });
});

describe('곡 행이 없는 차트의 Meta에서 고른 음원의 구간 안내', () => {
  const gameplay = { startTime: 5, endTime: 170, fadeInTime: 0, fadeOutTime: 0 };
  const file = new File(['B'], 'B.ogg');
  const playbackOf = (duration: number) => ({ audioBufferData: { duration } as AudioBuffer }) as Parameters<typeof pickMetaAudio>[1];
  const sessionOf = (status: 'loaded' | 'failed' | null) => ({ load: vi.fn(async () => status) });

  beforeEach(() => {
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null));
    store().applyMetaEdit({ previewStart: 60, previewEnd: 75 });
  });

  it('프리뷰 60～75초·인게임 5～170초에 70초 음원을 불러오면 두 구간 안내를 한 번 띄운다', async () => {
    const session = sessionOf('loaded');
    const playback = playbackOf(70);
    await pickMetaAudio(session, playback, file, gameplay);

    expect(session.load).toHaveBeenCalledExactlyOnceWith(playback, file);
    expect(showToast).toHaveBeenCalledExactlyOnceWith(AUDIO_RANGE_RESET_COPY.both, 'warn');
  });

  it('프리뷰 60～75초·인게임 5～60초에 70초 음원을 불러오면 프리뷰 안내만 띄운다', async () => {
    await pickMetaAudio(sessionOf('loaded'), playbackOf(70), file, { ...gameplay, endTime: 60 });

    expect(showToast).toHaveBeenCalledExactlyOnceWith(AUDIO_RANGE_RESET_COPY.preview, 'warn');
  });

  it('프리뷰 60～75초·인게임 5～170초에 180초 음원을 불러오면 두 구간이 들어가 안내가 없다', async () => {
    await pickMetaAudio(sessionOf('loaded'), playbackOf(180), file, gameplay);

    expect(showToast).not.toHaveBeenCalled();
  });

  it.each(['failed', null] as const)('음원 로드 결과가 %s이면 재생기가 70초여도 구간 안내를 띄우지 않는다', async status => {
    await pickMetaAudio(sessionOf(status), playbackOf(70), file, gameplay);

    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('곡 정보 변경 취소(RFD 0098)', () => {
  it('음원 B·인게임 3～100초를 변경 취소한 뒤 Undo→Redo→Undo하면 초안을 복원·취소·복원하고 드로어 요청은 1→1→2다', () => {
    editSongAudio(new File(['B'], 'B.ogg'), 120, createSongAudioId());
    editGameplayRange({ startTime: 3, endTime: 100, fadeInTime: 1, fadeOutTime: 2 });
    const before = store().song;
    discardSongInfoChanges();
    expect(store().song?.pendingAudioFile).toBeNull();
    store().undo();
    expect(store().song).toEqual(before);
    expect(store().songInfoReopenRequest).toBe(1);
    store().redo();
    expect(store().song?.pendingAudioFile).toBeNull();
    expect(store().song?.gameplayRange).toBeNull();
    expect(store().songInfoReopenRequest).toBe(1);
    store().undo();
    expect(store().song).toEqual(before);
    expect(store().songInfoReopenRequest).toBe(2);
  });

  it('제목 변경→100ms 뒤 변경 취소→100ms 뒤 노트 1개 배치는 서로 합치지 않아 Undo 3회로 초기 상태가 된다', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    editSongTitle('새 제목');
    now.mockReturnValue(1100);
    discardSongInfoChanges();
    now.mockReturnValue(1200);
    store().setChart({ ...store().chart, notes: [tap] });
    expect(store().historyPast).toHaveLength(3);
    store().undo();
    expect(store().chart.notes).toEqual([]);
    expect(store().chart.meta.title).toBe('곡');
    store().undo();
    expect(store().chart.meta.title).toBe('새 제목');
    store().undo();
    expect(store().chart.meta.title).toBe('곡');
  });

  it('제목·오프셋 45를 바꾸고 1레인 2박 노트를 놓은 뒤 변경 취소하면 곡은 깨끗하고 노트는 남아 차트만 미저장이다', () => {
    editSongTitle('새 제목');
    editAudioOffset(45);
    store().setChart({ ...store().chart, notes: [tap] });

    expect(discardSongInfoChanges()).toEqual({ discarded: true });

    expect(store().chart.meta).toMatchObject({ title: '곡', offsetMs: 0 });
    expect(store().chart.notes).toEqual([tap]);
    expect(songDirty()).toBe(false);
    expect(chartDirty()).toBe(true);
  });

  it('변경 취소는 Undo 한 번에 새 제목·오프셋 45로 돌아오고 Redo하면 다시 저장한 곡 정보가 된다', () => {
    editSongTitle('새 제목');
    editAudioOffset(45);
    discardSongInfoChanges();

    store().undo();
    expect(store().chart.meta).toMatchObject({ title: '새 제목', offsetMs: 45 });
    expect(songDirty()).toBe(true);

    store().redo();
    expect(store().chart.meta).toMatchObject({ title: '곡', offsetMs: 0 });
    expect(songDirty()).toBe(false);
  });

  it('재생 중 오프셋 45의 변경 취소는 막고 정지 안내를 띄우며 값·이력을 바꾸지 않는다', () => {
    editAudioOffset(45);
    const historyLength = store().historyPast.length;
    store().setIsPlaying(true);

    expect(discardSongInfoChanges()).toEqual({ discarded: false });

    expect(store().chart.meta.offsetMs).toBe(45);
    expect(store().historyPast).toHaveLength(historyLength);
    expect(showToast).toHaveBeenLastCalledWith(PAUSE_TO_EDIT_COPY, 'warn');
  });

  it('재생 중이라도 제목만 바꾼 변경 취소는 타이밍을 건드리지 않아 실행한다', () => {
    editSongTitle('새 제목');
    store().setIsPlaying(true);

    expect(discardSongInfoChanges().discarded).toBe(true);
    expect(store().chart.meta.title).toBe('곡');
  });

  it('저장된 곡에 음원이 없으면 next.ogg를 바꾼 변경 취소는 빈 경로로 돌아간다', () => {
    const silent = { ...loadedSong, audioUrl: '', duration: null };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, silent), silent);
    editSongAudio(new File(['a'], 'next.ogg'), 5, createSongAudioId());

    expect(discardSongInfoChanges()).toEqual({ discarded: true });
    expect(store().chart.meta.audioFile).toBe('');
  });

  it('음원 next.ogg를 바꿨으면 변경 취소가 대기 파일을 비우고 저장된 음원 audio.ogg로 돌아간다', () => {
    editSongAudio(new File(['a'], 'next.ogg'), 5, createSongAudioId());

    expect(discardSongInfoChanges()).toEqual({ discarded: true });
    expect(store().song).toMatchObject({ pendingAudioFile: null, duration: 120 });
    expect(store().chart.meta).toMatchObject({ audioFile: 'audio.ogg', previewStart: 10, previewEnd: 20 });
    expect(songDirty()).toBe(false);
  });

  it('곡 정보 변경이 없으면 변경 취소해도 이력을 남기지 않는다', () => {
    store().setChart({ ...store().chart, notes: [tap] }, { separateHistory: true });

    discardSongInfoChanges();

    expect(store().historyPast).toHaveLength(1);
  });

  it('저장 음원 250초·프리뷰 10～20초에서 265초 음원을 고르고 프리뷰 250～265초·새 제목을 적용한 뒤 변경 취소하고 Undo하면 제목·프리뷰 250～265초·대기 음원·길이 265초가 돌아온다', () => {
    const saved = { ...loadedSong, duration: 250 };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, saved), saved);
    editSongAudio(new File(['a'], 'long.ogg'), 265, createSongAudioId());
    editPreviewRange({ startTime: 250, endTime: 265, fadeInTime: 1, fadeOutTime: 1 });
    editSongTitle('새 제목');
    discardSongInfoChanges();

    store().undo();

    expect(store().chart.meta).toMatchObject({ title: '새 제목', audioFile: 'long.ogg', previewStart: 250, previewEnd: 265 });
    expect(store().song).toMatchObject({ duration: 265, pendingAudioFile: { name: 'long.ogg' }, pendingPreviewRange: { startTime: 250, endTime: 265 } });
    const values = songValues(store().chart, store().song!);
    expect(values.previewEnd).toBeLessThanOrEqual(values.duration!);
  });

  it('프리뷰만 30～40초로 바꾼 뒤 변경 취소하면 프리뷰 10～20초로 돌아가고 Undo 이력 1개를 더 남긴다', () => {
    editPreviewRange({ startTime: 30, endTime: 40, fadeInTime: 0.5, fadeOutTime: 0.5 });
    const historyLength = store().historyPast.length;

    expect(discardSongInfoChanges().discarded).toBe(true);

    expect(store().chart.meta).toMatchObject({ previewStart: 10, previewEnd: 20 });
    expect(store().historyPast).toHaveLength(historyLength + 1);
    expect(songDirty()).toBe(false);
  });

  it('곡 행 없이 연 차트는 변경 취소할 곡 정보가 없어 아무것도 바꾸지 않는다', () => {
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null));
    store().setChart({ ...store().chart, meta: { ...store().chart.meta, title: '새 제목' } });

    expect(discardSongInfoChanges()).toEqual({ discarded: false });
    expect(store().chart.meta.title).toBe('새 제목');
  });
});

describe('곡 정보 변경 취소의 타이밍 이벤트 자리와 선택(RFD 0098)', () => {
  const bpmAt4 = { type: 'bpm' as const, beat: beat(4), bpm: 150, editorLane: 3 };
  const auto = { type: 'auto' as const, beat: beat(0), endBeat: beat(4), editorLane: 4 };
  /** 0박 BPM·박자(보조 레인 1·2)에 4박 BPM 150(보조 레인 3)과 auto 이벤트(보조 레인 4)를 저장한 곡을 연다. */
  function openWithBpmAt4() {
    const chart: ChartDocument = { ...base, events: [...base.events, bpmAt4, auto] };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(chart, 2).chartJson, null, loadedSong), loadedSong);
  }
  const bpmEvents = () => store().chart.events.filter(event => event.type === 'bpm')
    .map(event => ({ beat: event.beat.n / event.beat.d, editorLane: event.editorLane }));

  it('저장한 4박 BPM(보조 레인 3)을 8박으로 옮긴 뒤 변경 취소하면 4박 BPM이 기본 레인 1이 아니라 저장된 레인 3으로 돌아온다', () => {
    openWithBpmAt4();
    store().setChart({ ...store().chart, events: store().chart.events.map(event =>
      event.type === 'bpm' && event.beat.n === 4 ? { ...event, beat: beat(8) } : event) });

    discardSongInfoChanges();

    expect(bpmEvents()).toEqual([{ beat: 0, editorLane: 1 }, { beat: 4, editorLane: 3 }]);
  });

  it('저장한 4박 BPM을 지우고 auto 이벤트(index 2)를 고른 뒤 변경 취소하면 4박 BPM이 앞에 돌아와도 선택은 같은 auto 이벤트(index 3)를 가리킨다', () => {
    openWithBpmAt4();
    store().setChart({ ...store().chart, events: store().chart.events.filter(event => event !== store().chart.events
      .find(e => e.type === 'bpm' && e.beat.n === 4)) });
    const autoIndex = store().chart.events.findIndex(event => event.type === 'auto');
    store().setSelection({ notes: new Set(), zones: new Set(), restZones: new Set(), events: new Set([autoIndex]) });
    expect(autoIndex).toBe(2);

    discardSongInfoChanges();

    const selected = [...store().selection.events];
    expect(selected).toEqual([3]);
    expect(store().chart.events[selected[0]].type).toBe('auto');
  });
});

it('BPM 120→180→2박 노트 배치→변경 취소에서 Undo 1회는 BPM 180과 노트를, 2회는 BPM 180과 빈 노트 배열을 복원한다', () => {
  store().setChart({ ...store().chart, events: store().chart.events.map(event => event.type === 'bpm' ? { ...event, bpm: 180 } : event) });
  const token = store().beginEditTransaction('selectModeEdit')!;
  store().setChart({ ...store().chart, notes: [tap] }, { transaction: token });
  store().commitEditTransaction(token);
  discardSongInfoChanges();
  expect(store().chart.events[0]).toMatchObject({ bpm: 120 });
  store().undo();
  expect(store().chart.events[0]).toMatchObject({ bpm: 180 });
  expect(store().chart.notes).toEqual([tap]);
  store().undo();
  expect(store().chart.events[0]).toMatchObject({ bpm: 180 });
  expect(store().chart.notes).toEqual([]);
});

it('자켓 a.png 편집 후 리비전 57·이행 완료·새 기준을 적용해도 Undo·Redo는 서버 상태 3개와 baselineAudioId를 유지한다', () => {
  editSongJacket(new File(['a'], 'a.png'));
  const baseline = { ...store().song!.baseline, title: '저장 제목' };
  store().setSong({ ...store().song!, revision: 57, needsTimingMigration: false, baseline, baselineAudioId: 999 });
  for (const restore of [store().undo, store().redo]) {
    restore();
    expect(store().song).toMatchObject({ revision: 57, needsTimingMigration: false, baselineAudioId: 999 });
    expect(store().song?.baseline).toBe(baseline);
  }
});

it.each(['cancelEditTransaction', 'cancelEditTransactionForPlaybackStart'] as const)(
  '%s는 transaction 안의 자켓 a.png·길이 90초를 복원하고 변경된 리비전 57은 유지한다', cancel => {
    const before = store().song;
    const token = store().beginEditTransaction('selectModeEdit')!;
    store().setChart(store().chart, { transaction: token,
      songDraft: { pendingJacketFile: new File(['a'], 'a.png'), duration: 90 } });
    store().setSong({ ...store().song!, revision: 57 });
    store()[cancel]();
    expect(store().song).toEqual({ ...before, revision: 57 });
    expect(store().historyPast).toHaveLength(0);
  },
);

it('자켓 a.png가 있는 유효 상태 뒤 중복 노트 2개·자켓 b.png를 적용하고 revertToLastValid하면 a.png와 빈 노트 배열을 복원한다', () => {
  const a = new File(['a'], 'a.png');
  editSongJacket(a);
  store().setChart({ ...store().chart, notes: [tap, { ...tap }] }, { songDraft: { pendingJacketFile: new File(['b'], 'b.png') } });
  store().revertToLastValid();
  expect(store().song?.pendingJacketFile).toBe(a);
  expect(store().chart.notes).toEqual([]);
  store().undo();
  expect(store().song?.pendingJacketFile?.name).toBe('b.png');
  expect(store().chart.notes).toHaveLength(2);
});

it('1박→0박 역전 restZone이 남은 상태에서 곡 정보 변경 취소가 구조 거부되면 초안·차트·이력은 그대로이고 discarded는 false다', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  editSongTitle('새 제목');
  editSongJacket(new File(['a'], 'a.png'));
  useEditorStore.setState({ chart: { ...store().chart, restZones: [{ lane: 1, beat: beat(1), endBeat: beat(0) }] } });
  const before = store();
  expect(discardSongInfoChanges()).toEqual({ discarded: false });
  expect(store().chart).toBe(before.chart);
  expect(store().song).toBe(before.song);
  expect(store().historyPast).toBe(before.historyPast);
});

it('곡 행이 없으면 음원 A→B를 Undo할 때 경로는 A로 돌아가지만 songlessMedia의 대기 B 파일은 그대로다', () => {
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null));
  const before = store().chart.meta.audioFile;
  const media = { ...store().songlessMedia, audioFile: new File(['B'], 'B.ogg') };
  store().setSonglessMedia(media);
  store().applyMetaEdit({ audioFile: 'B.ogg' });
  store().undo();
  expect(store().chart.meta.audioFile).toBe(before);
  expect(store().song).toBeNull();
  expect(store().songlessMedia).toBe(media);
});

it('저장 구간 2～110초·페이드 1초와 필드 순서만 다른 초안을 변경 취소하면 Undo 이력 0개를 유지한다', () => {
  const loaded = { ...loadedSong, gameplayStart: 2, gameplayEnd: 110, gameplayFadeIn: 1, gameplayFadeOut: 1 };
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, loaded), loaded);
  store().setSong({ ...store().song!, gameplayRange: { fadeOutTime: 1, fadeInTime: 1, endTime: 110, startTime: 2 } });
  expect(discardSongInfoChanges()).toEqual({ discarded: true });
  expect(store().historyPast).toHaveLength(0);
});
