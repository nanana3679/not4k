import { Container, Graphics, ImageSource, Rectangle, Sprite, Texture, type TextureSource, type TextureSourceOptions } from 'pixi.js';
import { supportsFrameMotion, type FrameFitLayout } from './classicFrameFit';

/**
 * GameRenderer의 레이어는 private이다. 게임 코드를 바꾸지 않고 기존 테스트처럼 실행 시점에 꺼내 쓴다.
 * gearFrameLayer는 판정선·레인 키 라벨 위, 키봄(effectLayer)·UI 아래에 있어 실제 기어와 같은 깊이다.
 */
export function getGearFrameLayer(renderer: object): Container {
  const layer = (renderer as { gearFrameLayer?: unknown }).gearFrameLayer;
  if (!(layer instanceof Container)) {
    throw new Error('GameRenderer에서 gearFrameLayer를 찾을 수 없습니다. 레이어 이름이 바뀌었다면 Classic Frame Fit 미리보기도 함께 고쳐야 합니다.');
  }
  return layer;
}

/** 현재 게임 기어(showGearFrame) 스프라이트. 위치·배율을 실제 값으로 읽어 표시하는 데만 쓴다. */
export function getGearFrameSprite(renderer: object): Sprite | null {
  if (!('gearFrameSprite' in renderer)) {
    throw new Error('GameRenderer에서 gearFrameSprite를 찾을 수 없습니다. 기어 필드 이름이 바뀌었다면 Classic Frame Fit 미리보기도 함께 고쳐야 합니다.');
  }
  const sprite = (renderer as { gearFrameSprite: unknown }).gearFrameSprite;
  if (sprite === null) return null;
  if (!(sprite instanceof Sprite)) throw new Error('GameRenderer의 gearFrameSprite가 Sprite가 아닙니다.');
  return sprite;
}

function getGameLaneMaskParts(renderer: object): { mask: Graphics; buttons: Sprite[] } {
  const { maskGraphic, buttonSprites } = renderer as { maskGraphic?: unknown; buttonSprites?: unknown };
  if (!(maskGraphic instanceof Graphics)) {
    throw new Error('GameRenderer에서 maskGraphic을 찾을 수 없습니다. 마스크 필드 이름이 바뀌었다면 Classic Frame Fit 미리보기도 함께 고쳐야 합니다.');
  }
  if (!Array.isArray(buttonSprites) || !buttonSprites.every((sprite) => sprite instanceof Sprite)) {
    throw new Error('GameRenderer에서 buttonSprites(Sprite 배열)를 찾을 수 없습니다. 버튼 필드 이름이 바뀌었다면 Classic Frame Fit 미리보기도 함께 고쳐야 합니다.');
  }
  return { mask: maskGraphic, buttons: buttonSprites as Sprite[] };
}

/**
 * 게임의 판정선 아래 레인 마스크와 40×40 버튼 스프라이트를 켜고 끈다. uniform은 판정선과 덱 사이 틈에서
 * 놓친 노트가 보이도록 이것들을 끄고 덱 위끝부터 덮는 마스크를 오버레이에 둔다.
 * setLift는 마스크를 다시 그리기만 하고 visible은 건드리지 않지만, 호출자는 setLift와 렌더러 재생성 뒤 다시 건다.
 */
export function setGameLaneMaskVisible(renderer: object, visible: boolean): void {
  const { mask, buttons } = getGameLaneMaskParts(renderer);
  mask.visible = visible;
  for (const button of buttons) button.visible = visible;
}

export function isGameLaneMaskVisible(renderer: object): boolean {
  return getGameLaneMaskParts(renderer).mask.visible;
}

/** 렌더러가 실제로 쓰는 판정선 y(렌더러 논리 단위). setLift가 반영됐는지 화면 밖에서 확인하는 데 쓴다. */
export function readJudgmentLineY(renderer: object): number {
  const value = (renderer as { _judgmentLineY?: unknown })._judgmentLineY;
  if (typeof value !== 'number') {
    throw new Error('GameRenderer에서 _judgmentLineY를 찾을 수 없습니다. 판정선 필드 이름이 바뀌었다면 Classic Frame Fit 미리보기도 함께 고쳐야 합니다.');
  }
  return value;
}

/**
 * 새 프레임 텍스처 설정. 레인 폭에 맞추면 1024px 그림이 렌더 높이·레인 폭에 따라 화면 0.4~1.7배로 그려지므로,
 * 줄일 때 계단·반짝임이 없도록 업로드 때 밉맵을 만들고 확대·축소·밉맵 사이를 모두 선형으로 거른다(WebGL2 삼선형).
 * 세로로 더 줄이는 squash를 위해 이방성 필터도 켠다(지원하지 않는 GPU는 무시). 현재 게임 기어 텍스처는 건드리지 않는다.
 */
export const FRAME_FIT_TEXTURE_OPTIONS = {
  autoGenerateMipmaps: true,
  scaleMode: 'linear',
  maxAnisotropy: 8,
} as const satisfies Partial<TextureSourceOptions>;

export function createFrameFitSource(image: HTMLImageElement): ImageSource {
  return new ImageSource({ resource: image, ...FRAME_FIT_TEXTURE_OPTIONS });
}

/**
 * 새 프레임 그림을 레이아웃 조각(원본 행 범위)마다 서브 텍스처 스프라이트로 얹는다.
 * 렌더러 dispose는 텍스처를 파괴하지 않으므로 서브 텍스처와 원본 소스는 이 객체가 정리한다.
 * 움직임 레이어(프레임 그림 좌표 컨테이너)는 한 장 배치(crop·uniform)에서만 프레임 스프라이트 바로 위에
 * 같은 변환으로 얹는다. 움직임 컨테이너 자체의 정리는 붙인 쪽이 한다.
 */
