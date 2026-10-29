import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateExplicitSkinManifest } from "../src/game/skin/explicitSkinContract.ts";
import type { ExplicitSkinAssetMetadata, ExplicitSkinImage, ExplicitSkinManifest } from "../src/game/skin/explicitSkinContract.ts";

const sourceDirectory = "assets-lab/classic/explicit";
const runtimeDirectory = "public/skins/classic-explicit";
const moduleManifest = "src/game/skin/explicitSkinManifest.json";
/** #348 선택 도안. 트릴을 뺀 모든 역할의 원본이다. */
const selectedSource = { commit: "86285403b14e8314aebb80bcaaff908a521f3613", pullRequest: 348 } as const;
/** #339 승인 보관본. 트릴 Grace overlay만 여기서 읽는다. */
const approvedSource = { commit: "e563cb5d48580db81e8bc3483d2563bee2410a56", pullRequest: 339 } as const;

interface FileRecord { path: string; bytes: number; sha256: string }
interface PinnedRevision {
  sourceCommit: string;
  sourcePullRequest: number;
  directory: string;
  directoryTree: string;
  manifest: FileRecord;
  /** 이 revision에서 실제로 읽는 PNG만 고정한다(@2x 포함). */
  files: FileRecord[];
}
interface Provenance {
  schemaVersion: 2;
  selected: PinnedRevision;
  approved: PinnedRevision;
  historical: { manifest: FileRecord; files: (FileRecord & { historicalPath: string })[] };
}
interface RevisionAsset {
  file: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  targetSize: [number, number];
  padding: [number, number, number, number];
  approval: string;
}
type SourceRole = Pick<ExplicitSkinAssetMetadata, "id" | "role" | "variant" | "state" | "side" | "sideMeaning" | "markerCenter">
  & { source: string; output: string };

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const highResolutionPath = (path: string) => path.replace(/\.png$/, "@2x.png");

