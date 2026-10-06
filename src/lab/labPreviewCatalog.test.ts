import { describe, expect, it } from "vitest";
import { labPreviewCatalog } from "./labPreviewCatalog";

describe("Lab 미리보기 카탈로그", () => {
  it("옛 기어 Gear Light·Gear Measure Pulse를 뺀 6개 미리보기(시설 통과·노트 에셋 시연실·Gear 포함)는 중복 없는 id와 /lab 경로를 가진다", () => {
    expect(labPreviewCatalog).toHaveLength(6);
    expect(labPreviewCatalog.map((preview) => preview.id)).toEqual([
      "flight-background-preview",
      "facility-passage",
      "note-assets",
      "gear",
      "tutorial-pattern-diagram",
      "judgment-playtest",
    ]);
    expect(new Set(labPreviewCatalog.map((preview) => preview.id)).size).toBe(6);
    expect(new Set(labPreviewCatalog.map((preview) => preview.path)).size).toBe(6);
    expect(labPreviewCatalog.every((preview) => preview.path.startsWith("/lab/"))).toBe(true);
  });

  it("노트 에셋 시연실은 Rendering 분류의 /lab/note-assets 경로로 등록된다", () => {
    expect(labPreviewCatalog.find((preview) => preview.id === "note-assets")).toMatchObject({
      title: "노트 에셋 시연실",
      category: "Rendering",
      path: "/lab/note-assets",
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
