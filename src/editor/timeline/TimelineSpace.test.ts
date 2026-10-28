import { describe, it, expect } from "vitest";
import { createTimelineSpace, type TimelineSpaceSource } from "./TimelineSpace";
import { beat } from "../../shared";
import type { ChartDocument, DocumentNoteEntity, TrillZone, RestZone, ChartEvent } from "../../shared";

// ---------------------------------------------------------------------------
// fake source — 가변 필드로 라이브 읽기(no-stale)를 검증한다 (mock 아님, 진짜 조립)
// ---------------------------------------------------------------------------

function makeChart(overrides?: Partial<ChartDocument>): ChartDocument {
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
  chart: ChartDocument;
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
    const notes: DocumentNoteEntity[] = [
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

  it("getBpmMarkers는 chart.events의 bpm 이벤트를 추출·정렬해 반환 — 4박 180·0박 120 순서로 넣어도 [120@0, 180@4]", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(4, 1), bpm: 180, editorLane: 1 },
      { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
      { type: "timeSignature", beat: beat(0, 1), beatPerMeasure: beat(4, 1), editorLane: 2 },
    ];
    const { source } = makeFakeSource({ chart: makeChart({ events }) });
    const space = createTimelineSpace(source);
    expect(space.getBpmMarkers()).toEqual([
      { beat: beat(0, 1), bpm: 120 },
      { beat: beat(4, 1), bpm: 180 },
    ]);
  });
});

