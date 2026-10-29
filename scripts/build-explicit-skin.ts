import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateExplicitSkinManifest } from "../src/game/skin/explicitSkinContract.ts";
import type { ExplicitSkinAssetMetadata, ExplicitSkinImage, ExplicitSkinManifest } from "../src/game/skin/explicitSkinContract.ts";

const sourceDirectory = "assets-lab/classic/explicit";
const provenancePath = `${sourceDirectory}/provenance.json`;
const runtimeDirectory = "public/skins/classic-explicit";
const moduleManifest = "src/game/skin/explicitSkinManifest.json";
const historicalManifest = "assets-lab/classic/versions/v014/manifest.json";
const historicalFiles = "assets-lab/classic/versions/v014/files/";

/**
 * 고정 커밋과 원본 위치. `directory`는 빌드가 실제로 읽는 폴더다.
 * #348 작업 폴더는 계속 재생성되므로 쓰는 파일만 `sources/`에 고정 사본으로 둔다.
 * #339 보관본은 `source-archive.test.ts`가 지키는 고정 폴더라 그 자리에서 읽는다.
 */
export const EXPLICIT_SKIN_REVISIONS = {
  /** #348 선택 도안. 트릴을 뺀 모든 역할의 원본이다. */
  selected: {
    sourceCommit: "86285403b14e8314aebb80bcaaff908a521f3613",
    sourcePullRequest: 348,
    originDirectory: "assets-lab/classic/revisions/selected-notes-20261026",
    directory: `${sourceDirectory}/sources/selected-notes-20261026`,
  },
  /** #339 승인 보관본. 트릴 Grace overlay만 여기서 읽는다. */
  approved: {
    sourceCommit: "e563cb5d48580db81e8bc3483d2563bee2410a56",
    sourcePullRequest: 339,
    originDirectory: "assets-lab/classic/revisions/approved-notes-20261025",
    directory: "assets-lab/classic/revisions/approved-notes-20261025",
  },
} as const;
type RevisionKey = keyof typeof EXPLICIT_SKIN_REVISIONS;
const revisionKeys = Object.keys(EXPLICIT_SKIN_REVISIONS) as RevisionKey[];

