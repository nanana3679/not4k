import { COLORS, GAME_HEIGHT, JUDGMENT_LINE_OFFSET, LANE_AREA_WIDTH, NOTE_HEIGHT } from '../game/renderer/constants';

/**
 * 새 Classic 프레임 그림(1024×1536)을 실제 게임 화면 비율에 얹는 방식 네 가지와 현재 게임 기어 비교.
 * 측정값은 prepare-frame-fit-v20.mjs가 원본 픽셀에서 재서 public/lab/classic-frame-fit/frame-fit.json에 둔다.
 * 모든 새 프레임 방식은 레인 창 폭(laneRight − laneLeft + 1)을 렌더러의 레인 영역 400에 맞춘 가로 배율을 쓰고,
 * crop·cut·squash는 덱 첫 행(laneBottom + 1)을 판정선에 둔다. uniform은 게임 화면 전체를 줌 아웃해(렌더러 논리 크기 × zoom)
 * 화면에서 레인이 좁아 보이게 흉내 내고, 프레임 아래끝을 화면 아래에 붙여 고정한 채 판정선만 게임 Lift(%)로 올린다.
 * 배치는 렌더러 논리 단위로 계산하고 화면 값은 ÷ zoom으로 읽는다.
 */
export const FRAME_FIT_MODES = ['crop', 'cut', 'squash', 'uniform', 'current'] as const;
export type FrameFitMode = (typeof FRAME_FIT_MODES)[number];
export type NewFrameFitMode = Exclude<FrameFitMode, 'current'>;

export const FRAME_FIT_MODE_LABELS: Record<FrameFitMode, string> = {
  crop: '레인 폭 맞춤 (위 잘림)',
  cut: '기둥 잘라 줄이기',
  squash: '세로로 눌러 맞추기',
  uniform: '가로세로 같이 줄이기',
  current: '현재 게임 기어',
};

/** prepare-frame-fit-v20.mjs가 만든 정적 파일. 페이지는 withLabPublicBase로 감싸 읽는다. */
export const FRAME_FIT_ASSET_PATHS = {
  image: '/lab/classic-frame-fit/frame-cutout.png',
  geometry: '/lab/classic-frame-fit/frame-fit.json',
} as const;

/** 고정 16:9 무대의 논리 폭. 게임처럼 높이 600을 기준으로 화면비에서 정한다. */
export const FRAME_FIT_STAGE_WIDTH = Math.round((GAME_HEIGHT * 16) / 9);

export interface FrameFitGeometry {
  width: number;
  height: number;
  /** 기둥 안쪽 윤곽선 바로 안의 첫/마지막 열(포함). 이 사이가 투명한 레인 창이다. */
  laneLeft: number;
  laneRight: number;
  /** 레인 창이 전체 폭을 유지하는 마지막 행. 다음 행부터 덱 구간이다. */
  laneBottom: number;
  /** 프레임 실루엣의 첫 행(갑옷 꼭대기 끝). */
  silhouetteTop: number;
  /** 게이지 유리관 빛의 첫 행. */
  gaugeGlowTop: number;
  keyFaceTop: number;
  keyFaceBottom: number;
  deckBottom: number;
  barGlowTop: number;
  barGlowBottom: number;
  /** 프레임 실루엣의 마지막 행. 아래 끝은 frameBottom + 1이다. */
  frameBottom: number;
  /** cut 모드에서 지우는 원본 행 [y1, y2). */
  seam: { y1: number; y2: number; cost: number; typicalAdjacentRowCost: number };
}

export interface FrameFitStage {
  laneAreaX: number;
  laneAreaWidth: number;
  judgmentLineY: number;
  height: number;
}

