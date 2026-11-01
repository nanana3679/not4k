import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat } from '../shared';
import type { ChartDocument, ChartEvent, Lane } from '../shared';
import { showToast } from '../shared/toast';
import { editorChartErrors } from './documentValidation';
import { openEditorChart } from './openEditorChart';
import { isChartDirty, toSavedChartJson } from './savedChart';
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

  it('보조 레인1·2의 text·auto [0,4)가 초기 BPM·박자 자리와 겹친 [text, auto, BPM, 박자] 차트를 열면 text·auto의 레인은 옮기지 않고 [BPM, 박자, text, auto] 순서·보조 레인 수 2로 열어 eventOverlap 2건과 경고 알림이 남고 dirty·Undo·Redo가 없다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const events: ChartEvent[] = [
      { type: 'text', beat: beat(0), endBeat: beat(4), text: 'hello', editorLane: 1 },
      { type: 'auto', beat: beat(0), endBeat: beat(4), editorLane: 2 },
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ];

    openEditorChart({ chart: chart(events), extraLaneCount: 2, hasExtraLaneCount: true });

    expect(store().chart.events).toEqual([events[2], events[3], events[0], events[1]]);
    expect(store().chart.events[2]).toBe(events[0]);
    expect(store().chart.events[3]).toBe(events[1]);
    expect(editorChartErrors(store().chart).map(error => [error.rule, error.refs])).toEqual([
      ['eventOverlap', [{ kind: 'event', index: 0 }, { kind: 'event', index: 2 }]],
      ['eventOverlap', [{ kind: 'event', index: 1 }, { kind: 'event', index: 3 }]],
    ]);
    expect(showToast).toHaveBeenCalledWith('이 차트에 배치 제약 위반 2건이 있습니다 — 수리 후 저장할 수 있습니다', 'warn');
    expect(store().extraLaneCount).toBe(2);
    expect(JSON.parse(store().savedChartJson!.extraJson).extraLaneCount).toBe(2);
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(selectCanRedo(store())).toBe(false);
    // 위반이 남은 차트는 막다른 탈출 씨앗이 되지 않는다.
    expect(store().lastValidSnapshot).toBeNull();
    consoleError.mockRestore();
  });

  it('BPM이 보조 레인3·박자가 editorLane 없음이고 text·auto [0,4)가 보조 레인1·2인 [text, auto, BPM, 박자] 차트를 열면 BPM·박자만 1·2로 옮겨 맨 앞에 두고 text·auto는 같은 객체로 1·2에 남으며 그 상태가 dirty·Undo 없는 기본이다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const events: ChartEvent[] = [
      { type: 'text', beat: beat(0), endBeat: beat(4), text: 'hello', editorLane: 1 },
      { type: 'auto', beat: beat(0), endBeat: beat(4), editorLane: 2 },
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 3 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4) },
    ];

    openEditorChart({ chart: chart(events), extraLaneCount: 3, hasExtraLaneCount: true });

    expect(store().chart.events.map(event => [event.type, event.editorLane]))
      .toEqual([['bpm', 1], ['timeSignature', 2], ['text', 1], ['auto', 2]]);
    expect(store().chart.events[2]).toBe(events[0]);
    expect(store().chart.events[3]).toBe(events[1]);
    expect(editorChartErrors(store().chart).map(error => error.rule)).toEqual(['eventOverlap', 'eventOverlap']);
    expect(store().extraLaneCount).toBe(3);
    expect(store().savedChartJson).toEqual(toSavedChartJson(store().chart, 3));
    expect(dirty()).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    consoleError.mockRestore();
  });

  it('보조 레인1 text [0,4)가 초기 BPM과 겹친 채 보조 레인 수 3으로 열고 text를 보조 레인3으로 옮기면 위반 0건이 되고 dirty·Undo가 생긴다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    openEditorChart({ chart: chart([
      { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      { type: 'text', beat: beat(0), endBeat: beat(4), text: 'hello', editorLane: 1 },
    ]), extraLaneCount: 3, hasExtraLaneCount: true });
    expect(editorChartErrors(store().chart).map(error => error.rule)).toEqual(['eventOverlap']);
    const opened = store().chart;

    store().setChart({ ...opened, events: opened.events.map((event, index) => index === 2 ? { ...event, editorLane: 3 } : event) });

    expect(editorChartErrors(store().chart)).toEqual([]);
    expect(dirty()).toBe(true);
    expect(selectCanUndo(store())).toBe(true);
    consoleError.mockRestore();
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
