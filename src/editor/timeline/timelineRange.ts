/**
 * 타임라인이 그리는 범위와 커서가 놓일 수 있는 범위(ms).
 *
 * 아래 끝은 `min(0, offsetMs)`다. 음원 시작(0ms)과 0박(offsetMs) 중 이른 쪽부터 그리므로,
 * 오프셋이 양수이면 0박 앞(음수 박)의 0ms～offsetMs 구간도 그린다. 커서 범위는 오프셋 부호와 관계없이
 * 0박(offsetMs)부터다. 두 범위의 위 끝은 마지막 마디 끝(`TimelineRenderer.getTotalTimelineMs`)이다.
 * 렌더러의 좌표 변환(`getMinTimeMs`)·App의 `isTimeInBounds`·뷰포트 슬라이스의 스크롤 클램프가 같은 범위를 쓴다.
 */

import type { ChartDocument } from '../../shared';
import type { TimelineRangeMs } from '../stores/viewportSlice';

export function timelineRangeMsOf(offsetMs: number, totalTimelineMs: number): TimelineRangeMs {
  return { minTimeMs: Math.min(0, offsetMs), totalTimelineMs };
}

export function clampToTimelineRange(timeMs: number, range: TimelineRangeMs): number {
  return Math.max(range.minTimeMs, Math.min(range.totalTimelineMs, timeMs));
}

/** 레일 seek와 커서 박 유지가 사용하는 범위. 스크롤·그리기 범위와 구별한다. */
export interface CursorRangeMs {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
}

export function cursorRangeMsOf(offsetMs: number, totalTimelineMs: number): CursorRangeMs {
  return { startTimeMs: offsetMs, endTimeMs: totalTimelineMs };
}

export function clampToCursorRange(timeMs: number, range: CursorRangeMs): number {
  return Math.max(range.startTimeMs, Math.min(range.endTimeMs, timeMs));
}

/** 타임라인 범위를 읽는 데 필요한 렌더러 기능. `TimelineRenderer`가 그대로 맞는다. */
export interface TimelineRangeRenderer {
  setChart(chart: ChartDocument): void;
  getTotalTimelineMs(): number;
}

/**
 * 렌더러에 새 차트를 넘기고 그 차트의 타임라인 범위를 돌려준다.
 * 렌더러는 끝 시각을 캐시하고 `setChart`가 그 캐시를 비우므로, 끝 시각은 반드시 `setChart` 뒤에 읽어야
 * 새 차트의 BPM·마디 수를 따른다. 차트 교체를 따라가는 쪽(스크롤 클램프·재생 끝·커서 박 유지)은
 * 이 함수가 돌려준 범위를 써서 이전 차트의 범위를 읽지 않는다.
 */
export function setChartAndReadTimelineRange(renderer: TimelineRangeRenderer, chart: ChartDocument): TimelineRangeMs {
  renderer.setChart(chart);
  return timelineRangeMsOf(chart.meta.offsetMs, renderer.getTotalTimelineMs());
}
