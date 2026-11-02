import type { PlaybackRange } from '../../shared';

/** 구간 선택기(PreviewRangeSelector)의 상태. `enabled`가 false면 선택기는 null을 알린다. */
export interface PreviewRangeState {
  startTime: number;
  endTime: number;
  enabled: boolean;
  fadeInTime: number;
  fadeOutTime: number;
}

const DEFAULT_RANGE_DURATION = 15;
const DEFAULT_PREVIEW_FADE = 0.5;

/** 선택기가 처음 구간을 정하는 입력. 저장된 값(initial*)이 없으면 기본값(default*)을 쓴다. */
export interface RangeInitOptions {
  initialStart?: number;
  initialEnd?: number;
  initialFadeInTime?: number;
  initialFadeOutTime?: number;
  defaultStart?: number;
  defaultEnd?: number;
  defaultDuration?: number;
  /** 인게임 구간처럼 페이드 입력을 보이는 선택기는 기본 페이드가 0초다. 프리뷰는 0.5초다. */
  showFadeControls?: boolean;
}

/**
 * 선택기가 마운트할 때 쓰는 구간. 저장된 시작·끝을 음원 길이 안으로 자르고, 없으면 기본 구간을 쓴다.
 * 페이드는 자르지 않은 입력값이며, 선택기가 알릴 때 `notifiedRange`처럼 구간 길이의 절반으로 자른다.
 * 곡 정보 드로어가 음원을 바꿀 때 새 길이에 맞춘 구간을 이 함수로 계산해 선택기와 같은 값을 적용한다.
 */
export function initialRangeState(duration: number, options: RangeInitOptions): PreviewRangeState {
  const defaultDuration = options.defaultDuration ?? DEFAULT_RANGE_DURATION;
  const startTime = options.initialStart != null
    ? Math.max(0, Math.min(options.initialStart, duration))
    : options.defaultStart != null
      ? Math.max(0, Math.min(options.defaultStart, duration))
      : Math.min(duration * 0.25, Math.max(0, duration - defaultDuration));
  const endTime = options.initialEnd != null
    ? Math.max(startTime, Math.min(options.initialEnd, duration))
    : options.defaultEnd != null
      ? Math.max(startTime, Math.min(options.defaultEnd, duration))
      : Math.min(startTime + defaultDuration, duration);
  const defaultFade = options.showFadeControls ? 0 : DEFAULT_PREVIEW_FADE;
  return {
    startTime,
    endTime,
    enabled: true,
    fadeInTime: options.initialFadeInTime ?? defaultFade,
    fadeOutTime: options.initialFadeOutTime ?? defaultFade,
  };
}

/** 선택기가 알리는 재생 구간. 페이드를 0초부터 구간 길이의 절반 사이로 자른다. */
export function notifiedRange(state: PreviewRangeState): PlaybackRange {
  const maxFade = Math.max(0, (state.endTime - state.startTime) / 2);
  return {
    startTime: state.startTime,
    endTime: state.endTime,
    fadeInTime: Math.max(0, Math.min(state.fadeInTime, maxFade)),
    fadeOutTime: Math.max(0, Math.min(state.fadeOutTime, maxFade)),
  };
}
