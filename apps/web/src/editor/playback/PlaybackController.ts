/**
 * PlaybackController — 에디터 오디오 재생 제어
 *
 * Web Audio API 기반 재생 컨트롤러.
 * requestAnimationFrame 루프로 타임 업데이트 콜백 호출.
 */

export interface PlaybackCallbacks {
  onTimeUpdate: (currentTimeMs: number) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
}

export class PlaybackController {
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private pendingVolume: number = 1;

  private _isPlaying = false;
  private playbackStartTime = 0; // AudioContext.currentTime when play() was called
  private playbackOffset = 0; // Position in seconds where playback should start

  private animationFrameId: number | null = null;

  constructor(private callbacks: PlaybackCallbacks) {}

  /** Load an audio file from File object */
  async loadAudioFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    await this.loadAudioBuffer(arrayBuffer);
  }

  /** Load an audio file from URL */
  async loadAudioUrl(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await this.loadAudioBuffer(arrayBuffer);
  }

  private async loadAudioBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.pendingVolume;
      this.gainNode.connect(this.audioContext.destination);
    }

    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    // Reset playback state
    this.pause();
    this.playbackOffset = 0;
  }

  /** Play/pause toggle */
  togglePlay(): void {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Start playback */
  play(): void {
    if (!this.audioContext || !this.audioBuffer || this._isPlaying) {
      return;
    }

    // Create new source node
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.gainNode ?? this.audioContext.destination);

    // Start playback from current offset
    this.sourceNode.start(0, this.playbackOffset);
    this.playbackStartTime = this.audioContext.currentTime;

    this._isPlaying = true;
    this.callbacks.onPlayStateChange(true);

    // Start animation loop
    this.startAnimationLoop();

    // Handle natural end of playback
    this.sourceNode.onended = () => {
      if (this._isPlaying) {
        this.pause();
      }
    };
  }

  /** Pause playback */
  pause(): void {
    if (!this._isPlaying) {
      return;
    }

    // Save current position
    if (this.audioContext) {
      const elapsed = this.audioContext.currentTime - this.playbackStartTime;
      this.playbackOffset += elapsed;

      // Clamp to duration
      if (this.audioBuffer) {
        this.playbackOffset = Math.min(
          this.playbackOffset,
          this.audioBuffer.duration
        );
      }
    }

    // Stop source node
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        // Ignore errors if already stopped
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    this._isPlaying = false;
    this.callbacks.onPlayStateChange(false);

    // Stop animation loop
    this.stopAnimationLoop();
  }

  /** Seek to position in milliseconds */
  seekTo(timeMs: number): void {
    const wasPlaying = this._isPlaying;

    if (wasPlaying) {
      this.pause();
    }

    this.playbackOffset = timeMs / 1000;

    // Clamp to duration
    if (this.audioBuffer) {
      this.playbackOffset = Math.max(
        0,
        Math.min(this.playbackOffset, this.audioBuffer.duration)
      );
    }

    // Notify time update
    this.callbacks.onTimeUpdate(this.playbackOffset * 1000);

    if (wasPlaying) {
      this.play();
    }
  }

  /** Get current playback time in milliseconds */
  get currentTimeMs(): number {
    if (!this._isPlaying || !this.audioContext) {
      return this.playbackOffset * 1000;
    }

    const elapsed = this.audioContext.currentTime - this.playbackStartTime;
    return (this.playbackOffset + elapsed) * 1000;
  }

  /** Check if currently playing */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /** Get audio duration in milliseconds */
  get durationMs(): number {
    return this.audioBuffer ? this.audioBuffer.duration * 1000 : 0;
  }

  /** Set volume (0.0 to 1.0) */
  set volume(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    this.pendingVolume = clamped;
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    }
  }

  /** Get current volume */
  get volume(): number {
    return this.gainNode?.gain.value ?? this.pendingVolume;
  }

  /** Get the current AudioBuffer (for waveform extraction) */
  get audioBufferData(): AudioBuffer | null {
    return this.audioBuffer;
  }

  /** Dispose resources */
  dispose(): void {
    this.pause();
    this.stopAnimationLoop();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioBuffer = null;
  }

  // ---------------------------------------------------------------------------
  // Animation Loop
  // ---------------------------------------------------------------------------

  private startAnimationLoop(): void {
    const loop = () => {
      if (!this._isPlaying) {
        return;
      }

      this.callbacks.onTimeUpdate(this.currentTimeMs);
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
