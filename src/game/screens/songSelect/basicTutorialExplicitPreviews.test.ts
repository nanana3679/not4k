import { describe, expect, it } from 'vitest';
import { convertLegacyChart } from '../../../shared/chart/legacyConversion';
import { beat } from '../../../shared/types/beat';
import { isExplicitNote } from '../../../shared/types/chart';
import { validateChartDocument } from '../../../shared/validation/documentValidation';
import { compileExplicitJudgmentChart } from '../../judgment/explicitCompiledChart';
import { BASIC_TUTORIAL_EXPLICIT_PREVIEWS } from './basicTutorialExplicitPreviews';
import { createTutorialTimingsInputPlan } from './explicitTutorialPreviewPlayback';
import { createExplicitTutorialPreviewSessionController } from './explicitTutorialPreviewSession';
import {
  getTutorialDiagramEvents,
  getTutorialInputEvents,
  getTutorialInputTimings,
  TUTORIAL_PREVIEWS,
} from './tutorialPreviewChart';

// 점수 항목 0개인 손배치는 달성률을 표시하지 않는다(세션 수치는 0).
// trill-note는 원래부터 같은 키 연타의 GOOD◇ 강등을 보여 주므로 5 Perfect + 3 GOOD◇ = 75%다.
const expectedResults = [
  { id: 'hand-placement', perfect: 0, goodTrill: 0, rate: 0 },
  { id: 'single-note', perfect: 3, goodTrill: 0, rate: 100 },
  { id: 'double-note', perfect: 8, goodTrill: 0, rate: 100 },
  { id: 'trill-note', perfect: 5, goodTrill: 3, rate: 75 },
  { id: 'long-note', perfect: 7, goodTrill: 0, rate: 100 },
  { id: 'release-tap', perfect: 2, goodTrill: 0, rate: 100 },
  { id: 'connected-long-note-switch', perfect: 3, goodTrill: 0, rate: 100 },
  { id: 'connected-long-note-overlap', perfect: 3, goodTrill: 0, rate: 100 },
  { id: 'connected-trill-long', perfect: 4, goodTrill: 0, rate: 100 },
  { id: 'headless-long-note', perfect: 1, goodTrill: 0, rate: 100 },
  { id: 'zero-length-long-note', perfect: 1, goodTrill: 0, rate: 100 },
  { id: 'grace-note', perfect: 2, goodTrill: 0, rate: 100 },
  { id: 'hold-only-long-note', perfect: 1, goodTrill: 0, rate: 100 },
  { id: 'zero-length-hold-only-long-note', perfect: 1, goodTrill: 0, rate: 100 },
  { id: 'rest-zone', perfect: 8, goodTrill: 0, rate: 100 },
  { id: 'horizontal-movement', perfect: 16, goodTrill: 0, rate: 100 },
  { id: 'vertical-movement', perfect: 16, goodTrill: 0, rate: 100 },
];

