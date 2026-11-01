import { beatCompare, beatEq, beatFromString } from '../types/beat';
import type { BpmChangeEvent, ChartDocument, ChartEvent, TimeSignatureChangeEvent } from '../types/chart';
import { parseSongTiming } from './songTiming';

/** DB의 timing은 내용 검증 전이므로 unknown으로 받는다. null만 미이행 상태다. */
export interface SongSharedData {
  readonly title: string;
  readonly artist: string;
  readonly jacketUrl: string | null;
  readonly timing: unknown;
}

/**
 * 곡 행의 표시 정보·타이밍을 적용한다. 파일 형식·노트·차트별 이벤트의 박 좌표는 바꾸지 않는다.
 * jacketUrl이 null이면 기존 에디터 동작대로 파일의 imageFile을 유지한다(빈 문자열로 지우지 않는다).
 * 곡 타이밍에는 editorLane이 없으므로 BPM은 보조 레인1, 박자는 2에 배치한다(초기값은 RFD 0082).
 * 교체할 때 박 순서, 같은 박은 BPM→박자로 앞에 두고, 일반 이벤트의 순서·레인은 그대로 둔다.
 * 따라서 기존 일반 이벤트와 겹친 자리는 숨기거나 자동 수리하지 않는다.
 */
export function resolveSongChart<T extends ChartDocument>(chart: T, song?: SongSharedData | null): T {
  if (!song) return chart;
  const timing = song.timing === null ? null : parseSongTiming(song.timing);
  const timingEvents: ChartEvent[] = timing ? [
    ...timing.bpmChanges.map(change => ({ type: 'bpm' as const, beat: beatFromString(change.beat),
      bpm: change.bpm, editorLane: 1 })),
    ...timing.timeSignatureChanges.map(change => ({ type: 'timeSignature' as const, beat: beatFromString(change.beat),
      beatPerMeasure: beatFromString(change.beatPerMeasure), editorLane: 2 })),
  ].sort((a, b) => beatCompare(a.beat, b.beat)) : [];
  const existingTiming = chart.events.filter(isTimingEvent);
  const sameTiming = existingTiming.length === timingEvents.length
    && existingTiming.every((event, index) => sameTimingEvent(event, timingEvents[index]));
  const events = !timing || sameTiming ? chart.events
    : [...timingEvents, ...chart.events.filter(event => !isTimingEvent(event))];
  const imageFile = song.jacketUrl ?? chart.meta.imageFile;
  const offsetMs = timing?.offsetMs ?? chart.meta.offsetMs;
  const sameMeta = chart.meta.title === song.title && chart.meta.artist === song.artist
    && chart.meta.imageFile === imageFile && chart.meta.offsetMs === offsetMs;
  const meta = sameMeta ? chart.meta : { ...chart.meta, title: song.title, artist: song.artist, imageFile, offsetMs };
  return meta === chart.meta && events === chart.events ? chart : { ...chart, meta, events };
}

function isTimingEvent(event: ChartEvent): event is BpmChangeEvent | TimeSignatureChangeEvent {
  return event.type === 'bpm' || event.type === 'timeSignature';
}

function sameTimingEvent(a: BpmChangeEvent | TimeSignatureChangeEvent, b: ChartEvent): boolean {
  if (!beatEq(a.beat, b.beat) || (a.editorLane ?? 1) !== b.editorLane) return false;
  return a.type === 'bpm' && b.type === 'bpm' ? a.bpm === b.bpm
    : a.type === 'timeSignature' && b.type === 'timeSignature' && beatEq(a.beatPerMeasure, b.beatPerMeasure);
}
