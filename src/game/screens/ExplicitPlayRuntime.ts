import { getJudgmentWindows } from '../../shared';
import type { AudioEngine } from '../audio';
import { ExplicitPlayDebugLog } from '../debug/ExplicitPlayDebugLog';
import { ExplicitAutoPlayer } from '../input/ExplicitAutoPlayer';
import type { ExplicitAutoInput } from '../input/ExplicitAutoPlayer';
import type { KeyBinding } from '../input/InputSystem';
import { ExplicitJudgmentSession } from '../judgment/ExplicitJudgmentSession';
import type { ExplicitSessionResult } from '../judgment/ExplicitJudgmentSession';
import { ExplicitJudgmentEffectSink } from '../judgment/ExplicitJudgmentEffectSink';
import { ExplicitSessionRendererAdapter } from '../judgment/ExplicitSessionRendererAdapter';
import type { GameRenderer } from '../renderer/GameRenderer';
import { liftPx, suddenCoverPx } from '../renderer/constants';
import type { GameSettings } from '../stores/gameStore';
import { explicitSessionRangeStartMs } from '../stores/explicitPlayRequest';
import type { ExplicitPlayRequest } from '../stores/explicitPlayRequest';
import type { GameClock } from '../time';
import { ExplicitPlaybackHost } from './ExplicitPlaybackHost';
import { canFinishExplicitPlaySession, drainExplicitPlaySessionInputs,
  finishExplicitPlaySession, stepExplicitPlaySession } from './explicitPlaySessionInput';
import type { createExplicitPlayInput } from './explicitPlaySessionInput';
import { EXPLICIT_MUSIC_PREPARATION_MS, explicitPreparationPosition, explicitResumeTarget } from './explicitPlayPreparation';

export type ExplicitPlayPhase = 'loading' | 'music-preparation' | 'playing' | 'paused' | 'finished' | 'error';
export interface ExplicitPlayRuntimeOptions {
  request: ExplicitPlayRequest;
  settings: GameSettings;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  inputTarget: EventTarget;
  onPhase(phase: ExplicitPlayPhase): void;
  onResult(result: ExplicitSessionResult): void;
  onProgress?(progress: { settled: number; combo: number }, visualTimeMs: number): void;
  onError(error: Error): void;
}

