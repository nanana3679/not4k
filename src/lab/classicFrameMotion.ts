import { Container, Graphics, ImageSource, Rectangle, Sprite, Texture, type TextureSourceOptions } from 'pixi.js';
import {
  FRAME_MOTION_LAYERS,
  FRAME_MOTION_TEXTURE_KEYS,
  type FrameMotionData,
  type FrameMotionLayer,
  type FrameMotionTextureKey,
} from './classicFrameMotionData';
import { breatheOpacity, bubbleRise, glintState, lightBandCenterY, liquidFlowOffset } from './classicFrameMotionTiming';

export {
  FRAME_MOTION_LAYER_LABELS,
  FRAME_MOTION_LAYERS,
  FRAME_MOTION_TEXTURE_KEYS,
  parseFrameMotionData,
  type FrameMotionData,
  type FrameMotionLayer,
  type FrameMotionPiece,
  type FrameMotionTextureBox,
  type FrameMotionTextureKey,
} from './classicFrameMotionData';

/**
 * Classic 프레임 움직임(승인된 54-ambient-motion-v19.svg)을 Pixi 레이어로 다시 구성한다.
 * React·Lab 페이지에 의존하지 않는 자족 모듈이라 나중에 게임 렌더러로 옮길 수 있다.
 *
 * - 좌표: 컨테이너는 프레임 그림 좌표(1024×1536)다. 호출자가 프레임 스프라이트와 같은 변환을 컨테이너에 건다.
 * - 텍스처: prepare-frame-motion-v21.mjs가 SVG의 마스크·필터·블러를 미리 구운 PNG다. 런타임 필터는 없고,
 *   매 프레임 변환·불투명도만 바꾼다. 텍스처는 호출자 소유이며 destroy가 파괴하지 않는다.
 * - 마스크: 광원 띠·유리 윤곽은 Graphics 스텐실 마스크(띠 밖 어둡게는 inverse)로, 마스크 Graphics는 한 번 만들고
 *   위치만 옮긴다. 경계가 부드러운 하단 바 빛만 스프라이트 알파 마스크를 쓴다(빛이 보이는 동안만 그린다).
 */

export type FrameMotionTextures = Record<FrameMotionTextureKey, Texture>;

export interface ClassicFrameMotion {
  /** 프레임 그림 좌표의 움직임 루트. 프레임 스프라이트 바로 위에 같은 변환으로 놓는다. */
  readonly container: Container;
  readonly reducedMotion: boolean;
  /** 움직임 시계(ms). SVG 애니메이션 currentTime과 같은 뜻이다. */
  update(timeMs: number): void;
  setLayerVisible(layer: FrameMotionLayer, visible: boolean): void;
  isLayerVisible(layer: FrameMotionLayer): boolean;
  /** 움직임 줄이기: SVG의 prefers-reduced-motion처럼 모든 움직임 레이어를 숨기고 멈춘다. */
  setReducedMotion(reduced: boolean): void;
  destroy(): void;
}

const LIQUID_TILE_COUNT = 3;

/**
 * Pixi 8은 스프라이트 불투명도를 정점 색 8비트로 넣을 때 버린다((alpha × 255) | 0). 브라우저 SVG는 반올림하므로
 * 0.07이 Pixi에서는 17/255, SVG에서는 18/255가 되어 넓은 장갑이 SVG보다 덜 어두워진다. 0.5/255를 더해 넘기면
 * 버림이 반올림과 같아진다. 0과 1은 그대로 둔다.
 */
export function byteAlpha(value: number): number {
  if (!(value > 0)) return 0;
  if (value >= 1) return 1;
  return (Math.round(value * 255) + 0.5) / 255;
}

/**
 * 광원 띠 사각형의 반폭. SVG 사각형(2424)은 회전해도 넉넉하도록 길지만, 프레임(폭 1024) 안에서 띠에 드는 점은
 * 띠 방향으로 중심에서 ±(512·cos + dy·sin)까지만 있다(dy는 띠 반높이를 기울기로 늘린 값). 그만큼(+2px)만 그려
 * 스텐실을 채우는 넓이를 줄인다. 프레임 안에서 보이는 띠 모양은 SVG와 같다.
 */
