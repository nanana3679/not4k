import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const archiveRoot = 'assets-lab/classic/versions';
// The skin-shared gear frame (public/gear/) is not part of a Classic version since RFD 0029; older archives
// still hold the old gear and gauges as a record, and verify keeps checking their hashes.
const runtimeDirectory = 'public/skins/classic';
const directories = [
  'assets-lab/classic/sources',
  runtimeDirectory,
  'public/lab/note-assets/classic',
];
const fixedFiles = [
  'assets-lab/classic/README.md',
  'assets-lab/classic/bomb-export.html',
  'scripts/build-classic-skin.ts',
  'src/game/skin/skins.ts',
  'src/game/skin/types.ts',
  'src/shared/publicPath.ts',
  'src/lab/noteAssetKeybomb.css',
  'src/lab/keybombEffect.ts',
  'package.json',
  'pnpm-lock.yaml',
];
// Commits before #178 named the build script build-classic-skin.mjs; a Git-ref save of such a commit archives it under that name.
const legacyFixedFiles: Record<string, string> = { 'scripts/build-classic-skin.ts': 'scripts/build-classic-skin.mjs' };
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const selected = (path: string) => fixedFiles.includes(path) || Object.values(legacyFixedFiles).includes(path)
  || directories.some(directory => path.startsWith(`${directory}/`))
  || /^assets-lab\/classic\/[^/]+\.mjs$/.test(path);

interface ManifestFile { path: string; bytes: number; sha256: string }

interface ClassicVersionManifest {
  schemaVersion: 1;
  skin: 'classic';
  id: string;
  label: string;
  savedAt: string;
  source: { kind: 'git' | 'worktree'; baseCommit: string };
  buildCommand: string;
  runtimeDirectory: string;
  files: ManifestFile[];
}

function versionPath(root: string, id: string) {
  if (!/^v\d{3,}$/.test(id)) throw new Error('버전 ID는 v001처럼 지정하세요.');
  return resolve(root, archiveRoot, id);
}

function git(root: string, args: string[]): Promise<string>;
function git(root: string, args: string[], binary: true): Promise<Buffer>;
async function git(root: string, args: string[], binary = false): Promise<string | Buffer> {
  return (await exec('git', args, { cwd: root, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 32 * 1024 * 1024 })).stdout;
}

// symlinkPath lets callers other than save replace the message with their own wording.
const symlinkError = (path: string) => Object.assign(new Error(`심볼릭 링크는 보관하지 않습니다: ${path}`), { symlinkPath: path });

type SymlinkError = ReturnType<typeof symlinkError>;

