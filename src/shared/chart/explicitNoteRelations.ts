import type { Beat } from "../types/beat";
import { beatCompare, beatEq, beatGte, beatLt, beatLte } from "../types/beat";
import type { BodyNote, DocumentNoteEntity } from "../types/chart";

export interface ExplicitBodyRelation {
  readonly noteIndex: number;
  readonly note: BodyNote;
  readonly startPointIndices: readonly number[];
  readonly endReleaseIndices: readonly number[];
  readonly sustainIndices: readonly number[];
  readonly predecessorIndices: readonly number[];
  readonly successorIndices: readonly number[];
}

export interface ExplicitBodyConnection {
  readonly predecessorIndex: number;
  readonly successorIndex: number;
  readonly lane: number;
  readonly beat: Beat;
  readonly sourceCount: 1 | 2;
  readonly targetCount: 1 | 2;
}

/** 모든 index는 필터·정렬 전 문서 notes를 가리킨다. 잘못된 배치도 지우거나 고치지 않는다. */
export interface ExplicitNoteRelations {
  readonly bodies: readonly ExplicitBodyRelation[];
  readonly bodyByNote: ReadonlyMap<number, ExplicitBodyRelation>;
  readonly connections: readonly ExplicitBodyConnection[];
  /** 겹치는 바디 등으로 유일한 소속을 고를 수 없으면 후보만 남긴다. */
  readonly sustainBodyCandidatesByNote: ReadonlyMap<number, readonly number[]>;
  readonly sustainBodyByNote: ReadonlyMap<number, number>;
  readonly releaseBodyCandidatesByNote: ReadonlyMap<number, readonly number[]>;
  readonly releaseBodyByNote: ReadonlyMap<number, number>;
}

export function deriveExplicitNoteRelations(notes: readonly DocumentNoteEntity[]): ExplicitNoteRelations {
  const bodies = notes.flatMap((note, noteIndex) => note.type === "body" ? [{ note, noteIndex }] : [])
    .sort((a, b) => a.note.lane - b.note.lane || beatCompare(a.note.beat, b.note.beat)
      || beatCompare(a.note.endBeat, b.note.endBeat) || a.noteIndex - b.noteIndex);
  const connections: ExplicitBodyConnection[] = [];
  for (const previous of bodies) {
    for (const next of bodies) {
      if (previous.note.lane !== next.note.lane || !beatLt(previous.note.beat, next.note.beat)
        || !beatEq(previous.note.endBeat, next.note.beat)) continue;
      connections.push({ predecessorIndex: previous.noteIndex, successorIndex: next.noteIndex,
        lane: next.note.lane, beat: next.note.beat,
        sourceCount: previous.note.holdCount, targetCount: next.note.holdCount });
    }
  }

  const sustainBodyCandidatesByNote = new Map<number, readonly number[]>();
  const sustainBodyByNote = new Map<number, number>();
  const releaseBodyCandidatesByNote = new Map<number, readonly number[]>();
  const releaseBodyByNote = new Map<number, number>();
  notes.forEach((note, noteIndex) => {
    if (note.type !== "sustain" && note.type !== "release") return;
    const candidates = bodies.filter(body => body.note.lane === note.lane && (note.type === "release"
      ? beatEq(body.note.endBeat, note.beat)
      : beatGte(note.beat, body.note.beat) && beatLte(note.beat, body.note.endBeat)));
    // 공유 경계 표식은 앞 끝이 아니라 뒤 시작에만 속한다.
    const starts = candidates.filter(body => beatEq(body.note.beat, note.beat));
    const owners = (note.type === "sustain" && starts.length ? starts : candidates).map(body => body.noteIndex);
    const candidatesByNote = note.type === "sustain" ? sustainBodyCandidatesByNote : releaseBodyCandidatesByNote;
    const bodyByNote = note.type === "sustain" ? sustainBodyByNote : releaseBodyByNote;
    candidatesByNote.set(noteIndex, owners);
    if (owners.length === 1) bodyByNote.set(noteIndex, owners[0]);
  });

  const relations = bodies.map(({ note, noteIndex }): ExplicitBodyRelation => ({
    note, noteIndex,
    startPointIndices: notes.flatMap((point, index) => point.type === "point"
      && point.lane === note.lane && beatEq(point.beat, note.beat) ? [index] : []),
    endReleaseIndices: [...releaseBodyByNote].flatMap(([index, owner]) => owner === noteIndex ? [index] : []),
    sustainIndices: [...sustainBodyByNote].flatMap(([index, owner]) => owner === noteIndex ? [index] : []),
    predecessorIndices: connections.filter(c => c.successorIndex === noteIndex).map(c => c.predecessorIndex),
    successorIndices: connections.filter(c => c.predecessorIndex === noteIndex).map(c => c.successorIndex),
  }));
  return { bodies: relations, bodyByNote: new Map(relations.map(body => [body.noteIndex, body])),
    connections, sustainBodyCandidatesByNote, sustainBodyByNote, releaseBodyCandidatesByNote, releaseBodyByNote };
}
