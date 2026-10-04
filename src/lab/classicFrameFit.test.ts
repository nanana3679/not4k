import { describe, expect, it } from 'vitest';
import frameFitJson from '../../public/lab/classic-frame-fit/frame-fit.json?raw';
import {
  clampUniformLaneWidth,
  clampUniformLiftPercent,
  laneSliderValue,
  computeFrameFitLayout,
  computeFrameFitZoom,
  createFrameFitStage,
  describeCurrentGear,
  describeFrameFit,
  describePixelRatio,
  describeFrameParts,
  FRAME_FIT_STAGE_WIDTH,
  FRAME_MOTION_FIT_MODES,
  fullscreenLogicalWidth,
  formatLiftPercent,
  LIFT_PERCENT_MAX,
  listFrameParts,
  minUniformLiftPercent,
  UNIFORM_DEFAULT_LANE_WIDTH,
  UNIFORM_DEFAULT_LIFT_PERCENT,
  uniformJudgment,
  oneToOneCssSize,
  parseFrameFitGeometry,
  supportsFrameMotion,
  uniformLaneWidthRange,
  type FrameFitGeometry,
} from './classicFrameFit';

// public/lab/classic-frame-fit/frame-fit.json(prepare-frame-fit-v20.mjs 측정값)과 같은 값.
const geometry: FrameFitGeometry = {
  width: 1024,
  height: 1536,
  laneLeft: 236,
  laneRight: 787,
  laneBottom: 1089,
  silhouetteTop: 16,
  gaugeGlowTop: 196,
  keyFaceTop: 1137,
  keyFaceBottom: 1235,
  deckBottom: 1340,
  barGlowTop: 1367,
  barGlowBottom: 1399,
  frameBottom: 1465,
  seam: { y1: 423, y2: 906, cost: 28.93, typicalAdjacentRowCost: 2.06 },
};
const stage = createFrameFitStage(FRAME_FIT_STAGE_WIDTH);

describe('classicFrameFit 무대', () => {
  it('16:9 화면 논리 폭 1067에서 레인 영역은 x 333.5부터 폭 400, 판정선은 y 440', () => {
    expect(FRAME_FIT_STAGE_WIDTH).toBe(1067);
    expect(stage).toEqual({ laneAreaX: 333.5, laneAreaWidth: 400, judgmentLineY: 440, height: 600 });
  });
});

