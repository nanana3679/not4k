import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { findCurrentClassicVersion, saveClassicVersion, verifyClassicVersion } from './classic-versions.ts';

const temporaryRoots: string[] = [];
const runtimePath = 'public/skins/classic/note-single.png';
const archive = (root: string, id: string) => join(root, 'assets-lab/classic/versions', id);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'not4k-classic-versions-'));
  temporaryRoots.push(root);
  for (const path of [
    'assets-lab/classic/README.md', 'assets-lab/classic/bomb-export.html',
    'assets-lab/classic/states.mjs', 'assets-lab/classic/sources/point-single.svg',
    runtimePath, 'public/lab/note-assets/classic/note-single.svg',
    'scripts/build-classic-skin.ts', 'src/game/skin/skins.ts', 'src/game/skin/types.ts',
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

  it('빌드 스크립트가 build-classic-skin.mjs였던 이전 커밋을 Git ref로 보관하면 .mjs 이름 그대로 v001에 담는다', async () => {
    const root = await fixture();
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Asset test', '-c', 'user.email=assets@example.invalid', ...args], { cwd: root });
    git('mv', 'scripts/build-classic-skin.ts', 'scripts/build-classic-skin.mjs');
    git('commit', '-qm', 'old name');
    const oldCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    git('mv', 'scripts/build-classic-skin.mjs', 'scripts/build-classic-skin.ts');
    git('commit', '-qm', 'new name');
    const saved = await saveClassicVersion({ root, id: 'v001', label: '이전 이름', ref: oldCommit });
    const paths = saved.files.map(file => file.path);
    expect(paths).toContain('scripts/build-classic-skin.mjs');
    expect(paths).not.toContain('scripts/build-classic-skin.ts');
    expect((await verifyClassicVersion({ root, id: 'v001' })).id).toBe('v001');
  });

  it('빌드 스크립트가 .ts·.mjs 어느 이름으로도 없는 커밋을 Git ref로 보관하면 "필수 보관 자료가 없습니다: scripts/build-classic-skin.ts"로 멈추고 v001을 남기지 않는다', async () => {
    const root = await fixture();
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Asset test', '-c', 'user.email=assets@example.invalid', ...args], { cwd: root });
    git('rm', '-q', 'scripts/build-classic-skin.ts');
    git('commit', '-qm', 'no build script');
    await expect(saveClassicVersion({ root, id: 'v001', label: '빌드 스크립트 없음', ref: 'HEAD' }))
      .rejects.toThrow('필수 보관 자료가 없습니다: scripts/build-classic-skin.ts');
    await expect(access(archive(root, 'v001'))).rejects.toThrow();
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
    await rm(join(root, 'scripts/build-classic-skin.ts'));
    await expect(saveClassicVersion({ root, id: 'v001', label: '이전' })).rejects.toThrow();
    await expect(access(archive(root, 'v001'))).rejects.toThrow();
  });

  it('public/skins/classic 폴더 자체가 심볼릭 링크면 작업본 보관을 거부하고 미완성 v002를 남기지 않는다', async () => {
    const root = await fixture();
    await rename(join(root, 'public/skins/classic'), join(root, 'outside-classic'));
    await symlink(join(root, 'outside-classic'), join(root, 'public/skins/classic'), 'dir');
    await expect(saveClassicVersion({ root, id: 'v002', label: '링크' })).rejects.toThrow('심볼릭 링크는 보관하지 않습니다: public/skins/classic');
    await expect(access(archive(root, 'v002'))).rejects.toThrow();
  });

  it('../outside 버전 ID는 보관 폴더 밖에 쓰지 않고 거부한다', async () => {
    const root = await fixture();
    await expect(saveClassicVersion({ root, id: '../outside', label: '잘못된 ID' })).rejects.toThrow('버전 ID');
    await expect(access(join(root, 'assets-lab/classic/outside'))).rejects.toThrow();
  });

  it('v001 manifest에서 README.md의 sha256을 "abc"로 바꾸면 verify가 "보관 해시가 올바르지 않습니다: v001 assets-lab/classic/README.md" 오류로 멈춘다', async () => {
    const root = await fixture();
    await saveClassicVersion({ root, id: 'v001', label: '이전' });
    const manifestPath = join(archive(root, 'v001'), 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.files.find((file: { path: string }) => file.path === 'assets-lab/classic/README.md').sha256 = 'abc';
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(verifyClassicVersion({ root, id: 'v001' })).rejects.toThrow('보관 해시가 올바르지 않습니다: v001 assets-lab/classic/README.md');
  });

  it('v001 manifest.json이 JSON이 아니면 verify가 "버전 정보가 올바르지 않습니다: v001" 오류로 멈춘다', async () => {
    const root = await fixture();
    await saveClassicVersion({ root, id: 'v001', label: '이전' });
    await writeFile(join(archive(root, 'v001'), 'manifest.json'), '{ broken');
    await expect(verifyClassicVersion({ root, id: 'v001' })).rejects.toThrow('버전 정보가 올바르지 않습니다: v001');
  });
});

// 게임 PNG는 작업본이 아니라 변하지 않는 v014 보관 PNG를 복사해, 새 버전을 적용해도 이 픽스처를 쓰는 테스트는 깨지지 않는다.
// 보관본은 실제 manifest.json만 복사한다. 보관 파일(files/)은 비교에 쓰지 않는다.
const v014RuntimeDirectory = join(archive(repositoryRoot, 'v014'), 'files/public/skins/classic');

async function currentFixture(ids: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'not4k-classic-current-'));
  temporaryRoots.push(root);
  await cp(v014RuntimeDirectory, join(root, 'public/skins/classic'), { recursive: true });
  for (const id of ids) {
    await mkdir(archive(root, id), { recursive: true });
    await cp(join(archive(repositoryRoot, id), 'manifest.json'), join(archive(root, id), 'manifest.json'));
  }
  return root;
}

