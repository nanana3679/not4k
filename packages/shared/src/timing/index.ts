/**
 * beat↔time 변환 — BPM 마커 기반
 *
 * BPM 마커 배열에서 각 구간의 BPM을 이용해 beat→ms, ms→beat 변환을 수행한다.
 * BPM 마커는 beat 기준 오름차순 정렬되어 있어야 한다.
 */

import type { Beat } from "../types/beat";
import type { BpmMarker } from "../types/chart";
import {
  beatToFloat,
  beatLte,
  beatSub,
  BEAT_ZERO,
} from "../types/beat";

/** 1 beat = 60_000 / bpm ms */
function msPerBeat(bpm: number): number {
  return 60_000 / bpm;
}

/**
 * Beat를 절대 시간(ms)으로 변환한다.
 *
 * @param target 변환할 Beat 위치
 * @param bpmMarkers BPM 마커 배열 (beat 오름차순 정렬, 0박에 최소 1개 필수)
 * @param offsetMs 음원 재생 시작→0박까지의 오프셋 (ms). 기본값 0.
 * @returns 절대 시간 (ms)
 */
export function beatToMs(
  target: Beat,
  bpmMarkers: readonly BpmMarker[],
  offsetMs: number = 0,
): number {
  if (bpmMarkers.length === 0) {
    throw new Error("beatToMs: bpmMarkers must not be empty");
  }

  let timeMs = offsetMs;
  let prevBeat = BEAT_ZERO;
  let currentBpm = bpmMarkers[0].bpm;

  for (let i = 0; i < bpmMarkers.length; i++) {
    const marker = bpmMarkers[i];

    // target이 이 마커 이전에 있으면 남은 구간만 계산하고 종료
    if (beatLte(target, marker.beat) && i > 0) {
      break;
    }

    if (i > 0) {
      // 이전 구간의 시간을 누적
      const segmentBeats = beatToFloat(beatSub(marker.beat, prevBeat));
      timeMs += segmentBeats * msPerBeat(currentBpm);
    }

    prevBeat = marker.beat;
    currentBpm = marker.bpm;
  }

  // 마지막 마커 이후 남은 구간
  const remainingBeats = beatToFloat(beatSub(target, prevBeat));
  timeMs += remainingBeats * msPerBeat(currentBpm);

  return timeMs;
}

/**
 * 절대 시간(ms)을 Beat로 변환한다.
 *
 * @param targetMs 변환할 절대 시간 (ms)
 * @param bpmMarkers BPM 마커 배열 (beat 오름차순 정렬, 0박에 최소 1개 필수)
 * @param offsetMs 음원 재생 시작→0박까지의 오프셋 (ms). 기본값 0.
 * @returns 가장 가까운 Beat (부동소수점 기반, 스냅은 호출자가 처리)
 */
export function msToBeat(
  targetMs: number,
  bpmMarkers: readonly BpmMarker[],
  offsetMs: number = 0,
): number {
  if (bpmMarkers.length === 0) {
    throw new Error("msToBeat: bpmMarkers must not be empty");
  }

  let remainingMs = targetMs - offsetMs;
  let accumulatedBeats = 0;

  for (let i = 0; i < bpmMarkers.length; i++) {
    const currentBpm = bpmMarkers[i].bpm;
    const msPB = msPerBeat(currentBpm);

    // 다음 마커가 있으면 이 구간의 범위를 계산
    if (i + 1 < bpmMarkers.length) {
      const nextMarkerBeat = bpmMarkers[i + 1].beat;
      const currentMarkerBeat = bpmMarkers[i].beat;
      const segmentBeats = beatToFloat(beatSub(nextMarkerBeat, currentMarkerBeat));
      const segmentMs = segmentBeats * msPB;

      if (remainingMs <= segmentMs) {
        // target은 이 구간 안에 있다
        accumulatedBeats += remainingMs / msPB;
        return accumulatedBeats;
      }

      remainingMs -= segmentMs;
      accumulatedBeats += segmentBeats;
    } else {
      // 마지막 구간 — 남은 시간을 beat로 변환
      accumulatedBeats += remainingMs / msPB;
      return accumulatedBeats;
    }
  }

  return accumulatedBeats;
}

/**
 * BPM 마커 배열에서 특정 Beat 위치의 BPM을 구한다.
 */
export function bpmAt(
  target: Beat,
  bpmMarkers: readonly BpmMarker[],
): number {
  if (bpmMarkers.length === 0) {
    throw new Error("bpmAt: bpmMarkers must not be empty");
  }

  let result = bpmMarkers[0].bpm;
  for (const marker of bpmMarkers) {
    if (beatLte(marker.beat, target)) {
      result = marker.bpm;
    } else {
      break;
    }
  }
  return result;
}
