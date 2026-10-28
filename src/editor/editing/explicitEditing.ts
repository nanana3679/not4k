import type { Beat, DocumentNoteEntity } from '../../shared';
import { beatLt, deriveExplicitNoteRelations } from '../../shared';

/** 새 바디를 집을 때만 호출한다. 명령 실행 시 선택을 재확장하지 않는다. */
export function bodyCompanionIndices(notes: readonly DocumentNoteEntity[], index: number): Set<number> {
  const relation = deriveExplicitNoteRelations(notes).bodyByNote.get(index);
  return new Set(relation
    ? [index, ...relation.startTapIndices, ...relation.tickIndices, ...relation.endReleaseIndices]
    : [index]);
}

export function bodyDeletionBlockReason(notes: readonly DocumentNoteEntity[], indices: ReadonlySet<number>): string | null {
  for (const body of deriveExplicitNoteRelations(notes).bodies) {
    if (indices.has(body.noteIndex) && body.tickIndices.some(index => !indices.has(index))) {
      return '바디의 유지 표식을 먼저 옮기거나 함께 삭제해 주세요';
    }
  }
  return null;
}

/** 바디 끝 이동과 선택된 릴리즈 이동을 한 후보 배열에서 검증·적용한다. */
export function resizeExplicitBodies(
  notes: readonly DocumentNoteEntity[], endsByBody: ReadonlyMap<number, Beat>, selected: ReadonlySet<number>,
): DocumentNoteEntity[] | null {
  const relations = deriveExplicitNoteRelations(notes);
  const result = [...notes];
  for (const [index, endBeat] of endsByBody) {
    const body = relations.bodyByNote.get(index);
    if (!body) continue;
    if (beatLt(endBeat, body.note.beat)
      || body.tickIndices.some(i => beatLt(endBeat, notes[i].beat))) return null;
    result[index] = { ...body.note, endBeat };
    for (const releaseIndex of body.endReleaseIndices) {
      if (selected.has(releaseIndex)) result[releaseIndex] = { ...notes[releaseIndex], beat: endBeat };
    }
  }
  return result;
}

/**
 * 옮긴 표식만 새 위치의 유일한 소속 수량에 맞춘다. 바디·owner ID를 만들지 않는다.
 * 바디 밖에 놓인 표식은 조작 시작 때의 수량(fallbackCountByNoteIndex)으로 돌려 지나온 경로와
 * 무관하게 한다. 그 기록이 없으면 현재 수량을 유지한다.
 */
export function reconcileMovedTicks(
  notes: readonly DocumentNoteEntity[], moved: Iterable<number>, fallbackCountByNoteIndex?: ReadonlyMap<number, 1 | 2>,
): DocumentNoteEntity[] {
  const relations = deriveExplicitNoteRelations(notes);
  const result = [...notes];
  for (const index of moved) {
    const note = result[index];
    if (note?.type !== 'tick') continue;
    const owner = relations.tickBodyByNote.get(index);
    const count = owner === undefined
      ? fallbackCountByNoteIndex?.get(index)
      : relations.bodyByNote.get(owner)!.note.holdCount;
    if (count !== undefined && note.count !== count) result[index] = { ...note, count };
  }
  return result;
}
