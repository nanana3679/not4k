/**
 * `gearMotion`(기어 위 장식 애니메이션)의 시간 곡선. 승인된 애니메이션 SVG(54-ambient-motion-v19.svg)의 CSS 키프레임을
 * 그대로 옮긴 순수 함수다. 시간은 SVG의 애니메이션 currentTime과 같은 뜻(ms, 0부터)이고, 음수 지연(delay)은
 * CSS처럼 그만큼 먼저 시작한 것으로 본다. 값(주기·거리·불투명도)은 gear-motion.json에서 읽는다.
 */

/** CSS cubic-bezier(x1, y1, x2, y2). */
export type CubicBezier = readonly [number, number, number, number];

/** CSS 'ease-in-out'. */
export const EASE_IN_OUT: CubicBezier = [0.42, 0, 0.58, 1];

/** 주기 안의 진행(0 이상 1 미만). CSS처럼 currentTime − delay를 주기로 나눈 나머지다. */
export function cyclePosition(timeMs: number, periodMs: number, delayMs = 0): number {
  const local = (timeMs - delayMs) % periodMs;
  return (local < 0 ? local + periodMs : local) / periodMs;
}

/** 계수 (a, b, c)인 3차 베지어 한 축의 값 ((a·t + b)·t + c)·t. 매 프레임 부르므로 클로저를 만들지 않는다. */
function bezierAxis(a: number, b: number, c: number, t: number): number {
  return ((a * t + b) * t + c) * t;
}

/**
 * CSS cubic-bezier 타이밍 함수 값. 가로축 진행 x에 해당하는 곡선 매개변수를 뉴턴법(실패하면 이분법)으로 찾아
 * 세로축 값을 돌려준다(브라우저 구현과 같은 방식, 오차 1e-7 이하).
 */
export function cubicBezierProgress(curve: CubicBezier, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * curve[0];
  const bx = 3 * (curve[2] - curve[0]) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * curve[1];
  const by = 3 * (curve[3] - curve[1]) - cy;
  const ay = 1 - cy - by;

  let t = x;
  for (let i = 0; i < 8; i++) {
    const error = bezierAxis(ax, bx, cx, t) - x;
    if (Math.abs(error) < 1e-7) return bezierAxis(ay, by, cy, t);
    const slope = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(slope) < 1e-6) break;
    t -= error / slope;
  }
  let low = 0;
  let high = 1;
  t = x;
  while (high - low > 1e-7) {
    const value = bezierAxis(ax, bx, cx, t);
    if (Math.abs(value - x) < 1e-7) break;
    if (value < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return bezierAxis(ay, by, cy, t);
}

/** A 큰 광원: 띠 중심이 fromY에서 toY까지 주기 동안 한 방향으로 일정하게 내려간다(linear). */
export interface LightTiming {
  periodMs: number;
  fromY: number;
  toY: number;
}

export function lightBandCenterY(timeMs: number, light: LightTiming): number {
  return light.fromY + (light.toY - light.fromY) * cyclePosition(timeMs, light.periodMs);
}

/** B 게이지 액체: 타일이 주기마다 타일 높이만큼 위로 흐른다(linear). 0에서 −tileHeight 쪽으로 간다. */
export interface LiquidTiming {
  periodMs: number;
  tileHeight: number;
}

export function liquidFlowOffset(timeMs: number, liquid: LiquidTiming): number {
  return 0 - liquid.tileHeight * cyclePosition(timeMs, liquid.periodMs);
}

/** B 기포 공통 키프레임: 0% 바닥·투명, fadeIn%까지 opacity로, fadeOut% 뒤 100%에 distance 위·투명(모두 linear). */
export interface RiseTiming {
  distance: number;
  fadeInPercent: number;
  fadeOutPercent: number;
  opacity: number;
}

export interface BubbleTiming {
  durationMs: number;
  delayMs: number;
}

export interface BubbleRiseState {
  /** 시작 위치(cy)에서의 세로 이동(위가 음수). */
  offsetY: number;
  alpha: number;
}

/** out을 넘기면 새 객체를 만들지 않고 거기에 써서 돌려준다(매 프레임 갱신용). */
export function bubbleRise(timeMs: number, bubble: BubbleTiming, rise: RiseTiming, out: BubbleRiseState = { offsetY: 0, alpha: 0 }): BubbleRiseState {
  const progress = cyclePosition(timeMs, bubble.durationMs, bubble.delayMs);
  const fadeIn = rise.fadeInPercent / 100;
  const fadeOut = rise.fadeOutPercent / 100;
  out.alpha = progress < fadeIn
    ? rise.opacity * (progress / fadeIn)
    : progress <= fadeOut
      ? rise.opacity
      : rise.opacity * (1 - (progress - fadeOut) / (1 - fadeOut));
  out.offsetY = 0 - rise.distance * progress;
  return out;
}

/** C 발광선 호흡: 0%·100% 투명, peakPercent에 opacity. 두 구간 모두 easing을 따로 적용한다. */
export interface BreatheTiming {
  periodMs: number;
  peakPercent: number;
  opacity: number;
  easing: CubicBezier;
}

export function breatheOpacity(timeMs: number, breathe: BreatheTiming): number {
  const progress = cyclePosition(timeMs, breathe.periodMs);
  const peak = breathe.peakPercent / 100;
  if (progress < peak) return breathe.opacity * cubicBezierProgress(breathe.easing, progress / peak);
  return breathe.opacity * (1 - cubicBezierProgress(breathe.easing, (progress - peak) / (1 - peak)));
}

/**
 * D 하단 바 빛(오른쪽으로 가는 빛 기준, 왼쪽 빛은 offset 부호만 반대). CSS 키프레임처럼 속성마다 따로 잇는다.
 * - 이동: 0%의 0에서 stopPercent의 travel까지 easing, 그 뒤 100%까지 travel에 멈춤.
 * - 불투명도: 0%의 0에서 peakPercent의 1까지 easing, stopPercent의 0까지 easing, 그 뒤 0.
 */
export interface GlintTiming {
  periodMs: number;
  travel: number;
  peakPercent: number;
  stopPercent: number;
  easing: CubicBezier;
}

export interface GlintState {
  offset: number;
  alpha: number;
}

/** out을 넘기면 새 객체를 만들지 않고 거기에 써서 돌려준다(매 프레임 갱신용). */
export function glintState(timeMs: number, glint: GlintTiming, out: GlintState = { offset: 0, alpha: 0 }): GlintState {
  const progress = cyclePosition(timeMs, glint.periodMs);
  const peak = glint.peakPercent / 100;
  const stop = glint.stopPercent / 100;
  if (progress >= stop) {
    out.offset = glint.travel;
    out.alpha = 0;
    return out;
  }
  const alpha = progress < peak
    ? cubicBezierProgress(glint.easing, progress / peak)
    : 1 - cubicBezierProgress(glint.easing, (progress - peak) / (stop - peak));
  out.offset = glint.travel * cubicBezierProgress(glint.easing, progress / stop) + 0;
  out.alpha = alpha + 0;
  return out;
}
