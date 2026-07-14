/**
 * TimelineSpace — 입력 좌표 공간(픽셀 → 도메인) deep module.
 *
 * 좌표 변환·스냅·히트테스트를 한 인터페이스로 접는다. store·renderer를 모르는
 * 순수 팩토리로, 필요한 외부 사실은 전부 주입된 {@link TimelineSpaceSource}에서
 * **호출 시점에 라이브로 읽는다**(클로저 스냅샷 없음 — ref 이중화가 불필요해진다).
 * React 조립은 `useTimelineSpace` 훅이 담당한다.
 *
 * 그리기 방향(도메인 → 픽셀)은 `timelineProjection`(Projection)의 소관 — 여긴 입력 방향만.
 */

import {
  LANE_WIDTH,
  LANE_COUNT,
  TIMELINE_WIDTH,
  EXTRA_LANE_WIDTH,
  TRILL_MOVE_PILL_WIDTH,
} from "./constants";
import {
  hitTestNoteAt,
  hitTestExtraNoteAt,
  hitTestTrillZoneAt,
  hitTestTrillZoneHandleAt,
} from "./hitTest";
import {
  beatFloatToRawBeat,
  beatFloatToSnapBeat,
  timelineXToExtraLane,
  timelineXToLane,
} from "./timelineProjection";
import { msToBeat, beatToFloat, auxNotesAsExtra, fromAuxIndex } from "../../shared";
import type { Beat, Lane, BpmMarker, Chart } from "../../shared";

/**
 * TimelineSpace가 의존하는 외부 사실의 주입 통로.
 * 어댑터(useTimelineSpace)가 store·renderer를 여기에 접어 넘긴다.
 */
export interface TimelineSpaceSource {
  getChart(): Chart;
  /** 어댑터가 memo해서 넘김(재계산 방지) */
  getBpmMarkers(): BpmMarker[];
  getSnapDivision(): number;
  getSelectedNotes(): Set<number>;
  getExtraLaneCount(): number;
  /** 렌더러 부재 시 null */
  yToTime(y: number): number | null;
  /** 렌더러 부재 시 null */
  getTotalTimelineMs(): number | null;
}

export interface TimelineSpace {
  xToLane(x: number): Lane | null;
  xToExtraLane(x: number): number | null;
  xToUnifiedLane(x: number): number | null;
  yToBeat(y: number): Beat;
  yToBeatRaw(y: number): Beat;
  snapBeat(beat: Beat): Beat;
  getSnapStep(): Beat;
  getMaxBeatFloat(): number;
  /**
   * 메인 레인(1..4) 한정 히트테스트 — 반환 인덱스는 chart.notes 통합 인덱스.
   * CreateMode 배치 제약(메인 배치만 관할)과 커서 z-order 체크가 소비한다.
   */
  hitTestNote(x: number, y: number): number | null;
  /**
   * 통합 히트테스트 — xToUnifiedLane 기반이라 메인·보조 노트의 chart.notes 통합 인덱스를 반환.
   * Select(선택·이동)·Delete·hover가 소비한다 (RFD 0018 ④d).
   */
  hitTestUnifiedNote(x: number, y: number): number | null;
  hitTestNoteEnd(x: number, y: number): number | null;
  hitTestEventEnd(x: number, y: number): number | null;
  hitTestTrillZoneEnd(x: number, y: number): number | null;
  hitTestTrillZone(x: number, y: number): number | null;
  hitTestTrillZoneHandle(x: number, y: number): number | null;
  hitTestExtraNote(x: number, y: number): number | null;
  getBpmMarkers(): BpmMarker[];
}

