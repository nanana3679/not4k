/**
 * Timeline visual constants — chart-editor.md §Timeline Layout 기준
 */

export const LANE_COUNT = 4;

export const LANE_WIDTH = 60; // px per lane
export const NOTE_HEIGHT = 12; // px
// 트릴존 핸들 — 테두리·글리프 없는 단색 도형 2개를 모양(실루엣)으로 구분(hover 시에만).
export const TRILL_RESIZE_CAP_HEIGHT = 5;  // px — 리사이즈 캡(끝=위, 풀폭 가로 바) 높이
export const TRILL_RESIZE_CAP_INSET = 4;   // px — 캡 좌우 인셋(인접 레인 구분선과 분리)
export const TRILL_MOVE_PILL_WIDTH = 24;   // px — 이동 필(시작=아래, 라운드 캡슐) 폭. 이동 핸들 가로 히트폭도 겸함
export const TRILL_MOVE_PILL_HEIGHT = 8;   // px — 이동 필 높이
export const TRILL_HANDLE_SELECTED_BUMP = 1; // px — 구간 단위 선택 시 도형 높이 증가(색+형태 이중 채널)
export const TIMELINE_WIDTH = LANE_COUNT * LANE_WIDTH; // 240px

// Extra lanes (editor-only auxiliary lanes)
export const EXTRA_LANE_WIDTH = 60; // px per extra lane (same as note lane)
export const MEASURE_LABEL_WIDTH = 32; // px for measure number labels on the left

export const DEFAULT_MEASURES = 16;
export const TIMELINE_PADDING = 50; // px of empty space before first / after last measure

// Minimap
export const MINIMAP_WIDTH = MEASURE_LABEL_WIDTH;

// Colors
export const COLORS = {
  LANE_BG_EVEN: 0x1a1a2e,
  LANE_BG_ODD: 0x16213e,
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
  HOVERED_OUTLINE: 0xffffff,

  EVENT_BG: 0x553388,

  EVENT_MARKER: 0xff66aa,

  EXTRA_LANE_BG_EVEN: 0x1a2e1a,
  EXTRA_LANE_BG_ODD: 0x16291a,

  BOX_SELECT_FILL: 0x4488ff,
  BOX_SELECT_FILL_ALPHA: 0.25,
  BOX_SELECT_STROKE: 0x66aaff,
  BOX_SELECT_STROKE_ALPHA: 0.85,
  BOX_SELECT_STROKE_WIDTH: 1.5,

  VIOLATION_HATCH: 0xff4444,
  VIOLATION_HATCH_ALPHA: 0.4,
  // 미니맵 위반 틱(RFD 0017 §7) — 미니맵은 작으므로 해칭(0.4)보다 진하게
  MINIMAP_VIOLATION_TICK_ALPHA: 0.9,

  GRACE_GLOW: 0xffffff,
  GRACE_GLOW_ALPHA: 0.2,
  GRACE_GLOW_PAD: 10,
  GRACE_OUTLINE: 0xffffff,
  GRACE_OUTLINE_WIDTH: 1.5,
};

/**
 * 노트 타입별 z-order (낮을수록 뒤에 렌더링, 높을수록 앞에 렌더링).
 * 렌더링 순서와 히트 테스트 우선순위 모두 이 값을 사용한다.
 */
export const NOTE_Z_ORDER: Record<string, number> = {
  doubleLong: 0,
  long: 1,
  trillLong: 1,
  single: 2,
  double: 2,
  trill: 2,
};
