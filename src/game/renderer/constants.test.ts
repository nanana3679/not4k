import { describe, expect, it } from 'vitest';
import {
  GAME_HEIGHT,
  JUDGMENT_LINE_OFFSET,
  JUDGMENT_LINE_THICKNESS,
  KEY_BOMB_SIZE,
  LANE_AREA_WIDTH,
  LANE_COUNT,
  LANE_WIDTH,
  liftPx,
  judgmentLineYAtLift,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  PLAYFIELD_SCALE,
  playfieldPx,
  TUTORIAL_KB_SIDE_PAD,
  TUTORIAL_KB_VPAD,
} from './constants';

describe('플레이필드 배율 (RFD 0029)', () => {
  it('PLAYFIELD_SCALE 0.625에서 레인 설계값 100은 62.5, 노트 두께 설계값 20은 12.5', () => {
    expect(PLAYFIELD_SCALE).toBe(0.625);
    expect(playfieldPx(100)).toBe(62.5);
    expect(playfieldPx(20)).toBe(12.5);
  });

  it('레인 4개 × 62.5 = 레인 영역 250', () => {
    expect(LANE_COUNT).toBe(4);
    expect(LANE_WIDTH).toBe(62.5);
    expect(LANE_AREA_WIDTH).toBe(250);
  });

  it('노트는 62.5×12.5로 1:5 비율을 유지하고 폭이 레인 폭과 같다', () => {
    expect(NOTE_HEIGHT).toBe(12.5);
    expect(NOTE_WIDTH).toBe(62.5);
    expect(NOTE_WIDTH / NOTE_HEIGHT).toBe(5);
    expect(NOTE_WIDTH).toBe(LANE_WIDTH);
  });

  it('판정선 두께 설계값 4는 2.5, 키봄 기본 크기 설계값 120은 75', () => {
    expect(JUDGMENT_LINE_THICKNESS).toBe(2.5);
    expect(KEY_BOMB_SIZE).toBe(75);
  });

  it('튜토리얼 키보드 strip 여백도 같은 배율: 좌우 12 → 7.5, 위아래 10 → 6.25', () => {
    expect(TUTORIAL_KB_SIDE_PAD).toBe(7.5);
    expect(TUTORIAL_KB_VPAD).toBe(6.25);
  });
});

describe('판정선 기본 위치와 리프트', () => {
  it('리프트 0%의 판정선은 화면 아래에서 184 위인 y 416', () => {
    expect(JUDGMENT_LINE_OFFSET).toBe(184);
    expect(GAME_HEIGHT - JUDGMENT_LINE_OFFSET).toBe(416);
  });

  it('높이 600 플레이 화면의 판정선 y는 리프트 0%에서 416, 4%에서 392, 10%에서 356', () => {
    expect(judgmentLineYAtLift(0)).toBe(416);
    expect(judgmentLineYAtLift(4)).toBe(392);
    expect(judgmentLineYAtLift(10)).toBe(356);
  });

  it('리프트 1%는 화면 높이 600의 6 단위라 4%면 24, 100%면 600', () => {
    expect(liftPx(1)).toBe(6);
    expect(liftPx(4)).toBe(24);
    expect(liftPx(100)).toBe(600);
    expect(liftPx(0)).toBe(0);
  });
});
