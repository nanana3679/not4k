import { describe, expect, it } from 'vitest';
import { convertLegacyChart } from '../../../shared/chart/legacyConversion';
import { beat, beatEq } from '../../../shared/types/beat';
import { isExplicitNote } from '../../../shared/types/chart';
import { validateChartDocument } from '../../../shared/validation/documentValidation';
import { PRESET_BINDINGS } from '../../stores';
import { ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS } from './advancedTutorialExplicitPreviews';
import { ADVANCED_TUTORIAL_PREVIEWS } from './advancedTutorialPreviews';
import type { ExplicitTutorialPreviewDefinition } from './explicitTutorialPreviewChart';
import { createTutorialTimingsInputPlan } from './explicitTutorialPreviewPlayback';
import { createExplicitTutorialPreviewSessionController } from './explicitTutorialPreviewSession';
import { resolveTutorialInputTimingsForKeyboard, resolveTutorialKeyboardBindings } from './tutorialKeyboardLayout';
import { getTutorialDiagramEvents, getTutorialInputEvents, getTutorialInputTimings } from './tutorialPreviewChart';

const expectedResults = [
  { id: 'advanced-double-hold', perfect: 6, miss: 0, rate: 100, fullCombo: true },
  { id: 'advanced-double-swap', perfect: 6, miss: 0, rate: 100, fullCombo: true },
  { id: 'advanced-single-head-double', perfect: 5, miss: 0, rate: 100, fullCombo: true },
  { id: 'advanced-decrease', perfect: 5, miss: 0, rate: 100, fullCombo: true },
  { id: 'advanced-same-key', perfect: 3, miss: 0, rate: 100, fullCombo: true },
  { id: 'advanced-recovery', perfect: 3, miss: 1, rate: 100, fullCombo: false },
  { id: 'advanced-partial-double', perfect: 2, miss: 1, rate: 50, fullCombo: false },
  { id: 'advanced-double-release', perfect: 3, miss: 1, rate: 75, fullCombo: false },
];

function runPreviewTwice(
  preview: ExplicitTutorialPreviewDefinition,
  timings = getTutorialInputTimings(preview.chart),
) {
  const controller = createExplicitTutorialPreviewSessionController(
    preview.chart,
    createTutorialTimingsInputPlan(timings),
    { windows: { PERFECT: 41, GREAT: 82, GOOD: 120, BAD: 160 } },
  );
  try {
    return [0, 1].map(iteration => {
      expect(controller.iteration).toBe(iteration);
      expect(controller.session.score.processedNotes).toBe(0);
      for (let timeMs = 0; timeMs < preview.loopMs; timeMs += 16) controller.advanceTo(timeMs);
      const { score } = controller.repeat(preview.loopMs);
      expect(score.processedNotes).toBe(score.totalNotes);
      return score;
    });
  } finally {
    controller.dispose();
  }
}

