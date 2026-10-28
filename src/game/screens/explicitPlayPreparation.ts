export const EXPLICIT_MUSIC_PREPARATION_MS = 3000;
export const EXPLICIT_REWIND_SONG_MS = 3000;

/** 준비의 실제 3초와 별개로, 이번 플레이 범위 안에서 곡 시각을 고정 3000ms 되감는다. */
export function explicitResumeTarget(pausedSongTimeMs: number, attemptStartTimeMs: number): number {
  return Math.max(attemptStartTimeMs, pausedSongTimeMs - EXPLICIT_REWIND_SONG_MS);
}

/** J = P − L₀·rate가 실제 3초 뒤 target에 도달한다. 입력·시각 offset은 섞지 않는다. */
export function explicitPreparationPosition(targetMs: number, rate: number, outputLatencyMs: number): number {
  return targetMs - (EXPLICIT_MUSIC_PREPARATION_MS - outputLatencyMs) * rate;
}
