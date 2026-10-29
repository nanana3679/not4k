import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildExplicitSkinArtifacts, verifyExplicitSkinArtifacts } from "./build-explicit-skin.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const selectedDirectory = "assets-lab/classic/revisions/selected-notes-20261026";
const approvedDirectory = "assets-lab/classic/revisions/approved-notes-20261025";
const provenancePath = "assets-lab/classic/explicit/provenance.json";

interface FileRecord { path: string }
interface ProvenanceFixture {
  selected: { manifest: FileRecord; files: FileRecord[] };
  approved: { manifest: FileRecord; files: FileRecord[] };
  historical: { manifest: FileRecord; files: FileRecord[] };
}

/** 빌더가 읽는 원본만 임시 저장소로 복사한다. 실제 보관본은 건드리지 않는다. */
const temporaryRoots: string[] = [];
function copySourcesToTemporaryRoot(): { temporaryRoot: string; provenance: ProvenanceFixture } {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "explicit-skin-"));
  temporaryRoots.push(temporaryRoot);
  const provenance = JSON.parse(readFileSync(join(root, provenancePath), "utf8")) as ProvenanceFixture;
  const paths = [provenancePath, "assets-lab/classic/explicit/roles.json",
    ...[provenance.selected, provenance.approved, provenance.historical].flatMap(source => [source.manifest, ...source.files].map(record => record.path))];
  for (const path of paths) cpSync(join(root, path), join(temporaryRoot, path));
  return { temporaryRoot, provenance };
}

