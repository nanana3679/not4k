import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../shared';
import { loadEditorChartAsset } from './chartAssetLoad';
import { openEditorChart } from './openEditorChart';
import { isChartDirty, toSavedChartJson } from './savedChart';
import { isSongDirty, songValues } from './songState';
import type { ChartDocument } from '../shared';
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

    expect(discardSongInfoChanges()).toEqual({ discarded: true, discardedAudio: null });

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

    expect(discardSongInfoChanges()).toEqual({ discarded: false, discardedAudio: null });

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

  it('저장된 곡에 음원이 없으면 next.ogg를 바꾼 변경 취소는 버린 음원과 저장된 음원 없음(savedAudioUrl null)을 돌려준다', () => {
    const silent = { ...loadedSong, audioUrl: '', duration: null };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, silent), silent);
    editSongAudio(new File(['a'], 'next.ogg'), 5);

    expect(discardSongInfoChanges()).toEqual({ discarded: true, discardedAudio: { savedAudioUrl: null } });
    expect(store().chart.meta.audioFile).toBe('');
  });

  it('음원 next.ogg를 바꿨으면 변경 취소가 대기 파일을 비우고 재생기를 되돌릴 저장된 음원 audio.ogg를 돌려준다', () => {
    editSongAudio(new File(['a'], 'next.ogg'), 5);

    expect(discardSongInfoChanges()).toEqual({ discarded: true, discardedAudio: { savedAudioUrl: 'audio.ogg' } });
    expect(store().song).toMatchObject({ pendingAudioFile: null, duration: 120 });
    expect(store().chart.meta).toMatchObject({ audioFile: 'audio.ogg', previewStart: 10, previewEnd: 20 });
    expect(songDirty()).toBe(false);
  });

  it('곡 정보 변경이 없으면 변경 취소해도 이력을 남기지 않는다', () => {
    store().setChart({ ...store().chart, notes: [tap] }, { separateHistory: true });

    discardSongInfoChanges();

    expect(store().historyPast).toHaveLength(1);
  });

  it('저장 음원 250초·프리뷰 10～20초에서 265초 음원을 고르고 프리뷰 250～265초·새 제목을 적용한 뒤 변경 취소하고 Undo하면 제목만 돌아오고 프리뷰 10～20초·저장 음원·길이 250초는 그대로다', () => {
    const saved = { ...loadedSong, duration: 250 };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, saved), saved);
    editSongAudio(new File(['a'], 'long.ogg'), 265);
    editPreviewRange({ startTime: 250, endTime: 265, fadeInTime: 1, fadeOutTime: 1 });
    editSongTitle('새 제목');
    discardSongInfoChanges();

    store().undo();

    expect(store().chart.meta).toMatchObject({ title: '새 제목', audioFile: 'audio.ogg', previewStart: 10, previewEnd: 20 });
    expect(store().song).toMatchObject({ duration: 250, pendingAudioFile: null, pendingPreviewRange: null });
    const values = songValues(store().chart, store().song!);
    expect(values.previewEnd).toBeLessThanOrEqual(values.duration!);
  });

  it('프리뷰만 30～40초로 바꾼 뒤 변경 취소하면 프리뷰 10～20초로 돌아가고 되살릴 것이 없는 Undo 이력을 남기지 않는다', () => {
    editPreviewRange({ startTime: 30, endTime: 40, fadeInTime: 0.5, fadeOutTime: 0.5 });
    const historyLength = store().historyPast.length;

    expect(discardSongInfoChanges().discarded).toBe(true);

    expect(store().chart.meta).toMatchObject({ previewStart: 10, previewEnd: 20 });
    expect(store().historyPast).toHaveLength(historyLength);
    expect(songDirty()).toBe(false);
  });

  it('곡 행 없이 연 차트는 변경 취소할 곡 정보가 없어 아무것도 바꾸지 않는다', () => {
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null));
    store().setChart({ ...store().chart, meta: { ...store().chart.meta, title: '새 제목' } });

    expect(discardSongInfoChanges()).toEqual({ discarded: false, discardedAudio: null });
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
