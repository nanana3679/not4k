import { beatAdd, beatToFloat, isTimingEvent, type Beat, type ChartDocument, type ChartEvent } from '../../shared';

export function isInitialTimingEvent(event: ChartEvent): boolean {
  return event.beat.n === 0 && (event.type === 'bpm' || event.type === 'timeSignature');
}

/**
 * 이벤트를 박·보조 레인만큼 평행이동한다. BPM·박자는 전용 열에 있어 레인 오프셋을 무시한다(RFD 0082).
 */
export function translateEvent(event: ChartEvent, beatOffset: Beat, laneOffset = 0): ChartEvent {
  if (isTimingEvent(event)) return { ...event, beat: beatAdd(event.beat, beatOffset) };
  return { ...event, beat: beatAdd(event.beat, beatOffset), endBeat: beatAdd(event.endBeat, beatOffset),
    ...(laneOffset === 0 ? {} : { editorLane: (event.editorLane ?? 1) + laneOffset }) };
}

/** BPM·박자는 보조 레인에 놓이지 않으므로 시간 범위만 본다. */
export function eventInBounds(event: ChartEvent, maxBeat: number, extraLaneCount: number): boolean {
  const start = beatToFloat(event.beat);
  const end = 'endBeat' in event ? beatToFloat(event.endBeat) : start;
  if (!(start >= 0 && start <= maxBeat && end >= start && end <= maxBeat)) return false;
  if (isTimingEvent(event)) return true;
  const lane = event.editorLane ?? 1;
  return lane >= 1 && lane <= extraLaneCount;
}

/**
 * 생성·이동·붙여넣기가 바꾼 이벤트(`editedIndices`) 가운데 0박 BPM·박자가 된 것이 같은 종류의 다른 0박 설정과 겹치는가.
 * 겹치면 호출부는 그 편집 전체를 거부한다(RFD 0082). 편집하지 않은 이벤트끼리의 위반(불러온 초기 설정 중복 등)은 보지 않는다.
 */
export function createsDuplicateInitialTiming(events: readonly ChartEvent[], editedIndices: Iterable<number>): boolean {
  for (const index of new Set(editedIndices)) {
    const event = events[index];
    if (!event || !isInitialTimingEvent(event)) continue;
    if (events.some((other, otherIndex) => otherIndex !== index && other.type === event.type && isInitialTimingEvent(other))) return true;
  }
  return false;
}

/** 직접 지목한 초기 설정의 삭제를 거부한다. 묶음 명령은 보호 항목을 먼저 제외한다. */
export function deleteEvents(chart: ChartDocument, indices: ReadonlySet<number>): ChartDocument | null {
  if ([...indices].some(index => chart.events[index] && isInitialTimingEvent(chart.events[index]))) return null;
  if (indices.size === 0) return chart;
  return { ...chart, events: chart.events.filter((_, index) => !indices.has(index)) };
}
