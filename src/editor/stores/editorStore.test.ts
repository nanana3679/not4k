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
      lastValidSnapshot: null,
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
// 차트 변이 게이트 — 낙관적 편집(RFD 0017): 구조 위반만 하드 거부, 의미 위반은 커밋
// ---------------------------------------------------------------------------

describe('editorStore 차트 변이 게이트', () => {
  beforeEach(() => {
    useEditorStore.setState({
      chart: makeChart(),
      historyPast: [],
      historyFuture: [],
      historyLastCaptureAt: 0,
      lastValidSnapshot: null,
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

// ---------------------------------------------------------------------------
// lastValidSnapshot + revertToLastValid — 막다른 상태 탈출(RFD 0017 §7):
// 마지막으로 차트 전체가 valid였던 상태로 O(1) 복귀, 복귀 자체도 undo 가능
// ---------------------------------------------------------------------------

describe('editorStore lastValidSnapshot·revertToLastValid', () => {
  beforeEach(() => {
    useEditorStore.setState({
      chart: makeChart(),
      extraLaneCount: 2,
      selection: emptySelection(),
      historyPast: [],
      historyFuture: [],
      historyLastCaptureAt: 0,
      lastValidSnapshot: null,
    });
  });

  it('valid 차트를 setChart하면 lastValidSnapshot이 그 차트로 갱신된다', () => {
    const valid = makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]);

    useEditorStore.getState().setChart(valid);

    expect(useEditorStore.getState().lastValidSnapshot?.chart).toBe(valid); // 불변 참조 저장
    expect(useEditorStore.getState().lastValidSnapshot?.extraLaneCount).toBe(2);
  });

  it('semantic 위반(같은 레인·박 중복 노트) setChart는 커밋되지만 lastValidSnapshot은 이전 valid 상태로 유지된다', () => {
    const valid = makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]);
    useEditorStore.getState().setChart(valid);

    const semanticInvalid = makeChart([
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
    ]);
    useEditorStore.getState().setChart(semanticInvalid);

    expect(useEditorStore.getState().chart).toBe(semanticInvalid); // 낙관 커밋
    expect(useEditorStore.getState().lastValidSnapshot?.chart).toBe(valid); // 갱신 안 됨
  });

  it('한 번도 valid를 통과하지 않았으면 lastValidSnapshot은 null', () => {
    const semanticInvalid = makeChart([
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
    ]);

    useEditorStore.getState().setChart(semanticInvalid);

    expect(useEditorStore.getState().lastValidSnapshot).toBeNull();
  });

  it('loadChart로 valid 차트를 로드하면 lastValidSnapshot이 세팅된다', () => {
    const valid = makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]);

    useEditorStore.getState().loadChart(valid);

    expect(useEditorStore.getState().lastValidSnapshot?.chart).toBe(valid);
  });

  it('loadChart로 invalid 차트를 로드하면 lastValidSnapshot은 null로 유지된다', () => {
    const invalid = makeChart([
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
    ]);

    useEditorStore.getState().loadChart(invalid);

    expect(useEditorStore.getState().chart).toBe(invalid); // 수리용 예외 통로로 열림
    expect(useEditorStore.getState().lastValidSnapshot).toBeNull(); // 씨앗 아님
  });

  it('revertToLastValid는 chart·extraLaneCount를 lastValidSnapshot으로 되돌린다', () => {
    const valid = makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]);
    useEditorStore.getState().setChart(valid);
    const invalid = makeChart([
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
    ]);
    useEditorStore.getState().setChart(invalid);

    useEditorStore.getState().revertToLastValid();

    expect(useEditorStore.getState().chart).toBe(valid);
    expect(useEditorStore.getState().extraLaneCount).toBe(2);
  });

  it('revertToLastValid 후 undo하면 되돌리기 직전(위반) 상태로 복원된다', () => {
    const valid = makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]);
    useEditorStore.getState().setChart(valid);
    const invalid = makeChart([
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
    ]);
    useEditorStore.getState().setChart(invalid);

    useEditorStore.getState().revertToLastValid();
    expect(useEditorStore.getState().chart).toBe(valid);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().chart.notes).toHaveLength(2); // 위반 상태로 복원 — 안전망
  });

  it('revertToLastValid는 600ms 병합창과 무관하게 past에 스냅샷을 쌓는다', () => {
    const valid = makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]);
    useEditorStore.getState().setChart(valid);
    const invalid = makeChart([
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
    ]);
    useEditorStore.getState().setChart(invalid); // 직전 캡처로부터 600ms 이내 → 병합돼 past에 push 안 됨
    const pastBefore = useEditorStore.getState().historyPast.length;

    useEditorStore.getState().revertToLastValid();

    expect(useEditorStore.getState().historyPast).toHaveLength(pastBefore + 1); // 병합창 무시 강제 push
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().chart.notes).toHaveLength(2); // undo로 위반 상태 복원 가능
  });

  it('lastValidSnapshot이 null이면 revertToLastValid는 no-op', () => {
    const invalid = makeChart([
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
      { type: 'single', lane: 1 as Lane, beat: beat(1) },
    ]);
    useEditorStore.getState().setChart(invalid);
    const pastBefore = useEditorStore.getState().historyPast.length;

    useEditorStore.getState().revertToLastValid();

    expect(useEditorStore.getState().chart).toBe(invalid); // 차트 무변
    expect(useEditorStore.getState().historyPast).toHaveLength(pastBefore); // 히스토리 무변
  });

  it('revertToLastValid는 selection을 비우고 historyFuture를 클리어한다', () => {
    const valid = makeChart([{ type: 'single', lane: 1 as Lane, beat: beat(1) }]);
    useEditorStore.getState().setChart(valid);
    const invalid = makeChart([
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
      { type: 'single', lane: 2 as Lane, beat: beat(2) },
    ]);
    useEditorStore.getState().setChart(invalid);
    useEditorStore.setState({
      selection: { notes: new Set([0]), zones: new Set() },
      historyFuture: [{ chart: makeChart(), extraLaneCount: 2 }],
    });

    useEditorStore.getState().revertToLastValid();

    expect(useEditorStore.getState().selection.notes.size).toBe(0);
    expect(useEditorStore.getState().selection.zones.size).toBe(0);
    expect(useEditorStore.getState().historyFuture).toHaveLength(0);
  });
});
