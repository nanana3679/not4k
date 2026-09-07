import { describe, expect, it } from 'vitest';
import { TUTORIAL_PREVIEWS, getTutorialInputTimings } from './tutorialPreviewChart';
import { createTutorialPreviewSessionController } from './tutorialPreviewSession';

describe('tutorialPreviewSession', () => {
  it('각 timing batch를 NoteJudgmentSession에 전달하면 정상 preview는 Miss 없이 100%를 유지한다', () => {
    for (const preview of TUTORIAL_PREVIEWS) {
      const controller = createTutorialPreviewSessionController(preview.chart, getTutorialInputTimings(preview.chart));
      controller.advanceTo(preview.loopMs);
      const state = controller.session.score.getState();
      if (state.totalNotes === 0) {
        expect(state.achievementRate, preview.id).toBe(0);
        continue;
      }
      expect(state.judgmentCounts.miss, preview.id).toBe(0);
      // trill-note intentionally demonstrates repeated-key goodTrill, whose
      // score is one point rather than Perfect; its legacy expectation is 75%.
      expect(state.achievementRate, preview.id).toBe(preview.id === 'trill-note' ? 75 : 100);
    }
  });

  it('같은 timing down/up은 배열 순서를 유지하고 reset loop는 새 session 상태로 재생한다', () => {
    const preview = TUTORIAL_PREVIEWS.find(item => item.id === 'zero-length-hold-only-long-note');
    if (!preview) throw new Error('zero-length-hold-only-long-note preview missing');
    const controller = createTutorialPreviewSessionController(preview.chart, getTutorialInputTimings(preview.chart));
    controller.advanceTo(preview.loopMs);
    const first = controller.session;
    controller.advanceTo(0);
    expect(controller.session).not.toBe(first);
    expect(controller.session.events.length).toBe(0);
  });

  it('두 번째 loop도 첫 번째와 같은 입력 batch·판정 이벤트·점수 통계를 재현한다', () => {
    const preview = TUTORIAL_PREVIEWS.find(item => item.id === 'single-note');
    if (!preview) throw new Error('single-note preview missing');
    const controller = createTutorialPreviewSessionController(preview.chart, getTutorialInputTimings(preview.chart));

    controller.advanceTo(preview.loopMs);
    const firstEvents = controller.session.events.map(({ kind, noteIndex, unitIndex, grade, deltaMs }) =>
      ({ kind, noteIndex, unitIndex, grade, deltaMs }));
    const firstScore = controller.session.score.getState();

    controller.advanceTo(0);
    controller.advanceTo(preview.loopMs);
    const secondEvents = controller.session.events.map(({ kind, noteIndex, unitIndex, grade, deltaMs }) =>
      ({ kind, noteIndex, unitIndex, grade, deltaMs }));
    const secondScore = controller.session.score.getState();

    expect(secondEvents).toEqual(firstEvents);
    expect(secondScore).toEqual(firstScore);
  });

  it('3970ms에서 loop 경계를 지나면 4000ms tail release를 먼저 정산하고 0ms 새 session은 비운다', () => {
    const preview = TUTORIAL_PREVIEWS.find(item => item.id === 'connected-long-note-overlap');
    if (!preview) throw new Error('connected-long-note-overlap preview missing');
    const controller = createTutorialPreviewSessionController(preview.chart, getTutorialInputTimings(preview.chart));

    controller.advanceTo(preview.loopMs - 30);
    const beforeBoundary = controller.session.events.length;
    controller.advanceTo(preview.loopMs);
    const boundaryEvents = controller.session.events;
    expect(boundaryEvents.length).toBeGreaterThan(beforeBoundary);
    expect(boundaryEvents.some(event =>
      event.kind === 'release' &&
      event.grade === 'perfect' &&
      event.inputAt === preview.loopMs &&
      event.confirmedAt === preview.loopMs &&
      event.consumed === true,
    )).toBe(true);
    expect(controller.session.score.getState().achievementRate).toBe(100);
    expect(controller.session.score.getState().judgmentCounts.miss).toBe(0);

    controller.advanceTo(0);
    expect(controller.session.events).toHaveLength(0);
  });
});
