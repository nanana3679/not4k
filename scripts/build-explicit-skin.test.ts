import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildExplicitSkinArtifacts, deriveExplicitSkinSources, EXPLICIT_SKIN_REVISIONS, explicitSkinOutputName,
  exportExplicitSkinArtifacts, readExplicitSkinGitObject, verifyExplicitSkinArtifacts,
} from "./build-explicit-skin.ts";
import type { ExplicitSkinProvenance } from "./build-explicit-skin.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const { selected, approved } = EXPLICIT_SKIN_REVISIONS;
const snapshotDirectory = "assets-lab/classic/explicit/sources/selected-notes-20261026";
const provenancePath = "assets-lab/classic/explicit/provenance.json";
const rolesPath = "assets-lab/classic/explicit/roles.json";
const readProvenance = () => JSON.parse(readFileSync(join(root, provenancePath), "utf8")) as ExplicitSkinProvenance;
/** 얕은 clone처럼 고정 커밋이 없으면 Git 대조 테스트만 건너뛴다. */
const pinnedCommitsAvailable = [selected, approved].every(revision =>
  readExplicitSkinGitObject(root, revision.sourceCommit, `${revision.originDirectory}/manifest.json`) !== null);

/** 빌더가 읽는 원본과 현재 런타임 출력만 임시 저장소로 복사한다. 실제 보관본·사본은 건드리지 않는다. */
const temporaryRoots: string[] = [];
function copySourcesToTemporaryRoot(): { temporaryRoot: string; provenance: ExplicitSkinProvenance } {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "explicit-skin-"));
  temporaryRoots.push(temporaryRoot);
  const provenance = readProvenance();
  const paths = [provenancePath, rolesPath,
    ...[provenance.selected, provenance.approved].flatMap(revision => revision.files.map(record => `${revision.directory}/${record.file}`)),
    ...[provenance.historical.manifest, ...provenance.historical.files].map(record => record.path)];
  for (const path of paths) cpSync(join(root, path), join(temporaryRoot, path));
  for (const output of ["public/skins/classic-explicit", "src/game/skin/explicitSkinManifest.json"]) {
    cpSync(join(root, output), join(temporaryRoot, output), { recursive: true });
  }
  return { temporaryRoot, provenance };
}