describe("명시적 스킨의 결정적 PNG export", () => {
  afterEach(() => {
    for (const path of temporaryRoots.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  it("같은 고정 원본으로 2번 export하면 33개 역할·60개 PNG·두 manifest가 커밋 대상 바이트와 일치한다", () => {
    const first = buildExplicitSkinArtifacts(root);
    const second = buildExplicitSkinArtifacts(root);
    expect(first.verifiedSourceFiles).toBe(60);
    expect(first.manifest.assets).toHaveLength(33);
    expect(first.files.size).toBe(62);
    expect([...first.files.keys()]).toEqual([...second.files.keys()]);
    for (const [path, bytes] of first.files) {
      expect(bytes.equals(second.files.get(path)!), path).toBe(true);
      expect(bytes.equals(readFileSync(new URL(path, new URL("../", import.meta.url)))), path).toBe(true);
    }
    expect(() => verifyExplicitSkinArtifacts(root, first.files)).not.toThrow();
    expect(first.files.get("public/skins/classic-explicit/manifest.json")!.equals(first.files.get("src/game/skin/explicitSkinManifest.json")!)).toBe(true);
  });

  it("선택한 모든 PNG를 새 이름으로 내보내면 원본과 같은 바이트·SHA-256·해상도를 기록하고 합성 참고본·terminal을 원본으로 쓰지 않는다", () => {
    const { files, manifest } = buildExplicitSkinArtifacts(root);
    for (const asset of manifest.assets) {
      for (const image of [asset, ...(asset.highResolution ? [asset.highResolution] : [])]) {
        const bytes = files.get(`public/skins/classic-explicit/${image.file}`)!;
        expect(bytes.equals(readFileSync(new URL(image.source, new URL("../", import.meta.url)))), asset.id).toBe(true);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.sha256);
        expect(bytes.length).toBe(image.bytes);
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([asset.logicalSize.width * image.resolution, asset.logicalSize.height * image.resolution]);
      }
      expect(asset.source, asset.id).not.toMatch(/terminal|unit-mask|-grace\.png$/);
    }
  });

  it("트릴 탭·바디 5개는 v014 기록, 트릴 Grace overlay는 #339 보관본, 나머지 27개 역할은 #348 선택 도안에서 읽고 트릴 릴리즈는 없다", () => {
    const { manifest } = buildExplicitSkinArtifacts(root);
    const historical = manifest.assets.filter(asset => asset.sourceApproval === "historical-runtime-v014");
    expect(historical.map(asset => asset.id).sort()).toEqual(["body.trill.failed", "body.trill.held", "body.trill.idle", "tap.trill.failed", "tap.trill.pending"]);
    for (const asset of historical) expect(asset.source).toMatch(/^assets-lab\/classic\/versions\/v014\/files\/public\/skins\/classic\/(?:note|body)-trill/);
    expect(manifest.assets.find(asset => asset.id === "graceOverlay.trill.overlay")?.source).toBe(`${approvedDirectory}/assets/trill-grace-overlay.png`);
    const selected = manifest.assets.filter(asset => asset.variant !== "trill");
    expect(selected).toHaveLength(27);
    for (const asset of selected) {
      expect(asset.source, asset.id).toMatch(new RegExp(`^${selectedDirectory}/assets/`));
      expect(asset.highResolution?.source, asset.id).toBe(asset.source.replace(/\.png$/, "@2x.png"));
    }
    expect(manifest.assets.some(asset => asset.role === "release" && asset.variant === "trill")).toBe(false);
    expect(manifest.provenance.selected).toMatchObject({ sourceCommit: "86285403b14e8314aebb80bcaaff908a521f3613", sourcePullRequest: 348 });
  });

  it("#348 selectedStatePreview의 상태 파일을 대응하는 역할 원본으로 쓴다", () => {
    const { manifest } = buildExplicitSkinArtifacts(root);
    const preview = (JSON.parse(readFileSync(join(root, selectedDirectory, "manifest.json"), "utf8")) as {
      selectedStatePreview: {
        groups: { id: string; states: { id: string; file: string; alpha: number }[] }[];
        layers: { id: string; states: { id: string; file: string }[] }[];
        graceOverlays: { point: string; release: string };
      };
    }).selectedStatePreview;
    const stateFile = (group: string, state: string) => [...preview.groups, ...preview.layers]
      .find(candidate => candidate.id === group)!.states.find(candidate => candidate.id === state)!.file;
    const expected: Record<string, string> = {
      "tap.single.pending": stateFile("point-single", "pending"),
      "tap.double.pending": stateFile("point-double", "pending"),
      "tap.double.failed": stateFile("point-double", "failed"),
      "release.single.pending": stateFile("release-single", "pending"),
      "release.single.failed": stateFile("release-single", "failed"),
      "release.double.pending": stateFile("release-double", "pending"),
      "release.double.failed": stateFile("release-double", "failed"),
      "release.double.partialFailed.left": stateFile("release-double", "partial-failed-left"),
      "release.double.partialFailed.right": stateFile("release-double", "partial-failed-right"),
      "tick.single.pending": stateFile("sustain-single", "pending"),
      "tick.single.failed": stateFile("sustain-single", "failed"),
      "tick.double.pending.left": stateFile("sustain-layers", "unit-left"),
      "tick.double.pending.right": stateFile("sustain-layers", "unit-right"),
      "tick.double.failed.left": stateFile("sustain-layers", "unit-left-failed"),
      "tick.double.failed.right": stateFile("sustain-layers", "unit-right-failed"),
      "graceOverlay.tap.overlay": preview.graceOverlays.point,
      "graceOverlay.release.overlay": preview.graceOverlays.release,
    };
    for (const variant of ["single", "double"]) {
      for (const state of ["idle", "held", "failed"]) expected[`body.${variant}.${state}`] = stateFile(`body-${variant}`, state);
    }
    for (const side of ["left", "right"]) {
      expected[`body.double.partialHeld.${side}`] = stateFile("body-double", `partial-held-${side}`);
      expected[`body.double.partialFailed.${side}`] = stateFile("body-double", `partial-failed-${side}`);
    }
    expect(Object.keys(expected)).toHaveLength(27);
    for (const [id, file] of Object.entries(expected)) {
      expect(manifest.assets.find(asset => asset.id === id)?.source, id).toBe(`${selectedDirectory}/${file}`);
    }
  });

  it("고정 기록에서 @2x 원본 하나를 빼면 미기록 원본으로 export를 거부한다", () => {
    const { temporaryRoot, provenance } = copySourcesToTemporaryRoot();
    const removed = `${selectedDirectory}/assets/note-single-palette-mix-050@2x.png`;
    provenance.selected.files = provenance.selected.files.filter(record => record.path !== removed);
    writeFileSync(join(temporaryRoot, provenancePath), JSON.stringify(provenance));
    expect(() => buildExplicitSkinArtifacts(temporaryRoot)).toThrow(`Unrecorded explicit source: ${removed}`);
  });

  it("고정한 #348 원본 PNG가 1바이트라도 바뀌면 SHA 불일치로 export를 거부한다", () => {
    const { temporaryRoot } = copySourcesToTemporaryRoot();
    const changed = `${selectedDirectory}/assets/selected-sustain-double-unit-left.png`;
    const bytes = readFileSync(join(temporaryRoot, changed));
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(join(temporaryRoot, changed), bytes);
    expect(() => buildExplicitSkinArtifacts(temporaryRoot)).toThrow(`Source hash mismatch: ${changed}`);
  });
});
