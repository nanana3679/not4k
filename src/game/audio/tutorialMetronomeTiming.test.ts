import { expect, it } from 'vitest';
import { beat } from '../../shared/types/beat';
import { createTutorialMetronomePattern, getTutorialClicks, tutorialAudioTime, tutorialPerformanceTime } from './tutorialMetronomeTiming';

it('120 BPM에서 2박 뒤 60 BPM으로 바뀌면 클릭은 0·500·1000·2000ms이고 끝 경계 3000ms는 제외한다', () => {
  const pattern = createTutorialMetronomePattern({
    notes: [], trillZones: [], meta: { offsetMs: 0 },
    events: [
      { type: 'bpm', beat: beat(0), bpm: 120 },
      { type: 'bpm', beat: beat(2), bpm: 60 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(3) },
    ],
  }, 3000);
  expect(pattern.beats).toEqual([
    { atMs: 0, accent: true }, { atMs: 500, accent: false },
    { atMs: 1000, accent: false }, { atMs: 2000, accent: true },
  ]);
  expect(pattern.countIn).toEqual([
    { atMs: -2000, accent: true }, { atMs: -1500, accent: false },
    { atMs: -1000, accent: false }, { atMs: -500, accent: false },
  ]);
});

it('출력 지연 80ms이면 1500ms에 들릴 클릭을 audio 10.42초에 예약하고 역변환도 1500ms이다', () => {
  const sample = { audioTime: 10, performanceTime: 1000, latencyMs: 80 };
  expect(tutorialAudioTime(1500, sample)).toBeCloseTo(10.42);
  expect(tutorialPerformanceTime(10.42, sample)).toBeCloseTo(1500);
});

it('유효한 출력 timestamp가 있으면 보고된 지연 80ms를 중복 차감하지 않는다', () => {
  const sample = { audioTime: 10, performanceTime: 1000, latencyMs: 80,
    outputTimestamp: { contextTime: 9.8, performanceTime: 980 } };
  expect(tutorialAudioTime(1500, sample)).toBeCloseTo(10.32);
  expect(tutorialPerformanceTime(10.32, sample)).toBeCloseTo(1500);
});

it('1500ms 루프의 10000번째 경계에서 예약하면 준비 4박 없이 15000000·15000500ms 클릭만 반환한다', () => {
  const pattern = { loopMs: 1500, countInMs: 2000,
    countIn: [{ atMs: -2000, accent: true }],
    beats: [{ atMs: 0, accent: true }, { atMs: 500, accent: false }, { atMs: 1000, accent: false }] };
  expect(getTutorialClicks(pattern, 14999999, 15000501)).toEqual([
    { atMs: 15000000, accent: true }, { atMs: 15000500, accent: false },
  ]);
});

it('출력 timestamp가 0/0이면 아직 출력 전이므로 80ms 지연 보정으로 1500ms를 audio 10.42초에 매핑한다', () => {
  expect(tutorialAudioTime(1500, { audioTime: 10, performanceTime: 1000, latencyMs: 80,
    outputTimestamp: { contextTime: 0, performanceTime: 0 } })).toBeCloseTo(10.42);
});