async function walk(root: string, path: string): Promise<string[]> {
  if ((await lstat(resolve(root, path))).isSymbolicLink()) throw symlinkError(path);
  const entries = await readdir(resolve(root, path), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw symlinkError(`${path}/${entry.name}`);
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

// The worktree files a save archives: fixed files, top-level generators and every file in the archived directories.
async function workingSelection(root: string, list: (root: string, directory: string) => Promise<string[]> = walk) {
  const generators = (await readdir(resolve(root, 'assets-lab/classic')))
    .filter(name => name.endsWith('.mjs')).map(name => `assets-lab/classic/${name}`);
  const paths = [...fixedFiles, ...generators];
  for (const directory of directories) paths.push(...await list(root, directory));
  return paths;
}

export async function saveClassicVersion({ root, id, label, ref }: { root: string; id: string; label: string; ref?: string }) {
  const destination = versionPath(root, id);
  if (!label?.trim()) throw new Error('버전 설명이 필요합니다.');
  const commit = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${ref ?? 'HEAD'}^{commit}`])).trim();
  let paths: string[];
  if (ref) {
    paths = (await git(root, ['ls-tree', '-r', '--name-only', commit])).trim().split('\n').filter(selected);
  } else {
    paths = await workingSelection(root);
  }
  paths = [...new Set(paths)].sort();
  for (const path of [...fixedFiles, ...directories.map(directory => `${directory}/`)]) {
    if (!paths.some(candidate => path.endsWith('/') ? candidate.startsWith(path) : candidate === path || candidate === legacyFixedFiles[path])) {
      throw new Error(`필수 보관 자료가 없습니다: ${path}`);
    }
  }
  // Exclusive creation prevents overwriting any previously saved version.
  await mkdir(resolve(root, archiveRoot), { recursive: true });
  await mkdir(destination);
  try {
    const files = [];
    for (const path of paths) {
      if (!ref && !(await lstat(resolve(root, path))).isFile()) throw new Error(`일반 파일이 아닙니다: ${path}`);
      const bytes = ref ? await git(root, ['show', `${commit}:${path}`], true) : await readFile(resolve(root, path));
      const target = resolve(destination, 'files', path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
      files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
    }
    const manifest = {
      schemaVersion: 1, skin: 'classic', id, label,
      savedAt: new Date().toISOString(),
      source: { kind: ref ? 'git' : 'worktree', baseCommit: commit },
      buildCommand: 'pnpm build:classic',
      runtimeDirectory,
      files,
    };
    // The manifest is written last: its presence marks a complete archive.
    await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return manifest;
  } catch (error) {
    // This directory was exclusively created by this call; existing versions are never removed.
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

async function readManifest(root: string, id: string) {
  const directory = versionPath(root, id);
  const text = await readFile(resolve(directory, 'manifest.json'), 'utf8');
  let manifest: ClassicVersionManifest | null = null;
  try { manifest = JSON.parse(text); } catch { /* reported below as invalid version info */ }
  if (manifest?.id !== id || manifest.skin !== 'classic' || manifest.schemaVersion !== 1
    || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error(`버전 정보가 올바르지 않습니다: ${id}`);
  }
  const seen = new Set();
  for (const file of manifest.files) {
    if (typeof file?.path !== 'string' || file.path.startsWith('/') || file.path.includes('\\')
      || file.path.split('/').some(part => part === '.' || part === '..' || !part) || seen.has(file.path)) {
      throw new Error(`보관 경로가 올바르지 않습니다: ${file?.path}`);
    }
    if (!/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error(`보관 해시가 올바르지 않습니다: ${id} ${file.path}`);
    seen.add(file.path);
  }
  return { directory, manifest };
}

export async function verifyClassicVersion({ root, id }: { root: string; id: string }) {
  const { directory, manifest } = await readManifest(root, id);
  for (const file of manifest.files) {
    const path = resolve(directory, 'files', file.path);
    if (!(await lstat(path)).isFile()) throw new Error(`일반 파일이 아닙니다: ${file.path}`);
    const bytes = await readFile(path);
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`보관 파일이 변경되었습니다: ${file.path}`);
  }
  const actual = await walk(directory, 'files');
  if (actual.length !== manifest.files.length) throw new Error(`기록되지 않은 보관 파일이 있습니다: ${id}`);
  return manifest;
}

async function workingHash(root: string, path: string) {
  try {
    return hash(await readFile(resolve(root, path)));
  } catch (error) {
    if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code!)) return null;
    throw error;
  }
}

// current compares instead of archiving: a missing reference directory counts as empty,
// but the game PNG folder must exist and no compared directory may contain a symlink.
async function listForComparison(root: string, directory: string) {
  const isRuntime = directory === runtimeDirectory;
  const exists = await lstat(resolve(root, directory)).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  if (!exists) {
    if (isRuntime) throw new Error(`게임 PNG 폴더가 없습니다: ${runtimeDirectory}`);
    return [];
  }
  try {
    return await walk(root, directory);
  } catch (error) {
    if (!(error as SymlinkError).symlinkPath) throw error;
    throw new Error(`${isRuntime ? '게임 PNG 폴더에 ' : ''}심볼릭 링크가 있어 비교할 수 없습니다: ${(error as SymlinkError).symlinkPath}`);
  }
}

// Archived hashes are trusted here; checking the archive itself is verifyClassicVersion's job.
export async function findCurrentClassicVersion({ root }: { root: string }) {
  const entries = await readdir(resolve(root, archiveRoot), { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const ids = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^v\d{3,}$/.test(entry.name)) continue;
    // A directory without manifest.json is an incomplete save and is not a version.
    if ((await lstat(resolve(root, archiveRoot, entry.name, 'manifest.json')).catch(() => null))?.isFile()) ids.push(entry.name);
  }
  if (!ids.length) throw new Error('보관된 Classic 버전이 없습니다.');
  // Equal numbers (v001, v0001) fall back to reverse string order so the result never depends on readdir order.
  ids.sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)) || b.localeCompare(a));
  const isPng = (path: string) => path.startsWith(`${runtimeDirectory}/`);
  const selection = await workingSelection(root, listForComparison);
  const current = new Map();
  for (const path of selection.filter(isPng)) current.set(path, await workingHash(root, path));
  const versions = [];
  for (const id of ids) {
    const { manifest } = await readManifest(root, id);
    const archived = new Map(manifest.files.filter(file => isPng(file.path)).map(file => [file.path, file.sha256]));
    const pngDiffs = [...new Set([...archived.keys(), ...current.keys()])]
      .filter(path => archived.get(path) !== current.get(path)).sort();
    versions.push({ id, manifest, pngDiffs });
  }
  const matches = versions.filter(version => !version.pngDiffs.length).map(version => version.id);
  // Newest first, so a strict comparison keeps the newest version on ties.
  const closest = versions.reduce((best, version) => version.pngDiffs.length < best.pngDiffs.length ? version : best);
  // The union also reports files added after archiving; a file in neither place (hash null on both sides) is no difference.
  const archivedOther = new Map(closest.manifest.files.filter(file => !isPng(file.path)).map(file => [file.path, file.sha256]));
  const otherDiffs = [];
  for (const path of new Set([...archivedOther.keys(), ...selection.filter(path => !isPng(path))])) {
    if ((archivedOther.get(path) ?? null) !== await workingHash(root, path)) otherDiffs.push(path);
  }
  return { pngFiles: current.size, matches, compared: { id: closest.id, pngDiffs: closest.pngDiffs, otherDiffs: otherDiffs.sort() } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const [command, id, label, ref, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || (command === 'verify' && label) || (command === 'current' && id !== undefined)) {
      throw new Error('불필요한 인자가 있습니다.');
    }
    if (command === 'save') {
      const saved = await saveClassicVersion({ root, id, label, ref });
      console.log(`${id}: ${saved.files.length}개 파일 보관 · ${saved.label}`);
    } else if (command === 'verify') {
      const saved = await verifyClassicVersion({ root, id });
      console.log(`${id}: ${saved.files.length}개 파일 SHA-256 검증 통과`);
    } else if (command === 'current') {
      const { pngFiles, matches, compared } = await findCurrentClassicVersion({ root });
      const list = (paths: string[]) => paths.map(path => `\n  ${path}`).join('');
      console.log(matches.length
        ? `게임 PNG(${runtimeDirectory}): ${matches.join('·')} 보관본과 일치 (${pngFiles}개 파일)`
        : `게임 PNG(${runtimeDirectory}): 일치하는 보관 버전 없음. 가장 가까운 ${compared.id} 보관본과 다른 파일 ${compared.pngDiffs.length}개:${list(compared.pngDiffs)}`);
      console.log(compared.otherDiffs.length
        ? `원본·설정 등 그 밖의 보관 파일: ${compared.id} 보관본과 다른 파일 ${compared.otherDiffs.length}개 (참고용)${list(compared.otherDiffs)}`
        : `원본·설정 등 그 밖의 보관 파일: ${compared.id} 보관본과 모두 같음`);
      if (!matches.length) process.exitCode = 1;
    } else {
      throw new Error('사용법: node scripts/classic-versions.ts save v003 "설명" [Git ref] | verify v001 | current');
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
