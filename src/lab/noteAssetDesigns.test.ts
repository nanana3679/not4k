import { describe, expect, it } from 'vitest';
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
});
