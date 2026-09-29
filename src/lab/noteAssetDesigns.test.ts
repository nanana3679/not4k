import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSkinManifest } from '../game/skin/skins';
import { createNoteAssetDesign, getNoteAssetDesign, NOTE_ASSET_DESIGNS } from './noteAssetDesigns';

describe('시안 교체', () => {
  it('시안 미지정과 알 수 없는 ID는 Classic을 선택하고 기존 Classic은 Simple로 제공', () => {
    expect(getNoteAssetDesign(null).id).toBe('classic');
    expect(getNoteAssetDesign('missing').id).toBe('classic');
    expect(NOTE_ASSET_DESIGNS.map(design => design.id)).toEqual(['classic','simple']);
    expect(getNoteAssetDesign('simple').skinId).toBe('simple');
  });
  it('Classic 시안은 석영 트릴을 포함한 포인트3개·바디10개·터미널11개와 봄6종을 함께 교체', () => {
    const design = getNoteAssetDesign('classic');
    expect(design.points.single).toBe('/lab/note-assets/classic/note-single.svg');
    expect(design.points.double).toBe('/lab/note-assets/classic/note-double.svg');
    expect(design.points.trill).toBe('/lab/note-assets/classic/note-trill.svg');
    expect(design.bodies).toHaveLength(10);
    expect(design.terminals).toHaveLength(11);
    expect(design.bodies.filter(asset => asset.kind === 'trill').map(asset => asset.src)).toEqual([
      '/lab/note-assets/classic/body-trill-idle.svg',
      '/lab/note-assets/classic/body-trill-on.svg',
      '/lab/note-assets/classic/body-trill-off.svg',
    ]);
    expect(design.terminals.filter(asset => asset.kind === 'trill').map(asset => asset.state)).toEqual(['idle','on','failed']);
    expect(design.bombs.map(bomb => bomb.id)).toEqual(['silver','diagonal','armor','shockwave','segmented','compact']);
  });
  it('Simple로 교체하면 노트·바디·터미널·16프레임 봄 모두 Simple 에셋을 사용', () => {
    const design = getNoteAssetDesign('simple');
    for(const src of [...Object.values(design.points), ...design.bodies.map(asset => asset.src), ...design.terminals.map(asset => asset.src), ...design.bombs[0].frames!]) {
      expect(src).toMatch(/^\/skins\/simple\//);
    }
    expect(design.bombs[0].frames).toHaveLength(16);
  });
  it('새 스킨 매니페스트를 주면 플레이어 변경 없이 시안과 봄 랙 설정을 생성', () => {
    const skin = getSkinManifest('crystal');
    const design = createNoteAssetDesign(skin, {description:'재사용 확인'});
    expect(design.skinId).toBe('crystal');
    expect(design.points.single).toBe(skin.assets.noteSingle);
    expect(design.bombs[0].frames).toBe(skin.assets.bomb);
  });

  it.each(['v001', 'v002', 'v003', 'v004', 'v005', 'v006', 'v007', 'v008'])('Classic %s를 고르면 재생기·포인트·바디·터미널·기어·봄 모두 같은 보관본을 사용한다', version => {
    const design = getNoteAssetDesign('classic', version);
    const prefix = `/lab/skin-versions/classic/${version}/`;
    expect(design.id).toBe('classic');
    expect(design.versionId).toBe(version);
    expect(design.skinId).toBe(`classic-${version}`);
    expect(design.skinManifest?.theme.available).toBe(false);
    for (const path of Object.values(design.skinManifest!.assets).flat()) expect(path).toMatch(new RegExp(`^${prefix}`));
    for (const path of [...Object.values(design.points), ...design.bodies.map(asset => asset.src), ...design.terminals.map(asset => asset.src)]) {
      expect(path).toMatch(new RegExp(`^${prefix}svg/`));
    }
    expect(design.bombs[0].frames).toEqual(design.skinManifest!.assets.bomb);
    expect(design.bombs[0].frames).toHaveLength(16);
    expect(getSkinManifest('classic').assets.noteSingle).toBe('/skins/classic/note-single.png');
  });

  it('알 수 없는 v999는 현재 Classic으로 돌아가고 Simple에서는 버전 인자를 무시한다', () => {
    expect(getNoteAssetDesign('classic', 'v999')).toBe(getNoteAssetDesign('classic'));
    expect(getNoteAssetDesign('simple', 'v001')).toBe(getNoteAssetDesign('simple'));
  });
});

describe('/not4k/ 배포의 시안 주소', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_URL', '/not4k/');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('Classic 포인트3개·바디10개·터미널11개 SVG는 /not4k/lab/note-assets/classic/에서 읽는다', async () => {
    const { getNoteAssetDesign: getPublicDesign } = await import('./noteAssetDesigns');
    const design = getPublicDesign('classic');
    const paths = [...Object.values(design.points), ...design.bodies.map(asset => asset.src), ...design.terminals.map(asset => asset.src)];

    expect(paths).toHaveLength(24);
    for (const src of paths) {
      expect(src).toMatch(/^\/not4k\/lab\/note-assets\/classic\/[^/]+\.svg$/);
    }
  });

  it('Simple의 PNG와 봄16프레임은 스킨 매니페스트의 /not4k/ 접두사를 중복해서 붙이지 않는다', async () => {
    const { getNoteAssetDesign: getPublicDesign } = await import('./noteAssetDesigns');
    const { getSkinManifest: getPublicSkinManifest } = await import('../game/skin/skins');
    const design = getPublicDesign('simple');
    const skin = getPublicSkinManifest('simple');

    expect(design.points.single).toBe(skin.assets.noteSingle);
    expect(design.bombs[0].frames).toBe(skin.assets.bomb);
    expect(design.bombs[0].frames).toHaveLength(16);
    for (const src of [...Object.values(design.points), ...design.bodies.map(asset => asset.src), ...design.terminals.map(asset => asset.src), ...design.bombs[0].frames!]) {
      expect(src).toMatch(/^\/not4k\/skins\/simple\/[^/]+\.png$/);
    }
  });

  it('/not4k/ 배포에서 v001의 SVG·PNG·기어·봄에 접두사를 한 번만 붙인다', async () => {
    const { getNoteAssetDesign: getPublicDesign } = await import('./noteAssetDesigns');
    const design = getPublicDesign('classic', 'v001');
    for (const path of [...Object.values(design.skinManifest!.assets).flat(), ...Object.values(design.points), ...design.bodies.map(asset => asset.src), ...design.terminals.map(asset => asset.src)]) {
      expect(path).toMatch(/^\/not4k\/lab\/skin-versions\/classic\/v001\//);
      expect(path).not.toContain('/not4k/not4k/');
    }
  });
});
