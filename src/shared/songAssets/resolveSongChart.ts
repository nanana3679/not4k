import { beatCompare, beatEq, beatFromString } from '../types/beat';
import type { BpmChangeEvent, ChartDocument, ChartEvent, TimeSignatureChangeEvent } from '../types/chart';
import { parseSongTiming, type SongTiming } from './songTiming';

/** DB의 timing은 내용 검증 전이므로 unknown으로 받는다. null만 미이행 상태다. */
export interface SongSharedData {
  readonly title: string;
  readonly artist: string;
  readonly jacketUrl: string | null;
  readonly timing: unknown;
}

type TimingEvent = BpmChangeEvent | TimeSignatureChangeEvent;

/** 파일에 같은 종류·박의 이벤트가 없는 곡 타이밍 BPM의 보조 레인. 0박 초기 BPM 자리와 같다(RFD 0082). */
const DEFAULT_BPM_EDITOR_LANE = 1;
/** 파일에 같은 종류·박의 이벤트가 없는 곡 타이밍 박자의 보조 레인. 0박 초기 박자 자리와 같다(RFD 0082). */
const DEFAULT_TIME_SIGNATURE_EDITOR_LANE = 2;

/**
 * 곡 행의 표시 정보·타이밍을 적용한다. 파일 형식·노트·차트별 이벤트의 박 좌표는 바꾸지 않는다.
 * jacketUrl이 null이면 기존 에디터 동작대로 파일의 imageFile을 유지한다(빈 문자열로 지우지 않는다).
 *
 * 곡 타이밍에는 editorLane이 없고, 보조 레인 배치는 차트 소유다. 차트의 BPM·박자 이벤트가 곡 타이밍과 종류·박·값이
 * 모두 같으면(레인·배열 순서는 보지 않는다) events를 그대로 둔다. 다르면 곡 타이밍으로 교체하되, 파일에 같은 종류·박의
 * 이벤트가 있으면 그 이벤트의 editorLane을 그대로 쓰고 값만 바꾼다. 파일에 없는 박의 이벤트만 BPM은 보조 레인1, 박자는
 * 2에 둔다. 따라서 파일에서 다른 이벤트를 비켜 둔 타이밍 이벤트가 겹침 위반으로 바뀌지 않는다. 0박 초기 설정을
 * 레인1·2로 옮기는 일은 에디터 열기가 맡는다(RFD 0082).
 * 교체할 때 박 순서, 같은 박은 BPM→박자로 앞에 두고, 일반 이벤트의 순서·레인은 그대로 둔다.
 * 파일에 없던 박의 이벤트가 기존 일반 이벤트와 겹친 자리는 숨기거나 자동 수리하지 않는다.
 */
export function resolveSongChart<T extends ChartDocument>(chart: T, song?: SongSharedData | null): T {
  if (!song) return chart;
  const timing = song.timing === null ? null : parseSongTiming(song.timing);
  const events = timing ? resolveTimingEvents(chart.events, timing) : chart.events;
  const imageFile = song.jacketUrl ?? chart.meta.imageFile;
  const offsetMs = timing?.offsetMs ?? chart.meta.offsetMs;
  const sameMeta = chart.meta.title === song.title && chart.meta.artist === song.artist
    && chart.meta.imageFile === imageFile && chart.meta.offsetMs === offsetMs;
  const meta = sameMeta ? chart.meta : { ...chart.meta, title: song.title, artist: song.artist, imageFile, offsetMs };
  return meta === chart.meta && events === chart.events ? chart : { ...chart, meta, events };
}

/** 곡 타이밍과 종류·박·값이 같으면 받은 events 참조를, 다르면 파일 레인을 이어받은 교체 결과를 돌려준다. */
function resolveTimingEvents(events: ChartEvent[], timing: SongTiming): ChartEvent[] {
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
  const placed = songEvents.map((songEvent): ChartEvent => {
    // 파일에 같은 종류·박이 여럿(중복 위반)이면 배열에서 먼저 나온 것의 레인을 쓰고 나머지는 교체로 빠진다.
    const match = existing.find(event => samePosition(event, songEvent));
    if (!match) return { ...songEvent, editorLane: songEvent.type === 'bpm'
      ? DEFAULT_BPM_EDITOR_LANE : DEFAULT_TIME_SIGNATURE_EDITOR_LANE };
    // songEvent에는 editorLane이 없으므로 파일 이벤트의 레인(생략 포함)이 그대로 남는다.
    return sameTimingValue(match, songEvent) ? match : { ...match, ...songEvent };
  });
  return [...placed, ...events.filter(event => !isTimingEvent(event))];
}

function isTimingEvent(event: ChartEvent): event is TimingEvent {
  return event.type === 'bpm' || event.type === 'timeSignature';
}

function samePosition(a: TimingEvent, b: TimingEvent): boolean {
  return a.type === b.type && beatEq(a.beat, b.beat);
}

function sameTimingValue(a: TimingEvent, b: TimingEvent): boolean {
  if (!samePosition(a, b)) return false;
  return a.type === 'bpm' && b.type === 'bpm' ? a.bpm === b.bpm
    : a.type === 'timeSignature' && b.type === 'timeSignature' && beatEq(a.beatPerMeasure, b.beatPerMeasure);
}
