import { beforeEach, describe, expect, it } from 'vitest';
import { beat } from '../shared';
import { loadEditorChartAsset } from './chartAssetLoad';
import { openEditorChart } from './openEditorChart';
import { useEditorStore } from './stores/editorStore';
import { isChartDirty, toSavedChartJson } from './savedChart';
import { editGameplayRange } from './songInfoEditing';
import { createEditorSong, isSongDirty, isSongTimingDirty, restoreSavedSongInfo, sameSongDraft, songDraftOf, songValues } from './songState';

const store = () => useEditorStore.getState();
const base = useEditorStore.getInitialState().chart;
const loadedSong = { title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: 'audio.ogg',
  previewUrl: null, previewStart: null, previewEnd: null, duration: 120,
  gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null,
  timing: null, revision: 42 };
const dirty = () => isChartDirty(store().chart, store().extraLaneCount, store().savedChartJson, store().song !== null);

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, loadedSong), loadedSong);
});

describe('곡·차트 저장 기준 분리', () => {
  it('timing NULL 곡을 초기 레인 배치 후 열면 곡·차트가 깨끗하고 Undo 0개다', () => {
    expect(isSongDirty(store().chart, store().song)).toBe(false);
    expect(dirty()).toBe(false);
    expect(store().historyPast).toHaveLength(0);
    expect(store().song?.revision).toBe(42);
  });
  it('BPM 120→180을 바꾸면 곡 타이밍만 dirty이고 차트는 깨끗하다', () => {
    const chart = store().chart;
    store().setChart({ ...chart, events: chart.events.map(e => e.type === 'bpm' ? { ...e, bpm: 180 } : e) });
    expect(isSongDirty(store().chart, store().song)).toBe(true);
    expect(isSongTimingDirty(store().chart, store().song)).toBe(true);
    expect(dirty()).toBe(false);
  });
  it('1레인 2박 노트를 추가하면 차트만 dirty이고 곡 타이밍은 깨끗하다', () => {
    store().setChart({ ...store().chart, notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(2) }] });
    expect(dirty()).toBe(true);
    expect(isSongDirty(store().chart, store().song)).toBe(false);
  });
  it('Title 곡→새 제목을 적용하면 곡만 dirty이고 타이밍은 깨끗하다', () => {
    store().setChart({ ...store().chart, meta: { ...store().chart.meta, title: '새 제목' } });
    expect(dirty()).toBe(false);
    expect(isSongDirty(store().chart, store().song)).toBe(true);
    expect(isSongTimingDirty(store().chart, store().song)).toBe(false);
  });
  it('곡 행 없이 열고 Offset 0→50을 바꾸면 기존처럼 차트만 dirty다', () => {
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null));
    expect(dirty()).toBe(false);
    store().setChart({ ...store().chart, meta: { ...store().chart.meta, offsetMs: 50 } });
    expect(dirty()).toBe(true);
    expect(isSongDirty(store().chart, store().song)).toBe(false);
  });
  it('곡 리비전 42로 기준을 만들면 길이 120초와 NULL 프리뷰·구간을 보존한다', () => {
    expect(createEditorSong(loadedSong, store().chart)).toMatchObject({ revision: 42, duration: 120,
      baseline: { duration: 120, previewUrl: null, gameplayStart: null, gameplayEnd: null } });
  });
});

it('다른 값이 같아도 프리뷰 클립을 잘라 낸 음원 id가 1과 2로 다르면 같은 곡 초안이 아니다', () => {
  const draft = songDraftOf(store().song!);
  expect(sameSongDraft({ ...draft, previewClipAudioId: 1 }, { ...draft, previewClipAudioId: 1 })).toBe(true);
  expect(sameSongDraft({ ...draft, previewClipAudioId: 1 }, { ...draft, previewClipAudioId: 2 })).toBe(false);
});

