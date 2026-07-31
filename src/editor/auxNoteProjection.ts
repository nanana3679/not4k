import {
  auxNotes,
  toAuxIndex,
  type NoteEntity,
} from "../shared";

/** 데이터의 단일 소스인 chart.notes에서 보조 레인 노트 투영을 만든다. */
export function projectAuxNotes(
  notes: readonly NoteEntity[],
): NoteEntity[] {
  return auxNotes(notes);
}

export function replaceAuxNotes(
  notes: readonly NoteEntity[],
  extras: readonly NoteEntity[],
): NoteEntity[] {
  const replacement = auxNotes(extras);
  const result: NoteEntity[] = [];
  let auxIndex = 0;

  for (const note of notes) {
    if (toAuxIndex(note.lane) === null) {
      result.push(note);
      continue;
    }
    if (auxIndex < replacement.length) {
      result.push(replacement[auxIndex]);
      auxIndex++;
    }
  }

  return [...result, ...replacement.slice(auxIndex)];
}

export function splitNoteViolationIndices(
  notes: readonly NoteEntity[],
  indices: ReadonlySet<number>,
): { main: Set<number>; aux: Set<number> } {
  const main = new Set<number>();
  const aux = new Set<number>();
  let auxIndex = 0;
  for (let index = 0; index < notes.length; index++) {
    const note = notes[index];
    if (toAuxIndex(note.lane) === null) {
      if (indices.has(index)) main.add(index);
    } else {
      if (indices.has(index)) aux.add(auxIndex);
      auxIndex++;
    }
  }
  return { main, aux };
}

export function auxSelectionIndexToNoteIndex(
  notes: readonly NoteEntity[],
  selectedAuxIndex: number,
): number | null {
  let auxIndex = 0;
  for (let index = 0; index < notes.length; index++) {
    if (toAuxIndex(notes[index].lane) === null) continue;
    if (auxIndex === selectedAuxIndex) return index;
    auxIndex++;
  }
  return null;
}

export function noteIndexToAuxSelectionIndex(
  notes: readonly NoteEntity[],
  selectedNoteIndex: number,
): number | null {
  if (
    selectedNoteIndex < 0
    || selectedNoteIndex >= notes.length
    || toAuxIndex(notes[selectedNoteIndex].lane) === null
  ) {
    return null;
  }
  let auxIndex = 0;
  for (let index = 0; index < selectedNoteIndex; index++) {
    if (toAuxIndex(notes[index].lane) !== null) auxIndex++;
  }
  return auxIndex;
}
