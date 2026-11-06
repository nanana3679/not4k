import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat, serializeChart } from '../shared';
import type { ChartDocument, ChartEvent, Lane } from '../shared';
import { showToast } from '../shared/toast';
import { editorChartErrors } from './documentValidation';
import { openEditorChart } from './openEditorChart';
import { loadEditorChartAsset } from './chartAssetLoad';
import { isChartDirty, toSavedChartJson } from './savedChart';
import { songDraftOf } from './songState';
import { selectCanRedo, selectCanUndo, useEditorStore } from './stores/editorStore';

vi.mock('../shared/toast', () => ({ showToast: vi.fn() }));

function chart(events: ChartEvent[]): ChartDocument {
  return {
    meta: { title: 'Test', artist: '', difficultyLabel: 'NORMAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes: [{ type: 'tap', kind: 'single', lane: 1 as Lane, beat: beat(4) }],
    trillZones: [],
    events,
  };
}

const store = () => useEditorStore.getState();
const dirty = () => isChartDirty(store().chart, store().extraLaneCount, store().savedChartJson);

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  vi.mocked(showToast).mockClear();
});

describe('openEditorChart 불러온 기본 상태', () => {
  it('normal 행(ID chart-1·리비전 6·저장 경로)과 함께 열면 store 차트 행이 그 행이고, 행 없이 다시 열면 null이다', () => {
    const row = { id: 'chart-1', difficultyLabel: 'normal', revision: 6,
      chartPath: 'songs/s/normal-t.json', chartExtraPath: 'songs/s/normal-t.extra.json' };
    openEditorChart({ chart: chart([]), extraLaneCount: 2, hasExtraLaneCount: true }, null, row);
    expect(store().chartRow).toEqual(row);

    openEditorChart({ chart: chart([]), extraLaneCount: 2, hasExtraLaneCount: true });
    expect(store().chartRow).toBeNull();
  });

  it('파일 150 BPM을 곡 151 BPM·offsetMs 25로 열면 곡 값과 표시 정보가 dirty·Undo 없는 기준이다', () => {
    const source = chart([
      { type: 'bpm', beat: beat(0), bpm: 150 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ]);
    const text = serializeChart(source);
    const asset = loadEditorChartAsset(text, null, {
      title: '곡 제목', artist: '곡 작곡가', jacketUrl: 'new.png',
      timing: { bpmChanges: [{ beat: '0', bpm: 151 }],
        timeSignatureChanges: [{ beat: '0', beatPerMeasure: '3' }], offsetMs: 25 },
    });
    openEditorChart(asset);
    expect(store().chart.events).toEqual([
      { type: 'bpm', beat: beat(0), bpm: 151 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(3) },
    ]);
    expect(store().chart.meta).toMatchObject({ title: '곡 제목', artist: '곡 작곡가', imageFile: 'new.png', offsetMs: 25 });
    expect(store().savedChartJson).toEqual(toSavedChartJson(store().chart, store().extraLaneCount));
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(selectCanRedo(store())).toBe(false);
    expect(serializeChart(source)).toBe(text);
    const baseline = store().chart;
    store().setChart({ ...baseline, meta: { ...baseline.meta, difficultyLevel: 2 } });
    expect(dirty()).toBe(true);
    store().undo();
    expect(store().chart).toEqual(baseline);
    expect(dirty()).toBe(false);
  });

  it('editorLane 없는 0박 BPM·박자를 열면 위반 0건·보조 레인 수 2·dirty 아님·Undo·Redo 없음이다', () => {
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ]), extraLaneCount: 0, hasExtraLaneCount: false });

    expect(editorChartErrors(store().chart)).toEqual([]);
    expect(store().extraLaneCount).toBe(2);
    expect(store().savedChartJson).toEqual(toSavedChartJson(store().chart, 2));
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(selectCanRedo(store())).toBe(false);
  });

  it('보조 레인1·2의 text·auto [0,4)와 0박 BPM·박자가 든 [text, auto, BPM, 박자] 차트를 열면 같은 events 순서·객체로 위반 없이 열리고 dirty·Undo가 없다', () => {
    const events: ChartEvent[] = [
      { type: 'text', beat: beat(0), endBeat: beat(4), text: 'hello', editorLane: 1 },
      { type: 'auto', beat: beat(0), endBeat: beat(4), editorLane: 2 },
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ];

    openEditorChart({ chart: chart(events), extraLaneCount: 2, hasExtraLaneCount: true });

    expect(store().chart.events).toBe(events);
    expect(editorChartErrors(store().chart)).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(selectCanRedo(store())).toBe(false);
  });

  it.each([[false], [true]])(
    '구형 파일의 0박 BPM editorLane 3·박자 editorLane 2를 열면 값을 버려 곡 행 %s에서 dirty가 아니고 저장 JSON에 editorLane이 없다', hasSongRow => {
      const text = JSON.stringify({ ...JSON.parse(serializeChart(chart([]))), events: [
        { type: 'bpm', beat: '0', bpm: 120, editorLane: 3 },
        { type: 'timeSignature', beat: '0', beatPerMeasure: '4', editorLane: 2 },
        { type: 'text', beat: '4', endBeat: '8', text: 'hello', editorLane: 2 },
      ] });

      openEditorChart(loadEditorChartAsset(text, null));

      expect(store().chart.events[0]).not.toHaveProperty('editorLane');
      expect(store().chart.events[1]).not.toHaveProperty('editorLane');
      expect(store().chart.events[2]).toMatchObject({ editorLane: 2 });
      expect(isChartDirty(store().chart, store().extraLaneCount, store().savedChartJson, hasSongRow)).toBe(false);
      expect(selectCanUndo(store())).toBe(false);
      const savedEvents = JSON.parse(store().savedChartJson!.chartJson).events;
      expect(savedEvents[0]).not.toHaveProperty('editorLane');
      expect(savedEvents[1]).not.toHaveProperty('editorLane');
      expect(savedEvents[2]).toMatchObject({ editorLane: 2 });
    },
  );

  it('열고 4박 BPM을 추가한 뒤 Undo하면 연 상태로 돌아가 dirty가 아니다', () => {
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ]), extraLaneCount: 0, hasExtraLaneCount: false });
    const baseline = store().chart;

    store().setChart({ ...baseline, events: [...baseline.events, { type: 'bpm', beat: beat(4), bpm: 180 }] });
    expect(dirty()).toBe(true);
    store().undo();

    expect(store().chart).toEqual(baseline);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
  });

  it('파일에 보조 레인 수가 없으면 같은 events 참조와 store의 보조 레인 수 3을 유지한다', () => {
    useEditorStore.setState({ extraLaneCount: 3 });
    const events: ChartEvent[] = [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ];

    openEditorChart({ chart: chart(events), extraLaneCount: 0, hasExtraLaneCount: false });

    expect(store().chart.events).toBe(events);
    expect(store().extraLaneCount).toBe(3);
    expect(dirty()).toBe(false);
  });

  it('파일의 보조 레인 수 1은 최소 2로 열고 savedChartJson도 2라 dirty·Undo가 없다', () => {
    const events: ChartEvent[] = [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ];

    openEditorChart({ chart: chart(events), extraLaneCount: 1, hasExtraLaneCount: true });

    expect(store().chart.events).toBe(events);
    expect(store().extraLaneCount).toBe(2);
    expect(JSON.parse(store().savedChartJson!.extraJson).extraLaneCount).toBe(2);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(store().lastValidSnapshot).toEqual({ chart: store().chart, extraLaneCount: 2, songDraft: null });
  });

  it('곡 행 음원 audio.ogg와 함께 열면 lastValidSnapshot이 열린 차트·보조 레인 수 2·곡 초안을 함께 담는다', () => {
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ]), extraLaneCount: 2, hasExtraLaneCount: true }, {
      title: 'Test', artist: '', jacketUrl: null, audioUrl: 'audio.ogg', previewUrl: null, previewStart: null, previewEnd: null,
      duration: 120, gameplayStart: null, gameplayEnd: null, gameplayFadeIn: null, gameplayFadeOut: null,
      timing: null, revision: 1,
    });

    expect(store().song).not.toBeNull();
    expect(store().lastValidSnapshot).toEqual({ chart: store().chart, extraLaneCount: 2, songDraft: songDraftOf(store().song!) });
  });

  it('파일의 보조 레인 수 5를 그대로 적용하고 Undo가 없다', () => {
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ]), extraLaneCount: 5, hasExtraLaneCount: true });

    expect(store().extraLaneCount).toBe(5);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
  });
});

