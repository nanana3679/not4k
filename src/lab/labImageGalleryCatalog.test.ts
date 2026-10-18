import { describe, expect, it } from "vitest";
import { labImageGalleryCatalog } from "./labImageGalleryCatalog";

describe("Lab 이미지 갤러리 카탈로그", () => {
  it("추진부·전체 프레임 비교를 포함한 6개 갤러리는 중복 없는 id와 /lab/images 경로로 등록된다", () => {
    expect(labImageGalleryCatalog.map((gallery) => gallery.id)).toEqual([
      "module-size-distance-20260910",
      "size-distance-altitude-eight-20260910",
      "point-derived-body-20260929",
      "long-note-body-six-20260929",
      "thrust-button-study-20260929",
      "frame-keywords-six-20260929",
    ]);
    expect(labImageGalleryCatalog.map((gallery) => gallery.path)).toEqual([
      "/lab/images/module-size-distance-20260910",
      "/lab/images/size-distance-altitude-eight-20260910",
      "/lab/images/point-derived-body-20260929",
      "/lab/images/long-note-body-six-20260929",
      "/lab/images/thrust-button-study-20260929",
      "/lab/images/frame-keywords-six-20260929",
    ]);
    expect(new Set(labImageGalleryCatalog.map((gallery) => gallery.id)).size).toBe(6);
    expect(new Set(labImageGalleryCatalog.map((gallery) => gallery.path)).size).toBe(6);
  });
});
