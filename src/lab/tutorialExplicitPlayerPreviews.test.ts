import { describe, expect, it, vi } from 'vitest';
import { compileExplicitJudgmentChart } from '../game/judgment/explicitCompiledChart';
import { isExplicitTutorialPreview } from '../game/screens/songSelect/explicitTutorialPreviewChart';
import {
  createExplicitTutorialPreviewPlayback,
  createTutorialTimingsInputPlan,
} from '../game/screens/songSelect/explicitTutorialPreviewPlayback';
import { resolveTutorialInputTimingsForKeyboard } from '../game/screens/songSelect/tutorialKeyboardLayout';
import { TUTORIAL_PREVIEWS, getTutorialInputTimings } from '../game/screens/songSelect/tutorialPreviewChart';
import { tutorialExplicitPlayerPreviews } from './tutorialExplicitPlayerPreviews';

// gameStore 기본 TKL 바인딩과 Numpad처럼 레인별 키가 다른 바인딩 — 재생기가 시연 키를 옮기는 두 경로
const BINDINGS = {
  tkl: {
    lane1: ['KeyQ', 'KeyW', 'KeyS', 'KeyX'],
    lane2: ['KeyE', 'KeyD', 'KeyC', 'KeyO'],
    lane3: ['KeyP', 'KeyL', 'Comma', 'KeyR'],
    lane4: ['BracketLeft', 'BracketRight', 'Semicolon', 'Period'],
  },
  numpad: {
    lane1: ['KeyA', 'KeyS'],
    lane2: ['KeyD', 'KeyF'],
    lane3: ['Numpad4', 'Numpad5'],
    lane4: ['Numpad6', 'Numpad3'],
  },
};

describe('명시 튜토리얼 재생기 Lab 시연', () => {
  it('싱글 탭·더블 탭·바디 릴리즈·트릴 교대 4개는 모두 명시 정의이고, 공개 튜토리얼 목록은 여전히 구형 정의만 가짐', () => {
    expect(tutorialExplicitPlayerPreviews.map(({ preview }) => preview.id)).toEqual(['tap', 'double-tap', 'body-release', 'trill']);
    expect(tutorialExplicitPlayerPreviews.every(({ preview }) => isExplicitTutorialPreview(preview))).toBe(true);
    expect(TUTORIAL_PREVIEWS.some(isExplicitTutorialPreview)).toBe(false);
  });

  it.each(tutorialExplicitPlayerPreviews.map(({ preview }) => [preview.id, preview] as const))(
    '%s 원본과 3벌 표시 문서는 변환 없이 명시 compile을 통과',
    (_id, preview) => {
      expect(compileExplicitJudgmentChart(preview.chart).format).toBe('explicit');
      expect(compileExplicitJudgmentChart(preview.renderChart).scoreItems).toHaveLength(
        compileExplicitJudgmentChart(preview.chart).scoreItems.length * 3,
      );
    },
  );

  it.each(tutorialExplicitPlayerPreviews.flatMap(({ preview, expectedPerfectCount }) =>
    (['tkl', 'numpad'] as const).map((binding) => [preview.id, binding, expectedPerfectCount, preview] as const)))(
    '%s를 %s 바인딩으로 옮긴 시연 입력으로 두 반복을 재생하면 반복마다 Perfect %i·Miss 0·goodTrill 0',
    (_id, binding, expectedPerfectCount, preview) => {
      const timings = resolveTutorialInputTimingsForKeyboard(getTutorialInputTimings(preview.chart), BINDINGS[binding]);
      const playback = createExplicitTutorialPreviewPlayback(preview, createTutorialTimingsInputPlan(timings), {
        showJudgmentGroup: vi.fn(), recordFlightJudgment: vi.fn(), showBombEffect: vi.fn(),
      });
      for (const iteration of [0, 1]) {
        for (let time = 0; time < preview.loopMs; time += 16) playback.advanceTo(time);
        const finished = playback.finishPattern();
        expect(finished.iteration).toBe(iteration);
        expect(finished.result.score.judgmentCounts).toMatchObject({ perfect: expectedPerfectCount, miss: 0 });
        expect(finished.result.score.goodTrillCount).toBe(0);
        expect(finished.result.score.processedNotes).toBe(expectedPerfectCount);
      }
      playback.stop();
    },
  );
});
