import { getJudgmentWindows } from '../../shared';
import type { AudioEngine } from '../audio';
import type { KeyBinding } from '../input/InputSystem';
import { ExplicitJudgmentEffectSink } from '../judgment/ExplicitJudgmentEffectSink';
import { ExplicitSessionRendererAdapter } from '../judgment/ExplicitSessionRendererAdapter';
import type { ExplicitJudgmentSnapshot } from '../judgment/ExplicitJudgmentState';
import type { ExplicitCompiledChart } from '../judgment/explicitCompiledChart';
import { selectExplicitRangePlaybackChart } from '../judgment/explicitPlaybackChart';
import { ObserverRepetition } from '../observer/ObserverRepetition';
import type { ObserverManualStats } from '../observer/ObserverManualTally';
import { observerWholeSongRange, planObserverFadedSpan } from '../observer/observerRepetitionPlan';
import type { ObserverRange } from '../observer/observerRepetitionPlan';
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
  /** 구간 변경 대기 중에는 정지 화면의 기준 위치. 그 밖에는 출력 지연을 반영한 곡 시각(첫 출력 전 음수 허용). */
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
  /** Auto·수동 집계 변경과 조작은 즉시, 곡 시각만 바뀌면 100ms 간격으로 알린다. */
  onState?(state: ObserverPlayState): void;
  onError(error: Error): void;
}

