/**
 * Visual constants for the game renderer
 */

export { LANE_COUNT } from '../../shared/constants/note';
export const GAME_HEIGHT = 600; // logical height (fixed)
export const LANE_WIDTH = 100; // px per lane
export const LANE_AREA_WIDTH = LANE_COUNT * LANE_WIDTH; // 400px

export const NOTE_HEIGHT = 20; // px
export const NOTE_WIDTH = NOTE_HEIGHT * 5; // 1:5 ratio = 100px (matches lane width)

export const JUDGMENT_LINE_OFFSET = 100; // px from bottom

export const COLORS = {
  BG: 0x0a0a14,
  LANE_BG_EVEN: 0x111122,
  LANE_BG_ODD: 0x0d0d1e,
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

  TRILL_ZONE_BG: 0x00ff88,
  TRILL_ZONE_ALPHA: 0.15,

  COMBO_TEXT: 0xffffff,
  JUDGMENT_PERFECT: 0xffdd00,
  JUDGMENT_GREAT: 0x44ff44,
  JUDGMENT_GOOD: 0x4488ff,
  JUDGMENT_BAD: 0x888888,
  JUDGMENT_MISS: 0xff4444,

  FAST_TEXT: 0x44aaff,
  SLOW_TEXT: 0xff6644,

  GRACE_GLOW: 0xffffff,
  GRACE_GLOW_ALPHA: 0.45,
  GRACE_GLOW_PAD: 6,
} as const;
