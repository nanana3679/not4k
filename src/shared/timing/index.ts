/**
 * beat↔time 변환 — BPM 마커 기반
 *
 * BPM 마커 배열에서 각 구간의 BPM을 이용해 beat→ms, ms→beat 변환을 수행한다.
 * BPM 마커는 beat 기준 오름차순 정렬되어 있어야 한다.
 */

import type { Beat } from "../types/beat";
import type { BpmMarker, TimeSignatureMarker, ChartEvent, BpmEvent, TimeSignatureEvent } from "../types/chart";
import {
  beatToFloat,
  beatLte,
  beatSub,
  beatAdd,
  beatMulInt,
  BEAT_ZERO,
} from "../types/beat";

// ---------------------------------------------------------------------------
// ChartEvent[] → BpmMarker[] / TimeSignatureMarker[] 변환
// ---------------------------------------------------------------------------

/**
 * 이벤트 배열에서 BpmEvent를 BpmMarker 배열로 변환한다.
 * beat 오름차순 정렬.
 */
export function extractBpmMarkers(events: readonly ChartEvent[]): BpmMarker[] {
  return events
    .filter((e): e is BpmEvent => e.type === "bpm")
    .map((e) => ({ beat: e.beat, bpm: e.bpm }))
    .sort((a, b) => beatToFloat(a.beat) - beatToFloat(b.beat));
}

/**
 * 이벤트 배열에서 TimeSignatureEvent를 TimeSignatureMarker 배열로 변환한다.
 * beat 위치를 마디 인덱스로 변환하여 measure 기반 마커를 생성한다.
 */
export function extractTimeSignatures(events: readonly ChartEvent[]): TimeSignatureMarker[] {
  const tsEvents = events
    .filter((e): e is TimeSignatureEvent => e.type === "timeSignature")
    .sort((a, b) => beatToFloat(a.beat) - beatToFloat(b.beat));

  if (tsEvents.length === 0) return [];

  const result: TimeSignatureMarker[] = [];
  let accBeatFloat = 0;
  let currentMeasure = 0;
  let prevBPM = tsEvents[0].beatPerMeasure;

  for (let i = 0; i < tsEvents.length; i++) {
    const evt = tsEvents[i];
    const evtBeatFloat = beatToFloat(evt.beat);

    if (i === 0) {
      result.push({ measure: 0, beatPerMeasure: evt.beatPerMeasure });
      prevBPM = evt.beatPerMeasure;
      continue;
    }

    // 이전 위치에서 이 이벤트까지의 마디 수 계산
    const beatDiff = evtBeatFloat - accBeatFloat;
    const bpmFloat = prevBPM.n / prevBPM.d;
    const measureDiff = Math.round(beatDiff / bpmFloat);

    currentMeasure += measureDiff;
    accBeatFloat += measureDiff * bpmFloat;

    result.push({ measure: currentMeasure, beatPerMeasure: evt.beatPerMeasure });
    prevBPM = evt.beatPerMeasure;
  }

  return result;
}

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

/**
 * 마디 인덱스 → 시작 Beat 변환.
 *
 * timeSignatures를 measure 순 정렬한 뒤, 마디 0부터 순회하며
 * 각 구간의 beatPerMeasure를 beat로 누적한다.
 *
 * 예: [{measure:0, beatPerMeasure:4}, {measure:8, beatPerMeasure:3}]
 *   → measure 10 시작 = beat(8*4 + 2*3) = beat(38)
 */
export function measureStartBeat(
  measure: number,
  timeSignatures: readonly TimeSignatureMarker[],
): Beat {
  if (timeSignatures.length === 0) {
    throw new Error("measureStartBeat: timeSignatures must not be empty");
  }

  // measure 순 정렬 (복사)
  const sorted = [...timeSignatures].sort((a, b) => a.measure - b.measure);

  let accBeat: Beat = BEAT_ZERO;
  let prevMeasure = 0;
  let currentBPM = sorted[0].beatPerMeasure;

  for (let i = 0; i < sorted.length; i++) {
    const sig = sorted[i];

    if (sig.measure >= measure) {
      // target은 이 구간 이전에 있다
      break;
    }

    if (i > 0) {
      // 이전 구간의 마디 수 × beatPerMeasure를 누적
      const measuresInSegment = sig.measure - prevMeasure;
      accBeat = beatAdd(accBeat, beatMulInt(currentBPM, measuresInSegment));
    }

    prevMeasure = sig.measure;
    currentBPM = sig.beatPerMeasure;
  }

  // 마지막 구간의 남은 마디 수
  const remainingMeasures = measure - prevMeasure;
  accBeat = beatAdd(accBeat, beatMulInt(currentBPM, remainingMeasures));

  return accBeat;
}
