import { getJudgmentWindows } from '../../shared';
import type { AudioEngine } from '../audio';
import type { KeyBinding } from '../input/InputSystem';
import { ExplicitJudgmentEffectSink } from '../judgment/ExplicitJudgmentEffectSink';
import { ExplicitSessionRendererAdapter } from '../judgment/ExplicitSessionRendererAdapter';
import { ObserverRepetition } from '../observer/ObserverRepetition';
import type { ObserverManualStats } from '../observer/ObserverManualTally';
import { observerWholeSongRange } from '../observer/observerRepetitionPlan';
import type { GameRenderer } from '../renderer/GameRenderer';
import { liftPx, suddenCoverPx } from '../renderer/constants';
import type { GameSettings } from '../stores/gameStore';
import type { ExplicitPlayRequest } from '../stores/explicitPlayRequest';
import type { GameClock } from '../time';
import { ExplicitPlaybackHost } from './ExplicitPlaybackHost';
import { drainExplicitPlaySessionInputs, stepExplicitPlaySession } from './explicitPlaySessionInput';
import type { createExplicitPlayInput } from './explicitPlaySessionInput';

export type ObserverPlayPhase = 'loading' | 'playing' | 'paused' | 'error';
export interface ObserverPlayState {
  readonly autoEnabled: boolean;
  readonly manualStats: ObserverManualStats | null;
  /** GameClock의 출력 지연을 반영한 곡 시각. 첫 출력 전에는 음수일 수 있다. */
  readonly songTimeMs: number;
}
export interface ObserverPlayRuntimeOptions {
  request: Pick<ExplicitPlayRequest, 'compiled' | 'document' | 'audioBuffer' | 'playbackRange'>;
  settings: GameSettings;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  inputTarget: EventTarget;
  onPhase(phase: ObserverPlayPhase): void;
  onState?(state: ObserverPlayState): void;
  onError(error: Error): void;
}

/** 전곡을 명시적 종료까지 반복한다. host 자원은 유지하고 반복·Retry마다 판정 세션과 어댑터만 교체한다. */
export class ObserverPlayRuntime {
  private readonly host: ExplicitPlaybackHost;
  private readonly bindings: KeyBinding[];
  private audio: AudioEngine | null = null;
  private clock: GameClock | null = null;
  private renderer: GameRenderer | null = null;
  private input: ReturnType<typeof createExplicitPlayInput> | null = null;
  private repetition: ObserverRepetition | null = null;
  private adapter: ExplicitSessionRendererAdapter | null = null;
  private started = false;
  private closed = false;
  private paused = false;
  private lastFrame: number | null = null;

  constructor(private readonly options: ObserverPlayRuntimeOptions) {
    const { request, settings, canvas, width, height, inputTarget } = options;
    // 설정 원본을 바꾸지 않는다. pitch 보존 감속은 후속 구현이며 진입은 항상 1.0x다.
    this.host = new ExplicitPlaybackHost({ audioBuffer: request.audioBuffer, playbackRange: request.playbackRange,
      difficultyLabel: request.document.meta.difficultyLabel, settings: { ...settings, playSpeed: 1 },
      canvas, width, height, inputTarget });
    this.bindings = Object.entries(settings.keyBindings).flatMap(([lane, keys]) =>
      keys.map((key: string) => ({ lane: Number(lane.slice(4)) as KeyBinding['lane'], key })));
  }

