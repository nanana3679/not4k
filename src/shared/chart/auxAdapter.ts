/**
 * auxAdapter — 보조 레인 노트(`chart.notes`의 lane 5+)와 `ExtraNoteEntity`(extraLane 1-기반)
 * 사이의 번역층 (RFD 0018 ③).
 *
 * ③(원자 store flip) 이후 노트는 `chart.notes` 한 배열에 살고 보조 노트는 lane 5+로만
 * 구분된다. 편집 모드는 ④에서 통합 축으로 전환됐고(이원 축 소멸 — RFD 0018 ④d),
 * 이 어댑터는 저장/로드 분리·병합과 dirty 스냅샷 등 `ExtraNoteEntity` 파일 포맷 경계에만 남는다.
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
 * 로드 병합: 메인 노트(차트 파일)와 보조 노트(보조 파일)를 chart.notes 하나로 합친다.
 * 결과는 `[...mainNotes, ...extra]` 형태라 aux 상대 순서 = 넘어온 순서로 보존된다
 * (dirty 바이트 동일성이 이 순서 보존에 의존한다 — RFD 0018 §6-3a).
 * 이 형태는 로드 시점의 구성일 뿐 차트 불변이 아니다 — 이후 편집(통합 이동·paste)은
 * 파티션을 유지하지 않고, 소비자는 전부 통합 인덱스로 동작한다 (RFD 0018 ④d).
 */
export function withAuxNotes(
  notes: readonly NoteEntity[],
  extra: readonly ExtraNoteEntity[],
): NoteEntity[] {
  return [...mainNotes(notes), ...extra.map(extraToNote)];
}
