import type { CubicBezier } from './classicFrameMotionTiming';

/**
 * Classic 프레임 움직임의 자료 계약(Pixi 없음). prepare-frame-motion-v21.mjs가 만든 frame-motion.json의 모양,
 * 레이어 이름, 공개 경로와 읽기를 둔다. Pixi 레이어 구성은 classicFrameMotion.ts가 한다.
 */

export const FRAME_MOTION_LAYERS = ['armor', 'gauge', 'accent', 'bar'] as const;
export type FrameMotionLayer = (typeof FRAME_MOTION_LAYERS)[number];

/** 승인된 SVG 시연 페이지(ambient-motion.html)와 같은 이름. */
export const FRAME_MOTION_LAYER_LABELS: Record<FrameMotionLayer, string> = {
  armor: 'A 큰 광원',
  gauge: 'B 게이지 액체',
  accent: 'C 발광선 호흡',
  bar: 'D 하단 바 흐름',
};

/** 레이어별 켜기·끄기. 무대와 비교 화면이 같은 값을 쓴다. */
export type FrameMotionLayerVisibility = Record<FrameMotionLayer, boolean>;

export const ALL_FRAME_MOTION_LAYERS_ON: Readonly<FrameMotionLayerVisibility> = Object.freeze({ armor: true, gauge: true, accent: true, bar: true });

export const FRAME_MOTION_TEXTURE_KEYS = [
  'armorLit', 'armorCore', 'armorShape', 'accentGlow', 'accentOverlap', 'liquidTile', 'barMask', 'barBase', 'glint', 'bubbles',
] as const;
export type FrameMotionTextureKey = (typeof FRAME_MOTION_TEXTURE_KEYS)[number];

/** 텍스처 안의 한 조각: 아틀라스 상자(atlasX, atlasY, width, height)를 프레임 좌표 (x, y)에 그린다(움직임 0일 때). */
export interface FrameMotionPiece {
  x: number;
  y: number;
  width: number;
  height: number;
  atlasX: number;
  atlasY: number;
}

/**
 * 텍스처 파일 하나. 장갑·발광선처럼 기둥 사이가 빈 레이어는 왼쪽 기둥·오른쪽 기둥·아래 띠 조각으로 나눠
 * 빈 곳을 그리지 않는다. 조각마다 실제 이웃 픽셀 16px 테두리가 아틀라스에 있어 경계에서도 한 장처럼 걸러진다.
 */
export interface FrameMotionTextureBox {
  file: string;
  width: number;
  height: number;
  pieces: FrameMotionPiece[];
}

export interface FrameMotionData {
  frame: { width: number; height: number };
  textures: Record<FrameMotionTextureKey, FrameMotionTextureBox>;
  /** A: 띠 중심(pivotX, y)이 fromY→toY로 periodMs마다 한 번. 띠 사각형은 bandX부터 bandWidth, tiltDeg 회전. */
  light: {
    periodMs: number; fromY: number; toY: number; tiltDeg: number; pivotX: number; bandX: number; bandWidth: number;
    outerHeight: number; coreHeight: number; halfAlpha: number;
  };
  contrast: { saturation: number; slope: number; intercept: number; unlitDim: number; unlitColor: string; whiteGlow: number };
  gauge: {
    mirrorSum: number;
    /** 유리 안쪽 윤곽 다각형(왼쪽, 오른쪽 반전). */
    glass: [number, number][][];
    liquid: { x: number; width: number; tileHeight: number; periodMs: number; opacity: number };
    rise: { startY: number; distance: number; fadeInPercent: number; fadeOutPercent: number; opacity: number; color: string };
    bubbleCell: number;
    bubbles: { x: number; r: number; durationMs: number; delayMs: number }[];
  };
  accent: { periodMs: number; peakPercent: number; opacity: number; easing: CubicBezier; bloomStdDeviation: number };
  bar: {
    periodMs: number; travel: number; peakPercent: number; stopPercent: number; easing: CubicBezier;
    glint: { cx: number; cy: number; rx: number; ry: number };
  };
}

