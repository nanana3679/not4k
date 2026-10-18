/**
 * GameClock — 한 플레이 세션의 시간 권위(RFD 0031).
 * P는 AudioContext 기반 곡 위치, L₀·오프셋·handlerDelay는 실제 시간 ms다.
 * J = P − L₀·r, V = J + visualOffsetMs·r, 입력 = J − handlerDelay·r + inputOffsetMs·r.
 * 일시정지·배속·재생 구간과 곡 끝 뒤 진행은 AudioEngine이 소유한다.
 */
export interface ClockAudioSource {
  /** 일시정지·배속을 반영한 곡 위치(ms). 오디오 끝 뒤에도 진행한다. */
  readonly currentTimeMs: number;
  /** AudioEngine이 0.1~4.0으로 제한한 실제 배속. */
  readonly playbackRate: number;
  /** 로딩 중 prepareForPlayback으로 확정한 baseLatency + outputLatency(ms). */
  getOutputLatencyMs(): number;
}

/** 한 플레이 세션 동안 불변인 실제 시간(ms) 보정값. */
export interface ClockOffsets {
  readonly inputOffsetMs: number;
  readonly visualOffsetMs: number;
}

export class GameClock {
  private readonly outputLatencyMs: number;

  constructor(
    private readonly audio: ClockAudioSource,
    private readonly offsets: ClockOffsets,
    private readonly now: () => number = () => performance.now(),
  ) {
    // 준비가 끝난 오디오에서 한 번만 읽어 첫 프레임부터 같은 L₀를 쓴다.
    this.outputLatencyMs = audio.getOutputLatencyMs();
  }

  /** 판정 시간 — 지금 스피커에서 들리는 곡 위치. */
  judgmentTimeMs(): number {
    return this.audio.currentTimeMs - this.outputLatencyMs * this.audio.playbackRate;
  }

  /** 시각 오프셋은 노트·마디선·구간의 위치에만 적용한다. */
  visualTimeMs(): number {
    return this.judgmentTimeMs() + this.offsets.visualOffsetMs * this.audio.playbackRate;
  }

  /** performance 클럭의 짧은 handlerDelay만 곡 시간으로 환산한다. 미래 timestamp는 지연 0이다. */
  toInputTimeMs(eventTimeStamp: number): number {
    const handlerDelay = Math.max(0, this.now() - eventTimeStamp);
    return this.judgmentTimeMs() + (this.offsets.inputOffsetMs - handlerDelay) * this.audio.playbackRate;
  }
}
