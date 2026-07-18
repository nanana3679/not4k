import { describe, expect, it } from "vitest";
import {
  nextTouchMultiSelectLatch,
  resolveHoldFireAction,
  resolveTouchCreateUpAction,
  scheduleFromGrabTarget,
  shouldArmHoldTimer,
  shouldDeleteOnUp,
  shouldFireTapToggle,
} from "./touchEditRouting";
import type { GrabTarget } from "../modes/resolveGrab";

const noHits = { noteHit: null, noteEndHit: null, extraHit: null };
const noteHit = { noteHit: 3, noteEndHit: null, extraHit: null };
const endHit = { noteHit: null, noteEndHit: 3, extraHit: null };
const extraHit = { noteHit: null, noteEndHit: null, extraHit: 2 };

describe("resolveTouchCreateUpAction — create 후보 up 확정", () => {
  it("범위 드래그 발화 + 뗀 지점이 범위 안이면 commitDrag", () => {
    expect(resolveTouchCreateUpAction({ fired: true, moved: true, endInBounds: true, candidateStartInBounds: true }))
      .toBe("commitDrag");
  });

  it("범위 드래그 발화 + 뗀 지점이 범위 밖이면 cancelDrag", () => {
    expect(resolveTouchCreateUpAction({ fired: true, moved: true, endInBounds: false, candidateStartInBounds: true }))
      .toBe("cancelDrag");
  });

  it("발화 없음 + 이동 없음 + 시작점 범위 안이면 createPointTap(탭=단노트)", () => {
    expect(resolveTouchCreateUpAction({ fired: false, moved: false, endInBounds: true, candidateStartInBounds: true }))
      .toBe("createPointTap");
  });

  it("발화 없음 + 이동 있으면 none(스크롤/취소로 흘려보냄)", () => {
    expect(resolveTouchCreateUpAction({ fired: false, moved: true, endInBounds: true, candidateStartInBounds: true }))
      .toBe("none");
  });

  it("발화 없음 + 이동 없음이지만 시작점이 범위 밖이면 none", () => {
    expect(resolveTouchCreateUpAction({ fired: false, moved: false, endInBounds: true, candidateStartInBounds: false }))
      .toBe("none");
  });
});

describe("shouldFireTapToggle — 노트/엑스트라 탭 토글 발화 여부", () => {
  it("이동 없음 + 롱프레스 미발화면 true", () => {
    expect(shouldFireTapToggle({ moved: false, longPressFired: false })).toBe(true);
  });

  it("이동했으면 false(탭 아님)", () => {
    expect(shouldFireTapToggle({ moved: true, longPressFired: false })).toBe(false);
  });

  it("롱프레스가 발화했으면 false(이미 드래그로 처리됨)", () => {
    expect(shouldFireTapToggle({ moved: false, longPressFired: true })).toBe(false);
  });
});

describe("shouldDeleteOnUp — delete 후보 up 삭제 여부", () => {
  it("드래그 삭제가 발화했으면 true", () => {
    expect(shouldDeleteOnUp({ fired: true, moved: true })).toBe(true);
  });

  it("이동 없이 뗀 탭이면 true", () => {
    expect(shouldDeleteOnUp({ fired: false, moved: false })).toBe(true);
  });

  it("발화 없이 이동만 했으면 false(스크롤성 이동)", () => {
    expect(shouldDeleteOnUp({ fired: false, moved: true })).toBe(false);
  });
});

// resolveSelectTouchDownSchedule는 scheduleFromGrabTarget으로 대체되었다(#143).
// 우선순위 사다리·존끝 선택게이트 의미론은 이제 resolveGrab.test.ts(사다리 1~8·게이트)가
// 소유하고, GrabTarget→스케줄 2택 매핑만 아래 describe가 덮는다.
describe("scheduleFromGrabTarget — GrabTarget을 터치 select down 스케줄로 접기", () => {
  it("GrabTarget이 note면 tapToggle 예약(순수 노트 탭)", () => {
    expect(scheduleFromGrabTarget({ kind: "note", index: 3 })).toBe("tapToggle");
  });

  it("GrabTarget이 trillZoneEndCap이면 emptySelectBox 예약(지연-드래그 재생으로 리사이즈 진입)", () => {
    expect(scheduleFromGrabTarget({ kind: "trillZoneEndCap", index: 0 })).toBe("emptySelectBox");
  });

  it("note 외 7종(캡 4종·몸통 2종·empty)은 전부 emptySelectBox 예약", () => {
    const nonNote: GrabTarget[] = [
      { kind: "noteEndCap", index: 1 },
      { kind: "eventEndCap", index: 1 },
      { kind: "trillZoneEndCap", index: 1 },
      { kind: "restZoneEndCap", index: 1 },
      { kind: "trillZoneBody", index: 1 },
      { kind: "restZoneBody", index: 1 },
      { kind: "empty" },
    ];
    for (const target of nonNote) {
      expect(scheduleFromGrabTarget(target)).toBe("emptySelectBox");
    }
  });

  it("note 인덱스가 0(falsy)이어도 tapToggle 예약(kind 판별이라 falsy 함정 없음)", () => {
    expect(scheduleFromGrabTarget({ kind: "note", index: 0 })).toBe("tapToggle");
  });
});

