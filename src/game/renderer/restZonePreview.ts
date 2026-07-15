/**
 * [Phase 1 프리뷰 전용 · THROWAWAY]
 *
 * "휴지 구간"(레인이 당분간 안 쓰이는 구간)을 노트 공백에서 **임시로 자동 파생**한다.
 * 최종 기능은 차트 제작자가 직접 배치하는 저작 데이터다. 이 파일은 에디터/직렬화 없이
 * 시각 효과만 눈으로 확인하기 위한 비계이며, Phase 2에서 `chartData.restZones`로 교체하고 삭제한다.
 *
 * 파생 규칙:
 *  - 레인별로 노트(점=[beat], 롱=[beat,endBeat])와 트릴존([beat,endBeat])을 점유 구간으로 모은다.
 *  - 점유 사이의 빈 간격이 threshold(박) 이상이면 그 간격을 휴지 구간으로 본다.
 *  - 휴지 구간은 다음 점유 margin(박) 전에 끝난다 ("슬슬 손 복귀" 여백).
 *  - 차트 시작(beat 0)부터 첫 점유까지의 선행 공백도 포함한다. 마지막 점유 이후는 끝을 몰라 제외.
 */

import {
  type Beat,
  beatFromInt,
  beatSub,
  beatLte,
  beatMax,
  beatToFloat,
  BEAT_ZERO,
} from "../../shared";

export interface RestZone {
  lane: number;
  beat: Beat;
  endBeat: Beat;
}

interface LaneOccupant {
  lane: number;
  beat: Beat;
  endBeat: Beat;
}

/** 점유 구간을 가진 것으로 취급할 수 있는 최소 형태(노트/트릴존 공통) */
interface BeatRanged {
  lane: number;
  beat: Beat;
  endBeat?: Beat;
}

export const REST_ZONE_PREVIEW_THRESHOLD_BEATS = beatFromInt(4);
export const REST_ZONE_PREVIEW_MARGIN_BEATS = beatFromInt(1);

export function deriveRestZonesForPreview(
  notes: readonly BeatRanged[],
  trillZones: readonly BeatRanged[],
  thresholdBeats: Beat = REST_ZONE_PREVIEW_THRESHOLD_BEATS,
  marginBeats: Beat = REST_ZONE_PREVIEW_MARGIN_BEATS,
): RestZone[] {
  const thresholdFloat = beatToFloat(thresholdBeats);

  // 레인별 점유 구간 수집 (점 노트는 길이 0 구간으로)
  const byLane = new Map<number, LaneOccupant[]>();
  const collect = (item: BeatRanged) => {
    const endBeat = item.endBeat ?? item.beat;
    const arr = byLane.get(item.lane) ?? [];
    arr.push({ lane: item.lane, beat: item.beat, endBeat });
    byLane.set(item.lane, arr);
  };
  for (const n of notes) collect(n);
  for (const z of trillZones) collect(z);

  const restZones: RestZone[] = [];

  for (const [lane, occupants] of byLane) {
    occupants.sort((a, b) => beatToFloat(a.beat) - beatToFloat(b.beat));

    // 겹치는/이어지는 점유를 병합해 실제 "빈" 구간만 남긴다
    const merged: LaneOccupant[] = [];
    for (const occ of occupants) {
      const last = merged[merged.length - 1];
      if (last && beatLte(occ.beat, last.endBeat)) {
        last.endBeat = beatMax(last.endBeat, occ.endBeat);
      } else {
        merged.push({ ...occ });
      }
    }

    // 선행 공백: beat 0 → 첫 점유
    const first = merged[0];
    if (first) {
      pushGap(restZones, lane, BEAT_ZERO, first.beat, thresholdFloat, marginBeats);
    }
    // 점유 사이 공백
    for (let i = 0; i < merged.length - 1; i++) {
      pushGap(restZones, lane, merged[i].endBeat, merged[i + 1].beat, thresholdFloat, marginBeats);
    }
  }

  return restZones;
}

function pushGap(
  out: RestZone[],
  lane: number,
  gapStart: Beat,
  gapEnd: Beat,
  thresholdFloat: number,
  marginBeats: Beat,
): void {
  const gapFloat = beatToFloat(beatSub(gapEnd, gapStart));
  if (gapFloat < thresholdFloat) return;
  const endBeat = beatSub(gapEnd, marginBeats);
  if (beatLte(endBeat, gapStart)) return;
  out.push({ lane, beat: gapStart, endBeat });
}
