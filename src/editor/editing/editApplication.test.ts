import { describe, expect, it } from "vitest";
import type { Chart, Lane, NoteEntity, TrillZone, RestZone } from "../../shared";
import { beat } from "../../shared";
import {
  deleteChartNoteAtIndex,
  deleteChartNoteAtLaneBeat,
  deleteChartNotesAtIndices,
  deleteEmptyTrillZoneAtIndex,
  deleteRestZoneAtIndex,
} from "./editApplication";

function makeChart(input: {
  notes?: NoteEntity[];
  trillZones?: TrillZone[];
  restZones?: RestZone[];
} = {}): Chart {
  return {
    meta: {
      title: "Test",
      artist: "Tester",
      difficultyLabel: "HARD",
      difficultyLevel: 10,
      imageFile: "",
      audioFile: "",
      previewAudioFile: "",
      offsetMs: 0,
    },
    notes: input.notes ?? [],
    events: [
      { type: "bpm", beat: beat(0), bpm: 120 },
      { type: "timeSignature", beat: beat(0), beatPerMeasure: beat(4) },
    ],
    trillZones: input.trillZones ?? [],
    restZones: input.restZones ?? [],
  };
}

describe("editor edit application", () => {
  it("deletes one chart note by index", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(0) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
      ],
    });

    const updated = deleteChartNoteAtIndex(chart, 0);

    expect(updated?.notes).toEqual([{ type: "single", lane: 2 as Lane, beat: beat(1) }]);
  });

  it("removes the matching trill zone when deleting a range note", () => {
    const matchingZone = { lane: 3 as Lane, beat: beat(2), endBeat: beat(4) };
    const chart = makeChart({
      notes: [
        { type: "trillLong", lane: 3 as Lane, beat: beat(2), endBeat: beat(4) },
        { type: "single", lane: 1 as Lane, beat: beat(8) },
      ],
      trillZones: [
        matchingZone,
        { lane: 1 as Lane, beat: beat(0), endBeat: beat(2) },
      ],
    });

    const updated = deleteChartNoteAtIndex(chart, 0);

    expect(updated?.notes).toHaveLength(1);
    expect(updated?.trillZones).toEqual([{ lane: 1 as Lane, beat: beat(0), endBeat: beat(2) }]);
  });

  it("deletes multiple selected chart notes and their matching trill zones", () => {
    const chart = makeChart({
      notes: [
        { type: "long", lane: 1 as Lane, beat: beat(0), endBeat: beat(4) },
        { type: "single", lane: 2 as Lane, beat: beat(1) },
        { type: "single", lane: 3 as Lane, beat: beat(2) },
      ],
      trillZones: [
        { lane: 1 as Lane, beat: beat(0), endBeat: beat(4) },
        { lane: 4 as Lane, beat: beat(8), endBeat: beat(12) },
      ],
    });

    const updated = deleteChartNotesAtIndices(chart, new Set([0, 2]));

    expect(updated.notes).toEqual([{ type: "single", lane: 2 as Lane, beat: beat(1) }]);
    expect(updated.trillZones).toEqual([{ lane: 4 as Lane, beat: beat(8), endBeat: beat(12) }]);
  });

  it("deletes chart notes by lane and beat for drag-delete", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(1) },
        { type: "long", lane: 2 as Lane, beat: beat(2), endBeat: beat(4) },
      ],
      trillZones: [{ lane: 2 as Lane, beat: beat(2), endBeat: beat(4) }],
    });

    expect(deleteChartNoteAtLaneBeat(chart, { lane: 1 as Lane, beatFloat: 1 + 1 / 32 })?.notes).toHaveLength(1);
    const deletedRange = deleteChartNoteAtLaneBeat(chart, { lane: 2 as Lane, beatFloat: 3 });
    expect(deletedRange?.notes).toEqual([{ type: "single", lane: 1 as Lane, beat: beat(1) }]);
    expect(deletedRange?.trillZones).toEqual([]);
  });

  it("보조 노트(lane 5+)도 통합 lane/beat 드래그 삭제 한 경로로 지워진다 (RFD 0018 ④d)", () => {
    const chart = makeChart({
      notes: [
        { type: "single", lane: 1 as Lane, beat: beat(1) },
        { type: "long", lane: 5, beat: beat(2), endBeat: beat(4) },
        { type: "single", lane: 6, beat: beat(8) },
      ],
    });

    // lane5 롱노트 바디(beat 3) 삭제
    const deletedAuxRange = deleteChartNoteAtLaneBeat(chart, { lane: 5, beatFloat: 3 });
    expect(deletedAuxRange?.notes.map((n) => n.lane)).toEqual([1, 6]);
    // lane6 점노트 삭제
    const deletedAuxPoint = deleteChartNoteAtLaneBeat(chart, { lane: 6, beatFloat: 8 });
    expect(deletedAuxPoint?.notes.map((n) => n.lane)).toEqual([1, 5]);
  });

  it("blocks deleting non-empty trill zones", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 1 as Lane, beat: beat(2) }],
      trillZones: [{ lane: 1 as Lane, beat: beat(0), endBeat: beat(4) }],
    });

    expect(deleteEmptyTrillZoneAtIndex(chart, 0)).toEqual({
      chart: null,
      blockedReason: "Zone contains notes — remove them first",
    });
  });
});

