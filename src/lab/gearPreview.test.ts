import { describe, expect, it } from 'vitest';
import { GEAR_GEOMETRY, layoutGear } from '../game/renderer/gearLayout';
import { GAME_HEIGHT, GEAR_OFFSET_Y, LANE_AREA_WIDTH } from '../game/renderer/constants';
import {
  altitudeOverrideFor,
  altitudePercentOf,
  clampAltitudePercent,
  clampLiftPercent,
  clampPreviewGearOffsetY,
  describeGearOffsetY,
  formatGearOffsetY,
  GEAR_OFFSET_Y_MAX,
  GEAR_OFFSET_Y_STEP,
  gearRowsBelowScreen,
  nextGearOffsetYSearch,
  parseGearOffsetYParam,
  describeGaugeLevel,
  formatGaugeLevel,
  manualAltitudeOnUnfollow,
  describeGear,
  describeGearJudgment,
  describePixelRatio,
  GEAR_PREVIEW_KEYBOARDS,
  GEAR_PREVIEW_STAGE_WIDTH,
  formatLiftPercent,
  fullscreenLogicalWidth,
  LIFT_PERCENT_MAX,
  oneToOneCssSize,
} from './gearPreview';

const layoutFor = (width: number, offsetY = 0) => layoutGear(GEAR_GEOMETRY, {
  laneAreaX: (width - LANE_AREA_WIDTH) / 2, laneAreaWidth: LANE_AREA_WIDTH, height: GAME_HEIGHT, offsetY,
});

describe('Gear 무대 논리 폭 (게임 PlayScreen과 같은 규칙)', () => {
  it('기본 16:9 무대는 논리 폭 1067', () => {
    expect(GEAR_PREVIEW_STAGE_WIDTH).toBe(1067);
  });

  it('전체화면 1400×600은 1400, 가로 폰 844×390은 1298, 세로 폰 390×844는 기어 최소 폭 466', () => {
    expect(fullscreenLogicalWidth(1400, 600)).toBe(1400);
    expect(fullscreenLogicalWidth(844, 390)).toBe(1298);
    expect(fullscreenLogicalWidth(390, 844)).toBe(466);
  });

  it('크기를 모르는 0×0이면 기본 16:9 폭 1067', () => {
    expect(fullscreenLogicalWidth(0, 0)).toBe(1067);
  });
});

describe('Lab 리프트 슬라이더', () => {
  it('Lab은 게임 리프트 0~10%만 다루고 정수로 맞춘다: 4.4 → 4, 12 → 10, −3 → 0, NaN → 0', () => {
    expect(LIFT_PERCENT_MAX).toBe(10);
    expect(clampLiftPercent(4.4)).toBe(4);
    expect(clampLiftPercent(12)).toBe(10);
    expect(clampLiftPercent(-3)).toBe(0);
    expect(clampLiftPercent(Number.NaN)).toBe(0);
  });

  it('4%는 판정선을 24 논리 단위 올리므로 "4% (+24)"로 표시한다', () => {
    expect(formatLiftPercent(4)).toBe('4% (+24)');
    expect(formatLiftPercent(0)).toBe('0% (+0)');
  });
});

describe('describeGearJudgment — 실제 게임 판정선과 기어 덱 사이', () => {
  it('게임 배치(기어·판정선 10 내림)의 리프트 0%에서 판정선 y 426, 덱 위끝 439.7과의 틈 13.7(노트 두께 1.1개), 키 윗면 456.5까지 30.5(2.4개)', () => {
    const judgment = describeGearJudgment(layoutFor(1067, GEAR_OFFSET_Y), 0);
    expect(judgment.lineY).toBe(426);
    expect(judgment.deckTopY.toFixed(1)).toBe('439.7');
    expect(judgment.gap.toFixed(1)).toBe('13.7');
    expect(judgment.gapNotes.toFixed(1)).toBe('1.1');
    expect(judgment.keyRimY.toFixed(1)).toBe('456.5');
    expect(judgment.openGap.toFixed(1)).toBe('30.5');
    expect(judgment.openGapNotes.toFixed(1)).toBe('2.4');
  });

  it('게임 배치에서 리프트 4%면 판정선만 y 402로 올라 덱과의 틈이 37.7, 키 윗면까지 54.5로 늘고 덱·키 윗면 위치는 그대로다', () => {
    const base = describeGearJudgment(layoutFor(1067, GEAR_OFFSET_Y), 0);
    const lifted = describeGearJudgment(layoutFor(1067, GEAR_OFFSET_Y), 4);
    expect(lifted.lineY).toBe(402);
    expect(lifted.deckTopY).toBe(base.deckTopY);
    expect(lifted.keyRimY).toBe(base.keyRimY);
    expect(lifted.gap.toFixed(1)).toBe('37.7');
    expect(lifted.openGap.toFixed(1)).toBe('54.5');
  });
});

