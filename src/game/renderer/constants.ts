/**
 * Visual constants for the game renderer
 */

import { LANE_COUNT } from '../../shared/constants/note';
export { LANE_COUNT };
export const GAME_HEIGHT = 600; // logical height (fixed)

/**
 * 플레이필드 배율([RFD 0029](../../../docs/rfd/0029-frame-aspect-fit-narrow-lanes.md)).
 * 새 기어를 비율 그대로 화면에 맞추려고 레인 영역을 400에서 250으로 좁혔다. 레인·노트·판정선 두께·
 * 판정/콤보/정확도 글자·키봄·레인 키캡처럼 레인에 딸린 크기는 모두 원래 설계값(레인 100·노트 100×20 기준)에 이 배율을
 * 곱한다. 스킨 테마의 px 값(그림자·Grace 여백 등)도 같은 설계 기준이라 렌더러가 이 배율로 바꿔 쓴다.
 * 스크롤 속도는 논리 px/s 그대로라 노트가 화면을 지나는 시간은 바뀌지 않는다.
 */
export const PLAYFIELD_SCALE = 0.625;

/** 레인 100 기준 설계값(논리 px)을 지금 플레이필드 크기로 바꾼다. */
export function playfieldPx(designPx: number): number {
  return designPx * PLAYFIELD_SCALE;
}

export const LANE_WIDTH = playfieldPx(100); // 62.5px per lane
export const LANE_AREA_WIDTH = LANE_COUNT * LANE_WIDTH; // 250px

export const NOTE_HEIGHT = playfieldPx(20); // 12.5px
export const NOTE_WIDTH = NOTE_HEIGHT * 5; // 1:5 ratio = 62.5px (matches lane width, skin assets keep 1:5)

/**
 * 노트 시각 기준([#224](https://github.com/nanana3679/not4k/issues/224)): 노트의 시간 위치는 노트 박스의 세로 가운데다.
 * 판정 순간(곡 시각 = 노트 시각) 노트 박스는 [판정선 − 두께/2, 판정선 + 두께/2]로 판정선에 가운데가 걸친다.
 * 게임 렌더러와 Visual 캘리브레이션 화면이 이 기준을 함께 써서, 캘리브레이션 값이 스크롤 속도와 무관하게 게임에 그대로 맞는다.
 * @param timeY 노트 시각의 y(`judgmentLineY − (노트 시각 − 곡 시각) × 속도`)
 * @returns 노트 박스 위끝 y
 */
export function noteBoxTopY(timeY: number, noteHeight: number = NOTE_HEIGHT): number {
  return timeY - noteHeight / 2;
}

/**
 * 리프트 0%의 판정선 높이(화면 아래에서 위로 잰 거리, 기어 y 오프셋을 더하기 전). y 416은 기어 y 오프셋 0일 때의 덱 위끝(y 429.7)보다 노트 두께 약 1배(틈 13.7) 위로,
 * 사용자가 Lab 미리보기에서 고른 위치다([RFD 0029](../../../docs/rfd/0029-frame-aspect-fit-narrow-lanes.md)).
 * 기어가 있는 플레이 화면은 기어와 판정선을 함께 `GEAR_OFFSET_Y`만큼 더 내리므로 판정선이 y 426이다(틈 13.7은 그대로).
 * 기어가 없는 렌더러(튜토리얼 재생기 등)는 이 값(또는 자기 오프셋)만 쓴다.
 * 리프트(`liftPx`)는 여기서 판정선과 딸린 표시만 올리고 기어·레인 끝은 움직이지 않는다.
 */
export const JUDGMENT_LINE_OFFSET = 184;
// 주의: JUDGMENT_LINE_OFFSET은 화면 아래에서 위로 잰 거리(클수록 위)이고 GEAR_OFFSET_Y는 화면 y축 이동(+가 아래)이라 기준과 부호가 반대다([오프셋 구분](../../../docs/context/glossary.md#오프셋-구분)).
/**
 * 기어 y 오프셋의 게임 값: 기어가 있는 플레이 화면에서 기어와 판정선을 함께 아래로 옮기는 양(논리 px, 화면 y축이라 +가 아래).
 * 사용자가 Lab `/lab/gear`의 `기어·판정선 y 오프셋`으로 고른 값이다
 * ([#257](https://github.com/nanana3679/not4k/issues/257), 2026-10-09). 기어 아래쪽 원본 약 22행이 화면 밖으로 잘린다.
 * `GameRenderer`가 기어를 그릴 때의 기본 `gearOffsetY`이며, 기어가 없는 렌더러에는 적용하지 않는다.
 */
export const GEAR_OFFSET_Y = 10;
/** 판정선 두께. 미리보기(게임 화면 전체를 1/1.6로 줄임)에서 보인 두께(설계값 4 → 2.5)와 같다. */
export const JUDGMENT_LINE_THICKNESS = playfieldPx(4);
/** 키봄 기본 크기(가로·세로). 설정의 키봄 배율(`bombScale`)을 곱한다. */
export const KEY_BOMB_SIZE = playfieldPx(120);

/** 리프트 설정(%)을 판정선을 올리는 논리 px로 바꾼다. 1% = 화면 높이 600의 6. */
export function liftPx(liftPercent: number): number {
  return (GAME_HEIGHT * liftPercent) / 100;
}

/**
 * 높이 600 플레이 화면(기어 있음)에서 리프트 %일 때의 판정선 y(게임 값 `GEAR_OFFSET_Y` 10이면 0% = y 426). 렌더러가 setLift로 옮기는 위치와 같다.
 * gearOffsetY를 주면 그 y 오프셋의 판정선이다(0이면 y 416 기준).
 */
export function judgmentLineYAtLift(liftPercent: number, gearOffsetY: number = GEAR_OFFSET_Y): number {
  return GAME_HEIGHT - JUDGMENT_LINE_OFFSET + gearOffsetY - liftPx(liftPercent);
}

// 튜토리얼 프리뷰 키보드 strip (플레이 영역 아래 캔버스 확장부) 패딩
export const TUTORIAL_KB_SIDE_PAD = playfieldPx(12);
export const TUTORIAL_KB_VPAD = playfieldPx(10);

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
  REST_ZONE_ALPHA: 0.6,

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
  GRACE_GLOW_PAD: playfieldPx(14),
  GRACE_OUTLINE: 0xffffff,
  GRACE_OUTLINE_WIDTH: playfieldPx(2),
} as const;
