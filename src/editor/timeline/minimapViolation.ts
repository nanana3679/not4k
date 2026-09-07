/**
 * Pure helper for computing minimap violation indicator ticks (RFD 0017 §7).
 * Extracted for testability — no PixiJS dependency.
 *
 * 위반 노트·트릴존·restZone·이벤트를 종류 무관 단일 채널로 미니맵 우측 경계에 짧은
 * 빨간 틱으로 표시하기 위한 rect 목록을 계산한다. 보조 레인·이벤트 위반은
 * 미니맵에 x 좌표가 없으므로(미니맵은 메인 레인만 표시) y만 사용한다.
 * 위반 Set은 뷰포트 밖 인덱스도 포함하며, 화면 밖 위반의 조기 경고가 목적이므로
 * 뷰포트 클리핑 없이 전부 계산한다.
 */

import type { NoteEntity, TrillZone, RestZone, ChartEvent, BpmMarker, Beat } from "../../shared/types";
import { beatToMs } from "../../shared/timing";

export interface MinimapViolationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 위반 틱 폭(px) — 미니맵 우측 경계에 붙는 짧은 마크 */
export const MINIMAP_VIOLATION_TICK_WIDTH = 6;
/** 위반 틱 높이(px) — beat 위치 y를 중심으로 배치 */
export const MINIMAP_VIOLATION_TICK_HEIGHT = 2;

export interface MinimapViolationParams {
  violatingNoteIndices: ReadonlySet<number>;
  violatingTrillZoneIndices: ReadonlySet<number>;
  violatingRestZoneIndices: ReadonlySet<number>;
  violatingEventIndices: ReadonlySet<number>;
  notes: readonly NoteEntity[];
  trillZones: readonly TrillZone[];
  restZones: readonly RestZone[];
  events: readonly ChartEvent[];
  bpmMarkers: readonly BpmMarker[];
  offsetMs: number;
  /** ms → container-local Y */
  timeToY: (ms: number) => number;
  /** container Y → minimap Y */
  toMinimapY: (containerY: number) => number;
  /** minimap left edge X */
  trackX: number;
  /** minimap width (px) */
  minimapWidth: number;
}

/**
 * 위반 엔티티들의 시작 beat 위치를 미니맵 우측 경계 틱 rect 목록으로 변환한다.
 *
 * - 구간 엔티티(트릴존·구간 이벤트·롱노트)도 시작 beat 위치 틱 하나로 표시한다.
 * - 같은 y(반올림 기준)에 겹치는 위반은 틱 1개로 합친다(단일 채널).
 * - 배열 범위를 벗어난 인덱스는 무시한다(방어).
 */
export function computeMinimapViolationRects(params: MinimapViolationParams): MinimapViolationRect[] {
  const {
    violatingNoteIndices, violatingTrillZoneIndices, violatingRestZoneIndices, violatingEventIndices,
    notes, trillZones, restZones, events,
    bpmMarkers, offsetMs, timeToY, toMinimapY, trackX, minimapWidth,
  } = params;

  const rects: MinimapViolationRect[] = [];
  const seenY = new Set<number>();
  const tickX = trackX + minimapWidth - MINIMAP_VIOLATION_TICK_WIDTH;

  const pushTick = (b: Beat): void => {
    const my = toMinimapY(timeToY(beatToMs(b, bpmMarkers, offsetMs)));
    const key = Math.round(my);
    if (seenY.has(key)) return;
    seenY.add(key);
    rects.push({
      x: tickX,
      y: my - MINIMAP_VIOLATION_TICK_HEIGHT / 2,
      width: MINIMAP_VIOLATION_TICK_WIDTH,
      height: MINIMAP_VIOLATION_TICK_HEIGHT,
    });
  };

  for (const i of violatingNoteIndices) {
    const entity = notes[i];
    if (entity) pushTick(entity.beat);
  }
  for (const i of violatingTrillZoneIndices) {
    const entity = trillZones[i];
    if (entity) pushTick(entity.beat);
  }
  for (const i of violatingRestZoneIndices) {
    const entity = restZones[i];
    if (entity) pushTick(entity.beat);
  }
  for (const i of violatingEventIndices) {
    const entity = events[i];
    if (entity) pushTick(entity.beat);
  }

  return rects;
}
