/**
 * PlaybackController — 에디터 오디오 재생 제어
 *
 * Web Audio API 기반 재생 컨트롤러.
 * requestAnimationFrame 루프로 타임 업데이트 콜백 호출.
 */

export interface PlaybackCallbacks {
  /** 생성·음원 로드 완료 시 읽는 화면 커서. 없으면 0ms에서 시작한다. */
  getCursorTimeMs?: () => number;
  onTimeUpdate: (currentTimeMs: number) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  /**
   * 재생을 시작하기 직전, 아직 정지 상태이고 시작 위치를 읽기 전에 부른다. 여기서 seekTo하면 그 위치부터 재생한다.
   * 음원이 없거나 이미 재생 중이라 시작하지 않으면 부르지 않는다.
   */
  beforePlay?: () => void;
  /** 최신 음원 로드가 반영된 뒤 파형·범위를 갱신한다. 오래된 로드·dispose 뒤에는 부르지 않는다. */
  onAudioLoaded?: (buffer: AudioBuffer) => void;
}

export class PlaybackController {
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private audioLoadGeneration = 0;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private pendingVolume: number = 1;

  private _isPlaying = false;
  private playbackStartTime = 0; // AudioContext.currentTime when play() was called
  private playbackOffset = 0; // Position in seconds where playback should start
  private _endTimeMs: number | null = null; // Maximum playback boundary (auto-pause when reached)

  private animationFrameId: number | null = null;

  constructor(private callbacks: PlaybackCallbacks) {
    this.seedFromCursor();
  }

  private seedFromCursor(): void {
    // store → 재생기 초기화는 커서 이동이 아니다. onTimeUpdate를 부르면 keeper의 기억이 무효화된다.
    this.playbackOffset = (this.callbacks.getCursorTimeMs?.() ?? 0) / 1000;
  }

  /** Load an audio file from File object */
  async loadAudioFile(file: File): Promise<void> {
    const generation = ++this.audioLoadGeneration;
    const arrayBuffer = await file.arrayBuffer();
    await this.loadAudioBuffer(arrayBuffer, generation);
  }

  /** Load an audio file from URL */
  async loadAudioUrl(url: string): Promise<void> {
    const generation = ++this.audioLoadGeneration;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await this.loadAudioBuffer(arrayBuffer, generation);
  }

  private async loadAudioBuffer(arrayBuffer: ArrayBuffer, generation: number): Promise<void> {
    if (generation !== this.audioLoadGeneration) return;
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.pendingVolume;
      this.gainNode.connect(this.audioContext.destination);
    }

    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    if (generation !== this.audioLoadGeneration) return;
    this.audioBuffer = audioBuffer;

    // Reset playback state
    this.pause();
    this.seedFromCursor();
    this.callbacks.onAudioLoaded?.(audioBuffer);
  }

  /** Play/pause toggle */
  togglePlay(): void {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Start playback (supports positions outside audio range as silence) */
  play(): void {
    if (!this.audioContext || !this.audioBuffer || this._isPlaying) {
      return;
    }

    this.callbacks.beforePlay?.();
    this.playbackStartTime = this.audioContext.currentTime;
    this._isPlaying = true;
    this.callbacks.onPlayStateChange(true);
    this.startAnimationLoop();

    const duration = this.audioBuffer.duration;

    if (this.playbackOffset >= 0 && this.playbackOffset < duration) {
      // Cursor is within audio range — play normally
      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.audioBuffer;
      this.sourceNode.connect(this.gainNode ?? this.audioContext.destination);
      this.sourceNode.start(0, this.playbackOffset);
      this.sourceNode.onended = () => {
        // Audio ended but cursor may still advance — don't auto-pause
        this.sourceNode?.disconnect();
        this.sourceNode = null;
      };
    } else if (this.playbackOffset < 0) {
      // Cursor is before audio start — schedule audio to begin after delay
      const delaySec = -this.playbackOffset;
      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.audioBuffer;
      this.sourceNode.connect(this.gainNode ?? this.audioContext.destination);
      this.sourceNode.start(this.audioContext.currentTime + delaySec, 0);
      this.sourceNode.onended = () => {
        this.sourceNode?.disconnect();
        this.sourceNode = null;
      };
    }
    // If cursor is past audio end, no audio plays — cursor still advances silently
  }

  /** Pause playback */
  pause(): void {
    if (!this._isPlaying) {
      return;
    }

    // Save current position (no audio clamping — measure-based range)
    if (this.audioContext) {
      const elapsed = this.audioContext.currentTime - this.playbackStartTime;
      this.playbackOffset += elapsed;
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

  /** Seek to position in milliseconds (measure-based, no audio clamping) */
  seekTo(timeMs: number): void {
    const wasPlaying = this._isPlaying;

    if (wasPlaying) {
      this.pause();
    }

    this.playbackOffset = timeMs / 1000;

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

  /** Set the maximum playback boundary in ms (auto-pauses when reached). null = no limit. */
  setEndTimeMs(ms: number | null): void {
    this._endTimeMs = ms;
  }

  /** Get the current AudioBuffer (for waveform extraction) */
  get audioBufferData(): AudioBuffer | null {
    return this.audioBuffer;
  }

  /** Dispose resources */
  dispose(): void {
    this.audioLoadGeneration++;
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

      const timeMs = this.currentTimeMs;

      // Auto-pause when reaching the end boundary
      if (this._endTimeMs !== null && timeMs >= this._endTimeMs) {
        this.seekTo(this._endTimeMs);
        this.pause();
        return;
      }

      this.callbacks.onTimeUpdate(timeMs);
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
