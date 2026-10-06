/**
 * Gear의 Pixi ↔ 승인 SVG 비교에만 쓰는 값(Pixi 없음). 승인 SVG 경로와 비교 보기(viewBox), SVG에서 바탕 그림을 꺼내는
 * 도우미를 둔다. 움직임 자료 계약과 레이어 구성은 게임 모듈(src/game/renderer/gearMotion*)에 있다.
 */

/** 비교 기준인 승인된 애니메이션 SVG(이미지 갤러리). 페이지는 withLabPublicBase로 감싸 읽는다. */
export const GEAR_MOTION_SVG_PATH = '/lab/images/frame-keywords-six-20260929/54-ambient-motion-v19.svg';

export interface GearViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 승인된 SVG 시연 페이지와 같은 보기(전체·왼쪽 장갑·하단). */
export const GEAR_MOTION_VIEWS = {
  full: { label: '전체', viewBox: { x: 0, y: 0, width: 1024, height: 1536 } },
  left: { label: '왼쪽 장갑', viewBox: { x: 0, y: 420, width: 320, height: 480 } },
  bottom: { label: '하단', viewBox: { x: 300, y: 1240, width: 424, height: 212 } },
} as const satisfies Record<string, { label: string; viewBox: GearViewBox }>;
export type GearMotionView = keyof typeof GEAR_MOTION_VIEWS;

export function formatViewBox(box: GearViewBox): string {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

/** viewBox를 width×height 화면에 맞추는 기어 루트 변환(가로세로 같은 배율, SVG의 meet과 같음). */
export function viewBoxTransform(box: GearViewBox, width: number, height: number) {
  const scale = Math.min(width / box.width, height / box.height);
  return {
    scale,
    x: (width - box.width * scale) / 2 - box.x * scale,
    y: (height - box.height * scale) / 2 - box.y * scale,
  };
}

/** SVG 문서에서 바탕 그림(#fm-base)의 data URL을 꺼낸다. 비교 화면이 SVG와 같은 바탕 픽셀을 쓰게 한다. */
export function readSvgBaseHref(svg: ParentNode): string {
  const href = svg.querySelector('#fm-base')?.getAttribute('href');
  if (!href) throw new Error('SVG에서 바탕 그림(#fm-base)을 찾지 못했습니다.');
  return href;
}