describe('openEditorChart 곡 타이밍 이벤트', () => {
  const textOverBpmEvents: ChartEvent[] = [
    { type: 'bpm', beat: beat(0), bpm: 120 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    { type: 'text', beat: beat(16), endBeat: beat(24), text: '간주', editorLane: 1 },
    { type: 'bpm', beat: beat(20), bpm: 180 },
  ];
  const song = {
    title: 'Test', artist: '', jacketUrl: null,
    timing: { bpmChanges: [{ beat: '0', bpm: 120 }, { beat: '20', bpm: 180 }],
      timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 0 },
  };
  const songDirty = () => isChartDirty(store().chart, store().extraLaneCount, store().savedChartJson, true);

  it('text [16,24) 안 20박에 BPM 180이 있는 차트를 같은 값의 곡 타이밍으로 열면 위반 0건·dirty 아님이다', () => {
    openEditorChart(loadEditorChartAsset(serializeChart(chart(textOverBpmEvents)), null, song));

    expect(editorChartErrors(store().chart)).toEqual([]);
    expect(songDirty()).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('곡 행이 있는 차트에서 20박 BPM을 24박으로 옮겨도 타이밍은 곡 소유라 차트는 dirty가 아니다', () => {
    openEditorChart(loadEditorChartAsset(serializeChart(chart(textOverBpmEvents)), null, song));
    const opened = store().chart;

    store().setChart({ ...opened, events: opened.events.map(event =>
      event.type === 'bpm' && event.bpm === 180 ? { ...event, beat: beat(24) } : event) });

    expect(songDirty()).toBe(false);
  });
});
