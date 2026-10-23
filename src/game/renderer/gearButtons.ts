import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import buttonJson from './gearButtonGeometry.json';
import { cubicBezierProgress, type CubicBezier } from './gearMotionTiming';

/**
 * 기어 버튼: 기어 키 덱의 네 버튼이 레인 키를 누르는 동안 눌려 빛나고, 떼면 버튼 누름 깊이 비교 시연(`press-depth.html`, PR #271)처럼
 * 키가 먼저 돌아온 뒤 빛이 꺼진다. 에셋은 생성기 `prepare-gear-buttons-v22.mjs`가 시연과 같은 계산으로 만든 아틀라스
 * (스킨 공통 `gearButtons`, `public/gear/gear-buttons.png`)와 그 atlas frame 측정 데이터(`gearButtonGeometry.json`)다.
 *
 * - 레이어: 버튼마다 tint(뗀 뒤 남는 빛, 더하기 블렌드)·glow(눌려 내려간 키와 빛, 보통 블렌드)·cap(대기 키캡 픽셀, 보통 블렌드)을
 *   이 순서로 겹친다. 시연의 tint 캔버스는 대기 + 남는 빛을 대기 위에 그린 것이라, 남는 빛만 더하는 것과 같다.
 *   레이어는 기어 그림 좌표로 그리고 기어가 투명한 곳(레인 창·열린 덱)은 비어 있어 게임 레인을 가리지 않는다.
 * - 누름: 누르는 순간(`setKey`) 다음 렌더 프레임에 바로 보이도록 표시를 바꾼다. 전환 시간을 두지 않는다.
 * - 뗌: 렌더 프레임 간격 `deltaMs`(`renderFrame`의 인자)로만 나아가 일시정지 중에는 멈춘다. cap이 `capMs`(40ms)에 걸쳐 덮이고,
 *   흰빛(glow)이 `whiteMs`(53ms)에, 남는 빛(tint)이 `glowMs`(150ms)에 걸쳐 꺼진다(시연의 CSS 전환과 같은 곡선).
 *   누른 뒤 한 번도 그리기 전에 뗀 경우만 첫 렌더 프레임을 경과 0으로 그려 짧은 누름도 보이게 한다.
 * - 깊이: 첫 키는 15px, 두 번째 키에서 60ms 동안 30px로 더 들어가며 하나만 남으면 40ms 동안 15px로 올라온다.
 *   깊이별 glow를 아틀라스에 미리 준비해 텍스처만 바꾼다. 전체 뗌에서는 그때의 깊이를 대기 키캡으로 덮는다.
 * - 색: 같은 레인의 hold 수만 따른다. 1개는 연파랑, 2개 이상은 금색이며 누름·뗌마다 즉시 갱신한다.
 *   마지막 키를 떼면 직전 표시 색으로 잔광을 진행한다. 게임은 판정 적용 순서로 입력을 재생한다.
 * - 비용: 스프라이트와 텍스처는 만들 때 한 번만 만들고, 이후에는 보이기·알파·텍스처 교체만 한다. 렌더 프레임마다 객체를 만들지 않는다.
 */

export type GearButtonColor = 'single' | 'double';
export const GEAR_BUTTON_COLORS: readonly GearButtonColor[] = ['single', 'double'];

/** 같은 레인에서 현재 눌린 서로 다른 키의 수로 색을 정한다. hold 수가 0이면 이 색 대신 복귀 상태를 표시한다. */
export function gearButtonColorForHoldCount(holdCount: number): GearButtonColor {
  return holdCount >= 2 ? 'double' : 'single';
}

/** idle: 대기(레이어를 그리지 않음) · pressed: 눌림 · releasing: 뗀 뒤 돌아오는 중. */
export type GearButtonPhase = 'idle' | 'pressed' | 'releasing';

/** 레이어 하나의 atlas frame: 기어 그림 좌표의 범위(x, y, width, height)와 아틀라스 안에서 같은 범위의 왼쪽 위(atlasX, atlasY). */
export interface GearButtonFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  atlasX: number;
  atlasY: number;
}