describe('classicFrameFit 레이아웃', () => {
  it('crop 모드에서 레인 폭 552px 프레임은 배율 0.7246, 위끝 y −349.9 (위 483행이 화면 밖)', () => {
    const layout = computeFrameFitLayout('crop', geometry, stage)!;
    expect(layout.scale).toBeCloseTo(0.7246, 4);
    expect(layout.frameTop).toBeCloseTo(-349.855, 3);
    expect(layout.hiddenRowsAbove).toBe(483);
    expect(layout.slices).toHaveLength(1);
    expect(layout.slices[0]).toMatchObject({ sourceTop: 0, sourceBottom: 1536 });
  });

  it('crop 모드에서 레인 창 왼쪽 열 236은 레인 영역 왼쪽 x 333.5에, 오른쪽 열 787의 끝은 x 733.5에 맞는다', () => {
    const layout = computeFrameFitLayout('crop', geometry, stage)!;
    const [slice] = layout.slices;
    expect(slice.x + geometry.laneLeft * slice.scaleX).toBeCloseTo(333.5, 6);
    expect(slice.x + (geometry.laneRight + 1) * slice.scaleX).toBeCloseTo(733.5, 6);
  });

  it('crop 모드에서 덱 첫 행 1090은 판정선 y 440에 놓이고 판정선 아래로 1310행까지 221행만 보인다', () => {
    const layout = computeFrameFitLayout('crop', geometry, stage)!;
    const [slice] = layout.slices;
    expect(slice.y + 1090 * slice.scaleY).toBeCloseTo(440, 6);
    expect(layout.lastVisibleRow).toBe(1310);
  });

  it('cut 모드에서 423~905행(483행)을 잘라내면 위끝이 화면 위 0에 붙는다(오차 0.5 미만)', () => {
    const layout = computeFrameFitLayout('cut', geometry, stage)!;
    expect(layout.removedRows).toBe(483);
    expect(Math.abs(layout.frameTop)).toBeLessThan(0.5);
    expect(layout.hiddenRowsAbove).toBe(0);
  });

  it('cut 모드에서 아래 조각은 906행부터 위 조각 바로 밑 y 306.7에 틈 없이 붙고 덱 첫 행은 판정선에 남는다', () => {
    const layout = computeFrameFitLayout('cut', geometry, stage)!;
    const [upper, lower] = layout.slices;
    expect(upper).toMatchObject({ sourceTop: 0, sourceBottom: 423 });
    expect(lower).toMatchObject({ sourceTop: 906, sourceBottom: 1536 });
    expect(upper.y + (upper.sourceBottom - upper.sourceTop) * upper.scaleY).toBeCloseTo(lower.y, 9);
    expect(lower.y).toBeCloseTo(306.67, 2);
    expect(lower.y + (1090 - 906) * lower.scaleY).toBeCloseTo(440, 6);
    expect(upper.scaleX).toBe(lower.scaleX);
  });

  it('squash 모드에서 기둥 구간 0~1089행은 세로 배율 0.4037(레인 폭 배율의 56%)로 눌려 화면 위 0부터 판정선 440까지 채운다', () => {
    const layout = computeFrameFitLayout('squash', geometry, stage)!;
    const [pillars] = layout.slices;
    expect(pillars).toMatchObject({ sourceTop: 0, sourceBottom: 1090, y: 0 });
    expect(pillars.scaleY).toBeCloseTo(0.4037, 4);
    expect(layout.verticalScale / layout.scale).toBeCloseTo(0.557, 3);
    expect(pillars.y + 1090 * pillars.scaleY).toBeCloseTo(440, 9);
    expect(layout.frameTop).toBe(0);
  });

  it('squash 모드에서 덱 구간 1090~1535행은 판정선 y 440부터 레인 폭 배율 0.7246 그대로 그린다', () => {
    const layout = computeFrameFitLayout('squash', geometry, stage)!;
    const [, deck] = layout.slices;
    expect(deck).toMatchObject({ sourceTop: 1090, sourceBottom: 1536, y: 440 });
    expect(deck.scaleX).toBeCloseTo(0.7246, 4);
    expect(deck.scaleY).toBe(deck.scaleX);
  });

  it('current 모드는 새 프레임을 얹지 않으므로 레이아웃이 null', () => {
    expect(computeFrameFitLayout('current', geometry, stage)).toBeNull();
  });
});

describe('classicFrameFit 측정값 검증', () => {
  it('public frame-fit.json은 레인 창 236~787열, 마지막 레인 행 1089, 이음매 423~906행을 담는다', () => {
    const json = JSON.parse(frameFitJson);
    const parsed = parseFrameFitGeometry(json);
    expect(parsed).toMatchObject({ laneLeft: 236, laneRight: 787, laneBottom: 1089, seam: { y1: 423, y2: 906 } });
    expect(computeFrameFitLayout('cut', parsed, stage)!.removedRows).toBe(json.seam.removedRows);
  });

  it('laneLeft가 없는 측정값이면 에러', () => {
    const { laneLeft: _omit, ...rest } = geometry;
    expect(() => parseFrameFitGeometry(rest)).toThrow('laneLeft');
  });

  it('이음매 끝 행 y2가 덱 첫 행 1090보다 아래(1091)면 에러', () => {
    expect(() => parseFrameFitGeometry({ ...geometry, seam: { ...geometry.seam, y2: 1091 } })).toThrow('seam');
  });

  it('laneRight가 laneLeft보다 작으면 에러', () => {
    expect(() => parseFrameFitGeometry({ ...geometry, laneLeft: 800, laneRight: 700 })).toThrow('lane');
  });
});

