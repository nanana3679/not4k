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
  it('v001~v005의 재생기·랙 에셋 주소는 모두 보관 파일에 연결되고 원본 코드·manifest는 공개하지 않는다', async () => {
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
