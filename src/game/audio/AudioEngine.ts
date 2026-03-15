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
export class AudioEngine {
  private ctx: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private startTime: number = 0;  // AudioContext time when playback started
  private startOffset: number = 0; // offset into the buffer when playback started (seconds)
  private _playing: boolean = false;
  private pauseTime: number = 0; // position in buffer when paused (seconds)
  private _playbackRate: number = 1.0;

  constructor() {
    this.ctx = new AudioContext();
  }

  /**
   * Set playback rate (e.g., 0.5 = half speed, 2.0 = double speed)
   */
  set playbackRate(rate: number) {
    const clamped = Math.max(0.1, Math.min(rate, 4.0));
    if (this._playing) {
      // 현재까지의 위치를 누적하고 startTime을 리셋
      const elapsed = this.ctx.currentTime - this.startTime;
      this.startOffset += elapsed * this._playbackRate;
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

      // Reset playback state when new audio is loaded
      this.stop();
    } catch (error) {
      throw new Error(`Failed to load audio: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load audio from an already-decoded AudioBuffer
   * @param buffer - Pre-decoded AudioBuffer
   */
  loadBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
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

    // Stop existing playback if any
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
    }

    // Create new source node
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.ctx.destination);

    // Handle natural playback end
    this.source.onended = () => {
      if (this._playing) {
        this._playing = false;
        this.pauseTime = this.buffer?.duration ?? 0;
      }
    };

    // Convert offset from ms to seconds
    const offsetSeconds = offsetMs / 1000;

    // Apply playback rate
    this.source.playbackRate.value = this._playbackRate;

    // Start playback
    this.startOffset = offsetSeconds;
    this.startTime = this.ctx.currentTime;
    this.source.start(0, offsetSeconds);
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
    this.pauseTime = this.startOffset + (this.ctx.currentTime - this.startTime) * this._playbackRate;

    // Stop the source
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }

    this._playing = false;
  }

  /**
   * Resume playback from paused position
   */
  resume(): void {
    if (this._playing || !this.buffer) {
      return;
    }

    // Resume AudioContext if suspended
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    // Create new source and start from pause position
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.ctx.destination);

    // Handle natural playback end
    this.source.onended = () => {
      if (this._playing) {
        this._playing = false;
        this.pauseTime = this.buffer?.duration ?? 0;
      }
    };

    this.source.playbackRate.value = this._playbackRate;
    this.startOffset = this.pauseTime;
    this.startTime = this.ctx.currentTime;
    this.source.start(0, this.startOffset);
    this._playing = true;
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
      this.source.disconnect();
      this.source = null;
    }

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

      // Clamp to buffer duration
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
    return this.buffer ? this.buffer.duration * 1000 : 0;
  }

  /**
   * Get audio output latency in milliseconds.
   * Combines baseLatency and outputLatency from AudioContext.
   * Returns 0 if AudioContext or properties are unavailable.
   */
  getOutputLatencyMs(): number {
    if (!this.ctx) return 0;
    const base = this.ctx.baseLatency ?? 0;
    const output = (this.ctx as any).outputLatency ?? 0;
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
}