export class FrameFitOverlay {
  private readonly container = new Container({ label: 'classic-frame-fit' });
  private sprites: Sprite[] = [];
  private textures: Texture[] = [];
  private laneMask: Graphics | null = null;
  private laneMaskKey = '';
  private destroyed = false;
  private layout: FrameFitLayout | null = null;
  private motionHolder: Container | null = null;
  private motionEnabled = true;
  private placed = false;

  constructor(layer: Container, private readonly source: TextureSource) {
    layer.addChild(this.container);
  }

  /** 지금 레이아웃이 움직임을 얹는 한 장 배치인지(crop·uniform). */
  get motionPlaced(): boolean {
    return this.placed;
  }

  /** 움직임 컨테이너를 붙이거나(null이면 뗀다) 지금 레이아웃에 맞춰 놓는다. */
  attachMotion(motion: Container | null): void {
    if (this.destroyed || this.container.destroyed) return;
    if (!this.motionHolder) this.motionHolder = new Container({ label: 'classic-frame-fit-motion' });
    this.motionHolder.removeChildren();
    if (motion) this.motionHolder.addChild(motion);
    this.placeMotion();
  }

  /** 움직임 켜기·끄기(페이지의 움직임 토글). 한 장 배치가 아니면 켜도 보이지 않는다. */
  setMotionEnabled(enabled: boolean): void {
    this.motionEnabled = enabled;
    this.placeMotion();
  }

  apply(layout: FrameFitLayout | null): void {
    if (this.destroyed || this.container.destroyed) return;
    this.layout = layout;
    this.applyLaneMask(layout?.laneMask ?? null);
    // 위치만 바뀌면 같은 서브 텍스처를 쓰는 스프라이트를 옮기기만 한다.
    const sprites = this.sprites;
    if (layout && sprites.length === layout.slices.length && sprites.length > 0 && layout.slices.every((slice, index) => (
      sprites[index].texture.frame.y === slice.sourceTop
      && sprites[index].texture.frame.height === slice.sourceBottom - slice.sourceTop
    ))) {
      layout.slices.forEach((slice, index) => {
        sprites[index].position.set(slice.x, slice.y);
        sprites[index].scale.set(slice.scaleX, slice.scaleY);
      });
      this.placeMotion();
      return;
    }
    this.clearSprites();
    if (!layout) {
      this.placeMotion();
      return;
    }
    for (const slice of layout.slices) {
      const texture = new Texture({
        source: this.source,
        frame: new Rectangle(0, slice.sourceTop, this.source.width, slice.sourceBottom - slice.sourceTop),
      });
      const sprite = new Sprite(texture);
      sprite.position.set(slice.x, slice.y);
      sprite.scale.set(slice.scaleX, slice.scaleY);
      this.textures.push(texture);
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    }
    this.placeMotion();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearSprites();
    this.applyLaneMask(null);
    if (this.motionHolder && !this.motionHolder.destroyed) {
      this.motionHolder.removeChildren();
      this.motionHolder.removeFromParent();
      this.motionHolder.destroy();
    }
    this.motionHolder = null;
    if (!this.container.destroyed) {
      this.container.removeFromParent();
      this.container.destroy();
    }
    this.source.destroy();
  }

  /** 프레임 조각 아래(컨테이너 맨 앞)에 레인 마스크를 둔다. 같은 사각형이면 다시 그리지 않는다. */
  private applyLaneMask(mask: FrameFitLayout['laneMask']): void {
    const key = mask ? `${mask.x}:${mask.y}:${mask.width}:${mask.height}:${mask.color}` : '';
    if (key === this.laneMaskKey) return;
    this.laneMaskKey = key;
    if (this.laneMask && !this.laneMask.destroyed) {
      this.laneMask.removeFromParent();
      this.laneMask.destroy();
    }
    this.laneMask = null;
    if (!mask || this.container.destroyed) return;
    this.laneMask = new Graphics({ label: 'classic-frame-fit-lane-mask' })
      .rect(mask.x, mask.y, mask.width, mask.height)
      .fill(mask.color);
    this.container.addChildAt(this.laneMask, 0);
  }

  /** 한 장 배치면 그 조각의 위치·배율을 그대로 쓰고, 새 스프라이트가 생겨도 맨 위(마지막 자식)에 둔다. */
  private placeMotion(): void {
    const holder = this.motionHolder;
    if (!holder || holder.destroyed || this.container.destroyed) return;
    const layout = this.layout;
    const slice = layout && supportsFrameMotion(layout.mode) && layout.slices.length === 1 ? layout.slices[0] : null;
    this.placed = slice !== null;
    if (slice) {
      holder.position.set(slice.x, slice.y);
      holder.scale.set(slice.scaleX, slice.scaleY);
    }
    holder.visible = this.placed && this.motionEnabled;
    const { children } = this.container;
    if (children[children.length - 1] !== holder) this.container.addChild(holder);
  }

  private clearSprites(): void {
    for (const sprite of this.sprites) {
      if (sprite.destroyed) continue;
      sprite.removeFromParent();
      sprite.destroy();
    }
    this.sprites = [];
    for (const texture of this.textures) if (!texture.destroyed) texture.destroy(false);
    this.textures = [];
  }
}
