import type { JudgmentWindows } from '../../../shared/constants';
import { JUDGMENT_WINDOWS } from '../../../shared/constants';
import { beatToMs, extractBpmMarkers } from '../../../shared/timing';
import type { Chart } from '../../../shared/types';
import { compileJudgmentChart } from '../../judgment/compiledJudgmentChart';
import { NoteJudgmentSession, type NoteJudgmentSessionView } from '../../judgment/NoteJudgmentSession';
import type { TutorialInputTiming } from './tutorialPreviewChart';

interface PreviewAction { readonly timeMs: number; readonly lane: 1 | 2 | 3 | 4; readonly key: string; readonly type: 'down' | 'up'; readonly order: number }

export interface TutorialPreviewSessionController {
  readonly session: NoteJudgmentSession;
  advanceTo(timeMs: number): void;
  reset(): void;
}

function createSession(chart: Chart, windows: JudgmentWindows, onBatchConfirmed?: (view: NoteJudgmentSessionView) => void): NoteJudgmentSession {
  const bpmMarkers = extractBpmMarkers(chart.events);
  const starts = new Map(chart.notes.map((note, index) => [index, beatToMs(note.beat, bpmMarkers, chart.meta.offsetMs)] as [number, number]));
  const ends = new Map(chart.notes.flatMap((note, index) => 'endBeat' in note ? [[index, beatToMs(note.endBeat, bpmMarkers, chart.meta.offsetMs)] as [number, number]] : []));
  return new NoteJudgmentSession(compileJudgmentChart(chart.notes, starts, ends, chart.trillZones), { windows, onBatchConfirmed });
}

export function createTutorialPreviewSessionController(
  chart: Chart,
  timings: readonly TutorialInputTiming[],
  options: { windows?: JudgmentWindows; onBatchConfirmed?: (view: NoteJudgmentSessionView) => void } = {},
): TutorialPreviewSessionController {
  const windows = options.windows ?? JUDGMENT_WINDOWS;
  const actions: PreviewAction[] = timings.flatMap((timing, index) => [
    { timeMs: timing.startMs, lane: timing.event.lane, key: timing.event.keyCode, type: 'down' as const, order: index * 2 },
    { timeMs: timing.endMs, lane: timing.event.lane, key: timing.event.keyCode, type: 'up' as const, order: index * 2 + 1 },
  ]).sort((a, b) => a.timeMs - b.timeMs || a.order - b.order);
  let current = createSession(chart, windows, options.onBatchConfirmed);
  let cursor = 0;
  let time = 0;
  const controller: TutorialPreviewSessionController = {
    get session() { return current; },
    advanceTo(targetTimeMs: number) {
      const target = Math.max(0, targetTimeMs);
      if (target < time) controller.reset();
      while (cursor < actions.length && actions[cursor].timeMs <= target) {
        const at = actions[cursor].timeMs;
        const batch = [] as { key: string; lane: 1 | 2 | 3 | 4; type: 'down' | 'up' }[];
        while (cursor < actions.length && actions[cursor].timeMs === at) {
          const action = actions[cursor++]; batch.push({ key: action.key, lane: action.lane, type: action.type });
        }
        current.processBatch(at, batch);
      }
      current.advance(target);
      time = target;
    },
    reset() {
      current = createSession(chart, windows, options.onBatchConfirmed);
      cursor = 0; time = 0;
    },
  };
  return controller;
}
