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
  it('v001·v002·v012의 재생기·랙 에셋 주소는 모두 보관 파일에 연결되고 원본 코드·manifest는 공개하지 않는다', async () => {
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

  it('v012는 흰빛 포인트·트렌치 바디·위아래 5px 접촉 그림자·에디터와 같은 회색 마름모 트릴 끝 터미널을 보관하고 현재 적용본은 v002로 유지한다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    const text = async (path: string) => (await archived('v012', path)).toString();
    for (const kind of ['single', 'double']) {
      expect(await text(`assets-lab/classic/sources/point-${kind}.svg`)).toContain('data-side-panels="bright" data-contrast-band="point-bright"');
      const tile = await readFile(resolve(root, `assets-lab/classic/revisions/body-trench-20260930/tiles/trench-${kind}-1000x200.png`));
      const body = await text(`assets-lab/classic/sources/body-${kind}-bright.svg`);
      expect(body).toContain('data-artwork="bright-body-20260929" data-design="trench-imagegen-20260930"');
      expect(body).toContain(`data:image/png;base64,${tile.toString('base64')}`);
      for (const path of [`note-${kind}.png`, `body-${kind}.png`]) {
        expect((await readFile(resolve(root, `public/skins/classic/${path}`))).equals(await archived('v002', `public/skins/classic/${path}`)), `현재 ${path}는 v002`).toBe(true);
      }
    }
    const config = await text('src/game/skin/skins.ts');
    expect(config).toContain('pointContactShadow: { above: 5, below: 5 }');
    expect(config).toContain('pointContactShadow: withPublicBase("/skins/classic/point-contact-shadow.png")');
    expect(await text('assets-lab/classic/states.mjs')).toContain("pointContactShadow: 'point-contact-shadow'");
    const shadow = await archived('v012', 'public/skins/classic/point-contact-shadow.png');
    expect([shadow.readUInt32BE(16), shadow.readUInt32BE(20)]).toEqual([200, 20]);
    await expect(access(resolve(root, 'public/skins/classic/point-contact-shadow.png'))).rejects.toThrow();

    const editor = (await readFile(resolve(root, 'src/editor/timeline/NoteRenderer.ts'))).toString();
    const editorFill = /if \(note\.type === "trillLong"\) \{\s*const cx[\s\S]*?end\.fill\(0x([0-9a-f]{6})\)/.exec(editor)?.[1];
    expect(editorFill).toBe('888888');
    for (const name of ['terminal-end-trill', 'terminal-end-trill-on', 'terminal-end-trill-failed']) {
      const source = await text(`assets-lab/classic/sources/${name}.svg`);
      expect(source).toContain(`<path d="M0 100 500 0 1000 100 500 200Z" fill="#${editorFill}"/>`);
      expect(source).not.toContain('<linearGradient');
    }
    const [on, idle, failed] = await Promise.all(['terminal-trill.png', 'terminal-trill-idle.png', 'terminal-trill-failed.png'].map(path => archived('v012', `public/skins/classic/${path}`)));
    expect(idle.equals(on) && idle.equals(failed)).toBe(true);
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
