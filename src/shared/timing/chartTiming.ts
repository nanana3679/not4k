/**
 * ChartTiming — 차트 하나에서 파생되는 시간 뷰.
 *
 * 노트 시작/끝 ms, trillZone 시작 ms(레인별), 마디 시작 ms, 판정 수 집계를
 * 소유하는 deep module. beat→ms 파생은 콜사이트에 인라인하지 않고 항상 이
 * 뷰를 통해 읽는다. BPM 마커/박자표 마커는 1회 추출·캐시하고, offsetMs는
 * 인스턴스가 흡수해 콜사이트가 스레딩하지 않도록 한다.
 */

import type { Beat } from "../types/beat";
import type { NoteEntity, TrillZone, ChartEvent } from "../types/chart";
import type { Lane } from "../constants/note";
import {
  beatToMs,
  enumerateMeasureStartsMs,
  extractBpmMarkers,
  extractTimeSignatures,
} from "./index";

/** ChartTiming이 시간 뷰를 파생하는 데 필요한 최소 차트 표면. */
export interface ChartTimingSource {
  readonly notes: readonly NoteEntity[];
  readonly trillZones: readonly TrillZone[];
  readonly events: readonly ChartEvent[];
  readonly meta: { readonly offsetMs: number };
}

/** 차트 하나의 시간 파생 뷰. */
export interface ChartTiming {
  /** key = notes 인덱스, offsetMs 포함 */
  readonly noteTimesMs: ReadonlyMap<number, number>;
  /** 구간 노트('endBeat' in note)만, key = notes 인덱스 */
  readonly noteEndTimesMs: ReadonlyMap<number, number>;
  /** 레인별 trillZone 시작 ms (오름차순) */
  readonly trillZoneStartTimesMs: ReadonlyMap<Lane, readonly number[]>;
  /** offsetMs를 흡수한 beat→ms 변환. BPM 마커가 없으면 throw. */
  beatToMs(target: Beat): number;
  /** enumerateMeasureStartsMs 위임 — limitMs 이내 마디 시작 ms 순증 배열. */
  measureStartsMs(limitMs: number): number[];
  /** 노트 타입별 판정 수 총합과, startTimeMs 미만 노트의 skip 판정 수. */
  judgmentCounts(startTimeMs?: number): {
    totalJudgments: number;
    skippedJudgments: number;
  };
}

/** 노트 타입별 판정 수 (더블 헤드·더블롱 바디는 2회, 그 외 1회). */
function noteJudgmentCount(note: NoteEntity): number {
  if ("endBeat" in note) {
    return note.type === "doubleLong" ? 2 : 1; // 더블롱 바디: 키별 2회, 그 외 바디: 1회
  }
  if (note.type === "double") {
    return 2; // 더블 헤드: 서브판정 2회
  }
  return 1; // 싱글/트릴 헤드: 1회
}

export function createChartTiming(chart: ChartTimingSource): ChartTiming {
  const bpmMarkers = extractBpmMarkers(chart.events);
  const timeSignatures = extractTimeSignatures(chart.events);
  const offsetMs = chart.meta.offsetMs;

  const beatToMsHere = (target: Beat): number =>
    beatToMs(target, bpmMarkers, offsetMs);

  // eager 계산 — beatToMs가 빈 마커에서 throw하는 시점을 팩토리 호출 시점으로 보존.
  const noteTimesMs = new Map<number, number>();
  const noteEndTimesMs = new Map<number, number>();
  chart.notes.forEach((note, index) => {
    noteTimesMs.set(index, beatToMsHere(note.beat));
    if ("endBeat" in note) {
      noteEndTimesMs.set(index, beatToMsHere(note.endBeat));
    }
  });

  const trillZoneStartTimesMs = new Map<Lane, number[]>();
  for (const zone of chart.trillZones) {
    const startMs = beatToMsHere(zone.beat);
    const laneStartTimes = trillZoneStartTimesMs.get(zone.lane) ?? [];
    laneStartTimes.push(startMs);
    trillZoneStartTimesMs.set(zone.lane, laneStartTimes);
  }
  for (const startTimes of trillZoneStartTimesMs.values()) {
    startTimes.sort((a, b) => a - b);
  }

  return {
    noteTimesMs,
    noteEndTimesMs,
    trillZoneStartTimesMs,
    beatToMs: beatToMsHere,
    measureStartsMs: (limitMs: number): number[] =>
      enumerateMeasureStartsMs(limitMs, bpmMarkers, timeSignatures, offsetMs),
    judgmentCounts: (startTimeMs: number = 0) => {
      let totalJudgments = 0;
      let skippedJudgments = 0;
      for (let i = 0; i < chart.notes.length; i++) {
        const count = noteJudgmentCount(chart.notes[i]);
        totalJudgments += count;
        if (startTimeMs > 0) {
          const noteTime = noteTimesMs.get(i);
          if (noteTime !== undefined && noteTime < startTimeMs) {
            skippedJudgments += count;
          }
        }
      }
      return { totalJudgments, skippedJudgments };
    },
  };
}
