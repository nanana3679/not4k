import type { PlaybackRange } from '../../shared';
import { AudioEngine } from '../audio';
import type { KeyBinding } from '../input/InputSystem';
import { GameRenderer } from '../renderer/GameRenderer';
import { GAME_HEIGHT } from '../renderer/constants';
import { resolvePlayLogicalWidth } from '../renderer/gearLayout';
import { SkinManager } from '../skin';
import { ExplicitSkinLoader } from '../skin/ExplicitSkinLoader';
import type { GameSettings } from '../stores/gameStore';
import { GameClock } from '../time';
import { createExplicitPlayInput } from './explicitPlaySessionInput';
import type { ExplicitPlayInputHooks } from './explicitPlaySessionInput';
import { keepGearMotionAssets } from './gearMotionKeepAlive';

export interface ExplicitPlaybackHostOptions {
  audioBuffer: AudioBuffer;
  playbackRange?: PlaybackRange | null;
  difficultyLabel: string;
  settings: GameSettings;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  inputTarget: EventTarget;
}

/** host가 소유한 자원의 참조. session 교체에는 유지하고 host.dispose 뒤에는 사용하지 않는다. */
export interface ExplicitPlaybackResources {
  readonly audio: AudioEngine;
  readonly clock: GameClock;
  readonly renderer: GameRenderer;
  readonly explicitSkin: ExplicitSkinLoader;
}

/** 오디오·표시·물리 입력·RAF의 수명. 재생 위치와 판정 session의 정책은 호출자가 소유한다. */
export class ExplicitPlaybackHost {
  private audio: AudioEngine | null = null;
  private skin: SkinManager | null = null;
  private explicitSkin: ExplicitSkinLoader | null = null;
  private renderer: GameRenderer | null = null;
  /** init 중 취소하면 Pixi 앱이 아직 스킨을 읽으므로 끝난 뒤 함께 정리한다. */
  private rendererInit: Promise<void> | null = null;
  private input: ReturnType<typeof createExplicitPlayInput> | null = null;
  private frameId: number | null = null;
  private closed = false;
  private started = false;

  constructor(private readonly options: ExplicitPlaybackHostOptions) {}

  /** 출력 지연 확정 뒤 clock을 만든다. 취소된 초기화의 늦은 성공·실패는 null로 끝낸다. */
  async init(): Promise<ExplicitPlaybackResources | null> {
    if (this.closed || this.started) return null;
    this.started = true;
    const { settings, audioBuffer, playbackRange, canvas, width, height, difficultyLabel } = this.options;
    try {
      this.audio = new AudioEngine();
      this.skin = new SkinManager();
      this.explicitSkin = new ExplicitSkinLoader();
      const audio = this.audio;
      audio.masterVolume = settings.masterVolume;
      audio.playbackRate = settings.playSpeed;
      audio.loadBuffer(audioBuffer);
      audio.setPlaybackRange(playbackRange ?? null);
      // legacy skin은 기어·배경·타격용이다. 노트 도안은 항상 별도 explicit loader가 소유한다.
      const skinId = import.meta.env.DEV
        ? (await import('../../lab/devSkinSelection')).resolveDevSkinSelection(settings.skinId) : settings.skinId;
      if (this.closed) return null;
      await Promise.all([this.skin.loadSkin(skinId), this.explicitSkin.load({ resolution: settings.renderHeight > GAME_HEIGHT ? 2 : 1 }),
        keepGearMotionAssets(settings.gearMotion)?.ready, audio.prepareForPlayback()]);
      if (this.closed) return null;
      const clock = new GameClock(audio, settings);
      const renderer = new GameRenderer({ canvas, width: resolvePlayLogicalWidth(width, height),
        height: GAME_HEIGHT, resolution: settings.renderHeight / GAME_HEIGHT, skinManager: this.skin,
        bombScale: settings.bombScale, gearMotion: settings.gearMotion, difficultyLabel });
      this.renderer = renderer;
      const rendererInit = renderer.init();
      this.rendererInit = rendererInit;
      try { await rendererInit; } finally { this.rendererInit = null; }
      // 취소됐다면 dispose가 init 종료 뒤의 renderer·스킨 정리를 이미 예약했다.
      if (this.closed) return null;
      return { audio, clock, renderer, explicitSkin: this.explicitSkin };
    } catch (error) {
      if (this.closed) return null;
      this.dispose();
      throw error;
    }
  }

  /** chart 설정 뒤 생성하고, GPU 준비가 끝나기 전에는 실제 키 이벤트에 연결하지 않는다. */
  createInput(bindings: readonly KeyBinding[], clock: GameClock, hooks: ExplicitPlayInputHooks): ReturnType<typeof createExplicitPlayInput> {
    if (this.closed || !this.renderer || this.input) throw new Error('명시 입력 소스를 생성할 수 없는 상태입니다');
    this.input = createExplicitPlayInput(bindings, clock, hooks);
    return this.input;
  }

  /** chart·adapter 설정 뒤 호출한다. explicit texture의 GPU 준비와 입력 연결을 오디오 시작보다 앞세운다. */
  prepareForPlayback(visualTimeMs: number): void {
    if (this.closed) return;
    this.renderer!.prepareForPlayback(visualTimeMs);
    this.input!.attach(this.options.inputTarget);
  }

  startFrames(onFrame: (timestamp: number) => void, onError: (reason: unknown) => void): void {
    if (this.closed || this.frameId !== null) return;
    const frame = (timestamp: number) => {
      this.frameId = null;
      if (this.closed) return;
      try {
        onFrame(timestamp);
        if (!this.closed) this.frameId = requestAnimationFrame(frame);
      } catch (error) { onError(error); }
    };
    this.frameId = requestAnimationFrame(frame);
  }

  /** 호출자가 입력·adapter를 정리하기 전에 예약된 프레임부터 취소한다. */
  stopFrames(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  /** 완료 시에는 audio.pause보다 먼저 물리 입력을 끊는다. */
  releaseInput(): void {
    this.input?.dispose();
    this.input = null;
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopFrames();
    this.releaseInput();
    const renderer = this.renderer; const explicitSkin = this.explicitSkin; const skin = this.skin;
    this.renderer = null; this.explicitSkin = null; this.skin = null;
    const release = () => { renderer?.dispose(false); explicitSkin?.dispose(); skin?.dispose(); };
    // init 도중에는 renderer.dispose가 아무것도 하지 않고, 먼저 해제한 스킨을 init이 읽다 실패한다.
    if (this.rendererInit) void this.rendererInit.then(release, release); else release();
    if (this.audio) void this.audio.dispose();
    this.audio = null;
  }
}