describe('기어·판정선 y 오프셋(#257)', () => {
  it('Lab 슬라이더는 0~60을 0.5 단위로 다룬다: 12.3 → 12.5, 75 → 60, −5 → 0, NaN → 0', () => {
    expect([GEAR_OFFSET_Y_MAX, GEAR_OFFSET_Y_STEP]).toEqual([60, 0.5]);
    expect([clampPreviewGearOffsetY(12.3), clampPreviewGearOffsetY(75), clampPreviewGearOffsetY(-5), clampPreviewGearOffsetY(Number.NaN)]).toEqual([12.5, 60, 0, 0]);
  });

  it('주소의 offsetY는 게임과 같은 절대값이다: "20" → 20, "12.5" → 12.5, "0" → 0, "75" → 60, "-3" → 0, "abc"·빈 값·없음 → 게임 값 10', () => {
    expect([parseGearOffsetYParam('20'), parseGearOffsetYParam('12.5'), parseGearOffsetYParam('0'), parseGearOffsetYParam('75'), parseGearOffsetYParam('-3')]).toEqual([20, 12.5, 0, 60, 0]);
    expect([parseGearOffsetYParam('abc'), parseGearOffsetYParam(''), parseGearOffsetYParam(null)]).toEqual([GEAR_OFFSET_Y, GEAR_OFFSET_Y, GEAR_OFFSET_Y]);
    expect(GEAR_OFFSET_Y).toBe(10);
  });

  it('값을 바꾸면 다른 쿼리는 두고 offsetY만 쓰며(12.5 → "offsetY=12.5", 0 → "offsetY=0"), 게임 값 10이면 offsetY를 지워 기본 주소로 돌아간다', () => {
    expect(nextGearOffsetYSearch(new URLSearchParams('probe=1'), 12.5).toString()).toBe('probe=1&offsetY=12.5');
    expect(nextGearOffsetYSearch(new URLSearchParams('probe=1'), 0).toString()).toBe('probe=1&offsetY=0');
    expect(nextGearOffsetYSearch(new URLSearchParams('offsetY=20&probe=1'), 10).toString()).toBe('probe=1');
    expect(formatGearOffsetY(20)).toBe('20');
    expect(formatGearOffsetY(12.5)).toBe('12.5');
  });

  it('기어를 20 내리면 실루엣 아래쪽 원본 20 ÷ 배율 = 44.2행이 화면 아래로 잘리고, 내리지 않으면 0행이다', () => {
    expect(gearRowsBelowScreen(layoutFor(1067, 20)).toFixed(1)).toBe('44.2');
    expect(gearRowsBelowScreen(layoutFor(1067))).toBe(0);
  });

  it('20 내리면 판정선 y 436·키 윗면 466.5로 함께 내려가 틈은 30.5 그대로이고, 리프트 4%면 판정선만 y 412로 올라 틈이 54.5다', () => {
    const shifted = describeGearJudgment(layoutFor(1067, 20), 0, 20);
    expect(shifted.lineY).toBe(436);
    expect(shifted.keyRimY.toFixed(1)).toBe('466.5');
    expect(shifted.deckTopY.toFixed(1)).toBe('449.7');
    expect(shifted.openGap.toFixed(1)).toBe('30.5');
    expect(shifted.gap.toFixed(1)).toBe('13.7');
    const lifted = describeGearJudgment(layoutFor(1067, 20), 4, 20);
    expect(lifted.lineY).toBe(412);
    expect(lifted.keyRimY).toBe(shifted.keyRimY);
    expect(lifted.openGap.toFixed(1)).toBe('54.5');
  });

  it('조절 옆 숫자: 게임 값 10이면 "판정선 y 426 · 키 윗면 y 456.5 · 틈 30.5 · 아래로 원본 22.1행 잘림", 20이면 y 436·466.5·44.2행, 0이면 "… · 아래로 잘리는 행 없음"', () => {
    const game = layoutFor(1067, GEAR_OFFSET_Y);
    expect(describeGearOffsetY(game, describeGearJudgment(game, 0), GEAR_OFFSET_Y)).toBe('+10 논리 px(+가 아래) · 판정선 y 426 · 키 윗면 y 456.5 · 틈 30.5 · 아래로 원본 22.1행 잘림');
    const shifted = layoutFor(1067, 20);
    expect(describeGearOffsetY(shifted, describeGearJudgment(shifted, 0, 20), 20)).toBe('+20 논리 px(+가 아래) · 판정선 y 436 · 키 윗면 y 466.5 · 틈 30.5 · 아래로 원본 44.2행 잘림');
    const base = layoutFor(1067);
    expect(describeGearOffsetY(base, describeGearJudgment(base, 0, 0), 0)).toBe('0 논리 px(+가 아래) · 판정선 y 416 · 키 윗면 y 446.5 · 틈 30.5 · 아래로 잘리는 행 없음');
    expect(describeGearOffsetY(layoutFor(1067, 12.5), describeGearJudgment(layoutFor(1067, 12.5), 0, 12.5), 12.5)).toBe('+12.5 논리 px(+가 아래) · 판정선 y 428.5 · 키 윗면 y 459.0 · 틈 30.5 · 아래로 원본 27.6행 잘림');
  });
});

