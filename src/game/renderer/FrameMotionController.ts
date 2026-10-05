import type { Container } from 'pixi.js';
import { createClassicFrameMotion, type ClassicFrameMotion, type FrameMotionTextures } from './classicFrameMotion';
import type { FrameMotionAssetLease, FrameMotionResources } from './classicFrameMotionAssets';
import { FRAME_MOTION_LAYERS, type FrameMotionLayer, type FrameMotionLayerVisibility } from './classicFrameMotionData';

/**
 * 한 게임 프레임에 움직임 시계가 나아가는 최대 시간(ms). 숨은 탭에서 돌아오거나 프레임 하나가 길어도 광원이 건너뛰지 않게
 * 비행 배경(0.05초)과 같은 값으로 자른다.
 */
export const FRAME_MOTION_MAX_STEP_MS = 50;

/** loading: 자료를 읽는 중(프레임만 보임) · ready: 움직임을 얹음 · error: 자료를 못 읽어 정적 프레임만 보임. */
export type FrameMotionStatus = 'loading' | 'ready' | 'error';

/**
 * GameRenderer.frameMotion이 돌려주는 프레임 움직임 조절. 게임은 만들 때 움직임 줄이기만 걸고, Lab 미리보기 조절 패널과 E2E가
 * 나머지를 쓴다. 시계는 렌더러의 게임 프레임(renderFrame의 deltaMs)으로만 나아가므로 일시정지 중에는 멈춰 있다.
 */
export interface FrameMotionControls {
  readonly status: FrameMotionStatus;
  /** 움직임 시계(ms, 승인 SVG 애니메이션의 currentTime과 같은 뜻). 렌더러를 만들 때 0에서 시작한다. */
  readonly timeMs: number;
  /** 지금 움직이는지: 얹었고(ready)·켜져 있고·움직임 줄이기가 아님. 이때만 게임 프레임마다 갱신 비용이 든다. */
  readonly running: boolean;
  readonly enabled: boolean;
  readonly reducedMotion: boolean;
  /** 끄면 움직임을 숨기고 시계를 멈춘다(객체는 남는다). 게임 설정의 끄기는 렌더러를 만들 때 frameMotion: false로 객체 자체를 만들지 않는다. */
  setEnabled(enabled: boolean): void;
  setLayerVisible(layer: FrameMotionLayer, visible: boolean): void;
  isLayerVisible(layer: FrameMotionLayer): boolean;
  /** 움직임 줄이기: 움직임 레이어를 모두 숨기고 시계를 멈춘다(정적 프레임만 보임). */
  setReducedMotion(reduced: boolean): void;
  /** 시계를 timeMs로 옮기고 그 순간의 모습으로 맞춘다. */
  seek(timeMs: number): void;
  /** 시계를 0으로 되돌린다(seek(0)). */
  restart(): void;
  /**
   * B 게이지 액체·기포를 담은 채움 컨테이너(프레임 그림 좌표, 유리 윤곽 마스크 아래). 고도 게이지가 채움 높이로 자를 자리다.
   * 움직임을 얹기 전이면 null.
   */
  readonly gaugeFill: Container | null;
}

export interface FrameMotionControllerOptions {
  /** 프레임 레이어에 프레임과 같은 변환으로 붙인 자리. 자료가 준비되면 움직임 컨테이너가 여기에 들어간다. */
  holder: Container;
  lease: FrameMotionAssetLease;
  /** 움직임을 얹기 전에 준비된 텍스처를 GPU에 올린다(렌더러가 주입). 없으면 처음 그릴 때 올린다. */
  upload?: (textures: FrameMotionTextures) => void;
  /** @internal 테스트용 움직임 생성 함수. */
  create?: typeof createClassicFrameMotion;
  /** @internal 탭이 숨었는지. 기본은 document.hidden. */
  isHidden?: () => boolean;
}

const documentHidden = () => typeof document !== 'undefined' && document.hidden;

/**
 * 게임 렌더러의 내장 프레임 위에 얹는 프레임 움직임 하나의 수명. 렌더러가 프레임을 그리고 움직임을 켤 때 만든다.
 * 자료 임대가 준비되기를 기다리지 않고, 준비되면 자리(holder)에 움직임을 얹는다. 그 전에는 정적 프레임만 보인다.
 * 시계는 advance(deltaMs)로만 나아간다. 게임 루프는 일시정지 중에 renderFrame을 부르지 않으므로 시계도 멈춘다.
 * 큰 간격은 FRAME_MOTION_MAX_STEP_MS로 자르고, 숨은 탭·움직임 줄이기·끔에서는 나아가지 않는다(비행 배경과 같은 규칙).
 * advance는 매 프레임 객체를 만들지 않는다.
 */
