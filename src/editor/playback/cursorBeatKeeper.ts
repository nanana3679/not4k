/**
 * 타이밍 값 수정 뒤 재생 커서의 박 유지(RFD 0099).
 *
 * 정지 중 오프셋·BPM 값이나 BPM 변경 이벤트가 바뀌면, 수정 전 타이밍으로 지금 커서의 박을 구하고
 * 수정 후 타이밍에서 같은 박의 음원 시각으로 커서를 옮긴다. 다시 재생하면 그 위치부터 시작한다.
 * 기준은 수정 직전의 커서이므로, 일시정지 뒤 seek했다면 seek한 위치의 박을 유지한다.
 * 박자표는 박↔음원 시각 변환에 쓰지 않아 커서를 옮기지 않는다.
 *
 * 옮긴 시각은 타임라인 범위(`timelineRange.ts`, 아래 끝 min(0, offsetMs))로 자른다. 잘리면 커서 시각으로는
 * 원래 박을 다시 구할 수 없으므로, 마지막으로 옮긴 커서의 박을 기억해 두고 사용자가 커서를 옮기지 않은 채
 * 다음 타이밍 변경이 오면 그 박에서 다시 옮긴다. 드래그 중간 프레임이나 수정에서 범위 끝에 묶였던 커서가
 * Escape·Undo로 타이밍이 돌아오면 원래 박으로 돌아온다.
 */

import type { BpmChange, ChartDocument } from '../../shared';
import { beatEq, beatFloatToMs, beatIsZero, extractBpmChanges, msToBeat } from '../../shared';
import type { TimelineRangeMs } from '../stores/viewportSlice';
import { clampToTimelineRange } from '../timeline/timelineRange';

/**
 * 박↔음원 시각 변환을 정하는 값(BPM 변경 목록·음원 정렬 오프셋)만 담은 비교용 값.
 * 노트·마디 시각까지 파생하는 `ChartTiming`과 달리 변환만 하며, glossary의 곡 타이밍과 달리 박자표는 담지 않는다.
 */
export interface BeatMsTiming {
  readonly bpmChanges: readonly BpmChange[];
  readonly offsetMs: number;
}

/** 이 차이 미만이면 왕복 계산의 부동소수점 오차로 보고 같은 커서 시각으로 본다. */
const SAME_MS_TOLERANCE = 1e-6;

function sameMs(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_MS_TOLERANCE;
}

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
 * 커서 박 유지가 다룰 수 있는 타이밍인가. BPM 변경이 있고 첫 변경이 0박에 있어야 한다.
 * `msToBeat`·`beatFloatToMs`는 첫 변경을 0박으로 세고 `beatToMs`는 첫 변경의 박부터 세므로,
 * 첫 변경이 0박이 아닌 구조 위반 차트에서는 두 계산이 다른 박을 가리킨다.
 */
function convertibleTiming(timing: BeatMsTiming): boolean {
  return timing.bpmChanges.length > 0 && beatIsZero(timing.bpmChanges[0].beat);
}

