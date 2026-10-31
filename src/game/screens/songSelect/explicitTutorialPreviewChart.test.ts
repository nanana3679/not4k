import { describe, expect, it } from 'vitest';
import { beat } from '../../../shared/types/beat';
import { beatToMs, extractBpmChanges } from '../../../shared/timing';
import type { ChartDocument } from '../../../shared/types/chart';
import { compileExplicitJudgmentChart } from '../../judgment/explicitCompiledChart';
import {
  createExplicitTutorialPreview,
  createExplicitTutorialRenderDocument,
  isExplicitTutorialPreview,
} from './explicitTutorialPreviewChart';
import { TUTORIAL_PREVIEWS, getTutorialInputTimings } from './tutorialPreviewChart';

/** 120 BPM 4박(2000ms) 반복: 탭+바디+릴리즈(2레인), 더블 탭(3레인), 트릴 구간(4레인), 휴지 구간(1레인). */
function sourceChart(bpm = 120): ChartDocument {
  return {
    meta: { title: '명시 시연', artist: 'test', difficultyLabel: 'TUTORIAL', difficultyLevel: 1,
      imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: 0 },
    notes: [
      { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
      { type: 'body', holdCount: 1, lane: 2, beat: beat(1), endBeat: beat(2) },
      { type: 'release', count: 1, lane: 2, beat: beat(2) },
      { type: 'tap', kind: 'double', lane: 3, beat: beat(3) },
      { type: 'tap', kind: 'trill', lane: 4, beat: beat(1, 2) },
    ],
    trillZones: [{ lane: 4, beat: beat(1, 2), endBeat: beat(1) }],
    restZones: [{ lane: 1, beat: beat(3), endBeat: beat(4) }],
    events: [
      { type: 'bpm', beat: beat(0), bpm },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      { type: 'tutorialInput', beat: beat(1), endBeat: beat(2), lane: 2, keyCode: 'Binding1', keyLabel: '', editorLane: 3 },
      { type: 'tutorialDiagram', beat: beat(0), endBeat: beat(1, 2), diagramId: 'connected-switch', editorLane: 4 },
      { type: 'text', beat: beat(0), endBeat: beat(1), text: '설명', editorLane: 5 },
    ],
  };
}

describe('명시 튜토리얼 3벌 표시 문서', () => {
  it('노트 5개·loopBeats 4 문서는 복사본 0·1·2를 이어 붙인 15개 노트로 만들고 복사본 k의 노트는 원본보다 4k박 늦음', () => {
    const chart = sourceChart();
    const render = createExplicitTutorialRenderDocument(chart, 4);

    expect(render.notes).toHaveLength(15);
    expect(render.notes[0]).toEqual(chart.notes[0]);
    expect(render.notes[5]).toEqual({ type: 'tap', kind: 'single', lane: 2, beat: beat(5) });
    expect(render.notes[6]).toEqual({ type: 'body', holdCount: 1, lane: 2, beat: beat(5), endBeat: beat(6) });
    expect(render.notes[12]).toEqual({ type: 'release', count: 1, lane: 2, beat: beat(10) });
    expect(render.notes[14]).toEqual({ type: 'tap', kind: 'trill', lane: 4, beat: beat(17, 2) });
  });

  it('trillZone·restZone도 복사본마다 4박씩 밀어 3개씩 만들고 원본 구간 배열은 바꾸지 않음', () => {
    const chart = sourceChart();
    const render = createExplicitTutorialRenderDocument(chart, 4);

    expect(render.trillZones).toEqual([
      { lane: 4, beat: beat(1, 2), endBeat: beat(1) },
      { lane: 4, beat: beat(9, 2), endBeat: beat(5) },
      { lane: 4, beat: beat(17, 2), endBeat: beat(9) },
    ]);
    expect(render.restZones).toEqual([
      { lane: 1, beat: beat(3), endBeat: beat(4) },
      { lane: 1, beat: beat(7), endBeat: beat(8) },
      { lane: 1, beat: beat(11), endBeat: beat(12) },
    ]);
    expect(chart.trillZones).toHaveLength(1);
  });

  it('4박 시연을 3벌로 만들면 bpm은 복사본마다 3개, 박자표는 원본 1개만 남기고 tutorialInput·tutorialDiagram·text는 뺌', () => {
    const render = createExplicitTutorialRenderDocument(sourceChart(), 4);
    expect(render.events.map(event => event.type)).toEqual(['bpm', 'bpm', 'bpm', 'timeSignature']);
  });

  it('4/4 박자표에 3박 반복인 시연도 3벌 표시 문서가 마디 중간 박자표 없이 명시 compile을 통과', () => {
    const render = createExplicitTutorialRenderDocument(sourceChart(), 3);
    expect(render.events.filter(event => event.type === 'timeSignature')).toEqual([
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ]);
    expect(() => compileExplicitJudgmentChart(render)).not.toThrow();
  });

  it('4박 중 2박에서 120→240 BPM으로 바뀌면 1박 노트는 500·2000·3500ms에 표시하고 박자표는 원본 두 개만 둠', () => {
    const chart = sourceChart();
    chart.events.push(
      { type: 'bpm', beat: beat(2), bpm: 240 },
      { type: 'timeSignature', beat: beat(2), beatPerMeasure: beat(2), editorLane: 2 },
    );
    const preview = createExplicitTutorialPreview('tempo-change', '변속 시연', [], 4, chart);
    const sourceBpmChanges = extractBpmChanges(chart.events);
    const renderBpmChanges = extractBpmChanges(preview.renderChart.events);
    const noteTimes = preview.renderChart.notes.map(note =>
      beatToMs(note.beat, renderBpmChanges, chart.meta.offsetMs));

    expect(preview.loopMs).toBe(1500);
    expect([noteTimes[0], noteTimes[5], noteTimes[10]]).toEqual([500, 2000, 3500]);
    for (const [index, noteTime] of noteTimes.entries()) {
      const cycleIndex = Math.floor(index / chart.notes.length);
      const sourceNote = chart.notes[index % chart.notes.length];
      expect(noteTime).toBe(preview.loopMs * cycleIndex
        + beatToMs(sourceNote.beat, sourceBpmChanges, chart.meta.offsetMs));
    }
    expect(preview.renderChart.events.filter(event => event.type === 'timeSignature')).toEqual([
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      { type: 'timeSignature', beat: beat(2), beatPerMeasure: beat(2), editorLane: 2 },
    ]);
    expect(chart.events.filter(event => event.type === 'bpm')).toHaveLength(2);
  });

  it('3벌 표시 문서도 명시 compile을 통과하며 점수 항목 5개·바디 1개가 각각 3배(15개·3개)', () => {
    const source = compileExplicitJudgmentChart(sourceChart());
    const render = compileExplicitJudgmentChart(createExplicitTutorialRenderDocument(sourceChart(), 4));

    expect(source.scoreItems).toHaveLength(5);
    expect(render.scoreItems).toHaveLength(15);
    expect(render.bodies.map(body => body.source.noteIndex)).toEqual([1, 6, 11]);
    expect(render.bodies.map(body => body.startMs)).toEqual([500, 2500, 4500]);
    expect(render.connections).toEqual([]);
  });
});

describe('명시 튜토리얼 정의', () => {
  it('120 BPM loopBeats 4 정의는 loopMs 2000·renderStartMs 2000·renderDurationMs 6000이고 engine이 explicit', () => {
    const chart = sourceChart();
    const preview = createExplicitTutorialPreview('explicit-demo', '명시 시연', ['한 줄 설명'], 4, chart);

    expect(preview).toMatchObject({
      engine: 'explicit', id: 'explicit-demo', title: '명시 시연', bodyLines: ['한 줄 설명'],
      loopBeats: 4, loopMs: 2000, renderStartMs: 2000, renderDurationMs: 6000,
    });
    expect(preview.chart).toBe(chart);
    expect(preview.renderChart).toEqual(createExplicitTutorialRenderDocument(chart, 4));
  });

  it('90 BPM에서 loopBeats 3이면 loopMs 2000', () => {
    expect(createExplicitTutorialPreview('slow', '느린 시연', [], 3, sourceChart(90)).loopMs).toBe(2000);
  });

  it('명시 정의만 isExplicitTutorialPreview가 true이고 구형 TUTORIAL_PREVIEWS 정의는 모두 false', () => {
    expect(isExplicitTutorialPreview(createExplicitTutorialPreview('explicit-demo', '명시 시연', [], 4, sourceChart()))).toBe(true);
    expect(TUTORIAL_PREVIEWS.length).toBeGreaterThan(0);
    expect(TUTORIAL_PREVIEWS.some(isExplicitTutorialPreview)).toBe(false);
  });

  it('명시 문서의 tutorialInput도 구형과 같은 getTutorialInputTimings로 1박→500ms·2박→1000ms 입력 구간이 됨', () => {
    const preview = createExplicitTutorialPreview('explicit-demo', '명시 시연', [], 4, sourceChart());
    expect(getTutorialInputTimings(preview.chart).map(({ event, startMs, endMs }) => [event.lane, event.keyCode, startMs, endMs]))
      .toEqual([[2, 'Binding1', 500, 1000]]);
  });
});
