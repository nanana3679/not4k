import { Application, Container, ImageSource, Sprite, Texture, type TextureSourceOptions } from 'pixi.js';
import { FRAME_FIT_TEXTURE_OPTIONS } from './classicFrameFitOverlay';
import { createClassicFrameMotion, createFrameMotionTextures, type ClassicFrameMotion } from './classicFrameMotion';
import { viewBoxTransform, type FrameMotionAssets, type FrameViewBox } from './classicFrameMotionData';

/**
 * 프레임만 그리는 작은 Pixi 앱(GameRenderer 아님). 승인된 SVG와 같은 바탕(SVG의 #fm-base 그림) 위에 움직임 레이어를
 * 얹어, 같은 시각·같은 viewBox로 SVG와 나란히 비교한다. E2E 픽셀 비교도 이 함수로 원본 크기(1024×1536) 화면을 만든다.
 */

export interface FrameMotionPreview {
  readonly app: Application;
  readonly motion: ClassicFrameMotion;
  setViewBox(box: FrameViewBox): void;
  resize(width: number, height: number, resolution: number): void;
  /** 움직임 시계 timeMs로 맞추고 한 장 그린다. */
  render(timeMs: number): void;
  destroy(): void;
}

export async function createFrameMotionPreview(options: {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resolution: number;
  base: HTMLImageElement;
  assets: FrameMotionAssets;
  textureOptions?: Partial<TextureSourceOptions>;
  preserveDrawingBuffer?: boolean;
}): Promise<FrameMotionPreview> {
  // 텍스처는 게임 무대의 새 프레임과 같은 설정(밉맵·삼선형)으로 만들어 줄여 볼 때도 같은 선명도로 비교한다.
  const { canvas, width, height, resolution, base, assets, textureOptions = FRAME_FIT_TEXTURE_OPTIONS, preserveDrawingBuffer = false } = options;
  // 앱 CSP가 eval을 막으므로 GameRenderer처럼 eval 없는 셰이더 동기화 모듈을 먼저 읽는다.
  await import('pixi.js/unsafe-eval');
  const app = new Application();
  await app.init({
    canvas,
    width,
    height,
    resolution,
    autoStart: false,
    autoDensity: false,
    antialias: false,
    preference: 'webgl',
    background: '#000000',
    preserveDrawingBuffer,
  });
  const baseSource = new ImageSource({ resource: base, ...textureOptions });
  const baseTexture = new Texture({ source: baseSource });
  const motionTextures = createFrameMotionTextures(assets.images, textureOptions);
  const motion = createClassicFrameMotion(assets.data, motionTextures.textures);
  const root = new Container({ label: 'frame-motion-preview' });
  root.addChild(new Sprite({ texture: baseTexture, label: 'frame-motion-preview-base' }), motion.container);
  app.stage.addChild(root);

  let viewBox: FrameViewBox = { x: 0, y: 0, width: assets.data.frame.width, height: assets.data.frame.height };
  let size = { width, height };
  const place = () => {
    const transform = viewBoxTransform(viewBox, size.width, size.height);
    root.scale.set(transform.scale);
    root.position.set(transform.x, transform.y);
  };
  place();
  let destroyed = false;

  return {
    app,
    motion,
    setViewBox(box) {
      viewBox = box;
      place();
    },
    resize(nextWidth, nextHeight, nextResolution) {
      size = { width: nextWidth, height: nextHeight };
      app.renderer.resize(nextWidth, nextHeight, nextResolution);
      place();
    },
    render(timeMs) {
      if (destroyed) return;
      motion.update(timeMs);
      app.render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      motion.destroy();
      motionTextures.destroy();
      baseTexture.destroy(false);
      baseSource.destroy();
      app.destroy({ removeView: false }, { children: true });
    },
  };
}
