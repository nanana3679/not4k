import { beat, beatAdd } from '../../../shared/types/beat';
import type { Beat } from '../../../shared/types/beat';
import { createChartTiming } from '../../../shared/timing/chartTiming';
import type { ExplicitBodyConnection } from '../../../shared/chart/explicitNoteRelations';
import type { ExplicitCompiledChart, ExplicitScoreItem } from '../../judgment/explicitCompiledChart';
import type { ExplicitTutorialPreviewDefinition } from './explicitTutorialPreviewChart';
import { TUTORIAL_PREVIEW_RENDER_CYCLES } from './tutorialPreviewChart';

/**
 * 검증된 원본 compile을 표시 전용 3벌로 옮긴다. 반복 끝의 릴리즈와 다음 반복 시작의 탭은 독립된 세션이므로,
 * 표시 문서를 다시 검증하거나 복사본 사이의 바디 연결을 도출하지 않는다.
 * 모든 note/body index는 문서 notes 기준이다. ordinal은 한 노트 안의 몫이라 유지하고 trillZone index는 별도로 옮긴다.
 */
export function createExplicitTutorialRenderChart(
  source: ExplicitCompiledChart,
  preview: ExplicitTutorialPreviewDefinition,
): ExplicitCompiledChart {
  const copies = Array.from({ length: TUTORIAL_PREVIEW_RENDER_CYCLES }, (_, cycle) => {
    const noteOffset = cycle * preview.chart.notes.length;
    const zoneOffset = cycle * preview.chart.trillZones.length;
    const timeOffset = cycle * preview.loopMs;
    const beatOffset = beat(cycle * preview.loopBeats);
    const shiftIndex = (index: number) => index + noteOffset;
    const shiftOptionalIndex = (index: number | undefined) => index === undefined ? undefined : shiftIndex(index);
    const shiftZone = (index: number | undefined) => index === undefined ? undefined : index + zoneOffset;
    const shiftBeat = (value: Beat) => beatAdd(value, beatOffset);
    const shiftMap = <T, U>(values: ReadonlyMap<number, T>, shift: (value: T) => U) =>
      new Map([...values].map(([index, value]) => [shiftIndex(index), shift(value)]));
    const shiftIndices = (indices: readonly number[]) => indices.map(shiftIndex);
    const shiftConnection = (connection: ExplicitBodyConnection): ExplicitBodyConnection => ({
      ...connection,
      predecessorIndex: shiftIndex(connection.predecessorIndex),
      successorIndex: shiftIndex(connection.successorIndex),
      beat: shiftBeat(connection.beat),
    });
    const scoreItems = source.scoreItems.map((item): ExplicitScoreItem => {
      const noteIndex = shiftIndex(item.source.noteIndex);
      const shifted = { id: `n${noteIndex}:${item.kind}:${item.ordinal}`, source: { noteIndex },
        beat: shiftBeat(item.beat), timeMs: item.timeMs + timeOffset };
      switch (item.kind) {
        case 'tap': return { ...item, ...shifted,
          startsBodyIndices: shiftIndices(item.startsBodyIndices), trillZoneIndex: shiftZone(item.trillZoneIndex) };
        case 'release': return { ...item, ...shifted, bodyIndex: shiftOptionalIndex(item.bodyIndex) };
        case 'tick': return { ...item, ...shifted, bodyIndex: shiftIndex(item.bodyIndex),
          bodyUnit: { ...item.bodyUnit, bodyIndex: shiftIndex(item.bodyUnit.bodyIndex) } };
      }
    });
    const bodies = source.bodies.map(body => ({
      ...body,
      source: { noteIndex: shiftIndex(body.source.noteIndex) },
      beat: shiftBeat(body.beat), endBeat: shiftBeat(body.endBeat),
      startMs: body.startMs + timeOffset, endMs: body.endMs + timeOffset,
      trillZoneIndex: shiftZone(body.trillZoneIndex),
      startTapIndices: shiftIndices(body.startTapIndices),
      releaseIndices: shiftIndices(body.releaseIndices), tickIndices: shiftIndices(body.tickIndices),
      units: body.units.map(unit => ({
        ...unit,
        id: `b${shiftIndex(unit.ref.bodyIndex)}:hold:${unit.ref.ordinal}`,
        source: { noteIndex: shiftIndex(unit.source.noteIndex) },
        ref: { ...unit.ref, bodyIndex: shiftIndex(unit.ref.bodyIndex) },
        startMs: unit.startMs + timeOffset, endMs: unit.endMs + timeOffset,
      })),
    }));
    const relations = source.relations;
    return {
      scoreItems, bodies,
      connections: source.connections.map(connection => ({
        ...shiftConnection(connection), boundaryMs: connection.boundaryMs + timeOffset,
      })),
      relationBodies: relations.bodies.map(body => ({
        ...body,
        noteIndex: shiftIndex(body.noteIndex),
        note: { ...body.note, beat: shiftBeat(body.note.beat), endBeat: shiftBeat(body.note.endBeat) },
        startTapIndices: shiftIndices(body.startTapIndices), endReleaseIndices: shiftIndices(body.endReleaseIndices),
        tickIndices: shiftIndices(body.tickIndices), predecessorIndices: shiftIndices(body.predecessorIndices),
        successorIndices: shiftIndices(body.successorIndices),
      })),
      relationConnections: relations.connections.map(shiftConnection),
      tickBodyCandidatesByNote: shiftMap(relations.tickBodyCandidatesByNote, shiftIndices),
      tickBodyByNote: shiftMap(relations.tickBodyByNote, shiftIndex),
      releaseBodyCandidatesByNote: shiftMap(relations.releaseBodyCandidatesByNote, shiftIndices),
      releaseBodyByNote: shiftMap(relations.releaseBodyByNote, shiftIndex),
    };
  });
  const bodies = copies.flatMap(copy => copy.bodies);
  const relationBodies = copies.flatMap(copy => copy.relationBodies);
  return {
    format: 'explicit',
    // 구간·마디선은 3벌 문서의 BPM/박자표로 그린다. ChartTiming은 문서를 검증하지 않는다.
    timing: createChartTiming(preview.renderChart),
    scoreItems: copies.flatMap(copy => copy.scoreItems),
    bodies, bodyUnits: bodies.flatMap(body => body.units),
    connections: copies.flatMap(copy => copy.connections),
    relations: {
      bodies: relationBodies,
      bodyByNote: new Map(relationBodies.map(body => [body.noteIndex, body])),
      connections: copies.flatMap(copy => copy.relationConnections),
      tickBodyCandidatesByNote: new Map(copies.flatMap(copy => [...copy.tickBodyCandidatesByNote])),
      tickBodyByNote: new Map(copies.flatMap(copy => [...copy.tickBodyByNote])),
      releaseBodyCandidatesByNote: new Map(copies.flatMap(copy => [...copy.releaseBodyCandidatesByNote])),
      releaseBodyByNote: new Map(copies.flatMap(copy => [...copy.releaseBodyByNote])),
    },
    theoreticalWeight: source.theoreticalWeight * TUTORIAL_PREVIEW_RENDER_CYCLES,
    totalJudgments: source.totalJudgments * TUTORIAL_PREVIEW_RENDER_CYCLES,
  };
}
