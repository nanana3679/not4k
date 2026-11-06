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
 * 다르면(변경 취소·Undo처럼 바깥에서 바꾼 값) 새 값으로 다시 그린다. 같으면 받은 객체를 그대로 돌려준다.
 */
export function followRangeInput(mount: RangeFieldMount, input: RangeInput): RangeFieldMount {
  return sameRangeInput(mount.shown, input) ? mount : { shown: input, generation: mount.generation + 1 };
}
