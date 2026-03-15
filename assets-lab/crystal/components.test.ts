import { describe, it, expect } from "vitest";
import * as C from "./components.jsx";

describe("crystal/components export 검증", () => {
  it("기존 컴포넌트가 모두 export 되어야 한다", () => {
    expect(typeof C.Core).toBe("function");
    expect(typeof C.Holder).toBe("function");
    expect(typeof C.Wire).toBe("function");
    expect(typeof C.NoteContainer).toBe("function");
    expect(typeof C.BodySegment).toBe("function");
    expect(typeof C.TerminalCap).toBe("function");
    expect(typeof C.LongNote).toBe("function");
    expect(typeof C.ButtonExport).toBe("function");
    expect(typeof C.BombFrame).toBe("function");
  });

  it("GearFrameExport가 함수로 export 되어야 한다", () => {
    expect(typeof C.GearFrameExport).toBe("function");
  });

  it("실패 상태 컴포넌트가 모두 export 되어야 한다", () => {
    expect(typeof C.FailedNoteContainer).toBe("function");
    expect(typeof C.FailedBody).toBe("function");
    expect(typeof C.FailedTerminalCap).toBe("function");
  });

  it("부분 실패 컴포넌트 3종이 함수로 export 되어야 한다", () => {
    expect(typeof C.PartialFailedBody).toBe("function");
    expect(typeof C.PartialFailedTerminalCap).toBe("function");
    expect(typeof C.PartialFailedNoteContainer).toBe("function");
  });
});

describe("FAIL 팔레트 검증", () => {
  const { FAIL } = C;

  it("FAIL 객체가 export 되어야 한다", () => {
    expect(FAIL).toBeDefined();
  });

  it("FAIL.single은 무채색 계열 (#2a2a2a ~ #aaaaaa)", () => {
    expect(FAIL.single.deep).toBe("#2a2a2a");
    expect(FAIL.single.base).toBe("#3a3a3a");
    expect(FAIL.single.mid).toBe("#555555");
    expect(FAIL.single.bright).toBe("#6a6a6a");
    expect(FAIL.single.highlight).toBe("#888888");
    expect(FAIL.single.specular).toBe("#aaaaaa");
  });

  it("FAIL.double은 FAIL.single과 동일한 무채색 팔레트", () => {
    expect(FAIL.double).toEqual(FAIL.single);
  });

  it("FAIL.core.off=#1a1a1a, offBright=#3a3a3a (무채색 dimmed)", () => {
    expect(FAIL.core.off).toBe("#1a1a1a");
    expect(FAIL.core.offBase).toBe("#222222");
    expect(FAIL.core.offMid).toBe("#2a2a2a");
    expect(FAIL.core.offBright).toBe("#3a3a3a");
  });

  it("FAIL.body.single/double은 무채색 base+edge", () => {
    expect(FAIL.body.single.base).toBe("#2a2a2a");
    expect(FAIL.body.single.edge).toBe("#1a1a1a");
    expect(FAIL.body.double).toEqual(FAIL.body.single);
  });

  it("FAIL 팔레트의 모든 색상 값이 무채색(R=G=B)이다", () => {
    const isGray = (hex: string) => {
      const r = hex.slice(1, 3);
      const g = hex.slice(3, 5);
      const b = hex.slice(5, 7);
      return r === g && g === b;
    };
    // single
    Object.values(FAIL.single).forEach(v => expect(isGray(v as string)).toBe(true));
    // core
    Object.values(FAIL.core).forEach(v => expect(isGray(v as string)).toBe(true));
    // body
    expect(isGray(FAIL.body.single.base)).toBe(true);
    expect(isGray(FAIL.body.single.edge)).toBe(true);
  });
});
