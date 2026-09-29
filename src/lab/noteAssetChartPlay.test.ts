import { describe, expect, it } from 'vitest';
import { beat, createChartTiming } from '../shared';
import { parseNoteAssetPlayChart } from './noteAssetChartPlay';

const chartJson = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  version: 3,
  meta: {
    title: '스킨 연주 비교', artist: 'test', difficultyLabel: 'NORMAL', difficultyLevel: 1,
    imageFile: '', audioFile: 'song.ogg', previewAudioFile: '', offsetMs: 100,
  },
  notes: [
    { type: 'single', lane: 1, beat: '4' },
    { type: 'long', lane: 1, beat: '4', endBeat: '8' },
  ],
  trillZones: [],
  events: [{ type: 'bpm', beat: '0', bpm: 120 }],
  ...overrides,
});

describe('Skin Lab 실제 차트 불러오기', () => {
  it('BOM이 있는 v3 차트에서 120 BPM·오프셋 100ms·4→8박 롱노트를 보존한다', () => {
    const chart = parseNoteAssetPlayChart(`\uFEFF${chartJson()}`);
    expect(chart.meta.title).toBe('스킨 연주 비교');
    expect(chart.notes[1]).toEqual({ type: 'long', lane: 1, beat: beat(4), endBeat: beat(8) });
    const timing = createChartTiming(chart);
    expect(timing.noteTimesMs.get(0)).toBe(2100);
    expect(timing.noteEndTimesMs.get(1)).toBe(4100);
  });

  it('메인 레인 1과 보조 레인 5를 불러오면 레인 1만 연주한다', () => {
    const chart = parseNoteAssetPlayChart(chartJson({ notes: [
      { type: 'single', lane: 1, beat: '4' },
      { type: 'single', lane: 5, beat: '4' },
    ] }));
    expect(chart.notes).toEqual([{ type: 'single', lane: 1, beat: beat(4) }]);
  });

  it.each([
    { name: '노트 0개', notes: [] },
    { name: '보조 레인 5의 노트만 1개', notes: [{ type: 'single', lane: 5, beat: '4' }] },
  ])('$name이면 연주할 메인 레인 노트가 없다는 오류를 표시한다', ({ notes }) => {
    expect(() => parseNoteAssetPlayChart(chartJson({ notes }))).toThrow('연주할 노트가 없습니다');
  });

  it('같은 레인·4박에 싱글이 겹치면 배치 제약 위반으로 연주를 막는다', () => {
    expect(() => parseNoteAssetPlayChart(chartJson({ notes: [
      { type: 'single', lane: 1, beat: '4' }, { type: 'single', lane: 1, beat: '4' },
    ] }))).toThrow('배치 제약 위반');
  });

  it.each([0, -120, null])('BPM=%s이면 0보다 큰 숫자가 필요하다는 오류를 표시한다', bpm => {
    expect(() => parseNoteAssetPlayChart(chartJson({ events: [{ type: 'bpm', beat: '0', bpm }] }))).toThrow('BPM은 0보다 큰 숫자');
  });

  it('오프셋이 숫자가 아니면 재생을 시작하지 않고 차트 시간 오류를 표시한다', () => {
    const data = JSON.parse(chartJson());
    data.meta.offsetMs = 'invalid';
    expect(() => parseNoteAssetPlayChart(JSON.stringify(data))).toThrow('박자 또는 오프셋');
  });

  it('JSON이 아닌 파일을 읽으면 공통 차트 파서의 오류를 전달한다', () => {
    expect(() => parseNoteAssetPlayChart('not a chart')).toThrow('유효한 JSON이 아닙니다');
  });
});