  async start(): Promise<void> {
    if (this.closed || this.started) return;
    this.started = true;
    this.options.onPhase('loading');
    try {
      const resources = await this.host.init();
      if (this.closed || !resources) return;
      const { audio, clock, renderer, explicitSkin } = resources;
      this.audio = audio; this.clock = clock; this.renderer = renderer;
      this.replaceRepetition();
      renderer.setExplicitChart(this.repetition!.playbackChart, explicitSkin,
        () => this.repetition!.session.snapshot, this.options.request.document, audio.duration);
      const { settings } = this.options;
      renderer.scrollSpeed = settings.scrollSpeed;
      renderer.setLift(liftPx(settings.liftPercent));
      renderer.setSudden(suddenCoverPx(settings.suddenPercent));
      renderer.setShowFastSlow(settings.showFastSlow);
      renderer.setShowTimingDiff(settings.showTimingDiff);
      renderer.setPerfectWindow(getJudgmentWindows(settings.judgmentMode).PERFECT);
      renderer.setupKeyboardDisplay(new Map(this.bindings.map(binding => [binding.key, binding.lane])));
      this.input = this.host.createInput(this.bindings, clock, {
        onLatePreparationHoldChange: () => {
          try { this.syncLateHeldKeys(); } catch (error) { this.fail(error); }
        },
      });
      this.input.setJudging(false);
      this.host.prepareForPlayback(clock.visualTimeMs());
      this.playRepetition();
      this.host.startFrames(timestamp => {
        if (this.closed || this.paused) return;
        const songTimeMs = this.stepSession(timestamp);
        const advanceAtMs = Math.min(songTimeMs, clock.toInputTimeMs(timestamp));
        // 끝의 효과도 같은 batch로 한 번 전달한 뒤 반복 상태를 버린다. finalize/result 경로는 없다.
        this.adapter!.sync(clock.visualTimeMs());
        if (this.repetition!.isFinished(songTimeMs, advanceAtMs)) {
          this.retry();
          return;
        }
        const deltaMs = this.lastFrame === null ? 0 : timestamp - this.lastFrame;
        this.lastFrame = timestamp;
        this.render(deltaMs);
      }, error => this.fail(error));
    } catch (error) { if (!this.closed) this.fail(error); }
  }

  /** 되감기·준비 없이 같은 반복을 멈추고 잇는다. 정지 중 물리 hold만 추적하고 판정 큐는 닫는다. */
  togglePause(): void {
    if (this.closed || !this.input || !this.audio || !this.clock || !this.repetition) return;
    try {
      const timestamp = performance.now();
      if (this.paused) {
        const repetition = this.repetition;
        // resumeAt은 바디 시작 창을 다시 연다. Observer는 현재 core의 hold만 맞춘다.
        repetition.session.syncHeldKeys(repetition.session.snapshot.atMs,
          repetition.autoEnabled ? repetition.autoHeldKeys : this.input.heldKeys, this.clock.judgmentTimeMs());
        this.input.setJudging(repetition.judgesHumanInput, timestamp);
        this.audio.resume();
        this.paused = false;
      } else {
        this.audio.pause();
        this.stepSession(timestamp);
        this.paused = true;
        this.input.setJudging(false);
      }
      this.lastFrame = null;
      this.adapter!.sync(this.clock.visualTimeMs());
      this.options.onPhase(this.paused ? 'paused' : 'playing');
      if (!this.closed) this.render(0);
    } catch (error) { this.fail(error); }
  }

  setAuto(enabled: boolean): void {
    if (this.closed || !this.input || !this.clock || !this.repetition || this.repetition.autoEnabled === enabled) return;
    try {
      this.repetition.setAuto(enabled, this.input, this.clock, performance.now());
      // setAuto(false)는 사람 판정을 켠다. pause가 우선이므로 이벤트를 받기 전에 다시 닫는다.
      if (this.paused) this.input.setJudging(false);
      this.adapter!.sync(this.clock.visualTimeMs());
      this.render(0);
    } catch (error) { this.fail(error); }
  }

  /** 현재 Auto 모드·물리 hold를 넘기고 새 세션·수동 집계로 즉시 다시 재생한다. */
  retry(): void {
    if (this.closed || !this.input || !this.repetition) return;
    try {
      this.input.setJudging(false); // 이전 반복의 미처리 입력은 새 시간축으로 넘기지 않는다.
      this.replaceRepetition();
      this.renderer!.setExplicitPlaybackChart(this.repetition.playbackChart);
      this.renderer!.resetTransientState();
      this.playRepetition();
    } catch (error) { this.fail(error); }
  }

