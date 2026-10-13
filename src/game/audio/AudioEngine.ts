/**
 * AudioEngine - Web Audio API wrapper for rhythm game audio playback
 *
 * Features:
 * - Load audio from URL (streaming from server)
 * - Play / pause / resume / stop controls
 * - Seek to position (ms)
 * - High-precision playback time via AudioContext.currentTime
 * - Offset support for chart synchronization
 */
import { normalizePlaybackRange, type PlaybackRange } from '../../shared';

export class AudioEngine {
  private ctx: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
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
    if (this.clockRunning) {
      // 현재까지의 위치를 누적하고 startTime을 리셋
      const elapsed = this.ctx.currentTime - this.startTime;
      this.startOffset = this.startOffset + elapsed * this._playbackRate;
      this.startTime = this.ctx.currentTime;
    }
    this._playbackRate = clamped;
    if (this.source) {
      this.source.playbackRate.value = clamped;
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
    if (!this.buffer) {
      throw new Error('No audio loaded');
    }

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

    // Create new source node
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.sourceGain = this.ctx.createGain();
    this.source.connect(this.sourceGain);
    this.sourceGain.connect(this.masterGain);

    // Handle natural playback end
    this.source.onended = () => {
      // onended 전달이 늦어도 기준 시각을 바꾸지 않는다. P는 원래 AudioContext 시계로 계속 진행한다.
      this._playing = false;
      this.audioEnded = true;
      this.stopActiveSource();
    };

    // Convert offset from ms to seconds
    const offsetSeconds = Math.max(0, Math.min(offsetMs / 1000, this.getRangeDurationSeconds()));
    const rangeStart = this.getRangeStartSeconds();
    const actualOffsetSeconds = rangeStart + offsetSeconds;
    const remainingSeconds = Math.max(0, this.getRangeDurationSeconds() - offsetSeconds);

    // Apply playback rate
    this.source.playbackRate.value = this._playbackRate;
    this.scheduleRangeFade(this.sourceGain, offsetSeconds);

    // Start playback
    this.startOffset = offsetSeconds;
    this.startTime = this.ctx.currentTime;
    this.source.start(0, actualOffsetSeconds, remainingSeconds);
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

    if (this.audioEnded || this.pauseTime >= this.getRangeDurationSeconds()) {
      // 판정 대기 재개는 시계만 잇는다. 끝난 음원은 다시 재생하지 않는다.
      this.startOffset = this.pauseTime;
      this.startTime = this.ctx.currentTime;
      this.clockRunning = true;
    } else {
      this.play(this.pauseTime * 1000);
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

  private scheduleRangeFade(gainNode: GainNode, logicalOffsetSeconds: number): void {
    const gain = gainNode.gain;
    const now = this.ctx.currentTime;
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

  private stopActiveSource(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.sourceGain) {
      this.sourceGain.disconnect();
      this.sourceGain = null;
    }
  }
}