describe('classicFrameFit 선명도 표시', () => {
  it('렌더 높이 1080(해상도 1.8)에서 배율 0.7246이면 원본 1px → 화면 1.30px 확대', () => {
    expect(describePixelRatio((400 / 552) * 1.8)).toBe('원본 1px → 화면 1.30px (확대)');
  });

  it('렌더 높이 720(해상도 1.2)에서 배율 0.7246이면 원본 1px → 화면 0.87px 축소', () => {
    expect(describePixelRatio((400 / 552) * 1.2)).toBe('원본 1px → 화면 0.87px (축소)');
  });

  it('배율과 해상도의 곱이 1이면 등배', () => {
    expect(describePixelRatio(1)).toBe('원본 1px → 화면 1.00px (등배)');
  });

  it('1:1 픽셀 보기에서 1921×1080 캔버스는 devicePixelRatio 2이면 CSS 960.5×540', () => {
    expect(oneToOneCssSize(1921, 1080, 2)).toEqual({ width: 960.5, height: 540 });
  });

  it('devicePixelRatio가 0이나 NaN이면 1로 보고 캔버스 픽셀 크기를 그대로 쓴다', () => {
    expect(oneToOneCssSize(1280, 720, 0)).toEqual({ width: 1280, height: 720 });
    expect(oneToOneCssSize(1280, 720, Number.NaN)).toEqual({ width: 1280, height: 720 });
  });
});

describe('classicFrameFit 설명 문장', () => {
  it('crop 설명은 화면 위로 잘리는 원본 483행과 판정선 아래 보이는 1310행까지, 하단 바가 화면 밖임을 말한다', () => {
    const text = describeFrameFit(computeFrameFitLayout('crop', geometry, stage)!, geometry);
    expect(text).toContain('483행');
    expect(text).toContain('1310행');
    expect(text).toContain('하단 바');
  });

  it('cut 설명은 잘라낸 423~905행(483행)과 이음매 차이 28.9(인접 행 2.1의 14배)를 말한다', () => {
    const text = describeFrameFit(computeFrameFitLayout('cut', geometry, stage)!, geometry);
    expect(text).toContain('423~905행(483행)');
    expect(text).toContain('28.9');
    expect(text).toContain('14배');
  });

  it('현재 게임 기어 위끝이 y −331.9이면 위 332 논리 단위가 화면 밖이라고 말한다', () => {
    const text = describeCurrentGear(-331.93);
    expect(text).toContain('y -331.9');
    expect(text).toContain('332');
  });

  it('squash 설명은 기둥 0~1089행을 세로 0.404배, 레인 폭 배율의 56%로 누른다고 말한다', () => {
    const text = describeFrameFit(computeFrameFitLayout('squash', geometry, stage)!, geometry);
    expect(text).toContain('0~1089행');
    expect(text).toContain('0.404배');
    expect(text).toContain('56%');
  });
});

