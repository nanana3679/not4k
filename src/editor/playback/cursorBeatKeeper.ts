/**
 * 타이밍 값 수정 뒤 재생 커서의 박 유지(RFD 0099).
 *
 * 정지 중 오프셋·BPM 값이나 BPM 변경 이벤트가 바뀌면, 수정 전 타이밍으로 지금 커서의 박을 구하고
 * 수정 후 타이밍에서 같은 박의 음원 시각으로 커서를 옮긴다. 다시 재생하면 그 위치부터 시작한다.
 * 기준은 수정 직전의 커서이므로, 일시정지 뒤 seek했다면 seek한 위치의 박을 유지한다.
 * 박자표는 박↔음원 시각 변환에 쓰지 않지만, 마디 끝이 줄면 같은 박도 타임라인 밖으로 나갈 수 있다.
 *
 * 옮긴 시각은 레일과 같은 커서 범위(`timelineRange.ts`, 아래 끝 offsetMs)로 자른다. 잘리면 커서 시각으로는
 * 원래 박을 다시 구할 수 없으므로, 마지막으로 옮긴 커서의 박을 기억해 두고 사용자가 커서를 옮기지 않은 채
 * 다음 타이밍 변경이 오면 그 박에서 다시 옮긴다. 드래그 중간 프레임이나 수정에서 범위 끝에 묶였던 커서가
 * Escape·Undo로 타이밍이나 범위가 돌아오면 원래 박으로 돌아온다. 이 기억은 편집 세션에 남겨 페이지 재마운트에도 유지한다.
 */

import type { BpmChange, ChartDocument } from '../../shared';
import { beatEq, beatFloatToMs, beatIsZero, extractBpmChanges, msToBeat } from '../../shared';
import type { TimelineRangeMs } from '../stores/viewportSlice';
import { clampToCursorRange, cursorRangeMsOf } from '../timeline/timelineRange';

/**
 * 박↔음원 시각 변환을 정하는 값(BPM 변경 목록·음원 정렬 오프셋).
 * 노트·마디 시각까지 파생하는 `ChartTiming`과 달리 변환만 하며, glossary의 곡 타이밍과 달리 박자표는 담지 않는다.
 */
interface BeatMsTiming {
  readonly bpmChanges: readonly BpmChange[];
  readonly offsetMs: number;
}

function beatMsTimingOf(chart: Pick<ChartDocument, 'events' | 'meta'>): BeatMsTiming {
  return { bpmChanges: extractBpmChanges(chart.events), offsetMs: chart.meta.offsetMs };
}

function sameBeatMsTiming(a: BeatMsTiming, b: BeatMsTiming): boolean {
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

/** 커서 박 유지에 필요한 재생기 기능. `PlaybackController`가 그대로 맞는다. */
export interface CursorBeatKeeperPlayback {
  readonly isPlaying: boolean;
  /** 재생 시작 위치와 store의 `currentTimeMs`를 함께 옮긴다. */
  seekTo(timeMs: number): void;
}

export interface CursorBeatKeeper {
  /**
   * 차트가 바뀔 때마다 부른다. 정지 중이면 기억한 박(또는 수정 직전 커서 박)을 새 타이밍으로 변환하고,
   * 커서 범위로 자른 값이 현재 커서와 다를 때 seek한다. 박자표만 바뀌어도 범위는 다시 확인한다.
   * - 마지막 호출 뒤 `cursorMoveCount`가 같으면 범위로 자르기 전 박을 재사용한다.
   *   seek나 재생 tick으로 횟수가 달라졌으면, 같은 시각으로 돌아왔어도 현재 커서에서 박을 구한다.
   * - 세션 기억이 없거나 `loadGeneration`이 달라졌으면 새 차트의 비교 기준만 세우고 seek하지 않는다.
   * - 재생 중이거나 재생기가 없으면 seek하지 않는다. 어느 경우든 다음 비교의 기준은 이 차트로 바뀌고 기억한 박은 버린다.
   */
  syncToChart(input: {
    chart: Pick<ChartDocument, 'events' | 'meta'>;
    loadGeneration: number;
    /**
     * 수정 직전 커서 시각. store의 `currentTimeMs`(화면의 커서이자 테스트 플레이 '커서부터'의 시작 위치)를 넘긴다.
     * 테스트 플레이에서 돌아와도 store의 커서는 남으며, 새 재생기도 이 시각으로 초기화한다.
     */
    cursorMs: number;
    playback: CursorBeatKeeperPlayback | null;
    /** 이 차트의 그리기 범위에서 끝만 사용한다. null이면 아래 끝(offsetMs)만 제한한다. */
    timelineRange: TimelineRangeMs | null;
  }): void;
}

/** 범위로 자르기 전 박과 keeper의 seek까지 반영된 커서 이동 횟수. */
interface CursorBeatAnchor {
  readonly cursorBeat: number;
  readonly cursorMoveCount: number;
}

/** 페이지가 아닌 편집 세션이 소유하는 직전 타이밍과 범위로 자르기 전 박. */
export interface CursorBeatKeeperState {
  readonly timing: BeatMsTiming;
  readonly loadGeneration: number;
  readonly anchor: CursorBeatAnchor | null;
}

interface CursorBeatKeeperStore {
  getState(): {
    cursorMoveCount: number;
    cursorBeatKeeperState: CursorBeatKeeperState | null;
  };
  setState(state: { cursorBeatKeeperState: CursorBeatKeeperState }): void;
}

export function createCursorBeatKeeper(store: CursorBeatKeeperStore): CursorBeatKeeper {
  return {
    syncToChart({ chart, loadGeneration, cursorMs, playback, timelineRange }) {
      const { cursorBeatKeeperState: before, cursorMoveCount } = store.getState();
      const timing = beatMsTimingOf(chart);
      store.setState({ cursorBeatKeeperState: { timing, loadGeneration, anchor: null } });

      if (!before || loadGeneration !== before.loadGeneration) return;
      // 재생 중 편집 제한은 별도 작업(RFD 0099). 변환하지 않아도 다음 비교의 기준은 갱신한다.
      if (!playback || playback.isPlaying) return;
      if (!convertibleTiming(before.timing) || !convertibleTiming(timing)) return;

      const kept = before.anchor?.cursorMoveCount === cursorMoveCount ? before.anchor : null;
      const cursorBeat = kept?.cursorBeat ?? msToBeat(cursorMs, before.timing.bpmChanges, before.timing.offsetMs);
      // 같은 타이밍의 현재 박은 시각 왕복 계산 없이 그대로 쓴다. 재마운트 직후 범위를 아직 모르면
      // 기존에 잘린 커서를 풀지 않는다. 범위를 받으면 같은 타이밍이어도 기억한 박에서 다시 자른다.
      const remapped = sameBeatMsTiming(before.timing, timing) && (!kept || !timelineRange)
        ? cursorMs
        : msAtBeat(cursorBeat, timing);
      if (remapped === null) return;
      const cursorRange = cursorRangeMsOf(timing.offsetMs, timelineRange?.totalTimelineMs ?? Infinity);
      const targetMs = clampToCursorRange(remapped, cursorRange);
      if (targetMs !== cursorMs) playback.seekTo(targetMs);
      store.setState({
        cursorBeatKeeperState: {
          timing,
          loadGeneration,
          // seekTo → onTimeUpdate → setCurrentTimeMs가 올린 뒤의 값을 기억한다.
          anchor: { cursorBeat, cursorMoveCount: store.getState().cursorMoveCount },
        },
      });
    },
  };
}
