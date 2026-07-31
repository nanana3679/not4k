import type { Lane } from "../constants/note";
import type {
  Chart,
  MainNoteEntity,
  NoteEntity,
  PlayableChart,
} from "../types/chart";

export const MAIN_LANE_COUNT = 4;

export function isValidNoteLane(lane: number): boolean {
  return Number.isInteger(lane) && lane >= 1;
}

export function isMainLane(lane: number): lane is Lane {
  return isValidNoteLane(lane) && lane <= MAIN_LANE_COUNT;
}

export function isAuxLane(lane: number): boolean {
  return isValidNoteLane(lane) && lane > MAIN_LANE_COUNT;
}

export function mainNotes(notes: readonly NoteEntity[]): MainNoteEntity[] {
  return notes.filter(
    (note): note is MainNoteEntity => isMainLane(note.lane),
  );
}

export function auxNotes(notes: readonly NoteEntity[]): NoteEntity[] {
  return notes.filter((note) => isAuxLane(note.lane));
}

export function toAuxIndex(lane: number): number | null {
  return isAuxLane(lane) ? lane - MAIN_LANE_COUNT : null;
}

export function fromAuxIndex(auxIndex: number): number | null {
  return Number.isInteger(auxIndex) && auxIndex >= 1
    ? MAIN_LANE_COUNT + auxIndex
    : null;
}

export function maxAuxLane(notes: readonly NoteEntity[]): number {
  return notes.reduce((maximum, note) => {
    const auxIndex = toAuxIndex(note.lane);
    return auxIndex === null ? maximum : Math.max(maximum, auxIndex);
  }, 0);
}

export function isVisibleLane(lane: number, extraLaneCount: number): boolean {
  return isValidNoteLane(lane)
    && lane <= MAIN_LANE_COUNT + Math.max(0, Math.floor(extraLaneCount));
}

export function toPlayableChart(chart: Chart): PlayableChart {
  return {
    ...chart,
    notes: mainNotes(chart.notes),
  };
}