export class FrameMotionController implements FrameMotionControls {
  private readonly holder: Container;
  private readonly lease: FrameMotionAssetLease;
  private readonly upload?: (textures: FrameMotionTextures) => void;
  private readonly create: typeof createClassicFrameMotion;
  private readonly isHidden: () => boolean;
  private motion: ClassicFrameMotion | null = null;
  private currentStatus: FrameMotionStatus = 'loading';
  private clockMs = 0;
  private on = true;
  private reduced = false;
  private readonly layers: FrameMotionLayerVisibility = { armor: true, gauge: true, accent: true, bar: true };
  private destroyed = false;

  constructor(options: FrameMotionControllerOptions) {
    this.holder = options.holder;
    this.lease = options.lease;
    this.upload = options.upload;
    this.create = options.create ?? createClassicFrameMotion;
    this.isHidden = options.isHidden ?? documentHidden;
    options.lease.ready.then((resources) => this.attach(resources), (error: unknown) => this.fail(error));
  }

  get status(): FrameMotionStatus { return this.currentStatus; }
  get timeMs(): number { return this.clockMs; }
  get running(): boolean { return this.motion !== null && this.on && !this.reduced; }
  get enabled(): boolean { return this.on; }
  get reducedMotion(): boolean { return this.reduced; }
  get gaugeFill(): Container | null { return this.motion?.gaugeFill ?? null; }

  /** 게임 프레임 하나만큼 시계를 나아가게 한다(GameRenderer.renderFrame이 부른다). */
  advance(deltaMs: number): void {
    const motion = this.motion;
    if (motion === null || !this.on || this.reduced) return;
    if (!(deltaMs > 0) || deltaMs === Number.POSITIVE_INFINITY || this.isHidden()) return;
    this.clockMs += Math.min(FRAME_MOTION_MAX_STEP_MS, deltaMs);
    motion.update(this.clockMs);
  }

  setEnabled(enabled: boolean): void {
    this.on = enabled;
    if (!this.holder.destroyed) this.holder.visible = enabled;
  }

  setLayerVisible(layer: FrameMotionLayer, visible: boolean): void {
    this.layers[layer] = visible;
    this.motion?.setLayerVisible(layer, visible);
  }

  isLayerVisible(layer: FrameMotionLayer): boolean {
    return this.layers[layer];
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    this.motion?.setReducedMotion(reduced);
  }

  seek(timeMs: number): void {
    this.clockMs = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
    // 움직임 줄이기 중에는 update가 아무것도 바꾸지 않는다. 풀린 뒤 다음 advance가 이 시각부터 그린다.
    this.motion?.update(this.clockMs);
  }

  restart(): void {
    this.seek(0);
  }

  /** 움직임을 정리하고 임대를 놓는다(두 번 불러도 한 번만). 자리(holder)는 렌더러가 프레임 레이어와 함께 파괴한다. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.motion?.destroy();
    this.motion = null;
    this.lease.release();
  }

  private attach(resources: FrameMotionResources): void {
    if (this.destroyed || this.holder.destroyed) return;
    let motion: ClassicFrameMotion;
    try {
      this.upload?.(resources.textures);
      motion = this.create(resources.data, resources.textures);
    } catch (error) {
      this.fail(error);
      return;
    }
    for (const layer of FRAME_MOTION_LAYERS) motion.setLayerVisible(layer, this.layers[layer]);
    motion.update(this.clockMs);
    motion.setReducedMotion(this.reduced);
    this.holder.addChild(motion.container);
    this.motion = motion;
    this.currentStatus = 'ready';
  }

  private fail(error: unknown): void {
    if (this.destroyed) return;
    this.currentStatus = 'error';
    // 움직임은 장식이라 자료를 못 읽어도 게임은 정적 프레임으로 계속한다. 읽은 참조는 바로 놓는다.
    console.warn('Classic frame motion is unavailable; drawing the static frame only.', error);
    this.lease.release();
  }
}
