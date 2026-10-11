import { GEAR_GEOMETRY, resolvePlayLogicalWidth, type GearGeometry, type GearLayout } from '../game/renderer/gearLayout';
import { gaugeEmptyRows } from '../game/renderer/gearGauge';
import { clampFlightAltitude } from '../game/renderer/flightAltitude';
import { GAME_HEIGHT, GEAR_OFFSET_Y, NOTE_HEIGHT, judgmentLineYAtLift, liftPx } from '../game/renderer/constants';
import { PRESET_BINDINGS } from '../game/stores/gameStore';

/**
 * Gear 미리보기(/lab/gear)의 숫자와 설명. 기어 배치 자체는 게임의 gearLayout이 정하고,
 * 여기서는 같은 값으로 Lab 화면에 보일 판정선·덱·키 윗면 사이 거리와 선명도를 계산한다(RFD 0029).
 */

/** 고정 16:9 무대의 논리 폭. 게임 PlayScreen과 같은 규칙(높이 600 × 화면 비율)이다. */
export const GEAR_PREVIEW_STAGE_WIDTH = resolvePlayLogicalWidth(16, 9);

/**
 * 전체화면 무대의 논리 폭. 게임 PlayScreen처럼 높이 600에 화면 비율을 곱하되 기어 최소 폭(466)보다 좁히지 않는다
 * (21:9면 1400, 폰 가로 844×390이면 1298, 세로 화면이면 466). 크기를 모르면 기본 16:9 폭이다.
 */
export function fullscreenLogicalWidth(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return GEAR_PREVIEW_STAGE_WIDTH;
  return resolvePlayLogicalWidth(width, height);
}

/** Lab의 리프트 슬라이더 범위(게임 설정은 0~100%). 1% = 화면 600의 6 단위. */
export const LIFT_PERCENT_MAX = 10;

/** 정수 %로 맞추고 [0, 10]으로 묶는다. 숫자가 아니면 0%. */
export function clampLiftPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(LIFT_PERCENT_MAX, Math.max(0, Math.round(value)));
}

export function formatLiftPercent(percent: number): string {
  return `${percent}% (+${liftPx(percent)})`;
}

/**
 * 기어·판정선 y 오프셋([#257](https://github.com/nanana3679/not4k/issues/257)): 렌더러 옵션 `gearOffsetY`(화면 y축, +가 아래, 논리 px)로 기어와
 * 리프트 0%의 판정선을 함께 내리는 값을 Lab에서 시험한다. 기본은 게임 값 `GEAR_OFFSET_Y`(10)이고, 주소 `offsetY`는 게임과 같은 절대값이다
 * (게임 값과의 차이가 아니다). Lab은 0~60 논리 px를 0.5 단위로 다룬다.
 */
export const GEAR_OFFSET_Y_MAX = 60;
export const GEAR_OFFSET_Y_STEP = 0.5;

/** 0.5 단위로 맞추고 [0, 60]으로 묶는다. 숫자가 아니면 0. */
export function clampPreviewGearOffsetY(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const stepped = Math.round(value / GEAR_OFFSET_Y_STEP) * GEAR_OFFSET_Y_STEP;
  return Math.min(GEAR_OFFSET_Y_MAX, Math.max(0, stepped));
}

/** 주소의 `offsetY` 쿼리 값(절대값). 없거나 비었거나 숫자가 아니면 게임 값 `GEAR_OFFSET_Y`다. */
export function parseGearOffsetYParam(raw: string | null): number {
  if (raw === null || raw.trim() === '') return GEAR_OFFSET_Y;
  const value = Number(raw);
  return Number.isFinite(value) ? clampPreviewGearOffsetY(value) : GEAR_OFFSET_Y;
}

/** y 오프셋을 반영한 다음 쿼리. 다른 쿼리는 그대로 두고, 게임 값 `GEAR_OFFSET_Y`면 `offsetY`를 지워 기본 주소로 돌아간다. */
export function nextGearOffsetYSearch(current: URLSearchParams, offsetY: number): URLSearchParams {
  const params = new URLSearchParams(current);
  if (offsetY === GEAR_OFFSET_Y) params.delete('offsetY');
  else params.set('offsetY', formatGearOffsetY(offsetY));
  return params;
}

