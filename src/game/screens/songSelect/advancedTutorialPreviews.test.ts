import { describe, expect, it } from 'vitest';
import { validateChart } from '../../../shared/validation';
import { beatToMs, extractBpmMarkers } from '../../../shared/timing';
import { createTutorialPreviewSessionController } from './tutorialPreviewSession';
import { getTutorialInputTimings } from './tutorialPreviewChart';
import { ADVANCED_TUTORIAL_PREVIEWS } from './advancedTutorialPreviews';

const expected: Record<string, { perfect: number; miss: number; rate: number; fullCombo: boolean }> = {
  'advanced-double-hold': { perfect: 6, miss: 0, rate: 100, fullCombo: true },
  'advanced-double-swap': { perfect: 6, miss: 0, rate: 100, fullCombo: true },
  'advanced-single-head-double': { perfect: 5, miss: 0, rate: 100, fullCombo: true },
  'advanced-decrease': { perfect: 5, miss: 0, rate: 100, fullCombo: true },
  'advanced-holdonly-decrease': { perfect: 7, miss: 0, rate: 100, fullCombo: true },
  'advanced-same-key': { perfect: 3, miss: 0, rate: 100, fullCombo: true },
  'advanced-recovery': { perfect: 3, miss: 1, rate: 100, fullCombo: false },
  'advanced-partial-double': { perfect: 2, miss: 1, rate: 50, fullCombo: false },
  'advanced-independent-holdonly': { perfect: 1, miss: 1, rate: 50, fullCombo: false },
  'advanced-short-holdonly': { perfect: 1, miss: 0, rate: 100, fullCombo: true },
  'advanced-zero-holdonly': { perfect: 2, miss: 0, rate: 100, fullCombo: true },
  'advanced-double-release': { perfect: 3, miss: 1, rate: 75, fullCombo: false },
};

describe('Advanced tutorial previews', () => {
  it('12개 고급 preview는 고유 ID·BPM120·리드인·차트 validation을 만족한다', () => {
    expect(ADVANCED_TUTORIAL_PREVIEWS).toHaveLength(12);
    expect(new Set(ADVANCED_TUTORIAL_PREVIEWS.map(preview => preview.id)).size).toBe(12);
    for (const preview of ADVANCED_TUTORIAL_PREVIEWS) {
      expect(validateChart(preview.chart)).toEqual([]);
      expect(extractBpmMarkers(preview.chart.events)[0].bpm).toBe(120);
      expect(Math.min(...preview.chart.notes.map(note => beatToMs(note.beat, extractBpmMarkers(preview.chart.events))))).toBeGreaterThanOrEqual(2000);
    }
  });

  it('모든 tutorialInput은 실제 down/up 쌍이고 같은 키의 물리 overlap이 없다', () => {
    for (const preview of ADVANCED_TUTORIAL_PREVIEWS) {
      const byKey = new Map<string, ReturnType<typeof getTutorialInputTimings>>();
      for (const timing of getTutorialInputTimings(preview.chart)) {
        const key = `${timing.event.lane}:${timing.event.keyCode}`;
        const timings = byKey.get(key) ?? [];
        timings.push(timing);
        byKey.set(key, timings);
      }
      for (const timings of byKey.values()) {
        timings.sort((a, b) => a.startMs - b.startMs);
        let previousEnd = -Infinity;
        for (const timing of timings) {
          expect(timing.endMs - timing.startMs).toBeGreaterThanOrEqual(20);
          expect(timing.startMs).toBeGreaterThanOrEqual(previousEnd);
          previousEnd = timing.endMs;
        }
      }
    }
  });

  it.each(ADVANCED_TUTORIAL_PREVIEWS.map(preview => ({ preview, id: preview.id, ...expected[preview.id] })))(
    '$id를 두 번 반복하면 각각 Perfect $perfect·Miss $miss·$rate%·Full Combo=$fullCombo이다',
    ({ preview, perfect, miss, rate, fullCombo }) => {
      const controller = createTutorialPreviewSessionController(preview.chart, getTutorialInputTimings(preview.chart));
      controller.advanceTo(preview.loopMs);
      const first = controller.session.score.getState();
      expect(first.judgmentCounts).toEqual({ perfect, great: 0, good: 0, goodTrill: 0, bad: 0, miss });
      expect(first.achievementRate).toBe(rate);
      expect(first.isFullCombo).toBe(fullCombo);
      controller.advanceTo(0);
      expect(controller.session.events).toEqual([]);
      controller.advanceTo(preview.loopMs);
      expect(controller.session.score.getState()).toEqual(first);
    },
  );
});
