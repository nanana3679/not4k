import { describe, it, expect } from "vitest";
import { computeMinimapRestZoneRects } from "./minimapRestZone";
import { beat } from "../../shared/types";
import type { BpmMarker, RestZone } from "../../shared/types";

// 120 BPM, 1 beat = 500ms
const bpmMarkers: BpmMarker[] = [{ beat: beat(0), bpm: 120 }];
const offsetMs = 0;

// 간단한 변환 함수: 1ms = 1px (identity)
const timeToY = (ms: number) => ms;
// scale 0.5: minimap = containerY * 0.5
const toMinimapY = (containerY: number) => containerY * 0.5;

const trackX = 100;
const laneW = 10;

function zone(lane: number, startBeat: number, endBeat: number): RestZone {
  return { lane: lane as RestZone["lane"], beat: beat(startBeat), endBeat: beat(endBeat) };
}

describe("computeMinimapRestZoneRects", () => {
  it("빈 restZones 배열이면 빈 배열 반환", () => {
    const rects = computeMinimapRestZoneRects(
      [], bpmMarkers, offsetMs, timeToY, toMinimapY, trackX, laneW,
    );
    expect(rects).toEqual([]);
  });

  it("lane 1, beat 0~2 → x = trackX, y = 0, width = laneW, height = 500 (120BPM, scale 0.5)", () => {
    // beat 0 = 0ms, beat 2 = 1000ms
    // containerY: timeToY(0)=0, timeToY(1000)=1000
    // minimapY: 0*0.5=0, 1000*0.5=500
    const rects = computeMinimapRestZoneRects(
      [zone(1, 0, 2)], bpmMarkers, offsetMs, timeToY, toMinimapY, trackX, laneW,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ x: 100, y: 0, width: 10, height: 500 });
  });

  it("lane 4 → x = trackX + 3 * laneW", () => {
    const rects = computeMinimapRestZoneRects(
      [zone(4, 0, 1)], bpmMarkers, offsetMs, timeToY, toMinimapY, trackX, laneW,
    );
    expect(rects[0].x).toBe(trackX + 3 * laneW);
  });

  it("height가 0이 되는 경우 최소값 1로 클램핑", () => {
    // beat 0 ~ beat 0 → 둘 다 0ms → height = 0 → clamped to 1
    const rects = computeMinimapRestZoneRects(
      [zone(1, 0, 0)], bpmMarkers, offsetMs, timeToY, toMinimapY, trackX, laneW,
    );
    expect(rects[0].height).toBe(1);
  });

  it("여러 restZone이 각각 독립적인 rect로 변환됨 (오른손 파킹 = L3·L4 동시)", () => {
    const rects = computeMinimapRestZoneRects(
      [zone(3, 0, 1), zone(4, 0, 1)],
      bpmMarkers, offsetMs, timeToY, toMinimapY, trackX, laneW,
    );
    expect(rects).toHaveLength(2);
    // lane 3, beat 0~1 (0~500ms → minimap 0~250)
    expect(rects[0]).toEqual({ x: 120, y: 0, width: 10, height: 250 });
    // lane 4, 같은 구간
    expect(rects[1]).toEqual({ x: 130, y: 0, width: 10, height: 250 });
  });

  it("역방향 timeToY(endBeat < startBeat Y)에서도 topY가 올바르게 계산됨", () => {
    // 역방향 Y: 시간이 클수록 Y가 작아지는 경우
    const reverseTimeToY = (ms: number) => 1000 - ms;
    const rects = computeMinimapRestZoneRects(
      [zone(1, 0, 2)], bpmMarkers, offsetMs, reverseTimeToY, toMinimapY, trackX, laneW,
    );
    // beat 0 = 0ms → containerY = 1000, beat 2 = 1000ms → containerY = 0
    // minimapY: 500, 0 → topY = 0, height = 500
    expect(rects[0].y).toBe(0);
    expect(rects[0].height).toBe(500);
  });
});
