import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveClassicVersion, verifyClassicVersion } from './classic-versions.mjs';

const temporaryRoots: string[] = [];
const runtimePath = 'public/skins/classic/note-single.png';
const archive = (root: string, id: string) => join(root, 'assets-lab/classic/versions', id);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'not4k-classic-versions-'));
  temporaryRoots.push(root);
  for (const path of [
    'assets-lab/classic/README.md', 'assets-lab/classic/bomb-export.html',
    'assets-lab/classic/states.mjs', 'assets-lab/classic/sources/point-single.svg',
    runtimePath, 'public/lab/note-assets/classic/note-single.svg',
    'scripts/build-classic-skin.mjs', 'src/game/skin/skins.ts', 'src/game/skin/types.ts',
    'src/shared/publicPath.ts', 'src/lab/noteAssetKeybomb.css', 'src/lab/keybombEffect.ts',
    'public/gear/gear-frame.png', 'public/gear/gear-gauge-left.png', 'public/gear/gear-gauge-right.png',
    'package.json', 'pnpm-lock.yaml',
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), 'previous');
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Asset test', '-c', 'user.email=assets@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Classic 버전 보관', () => {
  it('작업본이 바뀌어도 v001은 Git의 이전 PNG를, v002는 미커밋 PNG와 새 생성기를 보관한다', async () => {
    const root = await fixture();
    await writeFile(join(root, runtimePath), 'selected');
    await writeFile(join(root, 'assets-lab/classic/bright-body.mjs'), 'new generator');
    await saveClassicVersion({ root, id: 'v001', label: '이전', ref: 'HEAD' });
    await saveClassicVersion({ root, id: 'v002', label: '현재' });
    expect(await readFile(join(archive(root, 'v001'), 'files', runtimePath), 'utf8')).toBe('previous');
    expect(await readFile(join(archive(root, 'v002'), 'files', runtimePath), 'utf8')).toBe('selected');
    expect(await readFile(join(archive(root, 'v002'), 'files/assets-lab/classic/bright-body.mjs'), 'utf8')).toBe('new generator');
    expect(await readFile(join(root, runtimePath), 'utf8')).toBe('selected');
    expect((await verifyClassicVersion({ root, id: 'v001' })).source.kind).toBe('git');
    expect((await verifyClassicVersion({ root, id: 'v002' })).source.kind).toBe('worktree');
  });

  it('v001이 이미 있으면 덮어쓰기를 거부하고 기존 PNG와 manifest를 보존한다', async () => {
    const root = await fixture();
    await saveClassicVersion({ root, id: 'v001', label: '이전' });
    const before = await readFile(join(archive(root, 'v001'), 'manifest.json'));
    await writeFile(join(root, runtimePath), 'replacement');
    await expect(saveClassicVersion({ root, id: 'v001', label: '덮어쓰기' })).rejects.toThrow();
    expect(await readFile(join(archive(root, 'v001'), 'manifest.json'))).toEqual(before);
    expect(await readFile(join(archive(root, 'v001'), 'files', runtimePath), 'utf8')).toBe('previous');
  });

  it('보관된 PNG의 내용이 바뀌면 SHA-256 검증이 해당 경로를 보고한다', async () => {
    const root = await fixture();
    await saveClassicVersion({ root, id: 'v001', label: '이전' });
    await writeFile(join(archive(root, 'v001'), 'files', runtimePath), 'changed');
    await expect(verifyClassicVersion({ root, id: 'v001' })).rejects.toThrow(runtimePath);
  });

  it('필수 생성기 파일이 없으면 미완성 v001을 남기지 않는다', async () => {
    const root = await fixture();
    await rm(join(root, 'scripts/build-classic-skin.mjs'));
    await expect(saveClassicVersion({ root, id: 'v001', label: '이전' })).rejects.toThrow();
    await expect(access(archive(root, 'v001'))).rejects.toThrow();
  });

  it('../outside 버전 ID는 보관 폴더 밖에 쓰지 않고 거부한다', async () => {
    const root = await fixture();
    await expect(saveClassicVersion({ root, id: '../outside', label: '잘못된 ID' })).rejects.toThrow('버전 ID');
    await expect(access(join(root, 'assets-lab/classic/outside'))).rejects.toThrow();
  });
});
