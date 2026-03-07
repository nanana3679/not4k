/**
 * Hit test utilities for timeline entities.
 *
 * Pure functions that determine which entity (note, extra note) is at a given
 * (lane, beatFloat) position. Used for hover, click, and delete interactions.
 * All functions use raw (unsnapped) beat values for snap-independent detection.
 */

import type { NoteEntity, ExtraNoteEntity } from "../../shared";

/** Tolerance for point note hit detection (in beats) */
const POINT_NOTE_TOLERANCE = 1 / 16;

/** Tolerance for snap-position note detection (tighter, exact match) */
const SNAP_POSITION_TOLERANCE = 1 / 32;

/**
 * Find a note at the given lane and beat position.
 * Returns the index of the first matching note, or null.
 */
export function hitTestNoteAt(
  notes: readonly NoteEntity[],
  lane: number,
  beatFloat: number,
  tolerance: number = POINT_NOTE_TOLERANCE,
): number | null {
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.lane !== lane) continue;

    const nb = note.beat.n / note.beat.d;
    if ("endBeat" in note) {
      const eb = note.endBeat.n / note.endBeat.d;
      if (beatFloat >= nb - tolerance && beatFloat <= eb + tolerance) return i;
    } else {
      if (Math.abs(beatFloat - nb) < tolerance) return i;
    }
  }
  return null;
}

/**
 * Find an extra note at the given extra lane and beat position.
 * Returns the index of the first matching extra note, or null.
 */
export function hitTestExtraNoteAt(
  extraNotes: readonly ExtraNoteEntity[],
  extraLane: number,
  beatFloat: number,
  tolerance: number = POINT_NOTE_TOLERANCE,
): number | null {
  for (let i = 0; i < extraNotes.length; i++) {
    const note = extraNotes[i];
    if (note.extraLane !== extraLane) continue;

    const nb = note.beat.n / note.beat.d;
    if ("endBeat" in note) {
      const eb = note.endBeat.n / note.endBeat.d;
      if (beatFloat >= nb - tolerance && beatFloat <= eb + tolerance) return i;
    } else {
      if (Math.abs(beatFloat - nb) < tolerance) return i;
    }
  }
  return null;
}

/**
 * Check if a note exists at the snapped beat position (tighter tolerance).
 * Used to suppress ghost note when it would overlap an existing note.
 */
export function noteExistsAtSnap(
  notes: readonly NoteEntity[],
  lane: number,
  snappedBeatFloat: number,
): number | null {
  return hitTestNoteAt(notes, lane, snappedBeatFloat, SNAP_POSITION_TOLERANCE);
}

/**
 * Check if an extra note exists at the snapped beat position.
 */
export function extraNoteExistsAtSnap(
  extraNotes: readonly ExtraNoteEntity[],
  extraLane: number,
  snappedBeatFloat: number,
): number | null {
  return hitTestExtraNoteAt(extraNotes, extraLane, snappedBeatFloat, SNAP_POSITION_TOLERANCE);
}