describe('classicFrameFit 가로세로 같이 줄이기(프레임 아래끝 고정)', () => {
  // 프레임 아래끝(1465행의 아래 끝 = 1466)을 화면 아래 600에 붙인다. 위끝이 화면 위에 닿는 최소 폭 = 600 × 552 ÷ 1466.
  const minimum = (600 * 552) / 1466;

  it('최소 레인 폭은 600 × 552 ÷ 1466 = 225.9(아래끝을 화면 아래에 붙였을 때 위끝이 화면 위에 닿는 폭), 최대 400, 기본 250', () => {
    const range = uniformLaneWidthRange(geometry, stage);
    expect(range.min).toBeCloseTo(225.92, 2);
    expect(range.max).toBe(400);
    expect(UNIFORM_DEFAULT_LANE_WIDTH).toBe(250);
  });

  it('레인 폭 250이면 프레임 아래끝이 화면 아래 600에 붙고 덱 위끝은 429.7, 위끝은 −63.9라 위 141행이 잘린다', () => {
    const layout = computeFrameFitLayout('uniform', geometry, stage, 250)!;
    expect(layout.zoom).toBeCloseTo(1.6, 9);
    expect(layout.screenScale).toBeCloseTo(0.4529, 4);
    expect(layout.screenDeckTop).toBeCloseTo(429.71, 2);
    expect(layout.screenFrameTop).toBeCloseTo(-63.95, 2);
    expect(layout.hiddenRowsAbove).toBe(141);
    const [slice] = layout.slices;
    expect((slice.y + 1466 * slice.scaleY) / layout.zoom).toBeCloseTo(600, 9);
    expect(layout.lastVisibleRow).toBe(1465);
    expect(layout.bottomCutRows).toBe(0);
  });

  it('레인 폭 225.9(최소)이면 위끝이 화면 위 0에 닿아 잘리는 행 0, 덱 위끝은 446.1', () => {
    const layout = computeFrameFitLayout('uniform', geometry, stage, minimum)!;
    expect(layout.screenFrameTop).toBeLessThanOrEqual(0);
    expect(layout.screenFrameTop).toBeCloseTo(0, 9);
    expect(layout.hiddenRowsAbove).toBe(0);
    expect(layout.screenDeckTop).toBeCloseTo(446.11, 2);
  });

  it('레인 폭 300이면 덱 위끝 395.7, 위끝 −196.7(362행 잘림)이고 렌더러(1422.7×800)에서 프레임 아래끝은 800, 레인 창은 x 511.3에 맞는다', () => {
    const layout = computeFrameFitLayout('uniform', geometry, stage, 300)!;
    expect(layout.screenDeckTop).toBeCloseTo(395.65, 2);
    expect(layout.screenFrameTop).toBeCloseTo(-196.74, 2);
    expect(layout.hiddenRowsAbove).toBe(362);
    const [slice] = layout.slices;
    expect(slice.y + 1466 * slice.scaleY).toBeCloseTo(800, 9);
    expect(slice.x + geometry.laneLeft * slice.scaleX).toBeCloseTo((1067 * (4 / 3) - 400) / 2, 9);
    const zoom = computeFrameFitZoom(300, stage, 1080, 800);
    expect([zoom.width, zoom.height, zoom.judgmentLineOffset]).toEqual([1067 * (4 / 3), 800, 160 * (4 / 3)]);
  });

  it('레인 폭 300·렌더 높이 1080이면 렌더러 해상도 1.35라 캔버스 백버퍼는 1921×1080 그대로, 스크롤 1066.7이라 노트가 화면을 지나는 시간도 그대로', () => {
    const zoom = computeFrameFitZoom(300, stage, 1080, 800);
    expect(zoom.resolution).toBeCloseTo(1.35, 9);
    expect(Math.round(zoom.width * zoom.resolution)).toBe(1921);
    expect(Math.round(zoom.height * zoom.resolution)).toBe(1080);
    expect(zoom.scrollSpeed).toBeCloseTo(1066.67, 2);
    expect(zoom.height / zoom.scrollSpeed).toBeCloseTo(600 / 800, 9);
  });

  it('레인 폭 400이면 줌 1이지만 아래끝을 화면 아래에 붙여 덱 위끝 327.5·위끝 −462.3으로 crop(덱 440)과 다르다', () => {
    const layout = computeFrameFitLayout('uniform', geometry, stage, 400)!;
    expect(layout.zoom).toBe(1);
    expect(layout.screenDeckTop).toBeCloseTo(327.54, 2);
    expect(layout.screenFrameTop).toBeCloseTo(-462.32, 2);
    expect(computeFrameFitLayout('crop', geometry, stage)!.screenDeckTop).toBe(440);
  });

  it('레인 폭 250·렌더 높이 1080에서 원본 1px은 화면 0.82px(축소), 720이면 0.54px', () => {
    const layout = computeFrameFitLayout('uniform', geometry, stage, 250)!;
    expect(describePixelRatio(layout.screenScale * (1080 / 600))).toBe('원본 1px → 화면 0.82px (축소)');
    expect(describePixelRatio(layout.screenScale * (720 / 600))).toBe('원본 1px → 화면 0.54px (축소)');
  });

  it('레인 폭 슬라이더는 최소 225.9를 맨 왼쪽 칸 225에 두고(226으로 반올림하면 놓을 때 최소를 확정할 수 없다) 250.4는 250 칸에 둔다', () => {
    expect(laneSliderValue(minimum, minimum)).toBe(225);
    expect(laneSliderValue(250.4, minimum)).toBe(250);
    expect(clampUniformLaneWidth(225, geometry, stage)).toBeCloseTo(minimum, 9);
  });

  it('레인 폭 200(최소 미만)과 NaN은 최소 225.9로, 450은 400으로 맞춘다', () => {
    expect(clampUniformLaneWidth(200, geometry, stage)).toBeCloseTo(minimum, 9);
    expect(clampUniformLaneWidth(Number.NaN, geometry, stage)).toBeCloseTo(minimum, 9);
    expect(clampUniformLaneWidth(450, geometry, stage)).toBe(400);
  });

  it('crop 이외 방식은 레인 폭을 넘겨도 줌 1, 덱 위끝은 판정선 440, 화면 배율 = 레인 폭 배율', () => {
    const layout = computeFrameFitLayout('cut', geometry, stage, 300)!;
    expect(layout.zoom).toBe(1);
    expect(layout.screenDeckTop).toBe(440);
    expect(layout.screenScale).toBe(layout.scale);
    expect(layout.laneMask).toBeNull();
  });

  it('레인 폭 250이면 레인 영역(렌더러 x 653.6부터 400)을 덱 위끝(렌더러 687.5)부터 화면 아래 960까지 덮는 불투명 마스크를 프레임 아래에 둔다', () => {
    const layout = computeFrameFitLayout('uniform', geometry, stage, 250)!;
    expect(layout.laneMask).not.toBeNull();
    const mask = layout.laneMask!;
    expect(mask.x).toBeCloseTo((1067 * 1.6 - 400) / 2, 9);
    expect(mask.width).toBe(400);
    expect(mask.y).toBeCloseTo(429.71 * 1.6, 1);
    expect(mask.y + mask.height).toBeCloseTo(960, 9);
    expect(mask.color).toBe(0x04060c);
  });

  it('가로세로 같이 줄이기 설명은 최소 폭에서 레인 폭 225.9(현재의 56.5%)·화면 0.565배·잘리는 행 없음을, 250에서 덱 위끝 429.7과 위 141행 잘림을 말한다', () => {
    const atMinimum = describeFrameFit(computeFrameFitLayout('uniform', geometry, stage, minimum)!, geometry);
    expect(atMinimum).toContain('225.9');
    expect(atMinimum).toContain('56.5%');
    expect(atMinimum).toContain('0.565배');
    expect(atMinimum).toContain('잘리는 행이 없');
    const at250 = describeFrameFit(computeFrameFitLayout('uniform', geometry, stage, 250)!, geometry);
    expect(at250).toContain('429.7');
    expect(at250).toContain('141행');
  });
});

