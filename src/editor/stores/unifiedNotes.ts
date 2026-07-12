/**
 * hiddenViolationLanes — 저장 게이트의 "숨은 보조 레인 위반" 안내 재료 (RFD 0018 §8-7)
 *
 * 보조 노트 ↔ ExtraNoteEntity 매핑은 `shared/chart/auxAdapter`로 이관됐다(editor→shared
 * 단방향 의존 유지). 이 모듈은 위반 refs → 숨은 보조 레인 목록 파생만 남긴다.
 */

import type { NoteEntity, ValidationError } from "../../shared";
import { isVisibleLane } from "../../shared";

/**
 * 위반에 연루된 노트 중 현재 표시 범위 밖 보조 레인의 lane 목록 (오름차순, 중복 제거).
 *
 * §8-4(축소 시 숨김)와 게이트 동일 취급(§3-6)이 결합하면 화면에 없는 노트의 위반이
 * 저장·플레이를 막을 수 있다 — 차단 안내가 "숨은 보조 레인 위반"임과 필요한 레인 수를
 * 명시하기 위한 재료를 제공한다.
 */
export function hiddenViolationLanes(
  errors: readonly ValidationError[],
  notes: readonly NoteEntity[],
  extraLaneCount: number,
): number[] {
  const lanes = new Set<number>();
  for (const err of errors) {
    for (const ref of err.refs ?? []) {
      if (ref.kind !== "note") continue;
      const note = notes[ref.index];
      if (note && !isVisibleLane(note.lane, extraLaneCount)) lanes.add(note.lane);
    }
  }
  return [...lanes].sort((a, b) => a - b);
}
