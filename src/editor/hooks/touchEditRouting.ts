/**
 * 터치 편집 후보가 pointerup에서 "무엇으로 확정되는가"를 정하는 순수 결정 함수들.
 *
 * 후보의 상태(발화 여부·이동 여부·범위 안 여부)만으로 액션을 고른다 — DOM·모드 인스턴스에
 * 의존하지 않아 입력→기대 액션을 그대로 단언할 수 있다. 훅은 이 액션을 실제 모드 메서드
 * 호출로 실행하기만 한다(얇은 글루). 그동안 테스트 불가였던 pointerup 디스패치 분기를 덮는다.
 */

/** create 모드 터치 후보가 뗄 때 확정되는 액션. */
export type TouchCreateUpAction = 'commitDrag' | 'cancelDrag' | 'createPointTap' | 'none';

/**
 * create 후보 up 결정.
 * - 롱프레스로 범위 드래그가 발화(fired)했으면: 범위 안이면 커밋, 밖이면 취소.
 * - 발화 안 했고 이동도 없고 시작점이 범위 안이면: 탭 = 단노트 생성.
 * - 그 외: 아무것도 안 함.
 */
export function resolveTouchCreateUpAction(input: {
  fired: boolean;
  moved: boolean;
  /** 현재 뗀 지점 y가 시간축 범위 안인지. */
  endInBounds: boolean;
  /** 후보 시작(down) 지점 y가 시간축 범위 안인지. */
  candidateStartInBounds: boolean;
}): TouchCreateUpAction {
  if (input.fired) return input.endInBounds ? 'commitDrag' : 'cancelDrag';
  if (!input.moved && input.candidateStartInBounds) return 'createPointTap';
  return 'none';
}

/**
 * select 모드에서 노트/엑스트라를 탭했을 때 선택 토글을 발화할지.
 * 이동하지 않았고(탭) 롱프레스가 발화하지 않았을 때만 토글한다. (note/extra 모두 동일 처리)
 */
export function shouldFireTapToggle(input: {
  moved: boolean;
  longPressFired: boolean;
}): boolean {
  return !input.moved && !input.longPressFired;
}

/**
 * delete 모드 터치 후보가 뗄 때 삭제를 실행할지.
 * 롱프레스로 드래그 삭제가 발화했거나(fired), 이동 없이 뗀 탭(!moved)이면 삭제한다.
 * 이동만 하고 발화 안 했으면(스크롤성 이동) 삭제하지 않는다.
 */
export function shouldDeleteOnUp(input: { fired: boolean; moved: boolean }): boolean {
  return input.fired || !input.moved;
}

/**
 * 터치 다중선택 래치(touchMultiSelect)의 다음 상태.
 *
 * 래치는 롱프레스 select-drag가 발화할 때 켜져, 이어지는 노트 탭이 기존 선택을 대체하지 않고
 * 누적 토글되게 한다. 선택이 0개가 되면(빈 곳 탭 해제·마지막 노트 토글 해제 등) 누적 모드를
 * 끝내야 하므로 꺼진다 — 그 외에는 현재 값을 유지한다. 끄는 지점이 없으면 한 번 켜진 뒤
 * 세션 내내 모든 탭이 누적 토글로 굳는 버그가 된다.
 */
export function nextTouchMultiSelectLatch(current: boolean, selectionSize: number): boolean {
  return selectionSize === 0 ? false : current;
}

/**
 * select 모드 터치 down에서 어떤 후보를 예약(schedule)할지.
 * - `tapToggle`: 뗄 때 노트/엑스트라 선택을 토글하는 후보.
 * - `emptySelectBox`: 첫 move/up에서 onPointerDown을 재생하는 지연-드래그 후보.
 *   빈 곳 박스 셀렉트뿐 아니라 트릴존 핸들/끝 리사이즈·이동도 이 경로로 시작된다.
 */
export type SelectTouchDownSchedule = 'tapToggle' | 'emptySelectBox';

/**
 * select 모드에서 터치 down 시 예약할 후보를 정한다.
 *
 * 트릴존 이동 핸들(구간 시작)·리사이즈 캡(구간 끝)은 노트 탭보다 우선한다.
 * 트릴존은 첫/마지막 트릴노트에서 시작·끝나므로 핸들/캡 위엔 항상 노트가 겹치는데,
 * 그 노트가 tapToggle로 가로채면 핸들/캡에 영영 도달 못 한다. 마우스 onPointerDown
 * 우선순위(트릴존 핸들/끝 > 점노트)와 일치시켜, 겹쳐도 지연-드래그 후보로 보낸다.
 *
 * 그 외에는 노트·엑스트라 히트가 있으면 탭 토글, 빈 곳이면 박스 선택 후보.
 * (up에서 note/extra 토글이 동일 처리되므로 히트 종류는 구분하지 않는다.)
 */
export function resolveSelectTouchDownSchedule(hits: {
  noteHit: number | null;
  extraHit: number | null;
  zoneHandleHit?: number | null;
  zoneEndHit?: number | null;
}): SelectTouchDownSchedule {
  if ((hits.zoneHandleHit ?? null) !== null || (hits.zoneEndHit ?? null) !== null) {
    return 'emptySelectBox';
  }
  return hits.noteHit !== null || hits.extraHit !== null ? 'tapToggle' : 'emptySelectBox';
}
