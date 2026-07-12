/**
 * auxAdapter — 보조 레인 노트(`chart.notes`의 lane 5+)와 `ExtraNoteEntity`(extraLane 1-기반)
 * 사이의 번역층 (RFD 0018 ③).
 *
 * ③(원자 store flip) 이후 노트는 `chart.notes` 한 배열에 살고 보조 노트는 lane 5+로만
 * 구분된다. 그러나 편집 모드(CreateMode·DeleteMode·SelectMode)와 저장/로드 경로는 아직
 * `ExtraNoteEntity` 축을 쓴다 — 이 이원 축은 ④에서 흡수·소멸한다. 그때까지 이 어댑터가
 * 두 표현 사이를 번역해, 편집 모드는 무변경으로 두면서 데이터는 단일 배열에 유지한다.
 *
 * shared에 두는 이유: 저장 분리(`chartAssetPersistence`, shared)와 에디터 배선이 모두
 * 이 매핑을 쓴다 — editor→shared 단방향 의존을 지키려면 매핑이 shared에 살아야 한다.
 */

import type { NoteEntity, ExtraNoteEntity } from "../types";
import { fromAuxIndex, toAuxIndex, mainNotes, auxNotes } from "./laneAxis";

/** ExtraNoteEntity → NoteEntity: extraLane(1-기반) → lane(5+) 변환 */
export function extraToNote(e: ExtraNoteEntity): NoteEntity {
  const { extraLane, ...rest } = e;
  return { ...rest, lane: fromAuxIndex(extraLane) };
}

/** 보조 NoteEntity(lane 5+) → ExtraNoteEntity: lane → extraLane(1-기반). extraToNote의 역 */
export function noteToExtra(n: NoteEntity): ExtraNoteEntity {
  const { lane, ...rest } = n;
  return { ...rest, extraLane: toAuxIndex(lane) } as ExtraNoteEntity;
}

/**
 * chart.notes에서 보조 노트만 뽑아 ExtraNoteEntity 배열로 파생한다 (상대 순서 보존).
 * 편집 모드 콜백(getExtraNotes)·히트테스트·저장 분리·dirty 스냅샷의 단일 소스.
 */
export function auxNotesAsExtra(notes: readonly NoteEntity[]): ExtraNoteEntity[] {
  return auxNotes(notes).map(noteToExtra);
}

/**
 * 보조 편집(onExtraNotesUpdate)을 chart.notes 재구성으로 번역한다:
 * 메인 노트는 그대로 두고 보조 노트를 넘어온 배열로 통째 교체한다.
 * 결과는 `[...mainNotes, ...extra]` 정규형이라 aux 상대 순서 = 넘어온 순서로 보존된다
 * (dirty 바이트 동일성이 이 순서 보존에 의존한다 — RFD 0018 §6-3a).
 */
export function withAuxNotes(
  notes: readonly NoteEntity[],
  extra: readonly ExtraNoteEntity[],
): NoteEntity[] {
  return [...mainNotes(notes), ...extra.map(extraToNote)];
}