/** 박을 이 타이밍의 음원 시각으로 옮긴다. 결과가 유한하지 않으면 null. */
function msAtBeat(cursorBeat: number, timing: BeatMsTiming): number | null {
  const ms = beatFloatToMs(cursorBeat, timing.bpmChanges, timing.offsetMs);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * 수정 전 타이밍(before)에서 커서 시각의 박을 구해, 수정 후 타이밍(after)에서 같은 박의 음원 시각을 돌려준다.
 * 박을 해상도로 반올림하지 않으며 0박보다 앞(음수 박)도 같은 규칙으로 옮긴다.
 * 타이밍이 값으로 같거나, BPM 목록이 비었거나 첫 BPM 변경이 0박에 없거나(구조 위반 차트), 결과가 유한하지 않으면
 * 커서 시각을 그대로 돌려준다. 타임라인 범위로 자르지 않는다.
 */
export function remapCursorMs(cursorMs: number, before: BeatMsTiming, after: BeatMsTiming): number {
  if (sameBeatMsTiming(before, after)) return cursorMs;
  if (!convertibleTiming(before) || !convertibleTiming(after)) return cursorMs;
  const remapped = msAtBeat(msToBeat(cursorMs, before.bpmChanges, before.offsetMs), after);
  if (remapped === null || sameMs(remapped, cursorMs)) return cursorMs;
  return remapped;
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
   * 커서를 수정 직전 박의 새 시각(타임라인 범위로 자른 값)으로 seek한다.
   * - 직전 호출이 옮긴(또는 그대로 둔) 커서가 그 자리 그대로면, 커서 시각 대신 그때 기억한 박에서 옮긴다.
   *   범위에 잘려 시각에서 박을 되살릴 수 없을 때도 원래 박으로 돌아오게 하기 위해서다.
   *   사용자가 커서를 옮겼으면(시각이 다르면) 기억한 박을 버리고 지금 커서 시각에서 박을 구한다.
   * - `loadGeneration`(store의 `chartLoadGeneration`)이 달라졌으면 새로 불러온 차트라 편집으로 보지 않는다.
   * - 재생 중이거나 재생기가 없으면 seek하지 않는다. 어느 경우든 다음 비교의 기준은 이 차트로 바뀌고 기억한 박은 버린다.
   */
  syncToChart(input: {
    chart: Pick<ChartDocument, 'events' | 'meta'>;
    loadGeneration: number;
    /**
     * 수정 직전 커서 시각. store의 `currentTimeMs`(화면의 커서이자 테스트 플레이 '커서부터'의 시작 위치)를 넘긴다.
     * 테스트 플레이에서 돌아오면 새 재생기는 0에서 시작하지만 store의 커서는 남아 있으므로 재생기 위치를 쓰지 않는다.
     */
    cursorMs: number;
    playback: CursorBeatKeeperPlayback | null;
    /** 이 차트의 타임라인 범위. 렌더러가 아직 없으면 null이고 자르지 않는다. */
    timelineRange: TimelineRangeMs | null;
  }): void;
}

/** 마지막으로 옮긴(또는 그대로 둔) 커서의 박과 그때의 커서 시각. 범위로 자르기 전의 박이다. */
interface CursorBeatAnchor {
  readonly cursorBeat: number;
  readonly cursorMs: number;
}

export function createCursorBeatKeeper(initial: {
  chart: Pick<ChartDocument, 'events' | 'meta'>;
  loadGeneration: number;
}): CursorBeatKeeper {
  let previous = { timing: beatMsTimingOf(initial.chart), loadGeneration: initial.loadGeneration };
  let anchor: CursorBeatAnchor | null = null;

  return {
    syncToChart({ chart, loadGeneration, cursorMs, playback, timelineRange }) {
      const before = previous;
      const timing = beatMsTimingOf(chart);
      previous = { timing, loadGeneration };
      // 기억한 박은 커서가 그 자리 그대로일 때만 쓴다. 아래에서 다시 세우지 않으면 버린다.
      const kept = anchor !== null && sameMs(anchor.cursorMs, cursorMs) ? anchor : null;
      anchor = null;

      if (loadGeneration !== before.loadGeneration) return;
      // 재생 중 타이밍 변경은 여기서 다루지 않는다(재생 중 값 수정 차단은 별도 작업, RFD 0099).
      // 재생은 커서를 움직이므로 기억한 박도 버린다.
      if (!playback || playback.isPlaying) return;
      if (sameBeatMsTiming(before.timing, timing)) {
        anchor = kept;
        return;
      }
      if (!convertibleTiming(before.timing) || !convertibleTiming(timing)) return;

      const cursorBeat = kept?.cursorBeat ?? msToBeat(cursorMs, before.timing.bpmChanges, before.timing.offsetMs);
      const remapped = msAtBeat(cursorBeat, timing);
      if (remapped === null) return;
      const targetMs = timelineRange ? clampToTimelineRange(remapped, timelineRange) : remapped;
      if (sameMs(targetMs, cursorMs)) {
        anchor = { cursorBeat, cursorMs };
        return;
      }
      playback.seekTo(targetMs);
      anchor = { cursorBeat, cursorMs: targetMs };
    },
  };
}
