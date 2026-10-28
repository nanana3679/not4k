import { afterEach, describe, expect, it, vi } from "vitest";
import generatedManifest from "./explicitSkinManifest.json";
import { buildExplicitSkinView, EXPLICIT_SKIN_ASSET_IDS, getExplicitSkinAsset } from "./explicitSkin";
import type { ExplicitSkinManifest } from "./explicitSkin";
import { AVAILABLE_SKINS, getSkinManifest } from "./skins";

const freshManifest = () => structuredClone(generatedManifest) as ExplicitSkinManifest;

describe("명시적 노트 정적 스킨 view", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("33개 역할을 조회하면 승인 도안과 같은 역할·좌우 파일을 반환한다", () => {
    const view = buildExplicitSkinView("/");
    const expected = {
      "tap.single.pending": "note-single.png",
      "tap.double.pending": "note-double-anodized-contrast-070.png",
      "tap.double.failed": "note-double-failed.png",
      "tap.trill.pending": "note-trill.png",
      "tap.trill.failed": "note-trill-failed.png",
      "body.single.idle": "body-single.png",
      "body.single.held": "body-single-held.png",
      "body.single.failed": "body-single-failed.png",
      "body.double.idle": "body-double-center-dual-beam.png",
      "body.double.held": "body-double-held.png",
      "body.double.failed": "body-double-failed.png",
      "body.trill.idle": "body-trill.png",
      "body.trill.held": "body-trill-held.png",
      "body.trill.failed": "body-trill-failed.png",
      "body.double.partialHeld.left": "body-double-partial-held-left.png",
      "body.double.partialHeld.right": "body-double-partial-held-right.png",
      "body.double.partialFailed.left": "body-double-partial-failed-left.png",
      "body.double.partialFailed.right": "body-double-partial-failed-right.png",
      "release.single.pending": "release-single.png",
      "release.single.failed": "release-single-failed.png",
      "release.double.pending": "release-double.png",
      "release.double.failed": "release-double-failed.png",
      "release.double.partialFailed.left": "release-double-partial-failed-left.png",
      "release.double.partialFailed.right": "release-double-partial-failed-right.png",
      "tick.single.pending": "sustain-single.png",
      "tick.single.failed": "sustain-single-failed.png",
      "tick.double.pending.left": "sustain-double-unit-left.png",
      "tick.double.pending.right": "sustain-double-unit-right.png",
      "tick.double.failed.left": "sustain-double-unit-left-failed.png",
      "tick.double.failed.right": "sustain-double-unit-right-failed.png",
      "graceOverlay.tap.overlay": "point-grace-overlay.png",
      "graceOverlay.trill.overlay": "trill-grace-overlay.png",
      "graceOverlay.release.overlay": "release-grace-overlay.png",
    };
    expect(Object.keys(view.assetsById).sort()).toEqual(Object.keys(expected).sort());
    expect(EXPLICIT_SKIN_ASSET_IDS).toHaveLength(33);
    for (const [id, file] of Object.entries(expected)) {
      const asset = getExplicitSkinAsset(view, id);
      expect(asset.file, id).toBe(file);
      expect(asset.url, id).toBe(`/skins/classic-explicit/${file}`);
      expect([asset.role, asset.variant, asset.state, asset.side].filter(Boolean).join(".")).toBe(id);
    }
  });

  it("/not4k/ 배포에서 1배·2배 URL을 만들면 접두사가 한 번만 붙는다", () => {
    vi.stubEnv("BASE_URL", "/not4k/");
    for (const asset of Object.values(buildExplicitSkinView().assetsById)) {
      expect(asset.url).toBe(`/not4k/skins/classic-explicit/${asset.file}`);
      if (asset.highResolution) expect(asset.highResolution.url).toBe(`/not4k/skins/classic-explicit/${asset.highResolution.file}`);
    }
  });

  it("탭 212×40과 body·release·tick 200×40을 중앙에 놓으면 폭을 섞지 않는다", () => {
    const view = buildExplicitSkinView("/");
    expect(getExplicitSkinAsset(view, "tap.double.pending").logicalSize).toEqual({ width: 212, height: 40 });
    for (const asset of Object.values(view.assetsById)) {
      expect(asset.anchor).toEqual({ x: 0.5, y: 0.5 });
      if (["body", "release", "tick"].includes(asset.role)) {
        expect(asset.logicalSize, asset.id).toEqual({ width: 200, height: 40 });
        expect(asset.contentRect, asset.id).toEqual({ x: 0, y: 0, width: 200, height: 40 });
      }
      if (asset.highResolution) expect(asset.highResolution.pixelSize).toEqual({ width: asset.logicalSize.width * 2, height: asset.logicalSize.height * 2 });
    }
    expect(view.body).toEqual({ mode: "repeat", axis: "y", tileSize: { width: 200, height: 40 }, laneReferenceWidth: 212, startCap: false, endCap: false });
  });

  it("Grace overlay를 조회하면 24px 패딩 안에 탭 212×40 또는 release·trill 200×40 본체를 정렬한다", () => {
    const view = buildExplicitSkinView("/");
    const tap = getExplicitSkinAsset(view, "graceOverlay.tap.overlay");
    expect(tap.logicalSize).toEqual({ width: 260, height: 88 });
    expect(tap.contentRect).toEqual({ x: 24, y: 24, width: 212, height: 40 });
    for (const variant of ["trill", "release"]) {
      const overlay = getExplicitSkinAsset(view, `graceOverlay.${variant}.overlay`);
      expect(overlay.logicalSize).toEqual({ width: 248, height: 88 });
      expect(overlay.contentRect).toEqual({ x: 24, y: 24, width: 200, height: 40 });
    }
    expect(Object.values(view.assetsById).some(asset => /(?:single|double).*grace\.png/.test(asset.file))).toBe(false);
  });

  it("더블 틱 한쪽을 조회해도 200×40 캔버스와 x=84·116 좌표·밝기 계약을 유지한다", () => {
    const view = buildExplicitSkinView("/");
    for (const [side, x] of [["left", 84], ["right", 116]] as const) {
      for (const state of ["pending", "failed"]) {
        const marker = getExplicitSkinAsset(view, `tick.double.${state}.${side}`);
        expect(marker.logicalSize).toEqual({ width: 200, height: 40 });
        expect(marker.markerCenter).toEqual({ x, y: 20 });
        expect(marker.sideMeaning).toBe("marker");
        expect(marker).not.toHaveProperty("alpha");
        expect(marker).not.toHaveProperty("visible");
      }
    }
    expect(getExplicitSkinAsset(view, "tick.single.pending").markerCenter).toEqual({ x: 100, y: 20 });
  });

  it("partialHeld.left는 왼쪽 미충족이고 partialFailed.right는 오른쪽 실패로 구별한다", () => {
    const view = buildExplicitSkinView("/");
    expect(getExplicitSkinAsset(view, "body.double.partialHeld.left")).toMatchObject({ role: "body", side: "left", sideMeaning: "unmet" });
    expect(getExplicitSkinAsset(view, "body.double.partialFailed.right")).toMatchObject({ role: "body", side: "right", sideMeaning: "failed" });
    expect(getExplicitSkinAsset(view, "release.double.partialFailed.right")).toMatchObject({ role: "release", side: "right", sideMeaning: "failed" });
  });

  it.each(["tap.single.failed", "tap.double.partialFailed.left", "release.trill.pending", "tick.double.pending", "graceOverlay.body.overlay", "terminal.single.idle", "toString"])(
    "%s 도안이 없을 때 조회하면 다른 역할로 fallback하지 않고 거부한다", id => {
      expect(() => getExplicitSkinAsset(buildExplicitSkinView("/"), id)).toThrow(`Unsupported explicit skin asset: ${id}`);
    },
  );

  it("필수 release.double.failed가 빠진 manifest로 view를 만들면 누락을 보고한다", () => {
    const manifest = freshManifest();
    manifest.assets = manifest.assets.filter(asset => asset.id !== "release.double.failed");
    expect(() => buildExplicitSkinView("/", manifest)).toThrow("Missing explicit skin asset: release.double.failed");
  });

  it("왼쪽 실패 ID에 오른쪽 side를 넣으면 역할·방향 불일치로 거부한다", () => {
    const manifest = freshManifest();
    manifest.assets.find(asset => asset.id === "release.double.partialFailed.left")!.side = "right";
    expect(() => buildExplicitSkinView("/", manifest)).toThrow("Explicit skin role/side mismatch");
  });

  it("double tick 왼쪽 도안을 100×40으로 자르면 캔버스 계약 위반으로 거부한다", () => {
    const manifest = freshManifest();
    manifest.assets.find(asset => asset.id === "tick.double.pending.left")!.logicalSize.width = 100;
    expect(() => buildExplicitSkinView("/", manifest)).toThrow("Invalid explicit skin geometry");
  });

  it("명시적 view를 만들어도 선택 가능한 classic과 기존 legacy60 manifest 경로를 보존한다", () => {
    buildExplicitSkinView("/");
    expect(AVAILABLE_SKINS.map(skin => skin.theme.id)).toEqual(["classic"]);
    expect(getSkinManifest("classic").assets.noteDouble).toBe("/skins/classic/note-double.png");
    expect(getSkinManifest("classic").assets.terminalSingle).toBe("/skins/classic/terminal-single.png");
  });
});
