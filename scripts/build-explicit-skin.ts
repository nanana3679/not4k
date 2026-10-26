import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateExplicitSkinManifest } from "../src/game/skin/explicitSkinContract.ts";
import type { ExplicitSkinAssetMetadata, ExplicitSkinImage, ExplicitSkinManifest } from "../src/game/skin/explicitSkinContract.ts";

const sourceDirectory = "assets-lab/classic/explicit";
const runtimeDirectory = "public/skins/classic-explicit";
const moduleManifest = "src/game/skin/explicitSkinManifest.json";
const approvedCommit = "e563cb5d48580db81e8bc3483d2563bee2410a56";

interface FileRecord { path: string; bytes: number; sha256: string }
interface Provenance {
  sourceCommit: string;
  sourcePullRequest: number;
  archiveDirectory: string;
  archiveTree: string;
  archiveFiles: FileRecord[];
  historicalManifest: FileRecord;
  historicalAssets: (FileRecord & { historicalPath: string })[];
}
interface ApprovedAsset {
  file: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  targetSize: [number, number];
  padding: [number, number, number, number];
  approval: string;
}
type SourceRole = Pick<ExplicitSkinAssetMetadata, "id" | "role" | "variant" | "state" | "side" | "sideMeaning" | "markerCenter"> & { source: string };

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** 보관본은 읽기 전용이다. 이 함수는 쓸 결과를 메모리에만 만들므로 검증에도 쓴다. */
export function buildExplicitSkinArtifacts(root: string): {
  files: Map<string, Buffer>;
  manifest: ExplicitSkinManifest;
  verifiedArchiveFiles: number;
  verifiedApprovedAssets: number;
} {
  const read = (path: string) => readFileSync(resolve(root, path));
  const provenance = JSON.parse(read(`${sourceDirectory}/provenance.json`).toString()) as Provenance;
  if (provenance.sourceCommit !== approvedCommit || provenance.sourcePullRequest !== 339) {
    throw new Error("Explicit skin requires the approved PR 339 source");
  }
  const records = [...provenance.archiveFiles, provenance.historicalManifest, ...provenance.historicalAssets];
  for (const record of records) {
    const bytes = read(record.path);
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`Source hash mismatch: ${record.path}`);
  }
  const archiveManifestPath = `${provenance.archiveDirectory}/manifest.json`;
  const archiveManifest = JSON.parse(read(archiveManifestPath).toString()) as { assets: ApprovedAsset[] };
  const approvedBySource = new Map(archiveManifest.assets.map(asset => [`${provenance.archiveDirectory}/${asset.file}`, asset]));
  if (approvedBySource.size !== archiveManifest.assets.length || approvedBySource.size !== 126) throw new Error("Expected 126 unique approved source assets");
  for (const [source, asset] of approvedBySource) {
    const bytes = read(source);
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) throw new Error(`Approved manifest hash mismatch: ${source}`);
  }
  const history = JSON.parse(read(provenance.historicalManifest.path).toString()) as { files: FileRecord[] };
  const historicalBySource = new Map(provenance.historicalAssets.map(asset => [asset.path, asset]));
  for (const record of historicalBySource.values()) {
    const historicalRecord = history.files.find(file => file.path === record.historicalPath);
    if (historicalRecord?.sha256 !== record.sha256 || historicalRecord?.bytes !== record.bytes) {
      throw new Error(`Historical manifest mismatch: ${record.path}`);
    }
  }

  const files = new Map<string, Buffer>();
  function image(source: string, resolution: 1 | 2): ExplicitSkinImage {
    if (!approvedBySource.has(source) && !historicalBySource.has(source)) throw new Error(`Unrecorded explicit source: ${source}`);
    const bytes = read(source);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`Expected PNG source: ${source}`);
    const pixelSize = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    const approved = approvedBySource.get(source);
    if (approved && (approved.width !== pixelSize.width || approved.height !== pixelSize.height)) {
      throw new Error(`Approved PNG dimensions mismatch: ${source}`);
    }
    const file = basename(source);
    const output = `${runtimeDirectory}/${file}`;
    const previous = files.get(output);
    if (previous && !previous.equals(bytes)) throw new Error(`Conflicting explicit output: ${output}`);
    files.set(output, bytes);
    return { file, source, pixelSize, resolution, bytes: bytes.length, sha256: sha256(bytes) };
  }
  const roles = JSON.parse(read(`${sourceDirectory}/roles.json`).toString()) as SourceRole[];
  const assets = roles.map(({ source, ...role }): ExplicitSkinAssetMetadata => {
    const original = approvedBySource.get(source);
    const baseImage = image(source, 1);
    const [width, height] = original?.targetSize ?? [baseImage.pixelSize.width, baseImage.pixelSize.height];
    const [top, right, bottom, left] = original?.padding ?? [0, 0, 0, 0];
    const highSource = source.replace(/\.png$/, "@2x.png");
    const highResolution = approvedBySource.has(highSource) ? image(highSource, 2) : undefined;
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
      sourceCommit: approvedCommit,
      archiveManifestSha256: sha256(read(archiveManifestPath)),
      historicalManifestSha256: provenance.historicalManifest.sha256,
    },
    body: { mode: "repeat", axis: "y", tileSize: { width: 200, height: 40 }, laneReferenceWidth: 212, startCap: false, endCap: false },
    assets,
  };
  validateExplicitSkinManifest(manifest);
  const encoded = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  files.set(`${runtimeDirectory}/manifest.json`, encoded);
  files.set(moduleManifest, encoded);
  return { files, manifest, verifiedArchiveFiles: provenance.archiveFiles.length, verifiedApprovedAssets: approvedBySource.size };
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
  console.log(`${args.includes("--check") ? "Verified" : "Exported"} ${result.manifest.assets.length} explicit roles, ${result.files.size - 2} PNGs; ${result.verifiedArchiveFiles} archived files and ${result.verifiedApprovedAssets} approved asset hashes verified.`);
}
