/**
 * 새 Classic 기어(스킨 공통 `gearImage`, public/gear/classic-gear.png)의 배치([RFD 0029](../../../docs/rfd/0029-frame-aspect-fit-narrow-lanes.md)).
 *
 * 기어는 그림 한 장을 비율 그대로 줄여 그림 속 레인 창을 게임 레인 영역에 정확히 겹치고, 실루엣 아래끝을 화면 아래에 붙인다.
 * 리프트와 무관하게 고정이며, 레인 가림막은 키 윗면(열린 덱 바닥 바로 아래)부터 덮는다.
 * 측정값의 원본은 `classicGear.json` 하나다. 생성기 `prepare-frame-fit-v20.mjs`가 그림과 함께 만들고 Lab도 이 파일을 읽는다.
 */

import type { TextureSourceOptions } from 'pixi.js';
import gearJson from './classicGear.json';
import { GAME_HEIGHT, LANE_AREA_WIDTH } from './constants';

/** 게임이 기어를 배치하는 데 쓰는 측정값. 모두 원본 그림의 픽셀 행·열 번호(포함)다. */
export interface ClassicGearGeometry {
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
  /**
   * 기어 실루엣의 마지막 행. 아래 가장자리(silhouetteBottom + 1)를 화면 아래에 붙인다.
   * 측정 자료(classicGear.json)의 키는 생성기 prepare-frame-fit-v20.mjs가 쓰는 이름 그대로 `frameBottom`이다(산출물 바이트를 바꾸지 않으려고 둔다).
   */
  silhouetteBottom: number;
}

export const CLASSIC_GEAR_GEOMETRY: ClassicGearGeometry = {
  width: gearJson.width,
  height: gearJson.height,
  laneLeft: gearJson.laneLeft,
  laneRight: gearJson.laneRight,
  deckTop: gearJson.deckTop,
  laneOpeningBottom: gearJson.laneOpeningBottom,
  silhouetteLeft: gearJson.silhouetteLeft,
  silhouetteRight: gearJson.silhouetteRight,
  silhouetteBottom: gearJson.frameBottom,
};

/**
 * 기어 텍스처 설정. 그림은 렌더 높이 1080에서 화면 약 0.82배, 720에서 0.54배로 줄여 그려지므로 업로드할 때 밉맵을 만들고
 * 확대·축소·밉맵 사이를 모두 선형으로 거른다(WebGL2 삼선형). 그렇지 않으면 줄인 테두리에 계단과 반짝임이 생긴다.
 */
export const CLASSIC_GEAR_TEXTURE_OPTIONS = {
  autoGenerateMipmaps: true,
  scaleMode: 'linear',
} as const satisfies Partial<TextureSourceOptions>;

/** 기어 실루엣과 화면 가장자리·키보드 표시 사이에 두는 여백(논리 단위). */
export const GEAR_CLEARANCE = 8;

export interface ClassicGearStage {
  laneAreaX: number;
  laneAreaWidth: number;
  /** 플레이 영역 높이(600). 기어 아래끝이 여기에 붙는다. */
  height: number;
}

/** 기어 그림의 논리 좌표 배치. 그림 좌표 (px, py)는 화면 (x + px·scale, y + py·scale)에 그려진다. */
export interface ClassicGearLayout {
  /** 원본 1px → 논리 단위(레인 영역 폭 ÷ 레인 창 폭). */
  scale: number;
  /** 그림 왼쪽 위의 논리 좌표. y가 음수인 만큼 위쪽이 화면 밖으로 잘린다. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 덱 첫 행의 위 가장자리. 판정선은 선 두께까지 이보다 위에 있어야 기둥 모서리에 가리지 않는다. */
  deckTopY: number;
  /** 키 윗면 테두리(laneOpeningBottom + 1행 위 가장자리). 레인 가림막이 여기서 시작한다. */
  keyRimY: number;
  /** 실루엣 왼쪽·오른쪽 가장자리의 논리 x. */
  silhouetteLeftX: number;
  silhouetteRightX: number;
}

export function layoutClassicGear(geometry: ClassicGearGeometry, stage: ClassicGearStage): ClassicGearLayout {
  const scale = stage.laneAreaWidth / (geometry.laneRight - geometry.laneLeft + 1);
  const x = stage.laneAreaX - geometry.laneLeft * scale;
  const y = stage.height - (geometry.silhouetteBottom + 1) * scale;
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
  geometry: ClassicGearGeometry = CLASSIC_GEAR_GEOMETRY,
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