interface FileRecord { path: string; bytes: number; sha256: string }
/** 고정 커밋의 revision `manifest.json`이 그 파일에 적은 값. 빌드는 revision manifest를 읽지 않는다. */
interface PinnedFile {
  file: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  targetSize: [number, number];
  padding: [number, number, number, number];
  approval: string;
}
interface PinnedRevision {
  sourceCommit: string;
  sourcePullRequest: number;
  originDirectory: string;
  /** 고정 커밋에서 `originDirectory`의 Git tree. */
  originTree: string;
  directory: string;
  /** 역할이 실제로 읽는 PNG만 고정한다(@2x 포함). */
  files: PinnedFile[];
}
export interface ExplicitSkinProvenance {
  schemaVersion: 3;
  selected: PinnedRevision;
  approved: PinnedRevision;
  historical: { manifest: FileRecord; files: (FileRecord & { historicalPath: string })[] };
}
type SourceRole = Pick<ExplicitSkinAssetMetadata, "id" | "role" | "variant" | "state" | "side" | "sideMeaning" | "markerCenter">
  & { source: string; output: string };

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const highResolutionPath = (path: string) => path.replace(/\.png$/, "@2x.png");
const pngSize = (bytes: Buffer, path: string) => {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`Expected PNG source: ${path}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
const listFiles = (root: string, directory: string): string[] => existsSync(resolve(root, directory))
  ? readdirSync(resolve(root, directory), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    .map(entry => relative(root, join(entry.parentPath, entry.name)).split("\\").join("/")).sort()
  : [];

/** 역할 ID에서 런타임 파일 이름을 정한다: `역할-변형[-상태][-방향].png`, 기본 상태 pending·idle은 생략한다. */
export function explicitSkinOutputName(id: string): string {
  const [role, variant, state, side] = id.split(".");
  if (role === "graceOverlay") return `${variant}-grace-overlay.png`;
  const stateName = state === "pending" || state === "idle" ? [] : [state.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)];
  return `${[role, variant, ...stateName, ...(side ? [side] : [])].join("-")}.png`;
}

/** 보관본과 고정 사본은 읽기 전용이다. 이 함수는 쓸 결과를 메모리에만 만들므로 검증에도 쓴다. Git을 쓰지 않는다. */
export function buildExplicitSkinArtifacts(root: string): {
  files: Map<string, Buffer>;
  manifest: ExplicitSkinManifest;
  verifiedSourceFiles: number;
} {
  const read = (path: string) => readFileSync(resolve(root, path));
  const verify = (record: FileRecord) => {
    const bytes = read(record.path);
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw new Error(`Source hash mismatch: ${record.path}`);
    return bytes;
  };
  const provenance = JSON.parse(read(provenancePath).toString()) as ExplicitSkinProvenance;
  if (provenance.schemaVersion !== 3 || revisionKeys.some(key => (["sourceCommit", "sourcePullRequest", "originDirectory", "directory"] as const)
    .some(field => provenance[key][field] !== EXPLICIT_SKIN_REVISIONS[key][field]))) {
    throw new Error("Explicit skin requires the selected PR 348 snapshot and the approved PR 339 trill source");
  }

  // 고정 기록의 크기·SHA-256·PNG 크기를 대조한다. 고정하지 않은 파일은 원본으로 쓸 수 없다.
  const pinnedBySource = new Map<string, PinnedFile>();
  for (const key of revisionKeys) {
    const revision = provenance[key];
    for (const record of revision.files) {
      const path = `${revision.directory}/${record.file}`;
      const size = pngSize(verify({ path, bytes: record.bytes, sha256: record.sha256 }), path);
      if (size.width !== record.width || size.height !== record.height) throw new Error(`Pinned PNG dimensions mismatch: ${path}`);
      if (pinnedBySource.has(path)) throw new Error(`Duplicate pinned explicit source: ${path}`);
      pinnedBySource.set(path, record);
    }
    // 고정 사본 폴더에는 고정한 파일만 둔다. 원본 폴더를 그 자리에서 읽는 보관본은 아래 @2x 규칙으로 지킨다.
    if (revision.directory !== revision.originDirectory) {
      for (const path of listFiles(root, revision.directory)) {
        if (!pinnedBySource.has(path)) throw new Error(`Unrecorded explicit source: ${path}`);
      }
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
  for (const role of roles) {
    if (role.output !== explicitSkinOutputName(role.id)) throw new Error(`Explicit skin output must be ${explicitSkinOutputName(role.id)}: ${role.id}`);
  }
  if (new Set(outputs).size !== outputs.length) throw new Error("Explicit skin outputs must be unique");
  const files = new Map<string, Buffer>();
  const usedSources = new Set<string>();
  function image(source: string, resolution: 1 | 2, file: string): ExplicitSkinImage {
    if (!pinnedBySource.has(source) && !historicalBySource.has(source)) throw new Error(`Unrecorded explicit source: ${source}`);
    const bytes = read(source);
    const pixelSize = pngSize(bytes, source);
    usedSources.add(source);
    files.set(`${runtimeDirectory}/${file}`, bytes);
    return { file, source, pixelSize, resolution, bytes: bytes.length, sha256: sha256(bytes) };
  }
  const assets = roles.map(({ source, output, ...role }): ExplicitSkinAssetMetadata => {
    const original = pinnedBySource.get(source);
    const baseImage = image(source, 1, output);
    const [width, height] = original?.targetSize ?? [baseImage.pixelSize.width, baseImage.pixelSize.height];
    const [top, right, bottom, left] = original?.padding ?? [0, 0, 0, 0];
    // revision 원본 옆에 2배 PNG가 있으면 반드시 고정해 함께 내보낸다. 빠뜨리면 image()가 미기록 원본으로 거부한다.
    const highSource = highResolutionPath(source);
    const highResolution = original && existsSync(resolve(root, highSource)) ? image(highSource, 2, highResolutionPath(output)) : undefined;
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
  // 고정 기록은 역할이 읽는 원본과 정확히 같아야 한다. 쓰지 않는 고정 기록은 원본 목록이 어긋났다는 뜻이다.
  for (const path of [...pinnedBySource.keys(), ...historicalBySource.keys()]) {
    if (!usedSources.has(path)) throw new Error(`Unused pinned explicit source: ${path}`);
  }
  const manifest: ExplicitSkinManifest = {
    schemaVersion: 1,
    id: "classic-explicit",
    runtimePath: "/skins/classic-explicit",
    provenance: {
      selected: { sourceCommit: provenance.selected.sourceCommit, sourcePullRequest: 348 },
      approved: { sourceCommit: provenance.approved.sourceCommit, sourcePullRequest: 339 },
      historicalManifestSha256: provenance.historical.manifest.sha256,
    },
    body: { mode: "repeat", axis: "y", tileSize: { width: 200, height: 40 }, laneReferenceWidth: 212, startCap: false, endCap: false },
    assets,
  };
  validateExplicitSkinManifest(manifest);
  const encoded = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  files.set(`${runtimeDirectory}/manifest.json`, encoded);
  files.set(moduleManifest, encoded);
  return { files, manifest, verifiedSourceFiles: pinnedBySource.size + historicalBySource.size };
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

/** 결과를 쓰고 런타임 폴더에 남은 예전 이름의 파일을 지운다. 지운 파일 이름을 돌려준다. */
export function exportExplicitSkinArtifacts(root: string, files: ReadonlyMap<string, Buffer>): string[] {
  for (const [path, bytes] of files) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const expectedNames = new Set([...files.keys()].filter(path => path.startsWith(`${runtimeDirectory}/`)).map(path => basename(path)));
  const removed = readdirSync(resolve(root, runtimeDirectory)).filter(name => !expectedNames.has(name)).sort();
  for (const name of removed) rmSync(resolve(root, runtimeDirectory, name));
  verifyExplicitSkinArtifacts(root, files);
  return removed;
}

/** 고정 커밋의 Git object를 읽는다. 커밋이 없는 얕은 clone이면 null이다. */
export function readExplicitSkinGitObject(root: string, commit: string, path: string): Buffer | null {
  try {
    return execFileSync("git", ["cat-file", "blob", `${commit}:${path}`], { cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/**
 * `roles.json`이 읽는 원본을 고정 커밋의 Git object에서 다시 가져와 provenance와 고정 사본을 만든다.
 * 크기·SHA-256·`targetSize`·`padding`·`approval`은 그 커밋의 revision `manifest.json` 값이며 바이트와도 대조한다.
 * 트릴 탭·바디는 v014 보관본과 그 manifest에서 기록한다. 쓰지 않고 결과만 돌려준다.
 */
export function deriveExplicitSkinSources(root: string): { provenance: ExplicitSkinProvenance; snapshotFiles: Map<string, Buffer> } {
  const git = (commit: string, path: string) => {
    const bytes = readExplicitSkinGitObject(root, commit, path);
    if (!bytes) throw new Error(`Missing Git object ${commit}:${path}`);
    return bytes;
  };
  const roles = JSON.parse(readFileSync(resolve(root, sourceDirectory, "roles.json"), "utf8")) as SourceRole[];
  const snapshotFiles = new Map<string, Buffer>();
  const claimed = new Set<string>();
  const pinRevision = (key: RevisionKey): PinnedRevision => {
    const { sourceCommit, sourcePullRequest, originDirectory, directory } = EXPLICIT_SKIN_REVISIONS[key];
    const { assets } = JSON.parse(git(sourceCommit, `${originDirectory}/manifest.json`).toString()) as { assets: (PinnedFile & Record<string, unknown>)[] };
    const assetsByFile = new Map(assets.map(asset => [asset.file, asset]));
    // 그 커밋의 manifest에 2배 PNG가 있으면 함께 고정한다.
    const pinnedFiles = [...new Set(roles.map(role => role.source).filter(source => source.startsWith(`${directory}/`)))]
      .flatMap(source => {
        const file = source.slice(directory.length + 1);
        return assetsByFile.has(highResolutionPath(file)) ? [file, highResolutionPath(file)] : [file];
      }).sort();
    const files = pinnedFiles.map((file): PinnedFile => {
      const asset = assetsByFile.get(file);
      if (!asset) throw new Error(`Not in ${sourceCommit} manifest: ${originDirectory}/${file}`);
      const bytes = git(sourceCommit, `${originDirectory}/${file}`);
      if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) throw new Error(`Revision manifest hash mismatch: ${originDirectory}/${file}`);
      const path = `${directory}/${file}`;
      claimed.add(path);
      if (directory !== originDirectory) snapshotFiles.set(path, bytes);
      else if (!readFileSync(resolve(root, path)).equals(bytes)) throw new Error(`Archive differs from ${sourceCommit}: ${path}`);
      return { file, bytes: asset.bytes, sha256: asset.sha256, width: asset.width, height: asset.height,
        targetSize: asset.targetSize, padding: asset.padding, approval: asset.approval };
    });
    const originTree = execFileSync("git", ["rev-parse", `${sourceCommit}:${originDirectory}`], { cwd: root, encoding: "utf8" }).trim();
    return { sourceCommit, sourcePullRequest, originDirectory, originTree, directory, files };
  };
  const selected = pinRevision("selected");
  const approved = pinRevision("approved");
  const historyBytes = readFileSync(resolve(root, historicalManifest));
  const history = JSON.parse(historyBytes.toString()) as { files: FileRecord[] };
  const historical = {
    manifest: { path: historicalManifest, bytes: historyBytes.length, sha256: sha256(historyBytes) },
    files: roles.map(role => role.source).filter(source => source.startsWith(historicalFiles)).map(path => {
      const historicalPath = path.slice(historicalFiles.length);
      const record = history.files.find(file => file.path === historicalPath);
      if (!record) throw new Error(`Not in v014 manifest: ${historicalPath}`);
      claimed.add(path);
      return { path, bytes: record.bytes, sha256: record.sha256, historicalPath };
    }),
  };
  const unclaimed = roles.map(role => role.source).filter(source => !claimed.has(source));
  if (unclaimed.length) throw new Error(`Explicit skin source outside pinned revisions: ${unclaimed.join(", ")}`);
  return { provenance: { schemaVersion: 3, selected, approved, historical }, snapshotFiles };
}

/** 고정 사본·provenance를 쓰고 사본 폴더의 나머지 파일을 지운다. */
function freezeExplicitSkinSources(root: string): { written: number; removed: string[] } {
  const { provenance, snapshotFiles } = deriveExplicitSkinSources(root);
  for (const [path, bytes] of snapshotFiles) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), bytes);
  }
  const removed = listFiles(root, EXPLICIT_SKIN_REVISIONS.selected.directory).filter(path => !snapshotFiles.has(path));
  for (const path of removed) rmSync(resolve(root, path));
  // 숫자 배열(`targetSize`·`padding`)은 한 줄로 둬 파일별 기록을 한눈에 읽게 한다.
  const json = JSON.stringify(provenance, null, 2).replace(/\[\s+([\d.,\s]+?)\s+\]/g, (_, values: string) => `[${values.split(/,\s*/).join(", ")}]`);
  writeFileSync(resolve(root, provenancePath), `${json}\n`);
  return { written: snapshotFiles.size, removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => arg !== "--check" && arg !== "--freeze-sources")) {
    throw new Error("Usage: node scripts/build-explicit-skin.ts [--check | --freeze-sources]");
  }
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (args.includes("--freeze-sources")) {
    const { written, removed } = freezeExplicitSkinSources(root);
    console.log(`Froze ${written} source PNGs from pinned commits into ${EXPLICIT_SKIN_REVISIONS.selected.directory}; removed ${removed.length}. Run pnpm build:explicit-skin next.`);
  } else {
    const result = buildExplicitSkinArtifacts(root);
    const removed = args.includes("--check") ? (verifyExplicitSkinArtifacts(root, result.files), []) : exportExplicitSkinArtifacts(root, result.files);
    console.log(`${args.includes("--check") ? "Verified" : "Exported"} ${result.manifest.assets.length} explicit roles, ${result.files.size - 2} PNGs; ${result.verifiedSourceFiles} pinned source PNG hashes verified.${removed.length ? ` Removed stale: ${removed.join(", ")}.` : ""}`);
  }
}
