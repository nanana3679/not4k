import { beforeEach, describe, expect, it } from 'vitest';
import { beat } from '../shared';
import type { ChartDocument, ChartEvent, Lane } from '../shared';
import { editorChartErrors } from './documentValidation';
import { openEditorChart } from './openEditorChart';
import { isChartDirty, toSavedChartJson } from './savedChart';
import { selectCanRedo, selectCanUndo, useEditorStore } from './stores/editorStore';

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
});

describe('openEditorChart 불러온 기본 상태', () => {
  it('editorLane 없는 0박 BPM·박자를 열면 BPM은 그대로·박자는 보조 레인2인 상태가 기본이라 위반 0건·dirty 아님·Undo·Redo 없음', () => {
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ]), extraLaneCount: 0, hasExtraLaneCount: false });

    expect(store().chart.events.map(event => event.editorLane)).toEqual([undefined, 2]);
    expect(editorChartErrors(store().chart)).toEqual([]);
    expect(store().extraLaneCount).toBe(2);
    expect(store().savedChartJson).toEqual(toSavedChartJson(store().chart, 2));
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(selectCanRedo(store())).toBe(false);
  });

  it('보조 레인1·2의 text·auto [0,4)가 초기 설정 자리와 겹친 차트를 열면 text·auto를 레인3·4로 옮긴 상태와 보조 레인 수 4가 기본이고 lastValidSnapshot도 4로 묶인다', () => {
    openEditorChart({ chart: chart([
      { type: 'text', beat: beat(0), endBeat: beat(4), text: 'hello', editorLane: 1 },
      { type: 'auto', beat: beat(0), endBeat: beat(4), editorLane: 2 },
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ]), extraLaneCount: 2, hasExtraLaneCount: true });

    expect(store().chart.events.map(event => event.editorLane)).toEqual([3, 4, 1, 2]);
    expect(editorChartErrors(store().chart)).toEqual([]);
    expect(store().extraLaneCount).toBe(4);
    expect(JSON.parse(store().savedChartJson!.extraJson).extraLaneCount).toBe(4);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(store().lastValidSnapshot).toEqual({ chart: store().chart, extraLaneCount: 4 });
  });

  it('BPM이 보조 레인3·박자가 보조 레인1에 있는 차트를 열면 BPM 1·박자 2가 기본이라 dirty·Undo가 없다', () => {
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 3 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 1 },
    ]), extraLaneCount: 3, hasExtraLaneCount: true });

    expect(store().chart.events.map(event => event.editorLane)).toEqual([1, 2]);
    expect(store().extraLaneCount).toBe(3);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
  });

  it('열고 4박 BPM을 추가한 뒤 Undo하면 옮기기 전이 아니라 박자가 보조 레인2인 기본 상태로 돌아가 dirty가 아니다', () => {
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ]), extraLaneCount: 0, hasExtraLaneCount: false });
    const baseline = store().chart;

    store().setChart({ ...baseline, events: [...baseline.events, { type: 'bpm', beat: beat(4), bpm: 180, editorLane: 1 }] });
    expect(dirty()).toBe(true);
    store().undo();

    expect(store().chart).toEqual(baseline);
    expect(store().chart.events[1].editorLane).toBe(2);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
  });

  it('옮길 것이 없고 파일에 보조 레인 수가 없으면 같은 events 참조와 store의 보조 레인 수 3을 유지한다', () => {
    useEditorStore.setState({ extraLaneCount: 3 });
    const events: ChartEvent[] = [
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ];

    openEditorChart({ chart: chart(events), extraLaneCount: 0, hasExtraLaneCount: false });

    expect(store().chart.events).toBe(events);
    expect(store().extraLaneCount).toBe(3);
    expect(dirty()).toBe(false);
  });

  it('옮길 것이 없어도 파일의 보조 레인 수 1은 보조 레인2가 보이게 2로 열고 savedChartJson도 2라 dirty·Undo가 없다', () => {
    const events: ChartEvent[] = [
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ];

    openEditorChart({ chart: chart(events), extraLaneCount: 1, hasExtraLaneCount: true });

    expect(store().chart.events).toBe(events);
    expect(store().extraLaneCount).toBe(2);
    expect(JSON.parse(store().savedChartJson!.extraJson).extraLaneCount).toBe(2);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(store().lastValidSnapshot).toEqual({ chart: store().chart, extraLaneCount: 2 });
  });

  it('옮길 것이 없어도 파일의 보조 레인 수 5를 적용하고 Undo가 없다', () => {
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ]), extraLaneCount: 5, hasExtraLaneCount: true });

    expect(store().extraLaneCount).toBe(5);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
  });
});
