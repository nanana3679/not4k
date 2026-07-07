import type { Beat, RangeNote } from "../../shared";
import { beatAdd, beatSub, beatToFloat } from "../../shared";

/**
 * 이동 드래그의 순수 운동학(kinematics) 코어 — 메인 노트(lane 축)와 엑스트라 노트(extraLane 축)의
 * 평행 중복(원본 캡처·오프셋 적용·범위 검사)을 레인 축만 매개화해 하나로 합친다.
 * violationCheck.ts의 LaneOf<T> 패턴과 대칭이며, 여기서는 좌표를 **읽기**(laneOf)만이 아니라
 * **쓰기**(withLane)도 필요하므로 setter를 더한 LaneAxis<T>를 쓴다.
 *
 * 모든 함수는 `this` 없는 자유 함수라 축과 무관하게 한 번만 단위 테스트하면 양쪽이 검증된다 —
 * SelectMode 안에 갇혀 있던 로직을 밖으로 꺼내 테스트 가능하게 만드는 것이 이 모듈의 핵심 이득이다.
 */

/**
 * 노트의 레인 좌표를 읽고(laneOf) 쓰는(withLane) 함수 축.
 * 메인=lane, 엑스트라=extraLane. withLane은 좌표만 바꾼 새 노트를 반환한다(불변).
 */
export type LaneAxis<T> = {
  laneOf: (note: T) => number;
  withLane: (note: T, lane: number) => T;
};

/** 이동 시작 시점에 기록하는 원본 좌표. lane은 축 좌표(메인=lane, 엑스트라=extraLane)를 중립 이름으로 담는다. */
export type MoveOrigin = { beat: Beat; endBeat?: Beat; lane: number };

/**
 * 주어진 인덱스들의 원본 좌표(beat, range면 endBeat, 축 좌표)를 기록한다.
 * range 판정은 `"endBeat" in note`로 하며, range 노트만 endBeat를 담는다.
 *
 * @param notes 전체 노트 배열
 * @param indices 캡처할 노트 인덱스 집합
 * @param laneOf 축 좌표 추출기(메인=lane, 엑스트라=extraLane)
 */
export function captureMoveOrigins<T extends { beat: Beat }>(
  notes: readonly T[],
  indices: Iterable<number>,
  laneOf: (note: T) => number,
): Map<number, MoveOrigin> {
  const origins = new Map<number, MoveOrigin>();
  for (const idx of indices) {
    const note = notes[idx];
    if (!note) continue;
    if ("endBeat" in note) {
      origins.set(idx, {
        beat: note.beat,
        endBeat: (note as unknown as RangeNote).endBeat,
        lane: laneOf(note),
      });
    } else {
      origins.set(idx, { beat: note.beat, lane: laneOf(note) });
    }
  }
  return origins;
}

/**
 * 기록된 원본(origins)에 laneOffset(축 좌표) + beatOffset을 적용한 새 노트 배열을 만든다.
 * range 노트는 duration(endBeat - beat)을 보존한 채 통째로 평행이동한다.
 *
 * @param source 대상 노트 배열(복사본을 반환)
 * @param origins 캡처된 원본 좌표 맵
 * @param laneOffset 축 좌표에 더할 오프셋
 * @param beatOffset beat에 더할 오프셋
 * @param axis 레인 축(laneOf/withLane)
 * @param isRange 인덱스의 노트가 range인지 판정(대상 배열 기준)
 */
export function buildMovedNotesGeneric<T extends { beat: Beat }>(
  source: readonly T[],
  origins: ReadonlyMap<number, MoveOrigin>,
  laneOffset: number,
  beatOffset: Beat,
  axis: LaneAxis<T>,
  isRange: (note: T) => boolean,
): T[] {
  const next = [...source];
  for (const [idx, origin] of origins) {
    const note = next[idx];
    if (!note) continue;
    const newLane = origin.lane + laneOffset;
    const newBeat = beatAdd(origin.beat, beatOffset);
    const relaned = axis.withLane(note, newLane);
    if (isRange(note)) {
      const duration = beatSub(origin.endBeat!, origin.beat);
      next[idx] = {
        ...relaned,
        beat: newBeat,
        endBeat: beatAdd(newBeat, duration),
      };
    } else {
      next[idx] = { ...relaned, beat: newBeat };
    }
  }
  return next;
}

/**
 * 주어진 인덱스의 노트들이 모두 타임라인 범위 [0, maxBeatFloat] 안에 있는지 검사한다.
 * beat 축만 본다(레인 축 무관). range 노트는 endBeat도 함께 검사한다.
 * 인덱스에 노트가 없으면(빈 슬롯) 건너뛴다(엑스트라의 null 관용과 동일).
 */
export function notesInBoundsByBeat<T extends { beat: Beat }>(
  notes: readonly T[],
  indices: Iterable<number>,
  maxBeatFloat: number,
  isRange: (note: T) => boolean,
): boolean {
  for (const idx of indices) {
    const note = notes[idx];
    if (!note) continue;
    const beatFloat = beatToFloat(note.beat);
    if (beatFloat < 0 || beatFloat > maxBeatFloat) return false;
    if (isRange(note)) {
      const endFloat = beatToFloat((note as unknown as RangeNote).endBeat);
      if (endFloat < 0 || endFloat > maxBeatFloat) return false;
    }
  }
  return true;
}