/** prepare-frame-motion-v21.mjs가 만드는 정적 파일. 페이지는 withLabPublicBase로 감싸 읽는다. */
export const FRAME_MOTION_ASSET_DIR = '/lab/classic-frame-fit/motion';
export const FRAME_MOTION_DATA_PATH = `${FRAME_MOTION_ASSET_DIR}/frame-motion.json`;
/** 비교 기준인 승인된 애니메이션 SVG(이미지 갤러리). */
export const FRAME_MOTION_SVG_PATH = '/lab/images/frame-keywords-six-20260929/54-ambient-motion-v19.svg';

export interface FrameMotionAssets {
  data: FrameMotionData;
  images: Record<FrameMotionTextureKey, HTMLImageElement>;
}

/** frame-motion.json과 텍스처 PNG를 모두 받아 디코드한다. resolveUrl은 공개 경로에 배포 base를 붙인다. */
export async function loadFrameMotionAssets(resolveUrl: (path: string) => string): Promise<FrameMotionAssets> {
  const response = await fetch(resolveUrl(FRAME_MOTION_DATA_PATH));
  if (!response.ok) throw new Error(`frame-motion.json을 불러오지 못했습니다 (${response.status}).`);
  const data = parseFrameMotionData(await response.json());
  const entries = await Promise.all(FRAME_MOTION_TEXTURE_KEYS.map(async (key) => {
    const image = new Image();
    image.src = resolveUrl(`${FRAME_MOTION_ASSET_DIR}/${data.textures[key].file}`);
    await image.decode();
    return [key, image] as const;
  }));
  return { data, images: Object.fromEntries(entries) as Record<FrameMotionTextureKey, HTMLImageElement> };
}

export interface FrameViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 승인된 SVG 시연 페이지와 같은 보기(전체·왼쪽 장갑·하단). */
export const FRAME_MOTION_VIEWS = {
  full: { label: '전체', viewBox: { x: 0, y: 0, width: 1024, height: 1536 } },
  left: { label: '왼쪽 장갑', viewBox: { x: 0, y: 420, width: 320, height: 480 } },
  bottom: { label: '하단', viewBox: { x: 300, y: 1240, width: 424, height: 212 } },
} as const satisfies Record<string, { label: string; viewBox: FrameViewBox }>;
export type FrameMotionView = keyof typeof FRAME_MOTION_VIEWS;

export function formatViewBox(box: FrameViewBox): string {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

/** viewBox를 width×height 화면에 맞추는 프레임 루트 변환(가로세로 같은 배율, SVG의 meet과 같음). */
export function viewBoxTransform(box: FrameViewBox, width: number, height: number) {
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

type JsonRecord = Record<string, unknown>;

function record(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`frame-motion.json의 ${path}가 객체가 아닙니다.`);
  return value as JsonRecord;
}

function numbers<K extends string>(value: unknown, path: string, keys: readonly K[]): Record<K, number> {
  const source = record(value, path);
  const out = {} as Record<K, number>;
  for (const key of keys) {
    const entry = source[key];
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new Error(`frame-motion.json의 ${path}.${key}가 숫자가 아닙니다.`);
    out[key] = entry;
  }
  return out;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`frame-motion.json의 ${path}가 문자열이 아닙니다.`);
  return value;
}

function easing(value: unknown, path: string): CubicBezier {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    throw new Error(`frame-motion.json의 ${path}가 cubic-bezier 숫자 4개가 아닙니다.`);
  }
  return value as unknown as CubicBezier;
}

function polygon(value: unknown, path: string): [number, number][] {
  if (!Array.isArray(value) || value.length < 3 || !value.every((point) => (
    Array.isArray(point) && point.length === 2 && point.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  ))) {
    throw new Error(`frame-motion.json의 ${path}가 점 3개 이상의 다각형이 아닙니다.`);
  }
  return value as [number, number][];
}

