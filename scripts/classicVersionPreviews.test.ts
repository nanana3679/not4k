import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { classicVersionPreviewEntries, exportClassicVersionPreviews } from './classicVersionPreviews';
import { CLASSIC_NOTE_ASSET_VERSIONS } from '../src/lab/noteAssetDesigns';
import { COLORS as EDITOR_COLORS } from '../src/editor/timeline/constants';
import { getSkinManifest } from '../src/game/skin/skins';
import { CLASSIC_SKIN_VERSIONS } from '../src/lab/classicSkinVersions';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('Classic 버전 Lab 공개', () => {
  it('v001·v002·v012의 재생기·랙 에셋 주소는 공통 기어만 빼고 모두 보관 파일에 연결되고 원본 코드·manifest는 공개하지 않는다', async () => {
    const entries = await classicVersionPreviewEntries(root);
    const paths = new Set(entries.map(entry => entry.pathname));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(entry => /\.(png|svg)$/.test(entry.pathname))).toBe(true);
    for (const { design } of CLASSIC_NOTE_ASSET_VERSIONS) {
      const { gearFrame, ...skinAssets } = design.skinManifest!.assets;
      // 보관본도 지금 공통 기어로 재생한다(렌더러 배치가 이 그림의 측정값을 따른다).
      expect(gearFrame).toBe('/gear/classic-gear.png');
      expect(design.skinManifest!.assets).not.toHaveProperty('gearGaugeLeft');
      for (const path of [...Object.values(skinAssets).flat(), ...Object.values(design.points), ...design.bodies.map(asset => asset.src), ...design.terminals.map(asset => asset.src)]) {
        expect(paths.has(path), path).toBe(true);
      }
    }
    expect(entries.some(entry => entry.pathname.includes('/sources/') || entry.pathname.includes('manifest'))).toBe(false);
  });

  it('보관본에 기록으로 남은 옛 기어·기둥 게이지(public/gear/)는 정적 내보내기에 넣지 않는다', async () => {
    const entries = await classicVersionPreviewEntries(root, ['v014']);
    expect(entries.some(entry => entry.pathname.includes('/gear/'))).toBe(false);
  });

  it('v012는 흰빛 포인트·트렌치 바디·위아래 5px 접촉 그림자·에디터와 같은 회색 마름모 트릴 끝 터미널을 보관한다', async () => {
    const archived = (id: string, path: string) => readFile(resolve(root, 'assets-lab/classic/versions', id, 'files', path));
    const text = async (path: string) => (await archived('v012', path)).toString();
    for (const kind of ['single', 'double']) {
      expect(await text(`assets-lab/classic/sources/point-${kind}.svg`)).toContain('data-side-panels="bright" data-contrast-band="point-bright"');
      const tile = await readFile(resolve(root, `assets-lab/classic/revisions/body-trench-20260930/tiles/trench-${kind}-1000x200.png`));
      const body = await text(`assets-lab/classic/sources/body-${kind}-bright.svg`);
      expect(body).toContain('data-artwork="bright-body-20260929" data-design="trench-imagegen-20260930"');
      expect(body).toContain(`data:image/png;base64,${tile.toString('base64')}`);
    }
    const config = await text('src/game/skin/skins.ts');
    expect(config).toContain('pointContactShadow: { above: 5, below: 5 }');
    expect(config).toContain('pointContactShadow: withPublicBase("/skins/classic/point-contact-shadow.png")');
    expect(await text('assets-lab/classic/states.mjs')).toContain("pointContactShadow: 'point-contact-shadow'");
    const shadow = await archived('v012', 'public/skins/classic/point-contact-shadow.png');
    expect([shadow.readUInt32BE(16), shadow.readUInt32BE(20)]).toEqual([200, 20]);

    const editorFill = EDITOR_COLORS.TRILL_LONG_END.toString(16).padStart(6, '0');
    expect(editorFill).toBe('888888');
    for (const name of ['terminal-end-trill', 'terminal-end-trill-on', 'terminal-end-trill-failed']) {
      const source = await text(`assets-lab/classic/sources/${name}.svg`);
      expect(source).toContain(`<path d="M0 100 500 0 1000 100 500 200Z" fill="#${editorFill}"/>`);
      expect(source).not.toContain('<linearGradient');
    }
    const [on, idle, failed] = await Promise.all(['terminal-trill.png', 'terminal-trill-idle.png', 'terminal-trill-failed.png'].map(path => archived('v012', `public/skins/classic/${path}`)));
    expect(idle.equals(on) && idle.equals(failed)).toBe(true);
  });

  it('현재 적용본은 v014다: 게임 PNG 60개가 v014 보관본과 같고 현재 스킨 설정과 등록 매니페스트가 트릴 마름모 접촉 그림자까지 같게 선언하며 v013과는 트릴 켜짐 바디만 다르다', async () => {
    const versionRoot = resolve(root, 'assets-lab/classic/versions/v014');
    const manifest = JSON.parse(await readFile(resolve(versionRoot, 'manifest.json'), 'utf8')) as { files: { path: string }[] };
    const pngs = manifest.files.filter(file => file.path.startsWith('public/skins/classic/'));
    expect(pngs).toHaveLength(60);
    for (const { path } of pngs) {
      expect((await readFile(resolve(root, path))).equals(await readFile(resolve(versionRoot, 'files', path))), `현재 ${path}는 v014`).toBe(true);
    }
    const changedFromV013: string[] = [];
    for (const { path } of pngs) {
      if (!(await readFile(resolve(root, path))).equals(await readFile(resolve(root, 'assets-lab/classic/versions/v013/files', path)))) changedFromV013.push(path);
    }
    expect(changedFromV013).toEqual(['public/skins/classic/body-trill-held.png']);
    const current = getSkinManifest('classic');
    const registered = CLASSIC_SKIN_VERSIONS.find(version => version.id === 'v014')!.manifest;
    expect(registered.theme).toEqual(current.theme);
    // 스킨 공통 기어는 버전에 속하지 않는다. v014 보관 당시의 옛 기어·게이지 기록만 다르고 나머지 에셋은 같다.
    const { gearFrame: archivedGear, gearGaugeLeft, gearGaugeRight, ...registeredSkinAssets } = registered.assets;
    const { gearFrame: currentGear, ...currentSkinAssets } = current.assets;
    expect([archivedGear, gearGaugeLeft, gearGaugeRight]).toEqual(['/gear/gear-frame.png', '/gear/gear-gauge-left.png', '/gear/gear-gauge-right.png']);
    expect(currentGear).toBe('/gear/classic-gear.png');
    expect(registeredSkinAssets).toEqual(currentSkinAssets);
    expect(current.theme.pointContactShadow).toEqual({ above: 5, below: 5 });
    expect(current.assets.pointContactShadowTrill).toBe('/skins/classic/point-contact-shadow-trill.png');
    const trill = await readFile(resolve(root, 'public/skins/classic/point-contact-shadow-trill.png'));
    expect([trill.readUInt32BE(16), trill.readUInt32BE(20)]).toEqual([200, 60]);
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
