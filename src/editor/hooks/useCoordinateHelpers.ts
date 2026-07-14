/**
 * useCoordinateHelpers — 좌표 변환 및 히트테스트 함수들
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import { LANE_WIDTH, LANE_COUNT, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from '../timeline/constants';
import { hitTestNoteAt, hitTestExtraNoteAt, hitTestTrillZoneAt } from '../timeline/hitTest';
import {
  beatFloatToRawBeat,
  beatFloatToSnapBeat,
  timelineXToExtraLane,
  timelineXToLane,
} from '../timeline/timelineProjection';
import { msToBeat, beatToFloat, extractBpmMarkers, auxNotesAsExtra, fromAuxIndex } from '../../shared';
import type { Beat, Lane } from '../../shared';
import { useEditorStore } from '../stores';

export interface CoordinateHelpers {
  xToLane: (x: number) => Lane | null;
  xToExtraLane: (x: number) => number | null;
  xToUnifiedLane: (x: number) => number | null;
  yToBeat: (y: number) => Beat;
  yToBeatRaw: (y: number) => Beat;
  snapBeat: (beat: Beat) => Beat;
  getMaxBeatFloat: () => number;
  /**
   * 메인 레인(1..4) 한정 히트테스트 — 반환 인덱스는 chart.notes 통합 인덱스.
   * CreateMode 배치 제약(메인 배치만 관할)과 커서 z-order 체크가 소비한다.
   */
  hitTestNote: (x: number, y: number) => number | null;
  /**
   * 통합 히트테스트 — xToUnifiedLane 기반이라 메인·보조 노트의 chart.notes 통합 인덱스를 반환.
   * Select(선택·이동)·Delete·hover가 소비한다 (RFD 0018 ④d) — 인덱스 공간이 chart.notes
   * 하나라 정규형 파티션이 깨진 차트에서도 오해석이 없다.
   */
  hitTestUnifiedNote: (x: number, y: number) => number | null;
  hitTestNoteEnd: (x: number, y: number) => number | null;
  hitTestEventEnd: (x: number, y: number) => number | null;
  hitTestTrillZoneEnd: (x: number, y: number) => number | null;
  hitTestTrillZone: (x: number, y: number) => number | null;
  hitTestExtraNote: (x: number, y: number) => number | null;
  // ref 버전 (stale closure 방지용)
  yToBeatRef: RefObject<(y: number) => Beat>;
  yToBeatRawRef: RefObject<(y: number) => Beat>;
  getMaxBeatFloatRef: RefObject<() => number>;
  hitTestNoteRef: RefObject<(x: number, y: number) => number | null>;
  hitTestUnifiedNoteRef: RefObject<(x: number, y: number) => number | null>;
  hitTestNoteEndRef: RefObject<(x: number, y: number) => number | null>;
  hitTestEventEndRef: RefObject<(x: number, y: number) => number | null>;
  hitTestTrillZoneEndRef: RefObject<(x: number, y: number) => number | null>;
  hitTestTrillZoneRef: RefObject<(x: number, y: number) => number | null>;
  hitTestExtraNoteRef: RefObject<(x: number, y: number) => number | null>;
  bpmMarkers: ReturnType<typeof extractBpmMarkers>;
}

