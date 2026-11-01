import { describe, expect, it } from 'vitest';
import { beat } from '../types/beat';
import type { ChartDocument } from '../types/chart';
import { createChartTiming } from '../timing/chartTiming';
import { validateChartDocument } from '../validation/documentValidation';
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
    '%i BPM인 %s 사본에 곡 151 BPM을 적용하면 표시 정보·타이밍만 교체하고 박 좌표와 파일에 있던 0박 BPM 레인3·박자 레인1을 유지한다', (bpm, difficulty) => {
      const original = chart(bpm, difficulty);
      const before = structuredClone(original);
      const resolved = resolveSongChart(original, song);
      expect(resolved.meta).toEqual({ ...original.meta, title: '곡 제목', artist: '곡 작곡가',
        imageFile: 'songs/jacket.png', offsetMs: -25 });
      expect(resolved.events).toEqual([
        { type: 'bpm', beat: beat(0), bpm: 151, editorLane: 3 },
        { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(3), editorLane: 1 },
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

/** 보조 레인1의 text [16,24) 안 20박에 BPM 180이 보조 레인3으로 비켜 있는 유효한 차트. */
function textOverBpmChart(): ChartDocument {
  return {
    meta: { title: '곡 제목', artist: '곡 작곡가', imageFile: '', audioFile: 'audio.ogg', previewAudioFile: '',
      difficultyLabel: 'NORMAL', difficultyLevel: 5, offsetMs: 0 },
    notes: [{ type: 'tap', kind: 'single', lane: 1, beat: beat(1) }],
    trillZones: [], restZones: [],
    events: [
      { type: 'bpm', beat: beat(0), bpm: 150, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      { type: 'text', beat: beat(16), endBeat: beat(24), text: '간주', editorLane: 1 },
      { type: 'bpm', beat: beat(20), bpm: 180, editorLane: 3 },
    ],
  };
}

function songWithTiming(bpmChanges: { beat: string; bpm: number }[],
  timeSignatureChanges: { beat: string; beatPerMeasure: string }[] = [{ beat: '0', beatPerMeasure: '4' }]): SongSharedData {
  return { title: '곡 제목', artist: '곡 작곡가', jacketUrl: null, timing: { bpmChanges, timeSignatureChanges, offsetMs: 0 } };
}

const playable = (resolved: ChartDocument) => validateChartDocument(resolved);

describe('resolveSongChart 타이밍 이벤트의 보조 레인', () => {
  it('보조 레인1 text [16,24)와 보조 레인3의 20박 BPM 180이 있는 차트에 같은 값의 곡 타이밍을 적용하면 같은 차트 참조를 돌려주고 위반 0건으로 플레이할 수 있다', () => {
    const original = textOverBpmChart();
    expect(playable(original).canPlayExplicit).toBe(true);
    const resolved = resolveSongChart(original, songWithTiming([{ beat: '0', bpm: 150 }, { beat: '20', bpm: 180 }]));
    expect(resolved).toBe(original);
    expect(playable(resolved).semantic).toEqual([]);
    expect(playable(resolved).canPlayExplicit).toBe(true);
  });

  it('같은 차트에 20박 BPM만 200으로 바뀐 곡 타이밍을 적용하면 BPM 200은 파일의 보조 레인3에 남고 text는 같은 객체로 레인1에 남아 위반 0건이다', () => {
    const original = textOverBpmChart();
    const resolved = resolveSongChart(original, songWithTiming([{ beat: '0', bpm: 150 }, { beat: '20', bpm: 200 }]));
    expect(resolved.events).toEqual([
      { type: 'bpm', beat: beat(0), bpm: 150, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      { type: 'bpm', beat: beat(20), bpm: 200, editorLane: 3 },
      original.events[2],
    ]);
    expect(resolved.events[0]).toBe(original.events[0]);
    expect(resolved.events[3]).toBe(original.events[2]);
    expect(playable(resolved).semantic).toEqual([]);
    expect(playable(resolved).canPlayExplicit).toBe(true);
  });

  it('파일에 없는 12박 BPM 160·8박 박자 3이 곡 타이밍에 있으면 BPM은 보조 레인1, 박자는 보조 레인2에 두고 파일에만 있던 20박 BPM은 뺀다', () => {
    const resolved = resolveSongChart(textOverBpmChart(), songWithTiming(
      [{ beat: '0', bpm: 150 }, { beat: '12', bpm: 160 }],
      [{ beat: '0', beatPerMeasure: '4' }, { beat: '8', beatPerMeasure: '3' }],
    ));
    expect(resolved.events.filter(event => event.type === 'bpm' || event.type === 'timeSignature')).toEqual([
      { type: 'bpm', beat: beat(0), bpm: 150, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(4), editorLane: 2 },
      { type: 'timeSignature', beat: beat(8), beatPerMeasure: beat(3), editorLane: 2 },
      { type: 'bpm', beat: beat(12), bpm: 160, editorLane: 1 },
    ]);
  });

  it('0박 BPM·박자가 보조 레인1·2인 차트에 초기 BPM 151·박자 3의 곡 타이밍을 적용해도 초기 BPM은 레인1, 초기 박자는 레인2에 남는다', () => {
    const resolved = resolveSongChart(textOverBpmChart(), songWithTiming(
      [{ beat: '0', bpm: 151 }, { beat: '20', bpm: 180 }], [{ beat: '0', beatPerMeasure: '3' }],
    ));
    expect(resolved.events.slice(0, 2)).toEqual([
      { type: 'bpm', beat: beat(0), bpm: 151, editorLane: 1 },
      { type: 'timeSignature', beat: beat(0), beatPerMeasure: beat(3), editorLane: 2 },
    ]);
  });

  it('20박 BPM 180이 0박 BPM보다 앞에 저장된 차트에 같은 값의 곡 타이밍을 적용하면 배열 순서와 관계없이 같은 차트 참조를 돌려준다', () => {
    const original = textOverBpmChart();
    const reordered = { ...original, events: [original.events[3], original.events[2], original.events[0], original.events[1]] };
    expect(resolveSongChart(reordered, songWithTiming([{ beat: '0', bpm: 150 }, { beat: '20', bpm: 180 }]))).toBe(reordered);
  });

  it('20박 BPM을 200으로 바꿔 적용한 결과에 같은 곡을 다시 적용하면 같은 차트 참조를 돌려준다', () => {
    const song = songWithTiming([{ beat: '0', bpm: 150 }, { beat: '20', bpm: 200 }]);
    const resolved = resolveSongChart(textOverBpmChart(), song);
    expect(resolveSongChart(resolved, song)).toBe(resolved);
  });
});