describe('곡 초안의 플레이 구간 null(songValues)', () => {
  it('구간 NULL 곡에 3～100초·페이드 1·2초를 저장한 뒤 Undo하면 곡이 dirty이고 저장 값의 시작·끝·페이드가 모두 NULL이다', () => {
    editGameplayRange({ startTime: 3, endTime: 100, fadeInTime: 1, fadeOutTime: 2 });
    const song = store().song!;
    store().completeSongSave(songDraftOf(song), songValues(store().chart, song), 43);
    expect(isSongDirty(store().chart, store().song)).toBe(false);

    store().undo();

    expect(store().song?.gameplayRange).toBeNull();
    expect(isSongDirty(store().chart, store().song)).toBe(true);
    expect(songValues(store().chart, store().song!)).toMatchObject({
      gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null });
  });

  it('시작 5·끝 NULL·페이드 1의 부분 구간 행은 초안 구간이 null이어도 열자마자 깨끗하고 저장 값은 행의 값 그대로다', () => {
    const partial = { ...loadedSong, gameplayStart: 5, gameplayFadeIn: 1 };
    openEditorChart(loadEditorChartAsset(toSavedChartJson(base, 2).chartJson, null, partial), partial);

    expect(store().song?.gameplayRange).toBeNull();
    expect(isSongDirty(store().chart, store().song)).toBe(false);
    expect(songValues(store().chart, store().song!)).toMatchObject({
      gameplayStart: 5, gameplayEnd: null, gameplayFadeIn: 1, gameplayFadeOut: null });
  });
});

it('프리뷰 10～20초를 30～40초로 바꾼 뒤 원래 구간으로 Undo하면 대기 구간이 남아도 곡은 깨끗하다', () => {
  const chart = { ...store().chart, meta: { ...store().chart.meta, previewStart: 10, previewEnd: 20 } };
  store().setChart(chart);
  store().setSong(createEditorSong({ ...loadedSong, previewStart: 10, previewEnd: 20 }, chart));
  store().resetHistory();
  store().setSong({ ...store().song!, pendingPreviewRange: { startTime: 30, endTime: 40, fadeInTime: 0, fadeOutTime: 0 } });
  store().setChart({ ...chart, meta: { ...chart.meta, previewStart: 30, previewEnd: 40 } });
  expect(isSongDirty(store().chart, store().song)).toBe(true);
  store().undo();
  expect(isSongDirty(store().chart, store().song)).toBe(false);
});

it.each(['artist', 'imageFile', 'audioFile', 'previewAudioFile'] as const)('%s를 changed로 바꾸면 곡만 dirty이고 차트는 깨끗하다', field => {
  store().setChart({ ...store().chart, meta: { ...store().chart.meta, [field]: 'changed' } });
  expect(isSongDirty(store().chart, store().song)).toBe(true);
  expect(dirty()).toBe(false);
});

it('1레인 2박 노트를 3박으로 옮기면 차트만 dirty이고 Undo로 두 저장이 깨끗해진다', () => {
  const chart = { ...store().chart, notes: [{ type: 'tap' as const, kind: 'single' as const, lane: 1, beat: beat(2) }] };
  store().loadChart(chart);
  store().setSavedChartJson(toSavedChartJson(chart, 2));
  store().setSong(createEditorSong(loadedSong, chart)); store().resetHistory();
  store().setChart({ ...chart, notes: [{ ...chart.notes[0], beat: beat(3) }] });
  expect(dirty()).toBe(true); expect(isSongDirty(store().chart, store().song)).toBe(false);
  store().undo();
  expect(dirty()).toBe(false); expect(isSongDirty(store().chart, store().song)).toBe(false);
});

it('0박 박자표 4→3 변경은 곡만 dirty이며 Undo하면 곡 타이밍도 깨끗해진다', () => {
  const chart = store().chart;
  store().setChart({ ...chart, events: chart.events.map(e => e.type === 'timeSignature' ? { ...e, beatPerMeasure: beat(3) } : e) });
  expect(dirty()).toBe(false); expect(isSongTimingDirty(store().chart, store().song)).toBe(true);
  store().undo(); expect(isSongTimingDirty(store().chart, store().song)).toBe(false);
});

