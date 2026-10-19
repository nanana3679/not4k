/**
 * hiddenViolationLanes — 저장 게이트의 "숨은 보조 레인 위반" 안내 재료 (RFD 0018 §8-7)
 *
 * 보조 노트 ↔ ExtraNoteEntity 매핑은 `shared/chart/auxAdapter`로 이관됐다(editor→shared
 * 단방향 의존 유지). 이 모듈은 위반 refs → 숨은 보조 레인 목록 파생만 남긴다.
 */

import type { NoteEntity, TrillZone, ValidationError } from "../../shared";
import { isAuxLane, isVisibleLane, MAX_EXTRA_LANE_COUNT, toAuxIndex } from "../../shared";

/**
 * 위반에 연루된 노트·trillZone 중 현재 표시 범위 밖 보조 레인의 lane 목록 (오름차순, 중복 제거).
 *
 * §8-4(축소 시 숨김)와 게이트 동일 취급(§3-6)이 결합하면 화면에 없는 노트의 위반이
 * 저장·플레이를 막을 수 있다 — 차단 안내가 "숨은 보조 레인 위반"임과 필요한 레인 수를
 * 명시하기 위한 재료를 제공한다. 보조 레인 trillZone(`trillZoneMainOnly`, #102)도 같은 이유로 포함한다.
 */
export function hiddenViolationLanes(
  errors: readonly ValidationError[],
  notes: readonly NoteEntity[],
  extraLaneCount: number,
  trillZones: readonly TrillZone[] = [],
): number[] {
  const lanes = new Set<number>();
  for (const err of errors) {
    for (const ref of err.refs ?? []) {
      const lane = ref.kind === "note"
        ? notes[ref.index]?.lane
        : ref.kind === "trillZone"
          ? trillZones[ref.index]?.lane
          : undefined;
      // 진짜 보조 레인(5+)이면서 숨겨진 것만 — malformed lane(0·음수·비정수)은 구조 위반이라
      // "숨은 보조 레인"이 아니다. 가드 없으면 toAuxIndex(0)=-4 같은 음수 필요 레인 수가 나온다.
      if (lane !== undefined && isAuxLane(lane) && !isVisibleLane(lane, extraLaneCount)) lanes.add(lane);
    }
  }
  return [...lanes].sort((a, b) => a - b);
}

/**
 * 저장 차단 모달의 숨은 보조 레인 안내 문구 (0~2줄). 입력은 `hiddenViolationLanes`의 결과다.
 *
 * 툴바로 드러낼 수 있는 레인(보조 인덱스 ≤ `MAX_EXTRA_LANE_COUNT`)은 필요한 보조 레인 수를 알리고,
 * 그 너머 레인은 보조 레인 수를 늘려도 보이지 않으므로 차트 파일을 직접 고치라고 알린다 —
 * 로드 확장도 이 상한에서 멈춰 lane 15+ 보조 레인 trillZone이 여기에 남는다(#102).
 */
export function hiddenViolationLaneMessages(hiddenLanes: readonly number[]): string[] {
  const auxIndices = hiddenLanes.map(toAuxIndex);
  const reachable = auxIndices.filter((i) => i <= MAX_EXTRA_LANE_COUNT);
  const unreachable = auxIndices.filter((i) => i > MAX_EXTRA_LANE_COUNT);
  const messages: string[] = [];
  if (reachable.length > 0) {
    messages.push(
      `숨은 보조 레인(${reachable.join(", ")})의 위반이 포함되어 있습니다 — 보조 레인 수를 ${Math.max(...reachable)} 이상으로 늘리면 보입니다.`,
    );
  }
  if (unreachable.length > 0) {
    messages.push(
      `보조 레인 수 상한(${MAX_EXTRA_LANE_COUNT})을 넘는 보조 레인(${unreachable.join(", ")})의 위반이 포함되어 있습니다 — 에디터에서는 선택·편집할 수 없으니 차트 파일을 직접 고쳐야 합니다.`,
    );
  }
  return messages;
}
