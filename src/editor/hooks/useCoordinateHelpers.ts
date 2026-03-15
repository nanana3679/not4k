/**
 * useCoordinateHelpers — 좌표 변환 및 히트테스트 함수들
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import type { TimelineRenderer } from '../timeline/TimelineRenderer';
import type { SnapZoomController } from '../timeline/SnapZoomController';
import { LANE_WIDTH, AUX_LANE_WIDTH, LANE_COUNT, TIMELINE_WIDTH, EXTRA_LANE_WIDTH } from '../timeline/constants';
import { hitTestNoteAt, hitTestExtraNoteAt } from '../timeline/hitTest';
import { msToBeat, extractBpmMarkers } from '../../shared';
import type { Beat, Lane } from '../../shared';
import { useEditorStore } from '../stores';

export interface CoordinateHelpers {
  xToLane: (x: number) => Lane | null;
  xToAuxLane: (x: number) => 'event' | null;
  xToExtraLane: (x: number) => number | null;
  yToBeat: (y: number) => Beat;
  yToBeatRaw: (y: number) => Beat;
  snapBeat: (beat: Beat) => Beat;
  getMaxBeatFloat: () => number;
  hitTestNote: (x: number, y: number) => number | null;
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
  hitTestNoteEndRef: RefObject<(x: number, y: number) => number | null>;
  hitTestEventEndRef: RefObject<(x: number, y: number) => number | null>;
  hitTestTrillZoneEndRef: RefObject<(x: number, y: number) => number | null>;
  hitTestTrillZoneRef: RefObject<(x: number, y: number) => number | null>;
  hitTestExtraNoteRef: RefObject<(x: number, y: number) => number | null>;
  bpmMarkers: ReturnType<typeof extractBpmMarkers>;
}

export function useCoordinateHelpers(
  rendererRef: RefObject<TimelineRenderer | null>,
  snapZoomRef: RefObject<SnapZoomController | null>,
): CoordinateHelpers {
  const chart = useEditorStore((s) => s.chart);
  const snapDivision = useEditorStore((s) => s.snapDivision);
  const selectedNotes = useEditorStore((s) => s.selectedNotes);

  const bpmMarkers = useMemo(() => extractBpmMarkers(chart.events), [chart.events]);

  // --- 기본 좌표 변환 ---

  const xToLane = useCallback((x: number): Lane | null => {
    const lane = Math.floor(x / LANE_WIDTH) + 1;
    if (lane >= 1 && lane <= LANE_COUNT) return lane as Lane;
    return null;
  }, []);

  const xToAuxLane = useCallback((x: number): 'event' | null => {
    const auxStartX = LANE_COUNT * LANE_WIDTH;
    if (x < auxStartX) return null;
    const auxIndex = Math.floor((x - auxStartX) / AUX_LANE_WIDTH);
    if (auxIndex === 0) return 'event';
    return null;
  }, []);

  const xToExtraLane = useCallback((x: number): number | null => {
    const currentExtraLaneCount = useEditorStore.getState().extraLaneCount;
    if (currentExtraLaneCount === 0) return null;
    const extraStartX = TIMELINE_WIDTH;
    if (x < extraStartX) return null;
    const lane = Math.floor((x - extraStartX) / EXTRA_LANE_WIDTH) + 1;
    if (lane >= 1 && lane <= currentExtraLaneCount) return lane;
    return null;
  }, []);

  const yToBeat = useCallback((y: number): Beat => {
    if (!rendererRef.current) return { n: 0, d: 1 };
    const timeMs = rendererRef.current.yToTime(y);
    const beatFloat = msToBeat(timeMs, bpmMarkers, chart.meta.offsetMs);
    const grid = 4 / snapDivision;
    const k = Math.round(beatFloat / grid);
    return { n: k * 4, d: snapDivision };
  }, [bpmMarkers, chart.meta.offsetMs, snapDivision]);

  const yToBeatRaw = useCallback((y: number): Beat => {
    if (!rendererRef.current) return { n: 0, d: 1 };
    const timeMs = rendererRef.current.yToTime(y);
    const beatFloat = msToBeat(timeMs, bpmMarkers, chart.meta.offsetMs);
    const d = 960;
    const n = Math.round(beatFloat * d);
    return { n, d };
  }, [bpmMarkers, chart.meta.offsetMs]);

  const snapBeat = useCallback((beat: Beat): Beat => {
    if (!snapZoomRef.current) return beat;
    return snapZoomRef.current.snapBeat(beat);
  }, []);

  const getMaxBeatFloat = useCallback((): number => {
    if (!rendererRef.current) return 0;
    const totalMs = rendererRef.current.getTotalTimelineMs();
    return msToBeat(totalMs, bpmMarkers, chart.meta.offsetMs);
  }, [bpmMarkers, chart.meta.offsetMs]);

  // --- 히트테스트 ---

  const hitTestNote = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const b = yToBeatRaw(y);
    return hitTestNoteAt(chart.notes, lane, b.n / b.d, undefined, selectedNotes);
  }, [chart.notes, selectedNotes, xToLane, yToBeatRaw]);

  const hitTestNoteEnd = useCallback((x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const beat = yToBeatRaw(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 16;
    for (let i = 0; i < chart.notes.length; i++) {
      const note = chart.notes[i];
      if (note.lane !== lane) continue;
      if (!selectedNotes.has(i)) continue;
      if (!('endBeat' in note)) continue;
      const endBeatFloat = note.endBeat.n / note.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) return i;
    }
    return null;
  }, [chart.notes, selectedNotes, xToLane, yToBeatRaw]);

  const hitTestEventEnd = useCallback((x: number, y: number): number | null => {
    const auxLane = xToAuxLane(x);
    if (auxLane !== 'event') return null;
    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 8;
    for (let i = 0; i < chart.events.length; i++) {
      const evt = chart.events[i];
      const endBeatFloat = evt.endBeat.n / evt.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) return i;
    }
    return null;
  }, [chart.events, xToAuxLane, yToBeat]);

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
    const testBeatFloat = beat.n / beat.d;
    for (let i = 0; i < chart.trillZones.length; i++) {
      const zone = chart.trillZones[i];
      if (zone.lane !== lane) continue;
      const startFloat = zone.beat.n / zone.beat.d;
      const endFloat = zone.endBeat.n / zone.endBeat.d;
      if (testBeatFloat >= startFloat && testBeatFloat <= endFloat) return i;
    }
    return null;
  }, [chart.trillZones, xToLane, yToBeatRaw]);

  const hitTestExtraNote = useCallback((x: number, y: number): number | null => {
    const extraLane = xToExtraLane(x);
    if (extraLane === null) return null;
    const b = yToBeatRaw(y);
    return hitTestExtraNoteAt(useEditorStore.getState().extraNotes, extraLane, b.n / b.d);
  }, [xToExtraLane, yToBeatRaw]);

  // --- ref 버전 (stale closure 방지) ---

  const yToBeatRef = useRef(yToBeat);
  const yToBeatRawRef = useRef(yToBeatRaw);
  const getMaxBeatFloatRef = useRef(getMaxBeatFloat);
  const hitTestNoteRef = useRef<(x: number, y: number) => number | null>(() => null);
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
    hitTestNoteEndRef.current = hitTestNoteEnd;
    hitTestEventEndRef.current = hitTestEventEnd;
    hitTestTrillZoneEndRef.current = hitTestTrillZoneEnd;
    hitTestTrillZoneRef.current = hitTestTrillZone;
    hitTestExtraNoteRef.current = hitTestExtraNote;
  });

  return {
    xToLane,
    xToAuxLane,
    xToExtraLane,
    yToBeat,
    yToBeatRaw,
    snapBeat,
    getMaxBeatFloat,
    hitTestNote,
    hitTestNoteEnd,
    hitTestEventEnd,
    hitTestTrillZoneEnd,
    hitTestTrillZone,
    hitTestExtraNote,
    yToBeatRef,
    yToBeatRawRef,
    getMaxBeatFloatRef,
    hitTestNoteRef,
    hitTestNoteEndRef,
    hitTestEventEndRef,
    hitTestTrillZoneEndRef,
    hitTestTrillZoneRef,
    hitTestExtraNoteRef,
    bpmMarkers,
  };
}
