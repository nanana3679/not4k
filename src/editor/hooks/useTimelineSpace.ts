/**
 * useTimelineSpace — TimelineSpace의 React 조립 어댑터.
 *
 * store(zustand)·renderer(ref)를 TimelineSpaceSource로 접어
 * `createTimelineSpace`에 주입한다. source·space는 마운트당 1회 생성(안정 참조)이고,
 * source 메서드들이 호출 시점에 최신 상태를 라이브로 읽으므로 stale closure가 없다
 * (구 useCoordinateHelpers의 ref 이중화 대체).
 */

import { useMemo, useRef } from "react";
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
  const bpmMarkers = useMemo(() => extractBpmMarkers(chart.events), [chart.events]);

  // source는 마운트당 1회 생성이라 memo 최신값을 ref로 노출한다(재계산 방지 + 라이브성).
  const bpmMarkersRef = useRef(bpmMarkers);
  bpmMarkersRef.current = bpmMarkers;

  const space = useMemo(() => {
    const source: TimelineSpaceSource = {
      getChart: () => useEditorStore.getState().chart,
      getBpmMarkers: () => bpmMarkersRef.current,
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