describe('곡 정보 변경 취소의 복원 값(restoreSavedSongInfo)', () => {
  const tap = { type: 'tap' as const, kind: 'single' as const, lane: 1, beat: beat(2) };

  it('제목·아티스트·오프셋 45·0박 BPM 180·프리뷰 30～40초와 1레인 2박 노트를 바꾼 뒤 복원하면 곡 기준(곡·작곡가·0·120·NULL)으로 돌아가고 노트는 남는다', () => {
    const edited = store().chart;
    const chart = { ...edited,
      meta: { ...edited.meta, title: '새 제목', artist: '새 작곡가', offsetMs: 45, previewStart: 30, previewEnd: 40 },
      events: edited.events.map(event => event.type === 'bpm' ? { ...event, bpm: 180 } : event),
      notes: [tap] };
    const song = { ...store().song!, pendingPreviewRange: { startTime: 30, endTime: 40, fadeInTime: 1, fadeOutTime: 1 } };

    const restored = restoreSavedSongInfo(chart, song);

    expect(restored.chart.meta).toMatchObject({ title: '곡', artist: '작곡가', offsetMs: 0, audioFile: 'audio.ogg' });
    expect(restored.chart.meta.previewStart).toBeUndefined();
    expect(restored.chart.meta.previewEnd).toBeUndefined();
    expect(restored.chart.events.find(event => event.type === 'bpm')).toMatchObject({ bpm: 120 });
    expect(restored.chart.notes).toEqual([tap]);
    expect(restored.song.pendingPreviewRange).toBeNull();
    expect(isSongDirty(restored.chart, restored.song)).toBe(false);
  });

  it('4박에 새로 놓은 BPM 180은 복원하면 사라지고 0박 BPM·박자는 그대로다', () => {
    const chart = store().chart;
    const added = { ...chart, events: [...chart.events, { type: 'bpm' as const, beat: beat(4), bpm: 180 }] };

    const restored = restoreSavedSongInfo(added, store().song!);

    expect(restored.chart.events).toEqual(chart.events);
  });

  it('자켓 next.png·음원 next.ogg 대기 파일과 5초 길이·인게임 2～4초를 복원하면 대기 파일이 비고 길이 120·인게임 구간 NULL로 돌아간다', () => {
    const chart = { ...store().chart, meta: { ...store().chart.meta, audioFile: 'next.ogg' } };
    const song = { ...store().song!, duration: 5,
      pendingJacketFile: new File(['j'], 'next.png'), pendingAudioFile: new File(['a'], 'next.ogg'),
      gameplayRange: { startTime: 2, endTime: 4, fadeInTime: 0, fadeOutTime: 0 } };

    const restored = restoreSavedSongInfo(chart, song);

    expect(restored.chart.meta.audioFile).toBe('audio.ogg');
    expect(restored.song).toMatchObject({ duration: 120, pendingJacketFile: null, pendingAudioFile: null, gameplayRange: null });
    expect(isSongDirty(restored.chart, restored.song)).toBe(false);
  });

  it('인게임 기준 2～110초·페이드 1초에서 5～100초로 바꾼 뒤 복원하면 기준 구간 2～110초·페이드 1초로 돌아간다', () => {
    const chart = store().chart;
    const song = createEditorSong({ ...loadedSong, gameplayStart: 2, gameplayEnd: 110, gameplayFadeIn: 1, gameplayFadeOut: 1 }, chart);

    const restored = restoreSavedSongInfo(chart,
      { ...song, gameplayRange: { startTime: 5, endTime: 100, fadeInTime: 1, fadeOutTime: 1 } });

    expect(restored.song.gameplayRange).toEqual({ startTime: 2, endTime: 110, fadeInTime: 1, fadeOutTime: 1 });
  });

  it('곡 정보를 바꾸지 않았으면 같은 차트 객체를 돌려줘 이력을 남길 변경이 없다', () => {
    const chart = { ...store().chart, notes: [tap] };

    expect(restoreSavedSongInfo(chart, store().song!).chart).toBe(chart);
  });
});
