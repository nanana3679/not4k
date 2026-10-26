import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const here = new URL('./', import.meta.url);
const root = new URL('../../../../', here);
const archive = JSON.parse(readFileSync(new URL('source-archive.json', here), 'utf8')) as {
  sourceCommit: string; sourcePullRequest: number; directory: string;
  files: { path: string; bytes: number; sha256: string }[];
};

it('#339 보존본 132개와 에셋 126개는 최신 도안과 경로를 분리하고 e563cb5d의 파일 목록·해시·바이트 수를 유지한다', () => {
  expect(archive.sourceCommit).toBe('e563cb5d48580db81e8bc3483d2563bee2410a56');
  expect(archive.sourcePullRequest).toBe(339);
  expect(archive.directory).toBe('assets-lab/classic/revisions/approved-notes-20261025');
  expect(archive.files).toHaveLength(132);
  const directory = new URL(`${archive.directory}/`, root);
  const actualPaths = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => relative(fileURLToPath(root), join(entry.parentPath, entry.name))).sort();
  expect(actualPaths).toEqual(archive.files.map(file => file.path).sort());
  for (const file of archive.files) {
    const bytes = readFileSync(new URL(file.path, root));
    expect(bytes.length, file.path).toBe(file.bytes);
    expect(createHash('sha256').update(bytes).digest('hex'), file.path).toBe(file.sha256);
  }
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as { assets: { file: string }[] };
  expect(manifest.assets).toHaveLength(126);
  expect(new Set(manifest.assets.map(asset => asset.file)).size).toBe(126);
});
