export interface MediaClockSample {
  readonly realTimeMs: number;
  readonly clockPositionMs: number;
  readonly mediaPositionMs: number;
  readonly nominalRate: number;
}

const DEAD_BAND_MS = 2;
const SMOOTHING_MS = 80;
const CONVERGENCE_MS = 400;
const MAX_RATE_CORRECTION = 0.05;
const FREEZE_ERROR_MS = 250;

/** 위치를 수정하지 않고 다음 구간의 기울기만 고른다. AudioEngine이 연속인 구간으로 적분한다. */
export class MediaClockCorrection {
  private lastRealTimeMs: number | null = null;
  private smoothedErrorMs = 0;
  private frozen = false;

  reset(): void {
    this.lastRealTimeMs = null;
    this.smoothedErrorMs = 0;
    this.frozen = false;
  }

  sample({ realTimeMs, clockPositionMs, mediaPositionMs, nominalRate }: MediaClockSample): number {
    const error = mediaPositionMs - clockPositionMs;
    const elapsed = this.lastRealTimeMs === null ? SMOOTHING_MS : Math.max(0, realTimeMs - this.lastRealTimeMs);
    this.lastRealTimeMs = realTimeMs;
    // 큰 뒤처짐은 필터를 기다리지 않는다. 앞선 element를 기다리면 오차가 커지므로 음수만 freeze한다.
    if (error < -FREEZE_ERROR_MS) this.frozen = true;
    if (this.frozen) {
      if (error < -DEAD_BAND_MS) return 0;
      this.frozen = false;
      this.smoothedErrorMs = 0;
    }
    this.smoothedErrorMs += (error - this.smoothedErrorMs) * (1 - Math.exp(-elapsed / SMOOTHING_MS));
    const excess = Math.sign(this.smoothedErrorMs) * Math.max(0, Math.abs(this.smoothedErrorMs) - DEAD_BAND_MS);
    const bound = nominalRate * MAX_RATE_CORRECTION;
    return nominalRate + Math.max(-bound, Math.min(bound, excess / CONVERGENCE_MS));
  }
}
