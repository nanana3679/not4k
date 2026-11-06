import { describe, expect, it } from 'vitest';
import { beat } from '../../../shared/types/beat';
import type { ChartDocument } from '../../../shared/types/chart';
import { compileExplicitJudgmentChart } from '../../judgment/explicitCompiledChart';
import { ExplicitJudgmentSession } from '../../judgment/ExplicitJudgmentSession';
import { ExplicitNotePresenter } from '../../renderer/ExplicitNotePresenter';
import { buildExplicitSkinView } from '../../skin/explicitSkin';
import { createExplicitTutorialPreview } from './explicitTutorialPreviewChart';
import { createExplicitTutorialRenderChart } from './explicitTutorialRenderChart';
import { createExplicitTutorialRenderSnapshotQuery } from './explicitTutorialRenderSnapshot';

/** 보조 노트 포함 11개, 점수 항목 10개, 메인 바디 3개·4몫. 2박의 2→1 연결과 별도 트릴 바디. */
function setup() {
  const chart: ChartDocument = {
    meta: { title: '표시 참조', artist: 'test', difficultyLabel: 'TUTORIAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 100 },
    notes: [
      { type: 'body', holdCount: 1, lane: 5, beat: beat(1), endBeat: beat(2) },
      { type: 'tap', kind: 'double', lane: 1, beat: beat(1), grace: true },
      { type: 'body', holdCount: 2, lane: 1, beat: beat(1), endBeat: beat(2) },
      { type: 'tick', count: 2, lane: 1, beat: beat(3, 2) },
      { type: 'body', holdCount: 1, lane: 1, beat: beat(2), endBeat: beat(4) },
      { type: 'release', count: 1, lane: 1, beat: beat(2) },
      { type: 'tick', count: 1, lane: 1, beat: beat(3) },
      { type: 'release', count: 1, lane: 1, beat: beat(4) },
      { type: 'release', count: 2, lane: 2, beat: beat(1), grace: true },
      { type: 'tap', kind: 'trill', lane: 3, beat: beat(1) },
      { type: 'body', holdCount: 1, lane: 3, beat: beat(1), endBeat: beat(3), trill: true },
    ],
    trillZones: [
      { lane: 6, beat: beat(0), endBeat: beat(3) },
      { lane: 3, beat: beat(1), endBeat: beat(3) },
    ],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'bpm', beat: beat(2), bpm: 240 },
      { type: 'bpm', beat: beat(4), bpm: 60 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ],
  };
  const preview = createExplicitTutorialPreview('references', '표시 참조', [], 4, chart);
  const source = compileExplicitJudgmentChart(chart);
  return { preview, source, render: createExplicitTutorialRenderChart(source, preview) };
}

