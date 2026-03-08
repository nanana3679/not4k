/**
 * Hit test utilities for timeline entities.
 *
 * Pure functions that determine which entity (note, extra note) is at a given
 * (lane, beatFloat) position. Used for hover, click, and delete interactions.
 * All functions use raw (unsnapped) beat values for snap-independent detection.
 */

import type { NoteEntity, ExtraNoteEntity, RangeNote } from "../../shared";
import { NOTE_Z_ORDER } from "./constants";

/** Tolerance for point note hit detection (in beats) */
const POINT_NOTE_TOLERANCE = 1 / 16;

/** Tolerance for snap-position note detection (tighter, exact match) */
export const SNAP_POSITION_TOLERANCE = 1 / 32;

/** Highest z-order value — used for early exit in hit test */
const MAX_Z_ORDER = Math.max(...Object.values(NOTE_Z_ORDER));

export function hitTestNoteAt(
  notes: readonly NoteEntity[],
  lane: number,
  beatFloat: number,
  tolerance: number = POINT_NOTE_TOLERANCE,
): number | null {
  let bestIndex: number | null = null;
  let bestPriority = -1;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.lane !== lane) continue;

    const nb = note.beat.n / note.beat.d;
    let hit = false;
    if ("endBeat" in note) {
      const eb = note.endBeat.n / note.endBeat.d;
      hit = beatFloat >= nb - tolerance && beatFloat <= eb + tolerance;
    } else {
      hit = Math.abs(beatFloat - nb) < tolerance;
    }

    if (hit) {
      const priority = NOTE_Z_ORDER[note.type] ?? 0;
      if (priority > bestPriority) {
        bestPriority = priority;
        bestIndex = i;
        if (priority === MAX_Z_ORDER) return i; // highest z-order, early exit
      }
    }
  }
  return bestIndex;
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

// ---------------------------------------------------------------------------
// Range note region detection
// ---------------------------------------------------------------------------

/** 롱노트 클릭 시 어느 영역이 클릭되었는지를 나타낸다 */
export type RangeNoteRegion = "head" | "body" | "end";

/**
 * RangeNote의 클릭 위치가 시작점(head), 바디(body), 끝점(end) 중 어느 영역인지 판별한다.
 *
 * - head: beatFloat가 startBeat ± tolerance 이내
 * - end: beatFloat가 endBeat ± tolerance 이내
 * - body: head/end가 아닌 범위 내 나머지 영역
 *
 * head와 end 영역이 겹치는 경우(짧은 롱노트), 가까운 쪽을 우선한다.
 */
export function hitTestRangeNoteRegion(
  note: RangeNote,
  beatFloat: number,
  tolerance: number = POINT_NOTE_TOLERANCE,
): RangeNoteRegion | null {
  const nb = note.beat.n / note.beat.d;
  const eb = note.endBeat.n / note.endBeat.d;

  // 범위 밖이면 null
  if (beatFloat < nb - tolerance || beatFloat > eb + tolerance) return null;

  const distFromHead = Math.abs(beatFloat - nb);
  const distFromEnd = Math.abs(beatFloat - eb);

  const inHead = distFromHead <= tolerance;
  const inEnd = distFromEnd <= tolerance;

  // 둘 다 해당하면 (짧은 롱노트) 가까운 쪽 우선
  if (inHead && inEnd) {
    return distFromHead <= distFromEnd ? "head" : "end";
  }
  if (inHead) return "head";
  if (inEnd) return "end";
  return "body";
}
