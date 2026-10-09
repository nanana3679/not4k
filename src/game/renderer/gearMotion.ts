import { BufferImageSource, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  GEAR_MOTION_LAYERS,
  type GearMotionData,
  type GearMotionLayer,
  type GearMotionTextureKey,
} from './gearMotionData';
import {
  breatheOpacity,
  bubbleRise,
  glintState,
  lightBandCenterY,
  liquidFlowOffset,
  type BubbleRiseState,
  type GlintState,
} from './gearMotionTiming';

export {
  GEAR_MOTION_LAYER_LABELS,
  GEAR_MOTION_LAYERS,
  GEAR_MOTION_TEXTURE_KEYS,
  parseGearMotionData,
  type GearMotionData,
  type GearMotionLayer,
  type GearMotionPiece,
  type GearMotionTextureBox,
  type GearMotionTextureKey,
} from './gearMotionData';

/**
 * `gearMotion`(기어 위 장식 애니메이션, 승인된 54-ambient-motion-v19.svg)을 Pixi 레이어로 다시 구성한다([RFD 0029](../../../docs/rfd/0029-frame-aspect-fit-narrow-lanes.md)).
 * React·Lab에 의존하지 않는 게임 모듈이다. 게임 렌더러는 GearMotionController로 내장 기어 위에 추가하고, Lab 비교 화면도 이 모듈을 쓴다.
 *
 * - 좌표: 컨테이너는 기어 그림 좌표(1024×1536)다. 호출자가 기어 스프라이트와 같은 변환을 컨테이너에 건다.
 * - 텍스처: prepare-frame-motion-v21.mjs가 SVG의 마스크·필터·블러를 미리 구운 PNG다(공유 로더 gearMotionAssets가 기어와 같은
 *   밉맵·삼선형 설정으로 읽는다). 런타임 필터는 없고, 매 프레임 변환·불투명도만 바꾼다. 텍스처는 호출자 소유이며 destroy가 파괴하지 않는다.
 * - 마스크: 광원 띠·유리 윤곽은 Graphics 스텐실 마스크(띠 밖 어둡게는 inverse)로, 마스크 Graphics는 한 번 만들고
 *   위치만 옮긴다. 경계가 부드러운 하단 바 빛만 스프라이트 알파 마스크를 쓴다(빛이 보이는 동안만 그린다).
 */

export type GearMotionTextures = Record<GearMotionTextureKey, Texture>;

