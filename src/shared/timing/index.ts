/**
 * beat↔time 변환 — BPM 변경 기반
 *
 * BPM 변경 배열에서 각 구간의 BPM을 이용해 beat→ms, ms→beat 변환을 수행한다.
 * BPM 변경은 beat 기준 오름차순 정렬되어 있어야 한다.
 */

import type { Beat } from "../types/beat";
import type { BpmChange, TimeSignatureChange, ChartEvent, BpmChangeEvent, TimeSignatureChangeEvent } from "../types/chart";
import {
  beatToFloat,
  beatLte,
  beatSub,
  beatAdd,
  beatMulInt,
  BEAT_ZERO,
} from "../types/beat";

// ---------------------------------------------------------------------------
// ChartEvent[] → BpmChange[] / TimeSignatureChange[] 변환
// ---------------------------------------------------------------------------

/**
 * 이벤트 배열에서 BpmChangeEvent를 BpmChange 배열로 변환한다.
 * beat 오름차순 정렬.
 */
export function extractBpmChanges(events: readonly ChartEvent[]): BpmChange[] {
  return events
    .filter((e): e is BpmChangeEvent => e.type === "bpm")
    .map((e) => ({ beat: e.beat, bpm: e.bpm }))
    .sort((a, b) => beatToFloat(a.beat) - beatToFloat(b.beat));
}

/**
 * 이벤트 배열에서 TimeSignatureChangeEvent를 TimeSignatureChange 배열로 변환한다.
 * beat 위치를 마디 인덱스로 변환하여 measure 기반 변경 데이터를 생성한다.
 */
