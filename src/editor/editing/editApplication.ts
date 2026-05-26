import type { Chart, ExtraNoteEntity, Lane, NoteEntity, RangeNote } from "../../shared";
import { beatEq } from "../../shared";

const DEFAULT_POINT_TOLERANCE = 1 / 16;

function beatFloatOf(beat: { n: number; d: number }): number {
  return beat.n / beat.d;
}

function isRangeNote(note: NoteEntity): note is RangeNote {
  return (
    note.type === "long" ||
    note.type === "doubleLong" ||
    note.type === "trillLong"
  );
}

function isMatchingRangeZone(
  zone: { lane: Lane; beat: { n: number; d: number }; endBeat: { n: number; d: number } },
  note: RangeNote,
): boolean {
  return (
    zone.lane === note.lane &&
    beatEq(zone.beat, note.beat) &&
    beatEq(zone.endBeat, note.endBeat)
  );
}

export function deleteChartNoteAtIndex(chart: Chart, index: number): Chart | null {
  if (index < 0 || index >= chart.notes.length) return null;
  return deleteChartNotesAtIndices(chart, new Set([index]));
}

export function deleteChartNotesAtIndices(chart: Chart, indices: ReadonlySet<number>): Chart {
  if (indices.size === 0) return chart;

  const selectedNotes = Array.from(indices)
    .map((index) => chart.notes[index])
    .filter((note): note is NoteEntity => Boolean(note));

  const notes = chart.notes.filter((_note, index) => !indices.has(index));
  const trillZones = chart.trillZones.filter((zone) => (
    !selectedNotes.some((note) => isRangeNote(note) && isMatchingRangeZone(zone, note))
  ));

  return {
    ...chart,
    notes,
    trillZones,
  };
}

export function deleteChartNoteAtLaneBeat(
  chart: Chart,
  input: {
    lane: Lane;
    beatFloat: number;
    pointTolerance?: number;
  },
): Chart | null {
  const tolerance = input.pointTolerance ?? DEFAULT_POINT_TOLERANCE;

  for (let i = 0; i < chart.notes.length; i++) {
    const note = chart.notes[i];
    if (note.lane !== input.lane) continue;

    const startBeat = beatFloatOf(note.beat);
    if (isRangeNote(note)) {
      const endBeat = beatFloatOf(note.endBeat);
      if (input.beatFloat >= startBeat && input.beatFloat <= endBeat) {
        return deleteChartNoteAtIndex(chart, i);
      }
    } else if (Math.abs(input.beatFloat - startBeat) < tolerance) {
      return deleteChartNoteAtIndex(chart, i);
    }
  }

  return null;
}

export function deleteExtraNoteAtIndex(
  extraNotes: readonly ExtraNoteEntity[],
  index: number,
): ExtraNoteEntity[] | null {
  if (index < 0 || index >= extraNotes.length) return null;
  return deleteExtraNotesAtIndices(extraNotes, new Set([index]));
}

export function deleteExtraNotesAtIndices(
  extraNotes: readonly ExtraNoteEntity[],
  indices: ReadonlySet<number>,
): ExtraNoteEntity[] {
  if (indices.size === 0) return [...extraNotes];
  return extraNotes.filter((_note, index) => !indices.has(index));
}

export function deleteExtraNoteAtLaneBeat(
  extraNotes: readonly ExtraNoteEntity[],
  input: {
    extraLane: number;
    beatFloat: number;
    pointTolerance?: number;
  },
): ExtraNoteEntity[] | null {
  const tolerance = input.pointTolerance ?? DEFAULT_POINT_TOLERANCE;

  for (let i = 0; i < extraNotes.length; i++) {
    const note = extraNotes[i];
    if (note.extraLane !== input.extraLane) continue;

    const startBeat = beatFloatOf(note.beat);
    if ("endBeat" in note) {
      const endBeat = beatFloatOf(note.endBeat);
      if (input.beatFloat >= startBeat && input.beatFloat <= endBeat) {
        return deleteExtraNoteAtIndex(extraNotes, i);
      }
    } else if (Math.abs(input.beatFloat - startBeat) < tolerance) {
      return deleteExtraNoteAtIndex(extraNotes, i);
    }
  }

  return null;
}

export function deleteEmptyTrillZoneAtIndex(
  chart: Chart,
  index: number,
): { chart: Chart | null; blockedReason?: string } {
  const zone = chart.trillZones[index];
  if (!zone) return { chart: null };

  const hasNotes = chart.notes.some((note) => (
    note.lane === zone.lane &&
    beatFloatOf(note.beat) >= beatFloatOf(zone.beat) &&
    beatFloatOf(note.beat) <= beatFloatOf(zone.endBeat)
  ));

  if (hasNotes) {
    return {
      chart: null,
      blockedReason: "Zone contains notes — remove them first",
    };
  }

  return {
    chart: {
      ...chart,
      trillZones: chart.trillZones.filter((_zone, zoneIndex) => zoneIndex !== index),
    },
  };
}
