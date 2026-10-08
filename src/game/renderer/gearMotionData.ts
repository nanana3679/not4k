import type { CubicBezier } from './gearMotionTiming';

/**
 * `gearMotion`(기어 위 장식 애니메이션) 에셋의 데이터 계약(Pixi 없음). prepare-frame-motion-v21.mjs가 만든 gear-motion.json의 모양,
 * 레이어 이름, 공개 경로와 검증을 둔다. Pixi 레이어 구성은 gearMotion.ts, 읽기와 공유는 gearMotionAssets.ts가 한다.
 */

export const GEAR_MOTION_LAYERS = ['armor', 'gauge', 'accent', 'bar'] as const;
export type GearMotionLayer = (typeof GEAR_MOTION_LAYERS)[number];

/** 승인된 SVG 시연 페이지(ambient-motion.html)와 같은 이름. */
export const GEAR_MOTION_LAYER_LABELS: Record<GearMotionLayer, string> = {
  armor: 'A 큰 광원',
  gauge: 'B 게이지 액체',
  accent: 'C 발광선 호흡',
  bar: 'D 하단 바 흐름',
};

/** 레이어별 켜기·끄기. 게임 렌더러의 `gearMotion` 조절(`GearMotionControls`)과 Lab 무대·비교 화면이 같은 값을 쓴다. */
export type GearMotionLayerVisibility = Record<GearMotionLayer, boolean>;

export const ALL_GEAR_MOTION_LAYERS_ON: Readonly<GearMotionLayerVisibility> = Object.freeze({ armor: true, gauge: true, accent: true, bar: true });

export const GEAR_MOTION_TEXTURE_KEYS = [
  'armorLit', 'armorCore', 'accentGlow', 'accentOverlap', 'liquidTile', 'barMask', 'barBase', 'glint', 'bubbles',
] as const;
export type GearMotionTextureKey = (typeof GEAR_MOTION_TEXTURE_KEYS)[number];

/** 텍스처 안의 atlas frame 하나: 원본 영역(atlasX, atlasY, width, height)을 기어 그림 좌표 (x, y)에 그린다(애니메이션 오프셋 0일 때). */
export interface GearMotionPiece {
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
export interface GearMotionTextureBox {
  file: string;
  width: number;
  height: number;
  pieces: GearMotionPiece[];
}

export interface GearMotionData {
  /** 조각을 놓는 기어 그림의 크기(1024×1536). */
  image: { width: number; height: number };
  textures: Record<GearMotionTextureKey, GearMotionTextureBox>;
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

/**
 * prepare-frame-motion-v21.mjs가 만드는 정적 파일(기어 그림 public/gear/gear.png 옆). 게임 렌더러와 Lab이 같은 한 벌을
 * 공유 로더(gearMotionAssets)로 읽는다. 읽을 때 배포 base(withPublicBase)를 붙인다.
 */
export const GEAR_MOTION_ASSET_DIR = '/gear/gear-motion';
export const GEAR_MOTION_DATA_PATH = `${GEAR_MOTION_ASSET_DIR}/gear-motion.json`;

type JsonRecord = Record<string, unknown>;

function record(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`gear-motion.json의 ${path}가 객체가 아닙니다.`);
  return value as JsonRecord;
}

function numbers<K extends string>(value: unknown, path: string, keys: readonly K[]): Record<K, number> {
  const source = record(value, path);
  const out = {} as Record<K, number>;
  for (const key of keys) {
    const entry = source[key];
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new Error(`gear-motion.json의 ${path}.${key}가 숫자가 아닙니다.`);
    out[key] = entry;
  }
  return out;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`gear-motion.json의 ${path}가 문자열이 아닙니다.`);
  return value;
}

function easing(value: unknown, path: string): CubicBezier {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    throw new Error(`gear-motion.json의 ${path}가 cubic-bezier 숫자 4개가 아닙니다.`);
  }
  return value as unknown as CubicBezier;
}

function polygon(value: unknown, path: string): [number, number][] {
  if (!Array.isArray(value) || value.length < 3 || !value.every((point) => (
    Array.isArray(point) && point.length === 2 && point.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  ))) {
    throw new Error(`gear-motion.json의 ${path}가 점 3개 이상의 다각형이 아닙니다.`);
  }
  return value as [number, number][];
}

/** prepare-frame-motion-v21.mjs가 만든 gear-motion.json을 읽어 모듈이 쓰는 값이 모두 있는지 확인한다. */
export function parseGearMotionData(value: unknown): GearMotionData {
  const root = record(value, '최상위');
  const texturesRecord = record(root.textures, 'textures');
  const textures = {} as Record<GearMotionTextureKey, GearMotionTextureBox>;
  for (const key of GEAR_MOTION_TEXTURE_KEYS) {
    const path = `textures.${key}`;
    const entry = record(texturesRecord[key], path);
    const size = numbers(entry, path, ['width', 'height'] as const);
    const pieceList = entry.pieces;
    if (!Array.isArray(pieceList) || pieceList.length === 0) throw new Error(`gear-motion.json의 ${path}.pieces가 비어 있습니다.`);
    const pieces = pieceList.map((piece, index) => {
      const box = numbers(piece, `${path}.pieces[${index}]`, ['x', 'y', 'width', 'height', 'atlasX', 'atlasY'] as const);
      const inside = box.width > 0 && box.height > 0 && box.atlasX >= 0 && box.atlasY >= 0
        && box.atlasX + box.width <= size.width && box.atlasY + box.height <= size.height;
      if (!inside) throw new Error(`gear-motion.json의 ${path}.pieces[${index}]가 텍스처(${size.width}×${size.height}) 밖입니다.`);
      return box;
    });
    textures[key] = { file: text(entry.file, `${path}.file`), ...size, pieces };
  }
  const contrastRecord = record(root.contrast, 'contrast');
  const gaugeRecord = record(root.gauge, 'gauge');
  const riseRecord = record(gaugeRecord.rise, 'gauge.rise');
  const glassList = gaugeRecord.glass;
  if (!Array.isArray(glassList) || glassList.length === 0) throw new Error('gear-motion.json의 gauge.glass가 다각형 목록이 아닙니다.');
  const bubbleList = gaugeRecord.bubbles;
  if (!Array.isArray(bubbleList) || bubbleList.length === 0) throw new Error('gear-motion.json의 gauge.bubbles가 비어 있습니다.');
  const accentRecord = record(root.accent, 'accent');
  const barRecord = record(root.bar, 'bar');
  const data: GearMotionData = {
    image: numbers(root.image, 'image', ['width', 'height'] as const),
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
    throw new Error('gear-motion.json의 주기(periodMs)는 0보다 커야 합니다.');
  }
  return data;
}