describe('classicFrameFit 판정선 높이(게임 Lift %)', () => {
  const at250 = computeFrameFitLayout('uniform', geometry, stage, 250)!;

  it('판정선 높이는 게임 Lift처럼 1% = 6 단위로 0~10%, 기본 4%이고 4%는 "4% (+24)"로 표시한다', () => {
    expect(LIFT_PERCENT_MAX).toBe(10);
    expect(UNIFORM_DEFAULT_LIFT_PERCENT).toBe(4);
    expect(formatLiftPercent(4)).toBe('4% (+24)');
    expect(formatLiftPercent(0)).toBe('0% (+0)');
  });

  it('레인 폭 250에서 판정선 높이 최소값은 2%(판정선 아래끝 428 + 1.25 ≤ 덱 위끝 429.7), 1%(434)면 덱에 가려진다', () => {
    expect(minUniformLiftPercent(at250, stage)).toBe(2);
    expect(uniformJudgment(at250, stage, 1).covered).toBe(true);
    expect(uniformJudgment(at250, stage, 2).covered).toBe(false);
  });

  it('레인 폭 270이면 최소 판정선 높이는 5%(덱 위끝 416.1, 4%의 판정선 아래끝 416 + 1.35가 덱에 걸린다)', () => {
    const at270 = computeFrameFitLayout('uniform', geometry, stage, 270)!;
    expect(at270.screenDeckTop).toBeCloseTo(416.09, 2);
    expect(minUniformLiftPercent(at270, stage)).toBe(5);
    expect(uniformJudgment(at270, stage, 4).covered).toBe(true);
    expect(uniformJudgment(at270, stage, 5).covered).toBe(false);
  });

  it('판정선 높이 4%면 판정선 y 416, 덱과의 틈 13.7(화면 노트 두께 12.5의 1.1배), 줌 렌더러에는 lift 38.4를 건다', () => {
    const judgment = uniformJudgment(at250, stage, 4);
    expect(judgment.lineY).toBe(416);
    expect(judgment.gap).toBeCloseTo(13.71, 2);
    expect(judgment.noteThickness).toBeCloseTo(12.5, 9);
    expect(judgment.gapNotes).toBeCloseTo(1.097, 3);
    expect(judgment.rendererLift).toBeCloseTo(38.4, 9);
  });

  it('판정선 높이를 2%·4%·8%로 바꾸면 판정선은 428·416·392로 움직이고 프레임 위끝 −63.9·덱 위끝 429.7은 그대로', () => {
    expect([2, 4, 8].map((percent) => uniformJudgment(at250, stage, percent).lineY)).toEqual([428, 416, 392]);
    expect([2, 4, 8].map((percent) => uniformJudgment(at250, stage, percent).deckTopY)).toEqual([at250.screenDeckTop, at250.screenDeckTop, at250.screenDeckTop]);
    expect(at250.screenFrameTop).toBeCloseTo(-63.95, 2);
  });

  it('레인 폭 300(덱 위끝 395.7)에서는 최소 8%라 3%를 골라도 8%로 올리고, 최소 폭 225.9(덱 446.1)에서는 0%부터 고를 수 있다', () => {
    const at300 = computeFrameFitLayout('uniform', geometry, stage, 300)!;
    expect(minUniformLiftPercent(at300, stage)).toBe(8);
    expect(clampUniformLiftPercent(3, 8)).toBe(8);
    const atMinimum = computeFrameFitLayout('uniform', geometry, stage, (600 * 552) / 1466)!;
    expect(minUniformLiftPercent(atMinimum, stage)).toBe(0);
  });

  it('레인 폭 400(덱 위끝 327.5)이면 최대 10%(판정선 380)로도 덱에 가려진다', () => {
    const at400 = computeFrameFitLayout('uniform', geometry, stage, 400)!;
    expect(minUniformLiftPercent(at400, stage)).toBe(10);
    expect(uniformJudgment(at400, stage, 10).covered).toBe(true);
  });

  it('판정선 높이 12%는 10%로, 2.6%는 3%로, NaN은 기본 4%(최소보다 낮으면 최소)로 맞춘다', () => {
    expect(clampUniformLiftPercent(12, 2)).toBe(10);
    expect(clampUniformLiftPercent(2.6, 2)).toBe(3);
    expect(clampUniformLiftPercent(Number.NaN, 2)).toBe(4);
    expect(clampUniformLiftPercent(Number.NaN, 6)).toBe(6);
  });
});