export function extractTimeSignatureChanges(events: readonly ChartEvent[]): TimeSignatureChange[] {
  const tsEvents = events
    .filter((e): e is TimeSignatureChangeEvent => e.type === "timeSignature")
    .sort((a, b) => beatToFloat(a.beat) - beatToFloat(b.beat));

  if (tsEvents.length === 0) return [];

  const result: TimeSignatureChange[] = [];
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
 * @param bpmChanges BPM 변경 배열 (beat 오름차순 정렬, 0박에 최소 1개 필수)
 * @param offsetMs 음원 재생 시작→0박까지의 오프셋 (ms). 기본값 0.
 * @returns 절대 시간 (ms)
 */
export function beatToMs(
  target: Beat,
  bpmChanges: readonly BpmChange[],
  offsetMs: number = 0,
): number {
  if (bpmChanges.length === 0) {
    throw new Error("beatToMs: bpmChanges must not be empty");
  }

  let timeMs = offsetMs;
  let prevBeat = BEAT_ZERO;
  let currentBpm = bpmChanges[0].bpm;

  for (let i = 0; i < bpmChanges.length; i++) {
    const change = bpmChanges[i];

    // target이 이 변경 이전에 있으면 남은 구간만 계산하고 종료
    if (beatLte(target, change.beat) && i > 0) {
      break;
    }

    if (i > 0) {
      // 이전 구간의 시간을 누적
      const segmentBeats = beatToFloat(beatSub(change.beat, prevBeat));
      timeMs += segmentBeats * msPerBeat(currentBpm);
    }

    prevBeat = change.beat;
    currentBpm = change.bpm;
  }

  // 마지막 변경 이후 남은 구간
  const remainingBeats = beatToFloat(beatSub(target, prevBeat));
  timeMs += remainingBeats * msPerBeat(currentBpm);

  return timeMs;
}

/**
 * 절대 시간(ms)을 Beat로 변환한다.
 *
 * @param targetMs 변환할 절대 시간 (ms)
 * @param bpmChanges BPM 변경 배열 (beat 오름차순 정렬, 0박에 최소 1개 필수)
 * @param offsetMs 음원 재생 시작→0박까지의 오프셋 (ms). 기본값 0.
 * @returns 가장 가까운 Beat (부동소수점 기반, 스냅은 호출자가 처리)
 */
export function msToBeat(
  targetMs: number,
  bpmChanges: readonly BpmChange[],
  offsetMs: number = 0,
): number {
  if (bpmChanges.length === 0) {
    throw new Error("msToBeat: bpmChanges must not be empty");
  }

  let remainingMs = targetMs - offsetMs;
  let accumulatedBeats = 0;

  for (let i = 0; i < bpmChanges.length; i++) {
    const currentBpm = bpmChanges[i].bpm;
    const msPB = msPerBeat(currentBpm);

    // 다음 변경이 있으면 이 구간의 범위를 계산
    if (i + 1 < bpmChanges.length) {
      const nextChangeBeat = bpmChanges[i + 1].beat;
      const currentChangeBeat = bpmChanges[i].beat;
      const segmentBeats = beatToFloat(beatSub(nextChangeBeat, currentChangeBeat));
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
 * 부동소수점 박을 절대 시간(ms)으로 변환한다. `msToBeat`의 역변환이다.
 *
 * `beatToMs`는 유리수 `Beat`만 받는다. `msToBeat`로 구한 박을 해상도로 반올림하지 않고
 * 그대로 다른 타이밍의 시각으로 옮길 때 쓴다. 0박보다 앞(음수 박)은 `msToBeat`처럼 첫 BPM으로 계산한다.
 *
 * @param beatFloat 변환할 박 (부동소수점, 음수 허용)
 * @param bpmChanges BPM 변경 배열 (beat 오름차순 정렬, 0박에 최소 1개 필수)
 * @param offsetMs 음원 재생 시작→0박까지의 오프셋 (ms). 기본값 0.
 * @returns 절대 시간 (ms)
 */
export function beatFloatToMs(
  beatFloat: number,
  bpmChanges: readonly BpmChange[],
  offsetMs: number = 0,
): number {
  if (bpmChanges.length === 0) {
    throw new Error("beatFloatToMs: bpmChanges must not be empty");
  }

  let timeMs = offsetMs;
  let accumulatedBeats = 0;

  for (let i = 0; i < bpmChanges.length; i++) {
    const msPB = msPerBeat(bpmChanges[i].bpm);

    if (i + 1 < bpmChanges.length) {
      // msToBeat과 같은 방식(유리수 차를 float으로)으로 구간 길이를 구해 왕복 오차를 줄인다
      const segmentBeats = beatToFloat(beatSub(bpmChanges[i + 1].beat, bpmChanges[i].beat));

      if (beatFloat - accumulatedBeats <= segmentBeats) {
        // target은 이 구간 안에 있다
        return timeMs + (beatFloat - accumulatedBeats) * msPB;
      }

      timeMs += segmentBeats * msPB;
      accumulatedBeats += segmentBeats;
    } else {
      // 마지막 구간 — 남은 박을 시간으로 변환
      return timeMs + (beatFloat - accumulatedBeats) * msPB;
    }
  }

  return timeMs;
}

/**
 * BPM 변경 배열에서 특정 Beat 위치의 BPM을 구한다.
 */
export function bpmAt(
  target: Beat,
  bpmChanges: readonly BpmChange[],
): number {
  if (bpmChanges.length === 0) {
    throw new Error("bpmAt: bpmChanges must not be empty");
  }

  let result = bpmChanges[0].bpm;
  for (const change of bpmChanges) {
    if (beatLte(change.beat, target)) {
      result = change.bpm;
    } else {
      break;
    }
  }
  return result;
}

/**
 * 마디 인덱스 → 시작 Beat 변환.
 *
 * timeSignatureChanges를 measure 순 정렬한 뒤, 마디 0부터 순회하며
 * 각 구간의 beatPerMeasure를 beat로 누적한다.
 *
 * 예: [{measure:0, beatPerMeasure:4}, {measure:8, beatPerMeasure:3}]
 *   → measure 10 시작 = beat(8*4 + 2*3) = beat(38)
 */
export function measureStartBeat(
  measure: number,
  timeSignatureChanges: readonly TimeSignatureChange[],
): Beat {
  if (timeSignatureChanges.length === 0) {
    throw new Error("measureStartBeat: timeSignatureChanges must not be empty");
  }

  // measure 순 정렬 (복사)
  const sorted = [...timeSignatureChanges].sort((a, b) => a.measure - b.measure);

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

/**
 * limitMs 이내의 모든 마디 시작 ms를 순증 배열로 열거한다.
 *
 * 마디 0부터 measureStartBeat로 시작 ms를 열거하되, **마디가 전진하지 않으면**
 * (다음 시작 ms ≤ 직전 시작 ms) 즉시 종료한다. 이 미전진은 분자/분모 ≤ 0인
 * 박자표(구조 위반, 예: 0/4)가 만드는 상황으로, 방어하지 않으면 무제한 루프가
 * 무한루프가 된다(RFD 0017 §3-4). valid 차트에서는 마디 시작이 항상 순증하므로
 * 이 가드는 결과에 영향을 주지 않는다.
 */
export function enumerateMeasureStartsMs(
  limitMs: number,
  bpmChanges: readonly BpmChange[],
  timeSignatureChanges: readonly TimeSignatureChange[],
  offsetMs: number = 0,
): number[] {
  const result: number[] = [];
  if (bpmChanges.length === 0 || timeSignatureChanges.length === 0) return result;

  let prevMs = Number.NEGATIVE_INFINITY;
  for (let m = 0; ; m++) {
    const mStartMs = beatToMs(measureStartBeat(m, timeSignatureChanges), bpmChanges, offsetMs);
    if (mStartMs > limitMs) break;
    // 마디 미전진(구조 위반: 분자 0 박자표, 예 0/4 → measureStartBeat 불변) 방어.
    // `!(mStartMs > prevMs)`는 등가·역전을 모두 종료로 처리한다(비수 NaN까지 안전).
    if (!(mStartMs > prevMs)) break;
    result.push(mStartMs);
    prevMs = mStartMs;
  }
  return result;
}
