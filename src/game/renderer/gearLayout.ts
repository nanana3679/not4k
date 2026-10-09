/**
 * 새 기어(스킨 공통 `gearImage`, public/gear/gear.png)의 배치([RFD 0029](../../../docs/rfd/0029-frame-aspect-fit-narrow-lanes.md)).
 *
 * 기어는 그림 한 장을 비율 그대로 줄여 그림 속 레인 창을 게임 레인 영역에 정확히 겹치고, 실루엣 아래끝을 화면 아래에 붙인다
 * (`GearStage.drop`을 주면 그만큼 아래로 내려 아래쪽이 화면 밖으로 잘린다).
 * 리프트와 무관하게 고정이며, 레인은 키 윗면(열린 덱 바닥 바로 아래)에서 끝난다(렌더러의 레인 끝 `laneEndY`).
 * 측정값의 원본은 `gearGeometry.json` 하나다. 생성기 `prepare-frame-fit-v20.mjs`가 그림(기어·고도 게이지 빈 유리)과 함께 만들고 Lab도 이 파일을 읽는다.
 */

import type { TextureSourceOptions } from 'pixi.js';
import gearJson from './gearGeometry.json';
import { GAME_HEIGHT, LANE_AREA_WIDTH } from './constants';

/** 게임이 기어를 배치하는 데 쓰는 측정값. 모두 원본 그림의 픽셀 행·열 번호(포함)다. */
export interface GearGeometry {
  width: number;
  height: number;
  /** 기둥 안쪽 윤곽선 바로 안의 첫/마지막 열. 이 사이(552px)가 레인 창이다. */
  laneLeft: number;
  laneRight: number;
  /** 덱 첫 행. 여기부터 기둥 받침 모서리가 안쪽으로 꺾인다. */
  deckTop: number;
  /** 꺾인 모서리 사이로 뚫린 레인 바닥의 마지막 행. 다음 행이 키 윗면 테두리다. */
  laneOpeningBottom: number;
  /** 기어 실루엣의 첫/마지막 열. */
  silhouetteLeft: number;
  silhouetteRight: number;
  /** 기어 실루엣의 마지막 행. 아래 가장자리(silhouetteBottom + 1)를 화면 아래에 붙인다. */
  silhouetteBottom: number;
  /** 양옆 유리관 고도 게이지(빈 유리 아틀라스 `gearGaugeEmpty`)의 자리. */
  gauge: GearGaugeGeometry;
}

/** 유리관 하나의 유리 안쪽 상자(기어 그림 좌표, 포함)와 빈 유리 아틀라스에서 같은 상자의 왼쪽 위. */
export interface GearGaugeTube {
  x: number;
  y: number;
  width: number;
  height: number;
  atlasX: number;
  atlasY: number;
}

/**
 * 고도 게이지 측정값. 유리 안쪽 윤곽은 승인 시연과 `gearMotion`(기어 위 장식 애니메이션)의 유리 마스크와 같은 하나(frame-motion-shared.mjs의 GLASS)이고,
 * 생성기가 그 윤곽으로 v18 빈 유리를 잘라 아틀라스(atlasWidth×atlasHeight)에 담는다.
 */
export interface GearGaugeGeometry {
  atlasWidth: number;
  atlasHeight: number;
  /** 채움 구간: fillTop행부터 fillRows행(유리 안쪽 위끝 ~ 아래끝). 0이면 전부 빈 유리, 1이면 그림 그대로. */
  fillTop: number;
  fillRows: number;
  /** 왼쪽 유리관 안쪽 윤곽: 곧은 옆벽 x0~x1, 위·아래 끝은 [옆벽 행, 가운데 행] 타원, 경계 feather px. 오른쪽은 x′ = mirrorSum − x. */
  glass: { x0: number; x1: number; top: readonly [number, number]; bottom: readonly [number, number]; feather: number; mirrorSum: number };
  /** [왼쪽, 오른쪽] 유리관. 두 유리관은 같은 값을 보여 준다. */
  tubes: readonly [GearGaugeTube, GearGaugeTube];
}

const gaugeJson = gearJson.gauge;

export const GEAR_GEOMETRY: GearGeometry = {
  width: gearJson.width,
  height: gearJson.height,
  laneLeft: gearJson.laneLeft,
  laneRight: gearJson.laneRight,
  deckTop: gearJson.deckTop,
  laneOpeningBottom: gearJson.laneOpeningBottom,
  silhouetteLeft: gearJson.silhouetteLeft,
  silhouetteRight: gearJson.silhouetteRight,
  silhouetteBottom: gearJson.silhouetteBottom,
  gauge: {
    atlasWidth: gaugeJson.width,
    atlasHeight: gaugeJson.height,
    fillTop: gaugeJson.fillTop,
    fillRows: gaugeJson.fillRows,
    glass: {
      x0: gaugeJson.glass.x0,
      x1: gaugeJson.glass.x1,
      top: [gaugeJson.glass.top[0], gaugeJson.glass.top[1]],
      bottom: [gaugeJson.glass.bottom[0], gaugeJson.glass.bottom[1]],
      feather: gaugeJson.glass.feather,
      mirrorSum: gaugeJson.glass.mirrorSum,
    },
    tubes: [gaugeJson.tubes[0], gaugeJson.tubes[1]],
  },
};