describe('classicFrameFit 전체화면 논리 폭(PlayScreen과 같은 규칙)', () => {
  it('16:9 화면(1920×1080)이면 논리 폭 1067', () => {
    expect(fullscreenLogicalWidth(1920, 1080)).toBe(1067);
  });

  it('21:9 화면(2520×1080)이면 논리 폭 1400', () => {
    expect(fullscreenLogicalWidth(2520, 1080)).toBe(1400);
  });

  it('폰 가로(844×390)면 논리 폭 1298로 비행 배경이 더 넓게 보인다', () => {
    expect(fullscreenLogicalWidth(844, 390)).toBe(1298);
  });

  it('세로 화면(390×844)이면 600 × 비율(277)이 레인 영역 + 80보다 좁아 최소 폭 480', () => {
    expect(fullscreenLogicalWidth(390, 844)).toBe(480);
  });

  it('크기가 0이거나 숫자가 아니면 기본 16:9 폭 1067', () => {
    expect(fullscreenLogicalWidth(0, 0)).toBe(FRAME_FIT_STAGE_WIDTH);
    expect(fullscreenLogicalWidth(Number.NaN, 600)).toBe(FRAME_FIT_STAGE_WIDTH);
  });

  it('가로세로 같이 줄이기 줌 1.6(레인 폭 250)이면 렌더러 폭은 논리 폭 1400 × 1.6 = 2240', () => {
    const zoom = computeFrameFitZoom(250, createFrameFitStage(1400), 1080, 800);
    expect(zoom.zoom).toBeCloseTo(1.6, 10);
    expect(zoom.width).toBeCloseTo(2240, 9);
    expect(zoom.height).toBeCloseTo(960, 9);
  });
});

