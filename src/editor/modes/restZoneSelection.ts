/**
 * restZone 선택·이동 헬퍼 (RFD 0019) — trillZoneSelection의 미러.
 *
 * restZone은 내부 노트가 없는 독립 선택 축이라 동질성(homogeneity)·파생 machinery가
 * 없다. note/zone 선택과 **공존**하며(trillZone 존과 동일), 평행이동과
 * "구간 자체" 클램프만 있으면 된다.
 */

import type { Beat, RestZone } from "../../shared";
import { beatAdd, beatSub, beatToFloat, BEAT_ZERO } from "../../shared";

/**
 * 박스가 restZone을 완전히 감싸는지 — lane 포함 + beat 폐구간 [zone.beat, zone.endBeat]를
 * 박스 beat 범위가 포함할 때만 true (boxEnclosesZone 미러, RFD 0016 §6-2 감쌈 모델).
 */
export function restZoneOverlapsBox(
  zone: RestZone,
  box: { minLane: number; maxLane: number; minBeat: Beat; maxBeat: Beat },
): boolean {
  // 롱노트처럼 **일부만 겹쳐도** 픽업한다 — 구간 [beat, endBeat]가 박스 beat 범위와
  // 교차하면 선택(trillZone의 완전 감쌈과 대비, 사용자 요청). 레인은 박스 레인 범위 안.
  return (
    box.minLane <= zone.lane &&
    zone.lane <= box.maxLane &&
    beatToFloat(box.minBeat) <= beatToFloat(zone.endBeat) &&
    beatToFloat(zone.beat) <= beatToFloat(box.maxBeat)
  );
}

/**
 * restZone을 박자 오프셋만큼 평행 이동한 새 restZone을 반환한다 (translateTrillZone 미러).
 * 레인 이동은 SelectMode가 별도로 다룬다 — restZone은 beat/endBeat 평행이동만 관할.
 */
export function translateRestZone(zone: RestZone, beatOffset: Beat): RestZone {
  return {
    ...zone,
    beat: beatAdd(zone.beat, beatOffset),
    endBeat: beatAdd(zone.endBeat, beatOffset),
  };
}

/**
 * restZone 구간 자체를 타임라인 [0, maxBeat] 안에 머물게 하는 박자 오프셋을 반환한다.
 * clampTrillBeatOffset 미러 — 내부 노트가 없어 구간 경계(beat·endBeat)만 본다.
 * 요청 오프셋이 경계를 벗어나면 경계까지만 허용(클램프). 구간이 타임라인보다 길면 0.
 *
 * 허용 범위:
 *   dMin = 0 - zone.beat          (이보다 작으면 시작이 0 아래로 벗어남)
 *   dMax = maxBeat - zone.endBeat (이보다 크면 끝이 타임라인 밖으로 벗어남)
 */
export function clampRestBeatOffset(
  zone: RestZone,
  maxBeat: Beat,
  requested: Beat,
): Beat {
  const dMin = beatSub(BEAT_ZERO, zone.beat);
  const dMax = beatSub(maxBeat, zone.endBeat);
  const reqF = beatToFloat(requested);
  const dMinF = beatToFloat(dMin);
  const dMaxF = beatToFloat(dMax);

  if (dMinF > dMaxF) return BEAT_ZERO; // 구간이 타임라인보다 길어 이동 여유 없음
  if (reqF < dMinF) return dMin;
  if (reqF > dMaxF) return dMax;
  return requested;
}
