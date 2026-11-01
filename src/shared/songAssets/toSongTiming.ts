import { beat, beatCompare, beatToString, type Beat } from '../types/beat';
import type { ChartDocument } from '../types/chart';
import type { SongTiming } from './songTiming';

const fraction = (value: Beat) => beatToString(beat(value.n, value.d));

/** resolveSongChart의 역변환. 편집 레인은 제외하고 분수·박 순서를 정규화한다. */
export function toSongTiming(chart: ChartDocument): SongTiming {
  const events = [...chart.events].sort((a, b) => beatCompare(a.beat, b.beat));
  return {
    bpmChanges: events.filter(event => event.type === 'bpm')
      .map(event => ({ beat: fraction(event.beat), bpm: event.bpm })),
    timeSignatureChanges: events.filter(event => event.type === 'timeSignature')
      .map(event => ({ beat: fraction(event.beat), beatPerMeasure: fraction(event.beatPerMeasure) })),
    offsetMs: chart.meta.offsetMs,
  };
}
