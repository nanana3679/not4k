import { describe, it, expect } from "vitest";
import { createTimelineSpace, type TimelineSpaceSource } from "./TimelineSpace";
import { beat } from "../../shared";
import type { Chart, NoteEntity, TrillZone, ChartEvent } from "../../shared";

// ---------------------------------------------------------------------------
// fake source — 가변 필드로 라이브 읽기(no-stale)를 검증한다 (mock 아님, 진짜 조립)
// ---------------------------------------------------------------------------

function makeChart(overrides?: Partial<Chart>): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    events: [
      { type: "bpm" as const, beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: "timeSignature" as const, beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ],
    ...overrides,
  };
}

interface FakeSourceState {
  chart: Chart;
  snapDivision: number;
  selectedNotes: Set<number>;
  extraLaneCount: number;
  /** null = 렌더러 부재 */
  yToTimeFn: ((y: number) => number) | null;
  totalTimelineMs: number | null;
}

function makeFakeSource(overrides?: Partial<FakeSourceState>) {
  const state: FakeSourceState = {
    chart: makeChart(),
    snapDivision: 4,
    selectedNotes: new Set<number>(),
    extraLaneCount: 2,
    // 기본: y(px) = 시간(ms) 항등 매핑 — 120 BPM에서 y=500이 1박
    yToTimeFn: (y) => y,
    totalTimelineMs: 4000,
    ...overrides,
  };
  const source: TimelineSpaceSource = {
    getChart: () => state.chart,
    getBpmMarkers: () => [{ beat: beat(0, 1), bpm: 120 }],
    getSnapDivision: () => state.snapDivision,
    getSelectedNotes: () => state.selectedNotes,
    getExtraLaneCount: () => state.extraLaneCount,
    yToTime: (y) => (state.yToTimeFn ? state.yToTimeFn(y) : null),
    getTotalTimelineMs: () => state.totalTimelineMs,
  };
  return { source, state };
}

// LANE_WIDTH=60, LANE_COUNT=4, TIMELINE_WIDTH=240, EXTRA_LANE_WIDTH=60

describe("TimelineSpace — 라이브 읽기 (no-stale)", () => {
  it("source의 snapDivision을 4→8로 바꾸면 space 재생성 없이 snapBeat가 새 값으로 스냅", () => {
    const { source, state } = makeFakeSource();
    const space = createTimelineSpace(source);
    // 1/3박(0.333)은 snap=4(grid 1박)에서 0박으로 스냅
    expect(space.snapBeat(beat(1, 3))).toEqual({ n: 0, d: 4 });
    state.snapDivision = 8;
    // 같은 space 인스턴스가 snap=8(grid 0.5박)을 반영: 0.333→0.5박 = {n:4,d:8}
    expect(space.snapBeat(beat(1, 3))).toEqual({ n: 4, d: 8 });
    expect(space.getSnapStep()).toEqual({ n: 4, d: 8 });
  });

  it("source의 chart에 노트를 추가하면 space 재생성 없이 hitTestNote가 새 노트를 찾음", () => {
    const { source, state } = makeFakeSource();
    const space = createTimelineSpace(source);
    // lane 1(x=30), beat 2(y=1000ms) — 노트 없음
    expect(space.hitTestNote(30, 1000)).toBeNull();
    state.chart = makeChart({
      notes: [{ type: "single", lane: 1, beat: beat(2, 1) }],
    });
    expect(space.hitTestNote(30, 1000)).toBe(0);
  });

  it("source의 selectedNotes에 노트를 넣으면 space 재생성 없이 겹친 노트 중 선택된 쪽이 우선 히트", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(2, 1) },
      { type: "single", lane: 1, beat: beat(2, 1) },
    ];
    const { source, state } = makeFakeSource({ chart: makeChart({ notes }) });
    const space = createTimelineSpace(source);
    // 선택 없음: 같은 z-order면 먼저 온 인덱스 0
    expect(space.hitTestNote(30, 1000)).toBe(0);
    state.selectedNotes = new Set([1]);
    // 선택 보너스로 인덱스 1이 우선
    expect(space.hitTestNote(30, 1000)).toBe(1);
  });

  it("source의 extraLaneCount를 0→2로 바꾸면 space 재생성 없이 xToExtraLane이 보조 영역을 인식", () => {
    const { source, state } = makeFakeSource({ extraLaneCount: 0 });
    const space = createTimelineSpace(source);
    expect(space.xToExtraLane(250)).toBeNull();
    state.extraLaneCount = 2;
    expect(space.xToExtraLane(250)).toBe(1);
  });
});

