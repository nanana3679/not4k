import { describe, expect, it } from 'vitest';
import gearJson from './gearGeometry.json';
import {
  GEAR_GEOMETRY,
  GEAR_TEXTURE_OPTIONS,
  GEAR_CLEARANCE,
  clampGearDrop,
  layoutGear,
  minimumPlayLogicalWidth,
  resolvePlayLogicalWidth,
} from './gearLayout';
import { GAME_HEIGHT, GEAR_DROP, JUDGMENT_LINE_OFFSET, JUDGMENT_LINE_THICKNESS, LANE_AREA_WIDTH, NOTE_HEIGHT, judgmentLineYAtLift } from './constants';
import { getSkinManifest } from '../skin/skins';

const stageFor = (width: number) => ({ laneAreaX: (width - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT });

describe('기어 측정값 (prepare-frame-fit-v20.mjs → gearGeometry.json)', () => {
  it('레인 창 236~787열(552px), 덱 위끝 1090행, 열린 덱 바닥 1126행, 실루엣 16~1007열·아래끝 1465행', () => {
    expect(GEAR_GEOMETRY).toEqual({
      width: 1024, height: 1536,
      laneLeft: 236, laneRight: 787,
      deckTop: 1090, laneOpeningBottom: 1126,
      silhouetteLeft: 16, silhouetteRight: 1007,
      silhouetteBottom: 1465,
      gauge: {
        atlasWidth: 192, atlasHeight: 832,
        fillTop: 196, fillRows: 821,
        glass: { x0: 136, x1: 208, top: [196, 203], bottom: [1010, 1016], feather: 2, mirrorSum: 1023 },
        tubes: [
          { x: 136, y: 196, width: 73, height: 821, atlasX: 8, atlasY: 4 },
          { x: 815, y: 196, width: 73, height: 821, atlasX: 111, atlasY: 4 },
        ],
      },
    });
  });

  it('유리관 게이지 상자는 채움 구간(196행부터 821행)과 같고 오른쪽 유리관은 왼쪽을 x′ = 1023 − x로 반전한 자리(815~887열)다', () => {
    const { gauge } = GEAR_GEOMETRY;
    for (const tube of gauge.tubes) expect([tube.y, tube.height]).toEqual([gauge.fillTop, gauge.fillRows]);
    const [left, right] = gauge.tubes;
    expect([right.x, right.x + right.width - 1]).toEqual([1023 - (left.x + left.width - 1), 1023 - left.x]);
  });

  it('측정값 JSON은 기어 그림 public/gear/gear.png를 가리키고 매니페스트 gearImage도 같은 그림이다', () => {
    expect(gearJson.image).toBe('public/gear/gear.png');
    expect(getSkinManifest('classic').assets.gearImage).toBe('/gear/gear.png');
  });

  it('측정값 JSON의 게이지는 빈 유리 아틀라스 public/gear/gear-gauge-empty.png를 가리키고 매니페스트 gearGaugeEmpty도 같은 그림이다', () => {
    expect(gearJson.gauge.image).toBe('public/gear/gear-gauge-empty.png');
    expect(getSkinManifest('classic').assets.gearGaugeEmpty).toBe('/gear/gear-gauge-empty.png');
  });

  it('밉맵·삼선형 필터로 읽어 0.45배 이하로 줄여 그려도 계단이 생기지 않게 한다', () => {
    expect(GEAR_TEXTURE_OPTIONS).toEqual({ autoGenerateMipmaps: true, scaleMode: 'linear' });
  });
});

describe('layoutGear — 레인 창을 레인 영역에 맞추고 아래끝을 화면 아래에 붙인다', () => {
  it('16:9(논리 폭 1067)에서 배율 250/552, 레인 창이 레인 영역 x 408.5~658.5에 정확히 겹친다', () => {
    const layout = layoutGear(GEAR_GEOMETRY, stageFor(1067));
    expect(layout.scale).toBeCloseTo(250 / 552, 12);
    expect(layout.x + 236 * layout.scale).toBeCloseTo(408.5, 9);
    expect(layout.x + 788 * layout.scale).toBeCloseTo(658.5, 9);
    expect(layout.width).toBeCloseTo(1024 * 250 / 552, 9);
    expect(layout.height).toBeCloseTo(1536 * 250 / 552, 9);
  });

  it('실루엣 마지막 행 1465의 아래 가장자리가 화면 아래 600에 붙고 덱 위끝은 y 429.7, 키 윗면은 y 446.5', () => {
    const layout = layoutGear(GEAR_GEOMETRY, stageFor(1067));
    expect(layout.y + 1466 * layout.scale).toBeCloseTo(600, 9);
    expect(layout.deckTopY).toBeCloseTo(600 - 376 * 250 / 552, 9);
    expect(layout.deckTopY.toFixed(1)).toBe('429.7');
    expect(layout.keyRimY).toBeCloseTo(600 - 339 * 250 / 552, 9);
    expect(layout.keyRimY.toFixed(1)).toBe('446.5');
  });

  it('위쪽은 원본 141행만 화면 밖으로 잘린다(기어 위끝 y −63.9)', () => {
    const layout = layoutGear(GEAR_GEOMETRY, stageFor(1067));
    expect(layout.y.toFixed(1)).toBe('-63.9');
    expect(Math.round(-layout.y / layout.scale)).toBe(141);
  });

  it('실루엣은 화면 가운데 ± 224.6이라 4:3(논리 폭 800)에서 x 175.4~624.6', () => {
    const layout = layoutGear(GEAR_GEOMETRY, stageFor(800));
    expect(layout.silhouetteLeftX).toBeCloseTo(400 - 496 * 250 / 552, 9);
    expect(layout.silhouetteRightX).toBeCloseTo(400 + 496 * 250 / 552, 9);
    expect(layout.silhouetteRightX.toFixed(1)).toBe('624.6');
  });

  it('화면 비율이 바뀌어도 세로 배치는 그대로이고 가로만 가운데를 따라간다', () => {
    const wide = layoutGear(GEAR_GEOMETRY, stageFor(1400));
    const square = layoutGear(GEAR_GEOMETRY, stageFor(600));
    expect(wide.y).toBeCloseTo(square.y, 9);
    expect(wide.keyRimY).toBeCloseTo(square.keyRimY, 9);
    expect(wide.x - square.x).toBeCloseTo(400, 9);
  });

  it('drop 20이면 기어 위끝 y·덱 위끝 deckTopY·키 윗면 keyRimY가 모두 20 내려가고(키 윗면 466.5) 배율·가로 배치·실루엣 x는 그대로다', () => {
    const base = layoutGear(GEAR_GEOMETRY, stageFor(1067));
    const dropped = layoutGear(GEAR_GEOMETRY, { ...stageFor(1067), drop: 20 });
    expect(dropped.y - base.y).toBeCloseTo(20, 9);
    expect(dropped.deckTopY - base.deckTopY).toBeCloseTo(20, 9);
    expect(dropped.keyRimY - base.keyRimY).toBeCloseTo(20, 9);
    expect(dropped.keyRimY.toFixed(1)).toBe('466.5');
    expect([dropped.scale, dropped.x, dropped.width, dropped.height, dropped.silhouetteLeftX, dropped.silhouetteRightX])
      .toEqual([base.scale, base.x, base.width, base.height, base.silhouetteLeftX, base.silhouetteRightX]);
    // 실루엣 아래 가장자리(1466행 위끝)는 화면 아래 600보다 20 아래라, 원본 20 ÷ 배율 = 44.2행이 화면 밖으로 잘린다.
    expect(dropped.y + 1466 * dropped.scale).toBeCloseTo(620, 9);
    expect((20 / dropped.scale).toFixed(1)).toBe('44.2');
  });

  it('drop을 주지 않거나 0이면 drop 없는 배치와 같다(키 윗면 446.5)', () => {
    const base = layoutGear(GEAR_GEOMETRY, stageFor(1067));
    expect(layoutGear(GEAR_GEOMETRY, { ...stageFor(1067), drop: 0 })).toEqual(base);
    expect(base.keyRimY.toFixed(1)).toBe('446.5');
  });

  it('drop −10·NaN은 0으로 맞춰 기어를 위로 올리지 않는다(키 윗면 446.5 그대로)', () => {
    const base = layoutGear(GEAR_GEOMETRY, stageFor(1067));
    expect(layoutGear(GEAR_GEOMETRY, { ...stageFor(1067), drop: -10 })).toEqual(base);
    expect(layoutGear(GEAR_GEOMETRY, { ...stageFor(1067), drop: Number.NaN })).toEqual(base);
  });
});

describe('clampGearDrop — 기어 내리기 양', () => {
  it('12.5 → 12.5, 100 → 100(위쪽 한계 없음), −3 → 0, NaN·Infinity·undefined → 0', () => {
    expect([clampGearDrop(12.5), clampGearDrop(100), clampGearDrop(-3)]).toEqual([12.5, 100, 0]);
    expect([clampGearDrop(Number.NaN), clampGearDrop(Number.POSITIVE_INFINITY), clampGearDrop(undefined)]).toEqual([0, 0, 0]);
  });

  it('리프트 0% 판정선 y 416은 선 두께(2.5)까지 덱 위끝보다 위이고 덱과의 틈 13.7은 노트 두께 약 1.1개', () => {
    const layout = layoutGear(GEAR_GEOMETRY, stageFor(1067));
    const lineY = GAME_HEIGHT - JUDGMENT_LINE_OFFSET;
    expect(lineY + JUDGMENT_LINE_THICKNESS / 2).toBeLessThan(layout.deckTopY);
    expect((layout.deckTopY - lineY).toFixed(1)).toBe('13.7');
    expect(((layout.deckTopY - lineY) / NOTE_HEIGHT).toFixed(1)).toBe('1.1');
    // 판정선에서 키 윗면까지 30.5(노트 두께 약 2.4개)가 보인다.
    expect((layout.keyRimY - lineY).toFixed(1)).toBe('30.5');
  });

  it('게임 배치(GEAR_DROP 10, #257)는 판정선 y 426·덱 위끝 439.7·키 윗면 456.5로 함께 내려가 틈 13.7·30.5는 그대로이고, 실루엣 아래쪽 원본 22.1행이 화면 밖으로 잘린다', () => {
    const layout = layoutGear(GEAR_GEOMETRY, { ...stageFor(1067), drop: GEAR_DROP });
    const lineY = judgmentLineYAtLift(0);
    expect(lineY).toBe(426);
    expect(layout.deckTopY.toFixed(1)).toBe('439.7');
    expect(layout.keyRimY.toFixed(1)).toBe('456.5');
    expect((layout.deckTopY - lineY).toFixed(1)).toBe('13.7');
    expect((layout.keyRimY - lineY).toFixed(1)).toBe('30.5');
    expect(((layout.y + 1466 * layout.scale - GAME_HEIGHT) / layout.scale).toFixed(1)).toBe('22.1');
  });
});

describe('플레이 화면 논리 폭', () => {
  it('최소 논리 폭 466은 실루엣 폭 449.3에 양옆 여백 8을 더해 올림한 값이다', () => {
    expect(GEAR_CLEARANCE).toBe(8);
    expect(minimumPlayLogicalWidth()).toBe(466);
    const layout = layoutGear(GEAR_GEOMETRY, stageFor(466));
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
