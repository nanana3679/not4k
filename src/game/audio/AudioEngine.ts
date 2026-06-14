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
  private _playing: boolean = false;
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
    if (this._playing) {
      // 현재까지의 위치를 누적하고 startTime을 리셋
      const elapsed = this.ctx.currentTime - this.startTime;
      this.startOffset = Math.min(this.getRangeDurationSeconds(), this.startOffset + elapsed * this._playbackRate);
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
      if (this._playing) {
        this._playing = false;
        this.pauseTime = this.getRangeDurationSeconds();
      }
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
    this.pauseTime = 0;
  }

  /**
   * Pause playback
   * Saves current position for resume
   */
  pause(): void {
    if (!this._playing) {
      return;
    }

    // Calculate current position before stopping (elapsed wall time * playbackRate)
    this.pauseTime = Math.min(
      this.getRangeDurationSeconds(),
      this.startOffset + (this.ctx.currentTime - this.startTime) * this._playbackRate,
    );

    if (this.source) {
      this.source.stop();
    }
    this.stopActiveSource();

    this._playing = false;
  }

  /**
   * Resume playback from paused position
   */
  resume(): void {
    if (this._playing || !this.buffer) {
      return;
    }

    this.play(this.pauseTime * 1000);
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    if (this.source) {
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

    if (this._playing) {
      // Calculate current position from start offset and elapsed time * playbackRate
      const elapsed = this.ctx.currentTime - this.startTime;
      const position = this.startOffset + elapsed * this._playbackRate;

      // Clamp to playable range duration
      return Math.min(position * 1000, this.duration);
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
   * Get audio output latency in milliseconds.
   * Combines baseLatency and outputLatency from AudioContext.
   * Returns 0 if AudioContext or properties are unavailable.
   */
  getOutputLatencyMs(): number {
    if (!this.ctx) return 0;
    const base = this.ctx.baseLatency ?? 0;
    const output = this.ctx.outputLatency ?? 0;
    return (base + output) * 1000;
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
