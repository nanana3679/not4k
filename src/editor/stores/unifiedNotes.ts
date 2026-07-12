/**
 * unifiedNotes — 메인(chart.notes) ∪ 보조(extraNotes) 파생 통합 읽기뷰 (RFD 0018 §6-1 ② shim)
 *
 * 과도기 모듈: ③(원자 store flip)에서 보조 노트가 chart.notes로 이주하면
 * 소비자는 chart.notes를 직접 읽게 되고 이 모듈은 소멸한다.
 * 데이터가 아직 두 배열에 사는 동안, 읽기 소비자(렌더·히트테스트·검증·게이트)를
 * 단일 배열 뷰로 먼저 이전해 ③의 폭발 반경을 writer/store로 국한한다.
 *
 * 인덱스 계약 (위반 refs·해칭 귀속이 의존):
 * - 메인 노트는 chart.notes 인덱스 그대로 0..n-1
 * - 보조 노트는 상대 순서를 보존하며 n..n+m-1에 append (unified[n+j] = extraNotes[j])
 */

import type { NoteEntity, ExtraNoteEntity } from "../../shared";
import { fromAuxIndex } from "../../shared";

/** ExtraNoteEntity → NoteEntity: extraLane(1-기반) → lane(5+) 변환 */
export function extraToNote(e: ExtraNoteEntity): NoteEntity {
  const { extraLane, ...rest } = e;
  return { ...rest, lane: fromAuxIndex(extraLane) };
}

let cache: {
  notes: readonly NoteEntity[];
  extraNotes: readonly ExtraNoteEntity[];
  result: NoteEntity[];
} | null = null;

/**
 * 통합 읽기뷰. 같은 (notes, extraNotes) 참조쌍이면 같은 배열 인스턴스를 반환한다
 * (React 셀렉터·렌더 비교가 identity에 의존해도 안전).
 */
export function unifiedNotes(
  notes: readonly NoteEntity[],
  extraNotes: readonly ExtraNoteEntity[],
): NoteEntity[] {
  if (cache && cache.notes === notes && cache.extraNotes === extraNotes) {
    return cache.result;
  }
  const result = [...notes, ...extraNotes.map(extraToNote)];
  cache = { notes, extraNotes, result };
  return result;
}

/**
 * 통합 인덱스 공간의 위반 노트 집합을 메인/보조 표면으로 분리한다.
 * 인덱스 계약: idx < mainCount → chart.notes[idx], idx >= mainCount → extraNotes[idx - mainCount].
 * ③(store flip)에서 배열이 하나가 되면 이 번역과 함께 소멸한다.
 */
export function splitViolationNoteIndices(
  unified: ReadonlySet<number>,
  mainCount: number,
): { main: Set<number>; extra: Set<number> } {
  const main = new Set<number>();
  const extra = new Set<number>();
  for (const idx of unified) {
    if (idx < mainCount) main.add(idx);
    else extra.add(idx - mainCount);
  }
  return { main, extra };
}
