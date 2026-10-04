import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { computeFrameFitLayout, createFrameFitStage, FRAME_FIT_STAGE_WIDTH, type FrameFitGeometry } from './classicFrameFit';
import {
  createFrameFitSource,
  FRAME_FIT_TEXTURE_OPTIONS,
  FrameFitOverlay,
  getGearFrameLayer,
  getGearFrameSprite,
  isGameLaneMaskVisible,
  readJudgmentLineY,
  setGameLaneMaskVisible,
} from './classicFrameFitOverlay';

const geometry: FrameFitGeometry = {
  width: 1024, height: 1536, laneLeft: 236, laneRight: 787, laneBottom: 1089, silhouetteTop: 16, gaugeGlowTop: 196,
  keyFaceTop: 1137, keyFaceBottom: 1235, deckBottom: 1340, barGlowTop: 1367, barGlowBottom: 1399, frameBottom: 1465,
  seam: { y1: 423, y2: 906, cost: 28.93, typicalAdjacentRowCost: 2.06 },
};
const stage = createFrameFitStage(FRAME_FIT_STAGE_WIDTH);
const layoutFor = (mode: 'crop' | 'cut' | 'squash') => computeFrameFitLayout(mode, geometry, stage)!;
const uniform250 = () => computeFrameFitLayout('uniform', geometry, stage, 250)!;
const createSource = () => new TextureSource({ width: 1024, height: 1536 });
const spritesOf = (layer: Container) => (layer.children[0] as Container).children as Sprite[];

describe('getGearFrameLayer', () => {
  it('gearFrameLayer가 없는 렌더러 객체면 gearFrameLayer를 찾을 수 없다는 에러', () => {
    expect(() => getGearFrameLayer({})).toThrow('gearFrameLayer');
  });

  it('gearFrameLayer가 Container인 렌더러면 그 레이어를 그대로 돌려준다', () => {
    const layer = new Container();
    expect(getGearFrameLayer({ gearFrameLayer: layer })).toBe(layer);
  });

  it('현재 기어 스프라이트가 없으면(showGearFrame false) getGearFrameSprite는 null', () => {
    expect(getGearFrameSprite({ gearFrameSprite: null })).toBeNull();
    const sprite = new Sprite(Texture.EMPTY);
    expect(getGearFrameSprite({ gearFrameSprite: sprite })).toBe(sprite);
  });
});

describe('readJudgmentLineY', () => {
  it('렌더러의 판정선 y(_judgmentLineY 704)를 그대로 읽는다', () => {
    expect(readJudgmentLineY({ _judgmentLineY: 704 })).toBe(704);
  });

  it('_judgmentLineY가 없는 렌더러 객체면 _judgmentLineY를 찾을 수 없다는 에러', () => {
    expect(() => readJudgmentLineY({})).toThrow('_judgmentLineY');
  });
});

describe('게임 레인 마스크·버튼 숨김', () => {
  const fakeRenderer = () => ({ maskGraphic: new Graphics(), buttonSprites: [new Sprite(Texture.EMPTY), new Sprite(Texture.EMPTY)] });

  it('숨기면 판정선 아래 게임 마스크와 버튼 스프라이트 2개가 모두 보이지 않고, 다시 켜면 돌아온다', () => {
    const renderer = fakeRenderer();
    setGameLaneMaskVisible(renderer, false);
    expect(isGameLaneMaskVisible(renderer)).toBe(false);
    expect(renderer.buttonSprites.map((sprite) => sprite.visible)).toEqual([false, false]);
    setGameLaneMaskVisible(renderer, true);
    expect(isGameLaneMaskVisible(renderer)).toBe(true);
    expect(renderer.buttonSprites.map((sprite) => sprite.visible)).toEqual([true, true]);
  });

  it('maskGraphic이 없는 렌더러 객체면 maskGraphic을 찾을 수 없다는 에러', () => {
    expect(() => setGameLaneMaskVisible({ buttonSprites: [] }, false)).toThrow('maskGraphic');
  });
});