/** 선택 구간(기본 전곡)을 반복한다. host 자원은 유지하고 새 시도마다 판정 세션과 어댑터를 교체한다. */
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
  private editingRange = false;
  private selectedRange: ObserverRange | null = null;
  /** 전곡의 미판정 상태를 한 번 보관한다. 모든 선택 범위가 같은 source id를 쓰므로 정지 미리보기에 재사용한다. */
  private initialSnapshot: ExplicitJudgmentSnapshot | null = null;
  private rangePreview: { chart: ExplicitCompiledChart; songTimeMs: number; autoEnabled: boolean } | null = null;
  private lastFrame: number | null = null;
  private readonly onPausedKey = () => {
    if (this.closed || !this.paused || !this.repetition) return;
    try { this.render(0); } catch (error) { this.fail(error); }
  };
  private lastState: ObserverPlayState | null = null;
  private lastStateAt = -Infinity;

  constructor(private readonly options: ObserverPlayRuntimeOptions) {
    const { request, settings, canvas, width, height, inputTarget } = options;
    // 설정 원본을 바꾸지 않는다. pitch 보존 감속은 후속 구현이며 진입은 항상 1.0x다.
    this.host = new ExplicitPlaybackHost({ audioBuffer: request.audioBuffer, playbackRange: request.playbackRange,
      difficultyLabel: request.document.meta.difficultyLabel, settings: { ...settings, playSpeed: 1 },
      canvas, width, height, inputTarget });
    this.bindings = Object.entries(settings.keyBindings).flatMap(([lane, keys]) =>
      keys.map((key: string) => ({ lane: Number(lane.slice(4)) as KeyBinding['lane'], key })));
  }

  /** 음원 로딩 완료 전에는 null. 로딩 뒤에는 마지막으로 선택한 불변 구간(ms)이다. */
  get range(): ObserverRange | null { return this.selectedRange; }

  async start(): Promise<void> {
    if (this.closed || this.started) return;
    this.started = true;
    this.options.onPhase('loading');
    try {
      const resources = await this.host.init();
      if (this.closed || !resources) return;
      const { audio, clock, renderer, explicitSkin } = resources;
      this.audio = audio; this.clock = clock; this.renderer = renderer;
      this.selectedRange = observerWholeSongRange(audio.duration);
      this.replaceRepetition();
      this.initialSnapshot = this.repetition!.session.snapshot;
      renderer.setExplicitChart(this.repetition!.playbackChart, explicitSkin,
        () => this.rangePreview ? { ...this.initialSnapshot!, atMs: this.rangePreview.songTimeMs }
          : this.repetition!.session.snapshot, this.options.request.document, audio.duration);
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
      // InputSystem 뒤에 등록해 바뀐 물리 hold를 읽는다. 정지 중에는 RAF가 그리지 않으므로 키 표시만 다시 그린다.
      this.options.inputTarget.addEventListener('keydown', this.onPausedKey);
      this.options.inputTarget.addEventListener('keyup', this.onPausedKey);
      this.playRepetition();
      this.host.startFrames(timestamp => {
        if (this.closed || this.paused) return;
        const songTimeMs = this.stepSession(timestamp);
        const advanceAtMs = Math.min(songTimeMs, clock.toInputTimeMs(timestamp));
        // 끝의 효과도 같은 batch로 한 번 전달한 뒤 반복 상태를 버린다. finalize/result 경로는 없다.
        this.adapter!.sync(clock.visualTimeMs());
        if (this.repetition!.isFinished(songTimeMs, advanceAtMs)) {
          this.restartRepetition();
          return;
        }
        const deltaMs = this.lastFrame === null ? 0 : timestamp - this.lastFrame;
        this.lastFrame = timestamp;
        this.render(deltaMs);
      }, error => this.fail(error));
    } catch (error) { if (!this.closed) this.fail(error); }
  }

  /** 변경한 구간은 앞 준비부터 새 시도로 시작하고, 변경 없으면 같은 반복을 잇는다. 드래그 중에는 재생하지 않는다. */
  togglePause(): void {
    if (this.closed || this.editingRange || !this.input || !this.audio || !this.clock || !this.repetition) return;
    try {
      if (this.paused && this.rangePreview) {
        this.restartRepetition();
        return;
      }
      const timestamp = performance.now();
      if (this.paused) {
        const repetition = this.repetition;
        // resumeAt은 바디 시작 창을 다시 연다. Observer는 현재 core의 hold만 맞춘다.
        repetition.session.syncHeldKeys(repetition.session.snapshot.atMs,
          repetition.autoEnabled ? repetition.autoHeldKeys : this.input.heldKeys, this.clock.judgmentTimeMs());
        this.audio.resume();
        this.input.setJudging(repetition.judgesHumanInput, performance.now());
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
      if (!this.closed) this.render(0, true);
    } catch (error) { this.fail(error); }
  }

  /** 드래그 시작: 오디오와 판정을 멈추고 큐를 닫는다. 물리 hold는 계속 추적한다. phase는 paused다. */
  beginRangeEdit(): void {
    if (this.closed || this.editingRange || !this.input || !this.audio || !this.clock || !this.repetition) return;
    try {
      if (!this.paused) {
        // 일반 일시정지처럼 정지 직전 입력을 판정하고 효과를 보낸 뒤 큐를 닫는다. 구간을 안 바꾸면 같은 시도를 잇기 때문이다.
        this.audio.pause();
        this.stepSession(performance.now());
        this.adapter!.sync(this.clock.visualTimeMs());
      }
      this.input.setJudging(false);
      this.paused = true;
      this.editingRange = true;
      this.lastFrame = null;
      this.options.onPhase('paused');
      if (!this.closed) this.render(0, true);
    } catch (error) { this.fail(error); }
  }

  /**
   * 정지/편집 중에만 변경한다. 유효하지 않은 범위는 상태를 바꾸지 않고 던진다.
   * A/B가 바뀔 때만 표시 차트를 자르고 세션·Auto 계획·집계 생성은 재생까지 미룬다.
   */
  setRange(range: ObserverRange): void {
    if (this.closed || !this.audio || !this.repetition) return;
    if (!this.paused) throw new Error('구간은 편집 또는 일시정지 중에만 변경할 수 있습니다');
    planObserverFadedSpan(range, this.audio.duration, this.audio.playbackRate);
    const previous = this.selectedRange!;
    if (range.startMs === previous.startMs && range.endMs === previous.endMs) return;
    try {
      const chart = selectExplicitRangePlaybackChart(this.options.request.compiled, range.startMs, range.endMs);
      const songTimeMs = range.startMs !== previous.startMs ? range.startMs
        : this.rangePreview?.songTimeMs ?? this.clock!.judgmentTimeMs();
      const autoEnabled = this.rangePreview?.autoEnabled ?? this.repetition.autoEnabled;
      if (!this.rangePreview) this.renderer!.resetTransientState();
      this.selectedRange = Object.freeze({ startMs: range.startMs, endMs: range.endMs });
      this.rangePreview = { chart, songTimeMs, autoEnabled };
      this.renderer!.setExplicitPlaybackChart(chart);
      this.render(0, true);
    } catch (error) { this.fail(error); }
  }

  /** 드래그를 끝내도 paused를 유지한다. 이후 togglePause로 명시적으로 재생한다. */
  endRangeEdit(): void {
    if (this.closed || !this.editingRange) return;
    this.editingRange = false;
    try { this.render(0, true); } catch (error) { this.fail(error); }
  }

  setAuto(enabled: boolean): void {
    if (this.closed || !this.input || !this.clock || !this.repetition
      || (this.rangePreview?.autoEnabled ?? this.repetition.autoEnabled) === enabled) return;
    try {
      if (this.rangePreview) {
        this.rangePreview.autoEnabled = enabled;
        this.render(0, true);
        return;
      }
      this.repetition.setAuto(enabled, this.input, this.clock, performance.now());
      // setAuto(false)는 사람 판정을 켠다. pause가 우선이므로 이벤트를 받기 전에 다시 닫는다.
      if (this.paused) this.input.setJudging(false);
      this.adapter!.sync(this.clock.visualTimeMs());
      this.render(0, true);
    } catch (error) { this.fail(error); }
  }

  /** 현재 Auto 모드·물리 hold를 넘기고 새 세션·수동 집계로 즉시 다시 재생한다. */
  retry(): void {
    if (this.closed || this.editingRange || !this.input || !this.repetition) return;
    try {
      this.renderer!.resetTransientState();
      this.restartRepetition();
    } catch (error) { this.fail(error); }
  }

  private restartRepetition(): void {
    this.input!.setJudging(false); // 이전 반복의 미처리 입력은 새 시간축으로 넘기지 않는다.
    this.replaceRepetition();
    this.rangePreview = null;
    // 자연 반복은 판정 글자·타격 수명을 유지한다. 바디 뷰는 교체하고 키·빔은 render에서 갱신한다.
    this.renderer!.setExplicitPlaybackChart(this.repetition!.playbackChart);
    this.playRepetition();
  }

  private replaceRepetition(): void {
    const audio = this.audio!;
    const range = this.selectedRange!;
    const { fromMs } = planObserverFadedSpan(range, audio.duration, audio.playbackRate);
    // J=P−L₀·r, raw=J+offset·r. 음원이 시작하는 fromMs에서 둘 중 이른 시각부터 관측한다.
    // chart는 [A,B]로 선택되므로 세션 시작점을 넓혀도 범위 밖 노트가 다시 들어오지 않는다.
    const sessionStartTimeMs = fromMs
      + (Math.min(0, this.options.settings.inputOffsetMs) - audio.getOutputLatencyMs()) * audio.playbackRate;
    const repetition = new ObserverRepetition(this.options.request.compiled, {
      range, audioDurationMs: audio.duration, playbackRate: audio.playbackRate, sessionStartTimeMs,
      auto: this.rangePreview?.autoEnabled ?? this.repetition?.autoEnabled ?? true, humanHeldKeys: this.input?.heldKeys ?? [],
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
    if (!this.closed) this.render(0, true);
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

  private render(deltaMs: number, notifyImmediately = false): void {
    const repetition = this.repetition!;
    const renderer = this.renderer!;
    const preview = this.rangePreview;
    const autoEnabled = preview?.autoEnabled ?? repetition.autoEnabled;
    const heldKeys = [...this.input!.heldKeys, ...(preview ? [] : repetition.autoHeldKeys)];
    for (let lane = 1; lane <= 4; lane++) renderer.setKeyBeam(lane, heldKeys.some(key => key.lane === lane));
    const pressed = new Set(heldKeys.map(key => key.key.replace('explicit-auto:', '')));
    for (const binding of this.bindings) renderer.setKeyState(binding.key, pressed.has(binding.key));
    const manualStats = preview
      ? autoEnabled ? null : { combo: 0, achievementRate: preview.chart.theoreticalWeight > 0 ? 0 : null }
      : repetition.manualStats;
    renderer.updateCombo(manualStats?.combo ?? 0);
    renderer.updateAccuracy(manualStats?.achievementRate ?? null);
    const songTimeMs = preview?.songTimeMs ?? this.clock!.judgmentTimeMs();
    renderer.renderFrame(songTimeMs + this.options.settings.visualOffsetMs * this.audio!.playbackRate, deltaMs);
    const timestamp = performance.now();
    const stateChanged = autoEnabled !== this.lastState?.autoEnabled
      || manualStats?.combo !== this.lastState?.manualStats?.combo
      || manualStats?.achievementRate !== this.lastState?.manualStats?.achievementRate;
    if (!notifyImmediately && !stateChanged && timestamp - this.lastStateAt < 100) return;
    this.lastStateAt = timestamp;
    this.lastState = { autoEnabled, manualStats, songTimeMs };
    this.options.onState?.(this.lastState);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.options.inputTarget.removeEventListener('keydown', this.onPausedKey);
    this.options.inputTarget.removeEventListener('keyup', this.onPausedKey);
    this.host.stopFrames();
    this.adapter?.dispose();
    this.adapter = null;
    this.host.dispose();
    this.input = null; this.repetition = null;
    this.rangePreview = null; this.initialSnapshot = null;
    this.audio = null; this.clock = null; this.renderer = null;
  }

  private fail(reason: unknown): void {
    if (this.closed) return;
    this.dispose();
    this.options.onPhase('error');
    this.options.onError(reason instanceof Error ? reason : new Error(String(reason)));
  }
}
