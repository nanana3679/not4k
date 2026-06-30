/**
 * 이어진 롱노트(connected long note) 연결 관계 계산.
 *
 * `o-o-`처럼 같은 레인에서 앞 롱노트의 끝 시간과 뒤 롱노트의 시작 시간이 맞닿아 있으면
 * 두 롱노트는 "이어진" 것으로 본다. `o- o-`처럼 시간 간격이 벌어져 있으면 이어지지 않는다.
 *
 * 이 정의는 판정 쪽 `JudgmentEngine.hasImmediateFollowingLongNote`와 동일한 기준
 * (같은 레인 + 끝 시간 ≈ 시작 시간, threshold 이내)을 시각(불 들어옴) 전파에 재사용한 것이다.
 */

import type { NoteEntity } from "../../shared";

/** 이어진 롱노트로 간주하는 끝-시작 시간 차이 허용치 (ms) — 판정 쪽과 동일 */
export const LONG_NOTE_CONNECTION_THRESHOLD_MS = 10;

/**
 * 각 롱노트에 대해 바로 앞에서 이어지는 롱노트(연결 선행 노트)의 인덱스를 계산한다.
 *
 * @param notes 노트 배열 (시간 정렬을 가정하지 않는다)
 * @param startTimesMs 노트 인덱스 → 시작 시간(ms)
 * @param endTimesMs 노트 인덱스 → 끝 시간(ms)
 * @param thresholdMs 끝-시작 시간 차이 허용치
 * @returns 롱노트 인덱스 → 연결 선행 롱노트 인덱스. 이어진 선행 노트가 없으면 키가 없다.
 */
export function computeConnectedLongNotePredecessors(
  notes: readonly NoteEntity[],
  startTimesMs: ReadonlyMap<number, number>,
  endTimesMs: ReadonlyMap<number, number>,
  thresholdMs: number = LONG_NOTE_CONNECTION_THRESHOLD_MS,
): Map<number, number> {
  const predecessors = new Map<number, number>();

  for (let cur = 0; cur < notes.length; cur++) {
    const curNote = notes[cur];
    // 현재 노트가 롱노트(구간 노트)가 아니면 이어받을 머리가 없다
    if (!("endBeat" in curNote)) continue;

    const curStart = startTimesMs.get(cur);
    if (curStart === undefined) continue;

    let best: number | undefined;
    let bestDiff = Infinity;

    for (let prev = 0; prev < notes.length; prev++) {
      if (prev === cur) continue;
      const prevNote = notes[prev];
      // 선행 노트도 롱노트여야 하며, 같은 레인이어야 한다
      if (!("endBeat" in prevNote)) continue;
      if (prevNote.lane !== curNote.lane) continue;

      const prevEnd = endTimesMs.get(prev);
      if (prevEnd === undefined) continue;

      const diff = Math.abs(prevEnd - curStart);
      // 같은 레인은 시간상 겹칠 수 없으므로 후보는 사실상 최대 1개지만,
      // 안전하게 가장 가까운 끝을 선택한다.
      if (diff <= thresholdMs && diff < bestDiff) {
        best = prev;
        bestDiff = diff;
      }
    }

    if (best !== undefined) predecessors.set(cur, best);
  }

  return predecessors;
}