/** y 오프셋 표시(20 → "20", 12.5 → "12.5"). 주소 쿼리와 무대 data-gear-offset-y도 같은 표기다. */
export function formatGearOffsetY(offsetY: number): string {
  return String(offsetY);
}

/** 화면 아래(stageHeight)보다 밑으로 내려가 잘리는 기어 실루엣의 원본 행 수(소수). 내리지 않았으면 0. */
export function gearRowsBelowScreen(layout: Readonly<GearLayout>, stageHeight: number = GAME_HEIGHT, geometry: GearGeometry = GEAR_GEOMETRY): number {
  const silhouetteBottomY = layout.y + (geometry.silhouetteBottom + 1) * layout.scale;
  return Math.max(0, (silhouetteBottomY - stageHeight) / layout.scale);
}

/** y 오프셋 조절 옆 숫자: 값(논리 px, +가 아래), 판정선 y, 키 윗면 y, 둘 사이 틈, 화면 아래로 잘리는 기어 원본 행. */
export function describeGearOffsetY(layout: Readonly<GearLayout>, judgment: GearPreviewJudgment, offsetY: number): string {
  const rows = gearRowsBelowScreen(layout);
  const cut = rows > 0 ? `아래로 원본 ${rows.toFixed(1)}행 잘림` : '아래로 잘리는 행 없음';
  const value = `${offsetY > 0 ? '+' : ''}${formatGearOffsetY(offsetY)} 논리 px(+가 아래)`;
  return `${value} · 판정선 y ${judgment.lineY} · 키 윗면 y ${judgment.keyRimY.toFixed(1)} · 틈 ${judgment.openGap.toFixed(1)} · ${cut}`;
}

/** 고도 직접 정하기 슬라이더 값. 정수 %로 맞추고 [0, 100]으로 묶는다. 숫자가 아니면 시작값 100%. */
export function clampAltitudePercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** 렌더러 setAltitudeOverride에 넘길 값. 곡 진행 따라가기면 null(고도 모델), 직접 정하기면 고정 고도(0~1). */
export function altitudeOverrideFor(follow: boolean, level: number): number | null {
  return follow ? null : clampFlightAltitude(level);
}

/** 고정 고도를 슬라이더의 정수 %로 나타낸다. */
export function altitudePercentOf(level: number): number {
  return Math.round(clampFlightAltitude(level) * 100);
}

/**
 * 곡 진행 따라가기를 끄는 순간의 고정 고도. 슬라이더 시작값(100%)으로 뛰지 않도록 그때 보이던 게이지 채움을 그대로 써
 * 게이지가 그 자리에 멈춰 있게 한다. 게이지가 없으면(렌더러 준비 전) 지금 고정값을 유지한다.
 */
export function manualAltitudeOnUnfollow(gaugeLevel: number | null, current: number): number {
  return clampFlightAltitude(gaugeLevel ?? current);
}

/** 무대 data-gear-gauge-level 값(소수 셋째 자리). 게이지가 없으면 undefined(속성을 쓰지 않는다). */
export function formatGaugeLevel(level: number | null): string | undefined {
  return level === null ? undefined : level.toFixed(3);
}

/** 설명의 게이지 채움: 채움 %와 위에서 덮은 빈 유리 행(채움 구간 821행 중). */
export function describeGaugeLevel(level: number | null, geometry: GearGeometry = GEAR_GEOMETRY): string {
  if (level === null) return '게이지 없음';
  const rows = gaugeEmptyRows(level, geometry.gauge.fillRows);
  const percent = `${Math.round(level * 100)}%`;
  return rows === 0 ? `${percent} · 그림 그대로` : `${percent} · 빈 유리 ${rows}/${geometry.gauge.fillRows}행`;
}

