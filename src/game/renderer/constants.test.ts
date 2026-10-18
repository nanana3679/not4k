import { describe, expect, it } from 'vitest';
import {
  GAME_HEIGHT,
  GEAR_OFFSET_Y,
  JUDGMENT_LINE_OFFSET,
  JUDGMENT_LINE_THICKNESS,
  KEY_BOMB_SIZE,
  LANE_AREA_WIDTH,
  LANE_COUNT,
  LANE_WIDTH,
  liftPx,
  judgmentLineYAtLift,
  suddenCoverPx,
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
  it('기어 없는 렌더러의 리프트 0% 판정선은 화면 아래에서 184 위인 y 416', () => {
    expect(JUDGMENT_LINE_OFFSET).toBe(184);
    expect(GAME_HEIGHT - JUDGMENT_LINE_OFFSET).toBe(416);
  });

  it('게임은 기어와 판정선을 함께 10 내린다(#257): GEAR_OFFSET_Y 10', () => {
    expect(GEAR_OFFSET_Y).toBe(10);
  });

  it('높이 600 플레이 화면(기어 10 내림)의 판정선 y는 리프트 0%에서 426, 4%에서 408.96, 20%에서 340.8, 100%면 레인 위끝 y 0', () => {
    expect(judgmentLineYAtLift(0)).toBe(426);
    expect(judgmentLineYAtLift(4)).toBe(408.96);
    expect(judgmentLineYAtLift(20)).toBe(340.8);
    expect(judgmentLineYAtLift(100)).toBe(0);
  });

  it('기어 y 오프셋을 직접 주면 그 리프트 0% 판정선까지를 100%로 본다: y 오프셋 0·리프트 0%면 y 416, y 오프셋 20·리프트 4%면 436의 4%인 17.44 올라 y 418.56, 100%면 어느 y 오프셋이든 y 0', () => {
    expect(judgmentLineYAtLift(0, 0)).toBe(416);
    expect(judgmentLineYAtLift(4, 20)).toBe(418.56);
    expect(judgmentLineYAtLift(100, 0)).toBe(0);
    expect(judgmentLineYAtLift(100, 20)).toBe(0);
  });

  it('리프트 9%의 판정선 y는 426 − 38.34를 빼서 생기는 387.65999…가 아니라 387.66으로 Lab에 그대로 보일 수 있는 값이다', () => {
    expect(judgmentLineYAtLift(9)).toBe(387.66);
  });
});

describe('리프트·서든 공통 눈금 (#291): 레인 위끝(y 0)~리프트 0% 판정선 = 100%', () => {
  it('리프트 1%는 화면 높이 600의 6이 아니라 레인 위끝~리프트 0% 판정선 426의 1%인 4.26이고, 3%면 12.78, 4%면 17.04, 20%면 85.2, 100%면 426', () => {
    expect(liftPx(0)).toBe(0);
    expect(liftPx(1)).toBe(4.26);
    expect(liftPx(3)).toBe(12.78);
    expect(liftPx(4)).toBe(17.04);
    expect(liftPx(20)).toBe(85.2);
    expect(liftPx(100)).toBe(426);
  });

  it('기어 y 오프셋 20이면 리프트 0% 판정선 436이 100%라 리프트 4%는 17.44, 기어 없는 렌더러 기준(y 오프셋 0)이면 416의 4%인 16.64', () => {
    expect(liftPx(4, 20)).toBe(17.44);
    expect(liftPx(4, 0)).toBe(16.64);
  });

  it('서든 30%면 레인 위끝에서 내려오는 커버 높이가 화면 높이 기준 180이 아니라 127.8이고, 0%면 0, 100%면 리프트 0% 판정선 y 426까지 가린다', () => {
    expect(suddenCoverPx(30)).toBe(127.8);
    expect(suddenCoverPx(0)).toBe(0);
    expect(suddenCoverPx(100)).toBe(judgmentLineYAtLift(0));
    expect(suddenCoverPx(100)).toBe(426);
  });

  it('기어 y 오프셋 20이면 서든 100% 커버가 그 리프트 0% 판정선 y 436까지 내려온다', () => {
    expect(suddenCoverPx(100, 20)).toBe(436);
    expect(suddenCoverPx(100, 20)).toBe(judgmentLineYAtLift(0, 20));
  });

  it('노트가 보이는 레인(판정선 − 서든 커버)은 426 × (100 − 서든 − 리프트)%라 서든 30%·리프트 20%면 213, 서든 60%·리프트 40%면 0', () => {
    expect(judgmentLineYAtLift(20) - suddenCoverPx(30)).toBe(213);
    expect(judgmentLineYAtLift(40) - suddenCoverPx(60)).toBe(0);
  });
});
