import { describe, expect, it } from "vitest";
import gameDocument from "../../index.html?raw";
import labDocument from "../../lab/index.html?raw";
import { allowWasmInLabDocumentCsp } from "./labDevCsp";

const csp = (html: string) => html.match(/script-src [^;]*;/)?.[0];

describe("개발 서버 Lab 문서 CSP", () => {
  it("개발 서버가 /lab/observer-slowdown 문서를 열면 script-src 'self'에 'wasm-unsafe-eval'을 더한다", () => {
    expect(csp(allowWasmInLabDocumentCsp(gameDocument, "/index.html", "/lab/observer-slowdown"))).toBe("script-src 'self' 'wasm-unsafe-eval';");
  });

  it("/lab?from=home 목록 문서도 같은 CSP 완화를 받는다", () => {
    expect(csp(allowWasmInLabDocumentCsp(gameDocument, "/index.html", "/lab?from=home"))).toBe("script-src 'self' 'wasm-unsafe-eval';");
  });

  it.each(["/", "/game/play", "/laboratory"])("%s 문서의 CSP는 script-src 'self' 그대로 둔다", (url) => {
    expect(csp(allowWasmInLabDocumentCsp(gameDocument, "/index.html", url))).toBe("script-src 'self';");
  });

  it("/lab/images/module-size-distance-20260910/ 이미지 갤러리처럼 앱 문서가 아닌 HTML은 CSP가 없어도 그대로 둔다", () => {
    const galleryHtml = "<html><title>갤러리</title></html>";
    expect(allowWasmInLabDocumentCsp(galleryHtml, "/lab/image-galleries/module-size-distance-20260910/index.html", "/lab/images/module-size-distance-20260910/"))
      .toBe(galleryHtml);
  });

  it("/lab 경로의 앱 문서인데 CSP에 script-src 'self';가 없으면 조용히 넘기지 않고 에러를 던진다", () => {
    expect(() => allowWasmInLabDocumentCsp("<html></html>", "/index.html", "/lab")).toThrow("script-src 'self';");
  });

  it("Lab 정적 빌드 문서(lab/index.html)는 'wasm-unsafe-eval'을 허용하고 게임 문서(index.html)는 허용하지 않는다", () => {
    expect(csp(labDocument)).toBe("script-src 'self' 'wasm-unsafe-eval';");
    expect(gameDocument).not.toContain("wasm-unsafe-eval");
  });
});
