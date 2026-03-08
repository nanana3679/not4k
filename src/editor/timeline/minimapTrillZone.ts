/**
 * Pure helper for computing minimap trill zone rectangles.
 * Extracted for testability — no PixiJS dependency.
 */

import type { TrillZone, BpmMarker } from "../../shared/types";
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
 * @param bpmMarkers - BPM markers for beat→ms conversion
 * @param offsetMs   - chart offset in ms
 * @param timeToY    - converts ms to container-local Y
 * @param toMinimapY - converts container Y to minimap Y
 * @param trackX     - minimap left edge X
 * @param laneW      - width of one lane in minimap
 */
export function computeMinimapTrillZoneRects(
  trillZones: readonly TrillZone[],
  bpmMarkers: readonly BpmMarker[],
  offsetMs: number,
  timeToY: (ms: number) => number,
  toMinimapY: (containerY: number) => number,
  trackX: number,
  laneW: number,
): MinimapTrillZoneRect[] {
  const rects: MinimapTrillZoneRect[] = [];

  for (const zone of trillZones) {
    const startMs = beatToMs(zone.beat, bpmMarkers, offsetMs);
    const endMs = beatToMs(zone.endBeat, bpmMarkers, offsetMs);
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