export function useCoordinateHelpers(
  rendererRef: RefObject<TimelineRenderer | null>,
): CoordinateHelpers {
  const chart = useEditorStore((s) => s.chart);
  const snapDivision = useEditorStore((s) => s.snapDivision);
  const selectedNotes = useEditorStore((s) => s.selection.notes);

  const bpmMarkers = useMemo(() => extractBpmMarkers(chart.events), [chart.events]);

  // --- 기본 좌표 변환 ---

  const xToLane = useCallback((x: number): Lane | null => {
    return timelineXToLane({
      timelineX: x,
      laneWidth: LANE_WIDTH,
      laneCount: LANE_COUNT,
    });
  }, []);

  const xToExtraLane = useCallback((x: number): number | null => {
    const currentExtraLaneCount = useEditorStore.getState().extraLaneCount;
    return timelineXToExtraLane({
      timelineX: x,
      timelineWidth: TIMELINE_WIDTH,
      extraLaneWidth: EXTRA_LANE_WIDTH,
      extraLaneCount: currentExtraLaneCount,
    });
  }, []);

  const xToUnifiedLane = useCallback((x: number): number | null => {
    const mainLane = xToLane(x);
    if (mainLane !== null) return mainLane;
    const auxIndex = xToExtraLane(x);
    return auxIndex === null ? null : fromAuxIndex(auxIndex);
  }, [xToExtraLane, xToLane]);

  const yToBeat = useCallback((y: number): Beat => {
    if (!rendererRef.current) return { n: 0, d: 1 };
    const timeMs = rendererRef.current.yToTime(y);
    const beatFloat = msToBeat(timeMs, bpmMarkers, chart.meta.offsetMs);
    return beatFloatToSnapBeat({ beatFloat, snapDivision });
  }, [bpmMarkers, chart.meta.offsetMs, rendererRef, snapDivision]);

  const yToBeatRaw = useCallback((y: number): Beat => {
    if (!rendererRef.current) return { n: 0, d: 1 };
    const timeMs = rendererRef.current.yToTime(y);
    const beatFloat = msToBeat(timeMs, bpmMarkers, chart.meta.offsetMs);
    return beatFloatToRawBeat({ beatFloat });
  }, [bpmMarkers, chart.meta.offsetMs, rendererRef]);

  // 모드가 1회 생성 시 캡처하는 콜백이므로 snapDivision은 호출 시점에 읽는다(stale 방지).
  const snapBeat = useCallback((beat: Beat): Beat => {
    return beatFloatToSnapBeat({
      beatFloat: beatToFloat(beat),
      snapDivision: useEditorStore.getState().snapDivision,
    });
  }, []);

  const getMaxBeatFloat = useCallback((): number => {
    if (!rendererRef.current) return 0;
    const totalMs = rendererRef.current.getTotalTimelineMs();
    return msToBeat(totalMs, bpmMarkers, chart.meta.offsetMs);
  }, [bpmMarkers, chart.meta.offsetMs, rendererRef]);

  // --- 히트테스트 ---

  const hitTestNote = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const b = yToBeatRaw(y);
    return hitTestNoteAt(chart.notes, lane, b.n / b.d, undefined, selectedNotes);
  }, [chart.notes, selectedNotes, xToLane, yToBeatRaw]);

  // 통합 히트테스트 — 보조 레인(5+)까지 포함해 chart.notes 통합 인덱스를 반환 (RFD 0018 ④).
  // hitTestNoteAt은 lane 비교만 하므로 통합 lane(5+)을 넘기면 보조 노트 인덱스를 찾는다.
  const hitTestUnifiedNote = useCallback((x: number, y: number): number | null => {
    const lane = xToUnifiedLane(x);
    if (lane === null) return null;
    const b = yToBeatRaw(y);
    return hitTestNoteAt(chart.notes, lane, b.n / b.d, undefined, selectedNotes);
  }, [chart.notes, selectedNotes, xToUnifiedLane, yToBeatRaw]);

  const hitTestNoteEnd = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const beat = yToBeatRaw(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 16;
    for (let i = 0; i < chart.notes.length; i++) {
      const note = chart.notes[i];
      if (note.lane !== lane) continue;
      if (!('endBeat' in note)) continue;
      const endBeatFloat = note.endBeat.n / note.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) return i;
    }
    return null;
  }, [chart.notes, xToLane, yToBeatRaw]);

  const hitTestEventEnd = useCallback((x: number, y: number): number | null => {
    const extraLane = xToExtraLane(x);
    if (extraLane === null) return null;
    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 8;
    for (let i = 0; i < chart.events.length; i++) {
      const evt = chart.events[i];
      if ((evt.editorLane ?? 1) !== extraLane) continue;
      if (!('endBeat' in evt)) continue;
      const endBeatFloat = evt.endBeat.n / evt.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) return i;
    }
    return null;
  }, [chart.events, xToExtraLane, yToBeat]);

  const hitTestTrillZoneEnd = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const beat = yToBeatRaw(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 16;
    for (let i = 0; i < chart.trillZones.length; i++) {
      const zone = chart.trillZones[i];
      if (zone.lane !== lane) continue;
      const endBeatFloat = zone.endBeat.n / zone.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) return i;
    }
    return null;
  }, [chart.trillZones, xToLane, yToBeatRaw]);

  const hitTestTrillZone = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const beat = yToBeatRaw(y);
    return hitTestTrillZoneAt(chart.trillZones, lane, beat.n / beat.d);
  }, [chart.trillZones, xToLane, yToBeatRaw]);

  const hitTestExtraNote = useCallback((x: number, y: number): number | null => {
    const extraLane = xToExtraLane(x);
    if (extraLane === null) return null;
    const b = yToBeatRaw(y);
    // 보조 노트는 chart.notes(lane 5+)에 산다 — 파생 aux 배열로 히트테스트 (RFD 0018 ③).
    // 소비자는 널 체크(히트 유무)만 쓴다: CreateMode 배치 가드·터치 HoldHits. 인덱스를
    // chart.notes에 적용해야 하는 경로는 전부 hitTestUnifiedNote를 쓴다 (RFD 0018 ④d).
    return hitTestExtraNoteAt(auxNotesAsExtra(useEditorStore.getState().chart.notes), extraLane, b.n / b.d);
  }, [xToExtraLane, yToBeatRaw]);

  // --- ref 버전 (stale closure 방지) ---

  const yToBeatRef = useRef(yToBeat);
  const yToBeatRawRef = useRef(yToBeatRaw);
  const getMaxBeatFloatRef = useRef(getMaxBeatFloat);
  const hitTestNoteRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestUnifiedNoteRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestNoteEndRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestEventEndRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestTrillZoneEndRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestTrillZoneRef = useRef<(x: number, y: number) => number | null>(() => null);
  const hitTestExtraNoteRef = useRef<(x: number, y: number) => number | null>(() => null);

  useEffect(() => {
    yToBeatRef.current = yToBeat;
    yToBeatRawRef.current = yToBeatRaw;
    getMaxBeatFloatRef.current = getMaxBeatFloat;
    hitTestNoteRef.current = hitTestNote;
    hitTestUnifiedNoteRef.current = hitTestUnifiedNote;
    hitTestNoteEndRef.current = hitTestNoteEnd;
    hitTestEventEndRef.current = hitTestEventEnd;
    hitTestTrillZoneEndRef.current = hitTestTrillZoneEnd;
    hitTestTrillZoneRef.current = hitTestTrillZone;
    hitTestExtraNoteRef.current = hitTestExtraNote;
  });

  return {
    xToLane,
    xToExtraLane,
    xToUnifiedLane,
    yToBeat,
    yToBeatRaw,
    snapBeat,
    getMaxBeatFloat,
    hitTestNote,
    hitTestUnifiedNote,
    hitTestNoteEnd,
    hitTestEventEnd,
    hitTestTrillZoneEnd,
    hitTestTrillZone,
    hitTestExtraNote,
    yToBeatRef,
    yToBeatRawRef,
    getMaxBeatFloatRef,
    hitTestNoteRef,
    hitTestUnifiedNoteRef,
    hitTestNoteEndRef,
    hitTestEventEndRef,
    hitTestTrillZoneEndRef,
    hitTestTrillZoneRef,
    hitTestExtraNoteRef,
    bpmMarkers,
  };
}
