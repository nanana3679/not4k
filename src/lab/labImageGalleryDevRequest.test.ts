import { describe, expect, it } from "vitest";
import { mapLabImageGalleryDevRequest } from "./labImageGalleryDevRequest";

const galleryIds = new Set(["registered-gallery"]);

describe("mapLabImageGalleryDevRequest", () => {
  it("registered-gallery의 루트와 이미지 요청은 원본 번들 경로로 재작성한다", () => {
    expect(mapLabImageGalleryDevRequest("/lab/images/registered-gallery/", galleryIds)).toEqual({
      kind: "rewrite",
      url: "/lab/image-galleries/registered-gallery/index.html",
    });
    expect(mapLabImageGalleryDevRequest("/lab/images/registered-gallery/image.png?v=1", galleryIds)).toEqual({
      kind: "rewrite",
      url: "/lab/image-galleries/registered-gallery/image.png?v=1",
    });
  });

  it("unregistered-gallery는 통과시키고 ../ 및 %2e%2e traversal은 거부한다", () => {
    expect(mapLabImageGalleryDevRequest("/lab/images/unregistered-gallery/", galleryIds)).toEqual({ kind: "pass" });
    expect(mapLabImageGalleryDevRequest("/lab/images/registered-gallery/../../../package.json", galleryIds)).toEqual({
      kind: "reject",
    });
    expect(mapLabImageGalleryDevRequest("/lab/images/registered-gallery/%2e%2e/package.json", galleryIds)).toEqual({
      kind: "reject",
    });
  });
});
