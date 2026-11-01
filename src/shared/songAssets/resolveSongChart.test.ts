import { describe, expect, it } from 'vitest';
import { beat } from '../types/beat';
import type { ChartDocument } from '../types/chart';
import { createChartTiming } from '../timing/chartTiming';
import { resolveSongChart, type SongSharedData } from './resolveSongChart';

function chart(bpm = 150, difficultyLabel = 'EASY'): ChartDocument {
  return {
    meta: { title: '파일 제목', artist: '파일 작곡가', imageFile: 'old.jpg',
      audioFile: 'audio.ogg', previewAudioFile: 'preview.wav', difficultyLabel, difficultyLevel: 3, offsetMs: 100 },
    notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(1) }],
    trillZones: [], restZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm, editorLane: 3 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 1 },
      { type: 'bpm', beat: beat(8), bpm: 200, editorLane: 4 },
      { type: 'text', beat: beat(4), endBeat: beat(8), text: 'hello', editorLane: 3 },
    ],
  };
}

const song: SongSharedData = {
  title: '곡 제목', artist: '곡 작곡가', jacketUrl: 'songs/jacket.png',
  timing: {
    bpmChanges: [{ beat: '0', bpm: 151 }, { beat: '3/2', bpm: 180 }],
    timeSignatureChanges: [{ beat: '0', beatPerMeasure: '3' }, { beat: '6', beatPerMeasure: '7/2' }],
    offsetMs: -25,
  },
};

describe('resolveSongChart', () => {
  it('151 BPM을 적용한 차트에 같은 곡을 다시 적용하면 차트·meta·events 참조가 그대로다', () => {
    const resolved = resolveSongChart(chart(), song);
    expect(resolveSongChart(resolved, song)).toBe(resolved);
    const displayOnly = resolveSongChart(resolved, { ...song, title: '새 제목' });
    expect(displayOnly.events).toBe(resolved.events);
    const offsetOnly = resolveSongChart(resolved, { ...song, timing: { ...song.timing as object, offsetMs: 50 } });
    expect(offsetOnly.events).toBe(resolved.events);
    const timingOnly = resolveSongChart(resolved, { ...song, timing: { ...song.timing as object,
      bpmChanges: [{ beat: '0', bpm: 152 }] } });
    expect(timingOnly.meta).toBe(resolved.meta);
  });

  it('timing·jacketUrl null이고 제목·아티스트가 같으면 old.jpg·이벤트 순서·editorLane 3을 포함해 같은 차트를 반환한다', () => {
    const original = chart();
    expect(resolveSongChart(original, { title: original.meta.title, artist: original.meta.artist,
      jacketUrl: null, timing: null })).toBe(original);
  });

  it.each([undefined, {}, { bpmChanges: [{ beat: '0', bpm: 0 }],
    timeSignatureChanges: [{ beat: '0', beatPerMeasure: '4' }], offsetMs: 0 }])(
    'timing %j가 잘못되면 150 BPM 사본으로 돌아가지 않고 오류를 전달한다', timing => {
      expect(() => resolveSongChart(chart(), { ...song, timing })).toThrow(/곡 타이밍/);
    },
  );
  it('곡 행이 없으면 150 BPM·offsetMs 100과 표시 정보를 같은 차트 참조로 유지한다', () => {
    const original = chart();
    expect(resolveSongChart(original, null)).toBe(original);
    expect(resolveSongChart(original)).toBe(original);
  });

  it('timing·jacketUrl null이면 제목·아티스트만 곡 값으로 바꾸고 old.jpg·150 BPM·offsetMs 100·이벤트 참조를 유지한다', () => {
    const original = chart();
    const resolved = resolveSongChart(original, { ...song, timing: null, jacketUrl: null });
    expect(resolved.events).toBe(original.events);
    expect(resolved.meta).toEqual({ ...original.meta, title: '곡 제목', artist: '곡 작곡가', imageFile: 'old.jpg' });
  });
  it.each([[150, 'EASY'], [160, 'HARD']] as const)(
    '%i BPM인 %s 사본에 곡 151 BPM을 적용하면 표시 정보·타이밍만 교체하고 박 좌표를 유지한다', (bpm, difficulty) => {
      const original = chart(bpm, difficulty);
      const before = structuredClone(original);
      const resolved = resolveSongChart(original, song);
      expect(resolved.meta).toEqual({ ...original.meta, title: '곡 제목', artist: '곡 작곡가',
        imageFile: 'songs/jacket.png', offsetMs: -25 });
      expect(resolved.events).toEqual([
        { type: 'bpm', beat: beat(0), bpm: 151, editorLane: 1 },
        { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(3), editorLane: 2 },
        { type: 'bpm', beat: beat(3, 2), bpm: 180, editorLane: 1 },
        { type: 'timeSignature', beat: beat(6), beatPerMeasure: beat(7, 2), editorLane: 2 },
        original.events[3],
      ]);
      expect(resolved.events[4]).toBe(original.events[3]);
      expect(resolved.notes).toBe(original.notes);
      expect(resolved.trillZones).toBe(original.trillZones);
      expect(resolved.restZones).toBe(original.restZones);
      expect(createChartTiming(resolved).noteTimesMs.get(0)).toBeCloseTo(372.3509933774834);
      expect(original).toEqual(before);
    },
  );
});
