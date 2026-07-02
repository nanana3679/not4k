import { describe, expect, it } from "vitest";
import { resolveLongPressAction } from "./longPressRouting";

describe("resolveLongPressAction — 롱프레스 발화 시 액션 라우팅", () => {
  it("노트 끝 히트가 있으면 노트/엑스트라보다 우선해 resizeNoteEnd로 라우팅한다", () => {
    expect(resolveLongPressAction({ noteEndHit: 3, noteHit: 5, extraHit: 2 })).toEqual({
      kind: "resizeNoteEnd",
      index: 3,
    });
  });

  it("노트 끝은 없고 노트 히트가 있으면 엑스트라보다 우선해 moveNote로 라우팅한다", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: 5, extraHit: 2 })).toEqual({
      kind: "moveNote",
      index: 5,
    });
  });

  it("노트 히트가 없고 엑스트라 히트만 있으면 moveExtra로 라우팅한다", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: null, extraHit: 2 })).toEqual({
      kind: "moveExtra",
      index: 2,
    });
  });

  it("히트 인덱스가 0이어도(falsy) 유효 히트로 처리한다", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: 0, extraHit: null })).toEqual({
      kind: "moveNote",
      index: 0,
    });
  });

  it("모든 히트가 null이면 none을 반환한다", () => {
    expect(resolveLongPressAction({ noteEndHit: null, noteHit: null, extraHit: null })).toEqual({
      kind: "none",
    });
  });
});
