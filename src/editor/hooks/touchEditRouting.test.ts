import { describe, expect, it } from "vitest";
import { resolveTouchCreateUpAction, shouldDeleteOnUp, shouldFireTapToggle } from "./touchEditRouting";

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