describe('Advanced 명시 튜토리얼', () => {
  it('holdOnly 전용 4개를 제외하면 나머지 8개의 ID·순서·12박 반복·시연 입력·도식이 유지된다', () => {
    const removedIds = [
      'advanced-holdonly-decrease', 'advanced-independent-holdonly',
      'advanced-short-holdonly', 'advanced-zero-holdonly',
    ];
    const ids = ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS.map(preview => preview.id);
    expect(ids).toEqual(expectedResults.map(result => result.id));
    expect(new Set(ids).size).toBe(8);
    for (const id of removedIds) expect(ids).not.toContain(id);
    const retainedLegacy = ADVANCED_TUTORIAL_PREVIEWS.filter(preview => !removedIds.includes(preview.id));
    expect(ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS.map(preview => ({
      id: preview.id,
      loopBeats: preview.loopBeats,
      loopMs: preview.loopMs,
      inputs: getTutorialInputEvents(preview.chart),
      diagrams: getTutorialDiagramEvents(preview.chart),
    }))).toEqual(retainedLegacy.map(preview => ({
      id: preview.id,
      loopBeats: 12,
      loopMs: preview.loopMs,
      inputs: getTutorialInputEvents(preview.chart),
      diagrams: getTutorialDiagramEvents(preview.chart),
    })));
  });

  it.each(expectedResults)(
    '$id를 명시 차트로 저작하면 구형 노트 0개이고 승인한 노트·구간·이벤트를 유지한다',
    ({ id }) => {
      const preview = ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === id)!;
      const legacy = ADVANCED_TUTORIAL_PREVIEWS.find(preview => preview.id === id)!;
      // 변환기는 저작 결과를 대조하는 테스트에서만 실행한다.
      const convertedChart = convertLegacyChart(legacy.chart).chart;
      const decreaseReleases = id === 'advanced-decrease'
        ? preview.chart.notes.filter(note => note.type === 'release'
          && (beatEq(note.beat, beat(5)) || beatEq(note.beat, beat(7))))
        : [];
      expect(decreaseReleases).toEqual(id === 'advanced-decrease' ? [
        { type: 'release', lane: 1, beat: beat(5), count: 1 },
        { type: 'release', lane: 1, beat: beat(7), count: 1 },
      ] : []);
      expect({
        ...preview.chart,
        notes: preview.chart.notes.filter(note => !decreaseReleases.includes(note)),
      }).toEqual(convertedChart);
      expect(preview.engine).toBe('explicit');
      expect(preview.chart.notes.every(isExplicitNote)).toBe(true);
      expect(preview.renderChart.notes.every(isExplicitNote)).toBe(true);
      expect(validateChartDocument(preview.chart).canPlayExplicit).toBe(true);
    },
  );

  it('advanced-decrease에서 두 키를 2000～4000ms 계속 유지하면 매회 Perfect 3·Miss 2·60%이고 Full Combo가 아니다', () => {
    const preview = ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === 'advanced-decrease')!;
    // S의 새 누름 없이 Q/W를 두 감소 지점(2500ms·3500ms) 너머까지 유지하고 마지막에만 뗀다.
    const timings = getTutorialInputTimings(preview.chart)
      .filter(timing => timing.event.keyCode !== 'KeyS')
      .map(timing => ({ ...timing, endMs: 4000 }));
    for (const score of runPreviewTwice(preview, timings)) {
      expect(score.judgmentCounts).toEqual({ perfect: 3, great: 0, good: 0, goodTrill: 0, bad: 0, miss: 2 });
      expect(score.achievementRate).toBe(60);
      expect(score.isFullCombo).toBe(false);
    }
  });

  it.each(expectedResults)(
    '$id 시연을 2회 재생하면 매회 Perfect $perfect·Great 0·Good 0·Miss $miss·$rate%·Full Combo=$fullCombo다',
    ({ id, perfect, miss, rate, fullCombo }) => {
      const preview = ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === id)!;
      expect(preview, id).toBeDefined();
      expect(validateChartDocument(preview.chart).canPlayExplicit).toBe(true);
      const scores = runPreviewTwice(preview);
      for (const score of scores) {
        expect(score.judgmentCounts).toEqual({ perfect, great: 0, good: 0, goodTrill: 0, bad: 0, miss });
        expect(score.achievementRate).toBe(rate);
        expect(score.isFullCombo).toBe(fullCombo);
      }
      expect(scores[1]).toEqual(scores[0]);
    },
  );
});

// 구형 Advanced 키보드 회귀 테스트와 같은 5가지 설정으로 보충 키·재배치까지 확인한다.
const configurations = [
  { name: '기본 TKL', preset: 'tkl' as const, bindings: PRESET_BINDINGS.tkl },
  { name: '기본 Numpad', preset: 'numpad' as const, bindings: PRESET_BINDINGS.numpad },
  { name: '레인당 두 키만 배정한 설정', preset: 'tkl' as const, bindings: {
    lane1: ['KeyQ', 'KeyW'], lane2: ['KeyE', 'KeyC'], lane3: ['KeyP', 'Comma'], lane4: ['BracketLeft', 'BracketRight'],
  } },
  { name: '다른 레인이 S/X를 쓰는 사용자 배치', preset: 'tkl' as const, bindings: {
    lane1: ['KeyA', 'KeyF'], lane2: ['KeyS', 'KeyX'], lane3: ['KeyJ', 'KeyK'], lane4: ['KeyL', 'Semicolon'],
  } },
  { name: 'W를 첫 번째 키로 옮긴 사용자 배치', preset: 'tkl' as const, bindings: {
    lane1: ['KeyW', 'KeyA'], lane2: ['KeyE', 'KeyC'], lane3: ['KeyP', 'Comma'], lane4: ['BracketLeft', 'BracketRight'],
  } },
];

describe.each(configurations)('$name에서 Advanced 명시 시연', ({ preset, bindings }) => {
  it.each(expectedResults)(
    '$id를 재배치해 16ms 프레임으로 2회 재생하면 원본의 Perfect $perfect·Miss $miss·$rate%·Full Combo=$fullCombo가 유지된다',
    ({ id }) => {
      const preview = ADVANCED_TUTORIAL_EXPLICIT_PREVIEWS.find(preview => preview.id === id)!;
      const originalBindings = structuredClone(bindings);
      const source = getTutorialInputTimings(preview.chart);
      const resolved = resolveTutorialKeyboardBindings(source, bindings, preset);
      const mapped = resolveTutorialInputTimingsForKeyboard(source, resolved.bindings);
      expect(runPreviewTwice(preview, mapped)).toEqual(runPreviewTwice(preview, source));
      expect(bindings).toEqual(originalBindings);
      const keys = Object.values(resolved.bindings).flat();
      expect(new Set(keys).size).toBe(keys.length);
    },
  );
});
