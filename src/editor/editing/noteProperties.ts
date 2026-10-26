import type { DocumentNoteEntity } from '../../shared';

/** 기존 G 단축키의 허용 속성. 바디·유지에 구형 플래그를 새로 붙이지 않는다. */
export function toggleNoteGrace(note: DocumentNoteEntity): DocumentNoteEntity | null {
  if (note.type === 'point' || note.type === 'release' || note.type === 'single' || note.type === 'double' || note.type === 'trill') {
    const updated: typeof note = { ...note, grace: !note.grace };
    if (!updated.grace) delete updated.grace;
    return updated;
  }
  if (note.type === 'long' || note.type === 'doubleLong') {
    const updated: typeof note = { ...note, holdOnly: !note.holdOnly };
    if (!updated.holdOnly) delete updated.holdOnly;
    return updated;
  }
  return null;
}
