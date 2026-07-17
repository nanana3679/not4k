import type { Chart } from '../../../shared/types';
import { createChartTiming, type ChartTiming } from '../../../shared/timing/chartTiming';
import type { Lane } from '../../../shared/constants';
import { JUDGMENT_WINDOWS, type JudgmentWindows } from '../../../shared/constants';
import {
  JudgmentEngine,
  type JudgmentCallbacks,
} from '../../judgment/JudgmentEngine';
import type { TutorialInputTiming } from './tutorialPreviewChart';

type TutorialPreviewJudgmentActionType = 'press' | 'release';

interface TutorialPreviewJudgmentAction {
  type: TutorialPreviewJudgmentActionType;
  timeMs: number;
  lane: Lane;
  keyCode: string;
}

export interface TutorialPreviewJudgmentController {
  advanceTo(songTimeMs: number): void;
  reset(): void;
}

function compareTutorialPreviewJudgmentActions(
  a: TutorialPreviewJudgmentAction,
  b: TutorialPreviewJudgmentAction,
): number {
  if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
  if (a.lane === b.lane && a.keyCode === b.keyCode && a.type !== b.type) {
    return a.type === 'release' ? -1 : 1;
  }
  if (a.type !== b.type) return a.type === 'press' ? -1 : 1;
  return a.keyCode.localeCompare(b.keyCode);
}

function createTutorialPreviewJudgmentActions(
  timings: readonly TutorialInputTiming[],
): TutorialPreviewJudgmentAction[] {
  return timings.flatMap(({ event, startMs, endMs }) => [
    {
      type: 'press' as const,
      timeMs: startMs,
      lane: event.lane as Lane,
      keyCode: event.keyCode,
    },
    {
      type: 'release' as const,
      timeMs: endMs,
      lane: event.lane as Lane,
      keyCode: event.keyCode,
    },
  ]).sort(compareTutorialPreviewJudgmentActions);
}

function getTutorialPreviewLoopDurationMs(
  chart: Chart,
  timing: ChartTiming,
  actions: readonly TutorialPreviewJudgmentAction[],
): number {
  const timeSignature = chart.events.find((event) => event.type === 'timeSignature');

  if (timeSignature) {
    return timing.beatToMs(timeSignature.beatPerMeasure) -
      timing.beatToMs({ n: 0, d: 1 });
  }

  return Math.max(0, ...actions.map((action) => action.timeMs));
}

export function createTutorialPreviewJudgmentController(
  chart: Chart,
  timings: readonly TutorialInputTiming[],
  callbacks: JudgmentCallbacks,
  windows: JudgmentWindows = JUDGMENT_WINDOWS,
): TutorialPreviewJudgmentController {
  const timing = createChartTiming(chart);
  const { noteTimesMs, noteEndTimesMs, trillZoneStartTimesMs } = timing;
  const actions = createTutorialPreviewJudgmentActions(timings);
  const loopDurationMs = getTutorialPreviewLoopDurationMs(chart, timing, actions);
  let engine = new JudgmentEngine(
    chart.notes,
    noteTimesMs,
    noteEndTimesMs,
    callbacks,
    windows,
    trillZoneStartTimesMs,
  );
  let nextActionIndex = 0;
  let previousSongTimeMs = 0;

  const reset = () => {
    engine = new JudgmentEngine(
      chart.notes,
      noteTimesMs,
      noteEndTimesMs,
      callbacks,
      windows,
      trillZoneStartTimesMs,
    );
    nextActionIndex = 0;
    previousSongTimeMs = 0;
  };

  const processUntil = (songTimeMs: number) => {
    while (nextActionIndex < actions.length && actions[nextActionIndex].timeMs <= songTimeMs) {
      const action = actions[nextActionIndex];
      engine.update(action.timeMs);
      if (action.type === 'press') {
        engine.onLanePress(action.lane, action.timeMs, action.keyCode);
      } else {
        engine.onLaneRelease(action.lane, action.timeMs, action.keyCode);
      }
      engine.update(action.timeMs);
      nextActionIndex++;
    }

    engine.update(songTimeMs);
  };

  const advanceTo = (songTimeMs: number) => {
    const targetTimeMs = Math.max(0, Math.min(songTimeMs, loopDurationMs));

    if (targetTimeMs < previousSongTimeMs) {
      processUntil(loopDurationMs);
      reset();
    }

    processUntil(targetTimeMs);
    previousSongTimeMs = targetTimeMs;
  };

  return {
    advanceTo,
    reset,
  };
}