describe("명시적 스킨의 결정적 PNG export", () => {
  afterEach(() => {
    for (const path of temporaryRoots.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  it("같은 고정 원본으로 2번 export하면 34개 역할·62개 PNG·두 manifest가 커밋 대상 바이트와 일치한다", () => {
    const first = buildExplicitSkinArtifacts(root);
    const second = buildExplicitSkinArtifacts(root);
    expect(first.verifiedSourceFiles).toBe(62);
    expect(first.manifest.assets).toHaveLength(34);
    expect(first.files.size).toBe(64);
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

  it("트릴 탭·바디 5개는 v014 기록, 트릴 Grace overlay는 #339 보관본, 나머지 28개 역할은 #348 고정 사본에서 읽고 트릴 릴리즈는 없다", () => {
    const { manifest } = buildExplicitSkinArtifacts(root);
    const historical = manifest.assets.filter(asset => asset.sourceApproval === "historical-runtime-v014");
    expect(historical.map(asset => asset.id).sort()).toEqual(["body.trill.failed", "body.trill.held", "body.trill.idle", "tap.trill.failed", "tap.trill.pending"]);
    for (const asset of historical) expect(asset.source).toMatch(/^assets-lab\/classic\/versions\/v014\/files\/public\/skins\/classic\/(?:note|body)-trill/);
    expect(manifest.assets.find(asset => asset.id === "graceOverlay.trill.overlay")?.source).toBe(`${approved.directory}/assets/trill-grace-overlay.png`);
    const selectedAssets = manifest.assets.filter(asset => asset.variant !== "trill");
    expect(selectedAssets).toHaveLength(28);
    for (const asset of selectedAssets) {
      expect(asset.source, asset.id).toMatch(new RegExp(`^${snapshotDirectory}/assets/`));
      expect(asset.highResolution?.source, asset.id).toBe(asset.source.replace(/\.png$/, "@2x.png"));
    }
    expect(manifest.assets.some(asset => asset.role === "release" && asset.variant === "trill")).toBe(false);
    expect(manifest.provenance.selected).toEqual({ sourceCommit: "86285403b14e8314aebb80bcaaff908a521f3613", sourcePullRequest: 348 });
  });

  it("고정 사본 폴더의 파일 56개는 provenance가 고정한 파일과 같고 #348 작업 폴더의 파일을 원본으로 읽지 않는다", () => {
    const provenance = readProvenance();
    const snapshot = readdirSync(join(root, snapshotDirectory), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile()).map(entry => `assets/${entry.name}`).sort();
    expect(snapshot).toEqual(provenance.selected.files.map(record => record.file));
    expect(snapshot).toHaveLength(56);
    const roles = JSON.parse(readFileSync(join(root, rolesPath), "utf8")) as { source: string }[];
    expect(roles.some(role => role.source.startsWith(`${selected.originDirectory}/`))).toBe(false);
  });

  it.each([
    ["tap.single.pending", "tap-single.png"], ["tap.double.failed", "tap-double-failed.png"],
    ["body.single.idle", "body-single.png"], ["body.double.partialHeld.left", "body-double-partial-held-left.png"],
    ["release.double.partialFailed.right", "release-double-partial-failed-right.png"],
    ["tick.double.pending.left", "tick-double-left.png"], ["tick.double.failed.right", "tick-double-failed-right.png"],
    ["graceOverlay.tap.overlay", "tap-grace-overlay.png"],
  ])("역할 %s의 런타임 파일 이름은 %s다 - pending·idle 생략, 상태 kebab-case, Grace는 변형-grace-overlay", (id, file) => {
    expect(explicitSkinOutputName(id)).toBe(file);
  });

  it("roles.json의 output이 역할 ID 규칙과 다르면 export를 거부한다", () => {
    const { temporaryRoot } = copySourcesToTemporaryRoot();
    const roles = JSON.parse(readFileSync(join(temporaryRoot, rolesPath), "utf8")) as { id: string; output: string }[];
    roles.find(role => role.id === "tick.single.pending")!.output = "sustain-single.png";
    writeFileSync(join(temporaryRoot, rolesPath), JSON.stringify(roles));
    expect(() => buildExplicitSkinArtifacts(temporaryRoot)).toThrow("Explicit skin output must be tick-single.png: tick.single.pending");
  });

  it("고정 기록에서 @2x 원본 하나를 빼면 사본 폴더의 미기록 원본으로 export를 거부한다", () => {
    const { temporaryRoot, provenance } = copySourcesToTemporaryRoot();
    const removed = "assets/note-single-palette-mix-050@2x.png";
    provenance.selected.files = provenance.selected.files.filter(record => record.file !== removed);
    writeFileSync(join(temporaryRoot, provenancePath), JSON.stringify(provenance));
    expect(() => buildExplicitSkinArtifacts(temporaryRoot)).toThrow(`Unrecorded explicit source: ${snapshotDirectory}/${removed}`);
  });

  it("역할이 읽지 않는 파일을 고정 기록에 더하면 고정 목록과 사용 목록이 어긋나 export를 거부한다", () => {
    const { temporaryRoot, provenance } = copySourcesToTemporaryRoot();
    const unused = "assets/note-single-palette-mix-025.png";
    const bytes = readFileSync(join(root, selected.originDirectory, unused));
    cpSync(join(root, selected.originDirectory, unused), join(temporaryRoot, snapshotDirectory, unused));
    provenance.selected.files.push({ file: unused, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
      width: 212, height: 40, targetSize: [212, 40], padding: [0, 0, 0, 0], approval: "approved-artwork" });
    writeFileSync(join(temporaryRoot, provenancePath), JSON.stringify(provenance));
    expect(() => buildExplicitSkinArtifacts(temporaryRoot)).toThrow(`Unused pinned explicit source: ${snapshotDirectory}/${unused}`);
  });

  it("고정 사본 PNG가 1바이트라도 바뀌면 SHA 불일치로 export를 거부한다", () => {
    const { temporaryRoot } = copySourcesToTemporaryRoot();
    const changed = `${snapshotDirectory}/assets/selected-sustain-double-unit-left.png`;
    const bytes = readFileSync(join(temporaryRoot, changed));
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(join(temporaryRoot, changed), bytes);
    expect(() => buildExplicitSkinArtifacts(temporaryRoot)).toThrow(`Source hash mismatch: ${changed}`);
  });

  it("export는 런타임 폴더에 남은 예전 이름 sustain-single.png를 지우고 --check와 같은 결과를 남긴다", () => {
    const { temporaryRoot } = copySourcesToTemporaryRoot();
    const stale = join(temporaryRoot, "public/skins/classic-explicit/sustain-single.png");
    writeFileSync(stale, "stale");
    const { files } = buildExplicitSkinArtifacts(temporaryRoot);
    expect(() => verifyExplicitSkinArtifacts(temporaryRoot, files)).toThrow("Unexpected explicit skin export: sustain-single.png");
    expect(exportExplicitSkinArtifacts(temporaryRoot, files)).toEqual(["sustain-single.png"]);
    expect(existsSync(stale)).toBe(false);
    expect(() => verifyExplicitSkinArtifacts(temporaryRoot, files)).not.toThrow();
  });
});

describe.skipIf(!pinnedCommitsAvailable)("명시적 스킨 원본의 고정 커밋 대조(Git 필요)", () => {
  it("#348 86285403·#339 e563cb5d의 Git object에서 다시 만든 provenance와 고정 사본 56개가 커밋된 것과 같다", () => {
    const { provenance, snapshotFiles } = deriveExplicitSkinSources(root);
    expect(provenance).toEqual(readProvenance());
    expect(snapshotFiles.size).toBe(56);
    for (const [path, bytes] of snapshotFiles) expect(bytes.equals(readFileSync(join(root, path))), path).toBe(true);
  });

  it("#348 커밋의 selectedStatePreview 상태 파일을 대응하는 역할 원본으로 쓴다", () => {
    const { manifest } = buildExplicitSkinArtifacts(root);
    const preview = (JSON.parse(readExplicitSkinGitObject(root, selected.sourceCommit, `${selected.originDirectory}/manifest.json`)!.toString()) as {
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
      "tap.single.failed": stateFile("point-single", "failed"),
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
    expect(Object.keys(expected)).toHaveLength(28);
    for (const [id, file] of Object.entries(expected)) {
      expect(manifest.assets.find(asset => asset.id === id)?.source, id).toBe(`${snapshotDirectory}/${file}`);
    }
  });
});