  private replaceRepetition(): void {
    const audio = this.audio!;
    const range = observerWholeSongRange(audio.duration);
    // J=P−L₀·r, raw=J+offset·r. 오디오만 0에서 시작하고 세션은 둘 중 이른 시각부터 관측한다.
    // chart는 이미 [0,D]로 선택되므로 세션 시작점을 넓혀도 범위 밖 노트가 다시 들어오지 않는다.
    const sessionStartTimeMs = range.startMs
      + (Math.min(0, this.options.settings.inputOffsetMs) - audio.getOutputLatencyMs()) * audio.playbackRate;
    const repetition = new ObserverRepetition(this.options.request.compiled, {
      range, audioDurationMs: audio.duration, playbackRate: audio.playbackRate, sessionStartTimeMs,
      auto: this.repetition?.autoEnabled ?? true, humanHeldKeys: this.input?.heldKeys ?? [],
      bindings: this.bindings, windows: getJudgmentWindows(this.options.settings.judgmentMode),
    });
    this.adapter?.dispose();
    this.repetition = repetition;
    const visualSink = new ExplicitJudgmentEffectSink(this.renderer!);
    this.adapter = new ExplicitSessionRendererAdapter(repetition.session, { applyConfirmedEffects: effects => {
      visualSink.applyConfirmedEffects(effects);
      repetition.applyConfirmedEffects(effects);
    } });
    this.adapter.attach(null);
  }

  private playRepetition(): void {
    const repetition = this.repetition!;
    this.audio!.playFadedSpan(repetition.fadedSpan, repetition.fadedSpan.fromMs);
    this.input!.setJudging(repetition.judgesHumanInput, performance.now());
    this.paused = false;
    this.lastFrame = null;
    this.renderer!.setChartVisible(true);
    this.options.onPhase('playing');
    if (!this.closed) this.render(0);
  }

  private stepSession(timestamp: number): number {
    const songTimeMs = this.clock!.judgmentTimeMs();
    stepExplicitPlaySession(this.input!.timeline, this.repetition!.session,
      this.repetition!.autoInputSource, this.clock!, timestamp, songTimeMs);
    return songTimeMs;
  }

  /** 재개/반복 경계 전 이벤트가 늦게 도착하면 점수 입력 없이 현재 물리 hold만 동기화한다. */
  private syncLateHeldKeys(): void {
    if (this.closed || this.paused || !this.repetition?.judgesHumanInput) return;
    const session = this.repetition.session;
    const songTimeMs = this.clock!.judgmentTimeMs();
    drainExplicitPlaySessionInputs(this.input!.timeline, session, Infinity, songTimeMs);
    session.syncHeldKeys(session.snapshot.atMs, this.input!.heldKeys, songTimeMs);
  }

  private render(deltaMs: number): void {
    const repetition = this.repetition!;
    const renderer = this.renderer!;
    const heldKeys = [...this.input!.heldKeys, ...repetition.autoHeldKeys];
    for (let lane = 1; lane <= 4; lane++) renderer.setKeyBeam(lane, heldKeys.some(key => key.lane === lane));
    const pressed = new Set(heldKeys.map(key => key.key.replace('explicit-auto:', '')));
    for (const binding of this.bindings) renderer.setKeyState(binding.key, pressed.has(binding.key));
    const manualStats = repetition.manualStats;
    renderer.updateCombo(manualStats?.combo ?? 0);
    renderer.updateAccuracy(manualStats?.achievementRate ?? null);
    renderer.renderFrame(this.clock!.visualTimeMs(), deltaMs);
    this.options.onState?.({ autoEnabled: repetition.autoEnabled, manualStats, songTimeMs: this.clock!.judgmentTimeMs() });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.host.stopFrames();
    this.adapter?.dispose();
    this.adapter = null;
    this.host.dispose();
    this.input = null; this.repetition = null;
    this.audio = null; this.clock = null; this.renderer = null;
  }

  private fail(reason: unknown): void {
    if (this.closed) return;
    this.dispose();
    this.options.onPhase('error');
    this.options.onError(reason instanceof Error ? reason : new Error(String(reason)));
  }
}
