import { describe, expect, it } from "vitest";
import {
  nextTouchMultiSelectLatch,
  resolveHoldFireAction,
  resolveSelectTouchDownSchedule,
  resolveTouchCreateUpAction,
  shouldArmHoldTimer,
  shouldDeleteOnUp,
  shouldFireTapToggle,
} from "./touchEditRouting";

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

describe("resolveSelectTouchDownSchedule — select 터치 down 후보 예약", () => {
  it("노트 히트가 있으면 tapToggle 예약", () => {
    expect(resolveSelectTouchDownSchedule({ noteHit: 3, extraHit: null })).toBe("tapToggle");
  });

  it("엑스트라 히트가 있으면 tapToggle 예약", () => {
    expect(resolveSelectTouchDownSchedule({ noteHit: null, extraHit: 2 })).toBe("tapToggle");
  });

  it("노트 히트 인덱스가 0이어도(falsy) tapToggle 예약", () => {
    expect(resolveSelectTouchDownSchedule({ noteHit: 0, extraHit: null })).toBe("tapToggle");
  });

  it("아무 히트도 없으면 emptySelectBox 예약", () => {
    expect(resolveSelectTouchDownSchedule({ noteHit: null, extraHit: null })).toBe("emptySelectBox");
  });

  it("트릴존 끝(리사이즈 캡) 히트가 있으면 노트가 겹쳐도 emptySelectBox(지연-드래그) 예약", () => {
    // 경계 노트(noteHit=5)가 겹쳐도 트릴존 끝이 우선 → 리사이즈 드래그 경로로 진입
    expect(resolveSelectTouchDownSchedule({ noteHit: 5, extraHit: null, zoneEndHit: 0 })).toBe("emptySelectBox");
  });

  it("트릴존 이동 핸들 히트가 있으면 노트가 겹쳐도 emptySelectBox(지연-드래그) 예약", () => {
    expect(resolveSelectTouchDownSchedule({ noteHit: 5, extraHit: null, zoneHandleHit: 0 })).toBe("emptySelectBox");
  });

  it("트릴존 히트 인덱스가 0이어도(falsy) 노트보다 우선한다", () => {
    expect(resolveSelectTouchDownSchedule({ noteHit: 5, extraHit: null, zoneEndHit: 0, zoneHandleHit: null })).toBe("emptySelectBox");
  });

  it("트릴존 히트가 없으면(undefined/null) 기존 노트 우선 규칙 유지", () => {
    expect(resolveSelectTouchDownSchedule({ noteHit: 5, extraHit: null, zoneHandleHit: null, zoneEndHit: null })).toBe("tapToggle");
  });
});

describe("shouldArmHoldTimer — 롱프레스 hold 타이머 무장 여부", () => {
  it("delete 모드는 히트 없어도 무장(빈 곳 드래그 삭제 시작)", () => {
    expect(shouldArmHoldTimer({ mode: "delete", rangeType: null, hits: noHits })).toBe(true);
  });

  it("create + rangeType(long)은 히트 없어도 무장(빈 타임라인 범위 생성)", () => {
    expect(shouldArmHoldTimer({ mode: "create", rangeType: "long", hits: noHits })).toBe(true);
  });

  it("create-point(rangeType null)은 히트 없으면 무장 안 함(점노트는 down 배치)", () => {
    expect(shouldArmHoldTimer({ mode: "create", rangeType: null, hits: noHits })).toBe(false);
  });

  it("create-point이라도 노트 히트가 있으면 무장(롱프레스로 그 노트 선택 드래그)", () => {
    expect(shouldArmHoldTimer({ mode: "create", rangeType: null, hits: noteHit })).toBe(true);
  });

  it("select은 히트 없으면 무장 안 함(빈 곳은 박스 후보)", () => {
    expect(shouldArmHoldTimer({ mode: "select", rangeType: null, hits: noHits })).toBe(false);
  });

  it("select + 노트 끝 히트면 무장", () => {
    expect(shouldArmHoldTimer({ mode: "select", rangeType: null, hits: endHit })).toBe(true);
  });

  it("select + 엑스트라 히트면 무장", () => {
    expect(shouldArmHoldTimer({ mode: "select", rangeType: null, hits: extraHit })).toBe(true);
  });
});

describe("resolveHoldFireAction — 롱프레스 발화 액션 재도출", () => {
  it("delete 모드는 delete", () => {
    expect(resolveHoldFireAction({ mode: "delete", rangeType: null, hits: noHits })).toBe("delete");
  });

  it("create + rangeType은 createRange", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: "doubleLong", hits: noHits })).toBe("createRange");
  });

  it("create-point + 노트 히트는 selectDrag(그 노트를 잡는다)", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: null, hits: noteHit })).toBe("selectDrag");
  });

  it("create-point + 히트 없음은 none(점노트는 이미 down 배치)", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: null, hits: noHits })).toBe("none");
  });

  it("select + 노트 히트는 selectDrag", () => {
    expect(resolveHoldFireAction({ mode: "select", rangeType: null, hits: noteHit })).toBe("selectDrag");
  });

  it("select + 히트 없음은 none", () => {
    expect(resolveHoldFireAction({ mode: "select", rangeType: null, hits: noHits })).toBe("none");
  });

  it("create + rangeType은 노트가 겹쳐도 createRange 우선(범위 생성이 이긴다)", () => {
    expect(resolveHoldFireAction({ mode: "create", rangeType: "long", hits: noteHit })).toBe("createRange");
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
