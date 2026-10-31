/**
 * 타이밍 값 수정 뒤 재생 커서의 박 유지(RFD 0099).
 *
 * 정지 중 오프셋·BPM 값이나 BPM 변경 이벤트가 바뀌면, 수정 전 타이밍으로 지금 커서의 박을 구하고
 * 수정 후 타이밍에서 같은 박의 음원 시각으로 커서를 옮긴다. 다시 재생하면 그 위치부터 시작한다.
 * 기준은 수정 직전의 커서이므로, 일시정지 뒤 seek했다면 seek한 위치의 박을 유지한다.
 * 박자표는 박↔음원 시각 변환에 쓰지 않아 커서를 옮기지 않는다.
 */

import type { BpmChange, ChartDocument } from '../../shared';
import { beatEq, beatFloatToMs, extractBpmChanges, msToBeat } from '../../shared';

/** 박↔음원 시각 변환을 정하는 곡 타이밍 값. 박자표는 이 변환에 쓰지 않아 담지 않는다. */
export interface BeatMsTiming {
  readonly bpmChanges: readonly BpmChange[];
  readonly offsetMs: number;
}

/** 이 차이 미만이면 왕복 계산의 부동소수점 오차로 보고 커서 시각을 바꾸지 않는다. */
const UNCHANGED_TOLERANCE_MS = 1e-6;

export function beatMsTimingOf(chart: Pick<ChartDocument, 'events' | 'meta'>): BeatMsTiming {
  return { bpmChanges: extractBpmChanges(chart.events), offsetMs: chart.meta.offsetMs };
}

/** 오프셋과 BPM 변경 목록(박·BPM)이 값으로 같은가. 배열 참조는 보지 않는다. */
export function sameBeatMsTiming(a: BeatMsTiming, b: BeatMsTiming): boolean {
  return a.offsetMs === b.offsetMs
    && a.bpmChanges.length === b.bpmChanges.length
    && a.bpmChanges.every((change, i) => change.bpm === b.bpmChanges[i].bpm && beatEq(change.beat, b.bpmChanges[i].beat));
}

/**
 * 수정 전 타이밍(before)에서 커서 시각의 박을 구해, 수정 후 타이밍(after)에서 같은 박의 음원 시각을 돌려준다.
 * 박을 해상도로 반올림하지 않으며 0박보다 앞(음수 박)도 같은 규칙으로 옮긴다.
 * 타이밍이 값으로 같거나, BPM 목록이 비었거나(구조 위반 차트), 결과가 유한하지 않으면 커서 시각을 그대로 돌려준다.
 */
export function remapCursorMs(cursorMs: number, before: BeatMsTiming, after: BeatMsTiming): number {
  if (sameBeatMsTiming(before, after)) return cursorMs;
  if (before.bpmChanges.length === 0 || after.bpmChanges.length === 0) return cursorMs;
  const cursorBeat = msToBeat(cursorMs, before.bpmChanges, before.offsetMs);
  const remapped = beatFloatToMs(cursorBeat, after.bpmChanges, after.offsetMs);
  if (!Number.isFinite(remapped)) return cursorMs;
  return Math.abs(remapped - cursorMs) < UNCHANGED_TOLERANCE_MS ? cursorMs : remapped;
}

/** 커서 박 유지에 필요한 재생기 기능. `PlaybackController`가 그대로 맞는다. */
export interface CursorBeatKeeperPlayback {
  readonly isPlaying: boolean;
  /** 재생 시작 위치와 store의 `currentTimeMs`를 함께 옮긴다. */
  seekTo(timeMs: number): void;
}

export interface CursorBeatKeeper {
  /**
   * 차트가 바뀔 때마다 부른다. 직전에 본 차트와 비교해 정지 중 타이밍이 바뀌었으면
   * 커서를 수정 직전 박의 새 시각(clampMs로 마디 범위에 맞춘 값)으로 seek한다.
   * - `loadGeneration`(store의 `chartLoadGeneration`)이 달라졌으면 새로 불러온 차트라 편집으로 보지 않는다.
   * - 재생 중이거나 재생기가 없으면 seek하지 않는다. 어느 경우든 다음 비교의 기준은 이 차트로 바뀐다.
   */
  chartChanged(input: {
    chart: Pick<ChartDocument, 'events' | 'meta'>;
    loadGeneration: number;
    /**
     * 수정 직전 커서 시각. store의 `currentTimeMs`(화면의 커서이자 테스트 플레이 '커서부터'의 시작 위치)를 넘긴다.
     * 테스트 플레이에서 돌아오면 새 재생기는 0에서 시작하지만 store의 커서는 남아 있으므로 재생기 위치를 쓰지 않는다.
     */
    cursorMs: number;
    playback: CursorBeatKeeperPlayback | null;
    clampMs: (timeMs: number) => number;
  }): void;
}

export function createCursorBeatKeeper(initial: {
  chart: Pick<ChartDocument, 'events' | 'meta'>;
  loadGeneration: number;
}): CursorBeatKeeper {
  let previous = { timing: beatMsTimingOf(initial.chart), loadGeneration: initial.loadGeneration };

  return {
    chartChanged({ chart, loadGeneration, cursorMs, playback, clampMs }) {
      const before = previous;
      const timing = beatMsTimingOf(chart);
      previous = { timing, loadGeneration };

      if (loadGeneration !== before.loadGeneration) return;
      // 재생 중 타이밍 변경은 여기서 다루지 않는다(재생 중 값 수정 차단은 별도 작업, RFD 0099).
      if (!playback || playback.isPlaying) return;

      const remapped = remapCursorMs(cursorMs, before.timing, timing);
      if (remapped === cursorMs) return;
      playback.seekTo(clampMs(remapped));
    },
  };
}
