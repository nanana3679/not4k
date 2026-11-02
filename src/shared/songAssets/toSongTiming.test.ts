import { describe, expect, it } from 'vitest';
import { beat } from '../types/beat';
import type { ChartDocument } from '../types/chart';
import { resolveSongChart } from './resolveSongChart';
import { toSongTiming } from './toSongTiming';

const chart: ChartDocument = {
  meta: { title: '곡', artist: '작곡가', difficultyLabel: 'normal', difficultyLevel: 5,
    imageFile: '', audioFile: '', previewAudioFile: '', offsetMs: -25.5 },
  notes: [], trillZones: [], events: [
    { type: 'bpm', beat: beat(3, 2), bpm: 180, editorLane: 3 },
    { type: 'timeSignature', beat: beat(4), beatPerMeasure: beat(7, 2), editorLane: 4 },
    { type: 'bpm', beat: beat(0), bpm: 120, editorLane: 1 },
    { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
  ],
};
describe('toSongTiming', () => {
  it('3/2박 BPM 180·4박 박자 7/2·오프셋 -25.5를 왕복하면 레인 없이 박 순서로 같은 타이밍을 얻는다', () => {
    const timing = toSongTiming(chart);
    expect(timing).toEqual({ bpmChanges: [{ beat: '0', bpm: 120 }, { beat: '3/2', bpm: 180 }],
      timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }, { beat: '4', beatPerMeasure: '7/2' }], offsetMs: -25.5 });
    expect(toSongTiming(resolveSongChart(chart, { title: '곡', artist: '작곡가', jacketUrl: null, timing }))).toEqual(timing);
    expect(chart.events[0]).toMatchObject({ editorLane: 3 });
  });
});

it('박자 14/4와 BPM 위치 6/4를 변환하면 7/2·3/2로 정규화되어 resolveSongChart 왕복이 같다', () => {
  const source = { ...chart, events: chart.events.map(event => event.type === 'timeSignature' && event.beat.n === 4
    ? { ...event, beatPerMeasure: { n: 14, d: 4 } } : event.type === 'bpm' && event.bpm === 180
      ? { ...event, beat: { n: 6, d: 4 } } : event) };
  const timing = toSongTiming(source);
  expect(timing.bpmChanges[1].beat).toBe('3/2');
  expect(timing.timeSignatureChanges[1].beatPerMeasure).toBe('7/2');
  expect(toSongTiming(resolveSongChart(source, { title: '곡', artist: '작곡가', jacketUrl: null, timing }))).toEqual(timing);
});
