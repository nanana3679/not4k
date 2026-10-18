// TimelineRenderer는 실제 canvas/WebGL 초기화가 필요해 node 테스트에서 인스턴스화할 수 없다.
// TimelineRenderer.restZone.test.ts와 같은 방식으로 소스 수준에서 이동 원위치 고스트(#94) 배선을 검증한다.
import { describe, expect, it } from "vitest";
import timelineRendererSource from "./TimelineRenderer.ts?raw";

/** `  name(...): void {`로 시작하는 메서드의 본문(다음 2칸 들여쓴 `}`까지)을 잘라낸다. */
function methodBody(signatureStart: string): string {
  const start = timelineRendererSource.indexOf(`  ${signatureStart}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = timelineRendererSource.indexOf("\n  }\n", start);
  expect(end).toBeGreaterThan(start);
  return timelineRendererSource.slice(start, end);
}

describe("TimelineRenderer 이동 원위치 고스트 배선 (소스 수준, #94)", () => {
  it("clearMoveOrigins는 노트·trillZone·restZone 원위치를 함께 null로 지워 드롭·취소 경로가 새 배선 없이 구간 고스트도 지운다", () => {
    const body = methodBody("clearMoveOrigins(): void {");
    expect(body).toContain("this._moveOrigins = null;");
    expect(body).toContain("this._trillZoneMoveOrigins = null;");
    expect(body).toContain("this._restZoneMoveOrigins = null;");
  });

  it("clearMoveOrigins는 원위치를 지운 뒤 overlayRenderer.clearMoveOrigins()로 이미 그린 고스트도 바로 지운다(드롭은 같은 차트를 커밋해 전체 렌더가 따라오지 않는다)", () => {
    const body = methodBody("clearMoveOrigins(): void {");
    const nulled = body.indexOf("this._restZoneMoveOrigins = null;");
    const cleared = body.indexOf("this.overlayRenderer.clearMoveOrigins();");
    expect(nulled).toBeGreaterThanOrEqual(0);
    expect(cleared).toBeGreaterThan(nulled);
  });

  it("setTrillZoneMoveOrigins·setRestZoneMoveOrigins는 구간 원위치를 저장한다", () => {
    expect(methodBody("setTrillZoneMoveOrigins(")).toContain("this._trillZoneMoveOrigins = origins;");
    expect(methodBody("setRestZoneMoveOrigins(")).toContain("this._restZoneMoveOrigins = origins;");
  });

  it("OverlayRenderer host에 trillZoneMoveOrigins·restZoneMoveOrigins getter가 배선된다", () => {
    expect(timelineRendererSource).toContain(
      "get trillZoneMoveOrigins() { return self._trillZoneMoveOrigins; }",
    );
    expect(timelineRendererSource).toContain(
      "get restZoneMoveOrigins() { return self._restZoneMoveOrigins; }",
    );
  });
});