export interface GearMotion {
  /** 기어 그림 좌표의 `gearMotion` 루트 컨테이너. 기어 스프라이트 바로 위에 같은 변환으로 추가한다. */
  readonly container: Container;
  /**
   * B 게이지의 액체 타일과 기포를 담은 채움 컨테이너(기어 그림 좌표). 유리 윤곽 마스크는 그 부모(게이지 레이어)에 걸려 있고
   * 이 컨테이너에는 마스크가 없어 유리관 전체에서 흐른다. 고도 게이지는 이것을 자르지 않는다. 렌더러가 기어 레이어에서 `gearMotion` 위에
   * 빈 유리 덮개(gearGauge.ts)를 겹치므로, 빈 부분에서는 덮개가 액체·기포를 가리고 채운 부분에서만 보인다.
   */
  readonly gaugeFill: Container;
  /** 애니메이션 경과 시간(ms). SVG 애니메이션 currentTime과 같은 뜻이다. */
  update(timeMs: number): void;
  setLayerVisible(layer: GearMotionLayer, visible: boolean): void;
  isLayerVisible(layer: GearMotionLayer): boolean;
  /**
   * render를 한 번 부르는 동안 빛이 투명해 숨겨 둔 하단 바 레이어(알파 마스크 필터)도 그리게 해, 필터 프로그램·렌더 텍스처를
   * 곡 재생 전에 준비한다. 빛이 투명하면 바 안에는 같은 바탕 복사본만 그려져 화면은 그대로다. 끝나면 원래 표시로 돌린다.
   */
  warmUp(render: () => void): void;
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
 * 광원 띠 사각형의 반폭. SVG 사각형(2424)은 회전해도 넉넉하도록 길지만, 기어 그림(폭 1024) 안에서 띠에 드는 점은
 * 띠 방향으로 중심에서 ±(512·cos + dy·sin)까지만 있다(dy는 띠 반높이를 기울기로 늘린 값). 그만큼(+2px)만 그려
 * 스텐실을 채우는 넓이를 줄인다. 기어 그림 안에서 보이는 띠 모양은 SVG와 같다.
 */
export function bandHalfWidth(data: Pick<GearMotionData, 'image' | 'light'>): number {
  const { image, light } = data;
  const tilt = (Math.abs(light.tiltDeg) * Math.PI) / 180;
  const reachX = image.width / 2;
  const reachY = (light.outerHeight / 2 + reachX * Math.sin(tilt)) / Math.cos(tilt);
  const needed = Math.ceil(reachX * Math.cos(tilt) + reachY * Math.sin(tilt)) + 2;
  return Math.min(light.bandWidth / 2, needed);
}

/** 띠 사각형 하나(띠 중심 기준 위끝 top, 높이 height). */
interface BandStrip {
  top: number;
  height: number;
}

/**
 * 부드러운 띠 가장자리용 세로 프로파일(1px 폭, outerHeight + 2행). 행 r은 띠 중심 기준 [r − (n/2), r − (n/2) + 1)을
 * 덮고, 그 구간이 strips 안이면 255, 아니면 0이다. 위아래 끝 한 행은 늘 0이라 선형 필터로 늘려 그리면 띠 경계에서
 * 1px 동안 0→1로 바뀌어 SVG 마스크의 안티앨리어싱 경계와 비슷해진다.
 */
export function bandProfileAlpha(outerHeight: number, strips: readonly BandStrip[]): Uint8Array {
  const rows = outerHeight + 2;
  const offset = rows / 2;
  const alpha = new Uint8Array(rows);
  for (let row = 0; row < rows; row++) {
    const top = row - offset;
    const inside = strips.some((strip) => top >= strip.top && top + 1 <= strip.top + strip.height);
    alpha[row] = inside ? 255 : 0;
  }
  return alpha;
}

export interface GearMotionOptions {
  /**
   * 광원 띠 가장자리. 'stencil'(기본): Graphics 스텐실 마스크라 경계가 픽셀 단위로 켜지고 꺼진다(MSAA가 없으면 계단).
   * 'soft': 1px 프로파일 스프라이트를 알파 마스크로 써 경계를 1px 동안 섞는다. 대신 띠마다 마스크 필터 패스가 1번씩 든다.
   */
  bandEdges?: 'stencil' | 'soft';
}

export function createGearMotion(data: GearMotionData, textures: GearMotionTextures, options: GearMotionOptions = {}): GearMotion {
  const { light, contrast, gauge, accent, bar } = data;
  const root = new Container({ label: 'gear-motion' });
  // 조각 서브 텍스처와 부드러운 띠 프로파일은 이 모듈이 만들고 정리한다(받은 텍스처는 호출자 소유).
  const ownedTextures: Texture[] = [];
  const ownedProfiles: Texture[] = [];
  const disposeOwned = () => {
    if (!root.destroyed) {
      root.removeFromParent();
      root.destroy({ children: true });
    }
    for (const texture of ownedTextures) if (!texture.destroyed) texture.destroy(false);
    for (const texture of ownedProfiles) if (!texture.destroyed) texture.destroy(true);
  };
  try {
    return buildMotion();
  } catch (error) {
    // 구성 도중 실패해도 그때까지 만든 서브 텍스처·컨테이너가 원본 소스에 붙어 남지 않게 한다.
    disposeOwned();
    throw error;
  }

  function buildMotion(): GearMotion {
    const pieceTexture = (key: GearMotionTextureKey, index: number) => {
      const source = textures[key];
      const piece = data.textures[key].pieces[index];
      const texture = new Texture({
        source: source.source,
        frame: new Rectangle(source.frame.x + piece.atlasX, source.frame.y + piece.atlasY, piece.width, piece.height),
      });
      ownedTextures.push(texture);
      return texture;
    };
    /** 조각 하나짜리 텍스처(액체 타일·바·빛)를 그 기어 그림 좌표에 놓은 스프라이트. */
    const placed = (key: GearMotionTextureKey, label: string) => {
      const [piece] = data.textures[key].pieces;
      if (!piece) throw new Error(`gear-motion.json의 textures.${key}에 조각이 없습니다.`);
      const sprite = new Sprite({ texture: pieceTexture(key, 0), label });
      sprite.position.set(piece.x, piece.y);
      return sprite;
    };
    /** 조각 여러 개(기둥 둘·아래 띠)를 기어 그림 좌표에 놓은 컨테이너. 불투명도·색·혼합은 컨테이너에 걸면 조각이 물려받는다. */
    const placedPieces = (key: GearMotionTextureKey, label: string) => {
      const container = new Container({ label });
      data.textures[key].pieces.forEach((piece, index) => {
        const sprite = new Sprite({ texture: pieceTexture(key, index), label: `${label}-piece-${index}` });
        sprite.position.set(piece.x, piece.y);
        container.addChild(sprite);
      });
      return container;
    };
    const halfWidth = bandHalfWidth(data);
    const tilt = (light.tiltDeg * Math.PI) / 180;
    const soft = options.bandEdges === 'soft';
    /**
     * 띠 중심을 원점으로 하는 사각형들을 마스크 하나로 만든다. 위치·회전은 update가 옮긴다.
     * stencil: 사각형을 그린 Graphics. soft: 같은 모양의 1px 프로파일을 띠 방향으로 늘린 스프라이트.
     */
    const band = (label: string, strips: BandStrip[]): Container => {
      if (soft) {
        const alpha = bandProfileAlpha(light.outerHeight, strips);
        const rgba = new Uint8Array(alpha.length * 4);
        for (let row = 0; row < alpha.length; row++) rgba.set([255, 255, 255, alpha[row]], row * 4);
        const texture = new Texture({
          source: new BufferImageSource({ resource: rgba, width: 1, height: alpha.length, autoGenerateMipmaps: true, scaleMode: 'linear' }),
        });
        ownedProfiles.push(texture);
        const sprite = new Sprite({ texture, label, anchor: 0.5 });
        sprite.scale.set(halfWidth * 2, 1);
        sprite.position.set(light.pivotX, light.fromY);
        sprite.rotation = tilt;
        return sprite;
      }
      const graphics = new Graphics({ label });
      for (const strip of strips) graphics.rect(-halfWidth, strip.top, halfWidth * 2, strip.height).fill(0xffffff);
      graphics.position.set(light.pivotX, light.fromY);
      graphics.rotation = tilt;
      return graphics;
    };
    const maskWith = (target: Container, mask: Container, inverse = false) => {
      if (soft) target.setMask({ mask, inverse, channel: 'alpha' });
      else target.setMask({ mask, inverse });
    };

    // A 큰 광원. SVG: 띠 밖은 #04060a 7%, 절반 띠(#808080)는 대비 복사본 50%, 가운데 띠는 대비 복사본 100% + 흰빛 3%.
    // 가운데 띠의 흰빛은 armor-core 텍스처에 미리 합성되어 있어(복사본 위 흰빛과 같은 결과) 스프라이트 하나로 그린다.
    // 띠 밖 어둡게는 대비 복사본 조각(같은 장갑 알파)을 #04060a로 물들여 쓴다. 물든 색은 복사본 색 × #04060a라
    // SVG의 단색 #04060a와 7% 불투명도에서 1/255 안쪽으로 차이 난다.
    const armor = new Container({ label: 'gear-motion-armor' });
    const outerHalf = light.outerHeight / 2;
    const coreHalf = light.coreHeight / 2;
    const outerBand = band('gear-motion-band-outer', [{ top: -outerHalf, height: light.outerHeight }]);
    const halfBand = band('gear-motion-band-half', [
      { top: -outerHalf, height: outerHalf - coreHalf },
      { top: coreHalf, height: outerHalf - coreHalf },
    ]);
    const coreBand = band('gear-motion-band-core', [{ top: -coreHalf, height: light.coreHeight }]);
    const unlit = placedPieces('armorLit', 'gear-motion-unlit');
    unlit.tint = contrast.unlitColor;
    unlit.alpha = byteAlpha(contrast.unlitDim);
    maskWith(unlit, outerBand, true);
    const litHalf = placedPieces('armorLit', 'gear-motion-lit-half');
    litHalf.alpha = byteAlpha(light.halfAlpha);
    maskWith(litHalf, halfBand);
    const litCore = placedPieces('armorCore', 'gear-motion-lit-core');
    maskWith(litCore, coreBand);
    armor.addChild(unlit, litHalf, litCore, outerBand, halfBand, coreBand);
    const bands = [outerBand, halfBand, coreBand];

    // B 게이지 액체. 유리 안쪽 윤곽으로 자른 액체 타일(45%)과 기포(screen). 오른쪽은 x' = mirrorSum − x 반전.
    const gaugeLayer = new Container({ label: 'gear-motion-gauge' });
    const glass = new Graphics({ label: 'gear-motion-glass' });
    for (const polygon of gauge.glass) glass.poly(polygon.flat()).fill(0xffffff);
    const liquidLayer = new Container({ label: 'gear-motion-liquid' });
    liquidLayer.alpha = byteAlpha(gauge.liquid.opacity);
    const mirrored = (container: Container) => {
      container.scale.x = -1;
      container.x = gauge.mirrorSum;
      return container;
    };
    // 매 프레임 옮기는 스프라이트는 만들 때 배열로 모아 두고 update에서 인덱스로만 돈다.
    const liquidTiles: Sprite[] = [];
    const liquidRows: number[] = [];
    const liquidSide = (label: string) => {
      const side = new Container({ label });
      for (let index = 0; index < LIQUID_TILE_COUNT; index++) {
        const tile = placed('liquidTile', `gear-motion-liquid-tile-${index}`);
        tile.y = index * gauge.liquid.tileHeight;
        side.addChild(tile);
        liquidTiles.push(tile);
        liquidRows.push(index * gauge.liquid.tileHeight);
      }
      return side;
    };
    const liquidLeft = liquidSide('gear-motion-liquid-left');
    const liquidRight = mirrored(liquidSide('gear-motion-liquid-right'));
    liquidLayer.addChild(liquidLeft, liquidRight);

    const atlas = textures.bubbles;
    const cell = gauge.bubbleCell;
    const bubbleTextures = gauge.bubbles.map((_, index) => {
      const texture = new Texture({ source: atlas.source, frame: new Rectangle(atlas.frame.x + index * cell, atlas.frame.y, cell, cell) });
      ownedTextures.push(texture);
      return texture;
    });
    // bubbleSprites[i * 2]는 왼쪽, [i * 2 + 1]은 오른쪽(반전) 기포다.
    const bubbleSprites: Sprite[] = [];
    const bubblesLeft = new Container({ label: 'gear-motion-bubbles-left' });
    const bubblesRight = mirrored(new Container({ label: 'gear-motion-bubbles-right' }));
    gauge.bubbles.forEach((bubble, index) => {
      for (const side of [bubblesLeft, bubblesRight]) {
        const sprite = new Sprite({ texture: bubbleTextures[index], label: `gear-motion-bubble-${index}` });
        sprite.blendMode = 'screen';
        sprite.position.set(bubble.x - cell / 2, gauge.rise.startY - cell / 2);
        side.addChild(sprite);
        bubbleSprites.push(sprite);
      }
    });
    const bubbleLayer = new Container({ label: 'gear-motion-bubbles' });
    bubbleLayer.addChild(bubblesLeft, bubblesRight);
    // 액체와 기포는 채움 컨테이너 하나에 담는다(유리 윤곽 마스크만 걸린다). 고도 게이지의 빈 부분에서는 그 위에 겹친 빈 유리 덮개가 둘을 함께 가린다.
    const gaugeFill = new Container({ label: 'gear-motion-gauge-fill' });
    gaugeFill.addChild(liquidLayer, bubbleLayer);
    gaugeLayer.addChild(gaugeFill, glass);
    gaugeLayer.mask = glass;

    // C 발광선 호흡. SVG는 발광선과 번짐을 같은 불투명도 o로 한 그룹 안에서 겹친 뒤(선이 번짐 위) 그룹을 screen한다.
    // 그룹 색은 o·T1 + o(1 − o)·T2(T1 = 번짐 위 발광선, T2 = 발광선 알파 아래 번짐)이고 screen은 그룹 색에 선형이라,
    // T1을 불투명도 o로, T2를 o(1 − o)로 차례로 screen하면 같은 결과에 가깝다(남는 오차 ≤ 0.148·(1 − D)·T1·T2).
    const accentLayer = new Container({ label: 'gear-motion-accent' });
    const accentGlow = placedPieces('accentGlow', 'gear-motion-accent-glow');
    const accentOverlap = placedPieces('accentOverlap', 'gear-motion-accent-overlap');
    accentGlow.blendMode = 'screen';
    accentOverlap.blendMode = 'screen';
    accentLayer.addChild(accentGlow, accentOverlap);

    // D 하단 바 흐름. SVG는 바 마스크로 자른 빛을 screen으로 더한다(결과 D + M·G(1 − D)). 알파 마스크 필터는 일반 합성이라,
    // 마스크 안에 바 바탕 복사본을 두고 그 위에 빛을 screen하면 M·screen(바탕, G) + (1 − M)·D로 같은 결과가 된다.
    const barLayer = new Container({ label: 'gear-motion-bar' });
    const glintRight = placed('glint', 'gear-motion-glint-right');
    const glintLeft = placed('glint', 'gear-motion-glint-left');
    const glintX = glintRight.x;
    glintRight.blendMode = 'screen';
    glintLeft.blendMode = 'screen';
    const barMask = placed('barMask', 'gear-motion-bar-mask');
    barLayer.addChild(placed('barBase', 'gear-motion-bar-base'), glintRight, glintLeft, barMask);
    barLayer.setMask({ mask: barMask, channel: 'alpha' });

    root.addChild(armor, gaugeLayer, accentLayer, barLayer);
    const layerContainers: Record<GearMotionLayer, Container> = { armor, gauge: gaugeLayer, accent: accentLayer, bar: barLayer };
    const userVisible: Record<GearMotionLayer, boolean> = { armor: true, gauge: true, accent: true, bar: true };
    let barActive = false;
    let destroyed = false;
    // update가 매 프레임 덮어쓰는 결과 객체(새로 만들지 않는다).
    const bubbleState: BubbleRiseState = { offsetY: 0, alpha: 0 };
    const glint: GlintState = { offset: 0, alpha: 0 };
    const bubbleBaseY = gauge.rise.startY - cell / 2;

    const applyVisibility = () => {
      for (const layer of GEAR_MOTION_LAYERS) {
        // 하단 바는 알파 마스크(필터 패스)가 들므로 빛이 투명한 동안(주기의 45%)은 그리지 않는다.
        layerContainers[layer].visible = userVisible[layer] && (layer !== 'bar' || barActive);
      }
    };

    const update = (timeMs: number) => {
      if (destroyed) return;
      const centreY = lightBandCenterY(timeMs, light);
      for (let index = 0; index < bands.length; index++) bands[index].y = centreY;

      const flow = liquidFlowOffset(timeMs, gauge.liquid);
      for (let index = 0; index < liquidTiles.length; index++) liquidTiles[index].y = liquidRows[index] + flow;
      for (let index = 0; index < gauge.bubbles.length; index++) {
        bubbleRise(timeMs, gauge.bubbles[index], gauge.rise, bubbleState);
        const y = bubbleBaseY + bubbleState.offsetY;
        const alpha = byteAlpha(bubbleState.alpha);
        const left = bubbleSprites[index * 2];
        const right = bubbleSprites[index * 2 + 1];
        left.y = y;
        right.y = y;
        left.alpha = alpha;
        right.alpha = alpha;
      }

      const opacity = breatheOpacity(timeMs, accent);
      accentGlow.alpha = byteAlpha(opacity);
      accentOverlap.alpha = byteAlpha(opacity * (1 - opacity));

      glintState(timeMs, bar, glint);
      glintRight.x = glintX + glint.offset;
      glintLeft.x = glintX - glint.offset;
      const glintAlpha = byteAlpha(glint.alpha);
      glintRight.alpha = glintAlpha;
      glintLeft.alpha = glintAlpha;
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
      gaugeFill,
      update,
      setLayerVisible(layer, visible) {
        userVisible[layer] = visible;
        if (!destroyed) applyVisibility();
      },
      isLayerVisible: (layer) => userVisible[layer],
      warmUp(render) {
        const forced = !destroyed && userVisible.bar && !barLayer.visible;
        if (forced) barLayer.visible = true;
        try {
          render();
        } finally {
          if (forced && !destroyed) applyVisibility();
        }
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        disposeOwned();
      },
    };
  }
}
