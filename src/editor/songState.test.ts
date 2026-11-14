import { beforeEach, describe, expect, it } from 'vitest';
import { beat } from '../shared';
import { loadEditorChartAsset } from './chartAssetLoad';
import { openEditorChart } from './openEditorChart';
import { useEditorStore } from './stores/editorStore';
import { isChartDirty, toChartSaveJson } from './savedChart';
import { editPreviewRange } from './songInfoEditing';
import { createEditorSong, isSongDirty, isSongTimingDirty, restoreLastSavedSongInfo, currentSongValues, withChartMetaMedia } from './songState';

const store = () => useEditorStore.getState();
const base = useEditorStore.getInitialState().chart;
const loadedSong = { title: '곡', artist: '작곡가', jacketUrl: null, audioUrl: 'audio.ogg',
  previewUrl: null, previewStart: null, previewEnd: null, duration: 120,
  gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null,
  timing: null, revision: 42 };
const dirty = () => isChartDirty(store().chart, store().extraLaneCount, store().lastSavedChartJson, store().song !== null);

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null, loadedSong), loadedSong);
});

describe('곡·차트의 마지막 저장 값 분리', () => {
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
    openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null));
    expect(dirty()).toBe(false);
    store().setChart({ ...store().chart, meta: { ...store().chart.meta, offsetMs: 50 } });
    expect(dirty()).toBe(true);
    expect(isSongDirty(store().chart, store().song)).toBe(false);
  });
  it('곡 리비전 42로 마지막 저장 값을 만들면 길이 120초와 NULL 프리뷰·구간을 보존한다', () => {
    expect(createEditorSong(loadedSong, store().chart)).toMatchObject({ revision: 42, duration: 120,
      lastSaved: { duration: 120, previewUrl: null, gameplayStart: null, gameplayEnd: null } });
  });
});

describe('음원·자켓·프리뷰 값을 차트 사본에 반영(withChartMetaMedia)', () => {
  it('음원 경로·프리뷰 구간이 이미 같으면 같은 차트 객체를 돌려준다', () => {
    const chart = store().chart;
    const { audioFile, imageFile, previewAudioFile, previewStart, previewEnd } = chart.meta;

    expect(withChartMetaMedia(chart, { audioFile, imageFile, previewAudioFile, previewStart, previewEnd })).toBe(chart);
  });

  it('음원 B.ogg·프리뷰 30～40초를 반영하면 그 값만 바꾸고 제목·노트는 그대로 둔다', () => {
    const chart = { ...store().chart, notes: [{ type: 'tap' as const, kind: 'single' as const, lane: 1, beat: beat(2) }] };

    const next = withChartMetaMedia(chart, { ...chart.meta, audioFile: 'B.ogg', previewStart: 30, previewEnd: 40 });

    expect(next.meta).toMatchObject({ title: '곡', audioFile: 'B.ogg', previewStart: 30, previewEnd: 40 });
    expect(next.notes).toBe(chart.notes);
  });
});

describe('곡 지금 값의 플레이 구간 null(currentSongValues)', () => {
  it('시작 5·끝 NULL·페이드 1의 부분 구간 행은 지금 값의 구간이 null이어도 열자마자 깨끗하고 currentSongValues는 행의 값 그대로다', () => {
    const partial = { ...loadedSong, gameplayStart: 5, gameplayFadeIn: 1 };
    openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null, partial), partial);

    expect(store().song?.gameplayRange).toBeNull();
    expect(isSongDirty(store().chart, store().song)).toBe(false);
    expect(currentSongValues(store().chart, store().song!)).toMatchObject({
      gameplayStart: 5, gameplayEnd: null, gameplayFadeIn: 1, gameplayFadeOut: null });
  });
});

it('프리뷰 10～20초 곡에서 1레인 2박 노트를 놓고 프리뷰를 30～40초로 바꾼 뒤 Undo하면 노트만 지우고 프리뷰 30～40초가 남아 곡은 미저장이다', () => {
  const row = { ...loadedSong, previewStart: 10, previewEnd: 20 };
  openEditorChart(loadEditorChartAsset(toChartSaveJson(base, 2).chartJson, null, row), row);
  store().setChart({ ...store().chart, notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(2) }] });
  editPreviewRange({ startTime: 30, endTime: 40, fadeInTime: 0, fadeOutTime: 0 });

  store().undo();

  expect(store().chart.notes).toEqual([]);
  expect(store().chart.meta).toMatchObject({ previewStart: 30, previewEnd: 40 });
  expect(isSongDirty(store().chart, store().song)).toBe(true);
});

it.each(['artist', 'imageFile', 'audioFile', 'previewAudioFile'] as const)('%s를 changed로 바꾸면 곡만 dirty이고 차트는 깨끗하다', field => {
  store().setChart({ ...store().chart, meta: { ...store().chart.meta, [field]: 'changed' } });
  expect(isSongDirty(store().chart, store().song)).toBe(true);
  expect(dirty()).toBe(false);
});

