/**
 * resolveGrab — Select 모드 down이 잡는 대상(GrabTarget)을 정하는 순수 우선순위 사다리.
 *
 * grab z-order(캡 4종 > 노트 > 존 몸통 2종 > 빈 곳)의 유일한 소유자다. 마우스
 * (SelectMode.onPointerDown)와 터치(scheduleFromGrabTarget)가 같은 함수를 소비하므로
 * 우선순위 변경은 여기 한 곳이고, 두 경로가 갈라질 코드 위치 자체가 없다(이슈 #143).
 * hover 커서의 끝 캡 ns-resize도 1단계 판정(resolveNoteEndCap)을 그대로 쓴다(#100).
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
  const { x, y, space, sel } = input;

  // 1. RangeNote 끝(리사이즈) — 끝 캡을 잡으면 리사이즈. 게이트는 resolveNoteEndCap(hover 커서와 공유).
  const endCap = resolveNoteEndCap(input);
  if (endCap !== null) return { kind: "noteEndCap", index: endCap };

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

/**
 * 1단계(noteEndCap) 판정 — down이 (x, y)에서 잡을 롱노트 끝 캡의 노트 인덱스, 없으면 null.
 * resolveGrab 1단계와 hover 커서(ns-resize)가 이 한 함수를 쓰므로 커서와 grab이 갈라지지 않는다(#100).
 *
 * 게이트: 선택된 롱노트의 끝 캡은 항상 잡는다. 미선택이면 z-order 최상위일 때만 잡는다 — 끝점 위에
 * 겹친 다른 노트 클릭을 가로채지 않도록(o-o-). 또 보조 레인 칸은 이벤트 editorLane 칸과 같은 x라
 * 구간 이벤트 끝과 겹칠 수 있는데, 그때 미선택 노트 캡은 양보해 2단계(eventEndCap)로 내려간다 —
 * 구간 이벤트 끝은 끝 캡 리사이즈 말고는 바꿀 방법이 없고, 노트 끝은 먼저 선택하면 잡을 수 있다.
 */
export function resolveNoteEndCap(input: {
  x: number;
  y: number;
  space: Pick<TimelineSpace, "hitTestNoteEnd" | "hitTestUnifiedNote" | "hitTestEventEnd">;
  /** down 시점 선택 — notes만 읽는다. */
  sel: Pick<GrabSelectionView, "notes">;
  /** chart.notes[i]가 RangeNote(endBeat 보유)인가. */
  isRangeNote: (noteIndex: number) => boolean;
}): number | null {
  const { x, y, space, sel, isRangeNote } = input;
  const endHit = space.hitTestNoteEnd(x, y);
  if (endHit === null || !isRangeNote(endHit)) return null;
  if (sel.notes.has(endHit)) return endHit;
  if (space.hitTestUnifiedNote(x, y) !== endHit) return null;
  if (space.hitTestEventEnd(x, y) !== null) return null;
  return endHit;
}
