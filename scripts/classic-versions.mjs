import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const archiveRoot = 'assets-lab/classic/versions';
const directories = [
  'assets-lab/classic/sources',
  'public/skins/classic',
  'public/lab/note-assets/classic',
];
const fixedFiles = [
  'assets-lab/classic/README.md',
  'assets-lab/classic/bomb-export.html',
  'scripts/build-classic-skin.mjs',
  'src/game/skin/skins.ts',
  'src/game/skin/types.ts',
  'src/shared/publicPath.ts',
  'src/lab/noteAssetKeybomb.css',
  'src/lab/keybombEffect.ts',
  'public/gear/gear-frame.png',
  'public/gear/gear-gauge-left.png',
  'public/gear/gear-gauge-right.png',
  'package.json',
  'pnpm-lock.yaml',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const selected = path => fixedFiles.includes(path)
  || directories.some(directory => path.startsWith(`${directory}/`))
  || /^assets-lab\/classic\/[^/]+\.mjs$/.test(path);

function versionPath(root, id) {
  if (!/^v\d{3,}$/.test(id)) throw new Error('버전 ID는 v001처럼 지정하세요.');
  return resolve(root, archiveRoot, id);
}

async function git(root, args, binary = false) {
  return (await exec('git', args, { cwd: root, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 32 * 1024 * 1024 })).stdout;
}

async function walk(root, path) {
  if ((await lstat(resolve(root, path))).isSymbolicLink()) throw new Error(`심볼릭 링크는 보관하지 않습니다: ${path}`);
  const entries = await readdir(resolve(root, path), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`심볼릭 링크는 보관하지 않습니다: ${path}/${entry.name}`);
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

export async function saveClassicVersion({ root, id, label, ref }) {
  const destination = versionPath(root, id);
  if (!label?.trim()) throw new Error('버전 설명이 필요합니다.');
  const commit = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${ref ?? 'HEAD'}^{commit}`])).trim();
  let paths;
  if (ref) {
    paths = (await git(root, ['ls-tree', '-r', '--name-only', commit])).trim().split('\n').filter(selected);
  } else {
    const generators = (await readdir(resolve(root, 'assets-lab/classic')))
      .filter(name => name.endsWith('.mjs')).map(name => `assets-lab/classic/${name}`);
    paths = [...fixedFiles, ...generators];
    for (const directory of directories) paths.push(...await walk(root, directory));
  }
  paths = [...new Set(paths)].sort();
  for (const path of [...fixedFiles, ...directories.map(directory => `${directory}/`)]) {
    if (!paths.some(candidate => path.endsWith('/') ? candidate.startsWith(path) : candidate === path)) {
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
      runtimeDirectory: 'public/skins/classic',
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

export async function verifyClassicVersion({ root, id }) {
  const directory = versionPath(root, id);
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.id !== id || manifest.skin !== 'classic' || manifest.schemaVersion !== 1 || !manifest.files?.length) {
    throw new Error(`버전 정보가 올바르지 않습니다: ${id}`);
  }
  const seen = new Set();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || file.path.startsWith('/') || file.path.includes('\\')
      || file.path.split('/').some(part => part === '.' || part === '..' || !part) || seen.has(file.path)) {
      throw new Error(`보관 경로가 올바르지 않습니다: ${file.path}`);
    }
    seen.add(file.path);
    const path = resolve(directory, 'files', file.path);
    if (!(await lstat(path)).isFile()) throw new Error(`일반 파일이 아닙니다: ${file.path}`);
    const bytes = await readFile(path);
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`보관 파일이 변경되었습니다: ${file.path}`);
  }
  const actual = await walk(directory, 'files');
  if (actual.length !== manifest.files.length) throw new Error(`기록되지 않은 보관 파일이 있습니다: ${id}`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const [command, id, label, ref, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || (command === 'verify' && label)) throw new Error('불필요한 인자가 있습니다.');
    if (command === 'save') {
      const saved = await saveClassicVersion({ root, id, label, ref });
      console.log(`${id}: ${saved.files.length}개 파일 보관 · ${saved.label}`);
    } else if (command === 'verify') {
      const saved = await verifyClassicVersion({ root, id });
      console.log(`${id}: ${saved.files.length}개 파일 SHA-256 검증 통과`);
    } else {
      throw new Error('사용법: node scripts/classic-versions.mjs save v003 "설명" [Git ref] | verify v001');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
