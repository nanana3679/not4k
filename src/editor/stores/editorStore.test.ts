import { beforeEach, describe, expect, it } from 'vitest';
import { beat } from '../../shared';
import type { Chart, Lane } from '../../shared';
import { useEditorStore } from './editorStore';

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
      extraNotes: [],
      extraLaneCount: 2,
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

  it('clears history when a chart load resets the baseline', () => {
    useEditorStore.getState().setChart(makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]));
    expect(useEditorStore.getState().historyPast).toHaveLength(1);

    useEditorStore.getState().resetHistory();
    expect(useEditorStore.getState().historyPast).toHaveLength(0);
    expect(useEditorStore.getState().historyFuture).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 차트 변이 게이트 — 모델 불변(배치 제약 층1)의 단독 강제 지점
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

  it('배치 제약 위반(같은 레인·박 중복 노트) setChart는 거부되어 차트·히스토리가 유지된다', () => {
    const invalid = makeChart([
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
    ]);

    useEditorStore.getState().setChart(invalid);

    expect(useEditorStore.getState().chart.notes).toHaveLength(0); // 이전 차트 유지
    expect(useEditorStore.getState().historyPast).toHaveLength(0); // undo 스택 오염 없음
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