describe("TimelineSpace — 좌표 변환", () => {
  it("xToLane: x=30은 lane 1, x=239는 lane 4, x=-1과 x=240(레인 영역 밖)은 null", () => {
    const { source } = makeFakeSource();
    const space = createTimelineSpace(source);
    expect(space.xToLane(30)).toBe(1);
    expect(space.xToLane(239)).toBe(4);
    expect(space.xToLane(-1)).toBeNull();
    expect(space.xToLane(240)).toBeNull();
  });

  it("xToExtraLane: extraLaneCount=2에서 x=250은 보조 레인 1, x=310은 2, x=100(메인 영역)과 x=370(범위 밖)은 null", () => {
    const { source } = makeFakeSource({ extraLaneCount: 2 });
    const space = createTimelineSpace(source);
    expect(space.xToExtraLane(250)).toBe(1);
    expect(space.xToExtraLane(310)).toBe(2);
    expect(space.xToExtraLane(100)).toBeNull();
    expect(space.xToExtraLane(370)).toBeNull();
  });

  it("xToUnifiedLane: 메인 x=90은 lane 2 그대로, 보조 x=250은 fromAuxIndex(1)=5, 영역 밖 x=500은 null", () => {
    const { source } = makeFakeSource({ extraLaneCount: 2 });
    const space = createTimelineSpace(source);
    expect(space.xToUnifiedLane(90)).toBe(2);
    expect(space.xToUnifiedLane(250)).toBe(5);
    expect(space.xToUnifiedLane(500)).toBeNull();
  });

  it("120 BPM·snap=4에서 y=300(0.6박)은 yToBeat가 1박으로 스냅, yToBeatRaw는 {n:576,d:960} 그대로", () => {
    const { source } = makeFakeSource();
    const space = createTimelineSpace(source);
    expect(space.yToBeat(300)).toEqual({ n: 4, d: 4 });
    expect(space.yToBeatRaw(300)).toEqual({ n: 576, d: 960 });
  });

  it("getSnapStep: snapDivision=8이면 {n:4,d:8}", () => {
    const { source } = makeFakeSource({ snapDivision: 8 });
    const space = createTimelineSpace(source);
    expect(space.getSnapStep()).toEqual({ n: 4, d: 8 });
  });

  it("120 BPM·총 4000ms이면 getMaxBeatFloat는 8박", () => {
    const { source } = makeFakeSource({ totalTimelineMs: 4000 });
    const space = createTimelineSpace(source);
    expect(space.getMaxBeatFloat()).toBe(8);
  });

  it("getBpmMarkers는 source가 넘긴 마커 배열을 그대로 반환", () => {
    const { source } = makeFakeSource();
    const space = createTimelineSpace(source);
    expect(space.getBpmMarkers()).toEqual([{ beat: beat(0, 1), bpm: 120 }]);
  });
});

describe("TimelineSpace — 렌더러 부재(null) 가드", () => {
  it("yToTime이 null이면 yToBeat와 yToBeatRaw가 {n:0,d:1} 반환", () => {
    const { source } = makeFakeSource({ yToTimeFn: null });
    const space = createTimelineSpace(source);
    expect(space.yToBeat(300)).toEqual({ n: 0, d: 1 });
    expect(space.yToBeatRaw(300)).toEqual({ n: 0, d: 1 });
  });

  it("getTotalTimelineMs가 null이면 getMaxBeatFloat가 0 반환", () => {
    const { source } = makeFakeSource({ totalTimelineMs: null });
    const space = createTimelineSpace(source);
    expect(space.getMaxBeatFloat()).toBe(0);
  });
});

