import { describe, expect, it } from "vitest";
import { labImageGalleryCatalog } from "./labImageGalleryCatalog";

describe("Lab 이미지 갤러리 카탈로그", () => {
  it("기존 비교 보드 2개는 중복 없는 id와 /lab/images 경로로 등록된다", () => {
    expect(labImageGalleryCatalog.map((gallery) => gallery.id)).toEqual([
      "module-size-distance-20260910",
      "size-distance-altitude-eight-20260910",
    ]);
    expect(labImageGalleryCatalog.map((gallery) => gallery.path)).toEqual([
      "/lab/images/module-size-distance-20260910",
      "/lab/images/size-distance-altitude-eight-20260910",
    ]);
    expect(new Set(labImageGalleryCatalog.map((gallery) => gallery.id)).size).toBe(2);
    expect(new Set(labImageGalleryCatalog.map((gallery) => gallery.path)).size).toBe(2);
  });
});
