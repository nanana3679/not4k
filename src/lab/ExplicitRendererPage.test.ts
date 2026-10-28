import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ExplicitRendererPage from "./ExplicitRendererPage";
import { labPreviewCatalog } from "./labPreviewCatalog";
import { advanceExplicitPreviewSession, createExplicitPreviewSession, explicitPreviewChart, explicitPreviewSnapshot } from "./explicitRendererPreview";
import pageSource from "./ExplicitRendererPage.tsx?raw";

describe("명시 노트 표시 Lab", () => {
  it("CSP가 unsafe-eval을 막는 Lab에서도 Pixi 호환 모듈을 startPixiPreview의 beforeInit으로 불러와 init 단계의 app.init보다 먼저 끝낸다", () => {
    const compatibility = pageSource.indexOf('beforeInit: () => import("pixi.js/unsafe-eval")');
    expect(compatibility).toBeGreaterThanOrEqual(0);
    expect(pageSource.indexOf("await app.init")).toBeGreaterThan(pageSource.indexOf("init: async () =>"));
    expect(pageSource).not.toMatch(/app\.destroy\(/);
  });
  it("/lab/explicit-renderer는 카탈로그의 Gameplay 항목이고 화면에 fixture·실제 M1 세션 구별과 Lab 복귀 링크를 제공한다", () => {
    expect(labPreviewCatalog.find(entry => entry.id === "explicit-renderer")).toMatchObject({ path: "/lab/explicit-renderer", category: "Gameplay" });
    const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ExplicitRendererPage)));
    for (const content of ['data-lab-page="explicit-renderer"', 'href="/lab"', "공개 상태 fixture", "실제 M1 세션", "실행 결과가 아닙니다", "렌더러 재부착", "이미지 해상도", "처음으로"]) expect(html).toContain(content);
  });

  it("혼합 fixture는 double·single·trill 배치를 컴파일하고 sustain 오른쪽만 종속 0점이며 trill release는 만들지 않는다", () => {
    const snapshot = explicitPreviewSnapshot("mixed", 1500);
    expect(snapshot.bodyUnits.map(unit => unit.state)).toEqual(["complete", "failed", "complete", "complete"]);
    expect(snapshot.items.filter(item => item.kind === "sustain" && item.sourceNoteIndex === 1).map(item => item.state)).toEqual(["success", "dependentZero"]);
    expect(explicitPreviewChart.bodies.some(body => body.trill)).toBe(true);
    expect(explicitPreviewChart.scoreItems.some(item => item.lane === 3 && item.kind === "release")).toBe(false);
  });

  it("실제 ENJ-05를 1500→1505ms로 진행하면 대기 유지가 Perfect로 확정되고 두 번 drain해도 효과는 1개다", () => {
    const session = createExplicitPreviewSession();
    let batch = advanceExplicitPreviewSession(session, 1500, 0);
    expect(session.snapshot.items[0].state).toBe("waiting");
    expect(session.drainEffects()).toEqual([]);
    batch = advanceExplicitPreviewSession(session, 1505, batch);
    expect(session.snapshot.items[0].state).toBe("success");
    expect(session.drainEffects()).toMatchObject([{ displayGrade: "perfect", lane: 1, hitGrade: "perfect" }]);
    advanceExplicitPreviewSession(session, 1505, batch);
    expect(session.drainEffects()).toEqual([]);
  });
});
