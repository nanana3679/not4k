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

  constructor() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
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
    const now = this.ctx.currentTime;
    if (this.clockRunning) {
      // 현재까지의 위치를 누적하고 startTime을 리셋
      const elapsed = now - this.startTime;
      this.startOffset = this.startOffset + elapsed * this._playbackRate;
      this.startTime = now;
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
  }

  setPlaybackRange(range: PlaybackRange | null): void {
    this.requestedPlaybackRange = range;
    this.applyRequestedPlaybackRange();
    this.stop();
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

  private startPlayback(offsetMs: number, allowPreroll: boolean, span: FadedAudioSpan | null): void {
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
    this.startOffset = positionSeconds;
    this.startTime = this.ctx.currentTime;
    this.clockRunning = true;
    this.pauseTime = 0;
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
    this.pauseTime = this.currentTimeMs / 1000;
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
      this.startPlayback(this.pauseTime * 1000, false, this.fadedSpan);
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
    this._playing = false;
    this.clockRunning = false;
    this.audioEnded = false;
    this.startTime = 0;
    this.startOffset = 0;
    this.pauseTime = 0;
  }

  /**
   * Get current playback position in milliseconds
   * High precision via AudioContext.currentTime
   */
  get currentTimeMs(): number {
    if (!this.buffer) {
      return 0;
    }

    if (this.clockRunning) {
      // Calculate current position from start offset and elapsed time * playbackRate
      const elapsed = this.ctx.currentTime - this.startTime;
      const position = this.startOffset + elapsed * this._playbackRate;

      // 곡 끝 뒤에도 같은 P를 이어 J가 출력 지연과 마지막 Good 창을 지날 수 있게 한다.
      return position * 1000;
    } else {
      // Return paused position or 0
      return this.pauseTime * 1000;
    }
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
    await this.ctx.close();
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

  private scheduleRangeFade(gainNode: GainNode, logicalOffsetSeconds: number, scheduledAt = this.ctx.currentTime): void {
    const gain = gainNode.gain;
    const now = scheduledAt;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(this.getRangeGainAt(logicalOffsetSeconds), now);
    if (!this.playbackRange) {
      gain.setValueAtTime(1, now);
      return;
    }

    const rate = Math.max(0.1, this._playbackRate);
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

  private scheduleSpanFade(gainNode: GainNode, span: FadedAudioSpan, positionMs: number, scheduledAt: number): void {
    const gain = gainNode.gain;
    const rate = this._playbackRate;
    const realTimeAt = (logicalMs: number) => scheduledAt + (logicalMs - positionMs) / 1000 / rate;
    gain.cancelScheduledValues(scheduledAt);
    gain.setValueAtTime(this.getSpanGainAt(span, positionMs), scheduledAt);
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
