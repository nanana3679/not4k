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
/** 프리뷰 구간의 기본 페이드(초). 대기 구간 없이 클립을 만드는 곡 저장도 이 값을 쓴다. */
export const DEFAULT_PREVIEW_FADE = 0.5;

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
 * 음원을 바꿀 때는 자르지 않는다. 구간을 유지할지 기본값으로 돌릴지는 `rangesForNewAudio`가 정한다.
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

/** 음원을 바꾸기 전의 구간. 값이 없으면(저장된 구간 없음) 이전 구간이 없는 것이다. */
type PreviousRange = Partial<PlaybackRange> | null | undefined;

/** 음원을 바꾼 뒤의 프리뷰·인게임 구간. `reset`은 기본값으로 돌린 구간이며 없으면 null이다. */
export interface NewAudioRanges {
  preview: PlaybackRange;
  gameplay: PlaybackRange;
  reset: 'preview' | 'gameplay' | 'both' | null;
}

/** 구간 하나의 음원 교체 결과. 이전 구간이 없어 기본값을 쓴 경우는 돌린 것이 아니다. */
function keepOrResetRange(duration: number, previous: PreviousRange, defaults: RangeInitOptions): { range: PlaybackRange; reset: boolean } {
  const { startTime, endTime, fadeInTime, fadeOutTime } = previous ?? {};
  const hasPrevious = startTime != null && endTime != null;
  if (hasPrevious && startTime >= 0 && startTime < endTime && endTime <= duration) {
    const kept = { ...defaults, initialStart: startTime, initialEnd: endTime, initialFadeInTime: fadeInTime, initialFadeOutTime: fadeOutTime };
    return { range: notifiedRange(initialRangeState(duration, kept)), reset: false };
  }
  return { range: notifiedRange(initialRangeState(duration, defaults)), reset: hasPrevious };
}

/**
 * 음원을 바꿀 때의 프리뷰·인게임 구간(#444). 구간마다 따로 판단한다. 이전 구간이 새 음원에 통째로 들어가면(0 ≤ 시작 < 끝 ≤ 새 길이)
 * 페이드까지 유지해 같은 곡의 다른 파일로 바꿔도 제작자가 고른 구간을 지키고, 들어가지 않으면 그 구간만 선택기가 저장된 값 없이
 * 처음 그리는 기본값으로 돌린다. 곡 정보 드로어와 곡 행이 없는 차트의 Meta 창이 함께 쓴다.
 */
export function rangesForNewAudio(duration: number, previousPreview: PreviousRange, previousGameplay: PreviousRange): NewAudioRanges {
  const preview = keepOrResetRange(duration, previousPreview, {});
  const gameplay = keepOrResetRange(duration, previousGameplay,
    { defaultStart: 0, defaultEnd: duration, defaultDuration: duration, showFadeControls: true });
  const reset = preview.reset && gameplay.reset ? 'both' : preview.reset ? 'preview' : gameplay.reset ? 'gameplay' : null;
  return { preview: preview.range, gameplay: gameplay.range, reset };
}

/** 구간 선택기에서 잡은 곳(시작·끝 핸들 또는 구간 안)과 누른 순간의 x·구간. */
export interface RangeDrag {
  mode: 'start' | 'end' | 'move';
  startX: number;
  startTime: number;
  endTime: number;
}

/** 끌기의 한계: 음원 길이와 구간의 최소·최대 길이(초). */
export interface RangeDragLimits {
  duration: number;
  minRangeDuration: number;
  maxRangeDuration: number;
}

/**
 * 포인터가 `clientX`에 있을 때의 구간. 선택기는 끄는 동안 이 값으로 구간을 바꾸고, 손을 뗄 때도 놓은 위치로 다시 계산해
 * 마지막 구간을 정한다(마지막 끌기의 렌더·알림이 아직 끝나지 않았어도 놓은 위치를 쓴다).
 * 시작·끝 핸들은 반대쪽 끝에서 최소·최대 길이 안에 머물고, 구간 이동은 길이를 유지한 채 음원 안에 머문다.
 */
export function dragRangeAt(
  drag: RangeDrag,
  clientX: number,
  rect: { left: number; width: number },
  limits: RangeDragLimits,
): { startTime: number; endTime: number } {
  const { duration, minRangeDuration, maxRangeDuration } = limits;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  if (drag.mode === 'move') {
    const length = drag.endTime - drag.startTime;
    const startTime = clamp(drag.startTime + ((clientX - drag.startX) / rect.width) * duration, 0, duration - length);
    return { startTime, endTime: startTime + length };
  }
  const t = clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
  if (drag.mode === 'start') {
    const lower = Math.max(0, drag.endTime - maxRangeDuration);
    const upper = Math.max(lower, drag.endTime - minRangeDuration);
    return { startTime: clamp(t, lower, upper), endTime: drag.endTime };
  }
  const lower = Math.min(duration, drag.startTime + minRangeDuration);
  const upper = Math.min(duration, drag.startTime + maxRangeDuration);
  return { startTime: drag.startTime, endTime: clamp(t, lower, Math.max(lower, upper)) };
}

/** 구간 선택기에 넘기는 처음 구간(store 값). 선택기는 마운트할 때만 이 값을 읽는다. */
export interface RangeInput {
  initialStart?: number;
  initialEnd?: number;
  initialFadeInTime?: number;
  initialFadeOutTime?: number;
}

/** 곡 정보 드로어의 구간 선택기가 지금 보이는 store 값과 선택기를 다시 그린 횟수(선택기의 key). */
export interface RangeFieldMount {
  shown: RangeInput;
  generation: number;
}

function sameRangeInput(a: RangeInput, b: RangeInput): boolean {
  return a.initialStart === b.initialStart && a.initialEnd === b.initialEnd
    && a.initialFadeInTime === b.initialFadeInTime && a.initialFadeOutTime === b.initialFadeOutTime;
}

/**
 * store 값이 바뀌었을 때 선택기를 다시 그릴지 정한다. 선택기가 보이는 값과 같으면(선택기가 방금 적용한 값) 그대로 두고,
 * 다르면(변경 취소처럼 바깥에서 바꾼 값) 새 값으로 다시 그린다. 같으면 받은 객체를 그대로 돌려준다.
 */
export function followRangeInput(mount: RangeFieldMount, input: RangeInput): RangeFieldMount {
  return sameRangeInput(mount.shown, input) ? mount : { shown: input, generation: mount.generation + 1 };
}
