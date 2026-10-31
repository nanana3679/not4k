/**
 * Pure helper for computing minimap trill zone rectangles.
 * Extracted for testability — no PixiJS dependency.
 */

import type { TrillZone, BpmChange } from "../../shared/types";
import { mainTrillZones } from "../../shared/chart/laneAxis";
import { beatToMs } from "../../shared/timing";

export interface MinimapTrillZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute minimap rectangles for trill zones.
 *
 * @param trillZones - trill zone definitions
 * @param bpmChanges - BPM changes for beat→ms conversion
 * @param offsetMs   - chart offset in ms
 * @param timeToY    - converts ms to container-local Y
 * @param toMinimapY - converts container Y to minimap Y
 * @param trackX     - minimap left edge X
 * @param laneW      - width of one lane in minimap
 */
export function computeMinimapTrillZoneRects(
  trillZones: readonly TrillZone[],
  bpmChanges: readonly BpmChange[],
  offsetMs: number,
  timeToY: (ms: number) => number,
  toMinimapY: (containerY: number) => number,
  trackX: number,
  laneW: number,
): MinimapTrillZoneRect[] {
  const rects: MinimapTrillZoneRect[] = [];

  // 보조 노트와 마찬가지로 보조 구간도 메인 4레인 미니맵 밴드에서 제외한다.
  for (const zone of mainTrillZones(trillZones)) {
    const startMs = beatToMs(zone.beat, bpmChanges, offsetMs);
    const endMs = beatToMs(zone.endBeat, bpmChanges, offsetMs);
    const startContainerY = timeToY(startMs);
    const endContainerY = timeToY(endMs);
    const startMy = toMinimapY(startContainerY);
    const endMy = toMinimapY(endContainerY);

    const laneIdx = zone.lane - 1;
    const zoneX = trackX + laneIdx * laneW;
    const topY = Math.min(startMy, endMy);
    const height = Math.max(1, Math.abs(endMy - startMy));

    rects.push({ x: zoneX, y: topY, width: laneW, height });
  }

  return rects;
}