describe('classicFrameFit 움직임 레이어를 얹는 방식', () => {
  it('레인 폭 맞춤·가로세로 같이 줄이기(한 장)에만 얹고 기둥 잘라 줄이기·세로로 눌러 맞추기(두 조각)·현재 게임 기어에는 얹지 않는다', () => {
    expect(FRAME_MOTION_FIT_MODES).toEqual(['crop', 'uniform']);
    expect(['crop', 'cut', 'squash', 'uniform', 'current'].map((mode) => supportsFrameMotion(mode as never))).toEqual([true, false, false, true, false]);
  });
});

describe('classicFrameFit 보이는 부분', () => {
  it('crop 모드(위 483행 잘림·1310행까지)에서는 갑옷 꼭대기·게이지 위끝(196행)·하단 바가 모두 화면 밖', () => {
    const parts = listFrameParts(computeFrameFitLayout('crop', geometry, stage)!, geometry);
    expect(parts.map((part) => [part.name, part.visibility])).toEqual([
      ['갑옷 꼭대기', 'hidden'],
      ['게이지 위끝', 'hidden'],
      ['하단 바', 'hidden'],
    ]);
  });

  it('가로세로 같이 줄이기 최소 폭 225.9에서는 갑옷 꼭대기(16~195행)·게이지 위끝·하단 바(1367~1399행)가 모두 보인다', () => {
    const parts = listFrameParts(computeFrameFitLayout('uniform', geometry, stage, (600 * 552) / 1466)!, geometry);
    expect(parts.map((part) => part.visibility)).toEqual(['visible', 'visible', 'visible']);
    expect(parts[0].rows).toEqual([16, 195]);
    expect(parts[2].rows).toEqual([1367, 1399]);
  });

  it('레인 폭 250(위 141행 잘림)에서는 꼭대기 일부·게이지 위끝·하단 바가 보이고, 300(362행 잘림)에서는 꼭대기·게이지 위끝이 숨는다', () => {
    expect(describeFrameParts(listFrameParts(computeFrameFitLayout('uniform', geometry, stage, 250)!, geometry)))
      .toBe('갑옷 꼭대기 일부 · 게이지 위끝 보임 · 하단 바 보임');
    expect(describeFrameParts(listFrameParts(computeFrameFitLayout('uniform', geometry, stage, 300)!, geometry)))
      .toBe('갑옷 꼭대기 숨음 · 게이지 위끝 숨음 · 하단 바 보임');
  });

  it('cut 모드는 위끝이 화면 위에 붙어 꼭대기와 게이지 위끝이 보이고 하단 바는 화면 밖', () => {
    const parts = listFrameParts(computeFrameFitLayout('cut', geometry, stage)!, geometry);
    expect(describeFrameParts(parts)).toBe('갑옷 꼭대기 보임 · 게이지 위끝 보임 · 하단 바 숨음');
  });
});
