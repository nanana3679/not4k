import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildExplicitSkinArtifacts, verifyExplicitSkinArtifacts } from "./build-explicit-skin.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

describe("명시적 스킨의 결정적 PNG export", () => {
  it("같은 보관 원본으로 2번 export하면 33개 역할·55개 PNG·두 manifest가 커밋 대상 바이트와 일치한다", () => {
    const first = buildExplicitSkinArtifacts(root);
    const second = buildExplicitSkinArtifacts(root);
    expect(first.verifiedArchiveFiles).toBe(132);
    expect(first.verifiedApprovedAssets).toBe(126);
    expect(first.manifest.assets).toHaveLength(33);
    expect(first.files.size).toBe(57);
    expect([...first.files.keys()]).toEqual([...second.files.keys()]);
    for (const [path, bytes] of first.files) {
      expect(bytes.equals(second.files.get(path)!), path).toBe(true);
      expect(bytes.equals(readFileSync(new URL(path, new URL("../", import.meta.url)))), path).toBe(true);
    }
    expect(() => verifyExplicitSkinArtifacts(root, first.files)).not.toThrow();
    expect(first.files.get("public/skins/classic-explicit/manifest.json")!.equals(first.files.get("src/game/skin/explicitSkinManifest.json")!)).toBe(true);
  });

  it("선택한 모든 PNG를 내보내면 원본과 같은 바이트·SHA-256·해상도를 기록하고 참고 합성본을 제외한다", () => {
    const { files, manifest } = buildExplicitSkinArtifacts(root);
    for (const asset of manifest.assets) {
      for (const image of [asset, ...(asset.highResolution ? [asset.highResolution] : [])]) {
        const bytes = files.get(`public/skins/classic-explicit/${image.file}`)!;
        expect(bytes.equals(readFileSync(new URL(image.source, new URL("../", import.meta.url)))), asset.id).toBe(true);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
        expect(bytes.length).toBe(image.bytes);
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([asset.logicalSize.width * image.resolution, asset.logicalSize.height * image.resolution]);
      }
    }
    expect([...files.keys()].some(path => /terminal|unit-mask|(?:single|double).*grace\.png/.test(path))).toBe(false);
  });

  it("트릴 PNG 5개는 기존 v014 기록 SHA와 일치하고 릴리즈는 승인 묶음의 전용 도안을 쓴다", () => {
    const { manifest } = buildExplicitSkinArtifacts(root);
    const historical = manifest.assets.filter(asset => asset.sourceApproval === "historical-runtime-v014");
    expect(historical).toHaveLength(5);
    for (const asset of historical) expect(asset.source).toBe(`assets-lab/classic/versions/v014/files/public/skins/classic/${asset.file}`);
    expect(manifest.assets.find(asset => asset.id === "release.single.pending")?.source).toContain("approved-notes-20261025/assets/release-single.png");
  });
});
