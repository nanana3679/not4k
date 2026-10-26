import { describe, expect, it } from "vitest";
import { parseJudgmentCaseCliArgs } from "./judgmentCaseCli";

describe("parseJudgmentCaseCliArgs", () => {
  it("--explicit v4.json은 실제 새 세션과 기본 classic-explicit 스킨을 선택하고 --engine 두 개를 보존", () => {
    expect(parseJudgmentCaseCliArgs(["--explicit", "v4.json", "--out", "out.png", "--engine", ".", "--engine", "../other"])).toMatchObject({
      explicit: true, design: false, skin: "classic-explicit", engines: [".", "../other"],
    });
  });

  it("--explicit과 --design은 실제 판정·수동 설계를 섞지 않고 오류", () => {
    expect(() => parseJudgmentCaseCliArgs(["--explicit", "--design", "case.json", "--out", "x.png"])).toThrow(/--design.*--explicit/);
  });

  it("--explicit의 --skin classic과 legacy의 --skin classic-explicit은 조용히 무시하지 않고 오류", () => {
    expect(() => parseJudgmentCaseCliArgs(["--explicit", "v4.json", "--out", "x.png", "--skin", "classic"])).toThrow(/classic-explicit/);
    expect(() => parseJudgmentCaseCliArgs(["v3.json", "--out", "x.png", "--skin", "classic-explicit"])).toThrow(/--explicit/);
    expect(parseJudgmentCaseCliArgs(["--explicit", "v4.json", "--out", "x.png", "--skin", "classic-explicit"]).skin).toBe("classic-explicit");
  });
  it("사례 파일 하나와 --out이면 엔진 없이(현재 워크트리) 기본 스킨 classic으로 그 사례를 렌더", () => {
    expect(parseJudgmentCaseCliArgs(["case.txt", "--out", "out.png"])).toEqual({
      cases: ["case.txt"], out: "out.png", engines: [], skin: "classic", design: false, explicit: false, help: false,
    });
  });

  it("--design은 수동 설계 JSON 두 개와 --scale 0.5를 받고 엔진을 선택하지 않음", () => {
    expect(parseJudgmentCaseCliArgs(["--design", "a.json", "b.json", "--out", "out.png", "--scale", "0.5"])).toMatchObject({
      design: true, cases: ["a.json", "b.json"], engines: [], scale: 0.5,
    });
  });

  it("--design과 --engine을 섞으면 무시하지 않고 오류", () => {
    expect(() => parseJudgmentCaseCliArgs(["--engine=../main", "--design", "a.json", "--out", "out.png"])).toThrow(/--design.*--engine/);
  });

  it("--design의 기본 스킨은 classic이고 --skin simple도 그대로 선택", () => {
    expect(parseJudgmentCaseCliArgs(["--design", "a.json", "--out", "out.png"]).skin).toBe("classic");
    expect(parseJudgmentCaseCliArgs(["--design", "a.json", "--out", "out.png", "--skin", "simple"]).skin).toBe("simple");
  });

  it("--skin simple·--skin=crystal로 노트 스킨을 고름", () => {
    expect(parseJudgmentCaseCliArgs(["a.txt", "--out", "x.png", "--skin", "simple"]).skin).toBe("simple");
    expect(parseJudgmentCaseCliArgs(["a.txt", "--out", "x.png", "--skin=crystal"]).skin).toBe("crystal");
  });

  it("classic·crystal·simple이 아닌 --skin prism은 고를 수 있는 스킨을 담은 에러", () => {
    expect(() => parseJudgmentCaseCliArgs(["a.txt", "--out", "x.png", "--skin", "prism"])).toThrow(/--skin.*classic.*crystal.*simple.*prism/s);
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
