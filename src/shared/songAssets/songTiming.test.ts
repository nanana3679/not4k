import { describe, expect, it } from 'vitest';
import { parseSongTiming, type SongTiming } from './songTiming';

describe('parseSongTiming', () => {
  it.each(['bpmChanges', 'timeSignatureChanges'] as const)(
    '%s의 박 순서가 0→2→1, 0→-1, 0→1/2→2/4이면 역전·중복으로 거부한다', field => {
      for (const beats of [['0', '2', '1'], ['0', '-1'], ['0', '1/2', '2/4']]) {
        const timing = {
          bpmChanges: [{ beat: '0', bpm: 120 }],
          timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }],
          offsetMs: 0,
          [field]: beats.map(beat => field === 'bpmChanges' ? { beat, bpm: 120 } : { beat, beatPerMeasure: '4' }),
        };
        expect(() => parseSongTiming(timing)).toThrow(/박 순서/);
      }
    },
  );
  it('0박·3/2박 BPM과 0박·4박 박자표, offsetMs -25.5를 읽으면 분수 문자열을 보존한다', () => {
    const timing: SongTiming = {
      bpmChanges: [{ beat: '0', bpm: 151 }, { beat: '3/2', bpm: 180 }],
      timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }, { beat: '4', beatPerMeasure: '7/2' }],
      offsetMs: -25.5,
    };
    expect(parseSongTiming(timing)).toEqual(timing);
  });

  it.each([
    ['null', null],
    ['배열', []],
    ['offsetMs 누락', {}],
    ['offsetMs Infinity', { offsetMs: Infinity }],
    ['offsetMs NaN', { offsetMs: NaN }],
    ['offsetMs 문자열 0', { offsetMs: '0' }],
    ['빈 BPM 목록', { bpmChanges: [] }],
    ['빈 슬롯 1개인 BPM 목록', { bpmChanges: new Array(1) }],
    ['빈 박자표 목록', { timeSignatureChanges: [] }],
    ['BPM 목록 대신 객체', { bpmChanges: {} }],
    ['첫 BPM 1박', { bpmChanges: [{ beat: '1', bpm: 120 }] }],
    ['첫 박자표 4박', { timeSignatureChanges: [{ beat: '4', beatPerMeasure: '4' }] }],
    ['BPM 0', { bpmChanges: [{ beat: '0', bpm: 0 }] }],
    ['BPM -120', { bpmChanges: [{ beat: '0', bpm: -120 }] }],
    ['BPM Infinity', { bpmChanges: [{ beat: '0', bpm: Infinity }] }],
    ['BPM 문자열 120', { bpmChanges: [{ beat: '0', bpm: '120' }] }],
    ['숫자 beat 0', { bpmChanges: [{ beat: 0, bpm: 120 }] }],
    ['소수 문자열 beat 1.5', { bpmChanges: [{ beat: '0', bpm: 120 }, { beat: '1.5', bpm: 150 }] }],
    ['분모 0인 beat 1/0', { bpmChanges: [{ beat: '1/0', bpm: 120 }] }],
    ['안전 정수 초과 beat', { bpmChanges: [{ beat: '9007199254740992', bpm: 120 }] }],
    ['박 수 0', { timeSignatureChanges: [{ beat: '0', beatPerMeasure: '0' }] }],
    ['박 수 -4', { timeSignatureChanges: [{ beat: '0', beatPerMeasure: '-4' }] }],
    ['박 수 4/0', { timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4/0' }] }],
    ['숫자 박 수 4', { timeSignatureChanges: [{ beat: '0', beatPerMeasure: 4 }] }],
    ['BPM 항목 null', { bpmChanges: [null] }],
    ['editorLane 1 포함', { bpmChanges: [{ beat: '0', bpm: 120, editorLane: 1 }] }],
    ['알 수 없는 version 1', { version: 1 }],
  ])('%s인 곡 타이밍을 읽으면 SongTimingError로 거부한다', (_label, invalid) => {
    const value = invalid === null || Array.isArray(invalid) || Object.keys(invalid).length === 0
      ? invalid
      : { bpmChanges: [{ beat: '0', bpm: 120 }],
        timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 0, ...invalid };
    expect(() => parseSongTiming(value)).toThrow(/곡 타이밍/);
  });
});
