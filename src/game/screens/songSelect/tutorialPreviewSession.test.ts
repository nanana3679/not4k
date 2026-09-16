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

describe('tutorialPreviewSession의 Basic 신규 시연', () => {
  it('connected-trill-long 입력을 새 NoteJudgmentSession으로 재생하면 정산 결과를 안정적으로 만든다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'connected-trill-long');
    expect(preview).toBeDefined();
    const controller = createTutorialPreviewSessionController(preview!.chart, getTutorialInputTimings(preview!.chart));
    controller.advanceTo(preview!.loopMs);
    expect(controller.session.score.getState()).toMatchObject({
      totalNotes: 6,
      processedNotes: 6,
      earnedScore: 18,
      achievementRate: 100,
      isFullCombo: true,
      judgmentCounts: { perfect: 6, miss: 0 },
    });
    expect(controller.session.events.map((event) => [event.kind, event.noteIndex, event.inputAt])).toEqual([
      ['head', 0, 1000],
      ['head', 2, 1500],
      ['release', 3, 2000],
      ['head', 4, 2500],
      ['head', 6, 3000],
      ['release', 7, 3500],
    ]);
  });

  it('rest-zone 입력을 새 NoteJudgmentSession으로 재생하면 모든 트릴 입력을 정산한다', () => {
    const preview = TUTORIAL_PREVIEWS.find((item) => item.id === 'rest-zone');
    expect(preview).toBeDefined();
    const controller = createTutorialPreviewSessionController(preview!.chart, getTutorialInputTimings(preview!.chart));
    controller.advanceTo(preview!.loopMs);
    expect(controller.session.score.getState()).toMatchObject({
      totalNotes: 8,
      processedNotes: 8,
      earnedScore: 24,
      achievementRate: 100,
      isFullCombo: true,
      judgmentCounts: { perfect: 8, miss: 0, goodTrill: 0 },
    });
    expect(controller.session.events.map((event) => event.inputAt)).toEqual([
      1000, 1125, 1250, 1375, 3000, 3125, 3250, 3375,
    ]);
  });
});