describe('FrameFitOverlay', () => {
  it('cut 레이아웃을 적용하면 0~422행과 906~1535행 서브 텍스처 스프라이트 2장이 레이아웃 위치·배율로 붙는다', () => {
    const layer = new Container();
    const overlay = new FrameFitOverlay(layer, createSource());
    const layout = layoutFor('cut');
    overlay.apply(layout);

    const sprites = spritesOf(layer);
    expect(sprites).toHaveLength(2);
    expect(sprites.map((sprite) => [sprite.texture.frame.y, sprite.texture.frame.height, sprite.texture.frame.width])).toEqual([
      [0, 423, 1024],
      [906, 630, 1024],
    ]);
    sprites.forEach((sprite, index) => {
      const slice = layout.slices[index];
      expect([sprite.x, sprite.y, sprite.scale.x, sprite.scale.y]).toEqual([slice.x, slice.y, slice.scaleX, slice.scaleY]);
    });
  });

  it('cut에서 squash로 다시 적용하면 이전 서브 텍스처 2장은 파괴되고 새 스프라이트 2장(0~1089행, 1090~1535행)으로 바뀐다', () => {
    const layer = new Container();
    const overlay = new FrameFitOverlay(layer, createSource());
    overlay.apply(layoutFor('cut'));
    const previous = spritesOf(layer).map((sprite) => sprite.texture);
    overlay.apply(layoutFor('squash'));

    expect(previous.every((texture) => texture.destroyed)).toBe(true);
    expect(spritesOf(layer).map((sprite) => [sprite.texture.frame.y, sprite.texture.frame.height])).toEqual([
      [0, 1090],
      [1090, 446],
    ]);
  });

  it('같은 조각(0~1535행)에서 위치만 48 올린 레이아웃을 다시 적용하면 스프라이트와 서브 텍스처를 그대로 두고 옮기기만 한다', () => {
    const layer = new Container();
    const overlay = new FrameFitOverlay(layer, createSource());
    const layout = layoutFor('crop');
    overlay.apply(layout);
    const [sprite] = spritesOf(layer);
    const { texture } = sprite;
    const before = sprite.y;
    overlay.apply({ ...layout, slices: [{ ...layout.slices[0], y: layout.slices[0].y - 48 }] });

    expect(spritesOf(layer)[0]).toBe(sprite);
    expect(sprite.texture).toBe(texture);
    expect(texture.destroyed).toBe(false);
    expect(before - sprite.y).toBeCloseTo(48, 9);
  });

  it('uniform 레이아웃(레인 폭 250)을 적용하면 프레임 아래에 레인 마스크(렌더러 x 653.6부터 400, 덱 위끝 687.5부터 화면 아래 960)를 깐다', () => {
    const layer = new Container();
    const overlay = new FrameFitOverlay(layer, createSource());
    overlay.apply(uniform250());
    const children = (layer.children[0] as Container).children;

    expect(children[0]).toBeInstanceOf(Graphics);
    expect(children.slice(1).every((child) => child instanceof Sprite)).toBe(true);
    const bounds = (children[0] as Graphics).getLocalBounds();
    expect(bounds.x).toBeCloseTo(653.6, 1);
    expect(bounds.width).toBeCloseTo(400, 6);
    expect(bounds.y).toBeCloseTo(687.5, 1);
    expect(bounds.y + bounds.height).toBeCloseTo(960, 6);
  });

  it('uniform에서 crop으로 다시 적용하면 레인 마스크를 없앤다', () => {
    const layer = new Container();
    const overlay = new FrameFitOverlay(layer, createSource());
    overlay.apply(uniform250());
    overlay.apply(layoutFor('crop'));
    const children = (layer.children[0] as Container).children;
    expect(children.every((child) => child instanceof Sprite)).toBe(true);
  });

  it('current(null 레이아웃)를 적용하면 얹힌 스프라이트가 없다', () => {
    const layer = new Container();
    const overlay = new FrameFitOverlay(layer, createSource());
    overlay.apply(layoutFor('crop'));
    overlay.apply(null);
    expect(spritesOf(layer)).toHaveLength(0);
  });

  it('destroy하면 오버레이 컨테이너가 레이어에서 빠지고 원본 소스도 파괴된다', () => {
    const layer = new Container();
    const source = createSource();
    const overlay = new FrameFitOverlay(layer, source);
    overlay.apply(layoutFor('crop'));
    const [texture] = spritesOf(layer).map((sprite) => sprite.texture);
    overlay.destroy();

    expect(layer.children).toHaveLength(0);
    expect(texture.destroyed).toBe(true);
    expect(source.destroyed).toBe(true);
  });

  it('렌더러 dispose가 먼저 레이어 자식을 파괴했어도 destroy는 오류 없이 서브 텍스처와 소스를 정리한다', () => {
    const layer = new Container();
    const source = createSource();
    const overlay = new FrameFitOverlay(layer, source);
    overlay.apply(layoutFor('cut'));
    const textures = spritesOf(layer).map((sprite) => sprite.texture);
    layer.destroy({ children: true, texture: false });

    expect(() => overlay.destroy()).not.toThrow();
    expect(textures.every((texture) => texture.destroyed)).toBe(true);
    expect(source.destroyed).toBe(true);
  });
});

describe('새 프레임 텍스처 소스', () => {
  it('밉맵 자동 생성을 켜고 확대·축소·밉맵 사이 필터를 모두 선형(삼선형)으로, 이방성 필터 8로 둔다', () => {
    const source = new TextureSource({ width: 1024, height: 1536, ...FRAME_FIT_TEXTURE_OPTIONS });
    expect(source.autoGenerateMipmaps).toBe(true);
    expect([source.style.magFilter, source.style.minFilter, source.style.mipmapFilter]).toEqual(['linear', 'linear', 'linear']);
    expect(source.style.maxAnisotropy).toBe(8);
  });

  it('1024×1536 그림으로 만든 소스는 위 설정을 그대로 가진 ImageSource다', () => {
    const image = { width: 1024, height: 1536, naturalWidth: 1024, naturalHeight: 1536 } as HTMLImageElement;
    const source = createFrameFitSource(image);
    expect([source.width, source.height, source.autoGenerateMipmaps, source.style.mipmapFilter]).toEqual([1024, 1536, true, 'linear']);
    source.destroy();
  });
});
