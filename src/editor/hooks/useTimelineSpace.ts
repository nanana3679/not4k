/**
 * useTimelineSpace — TimelineSpace의 React 조립 어댑터.
 *
 * store(zustand)·renderer(ref)를 TimelineSpaceSource로 접어
 * `createTimelineSpace`에 주입한다. source·space는 마운트당 1회 생성(안정 참조)이고,
 * source 메서드들이 호출 시점에 최신 상태를 라이브로 읽으므로 stale closure가 없다
 * (구 useCoordinateHelpers의 ref 이중화 대체).
 */

import { useMemo } from "react";
import type { RefObject } from "react";
import type { TimelineRenderer } from "../timeline/TimelineRenderer";
import {
  createTimelineSpace,
  type TimelineSpace,
  type TimelineSpaceSource,
} from "../timeline/TimelineSpace";
import { extractBpmMarkers } from "../../shared";
import type { BpmMarker } from "../../shared";
import { useEditorStore } from "../stores";

export function useTimelineSpace(rendererRef: RefObject<TimelineRenderer | null>): {
  space: TimelineSpace;
  bpmMarkers: BpmMarker[];
} {
  const chart = useEditorStore((s) => s.chart);
  // 반응형 렌더 소비자(App 등)용. space 내부의 events-identity 캐시와 용도가 다르다
  // (반응형 렌더 입력 vs 라이브 좌표 질의) — 이중 계산은 의도된 것.
  const bpmMarkers = useMemo(() => extractBpmMarkers(chart.events), [chart.events]);

  const space = useMemo(() => {
    const source: TimelineSpaceSource = {
      getChart: () => useEditorStore.getState().chart,
      getSnapDivision: () => useEditorStore.getState().snapDivision,
      getSelectedNotes: () => useEditorStore.getState().selection.notes,
      getExtraLaneCount: () => useEditorStore.getState().extraLaneCount,
      yToTime: (y) => (rendererRef.current ? rendererRef.current.yToTime(y) : null),
      getTotalTimelineMs: () =>
        rendererRef.current ? rendererRef.current.getTotalTimelineMs() : null,
    };
    return createTimelineSpace(source);
  }, [rendererRef]);

  return { space, bpmMarkers };
}