export function bandHalfWidth(data: Pick<FrameMotionData, 'frame' | 'light'>): number {
  const { frame, light } = data;
  const tilt = (Math.abs(light.tiltDeg) * Math.PI) / 180;
  const reachX = frame.width / 2;
  const reachY = (light.outerHeight / 2 + reachX * Math.sin(tilt)) / Math.cos(tilt);
  const needed = Math.ceil(reachX * Math.cos(tilt) + reachY * Math.sin(tilt)) + 2;
  return Math.min(light.bandWidth / 2, needed);
}

export function createClassicFrameMotion(data: FrameMotionData, textures: FrameMotionTextures): ClassicFrameMotion {
  const { light, contrast, gauge, accent, bar } = data;
  const root = new Container({ label: 'classic-frame-motion' });
  // 조각 서브 텍스처는 이 모듈이 만들고 정리한다(받은 텍스처는 호출자 소유).
  const ownedTextures: Texture[] = [];
  const pieceTexture = (key: FrameMotionTextureKey, index: number) => {
    const source = textures[key];
    const piece = data.textures[key].pieces[index];
    const texture = new Texture({
      source: source.source,
      frame: new Rectangle(source.frame.x + piece.atlasX, source.frame.y + piece.atlasY, piece.width, piece.height),
    });
    ownedTextures.push(texture);
    return texture;
  };
  /** 조각 하나짜리 텍스처(액체 타일·바·빛)를 그 프레임 좌표에 놓은 스프라이트. */
  const placed = (key: FrameMotionTextureKey, label: string) => {
    const [piece] = data.textures[key].pieces;
    const sprite = new Sprite({ texture: pieceTexture(key, 0), label });
    sprite.position.set(piece.x, piece.y);
    return sprite;
  };
  /** 조각 여러 개(기둥 둘·아래 띠)를 프레임 좌표에 놓은 컨테이너. 불투명도·색·혼합은 컨테이너에 걸면 조각이 물려받는다. */
  const placedPieces = (key: FrameMotionTextureKey, label: string) => {
    const container = new Container({ label });
    data.textures[key].pieces.forEach((piece, index) => {
      const sprite = new Sprite({ texture: pieceTexture(key, index), label: `${label}-piece-${index}` });
      sprite.position.set(piece.x, piece.y);
      container.addChild(sprite);
    });
    return container;
  };
  const halfWidth = bandHalfWidth(data);
  /** 띠 중심을 원점으로 하는 사각형들(위끝 top, 높이 height)을 한 Graphics에 그린다. 위치·회전은 update가 옮긴다. */
  const band = (label: string, strips: { top: number; height: number }[]) => {
    const graphics = new Graphics({ label });
    for (const strip of strips) graphics.rect(-halfWidth, strip.top, halfWidth * 2, strip.height).fill(0xffffff);
    graphics.position.set(light.pivotX, light.fromY);
    graphics.rotation = (light.tiltDeg * Math.PI) / 180;
    return graphics;
  };

  // A 큰 광원. SVG: 띠 밖은 #04060a 7%, 절반 띠(#808080)는 대비 복사본 50%, 가운데 띠는 대비 복사본 100% + 흰빛 3%.
  // 가운데 띠의 흰빛은 armor-core 텍스처에 미리 합성되어 있어(복사본 위 흰빛과 같은 결과) 스프라이트 하나로 그린다.
  const armor = new Container({ label: 'frame-motion-armor' });
  const outerHalf = light.outerHeight / 2;
  const coreHalf = light.coreHeight / 2;
  const outerBand = band('frame-motion-band-outer', [{ top: -outerHalf, height: light.outerHeight }]);
  const halfBand = band('frame-motion-band-half', [
    { top: -outerHalf, height: outerHalf - coreHalf },
    { top: coreHalf, height: outerHalf - coreHalf },
  ]);
  const coreBand = band('frame-motion-band-core', [{ top: -coreHalf, height: light.coreHeight }]);
  const unlit = placedPieces('armorShape', 'frame-motion-unlit');
  unlit.tint = contrast.unlitColor;
  unlit.alpha = byteAlpha(contrast.unlitDim);
  unlit.setMask({ mask: outerBand, inverse: true });
  const litHalf = placedPieces('armorLit', 'frame-motion-lit-half');
  litHalf.alpha = byteAlpha(light.halfAlpha);
  litHalf.mask = halfBand;
  const litCore = placedPieces('armorCore', 'frame-motion-lit-core');
  litCore.mask = coreBand;
  armor.addChild(unlit, litHalf, litCore, outerBand, halfBand, coreBand);

  // B 게이지 액체. 유리 안쪽 윤곽으로 자른 액체 타일(45%)과 기포(screen). 오른쪽은 x' = mirrorSum − x 반전.
  const gaugeLayer = new Container({ label: 'frame-motion-gauge' });
  const glass = new Graphics({ label: 'frame-motion-glass' });
  for (const polygon of gauge.glass) glass.poly(polygon.flat()).fill(0xffffff);
  const liquidLayer = new Container({ label: 'frame-motion-liquid' });
  liquidLayer.alpha = byteAlpha(gauge.liquid.opacity);
  const mirrored = (container: Container) => {
    container.scale.x = -1;
    container.x = gauge.mirrorSum;
    return container;
  };
  const liquidSide = (label: string) => {
    const side = new Container({ label });
    for (let index = 0; index < LIQUID_TILE_COUNT; index++) {
      const tile = placed('liquidTile', `frame-motion-liquid-tile-${index}`);
      tile.y = index * gauge.liquid.tileHeight;
      side.addChild(tile);
    }
    return side;
  };
  const liquidLeft = liquidSide('frame-motion-liquid-left');
  const liquidRight = mirrored(liquidSide('frame-motion-liquid-right'));
  liquidLayer.addChild(liquidLeft, liquidRight);

  const atlas = textures.bubbles;
  const cell = gauge.bubbleCell;
  const bubbleTextures = gauge.bubbles.map((_, index) => {
    const texture = new Texture({ source: atlas.source, frame: new Rectangle(atlas.frame.x + index * cell, atlas.frame.y, cell, cell) });
    ownedTextures.push(texture);
    return texture;
  });
  const bubbleSide = (label: string) => {
    const side = new Container({ label });
    gauge.bubbles.forEach((bubble, index) => {
      const sprite = new Sprite({ texture: bubbleTextures[index], label: `frame-motion-bubble-${index}` });
      sprite.blendMode = 'screen';
      sprite.position.set(bubble.x - cell / 2, gauge.rise.startY - cell / 2);
      side.addChild(sprite);
    });
    return side;
  };
  const bubblesLeft = bubbleSide('frame-motion-bubbles-left');
  const bubblesRight = mirrored(bubbleSide('frame-motion-bubbles-right'));
  const bubbleLayer = new Container({ label: 'frame-motion-bubbles' });
  bubbleLayer.addChild(bubblesLeft, bubblesRight);
  gaugeLayer.addChild(liquidLayer, bubbleLayer, glass);
  gaugeLayer.mask = glass;

  // C 발광선 호흡. SVG는 발광선과 번짐을 같은 불투명도 o로 한 그룹 안에서 겹친 뒤(선이 번짐 위) 그룹을 screen한다.
  // 그룹 색은 o·T1 + o(1 − o)·T2(T1 = 번짐 위 발광선, T2 = 발광선 알파 아래 번짐)이고 screen은 그룹 색에 선형이라,
  // T1을 불투명도 o로, T2를 o(1 − o)로 차례로 screen하면 같은 결과에 가깝다(남는 오차 ≤ 0.148·(1 − D)·T1·T2).
  const accentLayer = new Container({ label: 'frame-motion-accent' });
  const accentGlow = placedPieces('accentGlow', 'frame-motion-accent-glow');
  const accentOverlap = placedPieces('accentOverlap', 'frame-motion-accent-overlap');
  accentGlow.blendMode = 'screen';
  accentOverlap.blendMode = 'screen';
  accentLayer.addChild(accentGlow, accentOverlap);

  // D 하단 바 흐름. SVG는 바 마스크로 자른 빛을 screen으로 더한다(결과 D + M·G(1 − D)). 알파 마스크 필터는 일반 합성이라,
  // 마스크 안에 바 바탕 복사본을 두고 그 위에 빛을 screen하면 M·screen(바탕, G) + (1 − M)·D로 같은 결과가 된다.
  const barLayer = new Container({ label: 'frame-motion-bar' });
  const [glintBox] = data.textures.glint.pieces;
  const glintRight = placed('glint', 'frame-motion-glint-right');
  const glintLeft = placed('glint', 'frame-motion-glint-left');
  glintRight.blendMode = 'screen';
  glintLeft.blendMode = 'screen';
  const barMask = placed('barMask', 'frame-motion-bar-mask');
  barLayer.addChild(placed('barBase', 'frame-motion-bar-base'), glintRight, glintLeft, barMask);
  barLayer.setMask({ mask: barMask, channel: 'alpha' });

  root.addChild(armor, gaugeLayer, accentLayer, barLayer);
  const layerContainers: Record<FrameMotionLayer, Container> = { armor, gauge: gaugeLayer, accent: accentLayer, bar: barLayer };
  const userVisible: Record<FrameMotionLayer, boolean> = { armor: true, gauge: true, accent: true, bar: true };
  let barActive = false;
  let reduced = false;
  let destroyed = false;

  const applyVisibility = () => {
    for (const layer of FRAME_MOTION_LAYERS) {
      // 하단 바는 알파 마스크(필터 패스)가 들므로 빛이 투명한 동안(주기의 45%)은 그리지 않는다.
      layerContainers[layer].visible = userVisible[layer] && (layer !== 'bar' || barActive);
    }
  };

  const update = (timeMs: number) => {
    if (destroyed || reduced) return;
    const centreY = lightBandCenterY(timeMs, light);
    outerBand.y = centreY;
    halfBand.y = centreY;
    coreBand.y = centreY;

    const flow = liquidFlowOffset(timeMs, gauge.liquid);
    for (const side of [liquidLeft, liquidRight]) {
      side.children.forEach((tile, index) => { tile.y = index * gauge.liquid.tileHeight + flow; });
    }
    gauge.bubbles.forEach((bubble, index) => {
      const state = bubbleRise(timeMs, bubble, gauge.rise);
      for (const side of [bubblesLeft, bubblesRight]) {
        const sprite = side.children[index];
        sprite.y = gauge.rise.startY - cell / 2 + state.offsetY;
        sprite.alpha = byteAlpha(state.alpha);
      }
    });

    const opacity = breatheOpacity(timeMs, accent);
    accentGlow.alpha = byteAlpha(opacity);
    accentOverlap.alpha = byteAlpha(opacity * (1 - opacity));

    const glint = glintState(timeMs, bar);
    glintRight.x = glintBox.x + glint.offset;
    glintLeft.x = glintBox.x - glint.offset;
    glintRight.alpha = byteAlpha(glint.alpha);
    glintLeft.alpha = byteAlpha(glint.alpha);
    const active = glint.alpha > 0;
    if (active !== barActive) {
      barActive = active;
      applyVisibility();
    }
  };

  applyVisibility();
  update(0);

  return {
    container: root,
    get reducedMotion() { return reduced; },
    update,
    setLayerVisible(layer, visible) {
      userVisible[layer] = visible;
      if (!destroyed) applyVisibility();
    },
    isLayerVisible: (layer) => userVisible[layer],
    setReducedMotion(next) {
      reduced = next;
      if (!destroyed) root.visible = !next;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeFromParent();
      root.destroy({ children: true });
      for (const texture of ownedTextures) texture.destroy(false);
    },
  };
}

/**
 * 렌더러(GL 컨텍스트)마다 텍스처 소스를 새로 만든다. 프레임 텍스처와 같은 옵션(밉맵·선형)을 넘기면 줄여 그릴 때
 * 빛 받은 복사본이 바탕 프레임과 같은 선명도로 보인다. 정리는 호출자가 destroy로 한다.
 */
export function createFrameMotionTextures(
  images: Record<FrameMotionTextureKey, HTMLImageElement>,
  options: Partial<TextureSourceOptions> = {},
): { textures: FrameMotionTextures; destroy: () => void } {
  const sources: ImageSource[] = [];
  const textures = Object.fromEntries(FRAME_MOTION_TEXTURE_KEYS.map((key) => {
    const source = new ImageSource({ resource: images[key], ...options });
    sources.push(source);
    return [key, new Texture({ source })];
  })) as FrameMotionTextures;
  return {
    textures,
    destroy: () => {
      for (const key of FRAME_MOTION_TEXTURE_KEYS) if (!textures[key].destroyed) textures[key].destroy(false);
      for (const source of sources) source.destroy();
    },
  };
}
