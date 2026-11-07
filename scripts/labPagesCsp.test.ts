import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LAB_SCRIPT_SRC, labScriptSrcProblem } from "./labPagesCsp.ts";

const labDocument = readFileSync(fileURLToPath(new URL("../lab/index.html", import.meta.url)), "utf8");
const withScriptSrc = (scriptSrc: string) => labDocument.replace("script-src 'self' 'wasm-unsafe-eval';", scriptSrc);

describe("Lab 정적 빌드 문서 CSP 검증", () => {
  it("lab/index.html의 script-src는 정확히 \"script-src 'self' 'wasm-unsafe-eval'\"이라 통과한다", () => {
    expect(LAB_SCRIPT_SRC).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(labScriptSrcProblem(labDocument)).toBeNull();
  });

  it("script-src에 'unsafe-eval'이 더 붙으면 'wasm-unsafe-eval'을 포함해도 실패한다", () => {
    expect(labScriptSrcProblem(withScriptSrc("script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval';"))).toContain("'unsafe-eval'");
  });

  it("script-src가 'self'뿐이면 WASM 컴파일이 막혀 실패한다", () => {
    expect(labScriptSrcProblem(withScriptSrc("script-src 'self';"))).not.toBeNull();
  });

  it("줄바꿈·여러 칸 공백으로 나뉜 같은 지시문은 통과한다", () => {
    expect(labScriptSrcProblem(withScriptSrc("script-src\n          'self'   'wasm-unsafe-eval';"))).toBeNull();
  });

  it("script-src 지시문이 두 번 있으면 실패한다", () => {
    expect(labScriptSrcProblem(withScriptSrc("script-src 'self' 'wasm-unsafe-eval'; script-src 'self' 'unsafe-eval';"))).not.toBeNull();
  });
});
