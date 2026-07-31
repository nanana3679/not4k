import { beforeEach, describe, expect, it } from 'vitest';
import { beat } from '../../shared';
import type { Chart, Lane } from '../../shared';
import { useEditorStore } from './editorStore';
import { emptySelection } from './selectionSlice';

function makeChart(notes: Chart['notes'] = []): Chart {
  return {
    meta: {
      title: 'Test',
      artist: '',
      difficultyLabel: 'NORMAL',
      difficultyLevel: 1,
      imageFile: '',
      audioFile: '',
      previewAudioFile: '',
      offsetMs: 0,
    },
    notes,
    trillZones: [],
    events: [
      { type: 'bpm', beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ],
  };
}

describe('editorStore history', () => {
  beforeEach(() => {
    useEditorStore.setState({
      chart: makeChart(),
      extraLaneCount: 2,
      selection: emptySelection(),
      historyPast: [],
      historyFuture: [],
      historyLastCaptureAt: 0,
    });
  });

  it('undoes and redoes chart changes', () => {
    const edited = makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]);

    useEditorStore.getState().setChart(edited);
    expect(useEditorStore.getState().chart.notes).toHaveLength(1);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().chart.notes).toHaveLength(0);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().chart.notes).toHaveLength(1);
  });

  it('lane=5 보조 노트 변경을 undo·redo하면 chart.notes에서 함께 복원', () => {
    const edited = makeChart([{ type: 'single', lane: 5, beat: beat(1) }]);

    useEditorStore.getState().setChart(edited);
    expect(useEditorStore.getState().chart.notes.map((note) => note.lane)).toEqual([5]);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().chart.notes).toEqual([]);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().chart.notes.map((note) => note.lane)).toEqual([5]);
  });

  it('기존 setExtraNotes 어댑터로 extraLane=2를 쓰면 chart.notes의 lane=6으로 저장', () => {
    useEditorStore.getState().setExtraNotes([
      { type: 'single', lane: 6, beat: beat(1) },
    ]);

    expect(useEditorStore.getState().chart.notes).toEqual([
      { type: 'single', lane: 6, beat: beat(1) },
    ]);
  });

  it('clears history when a chart load resets the baseline', () => {
    useEditorStore.getState().setChart(makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]));
    expect(useEditorStore.getState().historyPast).toHaveLength(1);

    useEditorStore.getState().resetHistory();
    expect(useEditorStore.getState().historyPast).toHaveLength(0);
    expect(useEditorStore.getState().historyFuture).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 차트 변이 게이트 — 낙관적 편집(RFD 0017): 구조 위반만 하드 거부, 의미 위반은 커밋
// ---------------------------------------------------------------------------

describe('editorStore 차트 변이 게이트', () => {
  beforeEach(() => {
    useEditorStore.setState({
      chart: makeChart(),
      historyPast: [],
      historyFuture: [],
      historyLastCaptureAt: 0,
    });
  });

  it('의미 위반(같은 레인·박 중복 노트) setChart는 거부되지 않고 커밋되어 히스토리에 쌓인다', () => {
    const semanticInvalid = makeChart([
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
    ]);

    useEditorStore.getState().setChart(semanticInvalid);

    expect(useEditorStore.getState().chart.notes).toHaveLength(2); // 낙관적으로 커밋됨
    expect(useEditorStore.getState().historyPast).toHaveLength(1); // undo로 복귀 가능하게 히스토리에 남음
  });

  it('구조 위반(구간 역전 endBeat<beat) setChart는 거부되어 차트·히스토리가 유지된다', () => {
    const structuralInvalid = makeChart([
      { type: 'long', lane: 1 as Lane, beat: beat(4), endBeat: beat(2) },
    ]);

    useEditorStore.getState().setChart(structuralInvalid);

    expect(useEditorStore.getState().chart.notes).toHaveLength(0); // 이전 차트 유지
    expect(useEditorStore.getState().historyPast).toHaveLength(0); // undo 스택 오염 없음
  });

  it('구조(역전)+의미(중복) 동시 위반 setChart도 통째 거부 — 부분 반영 없이 차트·히스토리 무변', () => {
    const mixedInvalid = makeChart([
      { type: 'long', lane: 1 as Lane, beat: beat(4), endBeat: beat(2) }, // 역전(구조)
      { type: 'single', lane: 2 as Lane, beat: beat(1) },
      { type: 'single', lane: 2 as Lane, beat: beat(1) }, // 중복(의미)
    ]);

    useEditorStore.getState().setChart(mixedInvalid);

    expect(useEditorStore.getState().chart.notes).toHaveLength(0); // 이전 차트 그대로
    expect(useEditorStore.getState().historyPast).toHaveLength(0); // 히스토리 오염 없음
  });

  it('d=0 malformed Beat 차트도 setChart가 throw 없이 구조 위반으로 거부한다', () => {
    const malformed = makeChart([
      { type: 'single', lane: 1 as Lane, beat: { n: 5, d: 0 } },
    ]);

    expect(() => useEditorStore.getState().setChart(malformed)).not.toThrow();
    expect(useEditorStore.getState().chart.notes).toHaveLength(0); // 거부됨
  });

  it('유효한 setChart는 통과하고 히스토리에 쌓인다', () => {
    useEditorStore.getState().setChart(makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]));

    expect(useEditorStore.getState().chart.notes).toHaveLength(1);
    expect(useEditorStore.getState().historyPast).toHaveLength(1);
  });

  it('loadChart는 위반 차트도 수용한다 — 열람·수리용 예외 통로', () => {
    const invalid = makeChart([
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
    ]);

    useEditorStore.getState().loadChart(invalid);

    expect(useEditorStore.getState().chart.notes).toHaveLength(2); // 열림 (재저장은 저장 게이트가 차단)
  });
});
