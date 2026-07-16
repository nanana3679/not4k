/**
 * Visual constants for the game renderer
 */

import { LANE_COUNT } from '../../shared/constants/note';
export { LANE_COUNT };
export const GAME_HEIGHT = 600; // logical height (fixed)
export const LANE_WIDTH = 100; // px per lane
export const LANE_AREA_WIDTH = LANE_COUNT * LANE_WIDTH; // 400px

export const NOTE_HEIGHT = 20; // px
export const NOTE_WIDTH = NOTE_HEIGHT * 5; // 1:5 ratio = 100px (matches lane width)

export const JUDGMENT_LINE_OFFSET = 160; // px from bottom

// 튜토리얼 프리뷰 키보드 strip (플레이 영역 아래 캔버스 확장부) 패딩
export const TUTORIAL_KB_SIDE_PAD = 12;
export const TUTORIAL_KB_VPAD = 10;

export const COLORS = {
  BG: 0x0a0a14,
  // 레인 base를 살짝 올려 "휴지 구간 dim"이 보일 헤드룸을 만든다.
  // 활성 레인 = 올라온 톤, 휴지 밴드 = 어두운 오버레이로 원래 near-black까지 끌어내림.
  LANE_BG_EVEN: 0x26263f,
  LANE_BG_ODD: 0x202038,
  LANE_SEPARATOR: 0x333355,
  JUDGMENT_LINE: 0xffffff,
  MEASURE_LINE: 0xffffff,
  MEASURE_LINE_ALPHA: 0.25,

  SINGLE_NOTE: 0x4488ff,
  DOUBLE_NOTE: 0xffcc00,
  TRILL_NOTE: 0xffffff,

  SINGLE_LONG: 0x88bbff,
  DOUBLE_LONG: 0xffee88,
  TRILL_LONG: 0xaaaaaa,
  LONG_BODY_FAILED: 0x555555,
  LONG_BODY_PARTIAL_FAILED: 0x888888,

  TRILL_ZONE_BG: 0x00ff88,
  TRILL_ZONE_ALPHA: 0.15,

  // 휴지 구간(레인 당분간 안 씀) — 어두운 오버레이로 레인을 가라앉힌다.
  REST_ZONE_DIM: 0x000000,
  REST_ZONE_ALPHA: 0.72,

  COMBO_TEXT: 0xffffff,
  JUDGMENT_PERFECT: 0xffdd00,
  JUDGMENT_GREAT: 0x44ff44,
  JUDGMENT_GOOD: 0x4488ff,
  JUDGMENT_BAD: 0x888888,
  JUDGMENT_MISS: 0xff4444,

  FAST_TEXT: 0x44aaff,
  SLOW_TEXT: 0xff6644,

  GRACE_GLOW: 0xffffff,
  GRACE_GLOW_ALPHA: 0.25,
  GRACE_GLOW_PAD: 14,
  GRACE_OUTLINE: 0xffffff,
  GRACE_OUTLINE_WIDTH: 2,

  MASK_BELOW_JUDGMENT: 0x04060c,
} as const;
