import { describe, expect, it } from "vitest";
import { resolveLongPressAction } from "./longPressRouting";

describe("resolveLongPressAction — 롱프레스 발화 시 액션 라우팅", () => {
  it("노트 끝 히트가 있으면 노트보다 우선해 resizeNoteEnd로 라우팅한다", () => {
    expect(resolveLongPressAction({ noteEndHit: 3, noteHit: 5 })).toEqual({
      kind: "resizeNoteEnd",
      index: 3,
    });
  });

  it("노트 끝은 없고 노트 히트(5)가 있으면 moveNote로 라우팅한다", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: 5 })).toEqual({
      kind: "moveNote",
      index: 5,
    });
  });

  it("보조 노트(통합 인덱스)도 noteHit로 통합돼 moveNote로 라우팅된다 (RFD 0018 ④ moveExtra 흡수)", () => {
    // 보조 노트가 chart.notes(lane 5+)로 통합돼 noteHit 하나가 메인·보조를 모두 가리킨다.
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: 7 })).toEqual({
      kind: "moveNote",
      index: 7,
    });
  });

  it("히트 인덱스가 0이어도(falsy) 유효 히트로 처리한다", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: 0 })).toEqual({
      kind: "moveNote",
      index: 0,
    });
  });

  it("모든 히트가 null이면 none을 반환한다", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: null })).toEqual({
      kind: "none",
    });
  });
});

describe("resolveLongPressAction — trillZone 몸통 (RFD 0016 §4.4)", () => {
  it("구간 몸통만 히트하면(zoneHit=0) moveZone", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: null, zoneHit: 0 }))
      .toEqual({ kind: "moveZone", index: 0 });
  });

  it("노트(2)와 구간(0)이 겹치면 노트 이동이 우선", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: 2, zoneHit: 0 }))
      .toEqual({ kind: "moveNote", index: 2 });
  });

  it("zoneHit 생략(구버전 호출)은 none으로 안전하게 처리된다", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: null }))
      .toEqual({ kind: "none" });
  });
});
