import type { ExplicitCompiledChart, ExplicitScoreItem } from "./explicitCompiledChart";

/** 새 커서 세션만 명시 시각 < cut 항목을 제외한다. 정확히 cut인 항목은 포함한다. */
export function selectExplicitPlaybackChart(compiled: ExplicitCompiledChart, startTimeMs: number): ExplicitCompiledChart {
  return createExplicitPlaybackChartView(compiled, startTimeMs, compiled.scoreItems.filter(item => item.timeMs >= startTimeMs));
}

/**
 * 옵저버 선택 구간 [start, end] 밖 항목을 제외하고 경계에 걸친 바디를 양 끝에서 자른다. 정확히 양 끝인 항목은 포함한다.
 * 잘린 경계에 새 탭·릴리즈를 만들지 않는다(RFD 0063).
 */
export function selectExplicitRangePlaybackChart(
  compiled: ExplicitCompiledChart, startTimeMs: number, endTimeMs: number,
): ExplicitCompiledChart {
  if (!Number.isFinite(startTimeMs)) throw new RangeError("재생 시작 시각은 유한해야 합니다");
  if (!Number.isFinite(endTimeMs)) throw new RangeError("재생 끝 시각은 유한해야 합니다");
  return createExplicitPlaybackChartView(compiled, startTimeMs,
    compiled.scoreItems.filter(item => item.timeMs >= startTimeMs && item.timeMs <= endTimeMs), endTimeMs);
}

/**
 * 원본 timing·관계·source index를 유지하는 재생용 범위다. 저장 문서나 compiler 결과를 수정하지 않는다.
 * 재개는 기존 점수 항목을 그대로 넘겨 미처리 기회와 이론 가중치를 보존한다.
 * 시작·끝 시각은 바디만 자른다. 남길 점수 항목은 호출자가 고른다.
 */
export function createExplicitPlaybackChartView(
  compiled: ExplicitCompiledChart, startTimeMs: number, retainedItems: readonly ExplicitScoreItem[], endTimeMs = Infinity,
): ExplicitCompiledChart {
  if (!Number.isFinite(startTimeMs)) throw new RangeError("재생 시작 시각은 유한해야 합니다");
  if (!(endTimeMs >= startTimeMs)) throw new RangeError("재생 끝 시각은 시작 시각 이상이어야 합니다");
  const scoreItems = Object.freeze(retainedItems.map(item => Object.freeze({ ...item,
    source: Object.freeze({ ...item.source }), beat: Object.freeze({ ...item.beat }),
    ...(item.kind === "tap" ? { startsBodyIndices: Object.freeze([...item.startsBodyIndices]) } : {}),
    ...(item.kind === "tick" ? { bodyUnit: Object.freeze({ ...item.bodyUnit }) } : {}),
  })));
  const retainedNoteIndices = new Set(scoreItems.map(item => item.source.noteIndex));
  const bodies = Object.freeze(compiled.bodies.filter(body => body.endMs >= startTimeMs && body.startMs <= endTimeMs).map(body => {
    const startMs = Math.max(body.startMs, startTimeMs);
    const endMs = Math.min(body.endMs, endTimeMs);
    const source = Object.freeze({ ...body.source });
    return Object.freeze({ ...body, source, startMs, endMs,
      // Beat와 timing은 원본 배치의 출처다. 실제 재생·표시 경계만 ms 범위로 자른다.
      beat: Object.freeze({ ...body.beat }), endBeat: Object.freeze({ ...body.endBeat }),
      startTapIndices: Object.freeze(body.startTapIndices.filter(index => retainedNoteIndices.has(index))),
      releaseIndices: Object.freeze(body.releaseIndices.filter(index => retainedNoteIndices.has(index))),
      tickIndices: Object.freeze(body.tickIndices.filter(index => retainedNoteIndices.has(index))),
      units: Object.freeze(body.units.map(unit => Object.freeze({ ...unit, source, startMs, endMs,
        ref: Object.freeze({ ...unit.ref }) }))),
    });
  }));
  const bodyIndices = new Set(bodies.map(body => body.source.noteIndex));
  const connections = Object.freeze(compiled.connections.filter(connection => bodyIndices.has(connection.predecessorIndex)
    && bodyIndices.has(connection.successorIndex)).map(connection => Object.freeze({ ...connection })));
  return Object.freeze({ ...compiled, bodies, bodyUnits: Object.freeze(bodies.flatMap(body => body.units)), connections, scoreItems,
    totalJudgments: scoreItems.length, theoreticalWeight: scoreItems.reduce((sum, item) => sum + item.weight, 0) });
}