describe('describeGear', () => {
  it('y 오프셋 0인 배치는 원본 1024×1536을 0.453배로 줄여 레인 창 236~787열을 레인 영역 250에 맞추고 위로 141행만 잘린다고 설명한다', () => {
    const text = describeGear(layoutFor(1067));
    expect(text).toContain('0.453배');
    expect(text).toContain('236~787열');
    expect(text).toContain('레인 영역 250');
    expect(text).toContain('1465행');
    expect(text).toContain('141행');
    expect(text).toContain('y 429.7');
    expect(text).toContain('y 446.5');
    expect(text).toContain('화면 아래에 붙여');
    expect(text).not.toContain('아래로 원본');
  });

  it('게임 값 10이면 실루엣 아래끝을 화면 아래보다 10 아래에 두어 위로 원본 119행, 아래로 원본 22.1행이 잘리고 덱 위끝 y 439.7·키 윗면 y 456.5라고 설명한다', () => {
    const text = describeGear(layoutFor(1067, GEAR_OFFSET_Y));
    expect(text).toContain('화면 아래보다 10 아래');
    expect(text).toContain('위로 원본 119행');
    expect(text).toContain('아래로 원본 22.1행');
    expect(text).toContain('y 439.7');
    expect(text).toContain('y 456.5');
  });

  it('20 내리면 실루엣 아래끝을 화면 아래보다 20 아래에 두어 위로 원본 97행, 아래로 원본 44.2행이 잘리고 덱 위끝 y 449.7·키 윗면 y 466.5라고 설명한다', () => {
    const text = describeGear(layoutFor(1067, 20));
    expect(text).toContain('화면 아래보다 20 아래');
    expect(text).toContain('위로 원본 97행');
    expect(text).toContain('아래로 원본 44.2행');
    expect(text).toContain('y 449.7');
    expect(text).toContain('y 466.5');
    expect(text).not.toContain('하단 바는 모두 보입니다');
  });
});