export interface GearButtonFrames {
  glow: Readonly<Record<GearButtonColor, readonly GearButtonFrame[]>>;
  tint: Readonly<Record<GearButtonColor, GearButtonFrame>>;
  cap: GearButtonFrame;
}

/** 떼는 동작의 시간(ms)과 곡선(CSS cubic-bezier). */
export interface GearButtonRelease {
  capMs: number;
  whiteMs: number;
  glowMs: number;
  capEasing: CubicBezier;
  glowEasing: CubicBezier;
}

export interface GearButtonGeometry {
  atlasWidth: number;
  atlasHeight: number;
  depths: readonly number[];
  pressMotion: GearButtonPressMotion;
  release: GearButtonRelease;
  /** 레인 1~4의 버튼. */
  buttons: readonly GearButtonFrames[];
}

export interface GearButtonPressMotion {
  downMs: number;
  upMs: number;
  easing: CubicBezier;
}

const easing = (values: readonly number[]): CubicBezier => [values[0], values[1], values[2], values[3]];

export const GEAR_BUTTON_GEOMETRY: GearButtonGeometry = {
  atlasWidth: buttonJson.width,
  atlasHeight: buttonJson.height,
  depths: buttonJson.depths,
  pressMotion: { ...buttonJson.pressMotion, easing: easing(buttonJson.pressMotion.easing) },
  release: {
    capMs: buttonJson.release.capMs,
    whiteMs: buttonJson.release.whiteMs,
    glowMs: buttonJson.release.glowMs,
    capEasing: easing(buttonJson.release.capEasing),
    glowEasing: easing(buttonJson.release.glowEasing),
  },
  buttons: buttonJson.buttons.map(({ glow, tint, cap }) => ({ glow, tint, cap })),
};

/** 레이어 세 개의 불투명도(0~1). 눌림은 glow 1·tint 0·cap 0이다. */
export interface GearButtonLook {
  tint: number;
  glow: number;
  cap: number;
}

/**
 * 뗀 뒤 elapsedMs가 지났을 때 레이어 불투명도를 out에 쓴다(시연 CSS 전환과 같음): cap은 0→1(`capEasing`, `capMs`),
 * glow는 1→0(`glowEasing`, `whiteMs`), tint는 1→0(`glowEasing`, `glowMs`). 프레임마다 부르므로 새 객체를 만들지 않는다.
 */
export function gearButtonReleaseLook(elapsedMs: number, release: GearButtonRelease, out: GearButtonLook): GearButtonLook {
  out.cap = cubicBezierProgress(release.capEasing, elapsedMs / release.capMs);
  out.glow = 1 - cubicBezierProgress(release.glowEasing, elapsedMs / release.whiteMs);
  out.tint = 1 - cubicBezierProgress(release.glowEasing, elapsedMs / release.glowMs);
  return out;
}

/** 버튼 하나의 지금 상태(읽기 전용). Lab·E2E가 읽는다. */
export interface GearButtonStateView {
  readonly phase: GearButtonPhase;
  readonly color: GearButtonColor;
  /** 이 레인에서 지금 누르고 있는 입력 키 수. */
  readonly heldKeys: number;
  /** 눌림 레이어의 깊이(원본 px). 대기는 0이며, 전체 뗌의 키캡 덮개는 별도로 복귀한다. */
  readonly pressDepth: number;
  /** 뗀 뒤 지난 시간(ms). releasing이 아니면 0. */
  readonly releaseMs: number;
}

/**
 * 버튼 하나의 누름 상태(Pixi 없음). 같은 레인의 입력 키(물리 키 `KeyboardEvent.code`나 `AutoPlayer`의 합성 키)를 모아,
 * 하나라도 눌려 있으면 눌림이고 모두 떼면 돌아오기 시작한다. 돌아오는 중에 다시 누르면 바로 눌림이다.
 */