/** 일반·테스트 플레이 정책. 자원 수명은 host가 맡고 재시도·반복은 새 instance/session을 만든다. */
export class ExplicitPlayRuntime {
  private readonly host: ExplicitPlaybackHost;
  private audio: AudioEngine | null = null;
  private renderer: GameRenderer | null = null;
  private input: ReturnType<typeof createExplicitPlayInput> | null = null;
  private adapter: ExplicitSessionRendererAdapter | null = null;
  private session: ExplicitJudgmentSession | null = null;
  private clock: GameClock | null = null;
  private auto: ExplicitAutoPlayer | null = null;
  private debugLog: ExplicitPlayDebugLog | null = null;
  private preparation: { targetMs: number; readyAt: number } | null = null;
  /**
   * 음악 준비 종료에서 hold를 seed한 적이 있는지. 일반 첫 시작의 판정 경계에는 seed가 없어 늦은 준비 입력을 반영하지 않는다.
   * 일시정지·준비 중에는 판정이 꺼져 늦은 입력 hook이 오지 않으므로 다시 false로 돌리지 않는다.
   */
  private seededFromPreparation = false;
  private targetMs = 0;
  private closed = false;
  private started = false;
  private playbackStarted = false;
  private paused = false;
  private finished = false;
  private lastFrame: number | null = null;
  private lastProgressAt = -Infinity;
  private readonly autoHeldByLane = new Map<number, Set<string>>();
  private readonly autoCursorHistory: { songTimeMs: number; eventCount: number }[] = [];
  /** 렌더러 고도 기준점마다 그때까지 고도에 반영한 session 효과 수. 키 callback의 정산은 다음 프레임 기준점에 들어간다. */
  private readonly altitudeCheckpoints: { songTimeMs: number; appliedEffectCount: number }[] = [];
  private appliedEffectCount = 0;
  private readonly manualHeldKeys = new Set<string>();
  private readonly onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent;
    if (key.code === 'Escape' && !key.repeat) { key.preventDefault(); this.togglePause(); }
    else this.manualHeldKeys.add(key.code);
  };
  private readonly onKeyUp = (event: Event) => { this.manualHeldKeys.delete((event as KeyboardEvent).code); };

  constructor(private readonly options: ExplicitPlayRuntimeOptions) {
    const { request, settings, canvas, width, height, inputTarget } = options;
    this.host = new ExplicitPlaybackHost({ audioBuffer: request.audioBuffer, playbackRange: request.playbackRange,
      difficultyLabel: request.document.meta.difficultyLabel, settings, canvas, width, height, inputTarget });
  }

  async start(): Promise<void> {
    if (this.closed || this.started) return;
    this.started = true;
    const { request, settings } = this.options;
    this.options.onPhase('loading');
    try {
      const resources = await this.host.init();
      if (this.closed || !resources) return;
      const { audio, clock, renderer, explicitSkin } = resources;
      this.audio = audio;
      this.clock = clock;
      this.renderer = renderer;
      this.targetMs = request.startTimeMs;
      const session = new ExplicitJudgmentSession(request.compiled, {
        windows: getJudgmentWindows(settings.judgmentMode),
        // 일반 시작의 J는 출력 지연만큼 0보다 앞선다. 커서 범위·재진입은 테스트에만 적용한다.
        // 처음부터 테스트의 범위는 0 앞 항목까지 넓혀 일반 재생과 같은 항목을 판정한다.
        ...(request.purpose === 'play' ? {} : { startTimeMs: explicitSessionRangeStartMs(request) }),
      });
      this.session = session;
      // 구형 PlayScreen처럼 에디터·Lab 테스트 재생도 debugMode 로그를 남긴다.
      if (settings.debugMode) {
        this.withDebug(() => { this.debugLog = new ExplicitPlayDebugLog(session.playbackChart, {
          playbackRate: audio.playbackRate, outputLatencyMs: audio.getOutputLatencyMs(),
          inputOffsetMs: settings.inputOffsetMs, visualOffsetMs: settings.visualOffsetMs,
        }); });
      }
      renderer.setExplicitChart(session.playbackChart, explicitSkin, () => this.session!.snapshot, request.document, audio.duration);
      renderer.setChartVisible(false);
      renderer.updateAccuracy(null);
      renderer.scrollSpeed = settings.scrollSpeed;
      renderer.setLift(liftPx(settings.liftPercent));
      renderer.setSudden(suddenCoverPx(settings.suddenPercent));
      renderer.setShowFastSlow(settings.showFastSlow);
      renderer.setShowTimingDiff(settings.showTimingDiff);
      renderer.setPerfectWindow(getJudgmentWindows(settings.judgmentMode).PERFECT);
      const bindings: KeyBinding[] = Object.entries(settings.keyBindings).flatMap(([lane, keys]) =>
        keys.map((key: string) => ({ lane: Number(lane.slice(4)) as KeyBinding['lane'], key })));
      renderer.setupKeyboardDisplay(new Map(bindings.map(binding => [binding.key, binding.lane])));
      const input = this.host.createInput(bindings, clock, {
        beforeInput: timestamp => {
          try { this.activatePreparedPlayback(timestamp); } catch (error) { this.fail(error); }
        },
        onLatePreparationHoldChange: () => {
          try { this.applyLatePreparationHoldChange(); } catch (error) { this.fail(error); }
        },
      });
      this.input = input;
      input.setJudging(false);
      const sections = request.auto ? undefined : request.document.events.filter(event => event.type === 'auto')
        .map(event => ({ startMs: request.compiled.timing.beatToMs(event.beat), endMs: request.compiled.timing.beatToMs(event.endBeat) }));
      this.auto = new ExplicitAutoPlayer(session.playbackChart, { bindings, sections });
      const adapter = this.createAdapter(session);
      this.adapter = adapter;
      adapter.attach(null);
      this.host.prepareForPlayback(request.purpose === 'play' ? clock.visualTimeMs()
        : this.targetMs + settings.visualOffsetMs * audio.playbackRate);
      this.options.inputTarget.addEventListener('keydown', this.onKeyDown);
      this.options.inputTarget.addEventListener('keyup', this.onKeyUp);
      if (request.purpose === 'play') {
        audio.play(0);
        this.playbackStarted = true;
        input.setJudging(true, performance.now());
        renderer.setChartVisible(true);
        this.options.onPhase('playing');
      } else this.beginPreparation();
      this.host.startFrames(timestamp => {
        if (this.closed || this.finished) return;
        if (!this.paused) {
          this.activatePreparedPlayback();
          // 재구성은 새 session/adapter를 만든다. RAF가 시작 당시 객체를 계속 사용하면 안 된다.
          const session = this.session!;
          const adapter = this.adapter!;
          const songTimeMs = this.preparation ? this.targetMs : this.stepSession(timestamp);
          for (let lane = 1; lane <= 4; lane++) renderer.setKeyBeam(lane,
            input.inputSystem.isLaneHeld(lane as KeyBinding['lane']) || (this.autoHeldByLane.get(lane)?.size ?? 0) > 0);
          for (const binding of bindings) renderer.setKeyState(binding.key, this.manualHeldKeys.has(binding.key)
            || this.autoHeldByLane.get(binding.lane)?.has(`explicit-auto:${binding.key}`) === true);
          const visualTime = this.preparation
            ? this.targetMs + settings.visualOffsetMs * audio.playbackRate : clock.visualTimeMs();
          if (!this.preparation) adapter.sync(visualTime);
          const score = session.score;
          renderer.updateCombo(session.combo);
          renderer.updateAccuracy(score.finalDenominatorWeight > 0 ? score.achievementRate : null);
          renderer.renderFrame(visualTime, this.lastFrame === null ? 0 : timestamp - this.lastFrame);
          if (!this.preparation) this.recordAltitudeCheckpoint(songTimeMs);
          this.lastFrame = timestamp;
          if (timestamp - this.lastProgressAt >= 100) {
            this.options.onProgress?.({ settled: score.processedNotes, combo: session.combo }, visualTime);
            this.lastProgressAt = timestamp;
          }
          if (!this.preparation && canFinishExplicitPlaySession(session, clock, audio.duration, timestamp)) {
            finishExplicitPlaySession(input.timeline, session, this.auto!);
            const final = session.finalize();
            this.recordDebug(timestamp);
            this.withDebug(() => this.debugLog?.finish(final));
            adapter.sync(clock.visualTimeMs());
            renderer.updateCombo(final.combo);
            renderer.updateAccuracy(final.score.finalDenominatorWeight > 0 ? final.score.achievementRate : null);
            renderer.renderFrame(clock.visualTimeMs(), 0);
            this.finished = true;
            this.releaseInput();
            audio.pause();
            this.downloadDebugLog();
            this.options.onPhase('finished');
            this.options.onResult(final);
            this.dispose();
            return;
          }
        } else this.lastFrame = null;
      }, error => this.fail(error));
    } catch (error) { if (!this.closed) this.fail(error); }
  }

  togglePause(): void {
    if (this.closed || this.finished || !this.input || !this.audio || !this.clock || !this.session) return;
    try {
      if (this.paused) {
        this.paused = false;
        this.beginPreparation();
      } else {
        // 이력 재생 비용과 무관하게 실제 멈춘 음악 위치를 먼저 고정한다.
        this.audio.pause();
        if (!this.preparation) {
          const pausedSongTimeMs = this.stepSession(performance.now());
          this.adapter?.sync(this.clock.visualTimeMs());
          this.targetMs = explicitResumeTarget(pausedSongTimeMs, this.options.request.startTimeMs);
          // 첫 출력이 도착하기 전의 J<0에서는 아직 되돌릴 구간이 없다.
          if (pausedSongTimeMs >= this.targetMs) this.restorePlayback();
        }
        this.paused = true;
        this.preparation = null;
        this.input.setJudging(false);
        this.renderer!.setChartVisible(false);
        this.renderer!.renderFrame(this.targetMs + this.options.settings.visualOffsetMs * this.audio.playbackRate, 0);
        this.lastFrame = null;
        this.options.onPhase('paused');
      }
    } catch (error) { this.fail(error); }
  }

  private stepSession(timestamp: number): number {
    const songTimeMs = this.clock!.judgmentTimeMs();
    this.trackAutoInputs(stepExplicitPlaySession(this.input!.timeline, this.session!, this.auto!, this.clock!, timestamp, songTimeMs));
    // 세션·Auto·고도 모두 같은 곡 관측 경계를 써야 프레임 도중의 미세한 시각 차이로 prefix가 갈리지 않는다.
    this.autoCursorHistory.push({ songTimeMs, eventCount: this.auto!.processedEventCount });
    this.recordDebug(timestamp, songTimeMs);
    return songTimeMs;
  }

  private restorePlayback(): void {
    const restored = this.session!.reconstructAt(this.targetMs);
    this.adapter!.dispose();
    this.session = restored.session;
    this.adapter = this.createAdapter(this.session);
    this.adapter.attach(null);
    // 렌더러는 T 이하 마지막 기준점의 고도로 돌아간다. 그 기준점 뒤에 반영됐던 prefix 효과는 조용히 한 번만 다시 더한다.
    while (this.altitudeCheckpoints.length && this.altitudeCheckpoints.at(-1)!.songTimeMs > this.targetMs) {
      this.altitudeCheckpoints.pop();
    }
    const retainedEffectCount = this.altitudeCheckpoints.at(-1)?.appliedEffectCount ?? 0;
    const unrecordedPrefixEffects = restored.prefixEffects.filter(effect => effect.sequence > retainedEffectCount);
    while (this.autoCursorHistory.length && this.autoCursorHistory.at(-1)!.songTimeMs > this.targetMs) {
      this.autoCursorHistory.pop();
    }
    this.autoHeldByLane.clear();
    for (const { lane, key } of this.auto!.restoreCursor(this.autoCursorHistory.at(-1)?.eventCount ?? 0)) {
      const held = this.autoHeldByLane.get(lane) ?? new Set<string>();
      held.add(key);
      this.autoHeldByLane.set(lane, held);
    }
    // 마지막 프레임과 T 사이의 공백도 복원한다. 입력 offset이 음수면 core는 곡 T보다 뒤에 남는다.
    const through = Math.max(this.session.snapshot.atMs, Math.min(this.targetMs,
      this.targetMs + this.options.settings.inputOffsetMs * this.audio!.playbackRate));
    const autoPrefix = this.auto!.eventsBefore(through);
    this.input!.timeline.enqueueMany(autoPrefix.map(event => ({ ...event, inputAt: event.timeMs })));
    drainExplicitPlaySessionInputs(this.input!.timeline, this.session, Infinity, this.targetMs);
    this.trackAutoInputs(autoPrefix);
    this.session.advance(Math.max(through, this.session.snapshot.atMs), this.targetMs);
    const boundaryEffects = this.session.drainEffects();
    this.withDebug(() => this.debugLog?.rewind(this.targetMs, this.session!));
    this.autoCursorHistory.push({ songTimeMs: this.targetMs, eventCount: this.auto!.processedEventCount });
    const renderer = this.renderer!;
    renderer.restoreExplicitPlaybackState(this.targetMs, this.audio!.playbackRate, [...unrecordedPrefixEffects, ...boundaryEffects]
      .flatMap(effect => effect.altitudeAction !== 'none' && effect.grade !== null ? [effect.grade] : []));
    this.appliedEffectCount = (boundaryEffects.at(-1) ?? restored.prefixEffects.at(-1))?.sequence ?? 0;
    this.altitudeCheckpoints.push({ songTimeMs: this.targetMs, appliedEffectCount: this.appliedEffectCount });
    renderer.setExplicitPlaybackChart(this.session.playbackChart);
    const score = this.session.score;
    renderer.updateCombo(this.session.combo);
    renderer.updateAccuracy(score.finalDenominatorWeight > 0 ? score.achievementRate : null);
    this.lastProgressAt = -Infinity;
    this.options.onProgress?.({ settled: score.processedNotes, combo: this.session.combo },
      this.targetMs + this.options.settings.visualOffsetMs * this.audio!.playbackRate);
  }

  private beginPreparation(): void {
    const audio = this.audio!;
    this.input!.setJudging(false);
    this.renderer!.setChartVisible(false);
    this.lastFrame = null;
    // P에 L₀·rate를 한 번 더해 실제 3초 뒤 audible J가 목표가 되게 한다.
    audio.playWithPreroll(explicitPreparationPosition(this.targetMs, audio.playbackRate, audio.getOutputLatencyMs()));
    this.playbackStarted = true;
    this.preparation = { targetMs: this.targetMs, readyAt: performance.now() + EXPLICIT_MUSIC_PREPARATION_MS };
    this.options.onPhase('music-preparation');
  }

  private activatePreparedPlayback(eventTimestamp = performance.now()): void {
    const preparation = this.preparation;
    if (!preparation || this.paused || this.closed || eventTimestamp < preparation.readyAt
      || performance.now() < preparation.readyAt || this.clock!.judgmentTimeMs() < preparation.targetMs) return;
    const session = this.session!;
    // 보정 raw/core 시각을 곡 목표로 강제 진행하면 음수 입력 offset의 합법적인 창을 닫는다.
    session.resumeAt(session.snapshot.atMs, this.currentHeldKeys(), this.clock!.judgmentTimeMs(), preparation.targetMs);
    this.renderer!.setExplicitPlaybackChart(session.playbackChart);
    // 복원한 Auto 커서·유한 키·트릴 교대 계획은 준비 동안 그대로 멈춘다.
    this.preparation = null;
    this.seededFromPreparation = true;
    this.input!.setJudging(true, preparation.readyAt);
    this.renderer!.setChartVisible(true);
    this.lastFrame = null;
    this.options.onPhase('playing');
  }

  /**
   * 준비 중에 누르거나 뗀 키가 판정 재개 뒤에야 도착했다. 탭·릴리즈 입력으로 넣지 않고
   * 바뀐 키의 레인 hold만 현재 core 시각에 맞춘다(RFD 0040: 준비 down/up은 hold로만 반영).
   * 재개를 다시 적용하지 않으므로 다른 레인 바디의 시작·유지 기한은 그대로다.
   */
  private applyLatePreparationHoldChange(): void {
    if (!this.seededFromPreparation || this.paused || this.closed || this.preparation) return;
    const session = this.session!;
    const songTimeMs = this.clock!.judgmentTimeMs();
    // 이미 큐에 들어온 재개 뒤 실제 입력을 먼저 처리해야 core의 hold와 물리 hold가 어긋나지 않는다.
    drainExplicitPlaySessionInputs(this.input!.timeline, session, Infinity, songTimeMs);
    session.syncHeldKeys(session.snapshot.atMs, this.currentHeldKeys(), songTimeMs);
  }

  private currentHeldKeys(): { lane: number; key: string }[] {
    const autoHeldKeys = [...this.autoHeldByLane].flatMap(([lane, keys]) => [...keys].map(key => ({ lane, key })));
    return [...this.input!.heldKeys, ...autoHeldKeys];
  }

  /** 확정 효과 sink가 고도에 반영한 마지막 효과 순번을 기억한다. */
  private createAdapter(session: ExplicitJudgmentSession): ExplicitSessionRendererAdapter {
    const sink = new ExplicitJudgmentEffectSink(this.renderer!);
    return new ExplicitSessionRendererAdapter(session, { applyConfirmedEffects: effects => {
      sink.applyConfirmedEffects(effects);
      this.appliedEffectCount = effects.at(-1)!.sequence;
    } });
  }

  private recordAltitudeCheckpoint(songTimeMs: number): void {
    this.renderer!.recordExplicitPlaybackPosition(songTimeMs);
    this.altitudeCheckpoints.push({ songTimeMs, appliedEffectCount: this.appliedEffectCount });
  }

  private trackAutoInputs(events: readonly ExplicitAutoInput[]): void {
    for (const event of events) {
      const held = this.autoHeldByLane.get(event.lane) ?? new Set<string>();
      if (event.type === 'down') held.add(event.key); else held.delete(event.key);
      this.autoHeldByLane.set(event.lane, held);
      this.renderer!.setKeyState(event.key.replace('explicit-auto:', ''), event.type === 'down');
    }
  }

  private recordDebug(timestamp: number, songTimeMs = this.clock!.judgmentTimeMs()): void {
    this.withDebug(() => this.debugLog?.record(this.session!, { songTimeMs,
      visualTimeMs: this.clock!.visualTimeMs(), inputTimeMs: this.clock!.toInputTimeMs(timestamp),
      frameDeltaMs: this.lastFrame === null ? undefined : timestamp - this.lastFrame }));
  }

  private withDebug(action: () => void): void {
    try { action(); } catch (error) { this.debugLog = null; console.warn('Explicit debug logging failed', error); }
  }

  downloadDebugLog(): void {
    if (this.playbackStarted) this.withDebug(() => this.debugLog?.download());
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.host.stopFrames();
    this.preparation = null;
    this.releaseInput();
    this.adapter?.dispose();
    this.adapter = null;
    this.host.dispose();
    this.renderer = null;
    this.audio = null;
    this.clock = null;
    this.session = null;
    this.auto = null;
    this.autoHeldByLane.clear();
    this.autoCursorHistory.length = 0;
    this.altitudeCheckpoints.length = 0;
  }

  private releaseInput(): void {
    this.options.inputTarget.removeEventListener('keydown', this.onKeyDown);
    this.options.inputTarget.removeEventListener('keyup', this.onKeyUp);
    this.manualHeldKeys.clear();
    this.host.releaseInput();
    this.input = null;
  }

  private fail(reason: unknown): void {
    this.dispose();
    this.options.onPhase('error');
    this.options.onError(reason instanceof Error ? reason : new Error(String(reason)));
  }
}
