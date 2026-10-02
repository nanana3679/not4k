import { describe, expect, it } from "vitest";
import { parseJudgmentCaseCliArgs } from "./judgmentCaseCli";

describe("parseJudgmentCaseCliArgs", () => {
  it("사례 파일 하나와 --out이면 엔진 없이(현재 워크트리) 그 사례를 렌더", () => {
    expect(parseJudgmentCaseCliArgs(["case.txt", "--out", "out.png"])).toEqual({
      cases: ["case.txt"], out: "out.png", engines: [], help: false,
    });
  });

  it("--engine을 두 번 쓰면 적은 순서대로 엔진 두 개", () => {
    const options = parseJudgmentCaseCliArgs(["case.txt", "--out=out.png", "--engine", "/a", "--engine=/b"]);
    expect(options.engines).toEqual(["/a", "/b"]);
    expect(options.out).toBe("out.png");
  });

  it("사례 여러 개와 --scale 0.8을 받음", () => {
    const options = parseJudgmentCaseCliArgs(["a.txt", "b.json", "--scale", "0.8", "--out", "x.png"]);
    expect(options.cases).toEqual(["a.txt", "b.json"]);
    expect(options.scale).toBe(0.8);
  });

  it("사례 자리의 - 는 표준 입력을 뜻하는 사례로 남김", () => {
    expect(parseJudgmentCaseCliArgs(["-", "--out", "x.png"]).cases).toEqual(["-"]);
  });

  it("pnpm이 넘기는 -- 구분자는 무시: -- case.txt --out x.png", () => {
    expect(parseJudgmentCaseCliArgs(["--", "case.txt", "--out", "x.png"]).cases).toEqual(["case.txt"]);
  });

  it("--help면 다른 인자 검사 없이 help true", () => {
    expect(parseJudgmentCaseCliArgs(["--help"]).help).toBe(true);
  });

  it("--out이 없으면 에러", () => {
    expect(() => parseJudgmentCaseCliArgs(["case.txt"])).toThrow(/--out/);
  });

  it("사례가 없으면 에러", () => {
    expect(() => parseJudgmentCaseCliArgs(["--out", "x.png"])).toThrow(/사례/);
  });

  it("--scale 0이나 숫자가 아닌 값은 에러", () => {
    expect(() => parseJudgmentCaseCliArgs(["a.txt", "--out", "x.png", "--scale", "0"])).toThrow(/--scale/);
    expect(() => parseJudgmentCaseCliArgs(["a.txt", "--out", "x.png", "--scale", "big"])).toThrow(/--scale/);
  });

  it("알 수 없는 옵션 --foo는 에러", () => {
    expect(() => parseJudgmentCaseCliArgs(["a.txt", "--out", "x.png", "--foo"])).toThrow(/--foo/);
  });

  it("값이 필요한 --engine 뒤에 값이 없으면 에러", () => {
    expect(() => parseJudgmentCaseCliArgs(["a.txt", "--out", "x.png", "--engine"])).toThrow(/--engine/);
  });
});
