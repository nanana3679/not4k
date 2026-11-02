/**
 * AudioEngine - Web Audio API wrapper for rhythm game audio playback
 *
 * Features:
 * - Load audio from URL (streaming from server)
 * - Play / pause / resume / stop controls
 * - Seek to position (ms)
 * - High-precision playback time via AudioContext.currentTime
 * - Offset support for chart synchronization
 * - Observer faded span playback (fade in → selected range → fade out, stops at span end)
 */
import { normalizePlaybackRange, type PlaybackRange } from '../../shared';
import { encodePcmWav } from './encodePcmWav';
import { MediaClockCorrection } from './MediaClockCorrection';
import { PitchPreservingMedia } from './PitchPreservingMedia';
import { getMediaPlaybackLeadMs } from './mediaPlaybackLead';

export interface AudioEngineOptions {
  readonly preservePitch?: boolean;
}

/**
 * 옵저버 반복 1회의 재생 범위. 모두 재생 범위 기준 논리 위치(ms)다.
 * fromMs～fadeInUntilMs에서 페이드 인, fadeOutFromMs～toMs에서 페이드 아웃하고 toMs에서 음원을 멈춘다.
 */
export interface FadedAudioSpan {
  readonly fromMs: number;
  readonly fadeInUntilMs: number;
  readonly fadeOutFromMs: number;
  readonly toMs: number;
}

/** 실행 시각과 곡 위치는 초 단위다. */
interface RateSegment {
  readonly runningTime: number;
  readonly position: number;
  readonly rate: number;
}

// 단위는 초. 최근 실행 시간 5초와 경계를 포함하는 구간 1개를 보관한다.
// GameClock의 약 1.6초 과거 조회를 덮고, 메모리는 전체 재생 길이 대신 최근 5초의 배속 변경 수에 비례한다.
const RATE_HISTORY_SECONDS = 5;

export class AudioEngine {
  private ctx: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  // 페이드 구간 재생 중에만 sourceGain과 masterGain 사이에 둔다. 범위 페이드와 곱해진다.
  private spanGain: GainNode | null = null;
  // pause/resume이 같은 구간을 잇도록 보관한다. play·playWithPreroll·stop이 지운다.
  private fadedSpan: FadedAudioSpan | null = null;
  private buffer: AudioBuffer | null = null;
  private masterGain: GainNode;
  private startTime: number = 0;  // AudioContext time when playback started
  private startOffset: number = 0; // offset into the buffer when playback started (seconds)
  // startTime까지 누적한 실행 시간(초). pause 중에는 진행하지 않는다.
  private runningTime = 0;
  private rateSegments: RateSegment[] = [{ runningTime: 0, position: 0, rate: 1 }];
  // play 계열이 연 재생 시도. stop 뒤나 첫 재생 전 배속 변경은 이력을 잇지 않고 기준 구간을 바꾼다.
  private attemptActive = false;
  // 음악이 끝나도 판정 대기 중에는 시계가 계속 돈다. pause/stop만 멈춘다.
  private clockRunning = false;
  private _playing: boolean = false;
  private audioEnded = false;
  private outputLatencyMs: number | null = null;
  private preparation: Promise<void> | null = null;
  private pauseTime: number = 0; // position in buffer when paused (seconds)
  private _playbackRate: number = 1.0;
  private requestedPlaybackRange: PlaybackRange | null = null;
  private playbackRange: PlaybackRange | null = null;
  private readonly media: PitchPreservingMedia | null;
  private readonly mediaCorrection = new MediaClockCorrection();
  private mediaClockRate = 1;
  private lastMediaSampleTime = -Infinity;
  private mediaPreparation: Promise<void> | null = null;

  constructor(options: AudioEngineOptions = {}) {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.media = options.preservePitch ? new PitchPreservingMedia(this.ctx, () => this.endMediaPlayback()) : null;
  }

  /** Set master volume (0.0 to 1.0) */
  set masterVolume(value: number) {
    this.masterGain.gain.value = Math.max(0, Math.min(1, value));
  }

