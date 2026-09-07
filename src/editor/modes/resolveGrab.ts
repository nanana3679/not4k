/**
 * resolveGrab — Select 모드 down이 잡는 대상(GrabTarget)을 정하는 순수 우선순위 사다리.
 *
 * grab z-order(캡 4종 > 노트 > 존 몸통 2종 > 빈 곳)의 유일한 소유자다. 마우스
 * (SelectMode.onPointerDown)와 터치(scheduleFromGrabTarget)가 같은 함수를 소비하므로
 * 우선순위 변경은 여기 한 곳이고, 두 경로가 갈라질 코드 위치 자체가 없다(이슈 #143).
 *
 * 수식자(shift/alt/toggle)는 대상 확정 "후"의 동작만 바꾸므로 이 타입·함수에 나타나지
 * 않는다 — 사다리 순서/게이트는 수식자와 독립이다. 리사이즈 캡 게이트(사다리 1·3·4)만
 * 현재 선택을 읽으며, 그 사실이 시그니처(sel 주입)에 드러난다("interface = test surface").
 *
 * 롱프레스 발화 사다리(longPressRouting.ts resolveLongPressAction)는 별개다 — 선택 게이트
 * 없는 "직접 조작" 축이라 흡수하지 않고, 노트끝>노트>존몸통 상대 순서만 공유한다(#143 §4).
 */

import type { TimelineSpace } from "../timeline/TimelineSpace";

/** Select 모드 down이 잡는 대상. */
export type GrabTarget =
  | { kind: "noteEndCap"; index: number } // 사다리 1: RangeNote 끝 리사이즈
  | { kind: "eventEndCap"; index: number } // 사다리 2: Event 끝 리사이즈
  | { kind: "trillZoneEndCap"; index: number } // 사다리 3: trillZone 끝 리사이즈(선택 게이트)
  | { kind: "restZoneEndCap"; index: number } // 사다리 4: restZone 끝 리사이즈(선택 게이트)
  | { kind: "note"; index: number } // 사다리 5: 통합 노트(메인·보조)
  | { kind: "trillZoneBody"; index: number } // 사다리 6: trillZone 몸통
  | { kind: "restZoneBody"; index: number } // 사다리 7: restZone 몸통
  | { kind: "empty" }; // 사다리 8: 빈 곳

/**
 * 리사이즈 캡 게이트(사다리 1·3·4)가 읽는 down 시점 선택의 읽기 전용 뷰.
 * selectionSlice의 Selection이 구조적으로 그대로 대입된다.
 */
export interface GrabSelectionView {
  notes: ReadonlySet<number>;
  zones: ReadonlySet<number>;
  restZones: ReadonlySet<number>;
}

export function resolveGrab(input: {
  x: number;
  y: number;
  /** 히트 프리미티브 주입 — 테스트는 makeFakeSpace로 조립. */
  space: TimelineSpace;
  /** down 시점 선택 — 게이트 1·3·4만 읽는다. */
  sel: GrabSelectionView;
  /**
   * 게이트 1용 chart 사실: chart.notes[i]가 RangeNote(endBeat 보유)인가.
   * chart 전체를 주입하지 않고 술어 하나로 접는다(store·chart 무지 유지).
   */
  isRangeNote: (noteIndex: number) => boolean;
}): GrabTarget {
  const { x, y, space, sel, isRangeNote } = input;

  // 1. RangeNote 끝(리사이즈) — 끝 캡을 잡으면 리사이즈. 게이트: 선택됐거나 z-order 최상위.
  //    미선택 끝 노트를 리사이즈가 가로채면 끝 노트 클릭이 안 되므로 topmost로 제한.
  const endHit = space.hitTestNoteEnd(x, y);
  if (endHit !== null && isRangeNote(endHit)) {
    if (sel.notes.has(endHit) || space.hitTestUnifiedNote(x, y) === endHit) {
      return { kind: "noteEndCap", index: endHit };
    }
  }

  // 2. Event 끝(리사이즈).
  const evtHit = space.hitTestEventEnd(x, y);
  if (evtHit !== null) return { kind: "eventEndCap", index: evtHit };

  // 3. TrillZone 끝(리사이즈) — 그 구간이 이미 선택됐을 때만(RFD 0016 §6-6).
  //    미선택 구간 끝에 놓인 노트 클릭을 리사이즈가 가로채지 않도록.
  const zoneEndHit = space.hitTestTrillZoneEnd(x, y);
  if (zoneEndHit !== null && sel.zones.has(zoneEndHit)) {
    return { kind: "trillZoneEndCap", index: zoneEndHit };
  }

  // 4. RestZone 끝(리사이즈) — trillZone 규칙 미러: 선택된 restZone만(RFD 0019).
  const restEndHit = space.hitTestRestZoneEnd(x, y);
  if (restEndHit !== null && sel.restZones.has(restEndHit)) {
    return { kind: "restZoneEndCap", index: restEndHit };
  }

  // 5. 통합 노트(메인·보조 무차별 — RFD 0018 ④d).
  const noteHit = space.hitTestUnifiedNote(x, y);
  if (noteHit !== null) return { kind: "note", index: noteHit };

  // 6. TrillZone 몸통.
  const zoneHit = space.hitTestTrillZone(x, y);
  if (zoneHit !== null) return { kind: "trillZoneBody", index: zoneHit };

  // 7. RestZone 몸통(RFD 0019 — trillZone §6-6 미러).
  const restHit = space.hitTestRestZone(x, y);
  if (restHit !== null) return { kind: "restZoneBody", index: restHit };

  // 8. 빈 곳.
  return { kind: "empty" };
}
