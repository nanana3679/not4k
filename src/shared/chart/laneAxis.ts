/**
 * laneAxis — 메인/보조 레인 경계 지식의 유일한 서식지 (RFD 0018 §3-1)
 *
 * 노트는 `chart.notes` 한 배열에서 `lane` 번호로만 구분된다:
 * 메인 레인(1..MAIN_LANE_COUNT)은 게임이 판정하고, 보조 레인(5+)은 에디터 표시 전용이다.
 *
 * 불변식: `lane > MAIN_LANE_COUNT`를 아는 코드는 이 모듈과 그 직접 소비자
 * (게임 진입 필터·직렬화 분리/병합·규칙 조건·좌표 투영·숨김 경계)뿐이다.
 * 나머지 코드는 노트를 레인 무차별로 다룬다.
 *
 * 관할 밖: 이벤트의 `editorLane`(별도 1-기반 배치 공간)은 이 레이어가 통합하지 않는다.
 */

/** 게임이 판정하는 메인 레인 수 — 경계 상수의 유일한 서식지 */
export const MAIN_LANE_COUNT = 4;
/** 보조 파일 포맷이 허용하는 최대 보조 레인 수 */
export const MAX_EXTRA_LANE_COUNT = 10;

/** 메인 레인(1..4) 여부 — 게임 판정 대상. 비정수·범위 밖은 false */
export function isMainLane(lane: number): boolean {
  return Number.isInteger(lane) && lane >= 1 && lane <= MAIN_LANE_COUNT;
}

/** 보조 레인(5+) 여부 — 에디터 표시 전용. 비정수는 false */
export function isAuxLane(lane: number): boolean {
  return Number.isInteger(lane) && lane > MAIN_LANE_COUNT;
}

/**
 * 메인 레인 노트만 필터 — 게임으로 노트가 넘어가는 모든 진입점과
 * 직렬화 분리(차트 파일 쪽)가 사용하는 유일한 필터.
 */
export function mainNotes<T extends { lane: number }>(notes: readonly T[]): T[] {
  return notes.filter((n) => isMainLane(n.lane));
}

/** 보조 레인 노트만 필터 — 직렬화 분리(보조 파일 쪽)가 사용 */
export function auxNotes<T extends { lane: number }>(notes: readonly T[]): T[] {
  return notes.filter((n) => isAuxLane(n.lane));
}

/** lane → 보조 인덱스(1-기반): 5→1, 6→2. 보조 파일 포맷(extraLane)·보조 영역 x 계산과의 왕복 매핑 */
export function toAuxIndex(lane: number): number {
  return lane - MAIN_LANE_COUNT;
}

/** 보조 인덱스(1-기반) → lane: 1→5, 2→6. toAuxIndex의 역 */
export function fromAuxIndex(auxIndex: number): number {
  return auxIndex + MAIN_LANE_COUNT;
}

/**
 * 노트들이 실제 점유한 최대 lane(보조 없으면 MAIN_LANE_COUNT).
 * 로드 병합의 보조 레인 수 자동 확장이 사용: 필요한 extraLaneCount = toAuxIndex(maxAuxLane(notes)).
 */
export function maxAuxLane(notes: readonly { lane: number }[]): number {
  let max = MAIN_LANE_COUNT;
  for (const n of notes) {
    if (isAuxLane(n.lane) && n.lane > max) max = n.lane;
  }
  return max;
}

/**
 * 현재 보조 레인 수 설정에서 lane이 화면에 보이는지 (RFD 0018 §6-5 숨김 경계).
 * 메인 레인은 항상 보이고, 보조 레인은 4+extraLaneCount까지만 보인다.
 */
export function isVisibleLane(lane: number, extraLaneCount: number): boolean {
  return isMainLane(lane) || (isAuxLane(lane) && lane <= MAIN_LANE_COUNT + extraLaneCount);
}
