import { describe, it, expect } from "vitest";
import { beatToMs, msToBeat, bpmAt } from "./index";
import { beat, BEAT_ZERO } from "../types/beat";
import type { BpmMarker } from "../types/chart";

const SINGLE_BPM: BpmMarker[] = [{ beat: BEAT_ZERO, bpm: 120 }];

describe("beatToMs", () => {
  it("0박 = offsetMs", () => {
    expect(beatToMs(BEAT_ZERO, SINGLE_BPM)).toBe(0);
    expect(beatToMs(BEAT_ZERO, SINGLE_BPM, 1000)).toBe(1000);
  });

  it("120 BPM에서 1박 = 500ms", () => {
    expect(beatToMs(beat(1), SINGLE_BPM)).toBe(500);
  });

  it("120 BPM에서 4박 = 2000ms", () => {
    expect(beatToMs(beat(4), SINGLE_BPM)).toBe(2000);
  });

  it("분수 박자도 처리", () => {
    // 1/2박 = 250ms at 120 BPM
    expect(beatToMs(beat(1, 2), SINGLE_BPM)).toBe(250);
  });

  it("offset 적용", () => {
    expect(beatToMs(beat(1), SINGLE_BPM, 200)).toBe(700);
  });

  it("BPM 변경 구간을 올바르게 처리", () => {
    const markers: BpmMarker[] = [
      { beat: BEAT_ZERO, bpm: 120 }, // 0~4박: 500ms/beat
      { beat: beat(4), bpm: 60 },    // 4박~: 1000ms/beat
    ];

    // 4박까지: 4 * 500 = 2000ms
    expect(beatToMs(beat(4), markers)).toBe(2000);

    // 6박: 2000 + 2 * 1000 = 4000ms
    expect(beatToMs(beat(6), markers)).toBe(4000);
  });

  it("3개 이상의 BPM 마커 처리", () => {
    const markers: BpmMarker[] = [
      { beat: BEAT_ZERO, bpm: 120 }, // 500ms/beat
      { beat: beat(4), bpm: 60 },    // 1000ms/beat
      { beat: beat(8), bpm: 240 },   // 250ms/beat
    ];

    // 10박: 4*500 + 4*1000 + 2*250 = 2000 + 4000 + 500 = 6500ms
    expect(beatToMs(beat(10), markers)).toBe(6500);
  });

  it("빈 마커 배열이면 에러", () => {
    expect(() => beatToMs(BEAT_ZERO, [])).toThrow("bpmMarkers must not be empty");
  });
});

describe("msToBeat", () => {
  it("0ms = 0박", () => {
    expect(msToBeat(0, SINGLE_BPM)).toBe(0);
  });

  it("120 BPM에서 500ms = 1박", () => {
    expect(msToBeat(500, SINGLE_BPM)).toBe(1);
  });

  it("120 BPM에서 2000ms = 4박", () => {
    expect(msToBeat(2000, SINGLE_BPM)).toBe(4);
  });

  it("offset 적용", () => {
    // 700ms with offset 200 → 실효 500ms → 1박
    expect(msToBeat(700, SINGLE_BPM, 200)).toBe(1);
  });

  it("BPM 변경 구간을 올바르게 처리", () => {
    const markers: BpmMarker[] = [
      { beat: BEAT_ZERO, bpm: 120 },
      { beat: beat(4), bpm: 60 },
    ];

    // 2000ms → 4박 (경계)
    expect(msToBeat(2000, markers)).toBe(4);

    // 4000ms → 4 + (4000-2000)/1000 = 4 + 2 = 6박
    expect(msToBeat(4000, markers)).toBe(6);
  });

  it("beatToMs와 msToBeat는 역함수", () => {
    const markers: BpmMarker[] = [
      { beat: BEAT_ZERO, bpm: 150 },
      { beat: beat(8), bpm: 90 },
    ];

    for (const b of [0, 1, 4, 7.5, 8, 10, 12]) {
      const ms = beatToMs(beat(Math.floor(b * 4), 4), markers);
      const roundTrip = msToBeat(ms, markers);
      expect(roundTrip).toBeCloseTo(b, 10);
    }
  });

  it("빈 마커 배열이면 에러", () => {
    expect(() => msToBeat(0, [])).toThrow("bpmMarkers must not be empty");
  });
});

describe("bpmAt", () => {
  it("단일 BPM", () => {
    expect(bpmAt(beat(10), SINGLE_BPM)).toBe(120);
  });

  it("변경 구간에서 올바른 BPM 반환", () => {
    const markers: BpmMarker[] = [
      { beat: BEAT_ZERO, bpm: 120 },
      { beat: beat(4), bpm: 60 },
    ];

    expect(bpmAt(BEAT_ZERO, markers)).toBe(120);
    expect(bpmAt(beat(3), markers)).toBe(120);
    expect(bpmAt(beat(4), markers)).toBe(60);
    expect(bpmAt(beat(100), markers)).toBe(60);
  });

  it("빈 마커 배열이면 에러", () => {
    expect(() => bpmAt(BEAT_ZERO, [])).toThrow("bpmMarkers must not be empty");
  });
});
