import { describe, it, expect } from "vitest";
import {
  computeMinimapViolationRects,
  MINIMAP_VIOLATION_TICK_WIDTH,
  MINIMAP_VIOLATION_TICK_HEIGHT,
} from "./minimapViolation";
import { beat } from "../../shared/types";
import type {
  BpmMarker,
  ChartEvent,
  NoteEntity,
  RestZone,
  TrillZone,
} from "../../shared/types";

// 120 BPM, 1 beat = 500ms
const bpmMarkers: BpmMarker[] = [{ beat: beat(0), bpm: 120 }];
const offsetMs = 0;

// 간단한 변환 함수: 1ms = 1px (identity)
const timeToY = (ms: number) => ms;
// scale 0.5: minimap = containerY * 0.5
const toMinimapY = (containerY: number) => containerY * 0.5;

const trackX = 100;
const minimapWidth = 32;
// 우측 경계 틱 x = trackX + minimapWidth - 틱폭 = 100 + 32 - 6 = 126
const tickX = trackX + minimapWidth - MINIMAP_VIOLATION_TICK_WIDTH;

function note(lane: number, b: number): NoteEntity {
  return { type: "single", lane: lane as NoteEntity["lane"], beat: beat(b) };
}

function zone(lane: number, startBeat: number, endBeat: number): TrillZone {
  return { lane: lane as TrillZone["lane"], beat: beat(startBeat), endBeat: beat(endBeat) };
}

function restZone(lane: number, startBeat: number, endBeat: number): RestZone {
  return { lane: lane as RestZone["lane"], beat: beat(startBeat), endBeat: beat(endBeat) };
}

function compute(partial: Partial<Parameters<typeof computeMinimapViolationRects>[0]>) {
  return computeMinimapViolationRects({
    violatingNoteIndices: new Set<number>(),
    violatingTrillZoneIndices: new Set<number>(),
    violatingRestZoneIndices: new Set<number>(),
    violatingEventIndices: new Set<number>(),
    notes: [],
    trillZones: [],
    restZones: [],
    events: [],
    bpmMarkers,
    offsetMs,
    timeToY,
    toMinimapY,
    trackX,
    minimapWidth,
    ...partial,
  });
}

describe("computeMinimapViolationRects", () => {
  it("위반 Set이 전부 비어 있으면 빈 배열 반환", () => {
    expect(compute({ notes: [note(1, 0), note(1, 0)] })).toEqual([]);
  });

  it("위반 노트 beat 2 (120BPM, scale 0.5) → y = 500 - 틱높이/2, x = 우측 경계(trackX + minimapWidth - 틱폭)", () => {
    // beat 2 = 1000ms → containerY 1000 → minimapY 500
    const rects = compute({
      notes: [note(1, 0), note(2, 2)],
      violatingNoteIndices: new Set([1]),
    });
    expect(rects).toEqual([
      {
        x: tickX,
        y: 500 - MINIMAP_VIOLATION_TICK_HEIGHT / 2,
        width: MINIMAP_VIOLATION_TICK_WIDTH,
        height: MINIMAP_VIOLATION_TICK_HEIGHT,
      },
    ]);
  });

  it("보조 레인(lane 5) 위반 노트도 우측 경계 틱으로 표시 (레인 무관 단일 채널)", () => {
    // 미니맵 본체는 보조 레인을 그리지 않지만, 위반 틱은 y만 쓰므로 표시된다.
    const rects = compute({
      notes: [note(5, 4)], // beat 4 = 2000ms → minimapY 1000
      violatingNoteIndices: new Set([0]),
    });
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(tickX);
    expect(rects[0].y).toBe(1000 - MINIMAP_VIOLATION_TICK_HEIGHT / 2);
  });

  it("위반 트릴존(beat 2~6)은 시작 beat 위치에 틱 1개", () => {
    const rects = compute({
      trillZones: [zone(1, 2, 6)],
      violatingTrillZoneIndices: new Set([0]),
    });
    expect(rects).toHaveLength(1);
    expect(rects[0].y).toBe(500 - MINIMAP_VIOLATION_TICK_HEIGHT / 2);
  });

  it("위반 restZone(beat 2~6)은 시작 beat 위치에 틱 1개", () => {
    const rects = compute({
      restZones: [restZone(1, 2, 6)],
      violatingRestZoneIndices: new Set([0]),
    });
    expect(rects).toHaveLength(1);
    expect(rects[0].y).toBe(500 - MINIMAP_VIOLATION_TICK_HEIGHT / 2);
    expect(rects[0].x).toBe(tickX);
  });

  it("같은 beat 2의 위반 트릴존과 restZone은 y가 중복되어 틱 1개로 합쳐짐", () => {
    const rects = compute({
      trillZones: [zone(1, 2, 4)],
      restZones: [restZone(2, 2, 4)],
      violatingTrillZoneIndices: new Set([0]),
      violatingRestZoneIndices: new Set([0]),
    });
    expect(rects).toHaveLength(1);
  });

  it("위반 구간 이벤트(stop beat 2~4)는 시작 beat 위치에 틱 1개", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "stop", beat: beat(2), endBeat: beat(4) },
    ];
    const rects = compute({
      events,
      violatingEventIndices: new Set([1]),
    });
    expect(rects).toHaveLength(1);
    expect(rects[0].y).toBe(500 - MINIMAP_VIOLATION_TICK_HEIGHT / 2);
  });

  it("위반 노트·트릴존·이벤트가 서로 다른 beat에 있으면 틱 3개", () => {
    const rects = compute({
      notes: [note(1, 0)],
      trillZones: [zone(2, 2, 3)],
      events: [{ type: "bpm", beat: beat(4), bpm: 90 }],
      violatingNoteIndices: new Set([0]),
      violatingTrillZoneIndices: new Set([0]),
      violatingEventIndices: new Set([0]),
    });
    expect(rects).toHaveLength(3);
    const ys = rects.map((r) => r.y).sort((a, b) => a - b);
    // beat 0/2/4 → minimapY 0/500/1000
    expect(ys).toEqual([
      0 - MINIMAP_VIOLATION_TICK_HEIGHT / 2,
      500 - MINIMAP_VIOLATION_TICK_HEIGHT / 2,
      1000 - MINIMAP_VIOLATION_TICK_HEIGHT / 2,
    ]);
  });

  it("같은 beat의 위반 노트와 이벤트는 y가 중복되어 틱 1개로 합쳐짐", () => {
    const rects = compute({
      notes: [note(1, 2)],
      events: [{ type: "bpm", beat: beat(2), bpm: 90 }],
      violatingNoteIndices: new Set([0]),
      violatingEventIndices: new Set([0]),
    });
    expect(rects).toHaveLength(1);
  });

  it("배열 범위를 벗어난 위반 인덱스는 무시 (틱 0개)", () => {
    const rects = compute({
      notes: [note(1, 0)],
      violatingNoteIndices: new Set([5]),
      violatingTrillZoneIndices: new Set([0]),
      violatingRestZoneIndices: new Set([2]),
      violatingEventIndices: new Set([3]),
    });
    expect(rects).toEqual([]);
  });
});
