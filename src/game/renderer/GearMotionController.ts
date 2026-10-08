import type { Container, Texture } from 'pixi.js';
import { createGearMotion, type GearMotion } from './gearMotion';
import { GearMotionLeaseReleasedError, type GearMotionAssetLease, type GearMotionResources } from './gearMotionAssets';
import { GEAR_MOTION_LAYERS, GEAR_MOTION_TEXTURE_KEYS, type GearMotionLayer, type GearMotionLayerVisibility } from './gearMotionData';

/**
 * 렌더 프레임 하나에 애니메이션 경과 시간이 나아가는 최대 시간(ms). 숨은 탭에서 돌아오거나 프레임 하나가 길어도 광원이 건너뛰지 않게
 * 비행 배경(0.05초)과 같은 값으로 자른다.
 */
export const GEAR_MOTION_MAX_STEP_MS = 50;

/**
 * loading: `gearMotion` 에셋을 읽는 중(렌더러 init이 끝나기 전에만 보인다) · ready: `gearMotion`을 `holder`에 추가함.
 * `gearMotion` 에셋은 스킨 텍스처처럼 필수라, 읽지 못하면 렌더러 init이 그 오류로 실패한다(읽기 실패 상태는 남지 않는다).
 */
export type GearMotionStatus = 'loading' | 'ready';

/**
 * GameRenderer.gearMotion이 돌려주는 `gearMotion`(기어 위 장식 애니메이션: 광원 띠·게이지 액체 흐름과 기포·발광선·하단 바 빛) 조절.
 * 렌더러 init이 끝나면 `gearMotion`은 이미 `holder`에 추가돼 있다(status ready).
 * Lab 미리보기 조절 패널은 켜기·레이어·`setReducedMotion`·처음부터 재생을 쓴다. 애니메이션 경과 시간은 렌더러의 렌더 프레임 간격(renderFrame의 deltaMs)으로만 나아가므로
 * 일시정지 중에는 멈춰 있다.
 */
export interface GearMotionControls {
  readonly status: GearMotionStatus;
  /** 애니메이션 경과 시간(ms, 승인 SVG 애니메이션의 currentTime과 같은 뜻). 렌더러를 만들 때 0에서 시작한다. */
  readonly timeMs: number;
  /** 지금 재생 중인지: `holder`에 추가했고(ready)·켜져 있고·`setReducedMotion(true)`가 아님. 이때만 렌더 프레임마다 갱신 비용이 든다. */
  readonly running: boolean;
  /** 끄면 `gearMotion`을 숨기고 애니메이션 경과 시간을 멈춘다(객체는 남는다, Lab 토글). 게임 설정의 끄기는 렌더러를 만들 때 객체 자체를 만들지 않는다. */
  setEnabled(enabled: boolean): void;
  setLayerVisible(layer: GearMotionLayer, visible: boolean): void;
  /** Lab 미리보기 전용(게임은 부르지 않는다, RFD 0030): `gearMotion` 레이어를 모두 숨기고 애니메이션 경과 시간을 멈춘다(정적 기어만 보임). */
  setReducedMotion(reduced: boolean): void;
  /** 애니메이션 경과 시간을 timeMs로 옮기고 그 순간의 모습으로 맞춘다(Lab·검증 스크린샷이 광원 위치를 바로 고를 때). */
  seek(timeMs: number): void;
  /** 애니메이션 경과 시간을 0으로 되돌린다(Lab 처음부터 재생). */
  restart(): void;
  /**
   * B 게이지 액체·기포를 담은 채움 컨테이너(기어 그림 좌표, 유리 윤곽 마스크 아래). 고도 게이지는 이것을 자르지 않고 기어 레이어에서
   * 그 위에 빈 유리 덮개를 겹친다(빈 부분에서는 덮개가 가린다). 구성 확인용이며, `gearMotion`을 추가하기 전이면 null.
   */
  readonly gaugeFill: Container | null;
}

export interface GearMotionControllerOptions {
  /** 기어 레이어에 기어와 같은 변환으로 붙인 컨테이너. 에셋이 준비되면 `gearMotion` 컨테이너가 여기에 들어간다. */
  holder: Container;
  lease: GearMotionAssetLease;
  /** @internal 테스트용 `gearMotion` 생성 함수. */
  create?: typeof createGearMotion;
  /** @internal 탭이 숨었는지. 기본은 document.hidden. */
  isHidden?: () => boolean;
}

const documentHidden = () => typeof document !== 'undefined' && document.hidden;

/**
 * 게임 렌더러의 내장 기어 위에 추가하는 `gearMotion` 하나의 수명. 렌더러가 기어를 그리고 `gearMotion`을 켤 때 만든다.
 * 에셋 lease가 준비되면 `holder`에 `gearMotion`을 추가(`addChild`)하고 ready를 이행한다. 렌더러 init은 ready를 기다리므로 곡이 시작되기 전에 추가된다.
 * 에셋을 읽지 못하거나 `gearMotion`을 만들지 못하면 lease를 release하고 ready가 그 오류로 거절된다(필수 에셋, 렌더러 init 실패로 이어진다).
 * 애니메이션 경과 시간은 advance(deltaMs)로만 나아간다. 게임 루프는 일시정지 중에 renderFrame을 부르지 않으므로 애니메이션 경과 시간도 멈춘다.
 * 큰 간격은 GEAR_MOTION_MAX_STEP_MS로 자르고, 숨은 탭·끔·`setReducedMotion(true)`(Lab 전용)에서는 나아가지 않는다.
 * advance는 매 프레임 객체를 만들지 않는다.
 */
