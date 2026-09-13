import { describe, expect, it } from "vitest";
import { labPreviewCatalog } from "./labPreviewCatalog";

describe("Lab 미리보기 카탈로그", () => {
  it("7개 미리보기는 중복 없는 id와 /lab 경로를 가진다", () => {
    expect(labPreviewCatalog).toHaveLength(7);
    expect(labPreviewCatalog.map((preview) => preview.id)).toEqual([
      "flight-background-preview",
      "geometric-background",
      "perspective-surface-grid",
      "gear-light",
      "gear-measure-pulse",
      "tutorial-pattern-diagram",
      "judgment-playtest",
    ]);
    expect(new Set(labPreviewCatalog.map((preview) => preview.id)).size).toBe(7);
    expect(new Set(labPreviewCatalog.map((preview) => preview.path)).size).toBe(7);
    expect(labPreviewCatalog.every((preview) => preview.path.startsWith("/lab/"))).toBe(true);
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
