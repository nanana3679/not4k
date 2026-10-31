import type { Beat } from '../../../shared/types/beat';
import { beat, beatAdd } from '../../../shared/types/beat';
import type { ChartDocument, DocumentNoteEntity, RestZone, TrillZone } from '../../../shared/types/chart';
import { beatToMs, extractBpmChanges } from '../../../shared/timing';
import { TUTORIAL_PREVIEW_RENDER_CYCLES, type TutorialPreviewDefinition } from './tutorialPreviewChart';

/**
 * 명시 노트(`tap`·`body`·`release`·`tick`) 문서로 만든 튜토리얼 재생기 정의. 재생기는 `engine` 필드로 명시 판정 엔진을 고른다.
 * 구형 `TutorialPreviewDefinition`과 같은 반복·표시 필드를 가지며 `tutorialInput`·`tutorialDiagram`도 같은 문서 이벤트로 둔다.
 * 구형 정의를 실행 중에 변환해 만들지 않고 명시 노트로 직접 저작한다(RFD 0037 §8).
 */
export interface ExplicitTutorialPreviewDefinition {
  readonly engine: 'explicit';
  readonly id: string;
  readonly title: string;
  readonly bodyLines: readonly string[];
  readonly loopBeats: number;
  /** 판정 controller가 compile하는 원본 한 반복 */
  readonly chart: ChartDocument;
  /** 앞뒤 반복의 노트가 이어 보이도록 원본을 3벌 이어 붙인 표시 전용 문서 */
  readonly renderChart: ChartDocument;
  readonly loopMs: number;
  readonly renderStartMs: number;
  readonly renderDurationMs: number;
}

export function isExplicitTutorialPreview(
  preview: TutorialPreviewDefinition | ExplicitTutorialPreviewDefinition,
): preview is ExplicitTutorialPreviewDefinition {
  return 'engine' in preview && preview.engine === 'explicit';
}

function offsetBeat(source: Beat, cycleIndex: number, loopBeats: number): Beat {
  return beatAdd(source, beat(loopBeats * cycleIndex));
}

function offsetNote(note: DocumentNoteEntity, cycleIndex: number, loopBeats: number): DocumentNoteEntity {
  const shiftedBeat = offsetBeat(note.beat, cycleIndex, loopBeats);
  return 'endBeat' in note
    ? { ...note, beat: shiftedBeat, endBeat: offsetBeat(note.endBeat, cycleIndex, loopBeats) }
    : { ...note, beat: shiftedBeat };
}

function offsetZone<Zone extends TrillZone | RestZone>(zone: Zone, cycleIndex: number, loopBeats: number): Zone {
  return {
    ...zone,
    beat: offsetBeat(zone.beat, cycleIndex, loopBeats),
    endBeat: offsetBeat(zone.endBeat, cycleIndex, loopBeats),
  };
}

/**
 * 구형 renderChart와 같은 3벌 표시 문서. 복사본 k의 노트·구간은 원본보다 k × loopBeats 늦고, notes는 복사본 순서로 이어 붙여
 * 표시 note index = 복사본 × 원본 노트 수 + 원본 index다. bpm 이벤트는 복사본마다 옮겨 원본 시간 맵을 반복하고, 박자표는 원본만 둔다
 * (입력 시연·도식은 원본 문서가 담당).
 */
export function createExplicitTutorialRenderDocument(chart: ChartDocument, loopBeats: number): ChartDocument {
  const cycleIndices = Array.from({ length: TUTORIAL_PREVIEW_RENDER_CYCLES }, (_, cycleIndex) => cycleIndex);
  const bpmEvents = chart.events.filter(event => event.type === 'bpm');
  // 박자표는 원본만 둔다. 반복 길이가 마디로 나누어떨어지지 않으면 복사한 박자표가 마디 중간에 놓여 문서 검증에 걸린다.
  // 박자표는 마디선 표시에만 쓰이고 노트 시간에는 영향이 없다.
  const timeSignatureEvents = chart.events.filter(event => event.type === 'timeSignature');
  return {
    ...chart,
    notes: cycleIndices.flatMap(cycleIndex => chart.notes.map(note => offsetNote(note, cycleIndex, loopBeats))),
    trillZones: cycleIndices.flatMap(cycleIndex => chart.trillZones.map(zone => offsetZone(zone, cycleIndex, loopBeats))),
    restZones: cycleIndices.flatMap(cycleIndex => (chart.restZones ?? []).map(zone => offsetZone(zone, cycleIndex, loopBeats))),
    events: [
      ...cycleIndices.flatMap(cycleIndex => bpmEvents.map(event => ({
        ...event,
        beat: offsetBeat(event.beat, cycleIndex, loopBeats),
      }))),
      ...timeSignatureEvents,
    ],
  };
}

function getLoopDurationMs(chart: ChartDocument, loopBeats: number): number {
  const bpmChanges = extractBpmChanges(chart.events);
  return beatToMs(beat(loopBeats), bpmChanges, chart.meta.offsetMs) - beatToMs(beat(0), bpmChanges, chart.meta.offsetMs);
}

export function createExplicitTutorialPreview(
  id: string,
  title: string,
  bodyLines: readonly string[],
  loopBeats: number,
  chart: ChartDocument,
): ExplicitTutorialPreviewDefinition {
  const loopMs = getLoopDurationMs(chart, loopBeats);
  return {
    engine: 'explicit',
    id,
    title,
    bodyLines,
    loopBeats,
    chart,
    renderChart: createExplicitTutorialRenderDocument(chart, loopBeats),
    loopMs,
    renderStartMs: loopMs,
    renderDurationMs: loopMs * TUTORIAL_PREVIEW_RENDER_CYCLES,
  };
}
