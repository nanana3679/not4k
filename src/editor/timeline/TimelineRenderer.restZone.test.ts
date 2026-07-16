// TimelineRenderer는 실제 canvas/WebGL 초기화가 필요해 node 테스트에서 인스턴스화할 수 없다.
// unsafeEval 테스트와 같은 방식으로 소스 수준에서 restZone 배선(RFD 0019 스텝4)을 검증한다.
import { describe, expect, it } from "vitest";
import timelineRendererSource from "./TimelineRenderer.ts?raw";

describe("TimelineRenderer restZone 배선 (소스 수준)", () => {
  it("restZoneLayer는 trillZoneLayer·noteLayer보다 먼저 stage에 addChild돼 밴드가 트릴존·노트 아래 z-order다", () => {
    const rest = timelineRendererSource.indexOf("this.app.stage.addChild(this.restZoneLayer)");
    const trill = timelineRendererSource.indexOf("this.app.stage.addChild(this.trillZoneLayer)");
    const note = timelineRendererSource.indexOf("this.app.stage.addChild(this.noteLayer)");

    expect(rest).toBeGreaterThanOrEqual(0);
    expect(trill).toBeGreaterThan(rest);
    expect(note).toBeGreaterThan(rest);
  });

  it("setViolations는 note·trillZone·restZone·event 4축 시그니처로 restZone 인덱스를 저장한다", () => {
    expect(timelineRendererSource).toContain(
      "setViolations(noteIndices: Set<number>, trillZoneIndices: Set<number>, restZoneIndices: Set<number>, eventIndices: Set<number>)",
    );
    expect(timelineRendererSource).toContain("this._violatingRestZoneIndices = restZoneIndices");
  });

  it("render()가 renderRestZones를 호출하고 clearDynamicLayers가 restZoneLayer를 destroy한다", () => {
    expect(timelineRendererSource).toContain("this.gridRenderer.renderRestZones()");
    expect(timelineRendererSource).toContain("destroyChildren(this.restZoneLayer)");
  });

  it("restZoneLayer는 스크롤 콘텐츠 레이어 목록에 포함돼 scrollY·마스크를 따라간다", () => {
    const listStart = timelineRendererSource.indexOf("getScrollableContentLayers()");
    expect(listStart).toBeGreaterThanOrEqual(0);
    const listEnd = timelineRendererSource.indexOf("];", listStart);
    const listBody = timelineRendererSource.slice(listStart, listEnd);
    expect(listBody).toContain("this.restZoneLayer,");
  });

  it("OverlayRenderer host에 violatingRestZoneIndices getter가 노출된다", () => {
    expect(timelineRendererSource).toContain(
      "get violatingRestZoneIndices() { return self._violatingRestZoneIndices; }",
    );
  });

  it("GridRenderer host에 restZoneLayer getter가 노출된다", () => {
    expect(timelineRendererSource).toContain(
      "get restZoneLayer() { return self.restZoneLayer; }",
    );
  });
});