export class GearButtonState implements GearButtonStateView {
  private readonly keys = new Set<string>();
  private currentPhase: GearButtonPhase = 'idle';
  private currentColor: GearButtonColor = 'single';
  private elapsedMs = 0;
  /** 마지막 누름 이후 아직 렌더 프레임이 없으면 짧은 탭도 한 번은 눌린 모습으로 그린다. */
  private pressFresh = false;
  private currentDepth: number;
  private depthFrom: number;
  private depthTarget: number;
  private depthElapsedMs = 0;
  private depthDurationMs = 0;
  /** 입력 직전까지의 deltaMs를 새 전환에 더하지 않고 시작 깊이를 첫 프레임에 보인다. */
  private depthFresh = false;

  constructor(
    private readonly depths = GEAR_BUTTON_GEOMETRY.depths,
    private readonly pressMotion = GEAR_BUTTON_GEOMETRY.pressMotion,
  ) {
    this.currentDepth = this.depthFrom = this.depthTarget = depths[0];
  }

  get phase(): GearButtonPhase { return this.currentPhase; }
  get color(): GearButtonColor { return this.currentColor; }
  get heldKeys(): number { return this.keys.size; }
  get pressDepth(): number { return this.currentPhase === 'idle' ? 0 : this.currentDepth; }
  get releaseMs(): number { return this.currentPhase === 'releasing' ? this.elapsedMs : 0; }

  /**
   * key를 누르고 현재 hold 수로 버튼 색을 정한다. 같은 키의 중복 누름은 hold 수를 늘리지 않는다.
   * 상태나 색이 바뀌었으면 true.
   */
  press(key: string): boolean {
    const firstHold = this.keys.size === 0;
    this.keys.add(key);
    if (firstHold) {
      this.currentDepth = this.depthFrom = this.depthTarget = this.depths[0];
      this.depthFresh = false;
    }
    this.targetDepthForHoldCount();
    const pressColor = gearButtonColorForHoldCount(this.keys.size);
    const changed = this.currentPhase !== 'pressed' || this.currentColor !== pressColor;
    this.currentColor = pressColor;
    this.currentPhase = 'pressed';
    this.elapsedMs = 0;
    this.pressFresh = true;
    return changed;
  }

  /** key를 뗀다. 남은 hold 수로 색을 갱신하고, 마지막 키면 돌아오기 시작한다. 상태나 색이 바뀌었으면 true. */
  release(key: string): boolean {
    if (!this.keys.delete(key)) return false;
    if (this.keys.size > 0) {
      this.targetDepthForHoldCount();
      const color = gearButtonColorForHoldCount(this.keys.size);
      const changed = this.currentColor !== color;
      this.currentColor = color;
      return changed;
    }
    this.currentPhase = 'releasing';
    this.elapsedMs = 0;
    return true;
  }

  /**
   * 깊이 전환 또는 전체 뗌 복귀를 렌더 프레임 하나(deltaMs)만큼 진행한다. 전체 뗌은 glowMs 뒤 대기로 돌아간다.
   * 누른 뒤 한 번도 그리지 못한 경우만 경과 0으로 그린다. 이미 눌림을 그렸으면 뗀 뒤 첫 프레임부터 나아간다.
   */
  advance(deltaMs: number, release: GearButtonRelease): boolean {
    const fresh = this.pressFresh;
    this.pressFresh = false;
    if (this.currentPhase === 'pressed') {
      if (this.depthFresh) {
        this.depthFresh = false;
        return false;
      }
      if (!(deltaMs > 0) || this.currentDepth === this.depthTarget) return false;
      this.depthElapsedMs = Math.min(this.depthDurationMs, this.depthElapsedMs + deltaMs);
      const progress = cubicBezierProgress(this.pressMotion.easing, this.depthElapsedMs / this.depthDurationMs);
      this.currentDepth = this.depthFrom + (this.depthTarget - this.depthFrom) * progress;
      return true;
    }
    if (this.currentPhase !== 'releasing' || fresh) return false;
    if (!(deltaMs > 0)) return false;
    this.elapsedMs += deltaMs;
    if (this.elapsedMs >= release.glowMs) {
      this.currentPhase = 'idle';
      this.elapsedMs = 0;
    }
    return true;
  }

