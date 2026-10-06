import { describe, expect, it } from 'vitest';
import gearJson from './classicGear.json';
import {
  CLASSIC_GEAR_GEOMETRY,
  CLASSIC_GEAR_TEXTURE_OPTIONS,
  GEAR_CLEARANCE,
  layoutClassicGear,
  minimumPlayLogicalWidth,
  resolvePlayLogicalWidth,
} from './classicGearLayout';
import { GAME_HEIGHT, JUDGMENT_LINE_OFFSET, JUDGMENT_LINE_THICKNESS, LANE_AREA_WIDTH, NOTE_HEIGHT } from './constants';
import { getSkinManifest } from '../skin/skins';

const stageFor = (width: number) => ({ laneAreaX: (width - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT });

describe('Classic 기어 측정값 (prepare-frame-fit-v20.mjs → classicGear.json)', () => {
  it('레인 창 236~787열(552px), 덱 위끝 1090행, 열린 덱 바닥 1126행, 실루엣 16~1007열·아래끝 1465행', () => {
    expect(CLASSIC_GEAR_GEOMETRY).toEqual({
      width: 1024, height: 1536,
      laneLeft: 236, laneRight: 787,
      deckTop: 1090, laneOpeningBottom: 1126,
      silhouetteLeft: 16, silhouetteRight: 1007,
      frameBottom: 1465,
    });
  });

  it('측정값 JSON은 기어 그림 public/gear/classic-gear.png를 가리키고 매니페스트 gearFrame도 같은 그림이다', () => {
    expect(gearJson.image).toBe('public/gear/classic-gear.png');
    expect(getSkinManifest('classic').assets.gearFrame).toBe('/gear/classic-gear.png');
  });

  it('밉맵·삼선형 필터로 읽어 0.45배 이하로 줄여 그려도 계단이 생기지 않게 한다', () => {
    expect(CLASSIC_GEAR_TEXTURE_OPTIONS).toEqual({ autoGenerateMipmaps: true, scaleMode: 'linear' });
  });
});

describe('layoutClassicGear — 레인 창을 레인 영역에 맞추고 아래끝을 화면 아래에 붙인다', () => {
  it('16:9(논리 폭 1067)에서 배율 250/552, 레인 창이 레인 영역 x 408.5~658.5에 정확히 겹친다', () => {
    const layout = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(1067));
    expect(layout.scale).toBeCloseTo(250 / 552, 12);
    expect(layout.x + 236 * layout.scale).toBeCloseTo(408.5, 9);
    expect(layout.x + 788 * layout.scale).toBeCloseTo(658.5, 9);
    expect(layout.width).toBeCloseTo(1024 * 250 / 552, 9);
    expect(layout.height).toBeCloseTo(1536 * 250 / 552, 9);
  });

  it('실루엣 마지막 행 1465의 아래 가장자리가 화면 아래 600에 붙고 덱 위끝은 y 429.7, 키 윗면은 y 446.5', () => {
    const layout = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(1067));
    expect(layout.y + 1466 * layout.scale).toBeCloseTo(600, 9);
    expect(layout.deckTopY).toBeCloseTo(600 - 376 * 250 / 552, 9);
    expect(layout.deckTopY.toFixed(1)).toBe('429.7');
    expect(layout.keyRimY).toBeCloseTo(600 - 339 * 250 / 552, 9);
    expect(layout.keyRimY.toFixed(1)).toBe('446.5');
  });

  it('위쪽은 원본 141행만 화면 밖으로 잘린다(기어 위끝 y −63.9)', () => {
    const layout = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(1067));
    expect(layout.y.toFixed(1)).toBe('-63.9');
    expect(Math.round(-layout.y / layout.scale)).toBe(141);
  });

  it('실루엣은 화면 가운데 ± 224.6이라 4:3(논리 폭 800)에서 x 175.4~624.6', () => {
    const layout = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(800));
    expect(layout.silhouetteLeftX).toBeCloseTo(400 - 496 * 250 / 552, 9);
    expect(layout.silhouetteRightX).toBeCloseTo(400 + 496 * 250 / 552, 9);
    expect(layout.silhouetteRightX.toFixed(1)).toBe('624.6');
  });

  it('화면 비율이 바뀌어도 세로 배치는 그대로이고 가로만 가운데를 따라간다', () => {
    const wide = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(1400));
    const square = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(600));
    expect(wide.y).toBeCloseTo(square.y, 9);
    expect(wide.keyRimY).toBeCloseTo(square.keyRimY, 9);
    expect(wide.x - square.x).toBeCloseTo(400, 9);
  });

  it('리프트 0% 판정선 y 416은 선 두께(2.5)까지 덱 위끝보다 위이고 덱과의 틈 13.7은 노트 두께 약 1.1개', () => {
    const layout = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(1067));
    const lineY = GAME_HEIGHT - JUDGMENT_LINE_OFFSET;
    expect(lineY + JUDGMENT_LINE_THICKNESS / 2).toBeLessThan(layout.deckTopY);
    expect((layout.deckTopY - lineY).toFixed(1)).toBe('13.7');
    expect(((layout.deckTopY - lineY) / NOTE_HEIGHT).toFixed(1)).toBe('1.1');
    // 판정선에서 키 윗면까지 30.5(노트 두께 약 2.4개)가 보인다.
    expect((layout.keyRimY - lineY).toFixed(1)).toBe('30.5');
  });
});

describe('플레이 화면 논리 폭', () => {
  it('최소 논리 폭 466은 실루엣 폭 449.3에 양옆 여백 8을 더해 올림한 값이다', () => {
    expect(GEAR_CLEARANCE).toBe(8);
    expect(minimumPlayLogicalWidth()).toBe(466);
    const layout = layoutClassicGear(CLASSIC_GEAR_GEOMETRY, stageFor(466));
    expect(layout.silhouetteLeftX).toBeGreaterThanOrEqual(GEAR_CLEARANCE);
    expect(466 - layout.silhouetteRightX).toBeGreaterThanOrEqual(GEAR_CLEARANCE);
  });

  it('16:9 화면은 600 × 16/9 = 1066.7을 반올림한 1067, 21:9는 1400', () => {
    expect(resolvePlayLogicalWidth(1920, 1080)).toBe(1067);
    expect(resolvePlayLogicalWidth(2520, 1080)).toBe(1400);
  });

  it('4:3 화면은 800, 세로로 긴 폰(390×844)은 최소 466으로 묶는다', () => {
    expect(resolvePlayLogicalWidth(1024, 768)).toBe(800);
    expect(resolvePlayLogicalWidth(390, 844)).toBe(466);
  });

  it('크기를 모르는 0×0 화면이면 최소 466', () => {
    expect(resolvePlayLogicalWidth(0, 0)).toBe(466);
  });
});