describe('선명도·1:1 보기', () => {
  it('기어 배율 250/552에서 렌더 높이 1080은 원본 1px → 화면 0.82px(축소), 1440은 1.09px(확대)', () => {
    expect(describePixelRatio((250 / 552) * 1.8)).toBe('원본 1px → 화면 0.82px (축소)');
    expect(describePixelRatio((250 / 552) * 2.4)).toBe('원본 1px → 화면 1.09px (확대)');
    expect(describePixelRatio(1)).toBe('원본 1px → 화면 1.00px (등배)');
  });

  it('1:1 보기에서 백버퍼 1921×1080을 devicePixelRatio 2로 나눈 CSS 960.5×540, 비율이 0·NaN이면 1로 본다', () => {
    expect(oneToOneCssSize(1921, 1080, 2)).toEqual({ width: 960.5, height: 540 });
    expect(oneToOneCssSize(1280, 720, 0)).toEqual({ width: 1280, height: 720 });
    expect(oneToOneCssSize(1280, 720, Number.NaN)).toEqual({ width: 1280, height: 720 });
  });
});

describe('키보드 표시 선택', () => {
  it('게임 프리셋과 같은 TKL·넘버패드 두 가지를 고르고 넘버패드 바인딩에만 Numpad 키가 있다', () => {
    expect(Object.keys(GEAR_PREVIEW_KEYBOARDS)).toEqual(['tkl', 'numpad']);
    expect(GEAR_PREVIEW_KEYBOARDS.tkl.label).toBe('TKL');
    expect(GEAR_PREVIEW_KEYBOARDS.numpad.label).toBe('넘버패드');
    expect([...GEAR_PREVIEW_KEYBOARDS.numpad.bindings.keys()].some((code) => code.startsWith('Numpad'))).toBe(true);
    expect([...GEAR_PREVIEW_KEYBOARDS.tkl.bindings.keys()].some((code) => code.startsWith('Numpad'))).toBe(false);
    expect(GEAR_PREVIEW_KEYBOARDS.tkl.bindings.get('KeyQ')).toBe(1);
  });
});

describe('고도 조절(기어 게이지·비행 배경)', () => {
  it('직접 정하기 슬라이더 값은 정수 %로 맞추고 0~100으로 묶는다(−5 → 0, 130 → 100, 29.6 → 30, NaN → 100)', () => {
    expect([clampAltitudePercent(-5), clampAltitudePercent(130), clampAltitudePercent(29.6), clampAltitudePercent(Number.NaN)]).toEqual([0, 100, 30, 100]);
  });

  it('곡 진행 따라가기면 렌더러 고정값은 null, 직접 정한 고도 0.3이면 0.3이고 1.2는 1로 자른다', () => {
    expect(altitudeOverrideFor(true, 0.3)).toBeNull();
    expect(altitudeOverrideFor(false, 0.3)).toBe(0.3);
    expect(altitudeOverrideFor(false, 1.2)).toBe(1);
  });

  it('슬라이더는 고정 고도를 정수 %로 가리킨다(0.734 → 73, 0.996 → 100)', () => {
    expect([altitudePercentOf(0.734), altitudePercentOf(0.996)]).toEqual([73, 100]);
  });

  it('따라가기를 끄는 순간에는 그때 보이던 게이지 채움 0.734를 그대로 고정값으로 써 게이지가 멈춰 있고, 게이지가 없으면(null) 지금 고정값 0.6을 유지한다', () => {
    expect(manualAltitudeOnUnfollow(0.734, 1)).toBe(0.734);
    expect(manualAltitudeOnUnfollow(null, 0.6)).toBe(0.6);
  });

  it('무대 data 속성은 게이지 채움을 소수 셋째 자리까지 적고(0.3 → "0.300"), 게이지가 없으면 속성을 쓰지 않는다', () => {
    expect(formatGaugeLevel(0.3)).toBe('0.300');
    expect(formatGaugeLevel(1)).toBe('1.000');
    expect(formatGaugeLevel(null)).toBeUndefined();
  });

  it('설명은 채움 %와 덮은 빈 유리 행을 보여 준다(0.3 → "30% · 빈 유리 575/821행", 1 → "100% · 그림 그대로", 없으면 "게이지 없음")', () => {
    expect(describeGaugeLevel(0.3)).toBe('30% · 빈 유리 575/821행');
    expect(describeGaugeLevel(1)).toBe('100% · 그림 그대로');
    expect(describeGaugeLevel(null)).toBe('게이지 없음');
  });
});
