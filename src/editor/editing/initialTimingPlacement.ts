import { eventPlacementsOverlap, type ChartEvent } from '../../shared';
import { isInitialTimingEvent } from './eventEditing';

/** 0박 초기 BPM 설정의 고정 보조 레인(RFD 0082). */
const INITIAL_BPM_EDITOR_LANE = 1;
/** 0박 초기 박자 설정의 고정 보조 레인(RFD 0082). */
const INITIAL_TIME_SIGNATURE_EDITOR_LANE = 2;
/** 초기 설정 자리와 겹친 일반 이벤트를 옮길 때 빈 레인을 찾기 시작하는 보조 레인. 1·2는 초기 설정 자리다. */
const FIRST_RELOCATION_EDITOR_LANE = 3;

/**
 * 차트를 불러올 때 0박 초기 BPM은 보조 레인1, 초기 박자는 보조 레인2에 둔다(RFD 0082). 값·박 위치는 그대로 두고
 * `editorLane`만 바꾼다.
 *
 * 1. 초기 설정: 다른 레인(숨은 레인·0·음수·소수 포함, 박자는 `editorLane` 없음 = 1 포함)에 있으면 고정 레인으로 옮긴다.
 *    BPM은 `editorLane`이 없어도 이미 보조 레인1이므로 새로 쓰지 않는다. 같은 종류 중복도 모두 고정 레인에 모여
 *    `eventDuplicate` 위반으로 남는다.
 * 2. 일반 이벤트: 고정 레인에 놓인 초기 설정과 배치가 겹치면, 배열 순서대로 보조 레인3부터 지금까지 놓인 어느
 *    이벤트와도 겹치지 않는 가장 낮은 레인으로 옮긴다. 옮기지 않는 이벤트(숨은 보조 레인 포함)는 장애물이고,
 *    초기 설정과 겹치지 않는 일반 이벤트끼리의 겹침은 옮기지 않고 위반으로 남긴다.
 *
 * 옮긴 것이 있으면 보조 레인 수를 옮긴 가장 높은 레인과 2(보조 레인1·2가 보이도록) 이상으로 늘리기만 한다.
 * 옮길 것이 없으면 받은 `events` 참조와 보조 레인 수를 그대로 돌려주므로 배치한 결과에 다시 적용해도 바뀌지 않는다.
 */
export function placeInitialTimingEvents(
  events: ChartEvent[],
  extraLaneCount: number,
): { events: ChartEvent[]; extraLaneCount: number } {
  const placedEvents = events.map(event => {
    if (!isInitialTimingEvent(event)) return event;
    const editorLane = initialTimingEditorLane(event);
    return (event.editorLane ?? 1) === editorLane ? event : { ...event, editorLane };
  });
  const initialEvents = placedEvents.filter(isInitialTimingEvent);
  const indicesToRelocate = placedEvents.flatMap((event, index) =>
    !isInitialTimingEvent(event) && initialEvents.some(initial => eventPlacementsOverlap(event, initial)) ? [index] : []);
  if (indicesToRelocate.length === 0 && placedEvents.every((event, index) => event === events[index])) {
    return { events, extraLaneCount };
  }

  const occupied = placedEvents.filter((_, index) => !indicesToRelocate.includes(index));
  // 옮겼으면 초기 설정 자리인 보조 레인1·2가 보이도록 보조 레인 수를 적어도 2로 둔다.
  let placedLaneCount = Math.max(extraLaneCount, INITIAL_TIME_SIGNATURE_EDITOR_LANE);
  for (const index of indicesToRelocate) {
    let editorLane = FIRST_RELOCATION_EDITOR_LANE;
    while (occupied.some(other => eventPlacementsOverlap({ ...placedEvents[index], editorLane }, other))) editorLane++;
    placedEvents[index] = { ...placedEvents[index], editorLane };
    occupied.push(placedEvents[index]);
    placedLaneCount = Math.max(placedLaneCount, editorLane);
  }
  return { events: placedEvents, extraLaneCount: placedLaneCount };
}

/** 초기 설정의 종류별 고정 보조 레인. */
function initialTimingEditorLane(event: ChartEvent): number {
  return event.type === 'bpm' ? INITIAL_BPM_EDITOR_LANE : INITIAL_TIME_SIGNATURE_EDITOR_LANE;
}