  private targetDepthForHoldCount(): void {
    const target = this.keys.size >= 2 ? this.depths[this.depths.length - 1] : this.depths[0];
    if (target === this.depthTarget) return;
    this.depthFrom = this.currentDepth;
    this.depthTarget = target;
    this.depthElapsedMs = 0;
    this.depthDurationMs = target > this.currentDepth ? this.pressMotion.downMs : this.pressMotion.upMs;
    this.depthFresh = true;
  }

  /** 지금 상태의 레이어 불투명도를 out에 쓴다. */
  look(release: GearButtonRelease, out: GearButtonLook): GearButtonLook {
    if (this.currentPhase === 'pressed') {
      out.tint = 0;
      out.glow = 1;
      out.cap = 0;
      return out;
    }
    if (this.currentPhase === 'idle') {
      out.tint = 0;
      out.glow = 0;
      out.cap = 0;
      return out;
    }
    return gearButtonReleaseLook(this.elapsedMs, release, out);
  }
}

export interface GearButtonsOptions {
  /** 아틀라스(스킨 공통 `gearButtons`). 소유자는 SkinManager이며 destroy가 파괴하지 않는다. */
  texture: Texture;
  geometry?: GearButtonGeometry;
}

interface ButtonView {
  readonly state: GearButtonState;
  readonly holder: Container;
  readonly tint: Sprite;
  readonly glow: Sprite;
  readonly cap: Sprite;
  readonly glowTextures: Readonly<Record<GearButtonColor, readonly Texture[]>>;
  readonly frames: GearButtonFrames;
  readonly tintTextures: Readonly<Record<GearButtonColor, Texture>>;
  shownColor: GearButtonColor;
  shownDepthIndex: number;
}

/**
 * 네 버튼의 Pixi 레이어. 렌더러가 기어를 그릴 때 만들어 기어 스프라이트 바로 위에 붙이고(기어와 같은 변환), 입력마다 `setKey`,
 * 렌더 프레임마다 `update(deltaMs)`를 부른다. 대기 버튼은 그리지 않는다.
 */
export class GearButtons {
  /** 기어 그림 좌표의 루트(버튼 네 개). */
  readonly container: Container;
  private readonly release: GearButtonRelease;
  private readonly depths: readonly number[];
  private readonly views: ButtonView[];
  private readonly stateViews: readonly GearButtonStateView[];
  private readonly ownedTextures: Texture[] = [];
  private readonly scratch: GearButtonLook = { tint: 0, glow: 0, cap: 0 };
  private destroyed = false;

  constructor({ texture, geometry = GEAR_BUTTON_GEOMETRY }: GearButtonsOptions) {
    this.release = geometry.release;
    this.depths = geometry.depths;
    this.container = new Container({ label: 'gear-buttons' });
    const frameTexture = (frame: GearButtonFrame) => {
      const owned = new Texture({
        source: texture.source,
        frame: new Rectangle(texture.frame.x + frame.atlasX, texture.frame.y + frame.atlasY, frame.width, frame.height),
      });
      this.ownedTextures.push(owned);
      return owned;
    };
    const sprite = (label: string, frame: GearButtonFrame, layerTexture: Texture) => {
      const layer = new Sprite({ texture: layerTexture, label });
      layer.position.set(frame.x, frame.y);
      layer.visible = false;
      return layer;
    };
    this.views = geometry.buttons.map((frames, index) => {
      const lane = index + 1;
      const holder = new Container({ label: `gear-button-${lane}` });
      const glowTextures = { single: frames.glow.single.map(frameTexture), double: frames.glow.double.map(frameTexture) };
      const tintTextures = { single: frameTexture(frames.tint.single), double: frameTexture(frames.tint.double) };
      const tint = sprite(`gear-button-${lane}-tint`, frames.tint.single, tintTextures.single);
      tint.blendMode = 'add';
      const glow = sprite(`gear-button-${lane}-glow`, frames.glow.single[0], glowTextures.single[0]);
      const cap = sprite(`gear-button-${lane}-cap`, frames.cap, frameTexture(frames.cap));
      holder.addChild(tint, glow, cap);
      holder.visible = false;
      this.container.addChild(holder);
      return { state: new GearButtonState(geometry.depths, geometry.pressMotion), holder, tint, glow, cap, glowTextures, tintTextures, frames, shownColor: 'single' as GearButtonColor, shownDepthIndex: 0 };
    });
    this.stateViews = this.views.map((view) => view.state);
  }

