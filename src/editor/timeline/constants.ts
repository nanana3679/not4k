/**
 * Timeline visual constants — chart-editor.md §Timeline Layout 기준
 */

export const LANE_COUNT = 4;
export const AUXILIARY_LANES = 1; // event only
export const TOTAL_LANES = LANE_COUNT + AUXILIARY_LANES;

export const LANE_WIDTH = 60; // px per lane
export const AUX_LANE_WIDTH = 40; // px per auxiliary lane
export const NOTE_HEIGHT = 12; // px
export const TIMELINE_WIDTH =
  LANE_COUNT * LANE_WIDTH + AUXILIARY_LANES * AUX_LANE_WIDTH;

export const DEFAULT_MEASURES = 16;
export const TIMELINE_PADDING = 50; // px of empty space before first / after last measure

// Minimap
export const MINIMAP_WIDTH = 60;

// Colors
export const COLORS = {
  LANE_BG_EVEN: 0x1a1a2e,
  LANE_BG_ODD: 0x16213e,
  AUX_LANE_BG: 0x0f0f1a,
  MEASURE_LINE: 0xffffff,
  BEAT_LINE: 0x666666,
  SNAP_LINE: 0x333333,

  SINGLE_NOTE: 0x4488ff,
  DOUBLE_NOTE: 0xffcc00,
  TRILL_NOTE: 0xffffff,

  SINGLE_LONG: 0x88bbff,
  DOUBLE_LONG: 0xffee88,
  TRILL_LONG: 0xaaaaaa,

  TRILL_ZONE: 0x00ff88,
  TRILL_ZONE_ALPHA: 0.2,

  SELECTED_OUTLINE: 0xff4444,

  EVENT_BG: 0x553388,

  EVENT_MARKER: 0xff66aa,
};
