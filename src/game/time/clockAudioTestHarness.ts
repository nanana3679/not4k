import type { ClockAudioSource } from "./GameClock";

/** 테스트에서 곡 위치를 직접 진행시키는 일정 배속 소스. */
export function createConstantRateAudioSource(currentTimeMs = 0, outputLatencyMs = 0, playbackRate = 1) {
  return {
    currentTimeMs,
    playbackRate,
    getOutputLatencyMs: () => outputLatencyMs,
    positionMsAtRealOffset(realOffsetMs: number): number {
      return this.currentTimeMs + realOffsetMs * this.playbackRate;
    },
    songMsOverRealSpan(_fromRealOffsetMs: number, realSpanMs: number): number {
      return realSpanMs * this.playbackRate;
    },
  } satisfies ClockAudioSource;
}
