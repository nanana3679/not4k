const SELF_ONLY_SCRIPT_SRC = /script-src 'self';/;

/**
 * 개발 서버가 /lab 경로로 앱 문서(index.html)를 열 때만 CSP script-src에 'wasm-unsafe-eval'을 더한다.
 * 옵저버 감속 Lab의 Signalsmith Stretch가 AudioWorklet 안에서 WASM을 컴파일하는데, 워크릿은 문서의 CSP를 따라
 * script-src 'self'만으로는 컴파일이 막힌다. 게임 경로·이미지 갤러리 같은 다른 HTML과 프로덕션 빌드의 CSP는 바꾸지 않는다.
 * Lab 정적 빌드는 lab/index.html에 같은 값을 직접 둔다.
 */
export function allowWasmInLabDocumentCsp(html: string, documentPath: string, requestUrl: string): string {
  const pathname = requestUrl.split(/[?#]/, 1)[0];
  if (documentPath !== "/index.html" || (pathname !== "/lab" && !pathname.startsWith("/lab/"))) return html;
  if (!SELF_ONLY_SCRIPT_SRC.test(html)) throw new Error("index.html CSP에서 script-src 'self';를 찾지 못했습니다.");
  return html.replace(SELF_ONLY_SCRIPT_SRC, "script-src 'self' 'wasm-unsafe-eval';");
}