  get masterVolume(): number {
    return this.masterGain.gain.value;
  }

  /**
   * Set playback rate (e.g., 0.5 = half speed, 2.0 = double speed)
   */
  set playbackRate(rate: number) {
    const clamped = Math.max(0.1, Math.min(rate, 4.0));
    if (this.media) {
      this.syncMediaClock();
      this._playbackRate = clamped;
      this.media.playbackRate = clamped;
      this.mediaCorrection.reset();
      if (this.attemptActive) {
        this.appendMediaRate(clamped, this.ctx.currentTime);
      } else {
        // 첫 재생 전·stop 뒤에는 이어 붙일 이력이 없으므로 기준 구간을 바꾼다.
        this.rateSegments = [{ runningTime: this.runningTime, position: this.pauseTime, rate: clamped }];
        this.mediaClockRate = clamped;
      }
      if (this._playing) {
        this.scheduleMediaFades(this.startOffset, this.ctx.currentTime,
          this.media.positionSeconds + getMediaPlaybackLeadMs(this._playbackRate) / 1000);
      }
      return;
    }
    const now = this.ctx.currentTime;
    if (this.clockRunning) {
      // 현재까지의 위치를 누적하고 startTime을 리셋
      const elapsed = now - this.startTime;
      this.runningTime += elapsed;
      this.startOffset = this.startOffset + elapsed * this._playbackRate;
      this.startTime = now;
    }
    if (clamped !== this._playbackRate) {
      // 일시정지 중에도 정지 시각에 구간을 이어 붙여 J가 튀지 않게 한다. 재개 뒤 L₀ 동안은 이전 배속으로 진행한다.
      const position = this.clockRunning ? this.startOffset : this.pauseTime;
      const segment = { runningTime: this.runningTime, position, rate: clamped };
      // 같은 실행 시각의 변경은 마지막 배속만 남긴다. 첫 구간은 시작 전 역외삽에 필요하다.
      if (!this.attemptActive) {
        this.rateSegments = [segment];
      } else if (this.rateSegments.length > 1
        && this.rateSegments[this.rateSegments.length - 1].runningTime === this.runningTime) {
        this.rateSegments[this.rateSegments.length - 1] = segment;
      } else {
        this.rateSegments.push(segment);
      }
      this.pruneRateHistory(this.runningTime);
    }
    this._playbackRate = clamped;
    if (this.source) {
      this.source.playbackRate.value = clamped;
    }
    if (this.clockRunning && this.fadedSpan && this.spanGain) {
      this.scheduleSpanFade(this.spanGain, this.fadedSpan, this.startOffset * 1000, now);
    }
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  /**
   * Load audio file from URL
   * @param url - Audio file URL (typically from server)
   */
  async loadAudio(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.applyRequestedPlaybackRange();

      // Reset playback state when new audio is loaded
      this.stop();
      this.loadMediaBuffer();
    } catch (error) {
      throw new Error(
        `Failed to load audio: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /**
   * Load audio from an already-decoded AudioBuffer
   * @param buffer - Pre-decoded AudioBuffer
   */
  loadBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
    this.applyRequestedPlaybackRange();
    this.stop();
    this.loadMediaBuffer();
  }

  setPlaybackRange(range: PlaybackRange | null): void {
    this.requestedPlaybackRange = range;
    this.applyRequestedPlaybackRange();
    this.stop();
    this.loadMediaBuffer();
  }

  /**
   * Start playback from specified offset
   * @param offsetMs - Starting position in milliseconds (default: 0)
   */
  play(offsetMs: number = 0): void {
    this.startPlayback(offsetMs, false, null);
  }

  /** 음악 준비용 P. 음수 구간은 무음으로 두고 곡 0을 AudioContext에 미리 예약한다. */
  playWithPreroll(positionMs: number): void {
    if (this.media) throw new Error('Pitch-preserving playback does not support playWithPreroll');
    if (!Number.isFinite(positionMs)) throw new RangeError('Preparation position must be finite');
    this.startPlayback(positionMs, true, null);
  }

  /**
   * 옵저버 반복 1회. startMs(기본 fromMs)부터 재생해 toMs에서 음원을 멈추고 남은 페이드를 spanGain에 예약한다.
   * 음원 범위 밖을 무음으로 채우지 않으므로 음수 위치는 받지 않는다. 시계는 toMs 뒤에도 계속 돈다.
   * duration을 최대 0.5ms 초과하는 경계와 시작 위치는 부동소수점 오차로 보고 duration으로 자른다.
   */
  playFadedSpan(span: FadedAudioSpan, startMs = span.fromMs): void {
    if (!this.buffer) {
      throw new Error('No audio loaded');
    }
    const { fromMs, fadeInUntilMs, fadeOutFromMs, toMs } = span;
    const duration = this.duration;
    const finite = [fromMs, fadeInUntilMs, fadeOutFromMs, toMs].every(Number.isFinite);
    const ordered = 0 <= fromMs && fromMs <= fadeInUntilMs && fadeInUntilMs <= fadeOutFromMs
      && fadeOutFromMs <= toMs && toMs <= duration + 0.5;
    if (!finite || !ordered) {
      throw new RangeError('Faded span must satisfy 0 <= from <= fadeInUntil <= fadeOutFrom <= to <= duration + 0.5ms');
    }
    const clampedSpan: FadedAudioSpan = {
      fromMs: Math.min(fromMs, duration),
      fadeInUntilMs: Math.min(fadeInUntilMs, duration),
      fadeOutFromMs: Math.min(fadeOutFromMs, duration),
      toMs: Math.min(toMs, duration),
    };
    const clampedStartMs = Math.min(startMs, duration);
    if (!Number.isFinite(startMs) || startMs > duration + 0.5
      || clampedStartMs < clampedSpan.fromMs || clampedStartMs > clampedSpan.toMs) {
      throw new RangeError('Start must be finite and within the faded span (duration tolerance: 0.5ms)');
    }
    this.startPlayback(clampedStartMs, false, clampedSpan);
  }

  private startPlayback(
    offsetMs: number, allowPreroll: boolean, span: FadedAudioSpan | null, preserveRateHistory = false,
  ): void {
    if (!this.buffer) {
      throw new Error('No audio loaded');
    }
    this.fadedSpan = span;

    // Resume AudioContext if suspended (autoplay policy)
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'InvalidStateError')) {
          console.warn('AudioEngine.play: unexpected stop error', e);
        }
      }
    }
    this.stopActiveSource();

    const positionSeconds = allowPreroll ? offsetMs / 1000
      : Math.max(0, Math.min(offsetMs / 1000, this.getRangeDurationSeconds()));
    // resume은 정지 전 이력을 잇는다. 기존 resume의 음수 위치 클램프는 새 시작으로 취급한다.
    const freshAnchor = !preserveRateHistory || !this.attemptActive || positionSeconds !== offsetMs / 1000;
    const leadSeconds = this.media ? getMediaPlaybackLeadMs(this._playbackRate) / 1000 : 0;
    // 첫 출력부터 선행량이 있으므로 새 앵커에만 더한다. 이력을 잇는 resume은 P·J를 옮기지 않는다.
    const clockPositionSeconds = positionSeconds + (freshAnchor ? leadSeconds : 0);
    if (freshAnchor) {
      this.runningTime = 0;
      this.rateSegments = [{ runningTime: 0, position: clockPositionSeconds, rate: this._playbackRate }];
    }
    this.startOffset = clockPositionSeconds;
    this.startTime = this.ctx.currentTime;
    this.clockRunning = true;
    this.attemptActive = true;
    this.pauseTime = 0;
    if (this.media) {
      this.mediaCorrection.reset();
      this.lastMediaSampleTime = this.startTime;
      if (!freshAnchor) this.appendMediaRate(this._playbackRate, this.startTime);
      else this.mediaClockRate = this._playbackRate;
      this.sourceGain = this.ctx.createGain();
      // media에는 play()에도 끝 시각을 보장하는 gate가 필요하다.
      this.spanGain = this.ctx.createGain();
      this.sourceGain.connect(this.spanGain);
      this.spanGain.connect(this.masterGain);
      this._playing = true;
      this.audioEnded = false;
      this.scheduleMediaFades(clockPositionSeconds, this.startTime, positionSeconds + leadSeconds);
      this.media.start(this.sourceGain, positionSeconds, this._playbackRate);
      if (positionSeconds + leadSeconds >= (span ? span.toMs / 1000 : this.getRangeDurationSeconds())) this.endMediaPlayback();
      return;
    }
    if (allowPreroll && positionSeconds >= this.getRangeDurationSeconds()) {
      this._playing = false;
      this.audioEnded = true;
      return;
    }

    // Create new source node
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.sourceGain = this.ctx.createGain();
    this.source.connect(this.sourceGain);
    // 범위 페이드(sourceGain)와 구간 페이드(spanGain)를 다른 노드에 두어 한 AudioParam을 두고 다투지 않게 한다.
    const spanGain = span ? this.ctx.createGain() : null;
    this.spanGain = spanGain;
    this.sourceGain.connect(spanGain ?? this.masterGain);
    spanGain?.connect(this.masterGain);

    // Handle natural playback end
    const source = this.source;
    source.onended = () => {
      if (this.source !== source) return;
      // onended 전달이 늦어도 기준 시각을 바꾸지 않는다. P는 원래 AudioContext 시계로 계속 진행한다.
      this._playing = false;
      this.audioEnded = true;
      this.stopActiveSource();
    };

    // Convert offset from ms to seconds
    const offsetSeconds = Math.max(0, positionSeconds);
    const delaySeconds = Math.max(0, -positionSeconds / this._playbackRate);
    const scheduledAt = this.startTime + delaySeconds;
    const rangeStart = this.getRangeStartSeconds();
    const actualOffsetSeconds = rangeStart + offsetSeconds;
    // source.start의 길이는 버퍼 시간이라 배속과 무관하게 구간 끝 toMs에서 멈춘다.
    const stopSeconds = span ? span.toMs / 1000 : this.getRangeDurationSeconds();
    const remainingSeconds = Math.max(0, stopSeconds - offsetSeconds);

    // Apply playback rate
    this.source.playbackRate.value = this._playbackRate;
    this.scheduleRangeFade(this.sourceGain, offsetSeconds, scheduledAt);
    if (span && spanGain) this.scheduleSpanFade(spanGain, span, offsetSeconds * 1000, scheduledAt);

    // Start playback
    this.source.start(delaySeconds > 0 ? scheduledAt : 0, actualOffsetSeconds, remainingSeconds);
    this._playing = true;
    this.audioEnded = false;
    this.clockRunning = true;
    this.pauseTime = 0;
  }

  /**
   * Pause playback
   * Saves current position for resume
   */
  pause(): void {
    if (!this.clockRunning) return;
    this.syncMediaClock();
    const elapsed = this.ctx.currentTime - this.startTime;
    this.pauseTime = this.startOffset + elapsed * this.clockRate;
    this.runningTime += elapsed;
    this.clockRunning = false;

    if (this.source) {
      this.source.onended = null;
      this.source.stop();
    }
    this.stopActiveSource();

    this._playing = false;
  }

  /**
   * Resume playback from paused position
   */
  resume(): void {
    if (this.clockRunning || !this.buffer) {
      return;
    }

    // 페이드 구간 재생이면 구간 끝 toMs에서 음원이 끝난다.
    const audioEndSeconds = this.fadedSpan ? this.fadedSpan.toMs / 1000 : this.getRangeDurationSeconds();
    if (this.audioEnded || this.pauseTime >= audioEndSeconds) {
      // 판정 대기 재개는 시계만 잇는다. 끝난 음원은 다시 재생하지 않는다.
      this.startOffset = this.pauseTime;
      this.startTime = this.ctx.currentTime;
      this.clockRunning = true;
    } else {
      // 페이드 구간 재생 중이었으면 같은 구간 끝과 남은 페이드를 이어서 예약한다.
      this.startPlayback(this.pauseTime * 1000, false, this.fadedSpan, true);
    }
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'InvalidStateError')) {
          console.warn('AudioEngine.stop: unexpected error', e);
        }
      }
    }
    this.stopActiveSource();

    this.fadedSpan = null;
    this.media?.seek(0);
    this.mediaCorrection.reset();
    this.mediaClockRate = this._playbackRate;
    this.lastMediaSampleTime = -Infinity;
    this._playing = false;
    this.clockRunning = false;
    this.audioEnded = false;
    this.startTime = 0;
    this.startOffset = 0;
    this.pauseTime = 0;
    this.runningTime = 0;
    this.rateSegments = [{ runningTime: 0, position: 0, rate: this._playbackRate }];
    this.attemptActive = false;
  }

  /**
   * Get current playback position in milliseconds
   * High precision via AudioContext.currentTime
   */
  get currentTimeMs(): number {
    if (!this.buffer) {
      return 0;
    }

    this.syncMediaClock();
    if (this.clockRunning) {
      // Calculate current position from start offset and elapsed time * playbackRate
      const elapsed = this.ctx.currentTime - this.startTime;
      const position = this.startOffset + elapsed * this.clockRate;

      // 곡 끝 뒤에도 같은 P를 이어 J가 출력 지연과 마지막 Good 창을 지날 수 있게 한다.
      return position * 1000;
    } else {
      // Return paused position or 0
      return this.pauseTime * 1000;
    }
  }

  /**
   * 현재 실행 시각에서 실제 시간 offset(ms)만큼 이동한 곡 위치. 과거는 이력, 미래는 현재 배속으로 외삽한다.
   * 미래 외삽값은 배속 변경으로 달라질 수 있으므로 양수 offset의 단조 증가를 보장하지 않는다.
   */
  positionMsAtRealOffset(realOffsetMs: number): number {
    this.syncMediaClock();
    const now = this.runningNow();
    this.pruneRateHistory(now);
    const target = now + realOffsetMs / 1000;
    // 마지막 구간 안이면 기존 P − L₀·r와 같은 순서로 계산해 일정 배속의 판정 경계값을 비트 단위로 유지한다.
    if (this.inCurrentSegment(target)) return this.currentTimeMs + realOffsetMs * this.clockRate;
    // target 이전 마지막 구간을 찾는다. 보관 범위 이전이면 첫 구간으로 역외삽한다.
    let low = 0;
    let high = this.rateSegments.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.rateSegments[middle].runningTime <= target) low = middle;
      else high = middle;
    }
    const segment = this.rateSegments[low];
    return (segment.position + (target - segment.runningTime) * segment.rate) * 1000;
  }

  /**
   * fromRealOffsetMs에서 실제 시간 realSpanMs 동안 진행하는 곡 시간(ms). 음수 span은 과거 방향이다.
   * 두 끝이 마지막 구간 안이면 기존 오프셋·r 곱과 같은 값을 돌려준다.
   */
  songMsOverRealSpan(fromRealOffsetMs: number, realSpanMs: number): number {
    const now = this.runningNow();
    const from = now + fromRealOffsetMs / 1000;
    if (this.inCurrentSegment(from) && this.inCurrentSegment(from + realSpanMs / 1000)) {
      return realSpanMs * this.clockRate;
    }
    return this.positionMsAtRealOffset(fromRealOffsetMs + realSpanMs) - this.positionMsAtRealOffset(fromRealOffsetMs);
  }

  private runningNow(): number {
    return this.runningTime + (this.clockRunning ? this.ctx.currentTime - this.startTime : 0);
  }

  /** 시계가 지금 쓰는 기울기. media 경로는 보정한 기울기이고 일반 경로는 배속과 같다. */
  private get clockRate(): number {
    return this.media ? this.mediaClockRate : this._playbackRate;
  }

  private inCurrentSegment(runningTime: number): boolean {
    const last = this.rateSegments[this.rateSegments.length - 1];
    return this.rateSegments.length === 1 || runningTime >= last.runningTime;
  }

  private pruneRateHistory(now: number): void {
    const cutoff = now - RATE_HISTORY_SECONDS;
    let first = 0;
    while (first + 1 < this.rateSegments.length && this.rateSegments[first + 1].runningTime <= cutoff) {
      first++;
    }
    if (first > 0) this.rateSegments.splice(0, first);
  }

  /**
   * Check if audio is currently playing
   */
  get playing(): boolean {
    return this._playing;
  }

  /**
   * Get total duration in milliseconds
   */
  get duration(): number {
    return this.buffer ? this.getRangeDurationSeconds() * 1000 : 0;
  }

  /**
   * 재생 전 로딩 중 호출한다. running 출력에 무음 버퍼를 연결하고 25ms 간격으로 관측한다.
   * 실제 최소 100ms 뒤 연속 3개 값의 차이가 0.1ms 이하면 확정하고, 최대 500ms 뒤 마지막 값을 쓴다.
   * 지원되는 outputLatency가 0이면 아직 안정되지 않은 것으로 보고 관측을 계속한다.
   * Promise와 L₀를 보관하므로 중복 호출·pause/resume은 다시 읽지 않는다.
   */
  prepareForPlayback(): Promise<void> {
    this.preparation ??= this.captureOutputLatency();
    if (this.media) {
      this.mediaPreparation ??= Promise.all([this.preparation, this.media.prepare()]).then(() => {});
      return this.mediaPreparation;
    }
    return this.preparation;
  }

  private async captureOutputLatency(): Promise<void> {
    if (this.ctx.state !== 'running') {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.ctx.resume(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('AudioContext.resume() timed out after 2000ms during playback preparation')), 2000);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
    const silence = this.ctx.createBufferSource();
    silence.buffer = this.ctx.createBuffer(1, 128, this.ctx.sampleRate);
    silence.loop = true;
    silence.connect(this.masterGain);
    silence.start();
    const startedAt = performance.now();
    const samples: number[] = [];
    try {
      while (true) {
        await new Promise<void>(resolve => setTimeout(resolve, 25));
        if (this.ctx.state !== 'running') throw new Error('AudioContext stopped during latency preparation');
        const elapsed = performance.now() - startedAt;
        const base = this.ctx.baseLatency ?? 0;
        const supportsOutputLatency = 'outputLatency' in this.ctx;
        const output = supportsOutputLatency ? (this.ctx.outputLatency ?? 0) : 0;
        const reportedLatencyMs = ((Number.isFinite(base) ? base : 0) + (Number.isFinite(output) ? output : 0)) * 1000;
        const latencyMs = Number.isFinite(reportedLatencyMs) ? reportedLatencyMs : 0;
        samples.push(latencyMs);
        if (samples.length > 3) samples.shift();
        if (supportsOutputLatency && output === 0) samples.length = 0;
        const stable = samples.length === 3 && Math.max(...samples) - Math.min(...samples) <= 0.1;
        if ((elapsed >= 100 && stable) || elapsed >= 500) {
          this.outputLatencyMs = latencyMs;
          break;
        }
      }
    } finally {
      silence.stop();
      silence.disconnect();
    }
  }

  /** 로딩 중 확정한 L₀. 미준비 값 0을 첫 프레임에 쓰지 않는다. */
  getOutputLatencyMs(): number {
    if (this.outputLatencyMs === null) throw new Error('AudioEngine.prepareForPlayback must finish before creating GameClock');
    return this.outputLatencyMs;
  }

  /**
   * Dispose resources and close audio context
   * Call when engine is no longer needed
   */
  async dispose(): Promise<void> {
    this.stop();
    this.media?.dispose();
    if (this.media) this.masterGain.disconnect();
    await this.ctx.close();
  }

  private loadMediaBuffer(): void {
    if (!this.media || !this.buffer) return;
    this.mediaPreparation = null;
    // 원본 rangeStart는 WAV를 자를 때 이미 반영한다. element.currentTime은 논리 곡 위치다.
    this.media.load(encodePcmWav(this.buffer, this.getRangeStartSeconds(), this.getRangeEndSeconds()));
  }

  /** 기존 위치에서 연속인 기울기만 추가한다. nominal playbackRate는 바꾸지 않는다. */
  private appendMediaRate(rate: number, now: number): void {
    const elapsed = this.clockRunning ? now - this.startTime : 0;
    const position = this.clockRunning ? this.startOffset + elapsed * this.mediaClockRate : this.pauseTime;
    this.runningTime += elapsed;
    this.startOffset = position;
    this.startTime = now;
    if (rate !== this.mediaClockRate) {
      const segment = { runningTime: this.runningTime, position, rate };
      const last = this.rateSegments.length - 1;
      if (last > 0 && this.rateSegments[last].runningTime === this.runningTime) this.rateSegments[last] = segment;
      else this.rateSegments.push(segment);
    }
    this.mediaClockRate = rate;
    this.pruneRateHistory(this.runningTime);
  }

  private syncMediaClock(): void {
    if (!this.media || !this.clockRunning || !this._playing) return;
    const now = this.ctx.currentTime;
    // 한 query에서 currentTime은 한 번만 읽는다. 100Hz 상한으로 최근 5초 이력도 약 501개로 제한한다.
    if (now - this.lastMediaSampleTime < 0.01) return;
    this.lastMediaSampleTime = now;
    const position = this.startOffset + (now - this.startTime) * this.mediaClockRate;
    const mediaPosition = this.media.positionSeconds + getMediaPlaybackLeadMs(this._playbackRate) / 1000;
    const end = this.fadedSpan ? this.fadedSpan.toMs / 1000 : this.getRangeDurationSeconds();
    if (position >= end || mediaPosition >= end) {
      this.endMediaPlayback();
      return;
    }
    const rate = this.mediaCorrection.sample({ realTimeMs: now * 1000, clockPositionMs: position * 1000,
      mediaPositionMs: mediaPosition * 1000, nominalRate: this._playbackRate });
    this.appendMediaRate(rate, now);
    this.scheduleMediaFades(position, now, mediaPosition);
  }

  private endMediaPlayback(): void {
    if (!this._playing) return;
    this.appendMediaRate(this._playbackRate, this.ctx.currentTime);
    this._playing = false;
    this.audioEnded = true;
    this.stopActiveSource();
  }

  private scheduleMediaFades(position: number, now: number, mediaPosition: number): void {
    if (!this.sourceGain || !this.spanGain) return;
    this.scheduleRangeFade(this.sourceGain, position, now, this.mediaClockRate);
    const span = this.fadedSpan;
    const gain = this.spanGain.gain;
    const end = span ? span.toMs / 1000 : this.getRangeDurationSeconds();
    const clockRemaining = this.mediaClockRate > 0 ? (end - position) / this.mediaClockRate : Infinity;
    const mediaRemaining = (end - mediaPosition) / this._playbackRate;
    const endAt = now + Math.max(0, Math.min(clockRemaining, mediaRemaining));
    if (span) this.scheduleSpanFade(this.spanGain, span, position * 1000, now, this.mediaClockRate, endAt);
    else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(1, now);
    }
    // RAF가 늦어져도 무음은 AudioContext가 예약한 끝 시각에 시작한다. fade-out 없는 span도 포함한다.
    gain.setValueAtTime(0, endAt);
  }

  private applyRequestedPlaybackRange(): void {
    this.playbackRange = this.buffer
      ? normalizePlaybackRange(this.requestedPlaybackRange, this.buffer.duration)
      : null;
  }

  private getRangeStartSeconds(): number {
    return this.playbackRange?.startTime ?? 0;
  }

  private getRangeEndSeconds(): number {
    return this.playbackRange?.endTime ?? this.buffer?.duration ?? 0;
  }

  private getRangeDurationSeconds(): number {
    return Math.max(0, this.getRangeEndSeconds() - this.getRangeStartSeconds());
  }

  private getRangeGainAt(logicalPositionSeconds: number): number {
    if (!this.playbackRange) return 1;
    const duration = this.getRangeDurationSeconds();
    const fadeIn = this.playbackRange.fadeInTime;
    const fadeOut = this.playbackRange.fadeOutTime;
    const fadeInGain = fadeIn > 0 ? Math.min(1, Math.max(0, logicalPositionSeconds / fadeIn)) : 1;
    const remaining = duration - logicalPositionSeconds;
    const fadeOutGain = fadeOut > 0 ? Math.min(1, Math.max(0, remaining / fadeOut)) : 1;
    return Math.min(fadeInGain, fadeOutGain);
  }

  private scheduleRangeFade(gainNode: GainNode, logicalOffsetSeconds: number, scheduledAt = this.ctx.currentTime,
    rate = Math.max(0.1, this._playbackRate)): void {
    const gain = gainNode.gain;
    const now = scheduledAt;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(this.getRangeGainAt(logicalOffsetSeconds), now);
    if (!this.playbackRange) {
      gain.setValueAtTime(1, now);
      return;
    }

    if (rate === 0) return;
    const duration = this.getRangeDurationSeconds();

    if (this.playbackRange.fadeInTime > logicalOffsetSeconds) {
      const fadeInRemaining = this.playbackRange.fadeInTime - logicalOffsetSeconds;
      gain.linearRampToValueAtTime(1, now + fadeInRemaining / rate);
    }

    if (this.playbackRange.fadeOutTime > 0) {
      const fadeOutStart = Math.max(0, duration - this.playbackRange.fadeOutTime);
      const fadeOutStartFromNow = fadeOutStart - logicalOffsetSeconds;
      const rangeEndFromNow = duration - logicalOffsetSeconds;
      if (rangeEndFromNow > 0) {
        if (fadeOutStartFromNow > 0) {
          gain.setValueAtTime(1, now + fadeOutStartFromNow / rate);
        }
        gain.linearRampToValueAtTime(0, now + rangeEndFromNow / rate);
      }
    }
  }

  /** 구간 페이드 값. fromMs～fadeInUntilMs는 0→1, fadeOutFromMs～toMs는 1→0이다. */
  private getSpanGainAt(span: FadedAudioSpan, positionMs: number): number {
    const { fromMs, fadeInUntilMs, fadeOutFromMs, toMs } = span;
    const fadeInGain = fadeInUntilMs > fromMs
      ? Math.min(1, Math.max(0, (positionMs - fromMs) / (fadeInUntilMs - fromMs))) : 1;
    const fadeOutGain = toMs > fadeOutFromMs
      ? Math.min(1, Math.max(0, (toMs - positionMs) / (toMs - fadeOutFromMs))) : 1;
    return Math.min(fadeInGain, fadeOutGain);
  }

  private scheduleSpanFade(gainNode: GainNode, span: FadedAudioSpan, positionMs: number, scheduledAt: number,
    rate = this._playbackRate, endAt = Infinity): void {
    const gain = gainNode.gain;
    const realTimeAt = (logicalMs: number) => Math.min(endAt, scheduledAt + (logicalMs - positionMs) / 1000 / rate);
    gain.cancelScheduledValues(scheduledAt);
    gain.setValueAtTime(this.getSpanGainAt(span, positionMs), scheduledAt);
    if (rate === 0) return;
    if (span.fadeInUntilMs > positionMs) {
      gain.linearRampToValueAtTime(1, realTimeAt(span.fadeInUntilMs));
    }
    if (span.toMs > span.fadeOutFromMs && span.toMs > positionMs) {
      if (span.fadeOutFromMs > positionMs) {
        gain.setValueAtTime(1, realTimeAt(span.fadeOutFromMs));
      }
      gain.linearRampToValueAtTime(0, realTimeAt(span.toMs));
    }
  }

  private stopActiveSource(): void {
    this.media?.pause();
    if (this.source) {
      this.source.onended = null;
      this.source.disconnect();
      this.source = null;
    }
    if (this.sourceGain) {
      this.sourceGain.disconnect();
      this.sourceGain = null;
    }
    if (this.spanGain) {
      this.spanGain.disconnect();
      this.spanGain = null;
    }
  }
}
