import { beforeEach, describe, expect, it } from 'vitest';
import { beat } from '../shared';
import { loadEditorChartAsset } from './chartAssetLoad';
import { openEditorChart } from './openEditorChart';
import { useEditorStore } from './stores/editorStore';
import { isChartDirty, toSavedChartJson } from './savedChart';
import { createEditorSong, isSongDirty, isSongTimingDirty } from './songState';

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