describe("TimelineSpace — bpmMarkers 라이브 일관성 (no-stale)", () => {
  it("source.chart를 events가 다른 새 차트로 교체하면(bpm 120→180) space 재생성 없이 getBpmMarkers와 yToBeat가 새 BPM 반영", () => {
    const { source, state } = makeFakeSource();
    const space = createTimelineSpace(source);
    // 120 BPM: 1박 = 500ms → y=1000은 2박
    expect(space.getBpmMarkers()).toEqual([{ beat: beat(0, 1), bpm: 120 }]);
    expect(space.yToBeat(1000)).toEqual({ n: 8, d: 4 });
    state.chart = makeChart({
      events: [{ type: "bpm", beat: beat(0, 1), bpm: 180, editorLane: 1 }],
    });
    // 180 BPM: 1박 = 333.33ms → 같은 y=1000이 3박
    expect(space.getBpmMarkers()).toEqual([{ beat: beat(0, 1), bpm: 180 }]);
    expect(space.yToBeat(1000)).toEqual({ n: 12, d: 4 });
  });

  it("동일 events 참조를 유지하면 extractBpmMarkers를 재호출하지 않는다(identity 캐시) — in-place 교체(120→240)는 옛 캐시값, 배열 참조 교체 시 재계산", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: beat(0, 1), bpm: 120, editorLane: 1 },
    ];
    const { source, state } = makeFakeSource({ chart: makeChart({ events }) });
    const space = createTimelineSpace(source);
    expect(space.getBpmMarkers()).toEqual([{ beat: beat(0, 1), bpm: 120 }]);
    // 같은 배열 참조 안에서 이벤트만 바꿔치기 — identity가 같으므로 캐시가 유지된다
    events[0] = { type: "bpm", beat: beat(0, 1), bpm: 240, editorLane: 1 };
    expect(space.getBpmMarkers()).toEqual([{ beat: beat(0, 1), bpm: 120 }]);
    // 배열 참조 자체를 교체하면 재계산된다
    state.chart = { ...state.chart, events: [...events] };
    expect(space.getBpmMarkers()).toEqual([{ beat: beat(0, 1), bpm: 240 }]);
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
    const notes: DocumentNoteEntity[] = [
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
    const notes: DocumentNoteEntity[] = [
      { type: "single", lane: 1, beat: beat(2, 1) }, // 메인 — aux 배열에 없음
      { type: "single", lane: 5, beat: beat(2, 1) },
    ];
    const { source } = makeFakeSource({ chart: makeChart({ notes }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestExtraNote(250, 1000)).toBe(0);
    expect(space.hitTestExtraNote(310, 1000)).toBeNull();
  });

  it("hitTestNoteEnd: 롱노트 endBeat=2를 y=1000에서 히트(tolerance 1/16), y=1100(0.2박 차이)은 미스", () => {
    const notes: DocumentNoteEntity[] = [
      { type: "long", lane: 1, beat: beat(0, 1), endBeat: beat(2, 1) },
    ];
    const { source } = makeFakeSource({ chart: makeChart({ notes }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestNoteEnd(30, 1000)).toBe(0);
    expect(space.hitTestNoteEnd(30, 1100)).toBeNull();
  });

  describe("끝 Release가 덮은 바디 끝 핸들", () => {
    // 1～5박 싱글 바디 + 5박 Release. y=500이 1박이라 5박은 y=2500, 1/16박은 y≈31.
    const bodyWithEndRelease = (): DocumentNoteEntity[] => [
      { type: "body", lane: 1, beat: beat(1), endBeat: beat(5), holdCount: 1 },
      { type: "release", lane: 1, beat: beat(5), count: 1 },
    ];

    it("5박(y=2500)은 Release와 끝 핸들이 겹쳐 Release가 이기고 hitTestNoteEnd는 null이다", () => {
      const { source } = makeFakeSource({ chart: makeChart({ notes: bodyWithEndRelease() }) });
      const space = createTimelineSpace(source);
      expect(space.hitTestUnifiedNote(30, 2500)).toBe(1);
      expect(space.hitTestNoteEnd(30, 2500)).toBeNull();
    });

    it("Release hit 밖 바로 위 5.1박(y=2550)은 노트가 없고 hitTestNoteEnd가 바디 0을 돌려준다", () => {
      const { source } = makeFakeSource({ chart: makeChart({ notes: bodyWithEndRelease() }) });
      const space = createTimelineSpace(source);
      expect(space.hitTestUnifiedNote(30, 2550)).toBeNull();
      expect(space.hitTestNoteEnd(30, 2550)).toBe(0);
    });

    it("끝 핸들 띠 밖 5.2박(y=2600)은 hitTestNoteEnd가 null이다", () => {
      const { source } = makeFakeSource({ chart: makeChart({ notes: bodyWithEndRelease() }) });
      expect(createTimelineSpace(source).hitTestNoteEnd(30, 2600)).toBeNull();
    });

    describe("이어진 뒤 바디가 끝 핸들 띠를 덮는 연결 경계", () => {
      // holdCount 2 바디 1～5박 + 5박 Release + holdCount 1 바디 5～9박. 5.1박(y=2550)은 뒤 바디 안이다.
      const connectedBodies = (): DocumentNoteEntity[] => [
        { type: "body", lane: 1, beat: beat(1), endBeat: beat(5), holdCount: 2 },
        { type: "release", lane: 1, beat: beat(5), count: 1 },
        { type: "body", lane: 1, beat: beat(5), endBeat: beat(9), holdCount: 1 },
      ];

      it.each([
        { label: "선택 없음", selected: [] },
        { label: "앞 바디 0 선택", selected: [0] },
      ])("$label이어도 뒤 바디 2 안인 5.1박(y=2550)의 hitTestNoteEnd는 앞 바디 0이다(선택 게이트는 resolveGrab)", ({ selected }) => {
        const { source } = makeFakeSource({ chart: makeChart({ notes: connectedBodies() }), selectedNotes: new Set(selected) });
        const space = createTimelineSpace(source);
        expect(space.hitTestUnifiedNote(30, 2550)).toBe(2);
        expect(space.hitTestNoteEnd(30, 2550)).toBe(0);
      });

      it("5.125박 틱 노트가 덮는 5.1박(y=2550)은 점수 노트가 이겨 hitTestNoteEnd가 null이다", () => {
        const notes: DocumentNoteEntity[] = [...connectedBodies(), { type: "tick", lane: 1, beat: beat(41, 8), count: 1 }];
        const { source } = makeFakeSource({ chart: makeChart({ notes }) });
        const space = createTimelineSpace(source);
        expect(space.hitTestUnifiedNote(30, 2550)).toBe(3);
        expect(space.hitTestNoteEnd(30, 2550)).toBeNull();
      });

      it("5.125박 구형 single 노트가 덮는 5.1박(y=2550)은 띠를 막아 hitTestNoteEnd가 null이다", () => {
        const notes: DocumentNoteEntity[] = [...connectedBodies(), { type: "single", lane: 1, beat: beat(41, 8) }];
        const { source } = makeFakeSource({ chart: makeChart({ notes }) });
        const space = createTimelineSpace(source);
        expect(space.hitTestUnifiedNote(30, 2550)).toBe(3);
        expect(space.hitTestNoteEnd(30, 2550)).toBeNull();
      });
    });

    it("Release 없는 바디는 기존처럼 끝 ±1/16박만 핸들이라 5.1박(y=2550)은 null이다", () => {
      const { source } = makeFakeSource({ chart: makeChart({ notes: [bodyWithEndRelease()[0]] }) });
      const space = createTimelineSpace(source);
      expect(space.hitTestNoteEnd(30, 2500)).toBe(0);
      expect(space.hitTestNoteEnd(30, 2550)).toBeNull();
    });
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

  it("hitTestRestZoneEnd: lane 2 restZone endBeat=3을 y=1500에서 히트(tolerance 1/16), y=1400(0.2박 차이)·다른 lane(x=30)은 미스", () => {
    const restZones: RestZone[] = [{ lane: 2, beat: beat(1, 1), endBeat: beat(3, 1) }];
    const { source } = makeFakeSource({ chart: makeChart({ restZones }) });
    const space = createTimelineSpace(source);
    expect(space.hitTestRestZoneEnd(90, 1500)).toBe(0);
    expect(space.hitTestRestZoneEnd(90, 1400)).toBeNull();
    expect(space.hitTestRestZoneEnd(30, 1500)).toBeNull();
  });

  it("hitTestRestZoneEnd: chart.restZones가 없으면(undefined) 항상 null(하위호환)", () => {
    const { source } = makeFakeSource({ chart: makeChart() });
    const space = createTimelineSpace(source);
    expect(space.hitTestRestZoneEnd(90, 1500)).toBeNull();
  });

});
