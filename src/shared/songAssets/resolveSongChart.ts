import { beatCompare, beatEq, beatFromString } from '../types/beat';
import { isTimingEvent, type ChartDocument, type ChartEvent, type TimingEvent } from '../types/chart';
import { parseSongTiming, type SongTiming } from './songTiming';

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
 *
 * 차트의 BPM·박자 이벤트가 곡 타이밍과 종류·박·값이 모두 같으면(배열 순서는 보지 않는다) events를 그대로 둔다. 다르면
 * 곡 타이밍으로 교체한다. 교체할 때 박 순서, 같은 박은 BPM→박자로 앞에 두고, 일반 이벤트의 순서·레인은 그대로 둔다.
 */
export function resolveSongChart<T extends ChartDocument>(chart: T, song?: SongSharedData | null): T {
  if (!song) return chart;
  const timing = song.timing === null ? null : parseSongTiming(song.timing);
  const events = timing ? applySongTimingEvents(chart.events, timing) : chart.events;
  const imageFile = song.jacketUrl ?? chart.meta.imageFile;
  const offsetMs = timing?.offsetMs ?? chart.meta.offsetMs;
  const sameMeta = chart.meta.title === song.title && chart.meta.artist === song.artist
    && chart.meta.imageFile === imageFile && chart.meta.offsetMs === offsetMs;
  const meta = sameMeta ? chart.meta : { ...chart.meta, title: song.title, artist: song.artist, imageFile, offsetMs };
  return meta === chart.meta && events === chart.events ? chart : { ...chart, meta, events };
}

/**
 * 곡 타이밍과 종류·박·값이 같으면 받은 events 참조를, 다르면 교체 결과를 돌려준다. 값이 같은 타이밍 이벤트는 교체해도 같은
 * 객체로 남겨, 변경 취소가 선택을 객체로 다시 찾을 수 있게 한다.
 * 값을 검증하지 않으므로 DB 값은 parseSongTiming을 거친 뒤 넘긴다. 에디터의 곡 정보 변경 취소도 마지막 곡 저장 기준을
 * 이 규칙으로 되돌린다.
 */
export function applySongTimingEvents(events: ChartEvent[], timing: SongTiming): ChartEvent[] {
  const existing = events.filter(isTimingEvent);
  const songEvents: TimingEvent[] = [
    ...timing.bpmChanges.map(change => ({ type: 'bpm' as const, beat: beatFromString(change.beat), bpm: change.bpm })),
    ...timing.timeSignatureChanges.map(change => ({ type: 'timeSignature' as const, beat: beatFromString(change.beat),
      beatPerMeasure: beatFromString(change.beatPerMeasure) })),
  ].sort((a, b) => beatCompare(a.beat, b.beat));
  // 곡 타이밍은 종류·박마다 하나뿐이므로, 개수가 같고 곡의 모든 이벤트에 값까지 같은 파일 이벤트가 있으면 일대일이다.
  const unchanged = existing.length === songEvents.length
    && songEvents.every(songEvent => existing.some(event => sameTimingValue(event, songEvent)));
  if (unchanged) return events;
  const placed = songEvents.map((songEvent): ChartEvent =>
    existing.find(event => sameTimingValue(event, songEvent)) ?? songEvent);
  return [...placed, ...events.filter(event => !isTimingEvent(event))];
}

function samePosition(a: TimingEvent, b: TimingEvent): boolean {
  return a.type === b.type && beatEq(a.beat, b.beat);
}

function sameTimingValue(a: TimingEvent, b: TimingEvent): boolean {
  if (!samePosition(a, b)) return false;
  return a.type === 'bpm' && b.type === 'bpm' ? a.bpm === b.bpm
    : a.type === 'timeSignature' && b.type === 'timeSignature' && beatEq(a.beatPerMeasure, b.beatPerMeasure);
}