export function createTimelineSpace(source: TimelineSpaceSource): TimelineSpace {
  // --- 기본 좌표 변환 ---

  const xToLane = (x: number): Lane | null => {
    return timelineXToLane({
      timelineX: x,
      laneWidth: LANE_WIDTH,
      laneCount: LANE_COUNT,
    });
  };

  const xToExtraLane = (x: number): number | null => {
    return timelineXToExtraLane({
      timelineX: x,
      timelineWidth: TIMELINE_WIDTH,
      extraLaneWidth: EXTRA_LANE_WIDTH,
      extraLaneCount: source.getExtraLaneCount(),
    });
  };

  const xToUnifiedLane = (x: number): number | null => {
    const mainLane = xToLane(x);
    if (mainLane !== null) return mainLane;
    const auxIndex = xToExtraLane(x);
    return auxIndex === null ? null : fromAuxIndex(auxIndex);
  };

  const yToBeat = (y: number): Beat => {
    const timeMs = source.yToTime(y);
    if (timeMs === null) return { n: 0, d: 1 };
    const beatFloat = msToBeat(timeMs, source.getBpmMarkers(), source.getChart().meta.offsetMs);
    return beatFloatToSnapBeat({ beatFloat, snapDivision: source.getSnapDivision() });
  };

  const yToBeatRaw = (y: number): Beat => {
    const timeMs = source.yToTime(y);
    if (timeMs === null) return { n: 0, d: 1 };
    const beatFloat = msToBeat(timeMs, source.getBpmMarkers(), source.getChart().meta.offsetMs);
    return beatFloatToRawBeat({ beatFloat });
  };

  const snapBeat = (beat: Beat): Beat => {
    return beatFloatToSnapBeat({
      beatFloat: beatToFloat(beat),
      snapDivision: source.getSnapDivision(),
    });
  };

  const getSnapStep = (): Beat => {
    return { n: 4, d: source.getSnapDivision() };
  };

  const getMaxBeatFloat = (): number => {
    const totalMs = source.getTotalTimelineMs();
    if (totalMs === null) return 0;
    return msToBeat(totalMs, source.getBpmMarkers(), source.getChart().meta.offsetMs);
  };

  // --- 히트테스트 ---

  const hitTestNote = (x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const b = yToBeatRaw(y);
    return hitTestNoteAt(source.getChart().notes, lane, b.n / b.d, undefined, source.getSelectedNotes());
  };

  // 통합 히트테스트 — 보조 레인(5+)까지 포함해 chart.notes 통합 인덱스를 반환 (RFD 0018 ④).
  // hitTestNoteAt은 lane 비교만 하므로 통합 lane(5+)을 넘기면 보조 노트 인덱스를 찾는다.
  const hitTestUnifiedNote = (x: number, y: number): number | null => {
    const lane = xToUnifiedLane(x);
    if (lane === null) return null;
    const b = yToBeatRaw(y);
    return hitTestNoteAt(source.getChart().notes, lane, b.n / b.d, undefined, source.getSelectedNotes());
  };

  const hitTestNoteEnd = (x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const beat = yToBeatRaw(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 16;
    const notes = source.getChart().notes;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.lane !== lane) continue;
      if (!("endBeat" in note)) continue;
      const endBeatFloat = note.endBeat.n / note.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) return i;
    }
    return null;
  };

  const hitTestEventEnd = (x: number, y: number): number | null => {
    const extraLane = xToExtraLane(x);
    if (extraLane === null) return null;
    const beat = yToBeat(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 8;
    const events = source.getChart().events;
    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if ((evt.editorLane ?? 1) !== extraLane) continue;
      if (!("endBeat" in evt)) continue;
      const endBeatFloat = evt.endBeat.n / evt.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) return i;
    }
    return null;
  };

  const hitTestTrillZoneEnd = (x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const beat = yToBeatRaw(y);
    const testBeatFloat = beat.n / beat.d;
    const tolerance = 1 / 16;
    const trillZones = source.getChart().trillZones;
    for (let i = 0; i < trillZones.length; i++) {
      const zone = trillZones[i];
      if (zone.lane !== lane) continue;
      const endBeatFloat = zone.endBeat.n / zone.endBeat.d;
      if (Math.abs(testBeatFloat - endBeatFloat) < tolerance) return i;
    }
    return null;
  };

  const hitTestTrillZone = (x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const beat = yToBeatRaw(y);
    return hitTestTrillZoneAt(source.getChart().trillZones, lane, beat.n / beat.d);
  };

  const hitTestTrillZoneHandle = (x: number, y: number): number | null => {
    const lane = xToLane(x);
    if (lane === null) return null;
    const beat = yToBeatRaw(y);
    const xInLane = x - (lane - 1) * LANE_WIDTH;
    return hitTestTrillZoneHandleAt(
      source.getChart().trillZones,
      lane,
      beat.n / beat.d,
      xInLane,
      TRILL_MOVE_PILL_WIDTH,
      LANE_WIDTH,
    );
  };

  const hitTestExtraNote = (x: number, y: number): number | null => {
    const extraLane = xToExtraLane(x);
    if (extraLane === null) return null;
    const b = yToBeatRaw(y);
    // 보조 노트는 chart.notes(lane 5+)에 산다 — 파생 aux 배열로 히트테스트 (RFD 0018 ③).
    // 소비자는 널 체크(히트 유무)만 쓴다: CreateMode 배치 가드·터치 HoldHits. 인덱스를
    // chart.notes에 적용해야 하는 경로는 전부 hitTestUnifiedNote를 쓴다 (RFD 0018 ④d).
    return hitTestExtraNoteAt(auxNotesAsExtra(source.getChart().notes), extraLane, b.n / b.d);
  };

  return {
    xToLane,
    xToExtraLane,
    xToUnifiedLane,
    yToBeat,
    yToBeatRaw,
    snapBeat,
    getSnapStep,
    getMaxBeatFloat,
    hitTestNote,
    hitTestUnifiedNote,
    hitTestNoteEnd,
    hitTestEventEnd,
    hitTestTrillZoneEnd,
    hitTestTrillZone,
    hitTestTrillZoneHandle,
    hitTestExtraNote,
    getBpmMarkers: () => source.getBpmMarkers(),
  };
}
