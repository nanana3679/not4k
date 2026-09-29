import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { classicVersionPreviewEntries, exportClassicVersionPreviews } from './classicVersionPreviews';
import { CLASSIC_NOTE_ASSET_VERSIONS } from '../src/lab/noteAssetDesigns';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('Classic 버전 Lab 공개', () => {
  it('v001~v010의 재생기·랙 에셋 주소는 모두 보관 파일에 연결되고 원본 코드·manifest는 공개하지 않는다', async () => {
    const entries = await classicVersionPreviewEntries(root);
    const paths = new Set(entries.map(entry => entry.pathname));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(entry => /\.(png|svg)$/.test(entry.pathname))).toBe(true);
    for (const { design } of CLASSIC_NOTE_ASSET_VERSIONS) {
      for (const path of [...Object.values(design.skinManifest!.assets).flat(), ...Object.values(design.points), ...design.bodies.map(asset => asset.src), ...design.terminals.map(asset => asset.src)]) {
        expect(paths.has(path), path).toBe(true);
      }
    }
    expect(entries.some(entry => entry.pathname.includes('/sources/') || entry.pathname.includes('manifest'))).toBe(false);
  });

  it('v003은 S05/D05 원본 바디·공용 터미널과 v002 고채도 포인트를 보관하고 기본 적용본은 v002로 유지한다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    for (const kind of ['single', 'double']) {
      const source = await archived('v003', `assets-lab/classic/sources/body-${kind}-bright.svg`);
      const image = await readFile(resolve(root, `lab/image-galleries/long-note-body-six-20260929/spectrum-${kind}-05-200x40.png`));
      expect(source.toString()).toContain(`data:image/png;base64,${image.toString('base64')}`);
      const body = await archived('v003', `public/skins/classic/body-${kind}.png`);
      expect(body).toEqual(await archived('v003', `public/skins/classic/terminal-${kind}-idle.png`));
      expect(body).not.toEqual(await archived('v002', `public/skins/classic/body-${kind}.png`));
      expect(await archived('v003', `public/skins/classic/note-${kind}.png`)).toEqual(await archived('v002', `public/skins/classic/note-${kind}.png`));
      expect(await readFile(resolve(root, `public/skins/classic/body-${kind}.png`))).toEqual(await archived('v002', `public/skins/classic/body-${kind}.png`));
    }
  });

  it('v004는 S05/D05 바디를 유지하고 포인트를 비교 페이지의 옅은 원본 SVG로 교체한다', async () => {
    for (const kind of ['single', 'double']) {
      const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
      const pointSource = await readFile(resolve(root, `assets-lab/classic/revisions/body-six-20260929/references/note-${kind}-readability-a.svg`));
      expect(await archived('v004', `assets-lab/classic/sources/point-${kind}.svg`)).toEqual(pointSource);
      expect(await archived('v004', `public/skins/classic/body-${kind}.png`)).toEqual(await archived('v003', `public/skins/classic/body-${kind}.png`));
      expect(await archived('v004', `public/skins/classic/note-${kind}.png`)).not.toEqual(await archived('v003', `public/skins/classic/note-${kind}.png`));
    }
  });

  it('v005는 v004의 S05/D05 바디를 그대로 보관하고 싱글·더블 포인트 외곽만 바꾼다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    for (const kind of ['single', 'double']) {
      expect(await archived('v005', `public/skins/classic/body-${kind}.png`)).toEqual(await archived('v004', `public/skins/classic/body-${kind}.png`));
      expect(await archived('v005', `public/skins/classic/terminal-${kind}-idle.png`)).toEqual(await archived('v004', `public/skins/classic/terminal-${kind}-idle.png`));
      expect(await archived('v005', `public/skins/classic/note-${kind}.png`)).not.toEqual(await archived('v004', `public/skins/classic/note-${kind}.png`));
    }
  });

  it('v006은 v005의 S05/D05 바디·터미널을 그대로 보관하고 포인트 양끝 안쪽의 어두운 패널만 중앙 면으로 덮으며 기본 적용본은 v002로 유지한다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    for (const kind of ['single', 'double']) {
      for (const path of [`body-${kind}.png`, `body-${kind}-held.png`, `terminal-${kind}.png`, `terminal-${kind}-idle.png`]) {
        expect(await archived('v006', `public/skins/classic/${path}`), path).toEqual(await archived('v005', `public/skins/classic/${path}`));
      }
      expect(await archived('v006', `public/skins/classic/note-${kind}.png`)).not.toEqual(await archived('v005', `public/skins/classic/note-${kind}.png`));
      const before = (await archived('v005', `assets-lab/classic/sources/point-${kind}.svg`)).toString();
      const after = (await archived('v006', `assets-lab/classic/sources/point-${kind}.svg`)).toString();
      expect(before).toContain('<rect x="221" y="34" width="618" height="151" fill="url(#readability-face)"/>');
      expect(after).toContain('<g data-readability="face" data-side-panels="bright" clip-path="url(#p-clip)">');
      expect(after).toContain('<rect x="118" y="34" width="824" height="151" fill="url(#readability-face)"/>');
      expect(after).toContain('<rect x="95" y="34" width="23" height="151" fill="url(#p-rail)"/>');
      expect(await readFile(resolve(root, `public/skins/classic/note-${kind}.png`))).toEqual(await archived('v002', `public/skins/classic/note-${kind}.png`));
    }
  });

  it('v007은 v006의 포인트·바디 원본에서 포인트 면만 흰빛으로 올리고 바디는 선형광 싱글 ×0.6·더블 ×0.36으로 낮추며 트릴·봄·버튼·기어·설정은 v006과 같다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    for (const path of ['note-trill.png', 'body-trill.png', 'terminal-trill.png', 'bomb-00.png', 'button-idle-1.png']) {
      expect((await archived('v007', `public/skins/classic/${path}`)).equals(await archived('v006', `public/skins/classic/${path}`)), path).toBe(true);
    }
    for (const path of ['public/gear/gear-frame.png', 'src/game/skin/skins.ts', 'assets-lab/classic/states.mjs', 'assets-lab/classic/bright-body.mjs']) {
      expect((await archived('v007', path)).equals(await archived('v006', path)), path).toBe(true);
    }
    for (const [kind, scale] of [['single', '0.6'], ['double', '0.36']]) {
      for (const path of [`note-${kind}.png`, `body-${kind}.png`, `body-${kind}-held.png`, `terminal-${kind}-idle.png`]) {
        expect((await archived('v007', `public/skins/classic/${path}`)).equals(await archived('v006', `public/skins/classic/${path}`)), path).toBe(false);
      }
      const point = (await archived('v007', `assets-lab/classic/sources/point-${kind}.svg`)).toString();
      expect(point).toContain('data-side-panels="bright" data-contrast-band="point-bright"');
      expect(point).toContain('<rect x="118" y="34" width="824" height="151" fill="url(#readability-face)"/>');
      expect((await archived('v007', `assets-lab/classic/sources/body-${kind}-bright.svg`)).toString()).toContain(`data-contrast-band="body-mid" data-linear-scale="${scale}"`);
      expect((await readFile(resolve(root, `public/skins/classic/body-${kind}.png`))).equals(await archived('v002', `public/skins/classic/body-${kind}.png`)), `현재 body-${kind}.png`).toBe(true);
    }
  });

  it('v008은 v007 흰빛 포인트와 v006 S05/D05 바디·터미널을 그대로 쓰고 위아래 5px 접촉 그림자 텍스처·설정만 더하며 현재 적용본에는 그림자를 추가하지 않는다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    const same = async (path: string, from: string) => expect((await archived('v008', path)).equals(await archived(from, path)), `${path} = ${from}`).toBe(true);
    for (const kind of ['single', 'double']) {
      await same(`public/skins/classic/note-${kind}.png`, 'v007');
      for (const path of [`body-${kind}.png`, `body-${kind}-held.png`, `body-${kind}-failed.png`, `terminal-${kind}.png`, `terminal-${kind}-idle.png`]) {
        await same(`public/skins/classic/${path}`, 'v006');
      }
    }
    for (const path of ['public/skins/classic/note-trill.png', 'public/skins/classic/point-shadow.png', 'public/skins/classic/bomb-00.png', 'assets-lab/classic/bright-body.mjs']) {
      await same(path, 'v007');
    }
    const shadow = await archived('v008', 'public/skins/classic/point-contact-shadow.png');
    expect([shadow.readUInt32BE(16), shadow.readUInt32BE(20)]).toEqual([200, 20]);
    expect((await archived('v008', 'assets-lab/classic/states.mjs')).toString()).toContain('pointContactShadow: \'point-contact-shadow\'');
    const config = (await archived('v008', 'src/game/skin/skins.ts')).toString();
    expect(config).toContain('pointContactShadow: { above: 5, below: 5 }');
    expect(config).toContain('pointContactShadow: withPublicBase("/skins/classic/point-contact-shadow.png")');
    await expect(access(resolve(root, 'public/skins/classic/point-contact-shadow.png'))).rejects.toThrow();
  });

  it('v009는 v008의 흰빛 포인트·접촉 그림자·트릴을 그대로 쓰고 바디 원본만 트렌치 imagegen 타일로 바꾸며 현재 적용본 바디는 v002로 유지한다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    const same = async (path: string) => expect((await archived('v009', path)).equals(await archived('v008', path)), `${path} = v008`).toBe(true);
    for (const path of ['note-single.png', 'note-double.png', 'note-trill.png', 'body-trill.png', 'point-contact-shadow.png', 'point-shadow.png', 'bomb-00.png']) {
      await same(`public/skins/classic/${path}`);
    }
    for (const path of ['assets-lab/classic/states.mjs', 'assets-lab/classic/bright-body.mjs', 'src/game/skin/skins.ts']) await same(path);
    for (const kind of ['single', 'double']) {
      const tile = await readFile(resolve(root, `assets-lab/classic/revisions/body-trench-20260930/tiles/trench-${kind}-1000x200.png`));
      const source = (await archived('v009', `assets-lab/classic/sources/body-${kind}-bright.svg`)).toString();
      expect(source).toContain('data-artwork="bright-body-20260929" data-design="trench-imagegen-20260930"');
      expect(source).toContain(`data:image/png;base64,${tile.toString('base64')}`);
      for (const path of [`body-${kind}.png`, `body-${kind}-held.png`, `terminal-${kind}-idle.png`]) {
        expect((await archived('v009', `public/skins/classic/${path}`)).equals(await archived('v008', `public/skins/classic/${path}`)), path).toBe(false);
      }
      expect((await readFile(resolve(root, `public/skins/classic/body-${kind}.png`))).equals(await archived('v002', `public/skins/classic/body-${kind}.png`)), `현재 body-${kind}.png`).toBe(true);
    }
  });

  it('v010은 v009에서 트릴 끝 터미널 대기·켜짐·실패만 Simple처럼 어두운 마름모로 바꾸고 트릴 포인트·바디와 나머지 에셋은 v009와 같다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    const changed = new Set(['terminal-trill.png', 'terminal-trill-idle.png', 'terminal-trill-failed.png']);
    for (const path of ['note-trill.png', 'note-trill-failed.png', 'body-trill.png', 'body-trill-held.png', 'body-trill-failed.png', 'note-single.png', 'body-double.png', 'terminal-single.png', 'point-contact-shadow.png', ...changed]) {
      expect((await archived('v010', `public/skins/classic/${path}`)).equals(await archived('v009', `public/skins/classic/${path}`)), path).toBe(!changed.has(path));
    }
    const idle = (await archived('v010', 'assets-lab/classic/sources/terminal-end-trill.svg')).toString();
    const on = (await archived('v010', 'assets-lab/classic/sources/terminal-end-trill-on.svg')).toString();
    const failed = (await archived('v010', 'assets-lab/classic/sources/terminal-end-trill-failed.svg')).toString();
    for (const source of [idle, on, failed]) expect(source).toContain('data-tone="dark-diamond"');
    for (const source of [idle, on]) expect(source).toContain('fill="#6a6a6e"');
    expect(failed).toContain('fill="#3b3b3b"');
    expect((await archived('v010', 'public/skins/classic/terminal-trill.png')).equals(await archived('v010', 'public/skins/classic/terminal-trill-idle.png'))).toBe(true);
    expect((await readFile(resolve(root, 'public/skins/classic/terminal-trill-idle.png'))).equals(await archived('v002', 'public/skins/classic/terminal-trill-idle.png')), '현재 적용본 트릴 터미널').toBe(true);
  });

  it('v001만 정적 내보내면 PNG 바이트를 보존하고 v002·생성 코드는 포함하지 않는다', async () => {
    const output = await mkdtemp(resolve(tmpdir(), 'not4k-classic-preview-'));
    temporaryDirectories.push(output);
    await exportClassicVersionPreviews(root, output, ['v001']);
    const exported = await readFile(resolve(output, 'lab/skin-versions/classic/v001/skin/note-single.png'));
    const archived = await readFile(resolve(root, 'assets-lab/classic/versions/v001/files/public/skins/classic/note-single.png'));
    expect(exported).toEqual(archived);
    await expect(access(resolve(output, 'lab/skin-versions/classic/v002'))).rejects.toThrow();
    await expect(access(resolve(output, 'assets-lab'))).rejects.toThrow();
  });
});
