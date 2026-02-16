/**
 * 노트 타입 enum — chart-editor.md + tech-stack.md §차트 JSON 포맷 기준
 */
export const NoteType = {
  SINGLE: "single",
  DOUBLE: "double",
  TRILL: "trill",
  SINGLE_LONG: "singleLong",
  DOUBLE_LONG: "doubleLong",
  TRILL_LONG: "trillLong",
  TRILL_ZONE: "trillZone",
  MESSAGE: "message",
} as const;

export type NoteType = (typeof NoteType)[keyof typeof NoteType];

/** 포인트 엔티티 (위치만 가짐) */
export const POINT_NOTE_TYPES: ReadonlySet<NoteType> = new Set([
  NoteType.SINGLE,
  NoteType.DOUBLE,
  NoteType.TRILL,
]);

/** 구간 엔티티 (시작 + 끝 가짐) */
export const RANGE_NOTE_TYPES: ReadonlySet<NoteType> = new Set([
  NoteType.SINGLE_LONG,
  NoteType.DOUBLE_LONG,
  NoteType.TRILL_LONG,
  NoteType.TRILL_ZONE,
  NoteType.MESSAGE,
]);

/** 롱노트 타입 (시작점+바디+끝점을 가지는 판정 대상) */
export const LONG_NOTE_TYPES: ReadonlySet<NoteType> = new Set([
  NoteType.SINGLE_LONG,
  NoteType.DOUBLE_LONG,
  NoteType.TRILL_LONG,
]);

/** 레인 수 */
export const LANE_COUNT = 4;

/** 레인 번호 (1-indexed) */
export type Lane = 1 | 2 | 3 | 4;