// ---------------------------------------------------------------------------
// deleteRestZoneAtIndex — trillZone 삭제 미러 (RFD 0019, 내부 노트 개념 없음)
// ---------------------------------------------------------------------------

describe("deleteRestZoneAtIndex", () => {
  it("restZone 3개 중 인덱스 1만 filter-out — 나머지 restZones와 원본 chart는 불변", () => {
    const chart = makeChart({
      restZones: [
        { lane: 1 as Lane, beat: beat(0), endBeat: beat(2) },
        { lane: 2 as Lane, beat: beat(0), endBeat: beat(4) },
        { lane: 3 as Lane, beat: beat(8), endBeat: beat(12) },
      ],
    });

    const result = deleteRestZoneAtIndex(chart, 1);
    expect(result?.restZones).toEqual([
      { lane: 1, beat: beat(0), endBeat: beat(2) },
      { lane: 3, beat: beat(8), endBeat: beat(12) },
    ]);
    // 원본 불변
    expect(chart.restZones).toHaveLength(3);
  });

  it("restZone이 노트를 덮고 있어도 삭제된다 (trillZone과 달리 empty 가드 없음, 노트는 보존)", () => {
    const chart = makeChart({
      notes: [{ type: "single", lane: 2 as Lane, beat: beat(1) }],
      restZones: [{ lane: 2 as Lane, beat: beat(0), endBeat: beat(4) }],
    });

    const result = deleteRestZoneAtIndex(chart, 0);
    expect(result?.restZones).toEqual([]);
    expect(result?.notes).toHaveLength(1);
  });

  it("범위 밖 인덱스(-1, 1)면 null", () => {
    const chart = makeChart({
      restZones: [{ lane: 1 as Lane, beat: beat(0), endBeat: beat(2) }],
    });
    expect(deleteRestZoneAtIndex(chart, -1)).toBeNull();
    expect(deleteRestZoneAtIndex(chart, 1)).toBeNull();
  });

  it("restZones 필드가 없는(optional 부재) 차트에서 인덱스 0이면 null", () => {
    const chart = makeChart();
    delete chart.restZones;
    expect(deleteRestZoneAtIndex(chart, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 트릴 쌍 쌍소멸 — trill 헤드 ↔ trillLong 바디는 어느 쪽을 지우든 함께 지운다
// (트릴 롱은 헤드 필수 — validateTrillLong, RFD 0009)
// ---------------------------------------------------------------------------

describe("트릴 쌍 쌍소멸", () => {
  const trillPairChart = () =>
    makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(0) }, // 헤드
        { type: "trillLong", lane: 1 as Lane, beat: beat(0), endBeat: beat(2) }, // 바디
        { type: "single", lane: 2 as Lane, beat: beat(0) }, // 무관 노트
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(0), endBeat: beat(2) }],
    });

  it("trill 헤드를 삭제하면 같은 레인·박의 trillLong 바디도 함께 삭제된다", () => {
    const result = deleteChartNoteAtIndex(trillPairChart(), 0)!;

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].type).toBe("single"); // 쌍만 소멸, 무관 노트 유지
  });

  it("trillLong 바디를 삭제하면 헤드도 함께 삭제되고 매칭 트릴존도 정리된다", () => {
    const result = deleteChartNoteAtIndex(trillPairChart(), 1)!;

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].type).toBe("single");
    expect(result.trillZones).toHaveLength(0); // 기존 존 정리 규칙과 결합
  });

  it("우클릭 드래그 경로(deleteChartNoteAtLaneBeat)로 헤드를 지목해도 쌍소멸한다", () => {
    const result = deleteChartNoteAtLaneBeat(trillPairChart(), { lane: 1 as Lane, beatFloat: 0 })!;

    expect(result.notes.some((n) => n.type === "trillLong")).toBe(false);
    expect(result.notes.some((n) => n.type === "trill")).toBe(false);
  });

  it("다른 박에서 시작하는 trill 노트는 쌍이 아니므로 확장하지 않는다", () => {
    const chart = makeChart({
      notes: [
        { type: "trill", lane: 1 as Lane, beat: beat(1) }, // 구간 안이지만 시작 박이 다름
        { type: "trillLong", lane: 1 as Lane, beat: beat(0), endBeat: beat(2) },
      ],
      trillZones: [{ lane: 1 as Lane, beat: beat(0), endBeat: beat(2) }],
    });

    const result = deleteChartNotesAtIndices(chart, new Set([0]));

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].type).toBe("trillLong");
  });
});