export class GearMotionController implements GearMotionControls {
  /** `gearMotion`을 추가하면 이행하고, 에셋을 못 읽거나 만들지 못하거나 그 전에 destroy되면 거절한다. 렌더러 init이 기다린다. */
  readonly ready: Promise<void>;
  private readonly holder: Container;
  private readonly lease: GearMotionAssetLease;
  private readonly create: typeof createGearMotion;
  private readonly isHidden: () => boolean;
  private motion: GearMotion | null = null;
  private motionTextures: readonly Texture[] = [];
  private currentStatus: GearMotionStatus = 'loading';
  private clockMs = 0;
  private on = true;
  private reduced = false;
  private readonly layers: GearMotionLayerVisibility = { armor: true, gauge: true, accent: true, bar: true };
  private destroyed = false;
  private leaseReleased = false;

  constructor(options: GearMotionControllerOptions) {
    this.holder = options.holder;
    this.lease = options.lease;
    this.create = options.create ?? createGearMotion;
    this.isHidden = options.isHidden ?? documentHidden;
    this.ready = options.lease.ready.then(
      (resources) => this.attach(resources),
      (error: unknown) => {
        this.releaseLease();
        throw error;
      },
    );
    // 기다리는 쪽(렌더러 init)이 거절을 받는다. 기다리지 않는 쪽(단위 테스트 등)에서 처리되지 않은 거절로 남지 않게만 한다.
    this.ready.catch(() => undefined);
  }

  get status(): GearMotionStatus { return this.currentStatus; }
  get timeMs(): number { return this.clockMs; }
  get running(): boolean { return this.motion !== null && this.on && !this.reduced; }
  get gaugeFill(): Container | null { return this.motion?.gaugeFill ?? null; }

  /**
   * `gearMotion`이 그리는 텍스처 9개. 재생 중(running: 추가했고·켜져 있고·`setReducedMotion(true)`가 아님)에만 돌려주고, 그 밖에는 그리지 않으므로 빈 배열이다.
   * 곡 시작 전 준비(GameRenderer.prepareForPlayback)가 미리 GPU 업로드할 목록에 넣는다. 텍스처는 공유 로더 소유다.
   */
  get textures(): readonly Texture[] { return this.running ? this.motionTextures : []; }

  /** 렌더 프레임 하나만큼 애니메이션 경과 시간을 나아가게 한다(GameRenderer.renderFrame이 부른다). */
  advance(deltaMs: number): void {
    const motion = this.motion;
    if (motion === null || !this.on || this.reduced) return;
    if (!(deltaMs > 0) || deltaMs === Number.POSITIVE_INFINITY || this.isHidden()) return;
    this.clockMs += Math.min(GEAR_MOTION_MAX_STEP_MS, deltaMs);
    motion.update(this.clockMs);
  }

  setEnabled(enabled: boolean): void {
    this.on = enabled;
    if (!this.holder.destroyed) this.holder.visible = enabled;
  }

  setLayerVisible(layer: GearMotionLayer, visible: boolean): void {
    this.layers[layer] = visible;
    this.motion?.setLayerVisible(layer, visible);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    this.motion?.setReducedMotion(reduced);
  }

  seek(timeMs: number): void {
    this.clockMs = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
    // setReducedMotion(true) 중에는 update가 아무것도 바꾸지 않는다. 풀린 뒤 다음 advance가 이 시각부터 그린다.
    this.motion?.update(this.clockMs);
  }

  restart(): void {
    this.seek(0);
  }

  /**
   * render를 한 번 부른다. `gearMotion`을 추가했으면 그동안 빛이 투명해 숨겨 둔 하단 바(알파 마스크 필터)도 그려 필터를 준비한다(화면은 그대로).
   * 곡 시작 전 준비의 첫 프레임(GameRenderer.prepareForPlayback)에 쓴다.
   */
  warmUp(render: () => void): void {
    if (this.motion && this.on && !this.reduced) this.motion.warmUp(render);
    else render();
  }

  /** `gearMotion`을 destroy하고 lease를 release한다(두 번 불러도 한 번만). `holder`는 렌더러가 기어 레이어와 함께 파괴한다. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.motion?.destroy();
    this.motion = null;
    this.motionTextures = [];
    this.releaseLease();
  }

  private attach(resources: GearMotionResources): void {
    if (this.destroyed || this.holder.destroyed) throw new GearMotionLeaseReleasedError();
    let motion: GearMotion;
    try {
      motion = this.create(resources.data, resources.textures);
    } catch (error) {
      this.releaseLease();
      throw error;
    }
    for (const layer of GEAR_MOTION_LAYERS) motion.setLayerVisible(layer, this.layers[layer]);
    motion.update(this.clockMs);
    motion.setReducedMotion(this.reduced);
    this.holder.addChild(motion.container);
    this.motion = motion;
    this.motionTextures = GEAR_MOTION_TEXTURE_KEYS.map((key) => resources.textures[key]);
    this.currentStatus = 'ready';
  }

  private releaseLease(): void {
    if (this.leaseReleased) return;
    this.leaseReleased = true;
    this.lease.release();
  }
}
