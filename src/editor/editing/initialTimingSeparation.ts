import { eventPlacementsOverlap, type ChartEvent } from '../../shared';
import { isInitialTimingEvent } from './eventEditing';

/**
 * 차트를 불러올 때 배치가 겹친 0박 초기 BPM·박자 설정을 빈 보조 레인으로 옮긴다(RFD 0082).
 * 값·박 위치는 그대로 두고 `editorLane`만 바꾼다. 다른 이벤트(숨은 보조 레인 포함)는 옮기지 않는 장애물이다.
 *
 * 1. 유지: BPM → 박자 → 배열 순서로, 장애물·먼저 유지한 초기 설정과 겹치지 않으면 레인을 그대로 둔다.
 *    `editorLane`이 없어도 새로 쓰지 않는다.
 * 2. 이동: 남은 초기 설정을 같은 순서로, 지금까지 놓인 어느 이벤트와도 겹치지 않는 가장 낮은 레인(1부터)에 놓는다.
 *    유지를 먼저 끝내야 레인1 text와 겹친 BPM이 이미 레인2로 나뉜 박자를 밀어내지 않는다.
 *
 * 보조 레인 수는 옮긴 레인이 보이도록 늘리기만 한다. 옮길 것이 없으면 받은 `events` 참조를 그대로 돌려주므로
 * 분리한 결과에 다시 적용해도 바뀌지 않는다. 같은 종류 중복 같은 의미 위반은 레인과 무관하게 남는다.
 */
export function separateInitialTimingEvents(
  events: ChartEvent[],
  extraLaneCount: number,
): { events: ChartEvent[]; extraLaneCount: number } {
  const initialIndices = events.flatMap((event, index) => (isInitialTimingEvent(event) ? [index] : []))
    .sort((a, b) => initialTimingOrder(events[a]) - initialTimingOrder(events[b]) || a - b);
  const placed = events.filter(event => !isInitialTimingEvent(event));
  const overlapsPlaced = (event: ChartEvent) => placed.some(other => eventPlacementsOverlap(event, other));

  const indicesToMove: number[] = [];
  for (const index of initialIndices) {
    if (overlapsPlaced(events[index])) indicesToMove.push(index);
    else placed.push(events[index]);
  }
  if (indicesToMove.length === 0) return { events, extraLaneCount };

  const separated = [...events];
  let separatedLaneCount = extraLaneCount;
  for (const index of indicesToMove) {
    let editorLane = 1;
    while (overlapsPlaced({ ...events[index], editorLane })) editorLane++;
    separated[index] = { ...events[index], editorLane };
    placed.push(separated[index]);
    separatedLaneCount = Math.max(separatedLaneCount, editorLane);
  }
  return { events: separated, extraLaneCount: separatedLaneCount };
}

function initialTimingOrder(event: ChartEvent): number {
  return event.type === 'bpm' ? 0 : 1;
}
