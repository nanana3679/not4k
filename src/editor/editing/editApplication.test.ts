import { describe, expect, it } from "vitest";
import type { Chart, ExtraNoteEntity, Lane, NoteEntity, TrillZone } from "../../shared";
import { beat } from "../../shared";
import {
  deleteChartNoteAtIndex,
  deleteChartNoteAtLaneBeat,
  deleteChartNotesAtIndices,
  deleteEmptyTrillZoneAtIndex,
  deleteExtraNoteAtLaneBeat,
  deleteExtraNoteAtIndex,
  deleteExtraNotesAtIndices,
} from "./editApplication";

function makeChart(input: {
  notes?: NoteEntity[];
  trillZones?: TrillZone[];
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

  it("deletes extra notes by index, selection, and lane/beat", () => {
    const extraNotes: ExtraNoteEntity[] = [
      { type: "single", extraLane: 1, beat: beat(1) },
      { type: "long", extraLane: 2, beat: beat(2), endBeat: beat(4) },
      { type: "single", extraLane: 3, beat: beat(8) },
    ];

    expect(deleteExtraNoteAtIndex(extraNotes, 0)).toEqual(extraNotes.slice(1));
    expect(deleteExtraNotesAtIndices(extraNotes, new Set([0, 2]))).toEqual([extraNotes[1]]);
    expect(deleteExtraNoteAtLaneBeat(extraNotes, { extraLane: 2, beatFloat: 3 })).toEqual([
      extraNotes[0],
      extraNotes[2],
    ]);
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