/** 원본 행 [sourceTop, sourceBottom)을 그리는 스프라이트 한 장. 가로는 항상 원본 전체 폭이다. */
export interface FrameFitSlice {
  sourceTop: number;
  sourceBottom: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface FrameFitLayout {
  mode: NewFrameFitMode;
  /** 렌더러 논리 단위 ÷ 화면 논리 단위. uniform 외에는 1. */
  zoom: number;
  /** 화면(16:9 논리 폭 1067)에서 보이는 레인 영역 폭 = 400 ÷ zoom. */
  laneWidth: number;
  /** 레인 폭 맞춤 배율(원본 1px → 렌더러 논리 단위). */
  scale: number;
  /** 기둥 구간 세로 배율(렌더러 논리 단위). squash 외에는 scale과 같다. */
  verticalScale: number;
  /** 원본 1px → 화면 논리 단위(scale ÷ zoom). 실제 화면 픽셀은 여기에 렌더 높이 ÷ 600을 곱한다. */
  screenScale: number;
  screenVerticalScale: number;
  /** 렌더러 논리 단위 조각. 오버레이는 이 값을 그대로 쓴다. */
  slices: FrameFitSlice[];
  /** 프레임 위끝의 렌더러 논리 y. 음수면 화면 위로 잘린다. */
  frameTop: number;
  /** 프레임 위끝의 화면 논리 y(frameTop ÷ zoom). uniform에서는 판정선 높이와 무관하다. */
  screenFrameTop: number;
  /** 덱 첫 행 위끝의 화면 논리 y. crop·cut·squash는 판정선(440), uniform은 아래끝 고정으로 정해진다. */
  screenDeckTop: number;
  /**
   * uniform 전용 레인 마스크(렌더러 논리 단위). 게임 마스크 대신 덱 위끝부터 화면 아래까지 레인 영역을 덮어,
   * 놓친 노트가 판정선과 덱 사이 틈을 지나 프레임 아래로 사라지게 한다.
   */
  laneMask: { x: number; y: number; width: number; height: number; color: number } | null;
  /** 프레임 아래끝(frameBottom + 1행)이 화면 아래로 넘친 높이(화면 논리 단위, 0 이상). */
  bottomCut: number;
  /** 화면 아래로 잘리는 프레임 원본 행 수(0이면 아래끝까지 다 보인다). */
  bottomCutRows: number;
  /** 화면 위로 잘리는 원본 행 수. */
  hiddenRowsAbove: number;
  /** cut 모드에서 지운 원본 행 수. */
  removedRows: number;
  /** 화면 아래 끝(논리 y = stage.height)에 걸리는 마지막 원본 행. */
  lastVisibleRow: number;
}

export function createFrameFitStage(logicalWidth: number): FrameFitStage {
  return {
    laneAreaX: (logicalWidth - LANE_AREA_WIDTH) / 2,
    laneAreaWidth: LANE_AREA_WIDTH,
    judgmentLineY: GAME_HEIGHT - JUDGMENT_LINE_OFFSET,
    height: GAME_HEIGHT,
  };
}

/**
 * 가로세로 같이 줄이기의 레인 폭 범위(화면 논리 단위). 프레임 아래끝(frameBottom + 1)을 화면 아래에 붙이므로
 * 최소는 위끝이 화면 위에 닿는 폭(화면 높이 × 레인 창 폭 ÷ 아래끝 행)이고, 더 좁히면 프레임 위에 빈 화면이 생긴다.
 */
export function uniformLaneWidthRange(geometry: FrameFitGeometry, stage: FrameFitStage) {
  const window = geometry.laneRight - geometry.laneLeft + 1;
  return { min: (stage.height * window) / (geometry.frameBottom + 1), max: stage.laneAreaWidth };
}

export function clampUniformLaneWidth(value: number, geometry: FrameFitGeometry, stage: FrameFitStage): number {
  const { min, max } = uniformLaneWidthRange(geometry, stage);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

/**
 * 레인 폭 슬라이더 위치. 최소 폭(225.9)은 정수 칸이 아니므로 맨 왼쪽 칸(225)에 둔다.
 * 반올림(226)하면 놓는 순간 슬라이더 값이 226으로 바뀌어 최소 폭을 확정할 수 없다.
 */
export function laneSliderValue(laneWidth: number, minimum: number): number {
  return laneWidth - minimum < 1e-9 ? Math.floor(minimum) : Math.round(laneWidth);
}

/** 가로세로 같이 줄이기의 기본 화면 레인 폭. */
export const UNIFORM_DEFAULT_LANE_WIDTH = 250;
/** 판정선 높이(게임 Lift 설정과 같은 정수 %). 1% = 화면 600의 6 단위. */
export const LIFT_PERCENT_MAX = 10;
export const UNIFORM_DEFAULT_LIFT_PERCENT = 4;
const LIFT_UNITS_PER_PERCENT = GAME_HEIGHT / 100;

/** 정수 %로 맞추고 [minimum, 10]으로 묶는다. 숫자가 아니면 기본 4%(최소보다 낮으면 최소). */
export function clampUniformLiftPercent(value: number, minimum: number): number {
  const percent = Number.isFinite(value) ? Math.round(value) : UNIFORM_DEFAULT_LIFT_PERCENT;
  return Math.min(LIFT_PERCENT_MAX, Math.max(minimum, percent));
}

export function formatLiftPercent(percent: number): string {
  return `${percent}% (+${percent * LIFT_UNITS_PER_PERCENT})`;
}

/** uniform 판정선: 덱 위끝보다 아래로 내려가 가려지지 않는 가장 작은 정수 %(최대 10). */
export function minUniformLiftPercent(layout: FrameFitLayout, stage: FrameFitStage): number {
  const needed = Math.ceil((stage.judgmentLineY - layout.screenDeckTop) / LIFT_UNITS_PER_PERCENT - 1e-9);
  return Math.min(LIFT_PERCENT_MAX, Math.max(0, needed));
}

export interface UniformJudgment {
  liftPercent: number;
  /** 판정선의 화면 논리 y. */
  lineY: number;
  deckTopY: number;
  /** 판정선과 덱 위끝 사이 틈(화면 논리 단위). 음수면 판정선이 덱에 가려진다. */
  gap: number;
  /** 화면에서 보이는 노트 두께(NOTE_HEIGHT ÷ zoom)와 틈의 비. */
  noteThickness: number;
  gapNotes: number;
  covered: boolean;
  /** 줌 렌더러의 setLift에 넘길 값(렌더러 논리 단위). */
  rendererLift: number;
}

export function uniformJudgment(layout: FrameFitLayout, stage: FrameFitStage, liftPercent: number): UniformJudgment {
  const lineY = stage.judgmentLineY - liftPercent * LIFT_UNITS_PER_PERCENT;
  const gap = layout.screenDeckTop - lineY;
  const noteThickness = NOTE_HEIGHT / layout.zoom;
  return {
    liftPercent,
    lineY,
    deckTopY: layout.screenDeckTop,
    gap,
    noteThickness,
    gapNotes: gap / noteThickness,
    covered: gap < 0,
    rendererLift: liftPercent * LIFT_UNITS_PER_PERCENT * layout.zoom,
  };
}

/** 화면 레인 폭 laneWidth를 흉내 내는 렌더러 생성 값. 캔버스 백버퍼 크기와 노트가 화면을 지나는 시간은 그대로다. */
export interface FrameFitZoom {
  laneWidth: number;
  zoom: number;
  width: number;
  height: number;
  judgmentLineOffset: number;
  resolution: number;
  scrollSpeed: number;
}

export function computeFrameFitZoom(laneWidth: number, stage: FrameFitStage, renderHeight: number, scrollSpeed: number): FrameFitZoom {
  const zoom = stage.laneAreaWidth / laneWidth;
  const logicalWidth = stage.laneAreaX * 2 + stage.laneAreaWidth;
  return {
    laneWidth,
    zoom,
    width: logicalWidth * zoom,
    height: stage.height * zoom,
    judgmentLineOffset: (stage.height - stage.judgmentLineY) * zoom,
    resolution: renderHeight / (stage.height * zoom),
    scrollSpeed: scrollSpeed * zoom,
  };
}

function zoomStage(stage: FrameFitStage, zoom: number): FrameFitStage {
  const logicalWidth = stage.laneAreaX * 2 + stage.laneAreaWidth;
  return {
    laneAreaX: (logicalWidth * zoom - stage.laneAreaWidth) / 2,
    laneAreaWidth: stage.laneAreaWidth,
    judgmentLineY: stage.judgmentLineY * zoom,
    height: stage.height * zoom,
  };
}

/**
 * 맞춤 방식별 새 프레임 조각 배치. laneWidth는 uniform에서만 쓰며(화면 논리 단위, 범위로 맞춤),
 * 그때 조각은 줌 아웃한 렌더러의 논리 단위로 나온다.
 */
export function computeFrameFitLayout(
  mode: FrameFitMode,
  geometry: FrameFitGeometry,
  screenStage: FrameFitStage,
  laneWidth: number = screenStage.laneAreaWidth,
): FrameFitLayout | null {
  if (mode === 'current') return null;
  const zoom = mode === 'uniform' ? screenStage.laneAreaWidth / clampUniformLaneWidth(laneWidth, geometry, screenStage) : 1;
  const stage = zoom === 1 ? screenStage : zoomStage(screenStage, zoom);
  const deckTop = geometry.laneBottom + 1;
  const frameEdge = geometry.frameBottom + 1;
  const scale = stage.laneAreaWidth / (geometry.laneRight - geometry.laneLeft + 1);
  // 덱 첫 행의 렌더러 y. crop·cut·squash는 판정선, uniform은 프레임 아래끝을 화면 아래에 붙인 자리다.
  const deckY = mode === 'uniform' ? stage.height - (frameEdge - deckTop) * scale : stage.judgmentLineY;
  const screen = (layout: Omit<FrameFitLayout, 'zoom' | 'laneWidth' | 'screenScale' | 'screenVerticalScale' | 'screenFrameTop' | 'screenDeckTop' | 'laneMask' | 'bottomCut' | 'bottomCutRows'>): FrameFitLayout => {
    // 덱 구간은 모든 방식에서 덱 첫 행부터 scale로 그려진다. 화면 아래 끝까지 몇 행이 들어가는지 본다.
    const overflowRows = frameEdge - (deckTop + (stage.height - deckY) / layout.scale);
    return {
      ...layout,
      zoom,
      laneWidth: screenStage.laneAreaWidth / zoom,
      screenScale: layout.scale / zoom,
      screenVerticalScale: layout.verticalScale / zoom,
      screenFrameTop: layout.frameTop / zoom,
      screenDeckTop: deckY / zoom,
      laneMask: mode === 'uniform'
        ? { x: stage.laneAreaX, y: deckY, width: stage.laneAreaWidth, height: stage.height - deckY, color: COLORS.MASK_BELOW_JUDGMENT }
        : null,
      bottomCut: Math.max(0, (overflowRows * layout.scale) / zoom),
      bottomCutRows: Math.max(0, Math.ceil(overflowRows - 1e-9)),
    };
  };
  const x = stage.laneAreaX - geometry.laneLeft * scale;
  const slice = (sourceTop: number, sourceBottom: number, y: number, scaleY = scale): FrameFitSlice => ({
    sourceTop, sourceBottom, x, y, scaleX: scale, scaleY,
  });
  const lastVisibleRow = Math.min(
    geometry.height - 1,
    deckTop + Math.round((stage.height - deckY) / scale) - 1,
  );

  if (mode === 'crop' || mode === 'uniform') {
    // 최소 레인 폭에서 위끝은 수학적으로 0이다. 부동소수 오차로 화면 위에 틈이 생기지 않게 0 이하로 묶는다.
    const rawTop = deckY - deckTop * scale;
    const frameTop = mode === 'uniform' && Math.abs(rawTop) < 1e-9 ? 0 : rawTop;
    return screen({
      mode, scale, verticalScale: scale, frameTop, lastVisibleRow, removedRows: 0,
      hiddenRowsAbove: Math.max(0, Math.round(-frameTop / scale)),
      slices: [slice(0, geometry.height, frameTop)],
    });
  }

  if (mode === 'cut') {
    const { y1, y2 } = geometry.seam;
    const removedRows = y2 - y1;
    const frameTop = stage.judgmentLineY - (deckTop - removedRows) * scale;
    return screen({
      mode, scale, verticalScale: scale, frameTop, lastVisibleRow, removedRows,
      hiddenRowsAbove: Math.max(0, Math.round(-frameTop / scale)),
      slices: [slice(0, y1, frameTop), slice(y2, geometry.height, frameTop + y1 * scale)],
    });
  }

  const verticalScale = stage.judgmentLineY / deckTop;
  return screen({
    mode, scale, verticalScale, frameTop: 0, lastVisibleRow, removedRows: 0, hiddenRowsAbove: 0,
    slices: [slice(0, deckTop, 0, verticalScale), slice(deckTop, geometry.height, stage.judgmentLineY)],
  });
}

export type FramePartVisibility = 'visible' | 'partial' | 'hidden';
export interface FramePart {
  name: '갑옷 꼭대기' | '게이지 위끝' | '하단 바';
  /** 원본 행 범위(포함). */
  rows: [number, number];
  visibility: FramePartVisibility;
}

/** 화면 위로 잘리는 행과 판정선 아래 마지막 행으로 꼭대기·게이지 위끝·하단 바가 보이는지 판단한다. */
export function listFrameParts(layout: FrameFitLayout, geometry: FrameFitGeometry): FramePart[] {
  const first = layout.hiddenRowsAbove;
  const last = layout.lastVisibleRow;
  const part = (name: FramePart['name'], rows: [number, number]): FramePart => ({
    name,
    rows,
    visibility: first <= rows[0] && last >= rows[1] ? 'visible' : first > rows[1] || last < rows[0] ? 'hidden' : 'partial',
  });
  return [
    part('갑옷 꼭대기', [geometry.silhouetteTop, geometry.gaugeGlowTop - 1]),
    part('게이지 위끝', [geometry.gaugeGlowTop, geometry.gaugeGlowTop]),
    part('하단 바', [geometry.barGlowTop, geometry.barGlowBottom]),
  ];
}

const VISIBILITY_LABELS: Record<FramePartVisibility, string> = { visible: '보임', partial: '일부', hidden: '숨음' };

export function describeFrameParts(parts: readonly FramePart[]): string {
  return parts.map((part) => `${part.name} ${VISIBILITY_LABELS[part.visibility]}`).join(' · ');
}

/** 레인 폭 표시: 정수면 그대로, 아니면 소수 한 자리. */
export function formatLaneWidth(laneWidth: number): string {
  return Number.isInteger(laneWidth) ? `${laneWidth}` : laneWidth.toFixed(1);
}

/** 지금 게임 레인 폭(400) 대비 백분율. */
export function laneWidthPercent(laneWidth: number, stage: FrameFitStage): string {
  return `${Number(((laneWidth / stage.laneAreaWidth) * 100).toFixed(1))}%`;
}

/** uniform의 레인 마스크가 실제 게임에 주는 뜻. 페이지 설명과 스펙이 같은 문장을 쓴다. */
export const UNIFORM_MASK_NOTE = '실제 게임에 적용하면 레인 마스크가 판정선이 아니라 프레임 덱에서 시작합니다. 놓친 노트는 판정선을 지나 덱 사이 틈으로 계속 내려가다 프레임 아래로 사라집니다.';

/** 화면 전체를 줄여 흉내 내는 방식의 한계. 페이지 설명과 스펙이 같은 문장을 쓴다. */
export const UNIFORM_ZOOM_NOTE = '게임 화면 전체를 줄여 흉내 내므로 노트 두께, 콤보·정확도 글자, 키봄도 함께 작아집니다. 실제 구현은 레인만 좁히고 노트 두께는 유지할 수 있습니다.';

const GEOMETRY_NUMBER_KEYS = [
  'width', 'height', 'laneLeft', 'laneRight', 'laneBottom', 'silhouetteTop', 'gaugeGlowTop', 'keyFaceTop', 'keyFaceBottom',
  'deckBottom', 'barGlowTop', 'barGlowBottom', 'frameBottom',
] as const;

/** frame-fit.json을 읽어 레이아웃이 기대하는 순서(레인 창 → 이음매 → 덱)를 확인한다. */
export function parseFrameFitGeometry(value: unknown): FrameFitGeometry {
  if (!value || typeof value !== 'object') throw new Error('frame-fit.json이 객체가 아닙니다.');
  const record = value as Record<string, unknown>;
  const numbers = {} as Record<(typeof GEOMETRY_NUMBER_KEYS)[number], number>;
  for (const key of GEOMETRY_NUMBER_KEYS) {
    const entry = record[key];
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new Error(`frame-fit.json의 ${key}가 숫자가 아닙니다.`);
    numbers[key] = entry;
  }
  const seam = record.seam as Record<string, unknown> | undefined;
  const seamNumber = (key: string) => {
    const entry = seam?.[key];
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new Error(`frame-fit.json의 seam.${key}가 숫자가 아닙니다.`);
    return entry;
  };
  const geometry: FrameFitGeometry = {
    ...numbers,
    seam: {
      y1: seamNumber('y1'),
      y2: seamNumber('y2'),
      cost: seamNumber('cost'),
      typicalAdjacentRowCost: seamNumber('typicalAdjacentRowCost'),
    },
  };
  if (!(geometry.laneLeft >= 0 && geometry.laneLeft < geometry.laneRight && geometry.laneRight < geometry.width)) {
    throw new Error('frame-fit.json의 lane 열 범위가 잘못됐습니다.');
  }
  if (!(geometry.laneBottom > 0 && geometry.laneBottom < geometry.height - 1)) {
    throw new Error('frame-fit.json의 laneBottom이 원본 높이 밖입니다.');
  }
  if (!(geometry.seam.y1 > 0 && geometry.seam.y1 < geometry.seam.y2 && geometry.seam.y2 <= geometry.laneBottom + 1)) {
    throw new Error('frame-fit.json의 seam이 기둥 구간(0~laneBottom) 밖입니다.');
  }
  return geometry;
}

/** 원본 1px이 실제 화면 픽셀 몇 개로 그려지는지(배율 × 해상도) 한 줄로 쓴다. */
export function describePixelRatio(screenPixelsPerSourcePixel: number): string {
  const value = screenPixelsPerSourcePixel.toFixed(2);
  const kind = value === '1.00' ? '등배' : screenPixelsPerSourcePixel > 1 ? '확대' : '축소';
  return `원본 1px → 화면 ${value}px (${kind})`;
}

/** 1:1 픽셀 보기: 캔버스 백버퍼 1px이 기기 화면 1px이 되도록 CSS 크기를 정한다. */
export function oneToOneCssSize(backingWidth: number, backingHeight: number, devicePixelRatio: number) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return { width: backingWidth / ratio, height: backingHeight / ratio };
}

const formatScale = (value: number) => value.toFixed(3);

/** 현재 방식이 원본의 무엇을 자르거나 누르는지 숫자로 설명하는 한 문장. */
export function describeFrameFit(layout: FrameFitLayout, geometry: FrameFitGeometry): string {
  const deckTop = geometry.laneBottom + 1;
  const bottom = layout.lastVisibleRow >= geometry.barGlowBottom
    ? '하단 바까지 보입니다'
    : layout.lastVisibleRow >= geometry.deckBottom
      ? `덱은 다 보이고 하단 바(${geometry.barGlowTop}~${geometry.barGlowBottom}행)는 일부만 보입니다`
      : `덱 아래(${geometry.deckBottom}행)가 잘리고 하단 바(${geometry.barGlowTop}~${geometry.barGlowBottom}행)는 화면 밖입니다`;
  const below = `판정선 아래는 ${layout.lastVisibleRow}행까지 보여 ${bottom}`;

  if (layout.mode === 'crop') {
    return `원본을 ${formatScale(layout.scale)}배로 줄여 덱 첫 행(${deckTop}행)을 판정선에 두면 화면 위로 원본 ${layout.hiddenRowsAbove}행이 잘리고, ${below}.`;
  }
  if (layout.mode === 'uniform') {
    const percent = `${Number((100 / layout.zoom).toFixed(1))}%`;
    const top = layout.hiddenRowsAbove === 0
      ? '프레임 위끝이 화면 위에 닿아 잘리는 행이 없습니다'
      : `화면 위로 원본 ${layout.hiddenRowsAbove}행이 잘립니다`;
    return `레인 폭을 ${formatLaneWidth(layout.laneWidth)}(현재의 ${percent})로 좁히려고 게임 화면 전체를 ${formatScale(1 / layout.zoom)}배로 줄입니다. 원본은 화면에서 ${formatScale(layout.screenScale)}배로 그려지고, 프레임은 아래끝(${geometry.frameBottom}행)을 화면 아래에 붙여 고정해 덱 위끝이 y ${layout.screenDeckTop.toFixed(1)}에 오며 ${top}.`;
  }

  if (layout.mode === 'cut') {
    const { y1, y2, cost, typicalAdjacentRowCost } = geometry.seam;
    const ratio = Math.round(cost / typicalAdjacentRowCost);
    return `기둥 ${y1}~${y2 - 1}행(${layout.removedRows}행)을 잘라내 위끝을 화면 위에 붙입니다. 이음매 위아래 행 차이는 ${cost.toFixed(1)}로 보통 인접 행 차이 ${typicalAdjacentRowCost.toFixed(1)}의 ${ratio}배이고, ${below}.`;
  }
  const percent = Math.round((layout.verticalScale / layout.scale) * 100);
  return `기둥 구간 0~${geometry.laneBottom}행을 세로 ${formatScale(layout.verticalScale)}배(레인 폭 배율의 ${percent}%)로 눌러 판정선까지 채우고 덱은 ${formatScale(layout.scale)}배 그대로 둡니다. ${below}.`;
}

/** 현재 게임 기어(gear-frame.png)는 실제 렌더러가 놓은 위끝 y를 읽어 설명한다. */
export function describeCurrentGear(frameTop: number): string {
  const hidden = Math.max(0, Math.round(-frameTop));
  return `현재 게임 기어(gear-frame.png)를 게임과 같은 자리에 그립니다. 기둥 사이 폭을 레인 폭에 맞춘 위끝이 y ${frameTop.toFixed(1)}이라 위 ${hidden} 논리 단위가 화면 밖입니다.`;
}
