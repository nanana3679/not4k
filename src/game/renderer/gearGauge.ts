import { type GearLightBox, clampLightHeight, getVisibleLightBox } from "../../lab/gearLight";
import gearGaugeMetadata from "./gearGaugeMetadata.json";

/**
 * 기어 기둥 게이지 — 분리된 게이지 텍스처의 클리핑/배치 계산
 *
 * 좌표계 3종:
 * - 원본: gear.png(3404×4704) 픽셀. GEAR_INNER_* 상수와 metadata columnBoxes가 이 좌표계
 * - 텍스처: scripts/split-gear-gauge.mjs가 outputScale로 다운스케일한 출력 픽셀
 * - 화면: srcScale(원본픽셀→화면 배율)을 거친 Pixi stage 좌표
 */

export interface GearGaugeMetadata {
  source: string;
  sourceWidth: number;
  sourceHeight: number;
  outputScale: number;
  columnBoxes: {
    left: GearLightBox;
    right: GearLightBox;
  };
}

export const GEAR_GAUGE_METADATA: GearGaugeMetadata = gearGaugeMetadata;

export interface GaugeTextureFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 보이는 높이가 1px 미만이면 false */
  visible: boolean;
}

/**
 * 게이지 값(0~1)에 따라 텍스처에서 보일 영역을 계산한다.
 * 아래 기준(anchor 하단)으로 줄어들며, y/height는 정수로 반올림한다.
 * Pixi가 0 크기 frame을 허용하지 않으므로 height는 최소 1로 클램프하고
 * 대신 visible로 표시 여부를 알린다.
 */
export function getGaugeTextureFrame(
  textureSize: { width: number; height: number },
  gaugeValue: number,
): GaugeTextureFrame {
  const box = getVisibleLightBox(
    { x: 0, y: 0, width: textureSize.width, height: textureSize.height },
    clampLightHeight(gaugeValue),
  );
  const visibleHeight = Math.round(box.height);
  const height = Math.max(1, visibleHeight);
  return {
    x: 0,
    y: Math.min(Math.round(box.y), textureSize.height - height),
    width: textureSize.width,
    height,
    visible: visibleHeight >= 1,
  };
}

export interface GaugeSpritePlacement {
  x: number;
  y: number;
  scale: number;
}

/**
 * 게이지 스프라이트의 화면 배치를 계산한다 (anchor (0,1) = 좌하단 기준).
 *
 * @param box 원본 좌표계 columnBox
 * @param srcScale 원본 픽셀→화면 배율 (기어 프레임과 동일)
 * @param frameX 기어 프레임 원본 (0,0)의 화면 x
 * @param frameY 기어 프레임 원본 (0,0)의 화면 y
 * @param outputScale 텍스처 다운스케일 배율 (metadata.outputScale)
 */
export function getGaugeSpritePlacement(
  box: GearLightBox,
  srcScale: number,
  frameX: number,
  frameY: number,
  outputScale: number,
): GaugeSpritePlacement {
  return {
    x: frameX + box.x * srcScale,
    y: frameY + (box.y + box.height) * srcScale,
    scale: srcScale / outputScale,
  };
}