/** prepare-frame-motion-v21.mjs가 만든 frame-motion.json을 읽어 모듈이 쓰는 값이 모두 있는지 확인한다. */
export function parseFrameMotionData(value: unknown): FrameMotionData {
  const root = record(value, '최상위');
  const texturesRecord = record(root.textures, 'textures');
  const textures = {} as Record<FrameMotionTextureKey, FrameMotionTextureBox>;
  for (const key of FRAME_MOTION_TEXTURE_KEYS) {
    const path = `textures.${key}`;
    const entry = record(texturesRecord[key], path);
    const size = numbers(entry, path, ['width', 'height'] as const);
    const pieceList = entry.pieces;
    if (!Array.isArray(pieceList) || pieceList.length === 0) throw new Error(`frame-motion.json의 ${path}.pieces가 비어 있습니다.`);
    const pieces = pieceList.map((piece, index) => {
      const box = numbers(piece, `${path}.pieces[${index}]`, ['x', 'y', 'width', 'height', 'atlasX', 'atlasY'] as const);
      const inside = box.width > 0 && box.height > 0 && box.atlasX >= 0 && box.atlasY >= 0
        && box.atlasX + box.width <= size.width && box.atlasY + box.height <= size.height;
      if (!inside) throw new Error(`frame-motion.json의 ${path}.pieces[${index}]가 텍스처(${size.width}×${size.height}) 밖입니다.`);
      return box;
    });
    textures[key] = { file: text(entry.file, `${path}.file`), ...size, pieces };
  }
  const contrastRecord = record(root.contrast, 'contrast');
  const gaugeRecord = record(root.gauge, 'gauge');
  const riseRecord = record(gaugeRecord.rise, 'gauge.rise');
  const glassList = gaugeRecord.glass;
  if (!Array.isArray(glassList) || glassList.length === 0) throw new Error('frame-motion.json의 gauge.glass가 다각형 목록이 아닙니다.');
  const bubbleList = gaugeRecord.bubbles;
  if (!Array.isArray(bubbleList) || bubbleList.length === 0) throw new Error('frame-motion.json의 gauge.bubbles가 비어 있습니다.');
  const accentRecord = record(root.accent, 'accent');
  const barRecord = record(root.bar, 'bar');
  const data: FrameMotionData = {
    frame: numbers(root.frame, 'frame', ['width', 'height'] as const),
    textures,
    light: numbers(root.light, 'light', [
      'periodMs', 'fromY', 'toY', 'tiltDeg', 'pivotX', 'bandX', 'bandWidth', 'outerHeight', 'coreHeight', 'halfAlpha',
    ] as const),
    contrast: {
      ...numbers(contrastRecord, 'contrast', ['saturation', 'slope', 'intercept', 'unlitDim', 'whiteGlow'] as const),
      unlitColor: text(contrastRecord.unlitColor, 'contrast.unlitColor'),
    },
    gauge: {
      ...numbers(gaugeRecord, 'gauge', ['mirrorSum', 'bubbleCell'] as const),
      glass: glassList.map((entry, index) => polygon(entry, `gauge.glass[${index}]`)),
      liquid: numbers(gaugeRecord.liquid, 'gauge.liquid', ['x', 'width', 'tileHeight', 'periodMs', 'opacity'] as const),
      rise: {
        ...numbers(riseRecord, 'gauge.rise', ['startY', 'distance', 'fadeInPercent', 'fadeOutPercent', 'opacity'] as const),
        color: text(riseRecord.color, 'gauge.rise.color'),
      },
      bubbles: bubbleList.map((entry, index) => numbers(entry, `gauge.bubbles[${index}]`, ['x', 'r', 'durationMs', 'delayMs'] as const)),
    },
    accent: {
      ...numbers(accentRecord, 'accent', ['periodMs', 'peakPercent', 'opacity', 'bloomStdDeviation'] as const),
      easing: easing(accentRecord.easing, 'accent.easing'),
    },
    bar: {
      ...numbers(barRecord, 'bar', ['periodMs', 'travel', 'peakPercent', 'stopPercent'] as const),
      easing: easing(barRecord.easing, 'bar.easing'),
      glint: numbers(barRecord.glint, 'bar.glint', ['cx', 'cy', 'rx', 'ry'] as const),
    },
  };
  if (!(data.light.periodMs > 0 && data.gauge.liquid.periodMs > 0 && data.accent.periodMs > 0 && data.bar.periodMs > 0)) {
    throw new Error('frame-motion.json의 주기(periodMs)는 0보다 커야 합니다.');
  }
  return data;
}
