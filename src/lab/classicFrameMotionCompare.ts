import { Application, Container, ImageSource, Sprite, Texture, type TextureSourceOptions } from 'pixi.js';
import { FRAME_MOTION_TEXTURE_OPTIONS } from './classicFrameMotionOverlay';
import { createClassicFrameMotion, createFrameMotionTextures, type ClassicFrameMotion, type ClassicFrameMotionOptions } from './classicFrameMotion';
import { viewBoxTransform, type FrameMotionAssets, type FrameViewBox } from './classicFrameMotionData';

/**
 * 프레임만 그리는 작은 Pixi 앱(GameRenderer 아님). 승인된 SVG와 같은 바탕(SVG의 #fm-base 그림) 위에 움직임 레이어를
 * 얹어, 같은 시각·같은 viewBox로 SVG와 나란히 비교한다. E2E 픽셀 비교도 이 함수로 원본 크기(1024×1536) 화면을 만든다.
 */

export interface FrameMotionPreview {
  readonly app: Application;
  readonly motion: ClassicFrameMotion;
  /** 실제로 얻은 MSAA 샘플 수(0이면 안티앨리어싱 없음). antialias를 요청해도 환경이 거절하면 0이다. */
  readonly samples: number;
  setViewBox(box: FrameViewBox): void;
  resize(width: number, height: number, resolution: number): void;
  /** 움직임 시계 timeMs로 맞추고 한 장 그린다. */
  render(timeMs: number): void;
  destroy(): void;
}

export async function createFrameMotionPreview(options: {
  /** 이 앱 전용 캔버스. WebGL 컨텍스트 속성(antialias)은 캔버스마다 한 번만 정해지므로 다시 만들 때는 새 캔버스를 넘긴다. */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  resolution: number;
  base: HTMLImageElement;
  assets: FrameMotionAssets;
  textureOptions?: Partial<TextureSourceOptions>;
  preserveDrawingBuffer?: boolean;
  /** MSAA. 게임 렌더러는 끈 채로 쓰므로 기본은 꺼짐이다. 스텐실 띠 경계가 얼마나 부드러워지는지 비교하는 데 쓴다. */
  antialias?: boolean;
  /** 띠 가장자리 방식(classicFrameMotion의 bandEdges). 기본은 게임과 같은 스텐실이다. */
  bandEdges?: ClassicFrameMotionOptions['bandEdges'];
}): Promise<FrameMotionPreview> {
  // 텍스처는 게임 무대의 새 프레임과 같은 설정(밉맵·삼선형)으로 만들어 줄여 볼 때도 같은 선명도로 비교한다.
  const {
    canvas, width, height, resolution, base, assets, textureOptions = FRAME_MOTION_TEXTURE_OPTIONS, preserveDrawingBuffer = false,
    antialias = false, bandEdges = 'stencil',
  } = options;
  // 앱 CSP가 eval을 막으므로 GameRenderer처럼 eval 없는 셰이더 동기화 모듈을 먼저 읽는다.
  await import('pixi.js/unsafe-eval');
  const app = new Application();
  // init 뒤 어디서 실패하든 만든 것을 거꾸로 정리하고(앱은 GL 컨텍스트까지 놓는다) 오류를 그대로 올린다.
  const cleanups: (() => void)[] = [];
  const cleanUp = () => {
    for (const cleanup of cleanups.reverse()) {
      try { cleanup(); } catch (error) { console.warn('classicFrameMotionCompare: cleanup failed', error); }
    }
    cleanups.length = 0;
  };
  try {
    cleanups.push(() => app.destroy({ removeView: false }, { children: true }));
    await app.init({
      canvas,
      width,
      height,
      resolution,
      autoStart: false,
      autoDensity: false,
      antialias,
      preference: 'webgl',
      background: '#000000',
      preserveDrawingBuffer,
    });
    const baseSource = new ImageSource({ resource: base, ...textureOptions });
    cleanups.push(() => baseSource.destroy());
    const baseTexture = new Texture({ source: baseSource });
    cleanups.push(() => baseTexture.destroy(false));
    const motionTextures = createFrameMotionTextures(assets.images, textureOptions);
    cleanups.push(() => motionTextures.destroy());
    const motion = createClassicFrameMotion(assets.data, motionTextures.textures, { bandEdges });
    cleanups.push(() => motion.destroy());
    const root = new Container({ label: 'frame-motion-preview' });
    root.addChild(new Sprite({ texture: baseTexture, label: 'frame-motion-preview-base' }), motion.container);
    app.stage.addChild(root);
    const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    const samples = gl ? Number(gl.getParameter(gl.SAMPLES)) || 0 : 0;

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
      samples,
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
        cleanUp();
      },
    };
  } catch (error) {
    cleanUp();
    throw error;
  }
}