/**
 * 기어 텍스처 설정. 그림은 렌더 높이 1080에서 화면 약 0.82배, 720에서 0.54배로 줄여 그려지므로 업로드할 때 밉맵을 만들고
 * 확대·축소·밉맵 사이를 모두 선형으로 거른다(WebGL2 삼선형). 그렇지 않으면 줄인 테두리에 계단과 반짝임이 생긴다.
 * 기어 위에 같은 배율로 겹치는 고도 게이지 빈 유리(`gearGaugeEmpty`)와 `gearMotion` 텍스처도 같은 설정으로 읽는다.
 */
export const GEAR_TEXTURE_OPTIONS = {
  autoGenerateMipmaps: true,
  scaleMode: 'linear',
} as const satisfies Partial<TextureSourceOptions>;

/** 기어 실루엣과 화면 가장자리·키보드 표시 사이에 두는 여백(논리 단위). */
export const GEAR_CLEARANCE = 8;

export interface GearStage {
  laneAreaX: number;
  laneAreaWidth: number;
  /** 플레이 영역 높이(600). 기어 아래끝이 여기에 붙는다. */
  height: number;
  /**
   * 기어를 아래로 내리는 양(논리 px, 기본 0, 음수·NaN은 0). 실루엣 아래끝이 화면 아래보다 이만큼 아래에 와서
   * 기어 아래쪽 원본 drop ÷ scale 행이 화면 밖으로 잘린다. 렌더러 옵션 `gearDrop`([#257](https://github.com/nanana3679/not4k/issues/257))이 넘긴다.
   */
  drop?: number;
}

/** 기어 내리기 양을 0 이상의 유한한 값으로 맞춘다(음수·NaN·Infinity → 0). 위쪽 한계는 두지 않는다. */
export function clampGearDrop(drop: number | undefined): number {
  return drop !== undefined && Number.isFinite(drop) ? Math.max(0, drop) : 0;
}

/** 기어 그림의 논리 좌표 배치. 그림 좌표 (px, py)는 화면 (x + px·scale, y + py·scale)에 그려진다. */
export interface GearLayout {
  /** 원본 1px → 논리 단위(레인 영역 폭 ÷ 레인 창 폭). */
  scale: number;
  /** 그림 왼쪽 위의 논리 좌표. y가 음수인 만큼 위쪽이 화면 밖으로 잘린다. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 덱 첫 행의 위 가장자리. 판정선은 선 두께까지 이보다 위에 있어야 기둥 모서리에 가리지 않는다. */
  deckTopY: number;
  /** 키 윗면 테두리(laneOpeningBottom + 1행 위 가장자리). 레인이 여기서 끝난다(렌더러의 레인 끝 `laneEndY`). */
  keyRimY: number;
  /** 실루엣 왼쪽·오른쪽 가장자리의 논리 x. */
  silhouetteLeftX: number;
  silhouetteRightX: number;
}

export function layoutGear(geometry: GearGeometry, stage: GearStage): GearLayout {
  const scale = stage.laneAreaWidth / (geometry.laneRight - geometry.laneLeft + 1);
  const x = stage.laneAreaX - geometry.laneLeft * scale;
  const y = stage.height - (geometry.silhouetteBottom + 1) * scale + clampGearDrop(stage.drop);
  return {
    scale,
    x,
    y,
    width: geometry.width * scale,
    height: geometry.height * scale,
    deckTopY: y + geometry.deckTop * scale,
    keyRimY: y + (geometry.laneOpeningBottom + 1) * scale,
    silhouetteLeftX: x + geometry.silhouetteLeft * scale,
    silhouetteRightX: x + (geometry.silhouetteRight + 1) * scale,
  };
}

/**
 * 기어 실루엣 전체와 양옆 여백이 들어가는 최소 논리 폭. 레인 창이 실루엣 가운데에 있지 않아도
 * 레인 영역을 화면 가운데에 두므로 더 먼 쪽 끝을 기준으로 잰다.
 */
export function minimumPlayLogicalWidth(
  geometry: GearGeometry = GEAR_GEOMETRY,
  laneAreaWidth: number = LANE_AREA_WIDTH,
): number {
  const scale = laneAreaWidth / (geometry.laneRight - geometry.laneLeft + 1);
  const center = (geometry.laneLeft + geometry.laneRight + 1) / 2;
  const halfWidth = Math.max(center - geometry.silhouetteLeft, geometry.silhouetteRight + 1 - center) * scale;
  return Math.ceil(2 * (halfWidth + GEAR_CLEARANCE));
}

/**
 * 플레이 화면 논리 폭. 높이를 600으로 고정하고 화면 비율을 곱하되 기어 전체가 들어가는 최소 폭보다 좁히지 않는다
 * (16:9 → 1067, 4:3 → 800, 세로 화면 → 466). 크기를 모르면 최소 폭이다.
 */
export function resolvePlayLogicalWidth(viewWidth: number, viewHeight: number): number {
  const minimum = minimumPlayLogicalWidth();
  if (!(viewWidth > 0 && viewHeight > 0)) return minimum;
  return Math.max(Math.round(GAME_HEIGHT * (viewWidth / viewHeight)), minimum);
}
