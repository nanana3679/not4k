import { describe, it, expect } from "vitest";
import { createChartTiming, type ChartTimingSource } from "./chartTiming";
import { beat, BEAT_ZERO } from "../types/beat";
import type { NoteEntity, TrillZone, ChartEvent } from "../types/chart";

function makeSource(overrides: Partial<ChartTimingSource>): ChartTimingSource {
  return {
    notes: [],
    trillZones: [],
    events: [{ type: "bpm", beat: BEAT_ZERO, bpm: 120 }],
    meta: { offsetMs: 0 },
    ...overrides,
  };
}

describe("createChartTiming", () => {
  it("120 BPM offset 0에서 0박·1박·2박 노트 → 0/500/1000ms", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: BEAT_ZERO },
      { type: "single", lane: 1, beat: beat(1) },
      { type: "single", lane: 1, beat: beat(2) },
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.noteTimesMs.get(0)).toBe(0);
    expect(timing.noteTimesMs.get(1)).toBe(500);
    expect(timing.noteTimesMs.get(2)).toBe(1000);
  });

  it("offsetMs 30이면 모든 노트 시간에 30ms 가산", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: BEAT_ZERO },
      { type: "single", lane: 1, beat: beat(1) },
    ];
    const timing = createChartTiming(makeSource({ notes, meta: { offsetMs: 30 } }));
    expect(timing.noteTimesMs.get(0)).toBe(30);
    expect(timing.noteTimesMs.get(1)).toBe(530);
  });

  it("BPM 변경(0박 120→4박 240)에서 6박 노트 = 2500ms", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: BEAT_ZERO, bpm: 120 },
      { type: "bpm", beat: beat(4), bpm: 240 },
    ];
    const notes: NoteEntity[] = [{ type: "single", lane: 1, beat: beat(6) }];
    const timing = createChartTiming(makeSource({ notes, events }));
    expect(timing.noteTimesMs.get(0)).toBe(2500);
  });

  it("노트 0개면 noteTimesMs·noteEndTimesMs 모두 빈 Map", () => {
    const timing = createChartTiming(makeSource({ notes: [] }));
    expect(timing.noteTimesMs.size).toBe(0);
    expect(timing.noteEndTimesMs.size).toBe(0);
  });

  it("Map 키는 chart.notes 배열 인덱스 그대로", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(2) },
      { type: "single", lane: 1, beat: BEAT_ZERO },
      { type: "single", lane: 1, beat: beat(1) },
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.noteTimesMs.get(0)).toBe(1000);
    expect(timing.noteTimesMs.get(1)).toBe(0);
    expect(timing.noteTimesMs.get(2)).toBe(500);
  });

  it("구간 노트만 noteEndTimesMs에 등록 — 포인트 노트 인덱스는 get 시 undefined", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: BEAT_ZERO },
      { type: "long", lane: 1, beat: beat(1), endBeat: beat(3) },
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.noteEndTimesMs.get(0)).toBeUndefined();
    expect(timing.noteEndTimesMs.get(1)).toBe(1500);
  });

  it("길이 0 구간 노트(beat == endBeat)는 시작 ms == 끝 ms", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: beat(2), endBeat: beat(2) },
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.noteTimesMs.get(0)).toBe(1000);
    expect(timing.noteEndTimesMs.get(0)).toBe(1000);
  });

  it("BPM 마커 없는 차트에 노트가 있으면 에러", () => {
    const notes: NoteEntity[] = [{ type: "single", lane: 1, beat: beat(1) }];
    expect(() => createChartTiming(makeSource({ notes, events: [] }))).toThrow();
  });

  it("같은 레인 trillZone 2개는 시작 ms 오름차순 정렬", () => {
    const trillZones: TrillZone[] = [
      { lane: 1, beat: beat(4), endBeat: beat(6) },
      { lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const timing = createChartTiming(makeSource({ trillZones }));
    expect(timing.trillZoneStartTimesMs.get(1)).toEqual([500, 2000]);
  });

  it("trillZone 없는 레인은 Map에 키 없음", () => {
    const trillZones: TrillZone[] = [
      { lane: 1, beat: beat(1), endBeat: beat(2) },
    ];
    const timing = createChartTiming(makeSource({ trillZones }));
    expect(timing.trillZoneStartTimesMs.has(1)).toBe(true);
    expect(timing.trillZoneStartTimesMs.has(2)).toBe(false);
  });

  it("beatToMs(0박) = offsetMs", () => {
    const timing = createChartTiming(makeSource({ meta: { offsetMs: 42 } }));
    expect(timing.beatToMs(BEAT_ZERO)).toBe(42);
  });

  it("BPM 변경 구간을 넘는 beat도 올바르게 변환", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: BEAT_ZERO, bpm: 120 },
      { type: "bpm", beat: beat(4), bpm: 240 },
    ];
    const timing = createChartTiming(makeSource({ events }));
    expect(timing.beatToMs(beat(6))).toBe(2500);
  });

  it("4/4 120 BPM offset 0에서 limit 4000ms → [0, 2000, 4000]", () => {
    const events: ChartEvent[] = [
      { type: "bpm", beat: BEAT_ZERO, bpm: 120 },
      { type: "timeSignature", beat: BEAT_ZERO, beatPerMeasure: beat(4) },
    ];
    const timing = createChartTiming(makeSource({ events }));
    expect(timing.measureStartsMs(4000)).toEqual([0, 2000, 4000]);
  });

  it("박자표 마커 없으면 빈 배열", () => {
    const timing = createChartTiming(makeSource({}));
    expect(timing.measureStartsMs(4000)).toEqual([]);
  });

  it("싱글 1·더블 1·롱 바디 1이면 totalJudgments = 4", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: BEAT_ZERO },
      { type: "double", lane: 2, beat: beat(1) },
      { type: "long", lane: 3, beat: beat(2), endBeat: beat(3) },
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.judgmentCounts().totalJudgments).toBe(4);
  });

  it("doubleLong 바디는 2회, long·trillLong 바디는 1회로 집계", () => {
    const notes: NoteEntity[] = [
      { type: "doubleLong", lane: 1, beat: BEAT_ZERO, endBeat: beat(1) },
      { type: "long", lane: 2, beat: beat(1), endBeat: beat(2) },
      { type: "trillLong", lane: 3, beat: beat(2), endBeat: beat(3) },
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.judgmentCounts().totalJudgments).toBe(4);
  });

  it("holdOnly 롱노트도 바디 1회로 집계", () => {
    const notes: NoteEntity[] = [
      { type: "long", lane: 1, beat: BEAT_ZERO, endBeat: beat(1), holdOnly: true },
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.judgmentCounts().totalJudgments).toBe(1);
  });

  it("cutoff 1000ms면 1000ms 미만 노트의 판정 수만 skippedJudgments", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: BEAT_ZERO }, // 0ms
      { type: "single", lane: 1, beat: beat(1) }, // 500ms
      { type: "double", lane: 2, beat: beat(3) }, // 1500ms, count 2
    ];
    const timing = createChartTiming(makeSource({ notes }));
    // 0ms, 500ms 노트만 skip (각 1회) = 2, 1500ms 더블은 skip 안 됨
    expect(timing.judgmentCounts(1000).skippedJudgments).toBe(2);
  });

  it("noteTime == cutoff인 노트는 skip 안 됨 (strict <)", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: beat(2) }, // 1000ms
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.judgmentCounts(1000).skippedJudgments).toBe(0);
  });

  it("cutoff 0이면 skippedJudgments 0", () => {
    const notes: NoteEntity[] = [
      { type: "single", lane: 1, beat: BEAT_ZERO },
      { type: "single", lane: 1, beat: beat(1) },
    ];
    const timing = createChartTiming(makeSource({ notes }));
    expect(timing.judgmentCounts(0).skippedJudgments).toBe(0);
  });

  it("노트 0개면 totalJudgments 0, skippedJudgments 0", () => {
    const timing = createChartTiming(makeSource({ notes: [] }));
    const counts = timing.judgmentCounts(1000);
    expect(counts.totalJudgments).toBe(0);
    expect(counts.skippedJudgments).toBe(0);
  });
});