describe("shouldArmHoldTimer — 롱프레스 hold 타이머 무장 여부", () => {
  it("delete 모드는 히트 없어도 무장(빈 곳 드래그 삭제 시작)", () => {
    expect(shouldArmHoldTimer({ mode: "delete", rangeType: null, placementBlocked: false, hits: noHits })).toBe(true);
  });

  it("create + rangeType(long) + 미차단은 히트 없어도 무장(빈 타임라인 범위 생성)", () => {
    expect(shouldArmHoldTimer({ mode: "create", rangeType: "long", placementBlocked: false, hits: noHits })).toBe(true);
  });

  it("create + rangeType + 차단 + 히트는 무장(그 노트 잡는 select-drag)", () => {
    expect(shouldArmHoldTimer({ mode: "create", rangeType: "long", placementBlocked: true, hits: noteHit })).toBe(true);
  });

  it("create + rangeType + 차단 + 히트 없음은 무장 안 함(범위도 못 만들고 잡을 것도 없음)", () => {
    expect(shouldArmHoldTimer({ mode: "create", rangeType: "long", placementBlocked: true, hits: noHits })).toBe(false);
  });

  it("create-point(rangeType null)은 히트 없으면 무장 안 함(점노트는 down 배치)", () => {
    expect(shouldArmHoldTimer({ mode: "create", rangeType: null, placementBlocked: false, hits: noHits })).toBe(false);
  });

  it("create-point이라도 노트 히트가 있으면 무장(롱프레스로 그 노트 선택 드래그)", () => {
    expect(shouldArmHoldTimer({ mode: "create", rangeType: null, placementBlocked: true, hits: noteHit })).toBe(true);
  });

  it("select은 히트 없으면 무장 안 함(빈 곳은 박스 후보)", () => {
    expect(shouldArmHoldTimer({ mode: "select", rangeType: null, placementBlocked: false, hits: noHits })).toBe(false);
  });

  it("select + 노트 끝 히트면 무장", () => {
    expect(shouldArmHoldTimer({ mode: "select", rangeType: null, placementBlocked: false, hits: endHit })).toBe(true);
  });

  it("select + 엑스트라 히트면 무장", () => {
    expect(shouldArmHoldTimer({ mode: "select", rangeType: null, placementBlocked: false, hits: extraHit })).toBe(true);
  });
});

describe("resolveHoldFireAction — 롱프레스 발화 액션 재도출", () => {
  it("delete 모드는 delete", () => {
    expect(resolveHoldFireAction({ mode: "delete", rangeType: null, placementBlocked: false, hits: noHits })).toBe("delete");
  });

  it("create + rangeType + 미차단은 createRange", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: "doubleLong", placementBlocked: false, hits: noHits })).toBe("createRange");
  });

  it("create + rangeType + 차단 + 히트는 selectDrag(범위 못 만드니 그 노트를 잡는다)", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: "long", placementBlocked: true, hits: noteHit })).toBe("selectDrag");
  });

  it("create + rangeType + 차단 + 히트 없음은 none", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: "long", placementBlocked: true, hits: noHits })).toBe("none");
  });

  it("create-point + 노트 히트는 selectDrag(그 노트를 잡는다)", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: null, placementBlocked: true, hits: noteHit })).toBe("selectDrag");
  });

  it("create-point + 히트 없음은 none(점노트는 이미 down 배치)", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: null, placementBlocked: false, hits: noHits })).toBe("none");
  });

  it("select + 노트 히트는 selectDrag", () => {
    expect(resolveHoldFireAction({ mode: "select", rangeType: null, placementBlocked: false, hits: noteHit })).toBe("selectDrag");
  });

  it("select + 히트 없음은 none", () => {
    expect(resolveHoldFireAction({ mode: "select", rangeType: null, placementBlocked: false, hits: noHits })).toBe("none");
  });
});

describe("nextTouchMultiSelectLatch — 터치 다중선택 래치 리셋", () => {
  it("선택이 0개면 래치가 켜져 있어도 꺼진다", () => {
    expect(nextTouchMultiSelectLatch(true, 0)).toBe(false);
  });

  it("선택이 남아 있으면(1개 이상) 켜진 래치를 유지한다", () => {
    expect(nextTouchMultiSelectLatch(true, 1)).toBe(true);
  });

  it("선택이 남아 있어도 꺼진 래치는 계속 꺼져 있다", () => {
    expect(nextTouchMultiSelectLatch(false, 3)).toBe(false);
  });

  it("선택이 0개면 꺼진 래치는 그대로 꺼져 있다", () => {
    expect(nextTouchMultiSelectLatch(false, 0)).toBe(false);
  });
});
