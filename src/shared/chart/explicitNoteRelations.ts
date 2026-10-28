import type { Beat } from "../types/beat";
import { beatCompare, beatEq, beatGte, beatLt, beatLte } from "../types/beat";
import type { BodyNote, DocumentNoteEntity } from "../types/chart";

export interface ExplicitBodyRelation {
  readonly noteIndex: number;
  readonly note: BodyNote;
  readonly startTapIndices: readonly number[];
  readonly endReleaseIndices: readonly number[];
  readonly tickIndices: readonly number[];
  readonly predecessorIndices: readonly number[];
  readonly successorIndices: readonly number[];
}

export interface ExplicitBodyConnection {
  readonly predecessorIndex: number;
  readonly successorIndex: number;
  readonly lane: number;
  readonly beat: Beat;
  readonly predecessorHoldCount: 1 | 2;
  readonly successorHoldCount: 1 | 2;
}

/** 모든 index는 필터·정렬 전 문서 notes를 가리킨다. 잘못된 배치도 지우거나 고치지 않는다. */
export interface ExplicitNoteRelations {
  readonly bodies: readonly ExplicitBodyRelation[];
  readonly bodyByNote: ReadonlyMap<number, ExplicitBodyRelation>;
  readonly connections: readonly ExplicitBodyConnection[];
  /** 겹치는 바디 등으로 유일한 소속을 고를 수 없으면 후보만 남긴다. */
  readonly tickBodyCandidatesByNote: ReadonlyMap<number, readonly number[]>;
  readonly tickBodyByNote: ReadonlyMap<number, number>;
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
        predecessorHoldCount: previous.note.holdCount, successorHoldCount: next.note.holdCount });
    }
  }

  const tickBodyCandidatesByNote = new Map<number, readonly number[]>();
  const tickBodyByNote = new Map<number, number>();
  const releaseBodyCandidatesByNote = new Map<number, readonly number[]>();
  const releaseBodyByNote = new Map<number, number>();
  notes.forEach((note, noteIndex) => {
    if (note.type !== "tick" && note.type !== "release") return;
    const candidates = bodies.filter(body => body.note.lane === note.lane && (note.type === "release"
      ? beatEq(body.note.endBeat, note.beat)
      : beatGte(note.beat, body.note.beat) && beatLte(note.beat, body.note.endBeat)));
    // 앞 바디 끝과 뒤 바디 시작이 맞닿은 경계에 놓인 틱 노트는 앞 바디가 아니라 뒤 바디에만 속한다.
    const starts = candidates.filter(body => beatEq(body.note.beat, note.beat));
    const owners = (note.type === "tick" && starts.length ? starts : candidates).map(body => body.noteIndex);
    const candidatesByNote = note.type === "tick" ? tickBodyCandidatesByNote : releaseBodyCandidatesByNote;
    const bodyByNote = note.type === "tick" ? tickBodyByNote : releaseBodyByNote;
    candidatesByNote.set(noteIndex, owners);
    if (owners.length === 1) bodyByNote.set(noteIndex, owners[0]);
  });

  const relations = bodies.map(({ note, noteIndex }): ExplicitBodyRelation => ({
    note, noteIndex,
    startTapIndices: notes.flatMap((tap, index) => tap.type === "tap"
      && tap.lane === note.lane && beatEq(tap.beat, note.beat) ? [index] : []),
    endReleaseIndices: [...releaseBodyByNote].flatMap(([index, owner]) => owner === noteIndex ? [index] : []),
    tickIndices: [...tickBodyByNote].flatMap(([index, owner]) => owner === noteIndex ? [index] : []),
    predecessorIndices: connections.filter(c => c.successorIndex === noteIndex).map(c => c.predecessorIndex),
    successorIndices: connections.filter(c => c.predecessorIndex === noteIndex).map(c => c.successorIndex),
  }));
  return { bodies: relations, bodyByNote: new Map(relations.map(body => [body.noteIndex, body])),
    connections, tickBodyCandidatesByNote, tickBodyByNote, releaseBodyCandidatesByNote, releaseBodyByNote };
}