export interface GearPreviewJudgment {
  liftPercent: number;
  /** 판정선 y(리프트 반영). */
  lineY: number;
  deckTopY: number;
  /** 판정선 가운데와 덱 위끝 사이 틈, 노트 두께 배수. */
  gap: number;
  gapNotes: number;
  /** 레인 끝인 키 윗면 y와, 판정선에서 그곳까지 레인이 보이는 거리·노트 두께 배수. */
  keyRimY: number;
  openGap: number;
  openGapNotes: number;
}

/**
 * 게임과 같은 판정선(리프트 0% = y 416 + gearOffsetY, 게임 값 10이면 y 426)과 기어 덱·키 윗면 사이 거리. 기어는 리프트로 움직이지 않는다.
 * layout은 같은 gearOffsetY로 만든 배치여야 한다.
 */
export function describeGearJudgment(layout: Readonly<GearLayout>, liftPercent: number, gearOffsetY: number = GEAR_OFFSET_Y): GearPreviewJudgment {
  const lineY = judgmentLineYAtLift(liftPercent, gearOffsetY);
  const gap = layout.deckTopY - lineY;
  const openGap = layout.keyRimY - lineY;
  return {
    liftPercent,
    lineY,
    deckTopY: layout.deckTopY,
    gap,
    gapNotes: gap / NOTE_HEIGHT,
    keyRimY: layout.keyRimY,
    openGap,
    openGapNotes: openGap / NOTE_HEIGHT,
  };
}

/** 기어가 원본의 어디를 어떻게 줄여 놓는지 숫자로 설명하는 문장. */
export function describeGear(layout: Readonly<GearLayout>, geometry: GearGeometry = GEAR_GEOMETRY): string {
  const hiddenRows = Math.max(0, Math.round(-layout.y / layout.scale));
  const rowsBelow = gearRowsBelowScreen(layout, GAME_HEIGHT, geometry);
  const laneAreaWidth = Math.round((geometry.laneRight - geometry.laneLeft + 1) * layout.scale * 10) / 10;
  const placement = rowsBelow > 0
    ? `실루엣 아래끝(${geometry.silhouetteBottom}행)을 화면 아래보다 ${formatGearOffsetY(Math.round(rowsBelow * layout.scale * 10) / 10)} 아래에 두어 고정합니다. `
      + `위로 원본 ${hiddenRows}행, 아래로 원본 ${rowsBelow.toFixed(1)}행이 화면 밖으로 잘립니다.`
    : `실루엣 아래끝(${geometry.silhouetteBottom}행)을 화면 아래에 붙여 고정합니다. 위로 원본 ${hiddenRows}행만 잘리고 게이지·덱·하단 바는 모두 보입니다.`;
  return `원본 ${geometry.width}×${geometry.height}을 ${layout.scale.toFixed(3)}배로 줄여 레인 창(${geometry.laneLeft}~${geometry.laneRight}열)을 `
    + `레인 영역 ${laneAreaWidth}에 맞추고, ${placement} 덱 위끝은 y ${layout.deckTopY.toFixed(1)}, `
    + `레인이 끝나는 키 윗면은 y ${layout.keyRimY.toFixed(1)}입니다.`;
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

function laneBindings(bindings: Readonly<Record<'lane1' | 'lane2' | 'lane3' | 'lane4', readonly string[]>>): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const [lane, keys] of Object.entries(bindings)) {
    for (const key of keys) map.set(key, Number(lane.replace('lane', '')));
  }
  return map;
}

/** 무대 오른쪽 아래 키보드 표시. 게임 기본 프리셋 두 가지로 기어 오른쪽 빈 곳에 맞추는 규칙을 본다. */
export const GEAR_PREVIEW_KEYBOARDS = {
  tkl: { label: 'TKL', bindings: laneBindings(PRESET_BINDINGS.tkl) },
  numpad: { label: '넘버패드', bindings: laneBindings(PRESET_BINDINGS.numpad) },
} as const;
export type GearPreviewKeyboard = keyof typeof GEAR_PREVIEW_KEYBOARDS;