describe('명시 튜토리얼 표시 compile 합성', () => {
  it('원본 11개 노트·2개 zone의 복사본 1은 참조에 11·2를 더하고 double·tick의 ordinal 0·1을 유지', () => {
    const { source, render } = setup();
    expect(render.scoreItems).toHaveLength(30);
    expect(render.bodies.map(body => body.source.noteIndex)).toEqual([2, 4, 10, 13, 15, 21, 24, 26, 32]);
    expect(render.bodyUnits).toHaveLength(12);
    expect(render.totalJudgments).toBe(30);
    expect(render.theoreticalWeight).toBe(90);
    expect(render.scoreItems.filter(item => item.source.noteIndex === 12)).toMatchObject([
      { id: 'n12:tap:0', ordinal: 0, grace: true, startsBodyIndices: [13] },
      { id: 'n12:tap:1', ordinal: 1, grace: true, startsBodyIndices: [13] },
    ]);
    expect(render.scoreItems.filter(item => item.source.noteIndex === 14)).toMatchObject([
      { id: 'n14:tick:0', bodyIndex: 13, bodyUnit: { bodyIndex: 13, ordinal: 0 } },
      { id: 'n14:tick:1', bodyIndex: 13, bodyUnit: { bodyIndex: 13, ordinal: 1 } },
    ]);
    expect(render.scoreItems.find(item => item.source.noteIndex === 16))
      .toMatchObject({ id: 'n16:release:0', bodyIndex: 13, boundaryKind: 'decrease' });
    expect(render.scoreItems.find(item => item.source.noteIndex === 18))
      .toMatchObject({ bodyIndex: 15, boundaryKind: 'end' });
    expect(render.scoreItems.filter(item => item.source.noteIndex === 19)).toMatchObject([
      { ordinal: 0, bodyIndex: undefined, boundaryKind: 'standalone', grace: true },
      { ordinal: 1, bodyIndex: undefined, boundaryKind: 'standalone', grace: true },
    ]);
    expect(render.scoreItems.find(item => item.source.noteIndex === 20))
      .toMatchObject({ trillZoneIndex: 3, startsBodyIndices: [21] });
    expect(render.bodies.find(body => body.source.noteIndex === 13)).toMatchObject({
      startTapIndices: [12], releaseIndices: [16], tickIndices: [14],
      units: [
        { id: 'b13:hold:0', source: { noteIndex: 13 }, ref: { bodyIndex: 13, ordinal: 0 } },
        { id: 'b13:hold:1', source: { noteIndex: 13 }, ref: { bodyIndex: 13, ordinal: 1 } },
      ],
    });
    expect(render.bodies.find(body => body.source.noteIndex === 15))
      .toMatchObject({ startTapIndices: [], releaseIndices: [18], tickIndices: [17] });
    expect(render.bodies.filter(body => body.trill).map(body => body.trillZoneIndex)).toEqual([1, 3, 5]);
    expect(render.relations.bodyByNote.get(11)).toMatchObject({ noteIndex: 11, note: { lane: 5, beat: beat(5), endBeat: beat(6) } });
    expect(render.relations.bodyByNote.get(13)).toMatchObject({
      startTapIndices: [12], endReleaseIndices: [16], tickIndices: [14], predecessorIndices: [], successorIndices: [15],
    });
    expect(render.relations.bodyByNote.get(15)).toMatchObject({
      endReleaseIndices: [18], tickIndices: [17], predecessorIndices: [13], successorIndices: [],
    });
    expect(render.relations.tickBodyCandidatesByNote.get(14)).toEqual([13]);
    expect(render.relations.tickBodyByNote.get(14)).toBe(13);
    expect(render.relations.tickBodyCandidatesByNote.get(17)).toEqual([15]);
    expect(render.relations.tickBodyByNote.get(17)).toBe(15);
    expect(render.relations.releaseBodyCandidatesByNote.get(16)).toEqual([13]);
    expect(render.relations.releaseBodyByNote.get(16)).toBe(13);
    expect(render.relations.releaseBodyCandidatesByNote.get(18)).toEqual([15]);
    expect(render.relations.releaseBodyByNote.get(18)).toBe(15);
    expect(render.relations.releaseBodyCandidatesByNote.get(19)).toEqual([]);
    expect(render.relations.releaseBodyByNote.has(19)).toBe(false);
    // 합성은 원본 관계와 항목을 수정하지 않는다.
    expect(source.bodies.map(body => body.source.noteIndex)).toEqual([2, 4, 10]);
    expect([...source.relations.tickBodyByNote]).toEqual([[3, 2], [6, 4]]);
    expect(source.scoreItems.filter(item => item.source.noteIndex === 3).map(item => item.id))
      .toEqual(['n3:tick:0', 'n3:tick:1']);
  });

  it('120→240 BPM·offset 100ms인 4박 반복은 1500ms·4박씩 옮겨 연결 경계를 1100·2600·4100ms에 표시', () => {
    const { preview, render } = setup();
    expect(preview.loopMs).toBe(1500);
    expect(render.connections).toEqual([
      { predecessorIndex: 2, successorIndex: 4, lane: 1, beat: beat(2), boundaryMs: 1100,
        predecessorHoldCount: 2, successorHoldCount: 1 },
      { predecessorIndex: 13, successorIndex: 15, lane: 1, beat: beat(6), boundaryMs: 2600,
        predecessorHoldCount: 2, successorHoldCount: 1 },
      { predecessorIndex: 24, successorIndex: 26, lane: 1, beat: beat(10), boundaryMs: 4100,
        predecessorHoldCount: 2, successorHoldCount: 1 },
    ]);
    expect(render.relations.connections.map(connection => [connection.predecessorIndex, connection.successorIndex, connection.beat]))
      .toEqual([[2, 4, beat(2)], [13, 15, beat(6)], [24, 26, beat(10)]]);
    expect(render.scoreItems.find(item => item.id === 'n14:tick:1')).toMatchObject({ beat: beat(11, 2), timeMs: 2350 });
    expect(render.bodies.find(body => body.source.noteIndex === 15))
      .toMatchObject({ beat: beat(6), endBeat: beat(8), startMs: 2600, endMs: 3100,
        units: [{ startMs: 2600, endMs: 3100 }] });
    expect([1, 12, 23].map(index => render.timing.noteTimesMs.get(index))).toEqual([600, 2100, 3600]);
    expect([4, 15, 26].map(index => render.timing.noteEndTimesMs.get(index))).toEqual([1600, 3100, 4600]);
    expect(render.timing.trillZoneStartTimesMs.get(3)).toEqual([600, 2100, 3600]);
    expect(render.timing.measureStartsMs(4600)).toEqual([100, 1600, 3100, 4600]);
  });

  it('보조 노트를 제외한 표시 30개 점수 항목·12개 바디 몫을 snapshot으로 채우면 presenter가 메인 노트 30개를 그림', () => {
    const { preview, source, render } = setup();
    const unjudged = new ExplicitJudgmentSession(source).snapshot;
    const query = createExplicitTutorialRenderSnapshotQuery(render, 11, preview.loopMs, unjudged);
    const presenter = new ExplicitNotePresenter(render, buildExplicitSkinView('/'));
    const snapshot = query(unjudged, 1);
    expect(new Set(snapshot.items.map(item => item.id)).size).toBe(30);
    expect(new Set(snapshot.bodyUnits.map(unit => unit.id)).size).toBe(12);
    expect(presenter.present(snapshot, { judgmentLineY: 426, scrollSpeed: 200, laneAreaX: 0, height: 600 }, 2100))
      .toHaveLength(30);
  });
});
