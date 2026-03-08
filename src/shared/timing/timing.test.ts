import { describe, it, expect } from "vitest";
import { beatToMs, msToBeat, bpmAt, measureStartBeat, extractBpmMarkers, extractTimeSignatures } from "./index";
import { beat, beatToFloat, BEAT_ZERO } from "../types/beat";
import type { BpmMarker, TimeSignatureMarker, EventMarker } from "../types/chart";

const SINGLE_BPM: BpmMarker[] = [{ beat: BEAT_ZERO, bpm: 120 }];

// ---------------------------------------------------------------------------
// beatToMs
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// msToBeat
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// bpmAt
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// measureStartBeat
// ---------------------------------------------------------------------------

describe("measureStartBeat", () => {
  const TS_4_4: TimeSignatureMarker[] = [
    { measure: 0, beatPerMeasure: beat(4) },
  ];

  it("마디 0 = beat 0", () => {
    const result = measureStartBeat(0, TS_4_4);
    expect(beatToFloat(result)).toBe(0);
  });

  it("4/4에서 마디 1 = beat 4", () => {
    const result = measureStartBeat(1, TS_4_4);
    expect(beatToFloat(result)).toBe(4);
  });

  it("4/4에서 마디 4 = beat 16", () => {
    const result = measureStartBeat(4, TS_4_4);
    expect(beatToFloat(result)).toBe(16);
  });

  it("3/4 박자 처리", () => {
    const ts: TimeSignatureMarker[] = [
      { measure: 0, beatPerMeasure: beat(3) },
    ];
    // 마디 4 = 4 * 3 = 12박
    expect(beatToFloat(measureStartBeat(4, ts))).toBe(12);
  });

  it("박자 변경 구간 처리", () => {
    const ts: TimeSignatureMarker[] = [
      { measure: 0, beatPerMeasure: beat(4) },  // 마디 0~7: 4박/마디
      { measure: 8, beatPerMeasure: beat(3) },   // 마디 8~: 3박/마디
    ];

    // 마디 8 = 8 * 4 = 32박
    expect(beatToFloat(measureStartBeat(8, ts))).toBe(32);

    // 마디 10 = 32 + 2 * 3 = 38박
    expect(beatToFloat(measureStartBeat(10, ts))).toBe(38);
  });

  it("빈 배열이면 에러", () => {
    expect(() => measureStartBeat(0, [])).toThrow("timeSignatures must not be empty");
  });
});

// ---------------------------------------------------------------------------
// extractBpmMarkers
// ---------------------------------------------------------------------------

describe("extractBpmMarkers", () => {
  it("bpm 필드가 있는 이벤트만 추출", () => {
    const events: EventMarker[] = [
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, bpm: 120, beatPerMeasure: beat(4) },
      { beat: beat(4), endBeat: beat(4), text: "hello" },
      { beat: beat(8), endBeat: beat(8), bpm: 180 },
    ];

    const result = extractBpmMarkers(events);
    expect(result).toHaveLength(2);
    expect(result[0].bpm).toBe(120);
    expect(result[1].bpm).toBe(180);
  });

  it("beat 오름차순 정렬", () => {
    const events: EventMarker[] = [
      { beat: beat(8), endBeat: beat(8), bpm: 180 },
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, bpm: 120 },
    ];

    const result = extractBpmMarkers(events);
    expect(result[0].bpm).toBe(120);
    expect(result[1].bpm).toBe(180);
  });

  it("bpm 이벤트가 없으면 빈 배열", () => {
    const events: EventMarker[] = [
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, text: "hello" },
    ];
    expect(extractBpmMarkers(events)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractTimeSignatures
// ---------------------------------------------------------------------------

describe("extractTimeSignatures", () => {
  it("beatPerMeasure 필드가 있는 이벤트만 추출", () => {
    const events: EventMarker[] = [
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, bpm: 120, beatPerMeasure: beat(4) },
      { beat: beat(4), endBeat: beat(4), text: "hello" },
    ];

    const result = extractTimeSignatures(events);
    expect(result).toHaveLength(1);
    expect(beatToFloat(result[0].beatPerMeasure)).toBe(4);
    expect(result[0].measure).toBe(0);
  });

  it("박자 변경 시 마디 인덱스 계산", () => {
    const events: EventMarker[] = [
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, beatPerMeasure: beat(4) },
      { beat: beat(16), endBeat: beat(16), beatPerMeasure: beat(3) }, // 16박 = 4마디 후
    ];

    const result = extractTimeSignatures(events);
    expect(result).toHaveLength(2);
    expect(result[0].measure).toBe(0);
    expect(result[1].measure).toBe(4);
  });

  it("빈 이벤트 배열이면 빈 배열", () => {
    expect(extractTimeSignatures([])).toHaveLength(0);
  });

  it("연속 3회 박자 변경 — 4/4→3/4→5/4 마디 번호 추적", () => {
    const events: EventMarker[] = [
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, beatPerMeasure: beat(4) },
      { beat: beat(8), endBeat: beat(8), beatPerMeasure: beat(3) },    // 마디 2
      { beat: beat(14), endBeat: beat(14), beatPerMeasure: beat(5) },  // 마디 4 (8 + 3*2 = 14)
    ];

    const result = extractTimeSignatures(events);
    expect(result).toHaveLength(3);
    expect(result[0].measure).toBe(0);
    expect(result[1].measure).toBe(2);
    expect(result[2].measure).toBe(4);
  });

  it("7/2 분수 박자에서 마디 번호 계산 — beat 7 = 마디 2", () => {
    const events: EventMarker[] = [
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, beatPerMeasure: beat(7, 2) },
      { beat: beat(7), endBeat: beat(7), beatPerMeasure: beat(4) },  // 7 / 3.5 = 마디 2
    ];

    const result = extractTimeSignatures(events);
    expect(result).toHaveLength(2);
    expect(result[0].measure).toBe(0);
    expect(result[1].measure).toBe(2);
  });

  it("이벤트 정렬 순서가 뒤섞여 있어도 beat 순으로 처리", () => {
    const events: EventMarker[] = [
      { beat: beat(16), endBeat: beat(16), beatPerMeasure: beat(3) },
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, beatPerMeasure: beat(4) },
    ];

    const result = extractTimeSignatures(events);
    expect(result).toHaveLength(2);
    expect(result[0].measure).toBe(0);
    expect(result[1].measure).toBe(4);
  });

  it("같은 위치에서 박자표를 변경해도 마디 번호 유지", () => {
    // 마디 0에서 바로 박자 변경 (beat 0)
    const events: EventMarker[] = [
      { beat: BEAT_ZERO, endBeat: BEAT_ZERO, beatPerMeasure: beat(4) },
    ];

    const result = extractTimeSignatures(events);
    expect(result).toHaveLength(1);
    expect(result[0].measure).toBe(0);
    expect(beatToFloat(result[0].beatPerMeasure)).toBe(4);
  });
});
