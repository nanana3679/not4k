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
