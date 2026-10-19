/**
 * Hit test utilities for timeline entities.
 *
 * Pure functions that determine which entity (note, extra note) is at a given
 * (lane, beatFloat) position. Used for hover, click, and delete interactions.
 * All functions use raw (unsnapped) beat values for snap-independent detection.
 */

import type { Chart, NoteEntity, ExtraNoteEntity, RangeNote, TrillZone, RestZone } from "../../shared";
import { NOTE_Z_ORDER } from "./constants";

/** Tolerance for point note hit detection (in beats) */
const POINT_NOTE_TOLERANCE = 1 / 16;

/** Tolerance for snap-position note detection (tighter, exact match) */
export const SNAP_POSITION_TOLERANCE = 1 / 32;

/** 롱노트 끝 캡 히트 영역(박) — 끝점(endBeat) ± 이 값 미만이면 끝 캡에 맞은 것으로 본다. */
const NOTE_END_CAP_TOLERANCE = 1 / 16;

/** beatFloat가 끝점 endBeatFloat의 끝 캡 히트 영역 안인가. */
export function isWithinNoteEndCap(beatFloat: number, endBeatFloat: number): boolean {
  return Math.abs(beatFloat - endBeatFloat) < NOTE_END_CAP_TOLERANCE;
}

/**
 * 구간 이벤트 events[eventIndex]의 끝이 롱노트 notes[noteIndex]의 끝 캡 히트 영역 안인가(두 끝이 같은 위치).
 * 어느 쪽이든 endBeat가 없거나 범위 밖이면 false. resolveGrab 끝 캡 게이트(eventEndMeetsNoteEnd)에 넣는 chart 사실.
 */
export function eventEndMeetsNoteEnd(
  chart: Pick<Chart, "events" | "notes">,
  eventIndex: number,
  noteIndex: number,
): boolean {
  const evt = chart.events[eventIndex];
  const note = chart.notes[noteIndex];
  if (evt === undefined || !("endBeat" in evt) || note === undefined || !("endBeat" in note)) return false;
  return isWithinNoteEndCap(evt.endBeat.n / evt.endBeat.d, note.endBeat.n / note.endBeat.d);
}

/** Highest z-order value — used for early exit in hit test */
const MAX_Z_ORDER = Math.max(...Object.values(NOTE_Z_ORDER));

/** Selection priority bonus — always larger than any z-order value */
const SELECTED_BONUS = MAX_Z_ORDER + 1;

export function hitTestNoteAt(
  notes: readonly NoteEntity[],
  lane: number,
  beatFloat: number,
  tolerance: number = POINT_NOTE_TOLERANCE,
  selectedNotes?: ReadonlySet<number>,
): number | null {
  let bestIndex: number | null = null;
  let bestPriority = -1;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.lane !== lane) continue;

    const nb = note.beat.n / note.beat.d;
    let hit: boolean;
    if ("endBeat" in note) {
      const eb = note.endBeat.n / note.endBeat.d;
      hit = beatFloat >= nb - tolerance && beatFloat <= eb + tolerance;
    } else {
      hit = Math.abs(beatFloat - nb) < tolerance;
    }

    if (hit) {
      let priority = NOTE_Z_ORDER[note.type] ?? 0;
      if (selectedNotes?.has(i)) {
        priority += SELECTED_BONUS;
      }
      if (priority > bestPriority) {
        bestPriority = priority;
        bestIndex = i;
        // Early exit only when no selection bias could override
        if ((!selectedNotes || selectedNotes.size === 0) && priority === MAX_Z_ORDER) return i;
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
 * Find a trill zone at the given lane and beat position.
 *
 * Range zones are hit within [beat, endBeat]; a tolerance is applied on both
 * ends so a zero-length zone (beat === endBeat) — which the renderer still
 * draws as a NOTE_HEIGHT band centered on the beat — stays clickable for
 * deletion. Returns the index of the first matching zone, or null.
 */
export function hitTestTrillZoneAt(
  trillZones: readonly TrillZone[],
  lane: number,
  beatFloat: number,
  tolerance: number = POINT_NOTE_TOLERANCE,
): number | null {
  for (let i = 0; i < trillZones.length; i++) {
    const zone = trillZones[i];
    if (zone.lane !== lane) continue;
    const start = zone.beat.n / zone.beat.d;
    const end = zone.endBeat.n / zone.endBeat.d;
    if (beatFloat >= start - tolerance && beatFloat <= end + tolerance) return i;
  }
  return null;
}

/**
 * Find a rest zone at the given lane and beat position (RFD 0019).
 *
 * Mirrors {@link hitTestTrillZoneAt}: zones are hit within [beat, endBeat]
 * with a tolerance on both ends so a zero-length zone stays clickable for
 * deletion. Returns the index of the first matching zone, or null.
 */
export function hitTestRestZoneAt(
  restZones: readonly RestZone[],
  lane: number,
  beatFloat: number,
  tolerance: number = POINT_NOTE_TOLERANCE,
): number | null {
  for (let i = 0; i < restZones.length; i++) {
    const zone = restZones[i];
    if (zone.lane !== lane) continue;
    const start = zone.beat.n / zone.beat.d;
    const end = zone.endBeat.n / zone.endBeat.d;
    if (beatFloat >= start - tolerance && beatFloat <= end + tolerance) return i;
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
