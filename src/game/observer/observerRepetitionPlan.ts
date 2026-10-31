/** 선택 구간 앞뒤에 덧붙여 페이드하는 재생 길이. 배속과 무관한 실제 시간이다(RFD 0062). */
export const OBSERVER_FADE_REAL_TIME_MS = 3000;

/** 옵저버 선택 구간 [startMs, endMs]. 곡 시간(ms)이며 양 끝을 포함한다. */
export interface ObserverRange {
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * 옵저버 반복 1회의 음원 재생 범위(곡 시간 ms). fromMs～fadeInUntilMs에서 페이드 인, fadeOutFromMs～toMs에서 페이드 아웃한다.
 * `AudioEngine.playFadedSpan`이 받는 `FadedAudioSpan`과 같은 모양이다. 판정 세션은 출력 지연·입력 보정 때문에 fromMs보다 먼저 시작할 수 있다.
 */
export interface ObserverFadedSpan {
  readonly fromMs: number;
  readonly fadeInUntilMs: number;
  readonly fadeOutFromMs: number;
  readonly toMs: number;
}

/** 구간을 따로 고르지 않았을 때의 기본 구간인 전곡(RFD 0064). */
export function observerWholeSongRange(audioDurationMs: number): ObserverRange {
  assertAudioDuration(audioDurationMs);
  return Object.freeze({ startMs: 0, endMs: audioDurationMs });
}

/**
 * 선택 구간 앞뒤로 실제 시간 최대 3000ms씩 더 재생한다. 배속 r이면 곡 시간으로 3000r ms다.
 * 음원 밖의 부족한 시간은 무음으로 채우지 않고 0～음원 길이로 자른다. 선택 구간 자체는 줄이지 않는다(RFD 0062).
 */
export function planObserverFadedSpan(range: ObserverRange, audioDurationMs: number, playbackRate: number): ObserverFadedSpan {
  assertAudioDuration(audioDurationMs);
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) throw new RangeError("재생 배속은 0보다 큰 유한한 값이어야 합니다");
  const { startMs, endMs } = range;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || startMs > endMs || endMs > audioDurationMs) {
    throw new RangeError("선택 구간은 0 <= 시작 <= 끝 <= 음원 길이여야 합니다");
  }
  const fadeSongMs = OBSERVER_FADE_REAL_TIME_MS * playbackRate;
  return Object.freeze({
    fromMs: Math.max(0, startMs - fadeSongMs),
    fadeInUntilMs: startMs,
    fadeOutFromMs: endMs,
    toMs: Math.min(audioDurationMs, endMs + fadeSongMs),
  });
}

function assertAudioDuration(audioDurationMs: number): void {
  if (!Number.isFinite(audioDurationMs) || audioDurationMs < 0) throw new RangeError("음원 길이는 0 이상의 유한한 값이어야 합니다");
}
