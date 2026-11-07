import { describe, expect, it } from "vitest";
import { labPreviewCatalog } from "./labPreviewCatalog";

describe("Lab 미리보기 카탈로그", () => {
  it("옛 기어 Gear Light·Gear Measure Pulse를 뺀 10개 미리보기(명시 노트 표시·restZone Lane·시설 통과·노트 에셋 시연실·Gear·옵저버 감속 청음 비교 포함)는 중복 없는 id와 /lab 경로를 가진다", () => {
    expect(labPreviewCatalog).toHaveLength(10);
    expect(labPreviewCatalog.map((preview) => preview.id)).toEqual([
      "flight-background-preview",
      "facility-passage",
      "note-assets",
      "explicit-renderer",
      "explicit-playtest",
      "rest-zone-lane",
      "gear",
      "tutorial-pattern-diagram",
      "judgment-playtest",
      "observer-slowdown",
    ]);
    expect(new Set(labPreviewCatalog.map((preview) => preview.id)).size).toBe(10);
    expect(new Set(labPreviewCatalog.map((preview) => preview.path)).size).toBe(10);
    expect(labPreviewCatalog.every((preview) => preview.path.startsWith("/lab/"))).toBe(true);
  });

  it("노트 에셋 시연실은 Rendering 분류의 /lab/note-assets 경로로 등록된다", () => {
    expect(labPreviewCatalog.find((preview) => preview.id === "note-assets")).toMatchObject({
      title: "노트 에셋 시연실",
      category: "Rendering",
      path: "/lab/note-assets",
    });
  });

  it("restZone Lane은 Rendering 분류의 /lab/rest-zone-lane 경로로 등록된다", () => {
    expect(labPreviewCatalog.find((preview) => preview.id === "rest-zone-lane")).toEqual({
      id: "rest-zone-lane",
      title: "restZone Lane",
      description: "restZone 동안 레인 판넬이 뒤로 넘어갔다 차트의 추정 녹숫에 맞춰 올라오는 연출과 넘어가 있는 동안의 빗금 판넬을 재생하고, 스크롤 속도·리프트·서든에 따라 다음 노트가 보이는 시점을 비교합니다.",
      category: "Rendering",
      path: "/lab/rest-zone-lane",
    });
  });

  it("옵저버 감속 청음 비교는 Gameplay 분류의 /lab/observer-slowdown 경로로 등록된다", () => {
    expect(labPreviewCatalog.find((preview) => preview.id === "observer-slowdown")).toMatchObject({
      title: "옵저버 감속 청음 비교",
      category: "Gameplay",
      path: "/lab/observer-slowdown",
    });
  });

  it("Gear는 Interface 분류의 /lab/gear 경로로 등록된다", () => {
    expect(labPreviewCatalog.find((preview) => preview.id === "gear")).toMatchObject({
      title: "Gear",
      category: "Interface",
      path: "/lab/gear",
    });
  });

  it("Flight Background Preview는 Flight 분류의 대표 미리보기로 등록된다", () => {
    expect(labPreviewCatalog.find((preview) => preview.id === "flight-background-preview")).toEqual({
      id: "flight-background-preview",
      title: "Flight Background Preview",
      description: "Liftoff, Infiltration, Breakthrough의 배경과 고도를 한 화면에서 비교합니다.",
      category: "Flight",
      path: "/lab/flight-background-preview",
      featured: true,
    });
  });
});
