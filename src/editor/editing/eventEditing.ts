import { beatAdd, beatToFloat, type Beat, type ChartDocument, type ChartEvent } from '../../shared';

export function isInitialTimingEvent(event: ChartEvent): boolean {
  return event.beat.n === 0 && (event.type === 'bpm' || event.type === 'timeSignature');
}

export function translateEvent(event: ChartEvent, beatOffset: Beat, laneOffset = 0): ChartEvent {
  const position = { beat: beatAdd(event.beat, beatOffset),
    ...(laneOffset === 0 ? {} : { editorLane: (event.editorLane ?? 1) + laneOffset }) };
  return 'endBeat' in event
    ? { ...event, ...position, endBeat: beatAdd(event.endBeat, beatOffset) }
    : { ...event, ...position };
}

export function eventInBounds(event: ChartEvent, maxBeat: number, extraLaneCount: number): boolean {
  const start = beatToFloat(event.beat);
  const end = 'endBeat' in event ? beatToFloat(event.endBeat) : start;
  const lane = event.editorLane ?? 1;
  return start >= 0 && start <= maxBeat && end >= start && end <= maxBeat
    && lane >= 1 && lane <= extraLaneCount;
}

/** 직접 지목한 초기 설정의 삭제를 거부한다. 묶음 명령은 보호 항목을 먼저 제외한다. */
export function deleteEvents(chart: ChartDocument, indices: ReadonlySet<number>): ChartDocument | null {
  if ([...indices].some(index => chart.events[index] && isInitialTimingEvent(chart.events[index]))) return null;
  if (indices.size === 0) return chart;
  return { ...chart, events: chart.events.filter((_, index) => !indices.has(index)) };
}