  /** 레인 1~4 버튼의 지금 상태. 렌더러가 Lab·E2E에 그대로 넘긴다(새 객체를 만들지 않는다). */
  get states(): readonly GearButtonStateView[] {
    return this.stateViews;
  }

  /** lane 버튼의 상태. 범위 밖이면 null. */
  state(lane: number): GearButtonStateView | null {
    return this.views[lane - 1]?.state ?? null;
  }

  /**
   * lane(1~4)의 입력 key가 눌렸거나(pressed) 떼어졌다. 누름·뗌은 현재 hold 수에 맞는 색으로 바로 그린다. 같은 레인에 다른 키가 눌려 있으면
   * 하나를 떼도 눌림이 이어진다. 범위 밖 레인과 누른 적 없는 키의 뗌은 무시한다.
   */
  setKey(lane: number, key: string, pressed: boolean): void {
    const view = this.views[lane - 1];
    if (this.destroyed || !view) return;
    const changed = pressed ? view.state.press(key) : view.state.release(key);
    if (changed) this.apply(view);
  }

  /** 렌더 프레임 하나(deltaMs)만큼 깊이 전환·뗌 복귀를 진행한다. 정지한 버튼은 갱신하지 않는다. */
  update(deltaMs: number): void {
    if (this.destroyed) return;
    for (const view of this.views) {
      if (view.state.advance(deltaMs, this.release)) this.apply(view);
    }
  }

  /** 컨테이너와 이 객체가 만든 frame 텍스처를 정리한다(받은 아틀라스는 SkinManager 소유라 남긴다). 두 번 불러도 된다. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.container.destroyed) {
      this.container.removeFromParent();
      this.container.destroy({ children: true });
    }
    for (const texture of this.ownedTextures) if (!texture.destroyed) texture.destroy(false);
    this.ownedTextures.length = 0;
  }

  private apply(view: ButtonView): void {
    if (view.holder.destroyed) return;
    const { state } = view;
    if (state.phase === 'idle') {
      view.holder.visible = false;
      return;
    }
    let depthIndex = 0;
    for (let index = 1; index < this.depths.length; index++) {
      if (Math.abs(this.depths[index] - state.pressDepth) < Math.abs(this.depths[depthIndex] - state.pressDepth)) depthIndex = index;
    }
    if (view.shownColor !== state.color || view.shownDepthIndex !== depthIndex) {
      view.shownColor = state.color;
      view.shownDepthIndex = depthIndex;
      view.glow.texture = view.glowTextures[state.color][depthIndex];
      const frame = view.frames.glow[state.color][depthIndex];
      view.glow.position.set(frame.x, frame.y);
      view.tint.texture = view.tintTextures[state.color];
    }
    const look = state.look(this.release, this.scratch);
    view.holder.visible = true;
    setLayer(view.tint, look.tint);
    setLayer(view.glow, look.glow);
    setLayer(view.cap, look.cap);
  }
}

function setLayer(layer: Sprite, alpha: number): void {
  layer.visible = alpha > 0;
  if (layer.visible) layer.alpha = alpha;
}