/** 보관본은 읽기 전용이다. 이 함수는 쓸 결과를 메모리에만 만들므로 검증에도 쓴다. */
export function buildExplicitSkinArtifacts(root: string): {
  files: Map<string, Buffer>;
  manifest: ExplicitSkinManifest;
  verifiedSourceFiles: number;
} {
  const read = (path: string) => readFileSync(resolve(root, path));
  const verify = (record: FileRecord) => {
    const bytes = read(record.path);
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`Source hash mismatch: ${record.path}`);
  };
  const provenance = JSON.parse(read(`${sourceDirectory}/provenance.json`).toString()) as Provenance;
  if (provenance.schemaVersion !== 2
    || provenance.selected.sourceCommit !== selectedSource.commit || provenance.selected.sourcePullRequest !== selectedSource.pullRequest
    || provenance.approved.sourceCommit !== approvedSource.commit || provenance.approved.sourcePullRequest !== approvedSource.pullRequest) {
    throw new Error("Explicit skin requires the selected PR 348 source and the approved PR 339 trill source");
  }

  // 각 revision manifest가 기록한 크기·SHA와 고정 기록을 대조한다. 고정하지 않은 파일은 원본으로 쓸 수 없다.
  const catalogBySource = new Map<string, RevisionAsset>();
  const pinnedBySource = new Map<string, RevisionAsset>();
  for (const revision of [provenance.selected, provenance.approved]) {
    verify(revision.manifest);
    const { assets } = JSON.parse(read(revision.manifest.path).toString()) as { assets: RevisionAsset[] };
    const revisionCatalog = new Map(assets.map(asset => [`${revision.directory}/${asset.file}`, asset]));
    if (revisionCatalog.size !== assets.length) throw new Error(`Duplicate revision asset: ${revision.directory}`);
    for (const [source, asset] of revisionCatalog) catalogBySource.set(source, asset);
    for (const record of revision.files) {
      verify(record);
      const asset = revisionCatalog.get(record.path);
      if (!asset || asset.bytes !== record.bytes || asset.sha256 !== record.sha256) {
        throw new Error(`Revision manifest hash mismatch: ${record.path}`);
      }
      pinnedBySource.set(record.path, asset);
    }
  }
  verify(provenance.historical.manifest);
  const history = JSON.parse(read(provenance.historical.manifest.path).toString()) as { files: FileRecord[] };
  const historicalBySource = new Map(provenance.historical.files.map(asset => [asset.path, asset]));
  for (const record of historicalBySource.values()) {
    verify(record);
    const historicalRecord = history.files.find(file => file.path === record.historicalPath);
    if (historicalRecord?.sha256 !== record.sha256 || historicalRecord?.bytes !== record.bytes) {
      throw new Error(`Historical manifest mismatch: ${record.path}`);
    }
  }

  const roles = JSON.parse(read(`${sourceDirectory}/roles.json`).toString()) as SourceRole[];
  const outputs = roles.map(role => role.output);
  if (outputs.some(output => !/^[a-z0-9-]+\.png$/.test(output)) || new Set(outputs).size !== outputs.length) {
    throw new Error("Explicit skin outputs must be unique lowercase PNG names without @2x");
  }
  const files = new Map<string, Buffer>();
  function image(source: string, resolution: 1 | 2, file: string): ExplicitSkinImage {
    if (!pinnedBySource.has(source) && !historicalBySource.has(source)) throw new Error(`Unrecorded explicit source: ${source}`);
    const bytes = read(source);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`Expected PNG source: ${source}`);
    const pixelSize = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    const pinned = pinnedBySource.get(source);
    if (pinned && (pinned.width !== pixelSize.width || pinned.height !== pixelSize.height)) {
      throw new Error(`Revision PNG dimensions mismatch: ${source}`);
    }
    files.set(`${runtimeDirectory}/${file}`, bytes);
    return { file, source, pixelSize, resolution, bytes: bytes.length, sha256: sha256(bytes) };
  }
  const assets = roles.map(({ source, output, ...role }): ExplicitSkinAssetMetadata => {
    const original = pinnedBySource.get(source);
    const baseImage = image(source, 1, output);
    const [width, height] = original?.targetSize ?? [baseImage.pixelSize.width, baseImage.pixelSize.height];
    const [top, right, bottom, left] = original?.padding ?? [0, 0, 0, 0];
    // revision manifest에 2배 PNG가 있으면 반드시 고정해 함께 내보낸다. 빠뜨리면 image()가 미기록 원본으로 거부한다.
    const highSource = highResolutionPath(source);
    const highResolution = catalogBySource.has(highSource) ? image(highSource, 2, highResolutionPath(output)) : undefined;
    return {
      ...role,
      ...baseImage,
      logicalSize: { width, height },
      contentRect: { x: left, y: top, width: width - left - right, height: height - top - bottom },
      anchor: { x: 0.5, y: 0.5 },
      sourceApproval: original?.approval ?? "historical-runtime-v014",
      ...(highResolution ? { highResolution } : {}),
    };
  });
  const manifest: ExplicitSkinManifest = {
    schemaVersion: 1,
    id: "classic-explicit",
    runtimePath: "/skins/classic-explicit",
    provenance: {
      selected: { sourceCommit: selectedSource.commit, sourcePullRequest: selectedSource.pullRequest, manifestSha256: provenance.selected.manifest.sha256 },
      approved: { sourceCommit: approvedSource.commit, sourcePullRequest: approvedSource.pullRequest, manifestSha256: provenance.approved.manifest.sha256 },
      historicalManifestSha256: provenance.historical.manifest.sha256,
    },
    body: { mode: "repeat", axis: "y", tileSize: { width: 200, height: 40 }, laneReferenceWidth: 212, startCap: false, endCap: false },
    assets,
  };
  validateExplicitSkinManifest(manifest);
  const encoded = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  files.set(`${runtimeDirectory}/manifest.json`, encoded);
  files.set(moduleManifest, encoded);
  const verifiedSourceFiles = provenance.selected.files.length + provenance.approved.files.length + provenance.historical.files.length;
  return { files, manifest, verifiedSourceFiles };
}

export function verifyExplicitSkinArtifacts(root: string, files: ReadonlyMap<string, Buffer>): void {
  for (const [path, expected] of files) {
    const target = resolve(root, path);
    if (!existsSync(target) || !readFileSync(target).equals(expected)) throw new Error(`Stale explicit skin export: ${path}`);
  }
  const expectedNames = new Set([...files.keys()].filter(path => path.startsWith(`${runtimeDirectory}/`)).map(path => basename(path)));
  for (const name of readdirSync(resolve(root, runtimeDirectory))) {
    if (!expectedNames.has(name)) throw new Error(`Unexpected explicit skin export: ${name}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--check")) throw new Error("Usage: node scripts/build-explicit-skin.ts [--check]");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = buildExplicitSkinArtifacts(root);
  if (!args.includes("--check")) {
    for (const [path, bytes] of result.files) {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
  }
  verifyExplicitSkinArtifacts(root, result.files);
  console.log(`${args.includes("--check") ? "Verified" : "Exported"} ${result.manifest.assets.length} explicit roles, ${result.files.size - 2} PNGs; ${result.verifiedSourceFiles} pinned source PNG hashes verified.`);
}
