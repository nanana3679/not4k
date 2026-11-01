/**
 * Lab 정적 빌드 문서(lab/index.html)가 허용해야 하는 script-src 전체.
 * 옵저버 감속 Lab의 Signalsmith Stretch가 AudioWorklet 안에서 WASM을 컴파일하므로 'wasm-unsafe-eval'만 더한다.
 * 'unsafe-eval' 같은 다른 출처가 더 붙으면 검증이 실패해야 하므로 포함 여부가 아니라 지시문 전체를 비교한다.
 */
export const LAB_SCRIPT_SRC = "script-src 'self' 'wasm-unsafe-eval'";

/** 문서 CSP 메타의 script-src 지시문이 LAB_SCRIPT_SRC와 정확히 같으면 null, 아니면 무엇이 다른지 돌려준다. */
export function labScriptSrcProblem(html: string): string | null {
  const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)?.[1];
  if (policy === undefined) return "Lab document has no Content-Security-Policy meta";
  const directives = policy
    .split(";")
    .map((directive) => directive.trim().replace(/\s+/g, " "))
    .filter((directive) => directive === "script-src" || directive.startsWith("script-src "));
  if (directives.length !== 1) return `Lab document CSP must have exactly one script-src directive, found ${directives.length}`;
  if (directives[0] !== LAB_SCRIPT_SRC) return `Lab document CSP script-src must be "${LAB_SCRIPT_SRC}", found "${directives[0]}"`;
  return null;
}