describe("TimelineSpace — 히트테스트", () => {
  it("hitTestNote: lane 1·beat 2 노트를 (x=30,y=1000)에서 히트, y=800(0.4박 차이)은 미스", () => {
    const { source } = makeFakeSource({
      chart: makeChart({ notes: [{ type: "single", lane: 1, beat: beat(2, 1) }] }),
    });
    const space = createTimelineSpace(source);
    expect(space.hitTestNote(30, 1000)).toBe(0);
    expect(space.hitTestNote(30, 800)).toBeNull();
  });

  it("hitTestNote는 메인 레인 한정 — 보조 영역 x=250에서는 항상 null", () => {
    const { source } = makeFakeSource({
      chart: makeChart({ notes: [{ type: "single", lane: 5, beat: beat(2, 1) }] }),
    });
    const space = createTimelineSpace(source);
    expect(space.hitTestNote(250, 1000)).toBeNull();
  });

  it("hitTestUnifiedNote: 보조 노트(lane 5)도 x=250에서 chart.notes 통합 인덱스 1을 반환", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(0, 1) },
      { type: "single", lane: 5, beat: beat(2, 1) },
    ];
    const { source } = makeFakeSource({ chart: makeChart({ notes }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestUnifiedNote(250, 1000)).toBe(1);
    // 보조 영역 밖(범위 초과)은 미스
    expect(space.hitTestUnifiedNote(500, 1000)).toBeNull();
  });

  it("hitTestExtraNote: 보조 노트(lane 5)는 aux 파생 배열 인덱스 0을 반환, 다른 보조 레인은 미스", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(2, 1) }, // 메인 — aux 배열에 없음
      { type: "single", lane: 5, beat: beat(2, 1) },
    ];
    const { source } = makeFakeSource({ chart: makeChart({ notes }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestExtraNote(250, 1000)).toBe(0);
    expect(space.hitTestExtraNote(310, 1000)).toBeNull();
  });

  it("hitTestNoteEnd: 롱노트 endBeat=2를 y=1000에서 히트(tolerance 1/16), y=1100(0.2박 차이)은 미스", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0, 1), endBeat: beat(2, 1) },
    ];
    const { source } = makeFakeSource({ chart: makeChart({ notes }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestNoteEnd(30, 1000)).toBe(0);
    expect(space.hitTestNoteEnd(30, 1100)).toBeNull();
  });

  it("hitTestEventEnd: editorLane 1 구간 이벤트 endBeat=2를 보조 x=250·y=1000에서 히트, editorLane 2 위치(x=310)는 미스", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: "auto", beat: beat(0, 1), endBeat: beat(2, 1), editorLane: 1 },
    ];
    const { source } = makeFakeSource({ chart: makeChart({ events }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestEventEnd(250, 1000)).toBe(1);
    expect(space.hitTestEventEnd(310, 1000)).toBeNull();
  });

  it("hitTestTrillZone: lane 2 구간 [1,3]박 안(y=1000, 2박)을 히트, 다른 lane(x=30)은 미스", () => {
    const trillZones: TrillZone[] = [{ lane: 2, beat: beat(1, 1), endBeat: beat(3, 1) }];
    const { source } = makeFakeSource({ chart: makeChart({ trillZones }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestTrillZone(90, 1000)).toBe(0);
    expect(space.hitTestTrillZone(30, 1000)).toBeNull();
  });

  it("hitTestTrillZoneEnd: lane 2 구간 endBeat=3을 y=1500에서 히트(tolerance 1/16), y=1400(0.2박 차이)은 미스", () => {
    const trillZones: TrillZone[] = [{ lane: 2, beat: beat(1, 1), endBeat: beat(3, 1) }];
    const { source } = makeFakeSource({ chart: makeChart({ trillZones }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestTrillZoneEnd(90, 1500)).toBe(0);
    expect(space.hitTestTrillZoneEnd(90, 1400)).toBeNull();
  });

});
