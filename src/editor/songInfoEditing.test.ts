import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../shared';
import { loadEditorChartAsset } from './chartAssetLoad';
import { openEditorChart } from './openEditorChart';
import { isChartDirty, toSavedChartJson } from './savedChart';
import { isSongDirty } from './songState';
import { useEditorStore } from './stores/editorStore';
import { PAUSE_TO_EDIT_COPY } from './editorCopy';
import {
  discardSongInfoChanges,
  editAudioOffset,
  editGameplayRange,
  editPreviewRange,
  editSongArtist,
  editSongAudio,
  editSongJacket,
  editSongTitle,
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
  it('120초 곡의 프리뷰 10～20초에서 5초 음원 next.ogg를 적용하면 경로·대기 파일·길이 5와 5초에 맞춘 프리뷰 5～5초·인게임 0～5초를 함께 적용한다', () => {
    const audio = new File(['a'], 'next.ogg');
    editSongAudio(audio, 5);

    expect(store().chart.meta).toMatchObject({ audioFile: 'next.ogg', previewStart: 5, previewEnd: 5 });
    expect(store().song).toMatchObject({ duration: 5, pendingAudioFile: audio,
      pendingPreviewRange: { startTime: 5, endTime: 5, fadeInTime: 0, fadeOutTime: 0 },
      gameplayRange: { startTime: 0, endTime: 5, fadeInTime: 0, fadeOutTime: 0 } });
  });

  it('프리뷰 30～40초·페이드 1초를 적용하면 차트 프리뷰 구간과 대기 구간의 페이드를 함께 바꾼다', () => {
    const range = { startTime: 30, endTime: 40, fadeInTime: 1, fadeOutTime: 1 };
    editPreviewRange(range);

    expect(store().chart.meta).toMatchObject({ previewStart: 30, previewEnd: 40 });
    expect(store().song?.pendingPreviewRange).toEqual(range);
    expect(songDirty()).toBe(true);
  });

  it('프리뷰 페이드만 0.5→1초로 바꾸면 차트 이력을 남기지 않고 대기 구간의 페이드만 바꾼다', () => {
    editPreviewRange({ startTime: 10, endTime: 20, fadeInTime: 1, fadeOutTime: 1 });

    expect(store().historyPast).toHaveLength(0);
    expect(store().song?.pendingPreviewRange).toMatchObject({ fadeInTime: 1 });
  });

  it('인게임 구간 2～110초·페이드 1초를 적용하면 곡의 플레이 구간이 바뀌어 미저장이다', () => {
    editGameplayRange({ startTime: 2, endTime: 110, fadeInTime: 1, fadeOutTime: 1 });

    expect(store().song?.gameplayRange).toEqual({ startTime: 2, endTime: 110, fadeInTime: 1, fadeOutTime: 1 });
    expect(songDirty()).toBe(true);
  });
});

describe('곡 정보 변경 취소(RFD 0098)', () => {
  it('제목·오프셋 45를 바꾸고 1레인 2박 노트를 놓은 뒤 변경 취소하면 곡은 깨끗하고 노트는 남아 차트만 미저장이다', () => {
    editSongTitle('새 제목');
    editAudioOffset(45);
    store().setChart({ ...store().chart, notes: [tap] });

    expect(discardSongInfoChanges()).toEqual({ discarded: true, reloadAudioUrl: null });

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

    expect(discardSongInfoChanges()).toEqual({ discarded: false, reloadAudioUrl: null });

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

  it('음원 next.ogg를 바꿨으면 변경 취소가 대기 파일을 비우고 저장된 음원 audio.ogg를 다시 불러오라고 돌려준다', () => {
    editSongAudio(new File(['a'], 'next.ogg'), 5);

    expect(discardSongInfoChanges()).toEqual({ discarded: true, reloadAudioUrl: 'audio.ogg' });
    expect(store().song).toMatchObject({ pendingAudioFile: null, duration: 120 });
    expect(store().chart.meta).toMatchObject({ audioFile: 'audio.ogg', previewStart: 10, previewEnd: 20 });
    expect(songDirty()).toBe(false);
  });

  it('곡 정보 변경이 없으면 변경 취소해도 이력을 남기지 않는다', () => {
    store().setChart({ ...store().chart, notes: [tap] }, { separateHistory: true });

    discardSongInfoChanges();

    expect(store().historyPast).toHaveLength(1);
  });

  it('곡 행 없이 연 차트는 변경 취소할 곡 정보가 없어 아무것도 바꾸지 않는다', () => {
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null));
    store().setChart({ ...store().chart, meta: { ...store().chart.meta, title: '새 제목' } });

    expect(discardSongInfoChanges()).toEqual({ discarded: false, reloadAudioUrl: null });
    expect(store().chart.meta.title).toBe('새 제목');
  });
});
