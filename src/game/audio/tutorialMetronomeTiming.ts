import { createChartTiming, type ChartTimingSource } from '../../shared/timing/chartTiming';
import { bpmAt, extractBpmChanges } from '../../shared/timing';
import { beat } from '../../shared/types/beat';

export interface TutorialClick { atMs: number; accent: boolean }
export interface TutorialMetronomePattern {
  beats: TutorialClick[];
  countIn: TutorialClick[];
  countInMs: number;
  loopMs: number;
}

export function createTutorialMetronomePattern(chart: ChartTimingSource, loopMs: number): TutorialMetronomePattern {
  const timing = createChartTiming(chart);
  const measures = timing.measureStartsMs(loopMs);
  const beats: TutorialClick[] = [];
  for (let index = 0; ; index++) {
    const atMs = timing.beatToMs(beat(index));
    if (atMs >= loopMs) break;
    if (atMs >= 0) beats.push({ atMs, accent: measures.some(start => Math.abs(start - atMs) < 0.001) });
  }
  const beatMs = 60000 / bpmAt(beat(0), extractBpmChanges(chart.events));
  return { beats, loopMs, countInMs: 4 * beatMs,
    countIn: Array.from({ length: 4 }, (_, index) => ({ atMs: (index - 4) * beatMs, accent: index === 0 })),
  };
}

/** [fromMs, untilMs) 사이의 절대 루프 시각. 타이머 지연을 다음 박에 누적하지 않는다. */
export function getTutorialClicks(pattern: TutorialMetronomePattern, fromMs: number, untilMs: number): TutorialClick[] {
  const clicks = pattern.countIn.filter(click => click.atMs >= fromMs && click.atMs < untilMs);
  for (let iteration = Math.max(0, Math.floor(fromMs / pattern.loopMs)); iteration * pattern.loopMs < untilMs; iteration++) {
    for (const click of pattern.beats) {
      const atMs = iteration * pattern.loopMs + click.atMs;
      if (atMs >= fromMs && atMs < untilMs) clicks.push({ ...click, atMs });
    }
  }
  return clicks;
}

export interface TutorialAudioClockSample {
  audioTime: number;
  performanceTime: number;
  latencyMs: number;
  outputTimestamp?: { contextTime?: number; performanceTime?: number };
}

function audibleAnchor(sample: TutorialAudioClockSample) {
  const stamp = sample.outputTimestamp;
  // 브라우저가 아직 출력을 시작하지 않았을 때의 0/0 값은 보정 기준이 아니다.
  if (stamp && Number.isFinite(stamp.contextTime) && Number.isFinite(stamp.performanceTime)
    && stamp.contextTime! > 0 && stamp.performanceTime! > 0) {
    return { audio: stamp.contextTime!, performance: stamp.performanceTime! };
  }
  return { audio: sample.audioTime, performance: sample.performanceTime + sample.latencyMs };
}

/** 들릴 performance 시각 → 예약할 AudioContext 시각. timestamp에는 이미 출력 지연이 포함된다. */
export function tutorialAudioTime(performanceTime: number, sample: TutorialAudioClockSample): number {
  const anchor = audibleAnchor(sample);
  return anchor.audio + (performanceTime - anchor.performance) / 1000;
}

export function tutorialPerformanceTime(audioTime: number, sample: TutorialAudioClockSample): number {
  const anchor = audibleAnchor(sample);
  return anchor.performance + (audioTime - anchor.audio) * 1000;
}