it('1레인 2박 노트를 3박으로 옮기면 차트만 dirty이고 Undo로 두 저장이 깨끗해진다', () => {
  const chart = { ...store().chart, notes: [{ type: 'tap' as const, kind: 'single' as const, lane: 1, beat: beat(2) }] };
  store().loadChart(chart);
  store().setLastSavedChartJson(toChartSaveJson(chart, 2));
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

describe('곡 정보 변경 취소의 복원 값(restoreLastSavedSongInfo)', () => {
  const tap = { type: 'tap' as const, kind: 'single' as const, lane: 1, beat: beat(2) };

  it('제목·아티스트·오프셋 45·0박 BPM 180·프리뷰 30～40초와 1레인 2박 노트를 바꾼 뒤 복원하면 곡의 마지막 저장 값(곡·작곡가·0·120·NULL)으로 돌아가고 노트는 남는다', () => {
    const edited = store().chart;
    const chart = { ...edited,
      meta: { ...edited.meta, title: '새 제목', artist: '새 작곡가', offsetMs: 45, previewStart: 30, previewEnd: 40 },
      events: edited.events.map(event => event.type === 'bpm' ? { ...event, bpm: 180 } : event),
      notes: [tap] };
    const song = { ...store().song!, pendingPreviewRange: { startTime: 30, endTime: 40, fadeInTime: 1, fadeOutTime: 1 } };

    const restored = restoreLastSavedSongInfo(chart, song);

    expect(restored.chart.meta).toMatchObject({ title: '곡', artist: '작곡가', offsetMs: 0, audioFile: 'audio.ogg' });
    expect(restored.chart.events.find(event => event.type === 'bpm')).toMatchObject({ bpm: 120, editorLane: 1 });
    expect(restored.chart.notes).toEqual([tap]);
    // 프리뷰 구간은 이력 밖 값이라 차트가 아니라 chartMetaMedia로 돌려준다.
    expect(restored.chart.meta).toMatchObject({ previewStart: 30, previewEnd: 40 });
    expect(restored.chartMetaMedia).toMatchObject({ previewStart: undefined, previewEnd: undefined });
    expect(restored.editorSongMedia.pendingPreviewRange).toBeNull();
    expect(isSongDirty(withChartMetaMedia(restored.chart, restored.chartMetaMedia), { ...song, ...restored.editorSongMedia })).toBe(false);
  });

  it('4박에 새로 놓은 BPM 180은 복원하면 사라지고 0박 BPM·박자의 보조 레인 1·2는 그대로다', () => {
    const chart = store().chart;
    const added = { ...chart, events: [...chart.events, { type: 'bpm' as const, beat: beat(4), bpm: 180, editorLane: 3 }] };

    const restored = restoreLastSavedSongInfo(added, store().song!);

    expect(restored.chart.events.map(event => [event.type, event.beat.n, event.editorLane]))
      .toEqual(chart.events.map(event => [event.type, event.beat.n, event.editorLane]));
  });

  it('자켓 next.png·음원 next.ogg 대기 파일과 5초 길이·인게임 2～4초만 바꿨으면 차트 객체는 그대로이고 chartMetaMedia·editorSongMedia가 음원 audio.ogg·길이 120·인게임 구간 NULL을 돌려준다', () => {
    const chart = { ...store().chart, meta: { ...store().chart.meta, audioFile: 'next.ogg' } };
    const song = { ...store().song!, duration: 5,
      pendingJacketFile: new File(['j'], 'next.png'), pendingAudioFile: new File(['a'], 'next.ogg'),
      gameplayRange: { startTime: 2, endTime: 4, fadeInTime: 0, fadeOutTime: 0 } };

    const restored = restoreLastSavedSongInfo(chart, song);

    expect(restored.chart).toBe(chart);
    expect(restored.chartMetaMedia.audioFile).toBe('audio.ogg');
    expect(restored.editorSongMedia).toEqual({ duration: 120, pendingJacketFile: null, pendingAudioFile: null,
      pendingPreviewRange: null, gameplayRange: null });
    expect(isSongDirty(withChartMetaMedia(restored.chart, restored.chartMetaMedia), { ...song, ...restored.editorSongMedia })).toBe(false);
  });

  it('마지막 저장 값의 인게임 구간 2～110초·페이드 1초를 5～100초로 바꾼 뒤 복원하면 2～110초·페이드 1초로 돌아간다', () => {
    const chart = store().chart;
    const song = createEditorSong({ ...loadedSong, gameplayStart: 2, gameplayEnd: 110, gameplayFadeIn: 1, gameplayFadeOut: 1 }, chart);

    const restored = restoreLastSavedSongInfo(chart,
      { ...song, gameplayRange: { startTime: 5, endTime: 100, fadeInTime: 1, fadeOutTime: 1 } });

    expect(restored.editorSongMedia.gameplayRange).toEqual({ startTime: 2, endTime: 110, fadeInTime: 1, fadeOutTime: 1 });
  });

  it('곡 정보를 바꾸지 않았으면 같은 차트 객체를 돌려줘 이력을 남길 변경이 없다', () => {
    const chart = { ...store().chart, notes: [tap] };

    expect(restoreLastSavedSongInfo(chart, store().song!).chart).toBe(chart);
  });
});
