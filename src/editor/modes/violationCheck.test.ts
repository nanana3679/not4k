import { describe, it, expect } from "vitest";
import { beat } from "../../shared";
import type { Chart, Lane, ExtraNoteEntity } from "../../shared";
import {
  computePasteViolations,
  computeMoveViolations,
  computeExtraMoveViolations,
} from "./violationCheck";

function makeChart(overrides?: Partial<Chart>): Chart {
  return {
    meta: {
      title: "", artist: "", difficultyLabel: "NORMAL", difficultyLevel: 1,
      imageFile: "", audioFile: "", previewAudioFile: "", offsetMs: 0,
    },
    notes: [],
    trillZones: [],
    events: [
      { type: "bpm" as const, beat: beat(0), bpm: 120, editorLane: 1 },
      { type: "timeSignature" as const, beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeExtraMoveViolations — 층2 겹침 코어(extraLane 축)
// ---------------------------------------------------------------------------

describe("computeExtraMoveViolations — 엑스트라 층2 겹침 코어", () => {
  it("같은 extraLane·같은 beat에 이동한 점노트는 위반", () => {
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(2) }, // 이동 대상
      { type: "single", extraLane: 1, beat: beat(2) }, // 충돌
    ];
    const v = computeExtraMoveViolations(extra, new Set([0]));
    expect(v).toEqual(new Set([0]));
  });

  it("다른 extraLane의 같은 beat 점노트는 위반 아님", () => {
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(2) },
      { type: "single", extraLane: 2, beat: beat(2) },
    ];
    const v = computeExtraMoveViolations(extra, new Set([0]));
    expect(v.size).toBe(0);
  });

  it("SNAP_POSITION_TOLERANCE(1/32) 이내로 근접한 점노트는 위반 (같은 beat 아님)", () => {
    // beat(2)=64/32, beat(65,32)=65/32 → 1/32 차이(= tolerance)
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(65, 32) }, // 이동 대상
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const v = computeExtraMoveViolations(extra, new Set([0]));
    expect(v).toEqual(new Set([0]));
  });

  it("tolerance보다 먼 점노트는 위반 아님", () => {
    // beat(3,1)=96/32 vs beat(2)=64/32 → 32/32 차이 → 멀다
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(3) },
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const v = computeExtraMoveViolations(extra, new Set([0]));
    expect(v.size).toBe(0);
  });

  it("range 노트의 head/end 캡에 점노트가 정확히 일치하면 공존 허용(위반 아님)", () => {
    // 점노트 beat(2)가 range [beat2..beat4]의 head 캡과 정확히 일치 → 캡 공존 허용
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(2) }, // 이동 대상
      { type: "long", extraLane: 1, beat: beat(2), endBeat: beat(4) },
    ];
    const v = computeExtraMoveViolations(extra, new Set([0]));
    expect(v.size).toBe(0);
  });

  it("점노트가 range 몸통(열린 구간) 안이면 위반", () => {
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(3) }, // range [2..4] 몸통 침범
      { type: "long", extraLane: 1, beat: beat(2), endBeat: beat(4) },
    ];
    const v = computeExtraMoveViolations(extra, new Set([0]));
    expect(v).toEqual(new Set([0]));
  });

  it("함께 이동하는 동반 쌍(둘 다 movedExtraIndices)은 tolerance 근접이어도 상대 간격 불변이라 서로 제외", () => {
    // 1/32 근접(같은 beat 아님)한 두 점노트가 둘 다 이동 대상이면 근접 검사에서 제외 → 위반 아님
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(65, 32) },
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const v = computeExtraMoveViolations(extra, new Set([0, 1]));
    expect(v.size).toBe(0);
  });

  it("정확히 같은 beat 중복은 둘 다 이동 대상이어도 위반(노트 스택 불가 — placement 코어는 exact 중복을 항상 잡음)", () => {
    const extra: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(2) },
      { type: "single", extraLane: 1, beat: beat(2) },
    ];
    const v = computeExtraMoveViolations(extra, new Set([0, 1]));
    expect(v.has(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computePasteViolations — 리팩터 후 기존 의미 보존
// ---------------------------------------------------------------------------

describe("computePasteViolations — 코어 리팩터 후 의미 보존", () => {
  it("같은 레인·같은 beat 점노트 중복은 위반", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(2) }, // 붙여넣은 것
        { type: "single", lane: 1 as Lane, beat: beat(2) },
      ],
    });
    const v = computePasteViolations(chart, new Set([0]));
    expect(v.has(0)).toBe(true);
  });

  it("점노트가 롱노트 몸통 안이면 위반", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(3) }, // 붙여넣은 것 (몸통 침범)
        { type: "long", lane: 1 as Lane, beat: beat(2), endBeat: beat(4) },
      ],
    });
    const v = computePasteViolations(chart, new Set([0]));
    expect(v.has(0)).toBe(true);
  });

  it("trill이 아닌 노트가 trill zone 안이면 위반", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1 as Lane, beat: beat(2) }],
      trillZones: [{ lane: 1 as Lane, beat: beat(1), endBeat: beat(3) }],
    });
    const v = computePasteViolations(chart, new Set([0]));
    expect(v.has(0)).toBe(true);
  });

  it("trill 노트가 trill zone 밖이면 위반", () => {
    const chart = makeChart({
      notes: [{ type: "trill", lane: 1 as Lane, beat: beat(5) }],
      trillZones: [{ lane: 1 as Lane, beat: beat(1), endBeat: beat(3) }],
    });
    const v = computePasteViolations(chart, new Set([0]));
    expect(v.has(0)).toBe(true);
  });

  it("stop 이벤트 구간 안 노트는 위반", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1 as Lane, beat: beat(2) }],
      events: [
        { type: "bpm" as const, beat: beat(0), bpm: 120, editorLane: 1 },
        { type: "timeSignature" as const, beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
        { type: "stop" as const, beat: beat(1), endBeat: beat(3), editorLane: 3 },
      ],
    });
    const v = computePasteViolations(chart, new Set([0]));
    expect(v.has(0)).toBe(true);
  });

  it("빈 위치의 점노트는 위반 없음", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(5) }, // 붙여넣은 것
        { type: "single", lane: 2 as Lane, beat: beat(2) },
      ],
    });
    const v = computePasteViolations(chart, new Set([0]));
    expect(v.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeMoveViolations — 메인 층2 근접(코어 공유 확인)
// ---------------------------------------------------------------------------

describe("computeMoveViolations — 메인 점-점 근접(엑스트라와 코어 공유)", () => {
  it("메인 점노트를 tolerance 이내로 근접시키면 위반", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(65, 32) }, // 이동 대상
        { type: "single", lane: 1 as Lane, beat: beat(2) },
      ],
    });
    const v = computeMoveViolations(chart, new Set([0]));
    expect(v.has(0)).toBe(true);
  });
});
