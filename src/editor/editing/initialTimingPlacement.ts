import { eventPlacementsOverlap, type ChartEvent } from '../../shared';
import { isInitialTimingEvent } from './eventEditing';

/** 0박 초기 BPM 설정의 고정 보조 레인(RFD 0082). */
const INITIAL_BPM_EDITOR_LANE = 1;
/** 0박 초기 박자 설정의 고정 보조 레인(RFD 0082). */
const INITIAL_TIME_SIGNATURE_EDITOR_LANE = 2;
/** 초기 설정 자리와 겹친 일반 이벤트를 옮길 때 빈 레인을 찾기 시작하는 보조 레인. 1·2는 초기 설정 자리다. */
const FIRST_RELOCATION_EDITOR_LANE = 3;

/**
 * 차트를 불러올 때 0박 초기 BPM은 보조 레인1, 초기 박자는 보조 레인2에 두고, 그 자리와 겹친 일반 이벤트를 빈 보조 레인으로
 * 옮긴다(RFD 0082). 값·박 위치는 그대로 두고 `editorLane`만 바꾼다.
 *
 * 1. 초기 설정: 다른 레인(숨은 레인·0·음수·소수 포함, 박자는 `editorLane` 없음 = 1 포함)에 있으면 고정 레인으로 옮긴다.
 *    BPM은 `editorLane`이 없어도 이미 보조 레인1이므로 새로 쓰지 않는다. 같은 종류 중복도 모두 고정 레인에 모여
 *    `eventDuplicate` 위반으로 남는다.
 * 2. 일반 이벤트: 고정 레인에 놓인 초기 설정과 배치가 겹치면, 배열 순서대로 보조 레인3부터 지금까지 놓인 어느
 *    이벤트와도 겹치지 않는 가장 낮은 레인으로 옮긴다. 옮기지 않는 이벤트(숨은 보조 레인 포함)는 장애물이고,
 *    초기 설정과 겹치지 않는 일반 이벤트끼리의 겹침은 옮기지 않고 위반으로 남긴다.
 *
 * 보조 레인 수는 보조 레인1·2가 보이도록 적어도 2로, 옮긴 것이 있으면 옮긴 가장 높은 레인 이상으로 늘리기만 한다.
 * 옮길 것이 없으면 받은 `events` 참조를 그대로 돌려주므로 배치한 결과에 다시 적용해도 바뀌지 않는다.
 */
export function placeEventsAroundInitialTiming(
  events: ChartEvent[],
  extraLaneCount: number,
): { events: ChartEvent[]; extraLaneCount: number } {
  // 옮길 것이 없어도 초기 설정 자리인 보조 레인1·2가 보이도록 보조 레인 수를 적어도 2로 둔다.
  let placedExtraLaneCount = Math.max(extraLaneCount, INITIAL_TIME_SIGNATURE_EDITOR_LANE);
  const placedEvents = events.map(withInitialTimingLane);
  const initialEvents = placedEvents.filter(isInitialTimingEvent);
  const indicesToRelocate = placedEvents.flatMap((event, index) =>
    !isInitialTimingEvent(event) && initialEvents.some(initial => eventPlacementsOverlap(event, initial)) ? [index] : []);
  if (indicesToRelocate.length === 0 && placedEvents.every((event, index) => event === events[index])) {
    return { events, extraLaneCount: placedExtraLaneCount };
  }

  const occupied = placedEvents.filter((_, index) => !indicesToRelocate.includes(index));
  for (const index of indicesToRelocate) {
    let editorLane = FIRST_RELOCATION_EDITOR_LANE;
    while (occupied.some(other => eventPlacementsOverlap({ ...placedEvents[index], editorLane }, other))) editorLane++;
    placedEvents[index] = { ...placedEvents[index], editorLane };
    occupied.push(placedEvents[index]);
    placedExtraLaneCount = Math.max(placedExtraLaneCount, editorLane);
  }
  return { events: placedEvents, extraLaneCount: placedExtraLaneCount };
}

/**
 * 생성·이동·붙여넣기가 바꾼 이벤트(`editedIndices`) 가운데 0박 BPM·박자가 된 것을 초기 설정 자리에 둔다(RFD 0082).
 *
 * - 같은 종류의 다른 0박 BPM·박자가 이미 있으면(편집한 다른 이벤트 포함) 초기 설정 중복을 새로 만들므로 `null`을
 *   돌려준다. 호출부는 그 편집 전체를 거부한다.
 * - 없으면 그 이벤트의 `editorLane`만 고정 레인(BPM 1, 박자 2)으로 바꾼다. BPM은 `editorLane`이 없어도 이미 1이다.
 *
 * 바꿀 것이 없으면 받은 `events` 참조를 그대로 돌려준다. 편집하지 않은 이벤트와 그 위반(불러온 초기 설정 중복 등)은
 * 건드리지 않는다. 고정 자리와 겹친 일반 이벤트도 옮기지 않는다. 그 이벤트는 선택해 옮길 수 있어 배치 위반으로 남긴다.
 */
export function placeEditedInitialTiming(events: ChartEvent[], editedIndices: Iterable<number>): ChartEvent[] | null {
  let placedEvents = events;
  for (const index of new Set(editedIndices)) {
    const event = events[index];
    if (!event || !isInitialTimingEvent(event)) continue;
    const initialExists = events.some((other, otherIndex) =>
      otherIndex !== index && other.type === event.type && isInitialTimingEvent(other));
    if (initialExists) return null;
    const placedEvent = withInitialTimingLane(event);
    if (placedEvent === event) continue;
    if (placedEvents === events) placedEvents = [...events];
    placedEvents[index] = placedEvent;
  }
  return placedEvents;
}

/**
 * 0박 BPM·박자면 `editorLane`만 초기 설정 자리(BPM 1, 박자 2)로 바꾼 사본을, 그 밖의 이벤트나 이미 그 자리인 초기
 * 설정이면 받은 이벤트를 그대로 돌려준다(RFD 0082).
 *
 * 이동은 옮긴 이벤트를 이 자리에 둔 뒤 범위를 검사한다. 0박에 온 박자가 레인 이동으로 잠시 보조 레인 수 밖의 레인을
 * 가리켜도 고정 자리로 돌아가므로 이동 전체를 막지 않는다.
 */
export function withInitialTimingLane(event: ChartEvent): ChartEvent {
  if (!isInitialTimingEvent(event)) return event;
  const editorLane = event.type === 'bpm' ? INITIAL_BPM_EDITOR_LANE : INITIAL_TIME_SIGNATURE_EDITOR_LANE;
  return (event.editorLane ?? 1) === editorLane ? event : { ...event, editorLane };
}