async function fakeVersion(root: string, id: string, files: Record<string, string>) {
  await mkdir(archive(root, id), { recursive: true });
  const manifest = {
    schemaVersion: 1, skin: 'classic', id, label: id,
    files: Object.entries(files).map(([path, text]) => ({ path, bytes: text.length, sha256: sha256(text) })),
  };
  await writeFile(join(archive(root, id), 'manifest.json'), JSON.stringify(manifest));
}

async function fakeRoot(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'not4k-classic-current-'));
  temporaryRoots.push(root);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

async function runCli(root: string, ...args: string[]) {
  const script = join(root, 'scripts/classic-versions.ts');
  await mkdir(dirname(script), { recursive: true });
  await cp(join(repositoryRoot, 'scripts/classic-versions.ts'), script);
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 30_000 });
}

describe('Classic 현재 적용본 판별 (current)', () => {
  // 의도된 실패: 게임 PNG(public/skins/classic)를 바꾸고 새 버전을 save하지 않으면 이 테스트가 깨진다.
  // 새 PNG를 확정했다면 save로 새 번호를 보관하고 기대 버전을 그 번호로 바꾼다.
  it('현재 저장소의 게임 PNG 60개는 v014 보관본과 모두 같아 v014가 첫 일치 버전이다', async () => {
    const result = await findCurrentClassicVersion({ root: repositoryRoot });
    expect(result.pngFiles).toBe(60);
    expect(result.matches[0]).toBe('v014');
    expect(result.compared.id).toBe('v014');
    expect(result.compared.pngDiffs).toEqual([]);
  });

  it('게임 PNG note-single.png 1바이트를 바꾸면 일치 버전이 없고 가장 가까운 v014(v013은 2개 차이)와 다른 그 경로 1개만 보고한다', async () => {
    const root = await currentFixture(['v013', 'v014']);
    const bytes = await readFile(join(root, runtimePath));
    bytes[bytes.length - 1] ^= 0xff;
    await writeFile(join(root, runtimePath), bytes);
    const result = await findCurrentClassicVersion({ root });
    expect(result.matches).toEqual([]);
    expect(result.compared.id).toBe('v014');
    expect(result.compared.pngDiffs).toEqual([runtimePath]);
  });

  it('보관본에 없는 extra.png가 게임 PNG 폴더에 더 있으면 일치 버전이 없고 그 경로를 차이로 보고한다', async () => {
    const root = await currentFixture(['v013', 'v014']);
    await writeFile(join(root, 'public/skins/classic/extra.png'), 'extra');
    const result = await findCurrentClassicVersion({ root });
    expect(result.matches).toEqual([]);
    expect(result.compared.id).toBe('v014');
    expect(result.compared.pngDiffs).toEqual(['public/skins/classic/extra.png']);
  });

  it('게임 PNG note-single.png가 작업본에서 빠지면 일치 버전이 없고 빠진 경로를 차이로 보고한다', async () => {
    const root = await currentFixture(['v014']);
    await rm(join(root, runtimePath));
    const result = await findCurrentClassicVersion({ root });
    expect(result.matches).toEqual([]);
    expect(result.compared.pngDiffs).toEqual([runtimePath]);
  });

  it('v999·v1000이 PNG 1개씩 똑같이 다르면 번호가 큰 v1000을 가장 가까운 버전으로 고른다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current' });
    await fakeVersion(root, 'v003', { [runtimePath]: 'old', 'public/skins/classic/gone.png': 'gone' });
    await fakeVersion(root, 'v999', { [runtimePath]: 'nine' });
    await fakeVersion(root, 'v1000', { [runtimePath]: 'thousand' });
    const result = await findCurrentClassicVersion({ root });
    expect(result.matches).toEqual([]);
    expect(result.compared).toMatchObject({ id: 'v1000', pngDiffs: [runtimePath] });
  });

  it('v012·v013이 모두 PNG가 같으면 v013·v012 순으로 모두 반환하고 manifest 없는 v016 폴더와 drafts 폴더는 무시한다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current' });
    await fakeVersion(root, 'v012', { [runtimePath]: 'current' });
    await fakeVersion(root, 'v013', { [runtimePath]: 'current' });
    await mkdir(archive(root, 'v016'), { recursive: true });
    await mkdir(archive(root, 'drafts'), { recursive: true });
    await writeFile(join(root, 'assets-lab/classic/versions/README.md'), '# 보관');
    const result = await findCurrentClassicVersion({ root });
    expect(result.matches).toEqual(['v013', 'v012']);
    expect(result.compared.id).toBe('v013');
  });

  it('PNG가 일치한 v001에서 package.json 내용이 다르고 gone.mjs가 작업본에 없으면 두 경로만 그 밖의 차이로 보고하고 같은 skins.ts는 뺀다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current', 'package.json': 'new', 'src/game/skin/skins.ts': 'same' });
    await fakeVersion(root, 'v001', {
      [runtimePath]: 'current', 'package.json': 'old', 'src/game/skin/skins.ts': 'same', 'assets-lab/classic/gone.mjs': 'gone',
    });
    const result = await findCurrentClassicVersion({ root });
    expect(result.matches).toEqual(['v001']);
    expect(result.compared).toEqual({ id: 'v001', pngDiffs: [], otherDiffs: ['assets-lab/classic/gone.mjs', 'package.json'] });
  });

  it('v001 보관 뒤 작업본에 sources/brand-new.svg가 추가되면 보관본에 없는 그 경로를 그 밖의 차이로 보고하고 같은 old.svg는 뺀다', async () => {
    const root = await fakeRoot({
      [runtimePath]: 'current',
      'assets-lab/classic/sources/old.svg': 'old',
      'assets-lab/classic/sources/brand-new.svg': 'new',
    });
    await fakeVersion(root, 'v001', { [runtimePath]: 'current', 'assets-lab/classic/sources/old.svg': 'old' });
    const result = await findCurrentClassicVersion({ root });
    expect(result.matches).toEqual(['v001']);
    expect(result.compared.otherDiffs).toEqual(['assets-lab/classic/sources/brand-new.svg']);
  });

  it('v001 보관 뒤 Lab SVG note-new.svg와 생성기 extra.mjs가 작업본에 추가되면 두 경로를 그 밖의 차이로 보고한다', async () => {
    const root = await fakeRoot({
      [runtimePath]: 'current',
      'public/lab/note-assets/classic/note-new.svg': 'new',
      'assets-lab/classic/extra.mjs': 'generator',
    });
    await fakeVersion(root, 'v001', { [runtimePath]: 'current' });
    const result = await findCurrentClassicVersion({ root });
    expect(result.compared.otherDiffs).toEqual(['assets-lab/classic/extra.mjs', 'public/lab/note-assets/classic/note-new.svg']);
  });

  it('v001·v0001처럼 번호 값이 같은 두 버전이 모두 일치하면 문자열 역순으로 v001·v0001을 반환하고 v001을 비교 대상으로 고른다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current' });
    await fakeVersion(root, 'v0001', { [runtimePath]: 'current' });
    await fakeVersion(root, 'v001', { [runtimePath]: 'current' });
    const result = await findCurrentClassicVersion({ root });
    expect(result.matches).toEqual(['v001', 'v0001']);
    expect(result.compared.id).toBe('v001');
  });

  it('게임 PNG 폴더 안에 link.png 심볼릭 링크가 있으면 "게임 PNG 폴더에 심볼릭 링크가 있어 비교할 수 없습니다: public/skins/classic/link.png" 오류로 멈춘다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current' });
    await fakeVersion(root, 'v014', { [runtimePath]: 'current' });
    await symlink(join(root, runtimePath), join(root, 'public/skins/classic/link.png'));
    const error = await findCurrentClassicVersion({ root }).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('게임 PNG 폴더에 심볼릭 링크가 있어 비교할 수 없습니다: public/skins/classic/link.png');
  });

  it('Lab SVG 폴더 안에 link.svg 심볼릭 링크가 있으면 "심볼릭 링크가 있어 비교할 수 없습니다: public/lab/note-assets/classic/link.svg" 오류로 멈춘다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current', 'public/lab/note-assets/classic/note-single.svg': 'svg' });
    await fakeVersion(root, 'v014', { [runtimePath]: 'current' });
    await symlink(join(root, 'public/lab/note-assets/classic/note-single.svg'), join(root, 'public/lab/note-assets/classic/link.svg'));
    const error = await findCurrentClassicVersion({ root }).catch((caught: Error) => caught);
    expect((error as Error).message).toBe('심볼릭 링크가 있어 비교할 수 없습니다: public/lab/note-assets/classic/link.svg');
  });

  it('public/skins/classic 폴더가 없으면 "게임 PNG 폴더가 없습니다: public/skins/classic" 오류로 멈춘다', async () => {
    const root = await fakeRoot({ 'package.json': 'current' });
    await fakeVersion(root, 'v014', { [runtimePath]: 'current' });
    await expect(findCurrentClassicVersion({ root })).rejects.toThrow('게임 PNG 폴더가 없습니다: public/skins/classic');
  });

  it('v015의 manifest.json이 JSON이 아니면 "버전 정보가 올바르지 않습니다: v015" 오류로 멈춘다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current' });
    await fakeVersion(root, 'v014', { [runtimePath]: 'current' });
    await mkdir(archive(root, 'v015'), { recursive: true });
    await writeFile(join(archive(root, 'v015'), 'manifest.json'), '{ broken');
    await expect(findCurrentClassicVersion({ root })).rejects.toThrow('버전 정보가 올바르지 않습니다: v015');
  });

  it('보관 버전 폴더가 하나도 없으면 "보관된 Classic 버전이 없습니다." 오류로 멈춘다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current', 'assets-lab/classic/versions/README.md': '# 보관' });
    await expect(findCurrentClassicVersion({ root })).rejects.toThrow('보관된 Classic 버전이 없습니다.');
  });

  it('assets-lab/classic/versions 폴더 자체가 없으면 "보관된 Classic 버전이 없습니다." 오류로 멈춘다', async () => {
    const root = await fakeRoot({ [runtimePath]: 'current' });
    await expect(findCurrentClassicVersion({ root })).rejects.toThrow('보관된 Classic 버전이 없습니다.');
  });

  it('CLI current는 게임 PNG가 v014와 같으면 종료 코드 0으로 "v014 보관본과 일치 (60개 파일)"과 그 밖의 다른 파일 목록을 출력한다', async () => {
    const root = await currentFixture(['v013', 'v014']);
    const run = await runCli(root, 'current');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('게임 PNG(public/skins/classic): v014 보관본과 일치 (60개 파일)');
    expect(run.stdout).toContain('원본·설정 등 그 밖의 보관 파일: v014 보관본과 다른 파일');
    expect(run.stdout).toContain('\n  package.json\n');
  });

  it('CLI current는 일치 버전이 없으면 종료 코드 1로 가장 가까운 v014와 다른 PNG 1개 경로를 출력한다', async () => {
    const root = await currentFixture(['v013', 'v014']);
    const bytes = await readFile(join(root, runtimePath));
    bytes[0] ^= 0xff;
    await writeFile(join(root, runtimePath), bytes);
    const run = await runCli(root, 'current');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(`게임 PNG(public/skins/classic): 일치하는 보관 버전 없음. 가장 가까운 v014 보관본과 다른 파일 1개:\n  ${runtimePath}\n`);
  });

  it('CLI current 뒤에 v014 인자를 더 주면 "불필요한 인자가 있습니다." 오류와 종료 코드 1로 끝난다', async () => {
    const root = await currentFixture(['v014']);
    const run = await runCli(root, 'current', 'v014');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('불필요한 인자가 있습니다.');
    expect(run.stdout).toBe('');
  });
});