describe('Basic 명시 튜토리얼', () => {
  it('구형 Basic 17개를 명시 목록으로 옮기면 ID·순서·반복 길이·시연 입력·도식이 모두 유지된다', () => {
    expect(BASIC_TUTORIAL_EXPLICIT_PREVIEWS).toHaveLength(17);
    expect(BASIC_TUTORIAL_EXPLICIT_PREVIEWS.map(preview => ({
      id: preview.id,
      loopBeats: preview.loopBeats,
      loopMs: preview.loopMs,
      inputs: getTutorialInputEvents(preview.chart),
      diagrams: getTutorialDiagramEvents(preview.chart),
    }))).toEqual(TUTORIAL_PREVIEWS.map(preview => ({
      id: preview.id,
      loopBeats: preview.loopBeats,
      loopMs: preview.loopMs,
      inputs: getTutorialInputEvents(preview.chart),
      diagrams: getTutorialDiagramEvents(preview.chart),
    })));
    expect(BASIC_TUTORIAL_EXPLICIT_PREVIEWS.every(preview => preview.engine === 'explicit')).toBe(true);
  });

  it.each(expectedResults)(
    '$id 원본은 승인한 변환과 같은 노트·구간을 유지하고 구형 노트 0개로 명시 compile을 통과한다',
    ({ id }) => {
      const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === id)!;
      const legacy = TUTORIAL_PREVIEWS.find(preview => preview.id === id)!;
      // 변환기는 테스트에서만 비교 기준으로 사용한다. 실제 정의는 독립된 명시 노트 리터럴이다.
      const convertedChart = convertLegacyChart(legacy.chart).chart;
      expect(preview.chart).toEqual({
        ...convertedChart,
        meta: { ...convertedChart.meta, title: preview.title },
      });
      expect(preview.chart.notes.every(isExplicitNote)).toBe(true);
      expect(preview.renderChart.notes.every(isExplicitNote)).toBe(true);
      expect(validateChartDocument(preview.chart).canPlayExplicit).toBe(true);
      expect(compileExplicitJudgmentChart(preview.chart).format).toBe('explicit');
    },
  );

  it('Basic 10은 2박의 단독 릴리즈 1개로 떼는 순간만 판정하는 노트를 안내한다', () => {
    const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS[10];
    expect(preview.chart.notes).toEqual([
      { type: 'release', lane: 2, beat: beat(2), count: 1 },
    ]);
    expect(preview.title).toBe('릴리즈 노트');
    expect(preview.chart.meta.title).toBe(preview.title);
  });

  it('Basic 12는 1박 탭과 1～4박 바디만 두고 릴리즈 없는 롱노트로 안내한다', () => {
    const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS[12];
    expect(preview.chart.notes).toEqual([
      { type: 'tap', kind: 'single', lane: 2, beat: beat(1) },
      { type: 'body', lane: 2, beat: beat(1), endBeat: beat(4), holdCount: 1 },
    ]);
    expect(preview.title).toBe('릴리즈 없는 롱노트');
    expect(preview.chart.meta.title).toBe(preview.title);
    expect(preview.bodyLines.join(' ')).not.toMatch(/grace|holdOnly/i);
  });

  it('Basic 13은 3박의 길이 0 바디와 틱 노트로 그 순간의 유지를 안내한다', () => {
    const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS[13];
    expect(preview.chart.notes).toEqual([
      { type: 'body', lane: 2, beat: beat(3), endBeat: beat(3), holdCount: 1 },
      { type: 'tick', lane: 2, beat: beat(3), count: 1 },
    ]);
    expect(preview.title).toBe('길이가 0인 바디와 틱 노트');
    expect(preview.chart.meta.title).toBe(preview.title);
    expect(preview.bodyLines.join(' ')).not.toMatch(/grace|holdOnly|Good/i);
  });

  it.each(expectedResults)(
    '$id 시연을 2회 재생하면 매회 Perfect $perfect·Great 0·Good 0·GOOD◇ $goodTrill·Miss 0·달성률 $rate%다',
    ({ id, perfect, goodTrill, rate }) => {
      const preview = BASIC_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === id)!;
      const controller = createExplicitTutorialPreviewSessionController(
        preview.chart,
        createTutorialTimingsInputPlan(getTutorialInputTimings(preview.chart)),
        { windows: { PERFECT: 41, GREAT: 82, GOOD: 120, BAD: 160 } },
      );
      try {
        for (const iteration of [0, 1]) {
          expect(controller.iteration).toBe(iteration);
          expect(controller.session.score.processedNotes).toBe(0);
          for (let timeMs = 0; timeMs < preview.loopMs; timeMs += 16) controller.advanceTo(timeMs);
          // loopMs와 같은 시각의 릴리즈도 이전 반복에서 처리한 뒤 정산·초기화한다.
          const { score } = controller.repeat(preview.loopMs);
          expect(score.judgmentCounts).toEqual({ perfect, great: 0, good: 0, goodTrill, bad: 0, miss: 0 });
          expect(score.achievementRate).toBe(rate);
          expect(score.totalNotes).toBe(perfect + goodTrill);
          expect(score.processedNotes).toBe(perfect + goodTrill);
        }
      } finally {
        controller.dispose();
      }
    },
  );
});
